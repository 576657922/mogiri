import { z } from 'zod';

/** 票型（见 01-requirements §6） */
export const TICKET_TYPES = [
  'flight',
  'train',
  'movie',
  'concert',
  'theater',
  'sports',
  'exhibition',
  'other',
] as const;
export const TicketType = z.enum(TICKET_TYPES);
export type TicketType = z.infer<typeof TicketType>;

/** 材质预设（见 02-architecture §5.1） */
export const MATERIALS = [
  'paper',
  'thermal',
  'cardstock',
  'foil-holo',
  'foil-gold',
  'magnetic',
] as const;
export const Material = z.enum(MATERIALS);
export type Material = z.infer<typeof Material>;

/** 每种票型的扩展字段（存放在 tickets.details） */
export const TicketDetails = {
  flight: z.object({
    airline: z.string().optional(),
    flightNo: z.string().optional(),
    from: z.string().optional(), // IATA 三字码
    to: z.string().optional(),
    gate: z.string().optional(),
    cabin: z.string().optional(),
    boardingTime: z.string().optional(), // HH:mm
  }),
  train: z.object({
    operator: z.string().optional(),
    trainName: z.string().optional(), // 例如「のぞみ 123号」
    from: z.string().optional(),
    to: z.string().optional(),
    car: z.string().optional(),
    seatClass: z.string().optional(), // 指定席 / 自由席 / グリーン …
  }),
  movie: z.object({
    cinema: z.string().optional(),
    screen: z.string().optional(),
    format: z.string().optional(), // IMAX / 4DX …
  }),
  concert: z.object({
    artist: z.string().optional(),
    tour: z.string().optional(),
    doorsAt: z.string().optional(), // 开场时间 HH:mm
    entryNo: z.string().optional(), // 入场序号 / 整理番号
  }),
  theater: z.object({
    company: z.string().optional(),
    doorsAt: z.string().optional(),
  }),
  sports: z.object({
    home: z.string().optional(),
    away: z.string().optional(),
    competition: z.string().optional(),
    stand: z.string().optional(),
  }),
  exhibition: z.object({
    museum: z.string().optional(),
    validUntil: z.string().optional(), // YYYY-MM-DD
  }),
  other: z.record(z.string(), z.string()),
} satisfies Record<TicketType, z.ZodType>;

/** 默认材质（新建票据时使用，用户可以改） */
export const DEFAULT_MATERIAL: Record<TicketType, Material> = {
  flight: 'cardstock',
  train: 'magnetic',
  movie: 'thermal',
  concert: 'foil-holo',
  theater: 'cardstock',
  sports: 'cardstock',
  exhibition: 'paper',
  other: 'paper',
};
