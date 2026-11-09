import {
  DEFAULT_TEMPLATE_BY_TYPE,
  type MaterialName,
  TEMPLATES,
  type TicketSpec,
} from '@mogiri/renderer';
import { DEFAULT_MATERIAL, type TicketType } from '@mogiri/shared';
import type { TicketRecord } from '../data';

const CURRENCY_SYMBOL: Record<string, string> = {
  JPY: '¥',
  CNY: 'CN¥',
  USD: '$',
  EUR: '€',
  KRW: '₩',
  GBP: '£',
};

export function formatPriceField(
  amount: number | undefined,
  currency: string | undefined,
  templateId: string,
): string {
  if (amount === undefined || Number.isNaN(amount)) return '';
  const formatted = amount.toLocaleString('en-US');
  // JR 模板本身已经带有 prefix: '¥'
  if (templateId === 'jr-magnetic-v1') return formatted;
  const cur = (currency ?? 'JPY').toUpperCase();
  const sym = CURRENCY_SYMBOL[cur] ?? `${cur} `;
  return `${sym}${formatted}`;
}

export function defaultTemplateForType(type: TicketType): string {
  return DEFAULT_TEMPLATE_BY_TYPE[type] ?? 'generic-stub-v1';
}

export function defaultMaterialForType(type: TicketType): MaterialName {
  return DEFAULT_MATERIAL[type] ?? 'paper';
}

/**
 * 把持久化层 TicketRecord 转换为渲染引擎需要的 TicketSpec（见 04-handoff §2.2）。
 * renderer 包完全独立，不直接依赖 TicketRecord。
 */
export function toTicketSpec(
  ticket: TicketRecord,
  images?: {
    faceImage?: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;
    backImage?: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;
  },
): TicketSpec {
  const templateId = TEMPLATES[ticket.templateId]
    ? ticket.templateId
    : defaultTemplateForType(ticket.type);

  const fields: Record<string, string> = {
    title: ticket.title,
    eventAt: ticket.eventAt,
    barcode: ticket.details.barcode ?? `mogiri:${ticket.id}`,
  };

  if (ticket.subtitle) fields.subtitle = ticket.subtitle;
  if (ticket.venueName) fields.venue = ticket.venueName;
  if (ticket.city) fields.city = ticket.city;
  if (ticket.seat) fields.seat = ticket.seat;

  const priceStr = formatPriceField(ticket.priceAmount, ticket.priceCurrency, templateId);
  if (priceStr) fields.price = priceStr;

  for (const [k, v] of Object.entries(ticket.details)) {
    if (v !== undefined && v !== '') {
      fields[`details.${k}`] = v;
    }
  }

  // JR 车票如果没有单独填 details.kind，可以把 subtitle 作为票种抬头
  if (templateId === 'jr-magnetic-v1' && !fields['details.kind'] && ticket.subtitle) {
    fields['details.kind'] = ticket.subtitle;
  }

  return {
    id: ticket.id,
    templateId,
    material: ticket.material,
    fields,
    ...(images?.faceImage ? { faceImage: images.faceImage } : {}),
    ...(images?.backImage ? { backImage: images.backImage } : {}),
    ...(ticket.sizeMm ? { sizeMm: ticket.sizeMm } : {}),
    wear: {
      torn: ticket.wear.torn,
      punches: ticket.wear.punches,
      age: ticket.wear.age,
    },
  };
}
