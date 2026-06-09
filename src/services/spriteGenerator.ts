import type { IconItem, SpriteConfig, SpriteResult, IconPosition } from '../types';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function sanitizeName(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export async function generateSprite(
  icons: IconItem[],
  config: SpriteConfig
): Promise<SpriteResult> {
  if (icons.length === 0) {
    return {
      imageDataUrl: '',
      cssCode: '',
      scssCode: '',
      iconPositions: [],
      totalWidth: 0,
      totalHeight: 0,
      cellWidth: 0,
      cellHeight: 0,
    };
  }

  const { columns, spacing, bgColor, classPrefix, retina } = config;
  const scale = retina ? 2 : 1;
  const actualSpacing = spacing * scale;

  const loadedImages = await Promise.all(
    icons.map((icon) => loadImage(icon.dataUrl))
  );

  const cellWidth = Math.max(...loadedImages.map((img) => img.width)) * scale;
  const cellHeight = Math.max(...loadedImages.map((img) => img.height)) * scale;

  const numCols = Math.min(columns, icons.length);
  const numRows = Math.ceil(icons.length / numCols);

  const totalWidth = numCols * cellWidth + (numCols + 1) * actualSpacing;
  const totalHeight = numRows * cellHeight + (numRows + 1) * actualSpacing;

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalWidth, totalHeight);
  }

  const iconPositions: IconPosition[] = [];

  icons.forEach((icon, index) => {
    const row = Math.floor(index / numCols);
    const col = index % numCols;
    const img = loadedImages[index];

    const x = actualSpacing + col * (cellWidth + actualSpacing);
    const y = actualSpacing + row * (cellHeight + actualSpacing);

    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const offsetX = (cellWidth - drawWidth) / 2;
    const offsetY = (cellHeight - drawHeight) / 2;

    ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);

    iconPositions.push({
      id: icon.id,
      name: sanitizeName(icon.name),
      x: x + offsetX,
      y: y + offsetY,
      width: drawWidth,
      height: drawHeight,
    });
  });

  const imageDataUrl = canvas.toDataURL('image/png');

  const cssCode = generateCSS(iconPositions, classPrefix, totalWidth, totalHeight, cellWidth, cellHeight, retina);
  const scssCode = generateSCSS(iconPositions, classPrefix, totalWidth, totalHeight, cellWidth, cellHeight, retina);

  return {
    imageDataUrl,
    cssCode,
    scssCode,
    iconPositions,
    totalWidth,
    totalHeight,
    cellWidth,
    cellHeight,
  };
}

function generateCSS(
  positions: IconPosition[],
  prefix: string,
  totalWidth: number,
  totalHeight: number,
  cellWidth: number,
  cellHeight: number,
  retina: boolean
): string {
  const scale = retina ? 2 : 1;
  const displayWidth = Math.round(totalWidth / scale);
  const displayHeight = Math.round(totalHeight / scale);
  const displayCellW = Math.round(cellWidth / scale);
  const displayCellH = Math.round(cellHeight / scale);

  let css = `.${prefix} {
  display: inline-block;
  background-image: url('sprite.png');
  background-repeat: no-repeat;
  background-size: ${displayWidth}px ${displayHeight}px;
  width: ${displayCellW}px;
  height: ${displayCellH}px;
}

`;

  positions.forEach((pos) => {
    const x = Math.round(pos.x / scale);
    const y = Math.round(pos.y / scale);
    css += `.${prefix}-${pos.name} {
  background-position: -${x}px -${y}px;
  width: ${Math.round(pos.width / scale)}px;
  height: ${Math.round(pos.height / scale)}px;
}

`;
  });

  return css.trimEnd() + '\n';
}

function generateSCSS(
  positions: IconPosition[],
  prefix: string,
  totalWidth: number,
  totalHeight: number,
  cellWidth: number,
  cellHeight: number,
  retina: boolean
): string {
  const scale = retina ? 2 : 1;
  const displayWidth = Math.round(totalWidth / scale);
  const displayHeight = Math.round(totalHeight / scale);
  const displayCellW = Math.round(cellWidth / scale);
  const displayCellH = Math.round(cellHeight / scale);

  let scss = `$sprite-url: 'sprite.png';
$sprite-width: ${displayWidth}px;
$sprite-height: ${displayHeight}px;
$sprite-cell-w: ${displayCellW}px;
$sprite-cell-h: ${displayCellH}px;

@mixin sprite {
  display: inline-block;
  background-image: url($sprite-url);
  background-repeat: no-repeat;
  background-size: $sprite-width $sprite-height;
  width: $sprite-cell-w;
  height: $sprite-cell-h;
}

.${prefix} {
  @include sprite;
}

`;

  positions.forEach((pos) => {
    const x = Math.round(pos.x / scale);
    const y = Math.round(pos.y / scale);
    const w = Math.round(pos.width / scale);
    const h = Math.round(pos.height / scale);
    scss += `@mixin sprite-${pos.name} {
  @include sprite;
  background-position: -${x}px -${y}px;
  width: ${w}px;
  height: ${h}px;
}

.${prefix}-${pos.name} {
  @include sprite-${pos.name};
}

`;
  });

  return scss.trimEnd() + '\n';
}
