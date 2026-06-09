import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveIconBlob,
  saveIconDataUrl,
  getIconBlob,
  getIconDataUrl,
  deleteIconBlob,
  deleteIconBulk,
  dataUrlToBlob,
  blobToDataUrl,
} from '@/utils/db';

const TEST_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function makeId() {
  return 'test-' + Math.random().toString(36).slice(2, 10);
}

describe('IndexedDB utils (db.ts)', () => {
  describe('dataUrl <-> Blob conversion', () => {
    it('dataUrlToBlob converts a valid data URL to Blob with correct mime type', async () => {
      const blob = await dataUrlToBlob(TEST_DATA_URL);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('blobToDataUrl converts Blob back to data URL', async () => {
      const blob = await dataUrlToBlob(TEST_DATA_URL);
      const restored = await blobToDataUrl(blob);
      expect(typeof restored).toBe('string');
      expect(restored.startsWith('data:')).toBe(true);
    });

    it('roundtrip produces equivalent Blobs', async () => {
      const blob1 = await dataUrlToBlob(TEST_DATA_URL);
      const dataUrl = await blobToDataUrl(blob1);
      const blob2 = await dataUrlToBlob(dataUrl);
      expect(blob2.size).toBe(blob1.size);
      expect(blob2.type).toBe(blob1.type);
    });

    it('dataUrlToBlob throws on malformed input', async () => {
      await expect(dataUrlToBlob('not a data url')).rejects.toThrow();
    });
  });

  describe('IndexedDB CRUD operations', () => {
    it('saveIconDataUrl + getIconDataUrl roundtrip', async () => {
      const id = makeId();
      await saveIconDataUrl(id, TEST_DATA_URL);
      const loaded = await getIconDataUrl(id);
      expect(loaded).toBeTruthy();
      expect(loaded!.startsWith('data:image/png')).toBe(true);
    });

    it('getIconDataUrl returns null for non-existent id', async () => {
      const loaded = await getIconDataUrl(makeId());
      expect(loaded).toBeNull();
    });

    it('saveIconBlob + getIconBlob roundtrip', async () => {
      const id = makeId();
      const blob = new Blob(['hello'], { type: 'text/plain' });
      await saveIconBlob(id, blob);
      const loaded = await getIconBlob(id);
      expect(loaded).toBeInstanceOf(Blob);
      expect(loaded!.size).toBeGreaterThan(0);
    });

    it('deleteIconBlob removes a record', async () => {
      const id = makeId();
      await saveIconDataUrl(id, TEST_DATA_URL);
      expect(await getIconDataUrl(id)).toBeTruthy();
      await deleteIconBlob(id);
      expect(await getIconDataUrl(id)).toBeNull();
    });

    it('deleteIconBulk removes multiple records', async () => {
      const ids = [makeId(), makeId(), makeId()];
      await Promise.all(ids.map((id) => saveIconDataUrl(id, TEST_DATA_URL)));
      await deleteIconBulk(ids);
      for (const id of ids) {
        expect(await getIconDataUrl(id)).toBeNull();
      }
    });

    it('deleteIconBulk does nothing for empty ids', async () => {
      await expect(deleteIconBulk([])).resolves.not.toThrow();
    });
  });
});
