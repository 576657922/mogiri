import { describe, expect, it } from 'vitest';
import { RecognitionResult } from '../recognition';
import { TICKET_TYPES } from '../ticket';
import {
  buildImagePrompt,
  buildTextPrompt,
  clampConfidence,
  formatOcrLines,
  ModelOutputError,
  normalizeLocalIso,
  parseModelOutput,
  SYSTEM_PROMPT,
  toAiHints,
  toJsonSchema,
} from './index';

describe('prompt', () => {
  it('系统提示词覆盖所有票型和关键规则', () => {
    for (const t of TICKET_TYPES) expect(SYSTEM_PROMPT).toContain(`- ${t}:`);
    expect(SYSTEM_PROMPT).toMatch(/Never invent values/);
    expect(SYSTEM_PROMPT).toMatch(/WITHOUT timezone offset/);
    expect(SYSTEM_PROMPT).toMatch(/sensitive/);
  });

  it('文字模式：带坐标格式化，并再次去掉敏感行', () => {
    const p = buildTextPrompt(
      [
        { text: 'STELLA NOVA', box: [0.1, 0.05, 0.5, 0.08], confidence: 0.97 },
        { text: '予約番号 ABC123', box: [0.1, 0.8, 0.4, 0.03], confidence: 0.9 },
        { text: '2026年11月9日', box: [0.1, 0.2, 0.4, 0.04], confidence: 0.95 },
      ],
      { capturedAt: '2026-11-10T09:00:00+09:00', typeHint: 'concert' },
    );
    expect(p).toContain('[00] x=0.1 y=0.05 w=0.5 h=0.08 conf=0.97 | STELLA NOVA');
    expect(p).toContain('2026年11月9日');
    expect(p).not.toContain('ABC123');
    expect(p).toContain('capturedAt: 2026-11-10T09:00:00+09:00');
    expect(p).toContain('localTypeGuess (may be wrong): concert');
  });

  it('提示信息里永远没有条码', () => {
    const hints = toAiHints(
      { capturedAt: '2026-11-10', barcode: { format: 'QR', text: 'SECRET' } },
      'flight',
    );
    expect(hints).toEqual({ capturedAt: '2026-11-10', typeHint: 'flight' });
    expect(buildImagePrompt(hints)).not.toContain('SECRET');
  });

  it('formatOcrLines 编号补零', () => {
    expect(formatOcrLines([{ text: 'A', box: [0, 0, 1, 1], confidence: 1 }])).toBe(
      '[00] x=0 y=0 w=1 h=1 conf=1.00 | A',
    );
  });

  it('JSON Schema', () => {
    const schema = toJsonSchema() as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties ?? {})).toEqual(
      expect.arrayContaining(['type', 'title', 'eventAt', 'details']),
    );
    expect(schema.required).toEqual(
      expect.arrayContaining(['type', 'title', 'eventAt', 'details', 'language', 'sensitive']),
    );
  });
});

describe('parseModelOutput', () => {
  const valid = {
    type: 'concert',
    title: { value: 'STELLA NOVA LIVE TOUR 2026', confidence: 0.92 },
    eventAt: { value: '2026-11-09T18:00', confidence: 0.9 },
    details: { doorsAt: { value: '17:00', confidence: 0.9 } },
    language: 'ja',
    sensitive: ['name'],
  };

  it('合法输出原样通过', () => {
    const r = parseModelOutput(valid);
    expect(RecognitionResult.safeParse(r).success).toBe(true);
    expect(r.title.value).toBe('STELLA NOVA LIVE TOUR 2026');
  });

  it('接受 JSON 字符串和 ```json 代码块', () => {
    expect(parseModelOutput(JSON.stringify(valid)).type).toBe('concert');
    expect(parseModelOutput(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``).type).toBe('concert');
    expect(parseModelOutput(`Here you go: ${JSON.stringify(valid)} hope it helps`).type).toBe(
      'concert',
    );
  });

  it('规范化：置信度、空字符串、eventAt 格式、未知票型、未知敏感类别、价格', () => {
    const r = parseModelOutput({
      type: 'Opera',
      title: { value: '  魔笛  ', confidence: 95 },
      eventAt: { value: '2026-11-09 18:30:00+09:00', confidence: 1.7 },
      venue: { value: '', confidence: 0.9 },
      seat: '1階 3列 15番',
      country: { value: 'jp', confidence: 0.8 },
      price: { value: { amount: '8,800', currency: 'jpy' }, confidence: -1 },
      details: {
        company: { value: '', confidence: 1 },
        conductor: { value: 'X', confidence: 'high' },
      },
      sensitive: ['name', 'credit_card', 'name'],
    });
    expect(r.type).toBe('other');
    expect(r.title).toEqual({ value: '魔笛', confidence: 0.95 });
    expect(r.eventAt).toEqual({ value: '2026-11-09T18:30', confidence: 1 });
    expect(r.venue).toBeUndefined();
    expect(r.seat).toEqual({ value: '1階 3列 15番', confidence: 0.5 });
    expect(r.country?.value).toBe('JP');
    expect(r.price).toEqual({ value: { amount: 8800, currency: 'JPY' }, confidence: 0 });
    expect(r.details).toEqual({ conductor: { value: 'X', confidence: 0.5 } });
    expect(r.sensitive).toEqual(['name']);
    expect(r.language).toBe('und');
  });

  it('缺少必填字段时补空值；无法识别的 eventAt 降低置信度', () => {
    const r = parseModelOutput({
      type: 'movie',
      eventAt: { value: 'next friday', confidence: 0.8 },
    });
    expect(r.title).toEqual({ value: '', confidence: 0 });
    expect(r.eventAt).toEqual({ value: 'next friday', confidence: 0.4 });
  });

  it('无法修复时抛 ModelOutputError', () => {
    expect(() => parseModelOutput('not json')).toThrow(ModelOutputError);
    expect(() => parseModelOutput([1, 2])).toThrow(ModelOutputError);
    expect(() => parseModelOutput(null)).toThrow(ModelOutputError);
  });

  it('工具函数', () => {
    expect(clampConfidence(undefined)).toBe(0.5);
    expect(clampConfidence(80)).toBe(0.8);
    expect(clampConfidence(-0.2)).toBe(0);
    expect(normalizeLocalIso('2026-1-9')).toBe('2026-01-09');
    expect(normalizeLocalIso('2026-11-09T18:30:00Z')).toBe('2026-11-09T18:30');
    expect(normalizeLocalIso('2026-02-30')).toBeNull();
    expect(normalizeLocalIso('2026-11-09T25:00')).toBeNull();
  });
});
