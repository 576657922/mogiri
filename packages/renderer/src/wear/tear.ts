/**
 * 撕副券的动作模型（纯函数，方便测试）。
 * 拖动阶段：副券随拖动距离逐渐离开、卷曲、倾斜；超过阈值后脱离并飞出。
 * 见 02-architecture §5.4。
 */

/** 拖动超过这个距离（毫米）就撕下 */
export const TEAR_THRESHOLD_MM = 18;

export type StubPose = {
  /** 沿 x 方向的位移（毫米） */
  offsetX: number;
  offsetY: number;
  /** 绕 z 轴旋转（弧度），从上往下撕的感觉 */
  rotZ: number;
  /** 卷曲程度（1/毫米），传给 Shader 的 uCurl 之前要换算单位 */
  curl: number;
};

export const RESTING_POSE: StubPose = { offsetX: 0, offsetY: 0, rotZ: 0, curl: 0 };

/** 拖动距离 → 副券姿态。有阻力感：越接近阈值越难拉 */
export function stubPoseForDrag(dragMm: number): StubPose {
  const d = Math.max(0, dragMm);
  if (d === 0) return { ...RESTING_POSE };
  const t = Math.min(1, d / TEAR_THRESHOLD_MM);
  const eased = 1 - (1 - t) ** 2;
  return {
    offsetX: eased * 2.2,
    offsetY: eased * 0.6,
    rotZ: -eased * 0.07,
    curl: eased * 0.0045,
  };
}

export function shouldTear(dragMm: number): boolean {
  return dragMm >= TEAR_THRESHOLD_MM;
}

export type FlyState = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotZ: number;
  rotY: number;
  spinZ: number;
  spinY: number;
  opacity: number;
  age: number;
};

/** 撕下瞬间的初始状态（毫米、秒） */
export function startFly(pose: StubPose, releaseVelocityMmPerSec = 120): FlyState {
  return {
    x: pose.offsetX,
    y: pose.offsetY,
    z: 0,
    // 限制速度：太快会瞬间飞出画面，看不到动画
    vx: Math.min(260, Math.max(80, releaseVelocityMmPerSec)),
    vy: 60,
    vz: 40,
    rotZ: pose.rotZ,
    rotY: 0,
    spinZ: -2.4,
    spinY: 1.6,
    opacity: 1,
    age: 0,
  };
}

const GRAVITY_MM = 900;
/** 飞出动画时长（秒），结束后副券隐藏 */
export const FLY_DURATION = 1.1;

export function stepFly(s: FlyState, dt: number): FlyState {
  const age = s.age + dt;
  return {
    x: s.x + s.vx * dt,
    y: s.y + s.vy * dt,
    z: s.z + s.vz * dt,
    vx: s.vx * 0.99,
    vy: s.vy - GRAVITY_MM * dt,
    vz: s.vz,
    rotZ: s.rotZ + s.spinZ * dt,
    rotY: s.rotY + s.spinY * dt,
    spinZ: s.spinZ,
    spinY: s.spinY,
    opacity: Math.max(0, 1 - Math.max(0, age - FLY_DURATION * 0.55) / (FLY_DURATION * 0.45)),
    age,
  };
}
