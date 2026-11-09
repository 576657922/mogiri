import type { Hit, NormLine } from '../types';
import { isValidDate, weekdayOf } from '../year';

export type DateRole = 'event' | 'issue' | 'valid-until' | 'unknown';

export type DateValue = {
  /** 票面没有年份时为 undefined，由 year.ts 推断 */
  year?: number;
  month: number;
  day: number;
  /** 票面印的星期（0 = 星期日） */
  weekday?: number;
  role: DateRole;
  /** 星期和日期是否一致（只有印了星期且有年份时才有值） */
  weekdayConsistent?: boolean;
};

export type DateHit = Hit<DateValue> & { start: number; end: number };

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};
const MON = '(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\\.?';

type Pattern = {
  rule: string;
  re: RegExp;
  certainty: number;
  build: (m: RegExpExecArray) => { year?: number; month: number; day: number } | null;
};

const num = (s: string | undefined) => Number(s);
const twoDigitYear = (y: number) => (y < 100 ? 2000 + y : y);
const eraYear = (era: string | undefined, n: string | undefined) => {
  const v = n === '元' ? 1 : num(n);
  if (era === '令和' || era === 'R') return 2018 + v;
  if (era === '平成' || era === 'H') return 1988 + v;
  return Number.NaN;
};

/** 按优先级排列；同一片文字只取第一个（最可信的）匹配 */
const PATTERNS: Pattern[] = [
  {
    rule: 'date:ja-era',
    re: /(令和|平成)\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
    certainty: 0.97,
    build: (m) => ({ year: eraYear(m[1], m[2]), month: num(m[3]), day: num(m[4]) }),
  },
  {
    rule: 'date:ja-era-short',
    re: /(?<![A-Z])(R|H)\s*(\d{1,2})\.(\d{1,2})\.(\d{1,2})(?!\d)/g,
    certainty: 0.8,
    build: (m) => ({ year: eraYear(m[1], m[2]), month: num(m[3]), day: num(m[4]) }),
  },
  {
    rule: 'date:cjk-ymd',
    re: /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/g,
    certainty: 0.97,
    build: (m) => ({ year: num(m[1]), month: num(m[2]), day: num(m[3]) }),
  },
  {
    rule: 'date:ko-ymd',
    re: /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
    certainty: 0.97,
    build: (m) => ({ year: num(m[1]), month: num(m[2]), day: num(m[3]) }),
  },
  {
    rule: 'date:ymd',
    re: /(?<!\d)(\d{4})([./-])(\d{1,2})\2(\d{1,2})(?!\d)/g,
    certainty: 0.95,
    build: (m) => ({ year: num(m[1]), month: num(m[3]), day: num(m[4]) }),
  },
  {
    rule: 'date:en-mdy',
    re: new RegExp(`\\b${MON}\\s*(\\d{1,2})(?:ST|ND|RD|TH)?\\s*,?\\s*(\\d{4})\\b`, 'gi'),
    certainty: 0.93,
    build: (m) => ({
      year: num(m[3]),
      month: MONTHS[(m[1] ?? '').toUpperCase()] ?? 0,
      day: num(m[2]),
    }),
  },
  {
    rule: 'date:en-dmy',
    re: new RegExp(`\\b(\\d{1,2})\\s*${MON}\\s*,?\\s*(\\d{4}|\\d{2})\\b`, 'gi'),
    certainty: 0.9,
    build: (m) => ({
      year: twoDigitYear(num(m[3])),
      month: MONTHS[(m[2] ?? '').toUpperCase()] ?? 0,
      day: num(m[1]),
    }),
  },
  {
    rule: 'date:us-mdy',
    re: /(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/])/g,
    certainty: 0.75,
    build: (m) => {
      const a = num(m[1]);
      const b = num(m[2]);
      // 第一段 > 12 时按 日/月/年 理解
      return a > 12 ? { year: num(m[3]), month: b, day: a } : { year: num(m[3]), month: a, day: b };
    },
  },
  {
    rule: 'date:yy-md',
    re: /(?<![\d.])(\d{2})([./])(\d{1,2})\2(\d{1,2})(?![\d.])/g,
    certainty: 0.75,
    build: (m) => ({ year: 2000 + num(m[1]), month: num(m[3]), day: num(m[4]) }),
  },
  {
    rule: 'date:cjk-md',
    re: /(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/g,
    certainty: 0.95,
    build: (m) => ({ month: num(m[1]), day: num(m[2]) }),
  },
  {
    rule: 'date:ko-md',
    re: /(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
    certainty: 0.93,
    build: (m) => ({ month: num(m[1]), day: num(m[2]) }),
  },
  {
    rule: 'date:en-md',
    re: new RegExp(`\\b${MON}\\s*(\\d{1,2})(?:ST|ND|RD|TH)?\\b(?!\\s*,?\\s*\\d)`, 'gi'),
    certainty: 0.8,
    build: (m) => ({ month: MONTHS[(m[1] ?? '').toUpperCase()] ?? 0, day: num(m[2]) }),
  },
  {
    rule: 'date:en-dm',
    re: new RegExp(`\\b(\\d{1,2})\\s*${MON}(?![A-Z]|\\s*,?\\s*\\d)`, 'gi'),
    certainty: 0.8,
    build: (m) => ({ month: MONTHS[(m[2] ?? '').toUpperCase()] ?? 0, day: num(m[1]) }),
  },
];

const JA_WEEKDAYS = '日月火水木金土';
const ZH_WEEKDAYS = '日一二三四五六';
const KO_WEEKDAYS = '일월화수목금토';
const EN_WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** 读取紧跟在日期后面（或英文写在日期前面）的星期 */
export function readWeekday(after: string, before: string): number | undefined {
  let m = /^\s*[(（]\s*([日月火水木金土])\s*(?:曜日?)?\s*[)）]/.exec(after);
  if (m?.[1]) return JA_WEEKDAYS.indexOf(m[1]);
  m = /^\s*[(（]?\s*(?:周|星期|礼拜|週)([日天一二三四五六])/.exec(after);
  if (m?.[1]) return m[1] === '天' ? 0 : ZH_WEEKDAYS.indexOf(m[1]);
  m = /^\s*[(（]\s*([일월화수목금토])(?:요일)?\s*[)）]/.exec(after);
  if (m?.[1]) return KO_WEEKDAYS.indexOf(m[1]);
  m = /^\s*[(（,]?\s*(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*\.?\s*[)）]?/i.exec(after);
  if (m?.[1]) return EN_WEEKDAYS.indexOf(m[1].toUpperCase());
  m = /(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*\.?\s*,?\s*$/i.exec(before);
  if (m?.[1]) return EN_WEEKDAYS.indexOf(m[1].toUpperCase());
  return undefined;
}

const ISSUE_CONTEXT =
  /(発行|発売|購入|発券|印刷|出票|购买|购票|开票|開票|申込|ISSUED?|PURCHASED?|PRINTED|발권|구매)/i;
const VALID_BEFORE =
  /(有効期限|有効期間|有效期|有效日期|VALID\s*(?:UNTIL|THRU|THROUGH)|EXP(?:IRES|IRY)?|유효기간)/i;
const UNTIL_AFTER = /^\s*(?:\([^)]*\))?\s*(まで|迄|止|까지)/;
const EVENT_CONTEXT =
  /(公演日|開催日|日時|日程|日期|DATE|上映日|乗車日|搭乗日|演出时间|演出時間|开演|開演|放映|观影|場次|场次|일시|날짜)/i;

function roleOf(line: string, start: number, end: number): DateRole {
  const before = line.slice(0, start);
  const after = line.slice(end);
  if (VALID_BEFORE.test(before) || UNTIL_AFTER.test(after)) return 'valid-until';
  if (ISSUE_CONTEXT.test(before) || ISSUE_CONTEXT.test(after.slice(0, 12))) return 'issue';
  if (EVENT_CONTEXT.test(before)) return 'event';
  return 'unknown';
}

/** 从一行里提取所有日期 */
export function extractDatesFromLine(line: NormLine): DateHit[] {
  const text = line.text;
  const found: DateHit[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);

  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (let m = p.re.exec(text); m; m = p.re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const v = p.build(m);
      if (!v || v.month < 1 || v.month > 12 || v.day < 1 || v.day > 31) continue;
      if (v.year !== undefined && (!isValidDate(v.year, v.month, v.day) || v.year < 1950)) {
        continue;
      }
      taken.push([start, end]);
      const weekday = readWeekday(text.slice(end), text.slice(0, start));
      let certainty = p.certainty;
      let weekdayConsistent: boolean | undefined;
      if (weekday !== undefined && weekday >= 0 && v.year !== undefined) {
        weekdayConsistent = weekdayOf({ year: v.year, month: v.month, day: v.day }) === weekday;
        // 一致性校验：星期对得上 → 稍微加分；对不上 → 多半是 OCR 认错了数字
        certainty = weekdayConsistent ? Math.min(1, certainty + 0.03) : certainty * 0.6;
      }
      const value: DateValue = {
        month: v.month,
        day: v.day,
        role: roleOf(text, start, end),
        ...(v.year !== undefined ? { year: v.year } : {}),
        ...(weekday !== undefined && weekday >= 0 ? { weekday } : {}),
        ...(weekdayConsistent !== undefined ? { weekdayConsistent } : {}),
      };
      found.push({ value, certainty, line: line.index, rule: p.rule, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

export function extractDates(lines: readonly NormLine[]): DateHit[] {
  return lines.flatMap(extractDatesFromLine);
}

const ROLE_FACTOR: Record<DateRole, number> = {
  event: 1.03,
  unknown: 1,
  'valid-until': 0.6,
  issue: 0.4,
};

/**
 * 选出活动日期：按「规则确定度 × 角色系数 × OCR 置信度」打分。
 * 有另一个不同的日期得分接近时，返回的 ambiguity < 1（调用方用来降低置信度）。
 */
export function pickEventDate(
  hits: readonly DateHit[],
  lineConf: (line: number) => number,
): { hit: DateHit; score: number; ambiguity: number } | null {
  const scored = hits
    .map((hit) => ({
      hit,
      score: hit.certainty * ROLE_FACTOR[hit.value.role] * lineConf(hit.line),
    }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  const key = (h: DateHit) => `${h.value.year ?? '?'}-${h.value.month}-${h.value.day}`;
  const rival = scored.find(
    (s) =>
      key(s.hit) !== key(best.hit) && s.score > best.score - 0.1 && s.hit.value.role !== 'issue',
  );
  return { hit: best.hit, score: best.score, ambiguity: rival ? 0.85 : 1 };
}
