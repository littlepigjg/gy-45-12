import type { DetectionBox, DetectionGroup, SmartDetectionResult, SplitIcon } from '../types';
import { generateId } from '../utils';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function getPixelData(img: HTMLImageElement): PixelData {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

function detectBackgroundColor(pd: PixelData): { r: number; g: number; b: number } | null {
  const { data, width, height } = pd;
  const samples: [number, number, number][] = [];
  const sampleSize = Math.max(1, Math.min(width, height) >> 5);

  const addSample = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] > 10) {
      samples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  };

  for (let i = 0; i < sampleSize; i++) {
    const step = Math.floor(width / sampleSize);
    addSample(i * step, 0);
    addSample(i * step, height - 1);
  }
  for (let i = 0; i < sampleSize; i++) {
    const step = Math.floor(height / sampleSize);
    addSample(0, i * step);
    addSample(width - 1, i * step);
  }

  if (samples.length < 4) return null;

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (const [r, g, b] of samples) {
    const key = `${r >> 3},${g >> 3},${b >> 3}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const b of buckets.values()) {
    if (!best || b.count > best.count) best = b;
  }

  if (!best) return null;
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

function applySobel(pd: PixelData): Float32Array {
  const { data, width, height } = pd;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const magnitude = new Float32Array(width * height);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sx = 0;
      let sy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const p = gray[(y + ky) * width + (x + kx)];
          const ki = (ky + 1) * 3 + (kx + 1);
          sx += p * gx[ki];
          sy += p * gy[ki];
        }
      }
      magnitude[y * width + x] = Math.sqrt(sx * sx + sy * sy);
    }
  }

  return magnitude;
}

function computeOtsuThreshold(values: Float32Array, maxVal: number): number {
  const histSize = 256;
  const hist = new Array(histSize).fill(0);
  const scale = (histSize - 1) / maxVal;

  for (let i = 0; i < values.length; i++) {
    const bin = Math.min(histSize - 1, Math.floor(values[i] * scale));
    hist[bin]++;
  }

  const total = values.length;
  let sum = 0;
  for (let i = 0; i < histSize; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVar = 0;
  let threshold = 0;

  for (let i = 0; i < histSize; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = i;
    }
  }

  return threshold / scale;
}

function isForeground(
  pd: PixelData,
  x: number,
  y: number,
  bgColor: { r: number; g: number; b: number } | null,
  edgeMagnitude: number,
  edgeThreshold: number
): boolean {
  const { data, width } = pd;
  const idx = (y * width + x) * 4;
  const alpha = data[idx + 3];

  if (alpha < 10) return false;
  if (edgeMagnitude >= edgeThreshold) return true;

  if (bgColor) {
    const dr = data[idx] - bgColor.r;
    const dg = data[idx + 1] - bgColor.g;
    const db = data[idx + 2] - bgColor.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    return dist > 30;
  }

  return alpha > 200;
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

function findConnectedComponents(
  pd: PixelData,
  bgColor: { r: number; g: number; b: number } | null
): Component[] {
  const { width, height } = pd;
  const magnitude = applySobel(pd);

  let maxMag = 0;
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] > maxMag) maxMag = magnitude[i];
  }
  const edgeThreshold = computeOtsuThreshold(magnitude, maxMag) * 0.6;

  const labels = new Int32Array(width * height);
  const components: Component[] = [];
  let nextLabel = 1;

  const stack: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = y * width + x;
      if (labels[pi] !== 0) continue;

      const mag = magnitude[pi];
      if (!isForeground(pd, x, y, bgColor, mag, edgeThreshold)) continue;

      const comp: Component = { minX: x, minY: y, maxX: x, maxY: y, area: 0 };
      const label = nextLabel++;
      components.push(comp);

      stack.push(pi);
      labels[pi] = label;

      while (stack.length > 0) {
        const cur = stack.pop()!;
        const cx = cur % width;
        const cy = (cur - cx) / width;
        comp.area++;
        if (cx < comp.minX) comp.minX = cx;
        if (cy < comp.minY) comp.minY = cy;
        if (cx > comp.maxX) comp.maxX = cx;
        if (cy > comp.maxY) comp.maxY = cy;

        const neighbors = [
          cur - width - 1, cur - width, cur - width + 1,
          cur - 1, cur + 1,
          cur + width - 1, cur + width, cur + width + 1,
        ];

        for (const n of neighbors) {
          if (n < 0 || n >= labels.length) continue;
          if (labels[n] !== 0) continue;
          const nx = n % width;
          const ny = (n - nx) / width;
          const nmag = magnitude[n];
          if (isForeground(pd, nx, ny, bgColor, nmag, edgeThreshold)) {
            labels[n] = label;
            stack.push(n);
          }
        }
      }
    }
  }

  const minArea = Math.max(9, Math.floor((width * height) / 20000));
  return components.filter((c) => c.area >= minArea);
}

function mergeNearbyBoxes(components: Component[], width: number, height: number): Component[] {
  if (components.length === 0) return components;

  const avgArea = components.reduce((s, c) => s + c.area, 0) / components.length;
  const gapThreshold = Math.max(2, Math.floor(Math.sqrt(avgArea) * 0.3));

  const merged = [...components];
  let changed = true;

  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i];
        const b = merged[j];

        const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) + 1);
        const overlapY = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + 1);
        const overlapArea = overlapX * overlapY;

        const aW = a.maxX - a.minX + 1;
        const aH = a.maxY - a.minY + 1;
        const bW = b.maxX - b.minX + 1;
        const bH = b.maxY - b.minY + 1;
        const minArea = Math.min(aW * aH, bW * bH);

        const gapX = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
        const gapY = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));

        if (
          (overlapArea > 0 && overlapArea > minArea * 0.1) ||
          (gapX <= gapThreshold && gapY <= gapThreshold)
        ) {
          merged[i] = {
            minX: Math.min(a.minX, b.minX),
            minY: Math.min(a.minY, b.minY),
            maxX: Math.max(a.maxX, b.maxX),
            maxY: Math.max(a.maxY, b.maxY),
            area: a.area + b.area,
          };
          merged.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }

  const totalArea = width * height;
  return merged.filter((c) => {
    const w = c.maxX - c.minX + 1;
    const h = c.maxY - c.minY + 1;
    return w * h < totalArea * 0.95 && w > 2 && h > 2;
  });
}

interface SizeCluster {
  boxes: DetectionBox[];
  sumW: number;
  sumH: number;
}

function clusterBySize(boxes: DetectionBox[]): DetectionGroup[] {
  if (boxes.length === 0) return [];

  const clusters: SizeCluster[] = [];
  const sizeTolerance = 0.25;

  for (const box of boxes) {
    let matched = false;
    for (const cluster of clusters) {
      const avgW = cluster.sumW / cluster.boxes.length;
      const avgH = cluster.sumH / cluster.boxes.length;
      const wDiff = Math.abs(box.width - avgW) / Math.max(avgW, 1);
      const hDiff = Math.abs(box.height - avgH) / Math.max(avgH, 1);
      if (wDiff <= sizeTolerance && hDiff <= sizeTolerance) {
        cluster.boxes.push(box);
        cluster.sumW += box.width;
        cluster.sumH += box.height;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ boxes: [box], sumW: box.width, sumH: box.height });
    }
  }

  return clusters
    .filter((c) => c.boxes.length > 0)
    .map((c) => {
      const groupId = generateId();
      const avgWidth = Math.round(c.sumW / c.boxes.length);
      const avgHeight = Math.round(c.sumH / c.boxes.length);
      c.boxes.forEach((b) => (b.groupId = groupId));
      return { id: groupId, avgWidth, avgHeight, boxIds: c.boxes.map((b) => b.id) };
    });
}

function computeBoxConfidence(
  comp: Component,
  pd: PixelData,
  bgColor: { r: number; g: number; b: number } | null,
  allComps: Component[]
): number {
  const { data, width } = pd;
  const w = comp.maxX - comp.minX + 1;
  const h = comp.maxY - comp.minY + 1;

  let borderPixels = 0;
  let borderFilled = 0;

  for (let x = comp.minX; x <= comp.maxX; x++) {
    borderPixels += 2;
    for (const y of [comp.minY, comp.maxY]) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 10) {
        if (bgColor) {
          const dr = data[idx] - bgColor.r;
          const dg = data[idx + 1] - bgColor.g;
          const db = data[idx + 2] - bgColor.b;
          if (Math.sqrt(dr * dr + dg * dg + db * db) > 15) borderFilled++;
        } else {
          borderFilled++;
        }
      }
    }
  }
  for (let y = comp.minY + 1; y < comp.maxY; y++) {
    borderPixels += 2;
    for (const x of [comp.minX, comp.maxX]) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 10) {
        if (bgColor) {
          const dr = data[idx] - bgColor.r;
          const dg = data[idx + 1] - bgColor.g;
          const db = data[idx + 2] - bgColor.b;
          if (Math.sqrt(dr * dr + dg * dg + db * db) > 15) borderFilled++;
        } else {
          borderFilled++;
        }
      }
    }
  }

  const borderDensity = borderPixels > 0 ? borderFilled / borderPixels : 0;

  const fillRatio = comp.area / (w * h);
  const aspectRatio = Math.min(w, h) / Math.max(w, h);

  const avgArea = allComps.reduce((s, c) => s + c.area, 0) / allComps.length;
  const areaRatio = Math.min(comp.area, avgArea) / Math.max(comp.area, avgArea);

  const score = borderDensity * 0.4 + fillRatio * 0.25 + aspectRatio * 0.2 + areaRatio * 0.15;
  return Math.min(1, Math.max(0.1, score));
}

function padBox(comp: Component, pd: PixelData, padding: number = 2): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, comp.minX - padding);
  const y = Math.max(0, comp.minY - padding);
  const maxX = Math.min(pd.width - 1, comp.maxX + padding);
  const maxY = Math.min(pd.height - 1, comp.maxY + padding);
  return { x, y, width: maxX - x + 1, height: maxY - y + 1 };
}

export async function smartDetect(spriteDataUrl: string): Promise<SmartDetectionResult> {
  const img = await loadImage(spriteDataUrl);
  const pd = getPixelData(img);
  const bgColor = detectBackgroundColor(pd);

  let components = findConnectedComponents(pd, bgColor);
  components = mergeNearbyBoxes(components, pd.width, pd.height);

  components.sort((a, b) => {
    const ay = a.minY;
    const by = b.minY;
    if (Math.abs(ay - by) > Math.min(a.maxY - a.minY, b.maxY - b.minY) * 0.5) {
      return ay - by;
    }
    return a.minX - b.minX;
  });

  const boxes: DetectionBox[] = components.map((comp) => {
    const padded = padBox(comp, pd);
    const confidence = computeBoxConfidence(comp, pd, bgColor, components);
    return {
      id: generateId(),
      x: padded.x,
      y: padded.y,
      width: padded.width,
      height: padded.height,
      confidence,
      uncertain: confidence < 0.4,
    };
  });

  const groups = clusterBySize(boxes);

  let method: SmartDetectionResult['method'] = 'edge';
  if (groups.length === 1 && boxes.length > 1) {
    const group = groups[0];
    const gridBoxes = boxes.filter((b) => b.groupId === group.id);
    if (gridBoxes.length >= 4) {
      const xCoords = new Set(gridBoxes.map((b) => b.x));
      const yCoords = new Set(gridBoxes.map((b) => b.y));
      if (xCoords.size >= 2 && yCoords.size >= 2) {
        method = 'grid';
      }
    }
  }
  if (groups.length > 1 && method === 'edge') {
    method = 'hybrid';
  }

  return {
    boxes,
    groups,
    method,
    backgroundDetected: bgColor !== null,
    backgroundColor: bgColor,
  };
}

function trimTransparentPixels(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((res) => {
    const tImg = new Image();
    tImg.onload = () => {
      const tCanvas = document.createElement('canvas');
      tCanvas.width = tImg.width;
      tCanvas.height = tImg.height;
      const tCtx = tCanvas.getContext('2d')!;
      tCtx.drawImage(tImg, 0, 0);
      const tData = tCtx.getImageData(0, 0, tCanvas.width, tCanvas.height).data;
      let minX = tCanvas.width;
      let minY = tCanvas.height;
      let maxX = 0;
      let maxY = 0;
      let hasPixel = false;
      for (let ty = 0; ty < tCanvas.height; ty++) {
        for (let tx = 0; tx < tCanvas.width; tx++) {
          const alpha = tData[(ty * tCanvas.width + tx) * 4 + 3];
          if (alpha > 0) {
            hasPixel = true;
            if (tx < minX) minX = tx;
            if (ty < minY) minY = ty;
            if (tx > maxX) maxX = tx;
            if (ty > maxY) maxY = ty;
          }
        }
      }
      if (!hasPixel) {
        res({ dataUrl, width: tImg.width, height: tImg.height });
        return;
      }
      const tw = maxX - minX + 1;
      const th = maxY - minY + 1;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = tw;
      outCanvas.height = th;
      outCanvas.getContext('2d')!.drawImage(tCanvas, minX, minY, tw, th, 0, 0, tw, th);
      res({
        dataUrl: outCanvas.toDataURL('image/png'),
        width: tw,
        height: th,
      });
    };
    tImg.onerror = () => res({ dataUrl, width: 0, height: 0 });
    tImg.src = dataUrl;
  });
}

export async function cropBoxesToIcons(
  spriteDataUrl: string,
  boxes: DetectionBox[],
  autoTrim: boolean = true
): Promise<SplitIcon[]> {
  const img = await loadImage(spriteDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const results: SplitIcon[] = [];

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    let dataUrl = (() => {
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = box.width;
      cropCanvas.height = box.height;
      const cCtx = cropCanvas.getContext('2d')!;
      cCtx.clearRect(0, 0, box.width, box.height);
      cCtx.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      return cropCanvas.toDataURL('image/png');
    })();

    let w = box.width;
    let h = box.height;

    if (autoTrim) {
      const trimmed = await trimTransparentPixels(dataUrl);
      if (trimmed.width === 0 && trimmed.height === 0) continue;
      dataUrl = trimmed.dataUrl;
      w = trimmed.width;
      h = trimmed.height;
    }

    results.push({
      index: i,
      dataUrl,
      width: w,
      height: h,
      name: `icon-${String(i + 1).padStart(3, '0')}`,
    });
  }

  return results;
}

export function createBox(
  x: number,
  y: number,
  width: number,
  height: number,
  confidence: number = 0.5
): DetectionBox {
  return { id: generateId(), x, y, width, height, confidence, uncertain: confidence < 0.4 };
}
