/**
 * 倾斜输入：指针拖动 / 悬停、陀螺仪、空闲时的自动摆动。
 * 输出统一为 [-1, 1] 的 { x, y }，由 TicketView 映射到旋转角度（±18°）并阻尼平滑。
 * 见 02-architecture §5.4。
 */

export type Tilt = { x: number; y: number };
export type TiltSource = 'idle' | 'pointer' | 'gyro';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 指针位置 → 倾斜。指针在元素中心时为 0，边缘为 ±1 */
export function pointerToTilt(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Tilt {
  const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  const y = ((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
  return { x: clamp(x, -1, 1), y: clamp(-y, -1, 1) };
}

/**
 * 陀螺仪 → 倾斜。以第一次读数（用户自然拿手机的角度）为基准，
 * 偏离 rangeDeg 度时达到 ±1。
 */
export function orientationToTilt(
  beta: number,
  gamma: number,
  baseline: { beta: number; gamma: number },
  rangeDeg = 20,
): Tilt {
  return {
    x: clamp((gamma - baseline.gamma) / rangeDeg, -1, 1),
    y: clamp(-(beta - baseline.beta) / rangeDeg, -1, 1),
  };
}

/** 空闲时缓慢摆动（利萨如曲线），让光泽在没有输入时也能被看到 */
export function idleTilt(timeSec: number): Tilt {
  return { x: Math.sin(timeSec * 0.55) * 0.55, y: Math.sin(timeSec * 0.83 + 1.1) * 0.35 };
}

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/**
 * iOS 13+ 需要在用户点击后请求陀螺仪权限。其他平台直接返回 true。
 * 原生 App 里应该改用 @capacitor/motion（由 platform 层处理）。
 */
export async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return false;
  const ctor = DeviceOrientationEvent as DeviceOrientationEventWithPermission;
  if (typeof ctor.requestPermission !== 'function') return true;
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export type TiltController = {
  /** 当前目标倾斜（未平滑） */
  read(timeSec: number): Tilt & { source: TiltSource };
  /** 拖动副券时暂停指针输入 */
  setPaused(paused: boolean): void;
  dispose(): void;
};

/** 空闲多久后切换到自动摆动（毫秒） */
const IDLE_AFTER_MS = 2500;

export function createTiltController(target: HTMLElement): TiltController {
  let pointer: Tilt | null = null;
  let gyro: Tilt | null = null;
  let baseline: { beta: number; gamma: number } | null = null;
  let lastInput = -Infinity;
  let paused = false;

  const onPointerMove = (e: PointerEvent) => {
    if (paused) return;
    pointer = pointerToTilt(e.clientX, e.clientY, target.getBoundingClientRect());
    lastInput = performance.now();
  };
  const onPointerLeave = () => {
    pointer = null;
  };
  const onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    if (!baseline) baseline = { beta: e.beta, gamma: e.gamma };
    // 基准缓慢跟随，避免用户换个姿势后一直歪着
    baseline.beta += (e.beta - baseline.beta) * 0.005;
    baseline.gamma += (e.gamma - baseline.gamma) * 0.005;
    gyro = orientationToTilt(e.beta, e.gamma, baseline);
    lastInput = performance.now();
  };

  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('deviceorientation', onOrientation);

  return {
    read(timeSec) {
      const idle = performance.now() - lastInput > IDLE_AFTER_MS;
      if (gyro && !idle) return { ...gyro, source: 'gyro' };
      if (pointer && !idle) return { ...pointer, source: 'pointer' };
      return { ...idleTilt(timeSec), source: 'idle' };
    },
    setPaused(value) {
      paused = value;
    },
    dispose() {
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('deviceorientation', onOrientation);
    },
  };
}
