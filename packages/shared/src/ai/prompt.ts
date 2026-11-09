import { z } from 'zod';
import { RecognitionResult } from '../recognition';
import { stripSensitiveLines } from '../recognize/pipeline';
import type { OcrLine, RecognizeHints } from '../recognize/types';
import type { TicketType } from '../ticket';

/**
 * 发给大模型的提示信息。⚠️ 故意不包含 barcode：条码内容从不发送到云端（OCR-05、§6.6）。
 */
export type AiHints = {
  capturedAt?: string;
  locale?: string;
  /** 本地规则判断的票型（仅供参考） */
  typeHint?: TicketType;
};

/** RecognizeHints → AiHints（去掉条码） */
export function toAiHints(hints: RecognizeHints, typeHint?: TicketType): AiHints {
  return {
    ...(hints.capturedAt ? { capturedAt: hints.capturedAt } : {}),
    ...(hints.locale ? { locale: hints.locale } : {}),
    ...(typeHint ? { typeHint } : {}),
  };
}

/**
 * 系统提示词（英文）。改动后必须跑「本地 + 文字模式」和「图片模式」两条路径的评测（03-development §6）。
 * 新增票型时在这里补充说明（03-development §5.1 第 4 步）。
 */
export const SYSTEM_PROMPT = `You extract structured data from a photographed paper ticket (or its OCR text) for a ticket-stub collection app.

Return ONLY a JSON object that matches the provided JSON Schema. Never invent values: if a field is not printed on the ticket (or cannot be inferred with good certainty from what is printed), omit it (optional fields) or return an empty string with confidence 0 (required fields "title" and "eventAt").

## Ticket types ("type")
- flight: boarding passes. details: airline (IATA 2-letter), flightNo (e.g. "NH123"), from / to (IATA 3-letter airport codes), gate, cabin, boardingTime ("HH:mm"). seat like "12A".
- train: railway tickets (e.g. Japanese JR magnetic tickets, Chinese high-speed rail). details: operator (e.g. "JR東海"), trainName (e.g. "のぞみ 123号", "G1234"), from / to (station names as printed), car (car number only, e.g. "5"), seatClass (指定席 / 自由席 / グリーン / 二等座 …). title: "<trainName> <from>→<to>" or "<from>→<to>".
- movie: cinema tickets. title = film title (without format markers). details: cinema, screen, format (IMAX / 4DX / 字幕 / 吹替 …). venue = cinema name.
- concert: live music. title = artist and/or tour name as printed. details: artist, tour, doorsAt ("HH:mm", 開場 / 开场 / OPEN / DOORS), entryNo (整理番号 / 入场序号).
- theater: plays, musicals, kabuki, etc. details: company, doorsAt.
- sports: details: home, away, competition, stand. title: "<home> vs <away>" when applicable.
- exhibition: museums and exhibitions. details: museum, validUntil ("YYYY-MM-DD").
- other: anything else; details may contain any short key/value pairs.

## Field rules
- eventAt: ISO 8601 LOCAL time WITHOUT timezone offset: "YYYY-MM-DDTHH:mm", or "YYYY-MM-DD" if no time is printed. Use the start time (開演 / 开演 / START / showtime / departure), not the doors time. For trains and flights use the departure time.
- If the year is not printed, infer it from capturedAt: prefer the most recent past date; a date up to about one month in the future is plausible for transport tickets. Lower the confidence when you infer the year.
- Japanese era years: 令和N年 = 2018+N, 平成N年 = 1988+N.
- timezone: IANA name inferred from venue, city, station or airport (e.g. "Asia/Tokyo"). country: ISO 3166-1 alpha-2.
- seat: as printed, compact (e.g. "1階 Bブロック 3列 15番", "3排5号", "Sec 101 Row 5 Seat 12", "12A"). For trains put the car number in details.car, not in seat.
- price: { amount: number, currency: ISO 4217 }. "¥" is JPY on Japanese tickets and CNY on Chinese tickets. Use the ticket price, not fees.
- language: BCP 47 code of the main language printed on the ticket ("ja", "zh", "en", "ko" …).
- hasFoil (image mode only): true if the ticket visibly has holographic or metallic foil areas.
- Normalize full-width digits and letters to half-width. Keep names (titles, venues, stations) in their original script; do not translate.

## Confidence
Every field has "confidence" in [0, 1]: 0.9+ = clearly printed and unambiguous; 0.6–0.9 = readable but some interpretation (e.g. inferred year, guessed title among several large lines); below 0.5 = a guess. Be calibrated: a wrong value with high confidence is worse than a low-confidence one.

## Sensitive information
Set "sensitive" to the kinds present on the ticket: "name" (a person's name), "booking_ref" (booking / order / reservation / member numbers), "barcode" (any barcode or QR code). Do NOT copy names, booking numbers or barcode contents into any other field.`;

/** OCR 行格式化：「[03] x=0.08 y=0.12 w=0.60 h=0.045 conf=0.97 | 文字」（坐标帮助模型理解版式和字号） */
export function formatOcrLines(lines: readonly OcrLine[]): string {
  const f = (n: number) => n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return lines
    .map((l, i) => {
      const [x, y, w, h] = l.box;
      const idx = String(i).padStart(2, '0');
      return `[${idx}] x=${f(x)} y=${f(y)} w=${f(w)} h=${f(h)} conf=${l.confidence.toFixed(2)} | ${l.text}`;
    })
    .join('\n');
}

function hintsBlock(hints: AiHints): string {
  const rows = [
    hints.capturedAt ? `capturedAt: ${hints.capturedAt}` : 'capturedAt: unknown',
    hints.locale ? `userLocale: ${hints.locale}` : null,
    hints.typeHint ? `localTypeGuess (may be wrong): ${hints.typeHint}` : null,
  ];
  return rows.filter(Boolean).join('\n');
}

/**
 * 文字模式的用户消息。会再做一次 stripSensitiveLines（调用方忘了去敏时的保险）。
 * box 是相对坐标 0..1，h 越大字号越大，通常标题字号最大。
 */
export function buildTextPrompt(lines: readonly OcrLine[], hints: AiHints = {}): string {
  const safe = stripSensitiveLines(lines);
  return `Context:
${hintsBlock(hints)}

OCR lines of one ticket (reading order; x, y, w, h are relative to the ticket image, 0..1; larger h = larger font; some sensitive lines were removed):
${formatOcrLines(safe)}

Extract the ticket fields as JSON.`;
}

/** 图片模式的用户消息（图片本身作为另一个 part 发送） */
export function buildImagePrompt(hints: AiHints = {}): string {
  return `Context:
${hintsBlock(hints)}

The attached image is one ticket, already cropped and perspective-corrected. Extract the ticket fields as JSON. Also decide "hasFoil".`;
}

/** RecognitionResult 的 JSON Schema（作为结构化输出的 schema 发给大模型） */
export function toJsonSchema() {
  return z.toJSONSchema(RecognitionResult);
}
