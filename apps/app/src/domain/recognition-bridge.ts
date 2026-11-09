import type { RecognitionResult } from '@mogiri/shared';
import { RECOGNIZE_CONFIG } from '@mogiri/shared/recognize';
import type { TicketCreateInput, TicketSource } from '../data';
import { getDefaultTimezone } from '../platform';
import { defaultMaterialForType, defaultTemplateForType } from './ticket-spec';

export type RecognitionDraft = {
  input: TicketCreateInput;
  /** 每个字段的置信度（0..1），低于 0.8 的字段在确认页高亮提示用户检查（OCR-04） */
  confidences: Record<string, number>;
  lowConfidenceKeys: string[];
};

const LOW_CONF_THRESHOLD = RECOGNIZE_CONFIG.localDoneConfidence;

/**
 * 把识别引擎输出的 Partial<RecognitionResult> 转换为可编辑的票据草稿与字段置信度表。
 */
export function recognitionToTicketDraft(
  rec: Partial<RecognitionResult>,
  source: TicketSource = 'local',
  fallbackDate = '2026-11-09',
): RecognitionDraft {
  const type = rec.type ?? 'other';
  const confidences: Record<string, number> = {};

  const pick = (
    key: string,
    field: { value: string; confidence: number } | undefined,
  ): string | undefined => {
    if (!field?.value) return undefined;
    confidences[key] = field.confidence;
    return field.value;
  };

  const title = pick('title', rec.title) ?? 'Untitled Ticket';
  if (!rec.title) confidences.title = 0;

  const eventAt = pick('eventAt', rec.eventAt) ?? fallbackDate;
  if (!rec.eventAt) confidences.eventAt = 0;

  const subtitle = pick('subtitle', rec.subtitle);
  const venueName = pick('venueName', rec.venue);
  const city = pick('city', rec.city);
  const country = pick('country', rec.country);
  const seat = pick('seat', rec.seat);
  const eventTz = pick('eventTz', rec.timezone) ?? getDefaultTimezone();

  let priceAmount: number | undefined;
  let priceCurrency: string | undefined;
  if (rec.price) {
    priceAmount = rec.price.value.amount;
    priceCurrency = rec.price.value.currency;
    confidences.price = rec.price.confidence;
  }

  const details: Record<string, string> = {};
  if (rec.details) {
    for (const [k, f] of Object.entries(rec.details)) {
      if (f?.value) {
        details[k] = f.value;
        confidences[`details.${k}`] = f.confidence;
      }
    }
  }

  const lowConfidenceKeys = Object.entries(confidences)
    .filter(([, conf]) => conf < LOW_CONF_THRESHOLD)
    .map(([key]) => key);

  const input: TicketCreateInput = {
    type,
    title,
    ...(subtitle ? { subtitle } : {}),
    eventAt,
    eventTz,
    ...(venueName ? { venueName } : {}),
    ...(city ? { city } : {}),
    ...(country ? { country } : {}),
    ...(seat ? { seat } : {}),
    ...(priceAmount !== undefined ? { priceAmount } : {}),
    ...(priceCurrency ? { priceCurrency } : {}),
    details,
    material: rec.hasFoil ? 'foil-holo' : defaultMaterialForType(type),
    templateId: defaultTemplateForType(type),
    source,
    tags: [],
    companions: [],
    status: 'active',
  };

  return { input, confidences, lowConfidenceKeys };
}
