import type { IconItem, IconMeta } from '../types';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getImageSize(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadText(text: string, filename: string, mime: string = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isImageFile(file: File): boolean {
  return /^image\/(png|jpe?g|gif|webp|svg\+xml)$/i.test(file.type);
}

export async function createIconItemFromFile(file: File): Promise<IconItem> {
  const dataUrl = await fileToDataUrl(file);
  const size = await getImageSize(dataUrl);
  const name = file.name.replace(/\.[^/.]+$/, '');
  return {
    id: generateId(),
    name,
    originalName: file.name,
    width: size.width,
    height: size.height,
    dataUrl,
    addedAt: Date.now(),
  };
}

export async function createIconItemsFromFiles(
  files: FileList | File[]
): Promise<IconItem[]> {
  const fileArray = Array.from(files).filter(isImageFile);
  return Promise.all(fileArray.map(createIconItemFromFile));
}

export function iconItemToMeta(item: IconItem): IconMeta {
  const { dataUrl: _, ...meta } = item;
  return meta;
}
