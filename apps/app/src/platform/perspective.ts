/**
 * 四边形透视校正（Homography 单应性矩阵求解 + 双线性插值重采样）。
 * 用户在扫描裁切页拖动四个角（左上、右上、右下、左下，相对坐标 0..1）后，
 * 把梯形区域拉正成矩形票面图（SCAN-02）。
 */

export type Point2D = { x: number; y: number };

/** 默认四个角（留一点边距方便用户拖动） */
export const DEFAULT_QUAD: [Point2D, Point2D, Point2D, Point2D] = [
  { x: 0.06, y: 0.12 },
  { x: 0.94, y: 0.12 },
  { x: 0.94, y: 0.88 },
  { x: 0.06, y: 0.88 },
];

/**
 * 求解从目标矩形 [0,w]×[0,h] 到源四边形 src[0..3] 的 3×3 单应性矩阵 H
 * 使得 (u, v, 1) ~ H * (x, y, 1)
 */
export function computeHomography(
  dstW: number,
  dstH: number,
  src: [Point2D, Point2D, Point2D, Point2D],
): [number, number, number, number, number, number, number, number, number] {
  const dst: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: dstW, y: 0 },
    { x: dstW, y: dstH },
    { x: 0, y: dstH },
  ];

  // 8x9 增广矩阵消元
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const d = dst[i] ?? { x: 0, y: 0 };
    const s = src[i] ?? { x: 0, y: 0 };
    a.push([d.x, d.y, 1, 0, 0, 0, -d.x * s.x, -d.y * s.x, s.x]);
    a.push([0, 0, 0, d.x, d.y, 1, -d.x * s.y, -d.y * s.y, s.y]);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]?.[col] ?? 0) > Math.abs(a[pivot]?.[col] ?? 0)) pivot = row;
    }
    const colRow = a[col];
    const pivotRow = a[pivot];
    if (colRow && pivotRow) {
      a[col] = pivotRow;
      a[pivot] = colRow;
    }

    const activeColRow = a[col];
    if (!activeColRow) continue;
    const div = activeColRow[col] ?? 0;
    if (Math.abs(div) < 1e-12) continue;
    for (let j = col; j <= n; j++) {
      activeColRow[j] = (activeColRow[j] ?? 0) / div;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const targetRow = a[row];
      if (!targetRow) continue;
      const factor = targetRow[col] ?? 0;
      for (let j = col; j <= n; j++) {
        targetRow[j] = (targetRow[j] ?? 0) - factor * (activeColRow[j] ?? 0);
      }
    }
  }

  return [
    a[0]?.[8] ?? 1,
    a[1]?.[8] ?? 0,
    a[2]?.[8] ?? 0,
    a[3]?.[8] ?? 0,
    a[4]?.[8] ?? 1,
    a[5]?.[8] ?? 0,
    a[6]?.[8] ?? 0,
    a[7]?.[8] ?? 0,
    1,
  ];
}

export function mapHomography(
  h: [number, number, number, number, number, number, number, number, number],
  x: number,
  y: number,
): Point2D {
  const denom = h[6] * x + h[7] * y + h[8];
  const inv = Math.abs(denom) < 1e-9 ? 1 : 1 / denom;
  return {
    x: (h[0] * x + h[1] * y + h[2]) * inv,
    y: (h[3] * x + h[4] * y + h[5]) * inv,
  };
}

/** 根据四个角估算拉正后的宽高比（毫米尺寸未知时使用） */
export function estimateQuadAspect(
  quad: [Point2D, Point2D, Point2D, Point2D],
  srcW: number,
  srcH: number,
): { w: number; h: number } {
  const p = quad.map((pt) => ({ x: pt.x * srcW, y: pt.y * srcH })) as [
    Point2D,
    Point2D,
    Point2D,
    Point2D,
  ];
  const topW = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
  const botW = Math.hypot(p[2].x - p[3].x, p[2].y - p[3].y);
  const leftH = Math.hypot(p[3].x - p[0].x, p[3].y - p[0].y);
  const rightH = Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y);
  const avgW = Math.max(1, (topW + botW) / 2);
  const avgH = Math.max(1, (leftH + rightH) / 2);
  // 归一化到高 = 70mm 的常见票据比例
  const hMm = 70;
  const wMm = Math.round(Math.max(45, Math.min(240, (avgW / avgH) * hMm)));
  return { w: wMm, h: hMm };
}

/** 在 Canvas2D 上把源图像的 quad 区域透视校正到目标画布 */
export function warpPerspectiveToCanvas(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  srcWidth: number,
  srcHeight: number,
  quadNorm: [Point2D, Point2D, Point2D, Point2D],
  maxEdgePx = 1280,
): { canvas: HTMLCanvasElement; sizeMm: { w: number; h: number } } {
  const sizeMm = estimateQuadAspect(quadNorm, srcWidth, srcHeight);
  const scale = maxEdgePx / Math.max(sizeMm.w, sizeMm.h);
  const dstW = Math.max(16, Math.round(sizeMm.w * scale));
  const dstH = Math.max(16, Math.round(sizeMm.h * scale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcWidth;
  srcCanvas.height = srcHeight;
  const srcCtx = srcCanvas.getContext('2d');
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstW;
  dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext('2d');

  if (!srcCtx || !dstCtx) {
    return { canvas: dstCanvas, sizeMm };
  }

  srcCtx.drawImage(source, 0, 0, srcWidth, srcHeight);
  const srcImg = srcCtx.getImageData(0, 0, srcWidth, srcHeight);
  const sData = srcImg.data;
  const dstImg = dstCtx.createImageData(dstW, dstH);
  const dData = dstImg.data;

  const srcQuadPx: [Point2D, Point2D, Point2D, Point2D] = [
    { x: quadNorm[0].x * srcWidth, y: quadNorm[0].y * srcHeight },
    { x: quadNorm[1].x * srcWidth, y: quadNorm[1].y * srcHeight },
    { x: quadNorm[2].x * srcWidth, y: quadNorm[2].y * srcHeight },
    { x: quadNorm[3].x * srcWidth, y: quadNorm[3].y * srcHeight },
  ];
  const h = computeHomography(dstW, dstH, srcQuadPx);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const pt = mapHomography(h, x + 0.5, y + 0.5);
      const sx = Math.max(0, Math.min(srcWidth - 1, Math.floor(pt.x)));
      const sy = Math.max(0, Math.min(srcHeight - 1, Math.floor(pt.y)));
      const sIdx = (sy * srcWidth + sx) * 4;
      const dIdx = (y * dstW + x) * 4;
      dData[dIdx] = sData[sIdx] ?? 0;
      dData[dIdx + 1] = sData[sIdx + 1] ?? 0;
      dData[dIdx + 2] = sData[sIdx + 2] ?? 0;
      dData[dIdx + 3] = 255;
    }
  }

  dstCtx.putImageData(dstImg, 0, 0);
  return { canvas: dstCanvas, sizeMm };
}
