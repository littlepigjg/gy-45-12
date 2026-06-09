import { describe, it, expect } from 'vitest';
import {
  cn,
  generateId,
  formatDate,
  iconItemToMeta,
  downloadDataUrl,
  downloadText,
} from '@/utils';
import type { IconItem } from '@/types';

describe('Utility functions', () => {
  describe('cn (class name merger)', () => {
    it('joins truthy class names', () => {
      expect(cn('a', 'b', 'c')).toBe('a b c');
    });

    it('filters out falsy values', () => {
      expect(cn('a', false, null, undefined, 'b', '')).toBe('a b');
    });

    it('returns empty string for all falsy', () => {
      expect(cn(false, null, undefined)).toBe('');
    });
  });

  describe('generateId', () => {
    it('produces a non-empty string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(5);
    });

    it('produces unique ids on subsequent calls', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('formatDate', () => {
    it('returns a date string in YYYY-MM-DD HH:mm format', () => {
      const ts = new Date('2025-01-15T09:05:00Z').getTime();
      const result = formatDate(ts);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });
  });

  describe('iconItemToMeta', () => {
    it('strips dataUrl from icon item', () => {
      const item: IconItem = {
        id: 'abc',
        name: 'home',
        originalName: 'home.png',
        width: 24,
        height: 24,
        addedAt: 123456,
        dataUrl: 'data:image/png;base64,xxx',
      };
      const meta = iconItemToMeta(item);
      expect(meta).toEqual({
        id: 'abc',
        name: 'home',
        originalName: 'home.png',
        width: 24,
        height: 24,
        addedAt: 123456,
      });
      expect((meta as any).dataUrl).toBeUndefined();
    });
  });

  describe('download helpers do not throw when invoked', () => {
    it('downloadDataUrl creates and removes anchor element', () => {
      const anchors: HTMLAnchorElement[] = [];
      const originalAppend = document.body.appendChild.bind(document.body);
      const originalRemove = document.body.removeChild.bind(document.body);
      document.body.appendChild = ((el: Node) => {
        anchors.push(el as HTMLAnchorElement);
        return el;
      }) as typeof document.body.appendChild;
      document.body.removeChild = ((el: Node) => {
        const idx = anchors.indexOf(el as HTMLAnchorElement);
        if (idx >= 0) anchors.splice(idx, 1);
        return el;
      }) as typeof document.body.removeChild;
      try {
        downloadDataUrl('data:text/plain;base64,SGVsbG8=', 'test.txt');
        expect(anchors.length).toBe(0);
      } finally {
        document.body.appendChild = originalAppend;
        document.body.removeChild = originalRemove;
      }
    });

    it('downloadText creates and revokes blob URL', () => {
      const created: string[] = [];
      const revoked: string[] = [];
      const origCreate = URL.createObjectURL.bind(URL);
      const origRevoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob: Blob | MediaSource) => {
        const u = origCreate(blob);
        created.push(u);
        return u;
      };
      URL.revokeObjectURL = (u: string) => {
        revoked.push(u);
        return origRevoke(u);
      };
      try {
        downloadText('hello', 'a.txt');
        expect(created.length).toBe(1);
        expect(revoked).toEqual(created);
      } finally {
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
      }
    });
  });
});
