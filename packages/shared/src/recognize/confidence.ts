import { RECOGNIZE_CONFIG } from './config';

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 字段置信度 = OCR 行置信度 × 规则确定度（× 一致性系数），
 * 上限为 localMaxConfidence（置信度 1 保留给条码字段）。
 */
export function fieldConfidence(
  certainty: number,
  lineConfidence: number,
  factor = 1,
  cap: number = RECOGNIZE_CONFIG.localMaxConfidence,
): number {
  return round2(Math.min(cap, clamp01(certainty * lineConfidence * factor)));
}

/** 日期和时间组合成 eventAt 时取两者中较低的置信度 */
export function combineConfidence(...values: number[]): number {
  return round2(Math.min(...values));
}

export type HM = { hour: number; minute: number };
const minutes = (t: HM) => t.hour * 60 + t.minute;

/**
 * 一致性校验（02-architecture §6.5 ⑤）：
 * - 开场时间应早于开演时间，且相差不超过 3 小时；
 * - 出发时间应早于到达时间（跨午夜除外：到达 < 出发且差值很大时视为次日到达）。
 * 返回各字段的置信度系数（1 = 不调整）。
 */
export function consistencyFactors(t: { doors?: HM; event?: HM; departure?: HM; arrival?: HM }): {
  event: number;
  doors: number;
  departure: number;
  rules: string[];
} {
  const out = { event: 1, doors: 1, departure: 1, rules: [] as string[] };
  if (t.doors && t.event) {
    const gap = minutes(t.event) - minutes(t.doors);
    if (gap > 0 && gap <= 180) {
      out.event = 1.03;
      out.doors = 1.03;
      out.rules.push('consistency:doors<event');
    } else {
      out.event = 0.7;
      out.doors = 0.7;
      out.rules.push('consistency:doors>=event');
    }
  }
  if (t.departure && t.arrival) {
    const gap = minutes(t.arrival) - minutes(t.departure);
    if (gap > 0 || gap < -12 * 60) {
      out.departure = 1.02;
      out.rules.push('consistency:dep<arr');
    } else {
      out.departure = 0.75;
      out.rules.push('consistency:dep>=arr');
    }
  }
  return out;
}
