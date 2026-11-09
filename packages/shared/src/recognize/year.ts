/**
 * 日期工具 + 缺失年份推断。
 *
 * 只用 Date.UTC 做「日历计算」（不解析任何字符串，不涉及时区），符合 03-development §4 的时间规范。
 *
 * ## 年份推断策略（inferYear）
 *
 * 票面上没有年份（JR 车票、部分电影票）时，用拍摄时间 ref 推断：
 *
 * 1. 在 ref 前后各一年里找候选日期，取落在窗口 `(ref + futureWindow − 365天, ref + futureWindow]` 里的那一个。
 *    - 文档默认规则是「不晚于拍摄时间的最近日期」，即 futureWindow ≈ 0；
 *    - 但扫描「还没用的票」也很常见（TL-05 倒计时），所以按票型给一个「未来容忍窗口」：
 *      JR 指定席最早提前 1 个月发售 → 31 天；登机牌 7 天；电影 14 天；演出最长 180 天
 *      （演出票几乎都印有年份，这个窗口很少用到）。见 config.ts FUTURE_WINDOW_DAYS。
 * 2. 票面印有星期（「11月9日(月)」）时用星期校验：窗口内的候选星期对不上，
 *    就在 ref 前 6 年到后 1 年里找星期对得上、离 ref 最近的那一年。
 * 3. 置信度：过去 180 天内 0.95；更早 0.9 / 0.8（接近一年时容易跨年猜错）；未来窗口内 0.9；
 *    星期对得上 0.97；只能靠星期反推 0.85；星期对不上又找不到 0.6。
 */

export type YMD = { year: number; month: number; day: number };

const DAY_MS = 86_400_000;

export function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** 从 ISO 字符串取「本地日期」部分（前 10 个字符），不做时区换算 */
export function parseIsoDate(iso: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const ymd = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidDate(ymd.year, ymd.month, ymd.day) ? ymd : null;
}

/** 1970-01-01 起的天数 */
export function dayNumber(d: YMD): number {
  return Math.round(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS);
}

/** 0 = 星期日 … 6 = 星期六 */
export function weekdayOf(d: YMD): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

export function fromDayNumber(n: number): YMD {
  const d = new Date(n * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 某年的第 n 天（1 起）→ 年月日；超出该年天数返回 null */
export function julianToYmd(year: number, julian: number): YMD | null {
  const max = isLeapYear(year) ? 366 : 365;
  if (!Number.isInteger(julian) || julian < 1 || julian > max) return null;
  return fromDayNumber(dayNumber({ year, month: 1, day: 1 }) + julian - 1);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(d: YMD): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

export function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

export type YearInference = { year: number; certainty: number; rule: string };

export type MonthDay = {
  month: number;
  day: number;
  /** 0 = 星期日 */
  weekday?: number;
};

export function inferYear(
  md: MonthDay,
  ref: YMD,
  opts: { futureWindowDays: number },
): YearInference | null {
  const refN = dayNumber(ref);
  const lo = refN + opts.futureWindowDays - 365;
  const hi = refN + opts.futureWindowDays;

  let base: { year: number; diff: number } | null = null;
  for (const year of [ref.year - 1, ref.year, ref.year + 1]) {
    if (!isValidDate(year, md.month, md.day)) continue;
    const n = dayNumber({ year, month: md.month, day: md.day });
    if (n > lo && n <= hi) {
      base = { year, diff: n - refN };
      break;
    }
  }

  const matchesWeekday = (year: number) =>
    md.weekday === undefined || weekdayOf({ year, month: md.month, day: md.day }) === md.weekday;

  if (base && md.weekday !== undefined) {
    if (matchesWeekday(base.year)) {
      return { year: base.year, certainty: 0.97, rule: 'year:window+weekday' };
    }
    const byWeekday = searchByWeekday(md, ref);
    if (byWeekday !== null) return { year: byWeekday, certainty: 0.85, rule: 'year:weekday' };
    return { year: base.year, certainty: 0.6, rule: 'year:window-weekday-mismatch' };
  }

  if (base) {
    const d = base.diff;
    const certainty = d > 0 ? 0.9 : d >= -180 ? 0.95 : d >= -300 ? 0.9 : 0.8;
    return { year: base.year, certainty, rule: 'year:window' };
  }

  // 2 月 29 日且窗口内没有闰年：取不晚于 ref 年份 +1 的最近闰年
  if (md.month === 2 && md.day === 29) {
    for (let year = ref.year + 1; year >= ref.year - 8; year--) {
      if (isLeapYear(year) && matchesWeekday(year)) {
        return { year, certainty: 0.6, rule: 'year:leap-fallback' };
      }
    }
  }
  return null;
}

/** 在 ref 前 6 年到后 1 年里找星期对得上的年份，取离 ref 最近的（同距离时取过去） */
function searchByWeekday(md: MonthDay, ref: YMD): number | null {
  const refN = dayNumber(ref);
  let best: { year: number; dist: number } | null = null;
  for (let year = ref.year - 6; year <= ref.year + 1; year++) {
    if (!isValidDate(year, md.month, md.day)) continue;
    const d = { year, month: md.month, day: md.day };
    if (weekdayOf(d) !== md.weekday) continue;
    const diff = dayNumber(d) - refN;
    // 未来的日期距离加倍：同样远时更可能是过去的票
    const dist = diff > 0 ? diff * 2 : -diff;
    if (!best || dist < best.dist) best = { year, dist };
  }
  return best?.year ?? null;
}
