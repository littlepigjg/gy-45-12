const DB_NAME = 'sprite-lab-db';
const DB_VERSION = 1;
const STORE_ICONS = 'icons';

interface IconBlobRecord {
  id: string;
  blob: Blob;
  dataUrl?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ICONS)) {
        db.createObjectStore(STORE_ICONS, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

export async function saveIconBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ICONS, 'readwrite');
    const store = tx.objectStore(STORE_ICONS);
    const req = store.put({ id, blob });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveIconDataUrl(id: string, dataUrl: string): Promise<void> {
  const blob = await dataUrlToBlob(dataUrl);
  return saveIconBlob(id, blob);
}

export async function getIconBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ICONS, 'readonly');
    const store = tx.objectStore(STORE_ICONS);
    const req = store.get(id);
    req.onsuccess = () => {
      const record = req.result as IconBlobRecord | undefined;
      const raw = record?.blob;
      if (!raw) resolve(null);
      else if (raw instanceof Blob) resolve(raw);
      else resolve(new Blob([(raw as any).buffer ?? raw], { type: (raw as any).type || 'image/png' }));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getIconDataUrl(id: string): Promise<string | null> {
  const blob = await getIconBlob(id);
  if (!blob) return null;
  return blobToDataUrl(blob);
}

export async function deleteIconBlob(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ICONS, 'readwrite');
    const store = tx.objectStore(STORE_ICONS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteIconBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ICONS, 'readwrite');
    const store = tx.objectStore(STORE_ICONS);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const arr = dataUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      resolve(new Blob([u8arr], { type: mime }));
    } catch (e) {
      reject(e);
    }
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function fileToBlob(file: File): Blob {
  return file.slice(0, file.size, file.type);
}
