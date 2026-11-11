/**
 * 程序化博朗机械触感音效引擎（零外部音频资源，纯 Web Audio API 实时合成）：
 * - playDetentClick：滚轮与叠卡越过整数卡槽时的 6ms 精密机械棘轮微咔哒声
 * - playPaperFlip：特种棉纸翻面/切换视图时的轻柔纸张摩擦声
 * - playPunchClack：检票钳打孔时的清脆金属咬合声
 * - playTearRip：沿齿孔线撕下副券时的纸纤维撕裂声
 * 自动遵循系统 prefers-reduced-motion 与用户静音偏好；非浏览器环境安全静默。
 */

const SFX_STORAGE_KEY = 'mogiri_sfx';

let sharedCtx: AudioContext | null = null;

function readInitialSfxPref(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const saved = localStorage.getItem(SFX_STORAGE_KEY);
  return saved === null ? true : saved === '1';
}

let sfxEnabled = readInitialSfxPref();

export function isSfxEnabled(): boolean {
  return sfxEnabled;
}

export function setSfxEnabled(enabled: boolean): void {
  sfxEnabled = enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SFX_STORAGE_KEY, enabled ? '1' : '0');
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAudioContext(): AudioContext | null {
  if (!sfxEnabled || prefersReducedMotion()) return null;
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (sharedCtx.state === 'suspended') {
    void sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

/** 滚轮与叠卡切换时的微棘轮刻度声 */
export function playDetentClick(intensity = 1): void {
  const ctx = getAudioContext();
  if (ctx?.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1350, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.011);

    const peak = Math.min(0.06, 0.036 * intensity);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.014);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.016);
  } catch {
    // 忽略音频上下文瞬态异常
  }
}

/** 票面翻转或视图切换时的特种纸轻拂声 */
export function playPaperFlip(): void {
  const ctx = getAudioContext();
  if (ctx?.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const duration = 0.055;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + duration);
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.032, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  } catch {
    // 忽略音频上下文瞬态异常
  }
}

/** 检票打孔钳清脆咬合声 */
export function playPunchClack(): void {
  const ctx = getAudioContext();
  if (ctx?.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(115, now + 0.035);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  } catch {
    // 忽略音频上下文瞬态异常
  }
}

/** 沿齿孔线撕开副券的纤维撕裂声 */
export function playTearRip(): void {
  const ctx = getAudioContext();
  if (ctx?.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const duration = 0.14;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const perf = 0.6 + 0.4 * Math.sin(t * Math.PI * 26);
      data[i] = (Math.random() * 2 - 1) * perf * (1 - t * 0.65);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  } catch {
    // 忽略音频上下文瞬态异常
  }
}
