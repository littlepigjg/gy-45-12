import { describe, it, expect } from 'vitest';
import { smartDetect, cropBoxesToIcons, createBox } from '@/services/smartDetector';
import type { DetectionBox, SmartDetectionResult } from '@/types';

describe('Smart Detector (services/smartDetector.ts)', () => {
  describe('createBox', () => {
    it('creates a box with correct dimensions and generated id', () => {
      const box = createBox(10, 20, 30, 40, 0.8);
      expect(box.id).toBeTruthy();
      expect(typeof box.id).toBe('string');
      expect(box.id.length).toBeGreaterThan(0);
      expect(box.x).toBe(10);
      expect(box.y).toBe(20);
      expect(box.width).toBe(30);
      expect(box.height).toBe(40);
      expect(box.confidence).toBe(0.8);
      expect(box.uncertain).toBe(false);
    });

    it('marks box as uncertain when confidence below 0.4', () => {
      const box = createBox(0, 0, 10, 10, 0.3);
      expect(box.uncertain).toBe(true);
    });

    it('marks box as not uncertain when confidence exactly 0.4', () => {
      const box = createBox(0, 0, 10, 10, 0.4);
      expect(box.uncertain).toBe(false);
    });

    it('defaults confidence to 0.5', () => {
      const box = createBox(0, 0, 10, 10);
      expect(box.confidence).toBe(0.5);
      expect(box.uncertain).toBe(false);
    });

    it('generates unique ids for each box', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(createBox(0, 0, 1, 1).id);
      }
      expect(ids.size).toBe(50);
    });
  });

  describe('smartDetect', () => {
    it('is exported as an async function', () => {
      expect(typeof smartDetect).toBe('function');
      expect(smartDetect.constructor.name).toBe('AsyncFunction');
    });

    it('returns a result with expected structure when given empty data', async () => {
      const result = await smartDetect('data:image/png;base64,');
      expect(result).toBeDefined();
      expect(Array.isArray(result.boxes)).toBe(true);
      expect(Array.isArray(result.groups)).toBe(true);
      expect(['edge', 'grid', 'hybrid']).toContain(result.method);
      expect(typeof result.backgroundDetected).toBe('boolean');
    });
  });

  describe('cropBoxesToIcons', () => {
    it('is exported as a function returning Promise', () => {
      expect(typeof cropBoxesToIcons).toBe('function');
      const result = cropBoxesToIcons('data:image/png;base64,', [], false);
      expect(result).toBeInstanceOf(Promise);
    });

    it('returns empty array for empty boxes', async () => {
      const result = await cropBoxesToIcons('data:image/png;base64,', [], false);
      expect(result).toEqual([]);
    });

    it('returns icons with valid structure', async () => {
      const boxes: DetectionBox[] = [
        createBox(0, 0, 10, 10, 0.9),
        createBox(20, 20, 10, 10, 0.7),
      ];
      const result = await cropBoxesToIcons('data:image/png;base64,', boxes, false);
      expect(Array.isArray(result)).toBe(true);
      result.forEach((icon, idx) => {
        expect(typeof icon.index).toBe('number');
        expect(icon.index).toBe(idx);
        expect(typeof icon.dataUrl).toBe('string');
        expect(typeof icon.width).toBe('number');
        expect(typeof icon.height).toBe('number');
        expect(typeof icon.name).toBe('string');
        expect(icon.name.startsWith('icon-')).toBe(true);
      });
    });
  });

  describe('DetectionBox type compliance', () => {
    it('createBox satisfies DetectionBox interface', () => {
      const box: DetectionBox = createBox(5, 5, 20, 20, 0.95);
      expect(box).toMatchObject({
        id: expect.any(String),
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
        confidence: expect.any(Number),
      });
    });
  });

  describe('SmartDetectionResult type compliance', () => {
    it('smartDetect result satisfies interface', async () => {
      const result: SmartDetectionResult = await smartDetect('data:image/png;base64,');
      expect(result).toBeDefined();
      expect(result.boxes).toBeDefined();
      expect(result.groups).toBeDefined();
      expect(result.method).toBeDefined();
      expect(result.backgroundDetected).toBeDefined();
      expect(result.backgroundColor).toBeDefined();
    });
  });
});
