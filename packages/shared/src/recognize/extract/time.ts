import type { Hit, NormLine } from '../types';

export type TimeRole = 'event' | 'doors' | 'departure' | 'arrival' | 'boarding' | 'end' | 'unknown';

export type TimeValue = { hour: number; minute: number; role: TimeRole };

export type TimeHit = Hit<TimeValue> & { start: number; end: number };

const ROLE_KEYWORDS: Array<[Exclude<TimeRole, 'unknown'>, RegExp]> = [
  ['doors', /(開場|开场|開門|开门|入場開始|入场时间|入場時間|入场|OPEN|DOORS?|입장)/gi],
  [
    'event',
    /(開演|开演|開始|开始|START|SHOW\s*TIME|SHOWTIME|上映|放映|开映|公演時間|演出时间|KICK\s*-?OFF|試合開始|공연\s*시간|시작|상영)/gi,
  ],
  ['boarding', /(搭乗開始|搭乗時刻|搭乗時間|BOARDING|登机时间|登機時間|탑승)/gi],
  ['departure', /(出発|発車|出发|发车|开车|DEP(?:ARTURE|ART)?\b|출발)/gi],
  ['arrival', /(到着|到达|到達|ARR(?:IVAL|IVE)?\b|도착)/gi],
  ['end', /(終演|终场|終了|END)/gi],
];

/**
 * 文字里最后出现的角色关键词。按结束位置比较，结束位置相同时取更长的关键词
 * （「搭乗開始」应该是 boarding，而不是其中的「開始」）。
 */
function lastRole(s: string): Exclude<TimeRole, 'unknown'> | null {
  let best: { role: Exclude<TimeRole, 'unknown'>; end: number; len: number } | null = null;
  for (const [role, re] of ROLE_KEYWORDS) {
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const end = m.index + m[0].length;
      const len = m[0].length;
      if (!best || end > best.end || (end === best.end && len > best.len)) {
        best = { role, end, len };
      }
    }
  }
  return best?.role ?? null;
}

/** 紧跟在时间后面的「发 / 着」（JR：「18:30発」「20:57着」；中文：「18:30开」） */
function suffixTrainRole(after: string): TimeRole | null {
  if (/^\s*(発車|発(?![売行券])|开车|开(?!\p{Script=Han})|開車|出発)/u.test(after))
    return 'departure';
  if (/^\s*(着|到)/.test(after)) return 'arrival';
  return null;
}

type RawTime = { hour: number; minute: number; start: number; end: number; rule: string };

function scanTimes(text: string): RawTime[] {
  const out: RawTime[] = [];
  const taken: Array<[number, number]> = [];
  const add = (t: RawTime) => {
    if (taken.some(([a, b]) => t.start < b && t.end > a)) return;
    taken.push([t.start, t.end]);
    out.push(t);
  };
  const ampm = (h: number, before: string, after: string) => {
    const pm =
      /(午後|下午|晚上|傍晚|夜|PM|P\.M\.|오후)\s*$/i.test(before) || /^\s*(PM|P\.M\.)/i.test(after);
    const am =
      /(午前|上午|早上|AM|A\.M\.|오전)\s*$/i.test(before) || /^\s*(AM|A\.M\.)/i.test(after);
    if (pm && h < 12) return h + 12;
    if (am && h === 12) return 0;
    return h;
  };

  // 18:30（排除 18:30:00 的秒、排除更长的数字串）
  const colon = /(?<!\d)(?<!\d:)(\d{1,2}):(\d{2})(?::\d{2})?(?![\d:])/g;
  for (let m = colon.exec(text); m; m = colon.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    add({
      hour: ampm(Number(m[1]), text.slice(0, start), text.slice(end)),
      minute: Number(m[2]),
      start,
      end,
      rule: 'time:colon',
    });
  }
  // 18時30分 / 18时30分 / 6時半 / 18時 / 18시 30분
  const kanji = /(?<!\d)(\d{1,2})\s*([時时시])\s*(?:(\d{1,2})\s*[分분]|(半))?/g;
  for (let m = kanji.exec(text); m; m = kanji.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    // 「18時」后面紧跟「間」（時間）之类不是时间
    if (/^[間间]/.test(text.slice(end))) continue;
    const minute = m[4] ? 30 : m[3] ? Number(m[3]) : 0;
    add({
      hour: ampm(Number(m[1]), text.slice(0, start), text.slice(end)),
      minute,
      start,
      end,
      rule: 'time:kanji',
    });
  }
  return out.filter((t) => t.hour <= 23 && t.minute <= 59).sort((a, b) => a.start - b.start);
}

/**
 * 从一行里提取时间并判断角色（开场 / 开演 / 出发 / 到达 / 登机 / 结束）。
 *
 * 标签可能在时间前面（「開場 17:30 開演 18:30」），也可能在后面（「17:30開場 18:30開演」）：
 * 第一个时间前面没有标签、后面有标签时，整行按「标签在后」处理。
 * `prevLabel`：上一行是单独的标签（「開演」）时传进来，给本行第一个无标签的时间用。
 */
export function extractTimesFromLine(line: NormLine, prevLabel: TimeRole | null = null): TimeHit[] {
  const text = line.text;
  const raws = scanTimes(text);
  if (raws.length === 0) return [];

  const first = raws[0];
  const suffixMode =
    first !== undefined &&
    lastRole(text.slice(0, first.start)) === null &&
    lastRole(text.slice(first.end, raws[1]?.start ?? text.length)) !== null;

  return raws.map((t, i) => {
    const prevEnd = raws[i - 1]?.end ?? 0;
    const nextStart = raws[i + 1]?.start ?? text.length;
    const before = text.slice(prevEnd, t.start);
    const after = text.slice(t.end, nextStart);

    let role: TimeRole | null = suffixTrainRole(after);
    let certainty = 0.95;
    if (!role && /[~〜～-]\s*$/.test(before) && i > 0) role = 'end'; // 「18:30〜20:45」的后一个
    if (!role) role = suffixMode ? lastRole(after) : lastRole(before);
    if (!role && i === 0 && prevLabel) role = prevLabel;
    if (!role && /^\s*[~〜～-]\s*\d/.test(text.slice(t.end))) {
      role = 'event'; // 时间范围的开始 = 开始时间
      certainty = 0.9;
    }
    if (!role) {
      role = 'unknown';
      certainty = 0.8;
    }
    return {
      value: { hour: t.hour, minute: t.minute, role },
      certainty,
      line: line.index,
      rule: t.rule,
      start: t.start,
      end: t.end,
    };
  });
}

/** 这一行是不是「单独的时间标签」（例如只有「開演」两个字，时间在下一行） */
export function labelOnlyRole(text: string): TimeRole | null {
  const role = lastRole(text);
  if (!role) return null;
  const rest = text
    .replace(/(時間|时间|時刻|TIME|시간)/gi, '')
    .replace(/[\s:：/]/g, '')
    .replace(ROLE_KEYWORDS.find(([r]) => r === role)?.[1] ?? /$^/, '');
  return rest.length <= 1 ? role : null;
}

export function extractTimes(lines: readonly NormLine[]): TimeHit[] {
  const out: TimeHit[] = [];
  let prevLabel: TimeRole | null = null;
  for (const line of lines) {
    out.push(...extractTimesFromLine(line, prevLabel));
    prevLabel = labelOnlyRole(line.text);
  }
  return out;
}
