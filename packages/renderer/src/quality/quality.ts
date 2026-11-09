import type { QualityTier } from '../types';

/**
 * 渲染档位（见 02-architecture §5.5）：
 * - high：全部效果，DPR = min(2, devicePixelRatio)
 * - mid：DPR 1.5，关闭闪粉
 * - low：不用 WebGL，CSS 3D 静态卡片
 */
export function tierFromGpu(input: {
  gpuTier: number | null;
  webgl: boolean;
  reducedMotion: boolean;
}): QualityTier {
  if (!input.webgl || input.reducedMotion) return 'low';
  if (input.gpuTier === null) return 'mid';
  if (input.gpuTier >= 2) return 'high';
  if (input.gpuTier === 1) return 'mid';
  return 'low';
}

export function dprFor(tier: QualityTier, devicePixelRatio: number): number {
  if (tier === 'high') return Math.min(2, devicePixelRatio);
  if (tier === 'mid') return Math.min(1.5, devicePixelRatio);
  return 1;
}

export function lowerTier(tier: QualityTier): QualityTier {
  return tier === 'high' ? 'mid' : 'low';
}

/**
 * 运行时帧率监测：每个窗口（默认 2 秒）计算平均帧率，
 * high 档低于 55fps 降到 mid，任何档位低于 30fps 降到 low。
 * 只降不升，避免来回切换。
 */
export class FpsMonitor {
  private frames = 0;
  private elapsed = 0;
  private warmup: number;

  constructor(
    private readonly windowSec = 2,
    warmupSec = 1.5,
  ) {
    this.warmup = warmupSec;
  }

  /** 每帧调用。返回建议的新档位；不需要改变时返回 null */
  tick(dtSec: number, current: QualityTier): QualityTier | null {
    if (this.warmup > 0) {
      this.warmup -= dtSec;
      return null;
    }
    this.frames++;
    this.elapsed += dtSec;
    if (this.elapsed < this.windowSec) return null;
    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (fps < 30 && current !== 'low') return 'low';
    if (fps < 55 && current === 'high') return 'mid';
    return null;
  }
}

export function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 检测初始档位。detect-gpu 默认从 unpkg CDN 下载 GPU 跑分数据，
 * 上线时应该自己托管（benchmarksURL），并且失败时退回 mid。
 */
export async function detectQuality(
  options: { benchmarksURL?: string } = {},
): Promise<QualityTier> {
  const webgl = hasWebGL();
  const reducedMotion = prefersReducedMotion();
  if (!webgl || reducedMotion) return tierFromGpu({ gpuTier: null, webgl, reducedMotion });
  try {
    const { getGPUTier } = await import('detect-gpu');
    const result = await getGPUTier(
      options.benchmarksURL ? { benchmarksURL: options.benchmarksURL } : {},
    );
    return tierFromGpu({ gpuTier: result.tier, webgl, reducedMotion });
  } catch {
    return 'mid';
  }
}
