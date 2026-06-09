import type { SplitConfig, SplitIcon } from '../types';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function cropToDataUrl(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): string {
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = w;
  cropCanvas.height = h;
  const ctx = cropCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return cropCanvas.toDataURL('image/png');
}

function trimTransparent(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = 0;
      let maxY = 0;
      let hasPixel = false;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const alpha = data[(y * canvas.width + x) * 4 + 3];
          if (alpha > 0) {
            hasPixel = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!hasPixel) {
        resolve({ dataUrl, width: img.width, height: img.height });
        return;
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const trimmedCanvas = document.createElement('canvas');
      trimmedCanvas.width = w;
      trimmedCanvas.height = h;
      const tCtx = trimmedCanvas.getContext('2d')!;
      tCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);

      resolve({
        dataUrl: trimmedCanvas.toDataURL('image/png'),
        width: w,
        height: h,
      });
    };
    img.onerror = () => resolve({ dataUrl, width: 0, height: 0 });
    img.src = dataUrl;
  });
}

export async function splitSprite(
  spriteDataUrl: string,
  config: SplitConfig,
  autoTrim: boolean = true
): Promise<SplitIcon[]> {
  const img = await loadImage(spriteDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const { rows, columns, iconWidth, iconHeight, spacing, padding } = config;
  const result: SplitIcon[] = [];
  let index = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = padding + c * (iconWidth + spacing);
      const y = padding + r * (iconHeight + spacing);

      if (x + iconWidth > img.width || y + iconHeight > img.height) {
        continue;
      }

      let dataUrl = cropToDataUrl(canvas, x, y, iconWidth, iconHeight);
      let w = iconWidth;
      let h = iconHeight;

      if (autoTrim) {
        const trimmed = await trimTransparent(dataUrl);
        if (trimmed.width === 0 && trimmed.height === 0) {
          continue;
        }
        dataUrl = trimmed.dataUrl;
        w = trimmed.width;
        h = trimmed.height;
      }

      result.push({
        index,
        dataUrl,
        width: w,
        height: h,
        name: `icon-${String(index + 1).padStart(3, '0')}`,
      });
      index++;
    }
  }

  return result;
}

export function autoDetectGrid(spriteDataUrl: string): Promise<{ rows: number; columns: number; iconWidth: number; iconHeight: number; spacing: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      const isPixelFilled = (x: number, y: number) => {
        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return false;
        return data[(y * canvas.width + x) * 4 + 3] > 10;
      };

      const hSegments: number[] = [];
      let inSegment = false;
      let segStart = 0;

      for (let y = 0; y < canvas.height; y++) {
        let hasPixel = false;
        for (let x = 0; x < canvas.width && !hasPixel; x++) {
          if (isPixelFilled(x, y)) hasPixel = true;
        }
        if (hasPixel && !inSegment) {
          inSegment = true;
          segStart = y;
        } else if (!hasPixel && inSegment) {
          inSegment = false;
          hSegments.push(segStart);
        }
      }
      if (inSegment) hSegments.push(segStart);

      const vSegments: number[] = [];
      inSegment = false;
      segStart = 0;

      for (let x = 0; x < canvas.width; x++) {
        let hasPixel = false;
        for (let y = 0; y < canvas.height && !hasPixel; y++) {
          if (isPixelFilled(x, y)) hasPixel = true;
        }
        if (hasPixel && !inSegment) {
          inSegment = true;
          segStart = x;
        } else if (!hasPixel && inSegment) {
          inSegment = false;
          vSegments.push(segStart);
        }
      }
      if (inSegment) vSegments.push(segStart);

      const rows = hSegments.length || 1;
      const columns = vSegments.length || 1;

      let iconWidth = canvas.width;
      let iconHeight = canvas.height;
      let spacing = 0;

      if (hSegments.length >= 2) {
        const heights: number[] = [];
        for (let i = 0; i < hSegments.length - 1; i++) {
          let endY = hSegments[i + 1] - 1;
          while (endY > hSegments[i]) {
            let hasPixel = false;
            for (let x = 0; x < canvas.width && !hasPixel; x++) {
              if (isPixelFilled(x, endY)) hasPixel = true;
            }
            if (hasPixel) break;
            endY--;
          }
          heights.push(endY - hSegments[i] + 1);
        }
        iconHeight = Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
        spacing = Math.max(0, hSegments[1] - hSegments[0] - iconHeight);
      }

      if (vSegments.length >= 2) {
        const widths: number[] = [];
        for (let i = 0; i < vSegments.length - 1; i++) {
          let endX = vSegments[i + 1] - 1;
          while (endX > vSegments[i]) {
            let hasPixel = false;
            for (let y = 0; y < canvas.height && !hasPixel; y++) {
              if (isPixelFilled(endX, y)) hasPixel = true;
            }
            if (hasPixel) break;
            endX--;
          }
          widths.push(endX - vSegments[i] + 1);
        }
        iconWidth = Math.round(widths.reduce((a, b) => a + b, 0) / widths.length);
      }

      if (rows === 1 && columns === 1) {
        iconWidth = canvas.width;
        iconHeight = canvas.height;
      }

      resolve({ rows, columns, iconWidth, iconHeight, spacing });
    };
    img.onerror = () => resolve({ rows: 1, columns: 1, iconWidth: 0, iconHeight: 0, spacing: 0 });
    img.src = spriteDataUrl;
  });
}
