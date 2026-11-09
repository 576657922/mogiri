import { drawFace, hashString, seededRandom } from '../templates/draw';
import { getTemplate } from '../templates/presets';
import type { TicketSpec } from '../types';

/**
 * 在 Canvas2D 上把票面（含镭射/烫金光泽、岁月泛黄、检票打孔、撕掉副券后的锯齿边缘、圆角）
 * 合成成一张位图，用于：
 * 1. 时间线列表的预渲染缩略图（600px WebP，见 02-architecture §5.6）
 * 2. T1 低端机 CSS 3D 降级卡片（见 02-architecture §5.5）
 * 不占用额外的 WebGL 上下文，任意时刻都可以離屏调用。
 */
export function renderTicketCardCanvas(spec: TicketSpec, maxPx = 600): HTMLCanvasElement {
  const tpl = getTemplate(spec.templateId);
  const { albedo, mask, pxPerMm: k } = drawFace(tpl, spec, maxPx);
  const w = albedo.width;
  const h = albedo.height;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return albedo;

  // 1. 圆角与撕裂副券的裁剪路径
  ctx.save();
  const r = Math.min(tpl.cornerRadius * k, w * 0.1, h * 0.2);
  const stubAtPx = spec.wear.torn && tpl.stub ? tpl.stub.at * k : null;

  if (stubAtPx === null) {
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.clip();
  } else {
    const rand = seededRandom(hashString(spec.id));
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(stubAtPx, 0);
    const step = Math.max(2, 1.2 * k);
    for (let y = step; y < h; y += step) {
      const jitter = (rand() - 0.5) * 0.9 * k;
      ctx.lineTo(stubAtPx + jitter, y);
    }
    ctx.lineTo(stubAtPx, h);
    ctx.lineTo(r, h);
    ctx.arcTo(0, h, 0, h - r, r);
    ctx.lineTo(0, r);
    ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath();
    ctx.clip();
  }

  // 2. 绘制基础票面
  ctx.drawImage(albedo, 0, 0);

  // 3. 叠加镭射（R 通道）和烫金（G 通道）视觉光泽，以及打孔镂空（B 通道）
  const maskCtx = mask.getContext('2d');
  if (maskCtx) {
    const img = ctx.getImageData(0, 0, w, h);
    const mImg = maskCtx.getImageData(0, 0, w, h);
    const data = img.data;
    const mData = mImg.data;
    const age = Math.max(0, Math.min(1, spec.wear.age));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const mr = (mData[idx] ?? 0) / 255;
        const mg = (mData[idx + 1] ?? 0) / 255;
        const mb = (mData[idx + 2] ?? 0) / 255;

        // 打孔镂空
        if (mb > 0.5) {
          data[idx + 3] = 0;
          continue;
        }

        let cr = data[idx] ?? 0;
        let cg = data[idx + 1] ?? 0;
        let cb = data[idx + 2] ?? 0;
        const lum = (cr * 0.299 + cg * 0.587 + cb * 0.114) / 255;
        const inkMask = Math.max(0, Math.min(1, (lum - 0.22) / 0.28));

        // 镭射彩虹色带
        const holo = mr * inkMask;
        if (holo > 0.01) {
          const phase = (x / w) * 2.2 + (y / h) * 1.4 + Math.sin((x + y) * 0.08) * 0.12;
          const rr = 0.5 + 0.5 * Math.cos(6.283 * (phase + 0.0));
          const rg = 0.5 + 0.5 * Math.cos(6.283 * (phase + 0.33));
          const rb = 0.5 + 0.5 * Math.cos(6.283 * (phase + 0.67));
          const fr = (140 + rr * 110) * 0.95;
          const fg = (145 + rg * 105) * 0.95;
          const fb = (155 + rb * 100) * 0.95;
          cr = cr * (1 - holo * 0.78) + fr * (holo * 0.78);
          cg = cg * (1 - holo * 0.78) + fg * (holo * 0.78);
          cb = cb * (1 - holo * 0.78) + fb * (holo * 0.78);
        }

        // 烫金光泽
        if (mg > 0.01) {
          const sheen = 0.82 + 0.22 * Math.sin((x / w) * 5.0 - (y / h) * 2.5);
          const gr = Math.min(255, 224 * sheen);
          const gg = Math.min(255, 182 * sheen);
          const gb = Math.min(255, 98 * sheen);
          cr = cr * (1 - mg * 0.75) + gr * (mg * 0.75);
          cg = cg * (1 - mg * 0.75) + gg * (mg * 0.75);
          cb = cb * (1 - mg * 0.75) + gb * (mg * 0.75);
        }

        // 岁月泛黄与墨色褪色
        if (age > 0.001) {
          cr = cr * (1 - age * 0.02);
          cg = cg * (1 - age * 0.08);
          cb = cb * (1 - age * 0.24);
          const fade = age * 0.45 * (1 - lum);
          cr = cr * (1 - fade) + 199 * fade;
          cg = cg * (1 - fade) + 184 * fade;
          cb = cb * (1 - fade) + 153 * fade;
        }

        data[idx] = Math.round(cr);
        data[idx + 1] = Math.round(cg);
        data[idx + 2] = Math.round(cb);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // 4. 轻微斜向柔光高光，增强纸面立体感
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
  return out;
}

/** 渲染缩略图 DataURL（WebP，失败时回退 PNG） */
export function renderThumbnailDataUrl(spec: TicketSpec, maxPx = 600): string {
  const canvas = renderTicketCardCanvas(spec, maxPx);
  const webp = canvas.toDataURL('image/webp', 0.88);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/** 渲染缩略图二进制 Blob（存到 Dexie blobs 表） */
export async function renderThumbnailBlob(spec: TicketSpec, maxPx = 600): Promise<Blob> {
  const canvas = renderTicketCardCanvas(spec, maxPx);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        canvas.toBlob((fallback) => {
          if (fallback) resolve(fallback);
          else reject(new Error('Failed to encode thumbnail blob'));
        }, 'image/png');
      },
      'image/webp',
      0.88,
    );
  });
}
