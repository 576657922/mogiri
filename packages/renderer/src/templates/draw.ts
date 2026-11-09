import type { TicketSpec } from '../types';
import { formatValue } from './format';
import type { BackDef, Background, FontKind, Region, TemplateDef, TextRegion } from './types';

/** 纹理长边的默认像素数（见 02-architecture §5.1：约 2048px） */
export const DEFAULT_TEXTURE_PX = 2048;

const FONT_STACK: Record<FontKind, string> = {
  sans: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans SC", "PingFang SC", system-ui, sans-serif',
  serif: '"Hiragino Mincho ProN", "Noto Serif JP", "Songti SC", serif',
  mono: '"OCR-B", "SF Mono", Menlo, Consolas, "Noto Sans Mono", monospace',
  display: '"Avenir Next Condensed", "Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif',
};

export type FaceCanvases = {
  /** 正面颜色 */
  albedo: HTMLCanvasElement;
  /** 蒙版：R = 镭射，G = 烫金，B = 打孔镂空 */
  mask: HTMLCanvasElement;
  pxPerMm: number;
};

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D is not available');
  return ctx;
}

/** 字符串 → 32 位种子 */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 确定性伪随机数（mulberry32） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 计算纹理尺寸：长边 = maxPx */
export function textureSize(sizeMm: { w: number; h: number }, maxPx = DEFAULT_TEXTURE_PX) {
  const pxPerMm = maxPx / Math.max(sizeMm.w, sizeMm.h);
  return { width: Math.round(sizeMm.w * pxPerMm), height: Math.round(sizeMm.h * pxPerMm), pxPerMm };
}

function resolveText(region: TextRegion, fields: Record<string, string>): string {
  const raw = region.bind ? (fields[region.bind] ?? region.text) : region.text;
  if (raw === undefined || raw === '') return '';
  let text = formatValue(raw, region.format);
  if (text === '') return '';
  if (region.uppercase) text = text.toUpperCase();
  return `${region.prefix ?? ''}${text}${region.suffix ?? ''}`;
}

type Painter = {
  ctx: CanvasRenderingContext2D;
  mask: CanvasRenderingContext2D;
  k: number;
  fields: Record<string, string>;
  foilAuto: 'holo' | 'gold';
};

function foilColor(kind: 'holo' | 'gold' | 'auto', auto: 'holo' | 'gold'): string {
  const resolved = kind === 'auto' ? auto : kind;
  return resolved === 'holo' ? '#ff0000' : '#00ff00';
}

function drawBackground(p: Painter, bg: Background, w: number, h: number) {
  const { ctx, k } = p;
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, w * k, h * k);

  switch (bg.kind) {
    case 'solid':
      return;
    case 'guilloche': {
      // 防伪底纹：多条相位错开的正弦曲线
      ctx.strokeStyle = bg.line;
      ctx.lineWidth = Math.max(1, 0.12 * k);
      for (let i = 0; i < 28; i++) {
        ctx.beginPath();
        const y0 = (h / 28) * i;
        for (let x = 0; x <= w; x += 0.8) {
          const y = y0 + 3.2 * Math.sin(x * 0.11 + i * 0.7) + 1.4 * Math.sin(x * 0.37 - i * 1.3);
          if (x === 0) ctx.moveTo(x * k, y * k);
          else ctx.lineTo(x * k, y * k);
        }
        ctx.stroke();
      }
      if (bg.band) {
        ctx.fillStyle = bg.band.color;
        ctx.fillRect(0, bg.band.y * k, w * k, bg.band.h * k);
      }
      return;
    }
    case 'jr': {
      // JR 磁气券底纹：重复的小「JR」字样
      ctx.fillStyle = bg.pattern;
      ctx.font = `700 ${2.2 * k}px ${FONT_STACK.sans}`;
      ctx.textBaseline = 'top';
      for (let y = 0, row = 0; y < h; y += 3.2, row++) {
        for (let x = row % 2 === 0 ? 0 : 2.6; x < w; x += 5.2) {
          ctx.fillText('JR', x * k, y * k);
        }
      }
      return;
    }
    case 'boarding': {
      ctx.fillStyle = bg.band;
      ctx.fillRect(0, 0, w * k, bg.bandH * k);
      ctx.fillStyle = bg.accent;
      ctx.fillRect(0, bg.bandH * k, w * k, 0.9 * k);
      return;
    }
  }
}

function drawText(p: Painter, r: TextRegion) {
  const text = resolveText(r, p.fields);
  if (!text) return;
  const { ctx, mask, k } = p;
  let size = r.size;
  const font = (s: number) => `${r.weight ?? 400} ${s * k}px ${FONT_STACK[r.font ?? 'sans']}`;

  const targets = r.foil ? [ctx, mask] : [ctx];
  for (const c of targets) {
    c.save();
    c.textBaseline = 'top';
    c.textAlign = r.align ?? 'left';
    if ('letterSpacing' in c) c.letterSpacing = `${(r.letterSpacing ?? 0) * k}px`;
    c.font = font(size);
    if (r.fit === 'shrink' && r.w) {
      const measured = c.measureText(text).width;
      if (measured > r.w * k) size = Math.max(r.size * 0.45, (r.size * r.w * k) / measured);
      c.font = font(size);
    }
    c.translate(r.x * k, r.y * k);
    if (r.rotate) c.rotate((r.rotate * Math.PI) / 180);
    c.fillStyle = c === mask && r.foil ? foilColor(r.foil, p.foilAuto) : (r.color ?? '#1d1d1d');
    c.fillText(text, 0, 0);
    c.restore();
  }
}

function roundRectPath(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function drawBarcode(p: Painter, r: Extract<Region, { kind: 'barcode' }>) {
  const { ctx, k } = p;
  const rand = seededRandom(hashString(p.fields[r.bind] ?? r.bind));
  const x = r.x * k;
  const y = r.y * k;
  const w = r.w * k;
  const h = r.h * k;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = r.color ?? '#111111';

  if (r.symbology === 'qr') {
    // 伪二维码：25×25 模块 + 三个定位图案（只是视觉效果，不可扫描）
    const n = 25;
    const quiet = Math.min(w, h) * 0.08;
    const cell = (Math.min(w, h) - quiet * 2) / n;
    const ox = x + (w - cell * n) / 2;
    const oy = y + (h - cell * n) / 2;
    const finder = (cx: number, cy: number) =>
      cx >= 0 &&
      cy >= 0 &&
      ((cx < 7 && cy < 7) || (cx >= n - 7 && cy < 7) || (cx < 7 && cy >= n - 7));
    for (let cy = 0; cy < n; cy++) {
      for (let cx = 0; cx < n; cx++) {
        let on: boolean;
        const fx = cx >= n - 7 ? cx - (n - 7) : cx;
        const fy = cy >= n - 7 ? cy - (n - 7) : cy;
        if (finder(cx, cy)) {
          const ring = Math.max(Math.abs(fx - 3), Math.abs(fy - 3));
          on = ring !== 2;
        } else if ((cx === 7 || cy === 7 || cx === n - 8 || cy === n - 8) && (cx < 8 || cy < 8)) {
          on = false;
        } else {
          on = rand() > 0.52;
        }
        if (on) ctx.fillRect(ox + cx * cell, oy + cy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  } else if (r.symbology === 'pdf417') {
    // 伪 PDF417：多行条码
    const rows = 8;
    const rowH = (h * 0.84) / rows;
    const startY = y + h * 0.08;
    const unit = w / 220;
    for (let row = 0; row < rows; row++) {
      let cx = x + w * 0.03;
      const end = x + w * 0.97;
      while (cx < end) {
        const bar = (1 + Math.floor(rand() * 4)) * unit;
        const gap = (1 + Math.floor(rand() * 3)) * unit;
        ctx.fillRect(cx, startY + row * rowH, Math.min(bar, end - cx), rowH * 0.92);
        cx += bar + gap;
      }
    }
  } else {
    let cx = x + w * 0.04;
    const unit = w / 120;
    while (cx < x + w * 0.96) {
      const bar = (1 + Math.floor(rand() * 3)) * unit;
      ctx.fillRect(cx, y + h * 0.08, bar, h * 0.84);
      cx += bar + (1 + Math.floor(rand() * 3)) * unit;
    }
  }
  ctx.restore();
}

function drawRegion(p: Painter, r: Region) {
  const { ctx, mask, k } = p;
  switch (r.kind) {
    case 'text':
      drawText(p, r);
      return;
    case 'rect': {
      for (const c of r.foil ? [ctx, mask] : [ctx]) {
        c.save();
        roundRectPath(c, r.x * k, r.y * k, r.w * k, r.h * k, (r.radius ?? 0) * k);
        const isMask = c === mask;
        if (r.fill) {
          c.fillStyle = isMask && r.foil ? foilColor(r.foil, p.foilAuto) : r.fill;
          c.fill();
        }
        if (r.stroke) {
          c.strokeStyle = isMask && r.foil ? foilColor(r.foil, p.foilAuto) : r.stroke;
          c.lineWidth = (r.lineWidth ?? 0.3) * k;
          c.stroke();
        }
        c.restore();
      }
      return;
    }
    case 'line':
      ctx.save();
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * k;
      if (r.dash) ctx.setLineDash(r.dash.map((d) => d * k));
      ctx.beginPath();
      ctx.moveTo(r.x1 * k, r.y1 * k);
      ctx.lineTo(r.x2 * k, r.y2 * k);
      ctx.stroke();
      ctx.restore();
      return;
    case 'barcode':
      drawBarcode(p, r);
      return;
    case 'foil':
      mask.fillStyle = foilColor(r.foil, p.foilAuto);
      mask.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
      return;
  }
}

function drawPerforation(p: Painter, tpl: TemplateDef) {
  if (!tpl.stub) return;
  const { ctx, k } = p;
  const x = tpl.stub.at * k;
  ctx.save();
  if (tpl.stub.perforation === 'dots') {
    ctx.fillStyle = tpl.stub.color ?? 'rgba(0,0,0,0.38)';
    for (let y = 1; y < tpl.size.h; y += 1.6) {
      ctx.beginPath();
      ctx.arc(x, y * k, 0.32 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = tpl.stub.color ?? 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.2 * k;
    ctx.setLineDash([0.8 * k, 0.6 * k]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, tpl.size.h * k);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPunches(p: Painter, spec: TicketSpec) {
  // 检票打孔：写入蒙版 B 通道，Shader 里镂空
  const { mask, k } = p;
  mask.save();
  mask.globalCompositeOperation = 'lighter';
  mask.fillStyle = '#0000ff';
  for (const punch of spec.wear.punches) {
    mask.beginPath();
    mask.arc(punch.x * k, punch.y * k, 1.6 * k, 0, Math.PI * 2);
    mask.fill();
  }
  mask.restore();
}

/** 按模板绘制正面（生成模式）。扫描模式下 albedo 直接用扫描图，只绘制蒙版 */
export function drawFace(
  tpl: TemplateDef,
  spec: TicketSpec,
  maxPx = DEFAULT_TEXTURE_PX,
): FaceCanvases {
  const size = spec.sizeMm ?? tpl.size;
  const { width, height, pxPerMm } = textureSize(size, maxPx);
  const albedo = createCanvas(width, height);
  const maskCanvas = createCanvas(width, height);
  const p: Painter = {
    ctx: context2d(albedo),
    mask: context2d(maskCanvas),
    k: pxPerMm,
    fields: spec.fields,
    foilAuto: spec.material === 'foil-gold' ? 'gold' : 'holo',
  };
  p.mask.fillStyle = '#000000';
  p.mask.fillRect(0, 0, width, height);

  if (spec.faceImage) {
    p.ctx.drawImage(spec.faceImage, 0, 0, width, height);
  } else {
    drawBackground(p, tpl.background, size.w, size.h);
    for (const region of tpl.regions) drawRegion(p, region);
    drawPerforation(p, tpl);
  }
  drawPunches(p, spec);
  return { albedo, mask: maskCanvas, pxPerMm };
}

/** 背面。磁气券返回 null（Shader 里程序生成） */
export function drawBack(
  tpl: TemplateDef,
  spec: TicketSpec,
  maxPx = 1024,
): HTMLCanvasElement | null {
  const size = spec.sizeMm ?? tpl.size;
  const back: BackDef = tpl.back;
  const { width, height, pxPerMm: k } = textureSize(size, maxPx);
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  if (spec.backImage) {
    ctx.drawImage(spec.backImage, 0, 0, width, height);
    return canvas;
  }
  if (back.kind === 'magnetic') {
    ctx.fillStyle = '#2b2622';
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }
  ctx.fillStyle = back.color;
  ctx.fillRect(0, 0, width, height);
  if (back.lines?.length) {
    ctx.fillStyle = back.lineColor ?? 'rgba(0,0,0,0.55)';
    ctx.font = `400 ${2.1 * k}px ${FONT_STACK.sans}`;
    ctx.textBaseline = 'top';
    back.lines.forEach((line, i) => {
      ctx.fillText(line, 6 * k, (6 + i * 3.4) * k);
    });
  }
  return canvas;
}
