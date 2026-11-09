import { z } from 'zod';
import { TicketType } from './ticket';

/** 带置信度的字段 */
export const Field = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    confidence: z.number().min(0).max(1),
  });
export type Field<T> = { value: T; confidence: number };

export const SENSITIVE_KINDS = ['name', 'booking_ref', 'barcode'] as const;

/**
 * 识别结果。本地规则解析器、云端文字模式、云端图片模式都输出这个结构
 * （同时作为大模型结构化输出的 JSON Schema）。见 02-architecture §6.6。
 */
export const RecognitionResult = z.object({
  type: TicketType,
  title: Field(z.string()),
  subtitle: Field(z.string()).optional(),
  /** ISO 8601 本地时间（不带时区），例如 2026-11-09T18:30；只有日期时为 2026-11-09 */
  eventAt: Field(z.string()),
  /** IANA 时区 */
  timezone: Field(z.string()).optional(),
  venue: Field(z.string()).optional(),
  city: Field(z.string()).optional(),
  /** ISO 3166-1 alpha-2 */
  country: Field(z.string()).optional(),
  seat: Field(z.string()).optional(),
  price: Field(z.object({ amount: z.number(), currency: z.string() })).optional(),
  details: z.record(z.string(), Field(z.string())),
  language: z.string(),
  /** 只有图片模式能判断；本地和文字模式不输出，用票型模板默认值 */
  hasFoil: z.boolean().optional(),
  sensitive: z.array(z.enum(SENSITIVE_KINDS)),
});
export type RecognitionResult = z.infer<typeof RecognitionResult>;

/** 识别路径 */
export const RecognitionSource = z.enum(['local', 'cloud-text', 'cloud-image']);
export type RecognitionSource = z.infer<typeof RecognitionSource>;
