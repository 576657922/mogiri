import type { Field } from '../../recognition';
import type { TicketType } from '../../ticket';
import type { DateHit } from '../extract/date';
import type { PriceHit } from '../extract/price';
import type { RouteHit } from '../extract/route';
import type { SeatHit } from '../extract/seat';
import type { TimeHit } from '../extract/time';
import type { TicketLanguage } from '../lang';
import type { NormLine, RecognizeHints } from '../types';
import type { YMD } from '../year';

/** 通用提取的结果，交给票型专用规则使用 */
export type RuleContext = {
  type: TicketType;
  lines: readonly NormLine[];
  lang: TicketLanguage;
  hints: RecognizeHints;
  /** 拍摄日期（没有 capturedAt 时为当天） */
  refDate: YMD;
  dates: readonly DateHit[];
  times: readonly TimeHit[];
  seats: readonly SeatHit[];
  prices: readonly PriceHit[];
  routes: readonly RouteHit[];
  lineConf: (index: number) => number;
  lineText: (index: number) => string;
};

export type FieldDraft = Field<string> & { rule?: string };

/**
 * 正在组装的识别结果。各字段已经是最终置信度（已乘 OCR 置信度）。
 * 规则可以覆盖通用提取的结果。
 */
export type Draft = {
  title?: FieldDraft;
  subtitle?: FieldDraft;
  date?: { ymd: YMD; confidence: number };
  time?: { hour: number; minute: number; confidence: number };
  venue?: FieldDraft;
  city?: FieldDraft;
  country?: FieldDraft;
  timezone?: FieldDraft;
  seat?: FieldDraft;
  price?: Field<{ amount: number; currency: string }>;
  details: Record<string, Field<string>>;
  matchedRules: string[];
  /** 已经被字段占用的行，不再作为标题候选 */
  usedLines: Set<number>;
  /** 条码字段（见 LocalRecognition.barcodeFields） */
  barcodeFields: string[];
};
