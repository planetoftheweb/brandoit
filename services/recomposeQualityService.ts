import { GeneratedImage } from '../types';

interface RegionStats {
  mean: number;
  variance: number;
  stdDev: number;
}

interface EdgeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

const toDataUrl = (base64: string, mimeType: string): string =>
  `data:${mimeType};base64,${base64}`;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const clampRect = (
  x: number,
  y: number,
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
) => ({
  x: Math.max(0, Math.min(maxWidth - 1, x)),
  y: Math.max(0, Math.min(maxHeight - 1, y)),
  width: Math.max(1, Math.min(maxWidth, width)),
  height: Math.max(1, Math.min(maxHeight, height))
});

const getLumaStats = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): RegionStats => {
  const rect = clampRect(x, y, width, height, ctx.canvas.width, ctx.canvas.height);
  const imageData = ctx.getImageData(rect.x, rect.y, rect.width, rect.height).data;
  const sampleStep = Math.max(1, Math.floor(Math.max(rect.width, rect.height) / 320));

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let row = 0; row < rect.height; row += sampleStep) {
    for (let col = 0; col < rect.width; col += sampleStep) {
      const idx = (row * rect.width + col) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luma;
      sumSq += luma * luma;
      count += 1;
    }
  }

  if (count === 0) {
    return { mean: 0, variance: 0, stdDev: 0 };
  }

  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return {
    mean,
    variance,
    stdDev: Math.sqrt(variance)
  };
};

const getEdgeBounds = (ctx: CanvasRenderingContext2D): EdgeBounds => {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(1, Math.floor(Math.max(width, height) / 420));

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  const lumaAt = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const idx = (cy * width + cx) * 4;
    const r = imageData[idx];
    const g = imageData[idx + 1];
    const b = imageData[idx + 2];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const gx = Math.abs(lumaAt(x + step, y) - lumaAt(x - step, y));
      const gy = Math.abs(lumaAt(x, y + step) - lumaAt(x, y - step));
      const magnitude = gx + gy;
      if (magnitude < 36) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }

  if (count === 0) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1, count: 0 };
  }

  return { minX, minY, maxX, maxY, count };
};

/**
 * Heuristic detector for "boxed" recomposition outputs where most content stays centered
 * and new canvas area is mostly plain margin/padding.
 */
export const detectLikelyCanvasPadding = async (image: GeneratedImage): Promise<boolean> => {
  try {
    if (!image?.base64Data || !image?.mimeType) return false;

    const src = toDataUrl(image.base64Data, image.mimeType);
    const loaded = await loadImage(src);
    const width = loaded.naturalWidth;
    const height = loaded.naturalHeight;
    if (!width || !height) return false;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(loaded, 0, 0, width, height);

    const strip = Math.max(8, Math.floor(Math.min(width, height) * 0.12));
    const centerW = Math.max(16, Math.floor(width * 0.5));
    const centerH = Math.max(16, Math.floor(height * 0.5));
    const centerX = Math.max(0, Math.floor((width - centerW) / 2));
    const centerY = Math.max(0, Math.floor((height - centerH) / 2));

    const left = getLumaStats(ctx, 0, 0, strip, height);
    const right = getLumaStats(ctx, width - strip, 0, strip, height);
    const top = getLumaStats(ctx, 0, 0, width, strip);
    const bottom = getLumaStats(ctx, 0, height - strip, width, strip);
    const center = getLumaStats(ctx, centerX, centerY, centerW, centerH);

    if (center.stdDev < 1) return false;

    const sideVarianceLow =
      left.stdDev < center.stdDev * 0.55 &&
      right.stdDev < center.stdDev * 0.55;
    const topBottomVarianceLow =
      top.stdDev < center.stdDev * 0.55 &&
      bottom.stdDev < center.stdDev * 0.55;

    const sideBackgroundMatch = Math.abs(left.mean - right.mean) < 18;
    const topBottomBackgroundMatch = Math.abs(top.mean - bottom.mean) < 18;
    const boxedByVariance =
      (sideVarianceLow && sideBackgroundMatch) || (topBottomVarianceLow && topBottomBackgroundMatch);

    const bounds = getEdgeBounds(ctx);
    const occupiedWidth = bounds.count > 0 ? (bounds.maxX - bounds.minX + 1) / width : 1;
    const occupiedHeight = bounds.count > 0 ? (bounds.maxY - bounds.minY + 1) / height : 1;
    const boxedByGeometry =
      bounds.count > 150 &&
      (occupiedWidth < 0.84 || occupiedHeight < 0.84);

    return boxedByVariance || boxedByGeometry;
  } catch {
    return false;
  }
};
