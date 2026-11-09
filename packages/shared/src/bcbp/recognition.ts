import type { RecognitionResult } from '../recognition';
import { FUTURE_WINDOW_DAYS } from '../recognize/config';
import {
  dayNumber,
  formatDate,
  isLeapYear,
  julianToYmd,
  parseIsoDate,
  type YMD,
} from '../recognize/year';
import type { BcbpLeg, BcbpResult } from './parse';

/**
 * 儒略日 → 日期。
 * - 有签发日期（条件字段，带年份最后一位）时：签发年份 = 不晚于 ref 年份 +1、末位相同的最近年份；
 *   航班儒略日小于签发儒略日时，航班在下一年。
 * - 否则：在 ref 前后一年里取落在窗口 (ref + 7天 − 365天, ref + 7天] 内的那一天
 *   （登机牌一般在起飞前 1–2 天才出，扫描时通常已经飞过了）。
 */
export function bcbpFlightDate(
  julian: number,
  ref: YMD,
  issue?: BcbpResult['issueDate'],
): YMD | null {
  if (issue) {
    let issueYear = ref.year + 1;
    while (issueYear % 10 !== issue.yearDigit) issueYear--;
    const year = julian >= issue.julianDate ? issueYear : issueYear + 1;
    const d = julianToYmd(year, julian);
    if (d) return d;
  }
  const refN = dayNumber(ref);
  const hi = refN + FUTURE_WINDOW_DAYS.flight;
  for (const year of [ref.year - 1, ref.year, ref.year + 1]) {
    const d = julianToYmd(year, julian);
    if (!d) continue;
    const n = dayNumber(d);
    if (n > hi - 365 && n <= hi) return d;
  }
  // 第 366 天且窗口内没有闰年：取最近的闰年
  for (let year = ref.year; year >= ref.year - 4; year--) {
    if (isLeapYear(year)) return julianToYmd(year, julian);
  }
  return null;
}

/** 条码字段的置信度 */
const BARCODE = 1;

function legRoute(legs: BcbpLeg[]): string {
  const stops = legs.map((l) => l.from);
  const last = legs[legs.length - 1];
  if (last) stops.push(last.to);
  return stops.join('→');
}

/**
 * BCBP → 识别结果（只包含条码能给出的字段，置信度都是 1）。
 * 多航段时标题用第一段，副标题给出完整行程。
 * 不输出姓名和 PNR，只在 sensitive 里标记。
 *
 * @param refDate 拍摄时间（ISO），用来推断航班年份
 */
export function bcbpToRecognition(bcbp: BcbpResult, refDate: string): Partial<RecognitionResult> {
  const leg = bcbp.legs[0];
  if (!leg) return { type: 'flight', details: {}, sensitive: ['barcode'] };

  const out: Partial<RecognitionResult> = {
    type: 'flight',
    title: { value: `${leg.flightNo} ${leg.from}→${leg.to}`, confidence: BARCODE },
    details: {
      airline: { value: leg.carrier, confidence: BARCODE },
      flightNo: { value: leg.flightNo, confidence: BARCODE },
      from: { value: leg.from, confidence: BARCODE },
      to: { value: leg.to, confidence: BARCODE },
      ...(leg.compartment ? { cabin: { value: leg.compartment, confidence: BARCODE } } : {}),
    },
    sensitive: [
      ...(bcbp.passengerName ? (['name'] as const) : []),
      ...(leg.pnr ? (['booking_ref'] as const) : []),
      'barcode',
    ],
  };
  if (bcbp.legs.length > 1) {
    out.subtitle = { value: legRoute(bcbp.legs), confidence: BARCODE };
  }
  if (leg.seat) out.seat = { value: leg.seat, confidence: BARCODE };

  const ref = parseIsoDate(refDate);
  const date = ref ? bcbpFlightDate(leg.julianDate, ref, bcbp.issueDate) : null;
  if (date) out.eventAt = { value: formatDate(date), confidence: BARCODE };
  return out;
}
