import type { TextFormat } from './types';

const WEEKDAY_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];
const MONTH_EN = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

type LocalDateTime = { y: number; m: number; d: number; hh?: number; mm?: number };

/** 解析不带时区的 ISO 本地时间：2026-11-09 或 2026-11-09T18:30 */
export function parseLocalDateTime(value: string): LocalDateTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const result: LocalDateTime = { y: Number(y), m: Number(m), d: Number(d) };
  if (hh !== undefined && mm !== undefined) {
    result.hh = Number(hh);
    result.mm = Number(mm);
  }
  return result;
}

/** 本地日期的星期（与时区无关） */
function weekday({ y, m, d }: LocalDateTime): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 按模板格式化字段。无法解析时原样返回 */
export function formatValue(value: string, format: TextFormat | undefined): string {
  if (!format) return value;
  const dt = parseLocalDateTime(value);
  if (!dt) return value;
  switch (format) {
    case 'date.dot':
      return `${dt.y}.${pad(dt.m)}.${pad(dt.d)}`;
    case 'date.jp':
      return `${dt.y}年${dt.m}月${dt.d}日`;
    case 'date.jr':
      return `${String(dt.m).padStart(2, ' ')}月${String(dt.d).padStart(2, ' ')}日`;
    case 'date.iata':
      return `${pad(dt.d)}${MONTH_EN[dt.m - 1]}`;
    case 'weekday.en':
      return WEEKDAY_EN[weekday(dt)] ?? '';
    case 'weekday.jp':
      return `(${WEEKDAY_JP[weekday(dt)]})`;
    case 'time':
      return dt.hh === undefined || dt.mm === undefined ? '' : `${pad(dt.hh)}:${pad(dt.mm)}`;
  }
}
