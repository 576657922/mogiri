/**
 * 票据时间处理：所有票据的 eventAt 都是「活动当地时间字符串」（YYYY-MM-DD 或 YYYY-MM-DDTHH:mm），
 * 配合 eventTz（IANA 时区，例如 Asia/Tokyo）。
 * 严禁使用 new Date(eventAt) 直接解析不带时区的字符串！
 */

export type ParsedLocalEventTime = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
};

const LOCAL_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

export function parseEventLocalTime(eventAt: string): ParsedLocalEventTime | null {
  const m = LOCAL_ISO_RE.exec(eventAt.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const result: ParsedLocalEventTime = { year, month, day };
  if (m[4] !== undefined && m[5] !== undefined) {
    result.hour = Number(m[4]);
    result.minute = Number(m[5]);
  }
  return result;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 提取用于分组的年份与月份（如 { year: 2026, yearMonth: '2026-11' }） */
export function getYearMonthKey(eventAt: string): {
  year: number;
  month: number;
  yearMonth: string;
} {
  const parsed = parseEventLocalTime(eventAt);
  if (!parsed) {
    return { year: 1970, month: 1, yearMonth: '1970-01' };
  }
  return {
    year: parsed.year,
    month: parsed.month,
    yearMonth: `${parsed.year}-${pad2(parsed.month)}`,
  };
}

/**
 * 获取某个 IANA 时区在给定 UTC 毫秒时刻的「当地日历时间」，
 * 用于判断一张票在活动举办地是否属于「即将到来」（TL-05）。
 */
export function getNowInTimezone(tz: string, nowMs = Date.now()): ParsedLocalEventTime {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(nowMs));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour') % 24,
      minute: get('minute'),
    };
  } catch {
    const d = new Date(nowMs);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    };
  }
}

function toComparableSortableString(t: ParsedLocalEventTime): string {
  return `${t.year}-${pad2(t.month)}-${pad2(t.day)}T${pad2(t.hour ?? 23)}:${pad2(t.minute ?? 59)}`;
}

/** 按活动时间倒序比较（最新活动排在前面） */
export function compareEventAtDesc(aEventAt: string, bEventAt: string): number {
  const pa = parseEventLocalTime(aEventAt);
  const pb = parseEventLocalTime(bEventAt);
  const sa = pa ? toComparableSortableString(pa) : aEventAt;
  const sb = pb ? toComparableSortableString(pb) : bEventAt;
  return sb.localeCompare(sa);
}

/** 判断票据在活动举办地时区是否尚未开始（即将到来，TL-05） */
export function isUpcomingEvent(eventAt: string, eventTz: string, nowMs = Date.now()): boolean {
  const parsed = parseEventLocalTime(eventAt);
  if (!parsed) return false;
  const localNow = getNowInTimezone(eventTz, nowMs);
  return toComparableSortableString(parsed) > toComparableSortableString(localNow);
}

/** 计算距离活动当日还有多少天（按活动当地日历日计算） */
export function daysUntilEvent(eventAt: string, eventTz: string, nowMs = Date.now()): number {
  const parsed = parseEventLocalTime(eventAt);
  if (!parsed) return 0;
  const localNow = getNowInTimezone(eventTz, nowMs);
  const eventUtcNoon = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0);
  const nowUtcNoon = Date.UTC(localNow.year, localNow.month - 1, localNow.day, 12, 0, 0);
  return Math.round((eventUtcNoon - nowUtcNoon) / (24 * 60 * 60 * 1000));
}

/** 按界面语言格式化活动当地时间显示（不随用户当前所在时区漂移） */
export function formatEventDateDisplay(eventAt: string, locale = 'ja'): string {
  const p = parseEventLocalTime(eventAt);
  if (!p) return eventAt;
  const timePart =
    p.hour !== undefined && p.minute !== undefined ? ` ${pad2(p.hour)}:${pad2(p.minute)}` : '';
  if (locale.startsWith('ja') || locale.startsWith('zh')) {
    return `${p.year}年${p.month}月${p.day}日${timePart}`;
  }
  return `${p.year}.${pad2(p.month)}.${pad2(p.day)}${timePart}`;
}

/** 计算软删除票据距离 30 天彻底清理还剩多少天 */
export function daysUntilPermanentDelete(
  deletedAt: string | undefined,
  nowMs = Date.now(),
): number {
  if (!deletedAt) return 30;
  const deletedMs = Date.parse(deletedAt);
  if (Number.isNaN(deletedMs)) return 30;
  const elapsedDays = (nowMs - deletedMs) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(30 - elapsedDays));
}
