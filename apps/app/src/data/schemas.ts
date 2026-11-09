import { Material, TicketType } from '@mogiri/shared';
import { z } from 'zod';

/** 磨损与使用痕迹 */
export const WearSchema = z.object({
  torn: z.boolean(),
  punches: z.array(z.object({ x: z.number(), y: z.number() })),
  age: z.number().min(0).max(1),
});
export type WearData = z.infer<typeof WearSchema>;

export const TicketStatusSchema = z.enum(['draft', 'active', 'deleted']);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const TicketSourceSchema = z.enum(['manual', 'local', 'cloud-text', 'cloud-image']);
export type TicketSource = z.infer<typeof TicketSourceSchema>;

/**
 * 本地与同步票据记录结构（见 02-architecture §7.1、§8.1）。
 * 注意：eventAt 保存活动当地时间字符串（YYYY-MM-DD 或 YYYY-MM-DDTHH:mm），
 * eventTz 保存 IANA 时区（如 Asia/Tokyo），禁止用 new Date(eventAt) 直接解析。
 */
export const TicketRecordSchema = z.object({
  id: z.string().min(1),
  type: TicketType,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  eventAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/),
  eventTz: z.string().min(1),
  endAt: z.string().optional(),
  venueName: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  seat: z.string().optional(),
  priceAmount: z.number().optional(),
  priceCurrency: z.string().optional(),
  details: z.record(z.string(), z.string()),
  material: Material,
  templateId: z.string().min(1),
  wear: WearSchema,
  source: TicketSourceSchema,
  scanFrontKey: z.string().optional(),
  scanBackKey: z.string().optional(),
  thumbKey: z.string().optional(),
  thumbDataUrl: z.string().optional(),
  sizeMm: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
  note: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()),
  companions: z.array(z.string()),
  status: TicketStatusSchema,
  clientUpdatedAt: z.string(),
  serverSeq: z.number().int().nonnegative(),
  deletedAt: z.string().optional(),
});
export type TicketRecord = z.infer<typeof TicketRecordSchema>;

export const TicketCreateInputSchema = TicketRecordSchema.omit({
  id: true,
  clientUpdatedAt: true,
  serverSeq: true,
}).partial({
  wear: true,
  source: true,
  tags: true,
  companions: true,
  status: true,
  details: true,
});
export type TicketCreateInput = z.infer<typeof TicketCreateInputSchema>;

export const TicketPatchSchema = TicketRecordSchema.omit({
  id: true,
  clientUpdatedAt: true,
  serverSeq: true,
}).partial();
export type TicketPatch = z.infer<typeof TicketPatchSchema>;

/** 附加照片 / 短视频记录（见 02-architecture §7.1） */
export const MediaRecordSchema = z.object({
  id: z.string().min(1),
  ticketId: z.string().min(1),
  kind: z.enum(['photo', 'video']),
  blobKey: z.string().min(1),
  dataUrl: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().optional(),
  takenAt: z.string().optional(),
  caption: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
  clientUpdatedAt: z.string(),
  serverSeq: z.number().int().nonnegative(),
  deletedAt: z.string().optional(),
});
export type MediaRecord = z.infer<typeof MediaRecordSchema>;

export type BlobRecord = {
  key: string;
  blob: Blob;
  mimeType: string;
  updatedAt: string;
};

export type OutboxRecord = {
  seq?: number;
  entity: 'tickets' | 'media';
  entityId: string;
  op: 'upsert' | 'delete';
  at: string;
};

export type MetaRecord = {
  key: string;
  value: unknown;
};

/** 全量导出 / 导入的 JSON 包格式（过 Zod 校验） */
export const BackupBundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  tickets: z.array(TicketRecordSchema),
  media: z.array(MediaRecordSchema),
});
export type BackupBundle = z.infer<typeof BackupBundleSchema>;
