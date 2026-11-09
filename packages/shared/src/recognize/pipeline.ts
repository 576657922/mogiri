import { parseBcbp } from '../bcbp/parse';
import type { Field, RecognitionResult } from '../recognition';
import type { TicketType } from '../ticket';
import { classify } from './classify';
import { combineConfidence, consistencyFactors, fieldConfidence, round2 } from './confidence';
import { FUTURE_WINDOW_DAYS, RECOGNIZE_CONFIG } from './config';
import { extractDates, pickEventDate } from './extract/date';
import { extractPrices, pickPrice } from './extract/price';
import { extractRoutes } from './extract/route';
import { extractSeats, pickSeat } from './extract/seat';
import { extractTimes, type TimeHit, type TimeRole } from './extract/time';
import { extractVenue } from './extract/venue';
import { detectLanguage } from './lang';
import { joinSpacedCjk, normalizeText } from './normalize';
import { applyBoardingPassRules } from './rules/boarding-pass';
import { applyCinemaRules } from './rules/cinema';
import type { Draft, RuleContext } from './rules/context';
import { applyEventRules } from './rules/event';
import { applyTrainRules } from './rules/jr';
import { addRule, setDetail } from './rules/util';
import { findSensitiveLines, type SensitiveKind } from './sensitive';
import { genericTitle } from './title';
import type { LocalRecognition, NormLine, OcrLine, RecognizeHints } from './types';
import { formatDate, formatTime, inferYear, parseIsoDate, type YMD } from './year';

// ───────────────────────────── 规范化 ─────────────────────────────

export function normalizeLines(lines: readonly OcrLine[]): NormLine[] {
  return lines
    .map((l, index) => ({
      index,
      raw: l.text,
      text: normalizeText(l.text),
      box: l.box,
      confidence: Math.min(1, Math.max(0, l.confidence)),
    }))
    .filter((l) => l.text.length > 0);
}

const VALID_CHAR = /[\p{L}\p{N}]/gu;

/**
 * OCR 文字质量（0..1）。
 * = 按有效字符数加权的平均置信度；有效字符 < ocrMinValidChars 时再乘 (字符数 / 最小值) × 0.5，
 * 保证结果一定低于 ocrQualityMin，即「文字太少」一定不走文字模式（02-architecture §6.1）。
 * 用加权平均而不是简单平均：一两个很短的噪声行不应该拉低整张票的质量。
 */
export function ocrQuality(lines: readonly OcrLine[]): number {
  let chars = 0;
  let weighted = 0;
  for (const l of lines) {
    const n = normalizeText(l.text).match(VALID_CHAR)?.length ?? 0;
    chars += n;
    weighted += n * Math.min(1, Math.max(0, l.confidence));
  }
  if (chars === 0) return 0;
  const mean = weighted / chars;
  const min = RECOGNIZE_CONFIG.ocrMinValidChars;
  return round2(chars >= min ? mean : mean * (chars / min) * 0.5);
}

// ───────────────────────────── 时间选择 ─────────────────────────────

/** 各票型里「活动时间」优先取哪种角色的时间 */
const EVENT_TIME_ROLES: Record<TicketType, TimeRole[]> = {
  train: ['departure', 'event', 'unknown'],
  flight: ['departure'],
  // 中文影院票的「开场时间」就是放映时间
  movie: ['event', 'doors', 'unknown'],
  concert: ['event', 'unknown'],
  theater: ['event', 'unknown'],
  sports: ['event', 'unknown'],
  exhibition: ['event', 'unknown'],
  other: ['event', 'departure', 'unknown'],
};

function pickTime(
  times: readonly TimeHit[],
  type: TicketType,
  lineConf: (i: number) => number,
): { hit: TimeHit; factor: number } | null {
  for (const role of EVENT_TIME_ROLES[type]) {
    const hits = times.filter((t) => t.value.role === role);
    const first = hits[0];
    if (!first) continue;
    const best = hits.reduce(
      (a, b) => (b.certainty * lineConf(b.line) > a.certainty * lineConf(a.line) ? b : a),
      first,
    );
    // 多个无标签时间：不确定是哪一个
    const distinct = new Set(hits.map((h) => `${h.value.hour}:${h.value.minute}`)).size;
    const factor = role === 'unknown' && distinct > 1 ? 0.85 : 1;
    return { hit: best, factor };
  }
  return null;
}

// ───────────────────────────── 地区推断 ─────────────────────────────

function inferRegion(draft: Draft, lang: string, type: TicketType): void {
  // 航班的时区取决于出发机场，不能按票面语言推断（TODO：IATA → 时区表）
  if (draft.timezone || type === 'flight') return;
  const currency = draft.price?.value.currency;
  if (lang === 'ja' || currency === 'JPY') {
    draft.timezone = { value: 'Asia/Tokyo', confidence: lang === 'ja' ? 0.75 : 0.6 };
    draft.country = { value: 'JP', confidence: lang === 'ja' ? 0.75 : 0.6 };
  } else if (lang === 'ko' || currency === 'KRW') {
    draft.timezone = { value: 'Asia/Seoul', confidence: 0.75 };
    draft.country = { value: 'KR', confidence: 0.75 };
  } else if (lang === 'zh' && currency === 'CNY') {
    draft.timezone = { value: 'Asia/Shanghai', confidence: 0.65 };
    draft.country = { value: 'CN', confidence: 0.65 };
  }
  if (draft.timezone) addRule(draft, 'region:language');
}

// ───────────────────────────── 主流程 ─────────────────────────────

function refDateOf(hints: RecognizeHints): { ymd: YMD; known: boolean } {
  const fromHint = hints.capturedAt ? parseIsoDate(hints.capturedAt) : null;
  if (fromHint) return { ymd: fromHint, known: true };
  // 没有拍摄时间：退回到当天（唯一的非纯函数行为），年份推断的置信度会被降低
  const now = new Date();
  return {
    ymd: { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
    known: false,
  };
}

/**
 * 本地识别：OCR 文字行（+ 条码、拍摄时间等提示）→ LocalRecognition。
 * 步骤见 02-architecture §6.5：判断票型 → 通用提取 → 票型专用规则 → 推断补全 → 置信度。
 */
export function recognizeLocal(
  lines: readonly OcrLine[],
  hints: RecognizeHints = {},
): LocalRecognition {
  const norm = normalizeLines(lines);
  const allText = norm.map((l) => l.text).join('\n');
  const lang = detectLanguage(allText);
  const bcbp = hints.barcode ? parseBcbp(hints.barcode.text) : null;
  // 关键词判断时同时用「合并单字空格」的版本（OCR 常把大字号的「乗 車 券」拆开）
  const joinedText = norm.map((l) => joinSpacedCjk(l.text)).join('\n');
  const cls = classify(`${allText}\n${joinedText}`, { hasBcbp: bcbp !== null });
  const type = cls.type;
  const ref = refDateOf(hints);

  const confByIndex = new Map(norm.map((l) => [l.index, l.confidence]));
  const textByIndex = new Map(norm.map((l) => [l.index, l.text]));
  const lineConf = (i: number) => confByIndex.get(i) ?? 0;

  // 敏感行不参与提取（避免把订单号里的数字当成日期 / 价格）
  const sens = findSensitiveLines(norm.map((l) => l.text));
  const sensitiveLines = new Set([...sens.indices].map((i) => norm[i]?.index ?? -1));
  const content = norm.filter((l) => !sensitiveLines.has(l.index));

  const ctx: RuleContext = {
    type,
    lines: content,
    lang,
    hints,
    refDate: ref.ymd,
    dates: extractDates(content),
    times: extractTimes(content),
    seats: extractSeats(content),
    prices: extractPrices(content, { lang, ...(hints.locale ? { locale: hints.locale } : {}) }),
    routes: extractRoutes(content),
    lineConf,
    lineText: (i) => textByIndex.get(i) ?? '',
  };

  const draft: Draft = {
    details: {},
    matchedRules: [`classify:${type}`],
    usedLines: new Set(sensitiveLines),
    barcodeFields: [],
  };
  for (const h of [...ctx.dates, ...ctx.times, ...ctx.prices]) draft.usedLines.add(h.line);
  for (const h of ctx.seats) if (h.value.seat) draft.usedLines.add(h.line);

  // ── 通用提取：日期
  const date = pickEventDate(ctx.dates, lineConf);
  if (date) {
    const { year, month, day, weekday } = date.hit.value;
    let yearCertainty = 1;
    let resolvedYear = year;
    if (resolvedYear === undefined) {
      const inferred = inferYear(
        { month, day, ...(weekday !== undefined ? { weekday } : {}) },
        ref.ymd,
        { futureWindowDays: FUTURE_WINDOW_DAYS[type] },
      );
      if (inferred) {
        resolvedYear = inferred.year;
        yearCertainty = inferred.certainty * (ref.known ? 1 : 0.8);
        addRule(draft, inferred.rule);
        if (!ref.known) addRule(draft, 'year:no-captured-at');
      }
    }
    if (resolvedYear !== undefined) {
      draft.date = {
        ymd: { year: resolvedYear, month, day },
        confidence: fieldConfidence(
          date.hit.certainty * date.ambiguity * yearCertainty,
          lineConf(date.hit.line),
        ),
      };
      addRule(draft, date.hit.rule);
    }
  }

  // ── 通用提取：时间（开场 / 开演 / 出发 / 到达）
  const time = pickTime(ctx.times, type, lineConf);
  // 无标签的时间和活动日期在同一行（「2026-11-09 19:30」）：基本可以确定就是活动时间
  if (time && time.hit.value.role === 'unknown' && date && time.hit.line === date.hit.line) {
    time.hit = { ...time.hit, certainty: Math.max(time.hit.certainty, 0.92) };
    time.factor = 1;
    addRule(draft, 'time:same-line-as-date');
  }
  const firstOfRole = (role: TimeRole) => ctx.times.find((t) => t.value.role === role);
  const doors = type === 'movie' ? undefined : firstOfRole('doors');
  const departure = firstOfRole('departure');
  const arrival = firstOfRole('arrival');
  const consistency = consistencyFactors({
    ...(doors ? { doors: doors.value } : {}),
    ...(time ? { event: time.hit.value } : {}),
    ...(departure ? { departure: departure.value } : {}),
    ...(arrival ? { arrival: arrival.value } : {}),
  });
  for (const r of consistency.rules) addRule(draft, r);
  if (time) {
    const roleFactor =
      time.hit.value.role === 'departure' ? consistency.departure : consistency.event;
    draft.time = {
      hour: time.hit.value.hour,
      minute: time.hit.value.minute,
      confidence: fieldConfidence(
        time.hit.certainty,
        lineConf(time.hit.line),
        time.factor * roleFactor,
      ),
    };
    addRule(draft, `time:${time.hit.value.role}`);
  }
  if (doors && (type === 'concert' || type === 'theater' || type === 'other')) {
    setDetail(
      draft,
      'doorsAt',
      formatTime(doors.value.hour, doors.value.minute),
      fieldConfidence(doors.certainty, lineConf(doors.line), consistency.doors),
      'time:doors',
    );
  }

  // ── 通用提取：座位 / 车厢
  const seat = pickSeat(ctx.seats, lineConf);
  if (seat?.hit.value.seat) {
    draft.seat = {
      value: seat.hit.value.seat,
      confidence: fieldConfidence(seat.hit.certainty, lineConf(seat.hit.line)),
    };
    addRule(draft, seat.hit.rule);
  }

  // ── 通用提取：价格
  const price = pickPrice(ctx.prices, lineConf);
  if (price) {
    draft.price = {
      value: price.hit.value,
      confidence: fieldConfidence(price.hit.certainty, lineConf(price.hit.line)),
    };
    addRule(draft, price.hit.rule);
  }

  // ── 通用提取：场馆
  const venue = extractVenue(content, draft.usedLines);
  if (venue) {
    draft.venue = {
      value: venue.value,
      confidence: fieldConfidence(venue.certainty, lineConf(venue.line)),
    };
    draft.usedLines.add(venue.line);
    addRule(draft, venue.rule);
  }

  // ── 票型专用规则
  switch (type) {
    case 'train':
      applyTrainRules(ctx, draft);
      break;
    case 'flight':
      applyBoardingPassRules(ctx, draft, bcbp);
      break;
    case 'movie':
      applyCinemaRules(ctx, draft);
      break;
    default:
      applyEventRules(ctx, draft);
  }

  // ── 标题兜底：通用启发式，置信度封顶
  if (!draft.title) {
    const t = genericTitle(content, draft.usedLines);
    if (t) {
      draft.title = { value: t.value, confidence: fieldConfidence(t.certainty, lineConf(t.line)) };
      addRule(draft, t.rule);
    }
  }
  if (draft.title?.rule === 'title:generic') {
    draft.title.confidence = Math.min(
      draft.title.confidence,
      RECOGNIZE_CONFIG.genericTitleMaxConfidence,
    );
  }

  inferRegion(draft, lang, type);

  // ── 敏感信息
  const sensitive = new Set<SensitiveKind>(sens.kinds);
  if (hints.barcode) sensitive.add('barcode');
  if (bcbp?.passengerName) sensitive.add('name');
  if (bcbp?.legs[0]?.pnr) sensitive.add('booking_ref');

  return {
    result: buildResult(draft, type, lang, sensitive),
    ocrQuality: ocrQuality(lines),
    matchedRules: draft.matchedRules,
    ...(draft.barcodeFields.length ? { barcodeFields: draft.barcodeFields } : {}),
    typeConfidence: cls.confidence,
  };
}

function buildResult(
  draft: Draft,
  type: TicketType,
  language: string,
  sensitive: Set<SensitiveKind>,
): Partial<RecognitionResult> {
  const strip = <T>(f: (Field<T> & { rule?: string }) | undefined): Field<T> | undefined =>
    f ? { value: f.value, confidence: round2(f.confidence) } : undefined;

  const result: Partial<RecognitionResult> = {
    type,
    language,
    details: draft.details,
    sensitive: [...sensitive],
  };
  const title = strip(draft.title);
  if (title) result.title = title;
  const subtitle = strip(draft.subtitle);
  if (subtitle) result.subtitle = subtitle;

  if (draft.date) {
    const d = formatDate(draft.date.ymd);
    result.eventAt = draft.time
      ? {
          value: `${d}T${formatTime(draft.time.hour, draft.time.minute)}`,
          confidence: combineConfidence(draft.date.confidence, draft.time.confidence),
        }
      : { value: d, confidence: round2(draft.date.confidence) };
  }

  for (const key of ['venue', 'city', 'country', 'timezone', 'seat'] as const) {
    const f = strip(draft[key]);
    if (f) result[key] = f;
  }
  if (draft.price)
    result.price = { value: draft.price.value, confidence: round2(draft.price.confidence) };
  return result;
}

// ───────────────────────────── 下一步决策 / 云端合并 ─────────────────────────────

export type NextStep = 'done' | 'cloud-text' | 'cloud-image' | 'manual';

export type DecisionContext = {
  online: boolean;
  /** 本月剩余 AI 次数 */
  quotaLeft: number;
  platform: 'ios' | 'android' | 'web';
};

const isPresent = <T>(f: Field<T> | undefined): f is Field<T> =>
  f !== undefined && (typeof f.value !== 'string' || f.value.trim() !== '');

/** title 和 eventAt 都有，并且置信度都 ≥ 阈值 */
export function isComplete(r: Partial<RecognitionResult>, threshold: number): boolean {
  return (
    isPresent(r.title) &&
    isPresent(r.eventAt) &&
    r.title.confidence >= threshold &&
    r.eventAt.confidence >= threshold
  );
}

/**
 * 三级识别的分流（02-architecture §6.1）：
 * 本地够用 → done；离线或没有额度 → manual（显示本地结果让用户补）；
 * OCR 文字质量够、而且不是 Web 端 → cloud-text；否则 → cloud-image。
 */
export function decideNextStep(local: LocalRecognition, ctx: DecisionContext): NextStep {
  if (isComplete(local.result, RECOGNIZE_CONFIG.localDoneConfidence)) return 'done';
  if (!ctx.online || ctx.quotaLeft <= 0) return 'manual';
  if (ctx.platform === 'web' || local.ocrQuality < RECOGNIZE_CONFIG.ocrQualityMin) {
    return 'cloud-image';
  }
  return 'cloud-text';
}

/** 云端文字模式返回的 title 或 eventAt 缺失 / 置信度 < 0.5 → 升级到图片模式（同一 jobId 只扣 1 次额度） */
export function shouldEscalateToImage(cloud: RecognitionResult | null | undefined): boolean {
  if (!cloud) return true;
  const min = RECOGNIZE_CONFIG.cloudEscalateBelow;
  return (
    !isPresent(cloud.title) ||
    !isPresent(cloud.eventAt) ||
    cloud.title.confidence < min ||
    cloud.eventAt.confidence < min
  );
}

/**
 * 文字模式发送前去掉敏感行（02-architecture §6.6）：
 * 予約番号 / 受付番号 / 订单号 / Booking / お名前 / 会員番号 等标签所在的行（标签单独一行时连同下一行），
 * 以及含 10 位以上连续数字的行。条码内容本来就不在 OCR 行里，也从不发送。
 */
export function stripSensitiveLines(lines: readonly OcrLine[]): OcrLine[] {
  const { indices } = findSensitiveLines(lines.map((l) => normalizeText(l.text)));
  return lines.filter((_, i) => !indices.has(i));
}

function pickField<T>(
  key: string,
  local: Field<T> | undefined,
  cloud: Field<T> | undefined,
  barcode: ReadonlySet<string>,
): Field<T> | undefined {
  if (barcode.has(key) && isPresent(local)) return local;
  if (!isPresent(local)) return isPresent(cloud) ? cloud : undefined;
  if (!isPresent(cloud)) return local;
  // 同分时本地优先（本地结果可以追溯到规则，也省得界面闪动）
  return cloud.confidence > local.confidence ? cloud : local;
}

function mergeEventAt(
  local: Field<string> | undefined,
  cloud: Field<string> | undefined,
  barcodeDate: boolean,
): Field<string> | undefined {
  if (!barcodeDate || !isPresent(local)) return pickField('eventAt', local, cloud, new Set());
  // 日期来自条码：日期部分以条码为准，时间部分可以用云端补
  if (!isPresent(cloud) || cloud.value.slice(0, 10) !== local.value.slice(0, 10)) return local;
  const localHasTime = local.value.length > 10;
  const cloudHasTime = cloud.value.length > 10;
  if (!localHasTime && cloudHasTime) return cloud;
  if (localHasTime && cloudHasTime && cloud.confidence > local.confidence) return cloud;
  return local;
}

/**
 * 合并本地和云端结果：逐个字段取置信度更高的；条码解析出的字段（barcodeFields）永远优先。
 * 票型以云端为准（除非来自条码）；票型变了时丢弃本地的 details（字段含义不同）。
 */
export function mergeResults(local: LocalRecognition, cloud: RecognitionResult): RecognitionResult {
  const barcode = new Set(local.barcodeFields ?? []);
  const l = local.result;
  const type = barcode.has('type') && l.type ? l.type : cloud.type;
  const sameType = l.type === type;

  const details: Record<string, Field<string>> = {};
  const keys = new Set([
    ...Object.keys(cloud.details),
    ...(sameType ? Object.keys(l.details ?? {}) : []),
  ]);
  for (const k of keys) {
    const f = pickField(
      `details.${k}`,
      sameType ? l.details?.[k] : undefined,
      cloud.details[k],
      barcode,
    );
    if (f) details[k] = f;
  }
  // 条码字段即使票型变了也保留
  for (const k of Object.keys(l.details ?? {})) {
    const f = l.details?.[k];
    if (barcode.has(`details.${k}`) && f) details[k] = f;
  }

  const merged: RecognitionResult = {
    type,
    title: pickField('title', l.title, cloud.title, barcode) ?? { value: '', confidence: 0 },
    eventAt: mergeEventAt(l.eventAt, cloud.eventAt, barcode.has('eventAt.date')) ?? {
      value: '',
      confidence: 0,
    },
    details,
    language: cloud.language || l.language || 'und',
    sensitive: [...new Set([...(l.sensitive ?? []), ...cloud.sensitive])],
  };
  for (const key of ['subtitle', 'timezone', 'venue', 'city', 'country', 'seat'] as const) {
    const f = pickField(key, l[key], cloud[key], barcode);
    if (f) merged[key] = f;
  }
  const price = pickField('price', l.price, cloud.price, barcode);
  if (price) merged.price = price;
  if (cloud.hasFoil !== undefined) merged.hasFoil = cloud.hasFoil;
  return merged;
}
