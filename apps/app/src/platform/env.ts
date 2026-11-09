/**
 * 平台环境检测。业务代码只通过 platform/ 访问平台能力，禁止直接 import @capacitor/*。
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativePlatform(): boolean {
  return Boolean(getCapacitor()?.isNativePlatform?.());
}

export function getPlatformKind(): 'ios' | 'android' | 'web' {
  const raw = getCapacitor()?.getPlatform?.();
  if (raw === 'ios' || raw === 'android') return raw;
  return 'web';
}

export function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  } catch {
    return 'Asia/Tokyo';
  }
}
