import type { Hit, NormLine } from '../types';
import { JP_TRAIN_RE } from './train-names';

export type SeatValue = {
  /** 座位文字（尽量保留票面写法，只规范空白），例如「1階 Bブロック 3列 15番」「3排5号」「12番A席」「12A」 */
  seat: string;
  /** 火车车厢号（「5号車」→ '5'），单独放到 details.car */
  car?: string;
};

export type SeatHit = Hit<SeatValue>;

/** 车厢：5号車 / 5号车 / 05车 / 5车厢 / 5호차 / CAR 5 */
const CAR_RE =
  /(?:(\d{1,2})\s*(?:号車|号车|號車|车厢|車厢|호차|车(?![次站票]))|\bCAR\s*(?:NO\.?)?\s*(\d{1,2})\b)/i;
/** JR / 中国高铁座位：12番A席 / 12番 A / 12A号 / 12D号 */
const TRAIN_SEAT_RE = /(\d{1,2})\s*番\s*([A-E])\s*席?|(?<!\d)(\d{1,2})\s*([A-F])\s*[号號]/;
/** 航班座位：SEAT 12A / 座席 12A / 座位 12A / 좌석 12A */
const FLIGHT_SEAT_RE =
  /(?:SEAT|座席|座位|좌석)\s*(?:NO\.?)?\s*[:：]?\s*(\d{1,2}[A-K])(?![A-Z0-9])/i;
/** 英文的 Section / Row / Seat 组合 */
const EN_PART_RE =
  /\b(SEC(?:TION)?|BLOCK|ROW|SEAT|GATE|ENTRANCE|AISLE)\s*[:.#]?\s*([A-Z]{0,2}\d{1,4}[A-Z]?|[A-Z]{1,2})(?![A-Z0-9])/gi;
/** 影院常见：座席 F-12 */
const DASH_SEAT_RE = /(?<![A-Z0-9])([A-Z]{1,2})\s*-\s*(\d{1,3})(?!\d)/;
const SEAT_LABEL = /(座席|座位|席番|SEAT|좌석|席)/i;

type Kind = 'floor' | 'area' | 'block' | 'row' | 'num';

/** 中日韩座位片段。每种只认数字 + 单位，避免误吃车次、整理番号等 */
const TOKEN_RES: Array<[Kind, RegExp]> = [
  ['floor', /(?:\d{1,2}|[一二三四五])\s*(?:階|阶|楼|樓|層|층)(?:席)?/g],
  ['area', /(?:アリーナ|スタンド|バルコニー|ARENA|STAND|内野|外野|[一三]塁側|VIP|池座|楼座)/g],
  ['block', /[A-Z0-9]{1,4}\s*(?:ブロック|BLOCK|区|區|구역|ゾーン|ZONE)/g],
  ['row', /(?:[A-Z]{1,2}\d{0,2}|\d{1,3})\s*(?:列|排|열)/g],
  ['num', /\d{1,3}\s*(?:番(?![号號線线地])|号(?![車车館馆機机線线室])|號(?![車館])|座(?!席)|번)/g],
];

type Token = { kind: Kind; start: number; end: number };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const [kind, re] of TOKEN_RES) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (tokens.some((t) => start < t.end && end > t.start)) continue;
      tokens.push({ kind, start, end });
    }
  }
  return tokens.sort((a, b) => a.start - b.start);
}

/** 相邻片段（中间只有空白和少量分隔符）组成一组 */
function group(text: string, tokens: Token[]): Token[][] {
  const groups: Token[][] = [];
  let cur: Token[] = [];
  for (const t of tokens) {
    const prev = cur[cur.length - 1];
    if (prev && /^[\s・/,、-]{0,3}$/.test(text.slice(prev.end, t.start))) {
      cur.push(t);
    } else {
      if (cur.length) groups.push(cur);
      cur = [t];
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function cjkSeat(line: NormLine, text: string): SeatHit | null {
  const hasLabel = SEAT_LABEL.test(text);
  let best: { seat: string; certainty: number } | null = null;
  for (const g of group(text, tokenize(text))) {
    const kinds = new Set(g.map((t) => t.kind));
    const has = (k: Kind) => kinds.has(k);
    let certainty: number;
    if (has('row') && has('num')) certainty = 0.92;
    else if ((has('block') || has('floor') || has('area')) && has('num')) certainty = 0.88;
    else if (has('row') && (has('block') || has('floor') || has('area'))) certainty = 0.7;
    else if (has('block') || has('row')) certainty = hasLabel ? 0.65 : 0.5;
    else if (has('num')) certainty = hasLabel ? 0.55 : 0;
    else certainty = 0; // 只有楼层 / 区域
    if (certainty === 0) continue;
    if (hasLabel) certainty = Math.min(1, certainty + 0.03);
    const first = g[0];
    const last = g[g.length - 1];
    if (!first || !last) continue;
    const seat = text.slice(first.start, last.end).replace(/\s+/g, ' ').trim();
    if (!best || certainty > best.certainty) best = { seat, certainty };
  }
  return best
    ? { value: { seat: best.seat }, certainty: best.certainty, line: line.index, rule: 'seat:cjk' }
    : null;
}

function englishSeat(line: NormLine, text: string): SeatHit | null {
  const parts = [...text.matchAll(EN_PART_RE)];
  const kinds = new Set(parts.map((p) => (p[1] ?? '').toUpperCase().slice(0, 3)));
  if (!kinds.has('SEA') && !kinds.has('ROW')) return null;
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first || !last || first.index === undefined || last.index === undefined) return null;
  const seat = text
    .slice(first.index, last.index + last[0].length)
    .replace(/\s+/g, ' ')
    .trim();
  const certainty = kinds.has('SEA') && kinds.has('ROW') ? 0.92 : 0.75;
  return { value: { seat }, certainty, line: line.index, rule: 'seat:en' };
}

/**
 * 从一行里提取座位。优先级：火车座位（带车厢） > 航班座位 > 中日韩组合 > 英文组合 > 「F-12」。
 */
export function extractSeatFromLine(line: NormLine): SeatHit | null {
  // 先去掉车次（「のぞみ123号」里的「123号」不是座位）
  const text = line.text.replace(JP_TRAIN_RE, (m) => ' '.repeat(m.length));

  const car = CAR_RE.exec(text);
  const carNo = car ? (car[1] ?? car[2]) : undefined;
  const train = TRAIN_SEAT_RE.exec(text);
  if (train) {
    const seat = train[1] ? `${train[1]}番${train[2]}席` : `${train[3]}${train[4]}号`;
    return {
      value: { seat, ...(carNo ? { car: carNo } : {}) },
      certainty: carNo ? 0.95 : 0.85,
      line: line.index,
      rule: 'seat:train',
    };
  }

  const flight = FLIGHT_SEAT_RE.exec(text);
  if (flight?.[1]) {
    return {
      value: { seat: flight[1].toUpperCase() },
      certainty: 0.9,
      line: line.index,
      rule: 'seat:flight',
    };
  }

  // 车厢号单独一行（「5号車」）也要报告，seat 为空字符串时由调用方只取 car
  const withoutCar = car ? text.replace(car[0], ' '.repeat(car[0].length)) : text;
  const cjk = cjkSeat(line, withoutCar);
  const en = cjk ? null : englishSeat(line, withoutCar);
  const found = cjk ?? en;
  if (found) {
    if (carNo) found.value.car = carNo;
    return found;
  }

  if (SEAT_LABEL.test(text)) {
    const dash = DASH_SEAT_RE.exec(text);
    if (dash) {
      return {
        value: { seat: `${dash[1]}-${dash[2]}`, ...(carNo ? { car: carNo } : {}) },
        certainty: 0.8,
        line: line.index,
        rule: 'seat:dash',
      };
    }
  }

  if (carNo) {
    return { value: { seat: '', car: carNo }, certainty: 0.9, line: line.index, rule: 'seat:car' };
  }
  return null;
}

export function extractSeats(lines: readonly NormLine[]): SeatHit[] {
  return lines.flatMap((l) => {
    const hit = extractSeatFromLine(l);
    return hit ? [hit] : [];
  });
}

/** 选出最可信的座位；车厢号可能在另一行，单独合并进来 */
export function pickSeat(
  hits: readonly SeatHit[],
  lineConf: (line: number) => number,
): { hit: SeatHit; score: number } | null {
  const withSeat = hits
    .filter((h) => h.value.seat)
    .map((hit) => ({ hit, score: hit.certainty * lineConf(hit.line) }))
    .sort((a, b) => b.score - a.score);
  const best = withSeat[0];
  const carHit = hits.find((h) => h.value.car);
  if (!best) {
    return carHit ? { hit: carHit, score: carHit.certainty * lineConf(carHit.line) } : null;
  }
  if (!best.hit.value.car && carHit?.value.car) {
    return {
      hit: { ...best.hit, value: { ...best.hit.value, car: carHit.value.car } },
      score: best.score,
    };
  }
  return best;
}
