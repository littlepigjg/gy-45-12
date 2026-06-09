import { describe, it, expect } from 'vitest';
import { generateSprite } from '@/services/spriteGenerator';
import { splitSprite } from '@/services/spriteSplitter';
import type { IconItem, SpriteConfig, SplitConfig } from '@/types';

function make1x1Png(r: number, g: number, b: number): string {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = [
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  ];
  const raw = [0x00, r, g, b];
  const zlib = [0x78, 0x01, 0x01, 0x04, 0x00, 0xfb, 0xff, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01];
  const crc = [0x44, 0xae, 0x41, 0x54];
  const iend = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  const bytes = [...header, ...ihdr, ...zlib, ...crc, ...iend];
  return 'data:image/png;base64,' + btoa(String.fromCharCode(...bytes));
}

function makeIcon(id: string, name: string, r: number, g: number, b: number): IconItem {
  return {
    id,
    name,
    originalName: `${name}.png`,
    width: 1,
    height: 1,
    addedAt: 0,
    dataUrl: make1x1Png(r, g, b),
  };
}

describe('Sprite Generator (services/spriteGenerator.ts)', () => {
  const baseConfig: SpriteConfig = {
    columns: 2,
    spacing: 0,
    bgColor: 'transparent',
    classPrefix: 'sprite',
    retina: false,
  };

  it('returns empty result for empty icons list', async () => {
    const res = await generateSprite([], baseConfig);
    expect(res.imageDataUrl).toBe('');
    expect(res.cssCode).toBe('');
    expect(res.scssCode).toBe('');
    expect(res.iconPositions).toEqual([]);
    expect(res.totalWidth).toBe(0);
    expect(res.totalHeight).toBe(0);
  });

  it('positions 2 icons in a single row with columns=2', async () => {
    const icons = [
      makeIcon('a', 'home', 255, 0, 0),
      makeIcon('b', 'user', 0, 255, 0),
    ];
    const res = await generateSprite(icons, baseConfig);
    expect(res.iconPositions).toHaveLength(2);
    expect(res.iconPositions[0].name).toBe('home');
    expect(res.iconPositions[1].name).toBe('user');
    expect(res.totalWidth).toBeGreaterThan(0);
    expect(res.totalHeight).toBeGreaterThan(0);
  });

  it('positions 4 icons in 2x2 grid with columns=2', async () => {
    const icons = [
      makeIcon('a', 'a', 255, 0, 0),
      makeIcon('b', 'b', 0, 255, 0),
      makeIcon('c', 'c', 0, 0, 255),
      makeIcon('d', 'd', 255, 255, 0),
    ];
    const res = await generateSprite(icons, { ...baseConfig, columns: 2 });
    expect(res.iconPositions).toHaveLength(4);
    expect(res.iconPositions.map((p) => p.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('applies spacing around icons', async () => {
    const icons = [
      makeIcon('a', 'a', 255, 0, 0),
      makeIcon('b', 'b', 0, 255, 0),
      makeIcon('c', 'c', 0, 0, 255),
      makeIcon('d', 'd', 255, 255, 0),
    ];
    const resNoSpace = await generateSprite(icons, { ...baseConfig, spacing: 0 });
    const resSpace = await generateSprite(icons, { ...baseConfig, spacing: 10 });
    expect(resSpace.totalWidth).toBeGreaterThan(resNoSpace.totalWidth);
    expect(resSpace.totalHeight).toBeGreaterThan(resNoSpace.totalHeight);
  });

  it('generates valid CSS code with expected selectors', async () => {
    const icons = [
      makeIcon('a', 'icon-home', 255, 0, 0),
      makeIcon('b', 'icon-user', 0, 255, 0),
    ];
    const res = await generateSprite(icons, baseConfig);
    expect(res.cssCode).toContain('.sprite {');
    expect(res.cssCode).toContain('.sprite-icon-home {');
    expect(res.cssCode).toContain('.sprite-icon-user {');
    expect(res.cssCode).toContain('background-position:');
    expect(res.cssCode).toContain('background-image');
  });

  it('generates SCSS with variables and mixins', async () => {
    const icons = [makeIcon('a', 'logo', 255, 0, 0)];
    const res = await generateSprite(icons, baseConfig);
    expect(res.scssCode).toContain('$sprite-url');
    expect(res.scssCode).toContain('@mixin sprite');
    expect(res.scssCode).toContain('@mixin sprite-logo');
    expect(res.scssCode).toContain('@include sprite');
  });

  it('sanitizes icon names for CSS class use', async () => {
    const icons = [makeIcon('a', 'My Icon! (v2)', 255, 0, 0)];
    const res = await generateSprite(icons, baseConfig);
    expect(res.cssCode).toContain('.sprite-my-icon-v2');
  });

  it('retina mode doubles output dimensions', async () => {
    const icons = [
      makeIcon('a', 'a', 255, 0, 0),
      makeIcon('b', 'b', 0, 255, 0),
    ];
    const resNormal = await generateSprite(icons, { ...baseConfig, retina: false });
    const resRetina = await generateSprite(icons, { ...baseConfig, retina: true });
    expect(resRetina.totalWidth).toBe(resNormal.totalWidth * 2);
    expect(resRetina.totalHeight).toBe(resNormal.totalHeight * 2);
  });

  it('uses custom class prefix', async () => {
    const icons = [makeIcon('a', 'home', 255, 0, 0)];
    const res = await generateSprite(icons, { ...baseConfig, classPrefix: 'ui' });
    expect(res.cssCode).toContain('.ui {');
    expect(res.cssCode).toContain('.ui-home {');
  });
});

describe('Sprite Splitter (services/spriteSplitter.ts)', () => {
  async function buildAndSplit(rows: number, cols: number, spacing: number = 0) {
    const total = rows * cols;
    const icons: IconItem[] = Array.from({ length: total }, (_, i) =>
      makeIcon(String(i), `icon-${i}`, i * 50 % 255, (i * 30) % 255, (i * 10) % 255)
    );
    const generated = await generateSprite(icons, {
      columns: cols,
      spacing,
      bgColor: 'transparent',
      classPrefix: 'sp',
      retina: false,
    });
    const cellSize = 1;
    const cfg: SplitConfig = {
      rows,
      columns: cols,
      iconWidth: cellSize + spacing,
      iconHeight: cellSize + spacing,
      spacing,
      padding: spacing,
    };
    return splitSprite(generated.imageDataUrl, cfg, false);
  }

  it('splits a 2x2 sprite into 4 icons', async () => {
    const out = await buildAndSplit(2, 2, 0);
    expect(out.length).toBe(4);
    out.forEach((icon, i) => {
      expect(icon.name).toBe(`icon-${String(i + 1).padStart(3, '0')}`);
    });
  });

  it('splits a 1x1 sprite into 1 icon', async () => {
    const out = await buildAndSplit(1, 1, 0);
    expect(out.length).toBe(1);
    expect(out[0].dataUrl.startsWith('data:image/png')).toBe(true);
  });

  it('splits a 3x4 sprite into 12 icons', async () => {
    const out = await buildAndSplit(3, 4, 0);
    expect(out.length).toBe(12);
  });
});
