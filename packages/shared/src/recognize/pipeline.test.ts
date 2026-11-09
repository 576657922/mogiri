import { describe, expect, it } from 'vitest';
import { BCBP_SAMPLES } from '../bcbp/samples';
import type { RecognitionResult } from '../recognition';
import {
  decideNextStep,
  mergeResults,
  ocrQuality,
  recognizeLocal,
  shouldEscalateToImage,
  stripSensitiveLines,
} from './pipeline';
import { lines } from './test-utils';
import type { LocalRecognition } from './types';

const online = { online: true, quotaLeft: 5, platform: 'ios' as const };

const cloud = (over: Partial<RecognitionResult> = {}): RecognitionResult => ({
  type: 'concert',
  title: { value: 'STELLA NOVA LIVE TOUR 2026', confidence: 0.9 },
  eventAt: { value: '2026-11-09T18:00', confidence: 0.85 },
  details: {},
  language: 'ja',
  sensitive: [],
  ...over,
});

describe('ocrQuality', () => {
  it('按字符数加权的平均置信度', () => {
    expect(
      ocrQuality(
        lines(['2026年11月9日 開演 18:30', 0.05, 0.9], ['東京ドーム 1階 3列 15番', 0.05, 0.8]),
      ),
    ).toBeCloseTo(0.85, 1);
  });
  it('短噪声行影响很小', () => {
    const q = ocrQuality(lines(['LIVE TOUR 2026 AURORA STELLA', 0.05, 0.95], ['・', 0.02, 0.1]));
    expect(q).toBeGreaterThan(0.9);
  });
  it('有效字符不足 15 个时一定低于阈值', () => {
    expect(ocrQuality(lines(['TICKET 123', 0.05, 1]))).toBeLessThan(0.6);
    expect(ocrQuality([])).toBe(0);
  });
});

describe('decideNextStep', () => {
  const local = (title: number, eventAt: number, q = 0.9): LocalRecognition => ({
    result: {
      title: { value: 'X', confidence: title },
      eventAt: { value: '2026-11-09', confidence: eventAt },
    },
    ocrQuality: q,
    matchedRules: [],
  });

  it('title 和 eventAt 都 ≥ 0.8 → done（离线也一样）', () => {
    expect(decideNextStep(local(0.8, 0.9), online)).toBe('done');
    expect(decideNextStep(local(0.8, 0.9), { ...online, online: false })).toBe('done');
  });
  it('离线或没有额度 → manual', () => {
    expect(decideNextStep(local(0.5, 0.9), { ...online, online: false })).toBe('manual');
    expect(decideNextStep(local(0.5, 0.9), { ...online, quotaLeft: 0 })).toBe('manual');
  });
  it('文字质量够 → cloud-text；不够或 Web → cloud-image', () => {
    expect(decideNextStep(local(0.5, 0.9, 0.6), online)).toBe('cloud-text');
    expect(decideNextStep(local(0.5, 0.9, 0.59), online)).toBe('cloud-image');
    expect(decideNextStep(local(0.5, 0.9), { ...online, platform: 'web' })).toBe('cloud-image');
  });
  it('缺字段 → 不是 done', () => {
    expect(decideNextStep({ result: {}, ocrQuality: 0.9, matchedRules: [] }, online)).toBe(
      'cloud-text',
    );
  });
});

describe('shouldEscalateToImage', () => {
  it('title / eventAt 缺失或 < 0.5 时升级', () => {
    expect(shouldEscalateToImage(cloud())).toBe(false);
    expect(shouldEscalateToImage(cloud({ title: { value: '', confidence: 0 } }))).toBe(true);
    expect(
      shouldEscalateToImage(cloud({ eventAt: { value: '2026-11-09', confidence: 0.49 } })),
    ).toBe(true);
    expect(shouldEscalateToImage(null)).toBe(true);
  });
});

describe('stripSensitiveLines', () => {
  it('去掉敏感行（标签单独一行时连同下一行）和 10 位以上数字', () => {
    const input = lines(
      'STELLA NOVA',
      '予約番号',
      'QX7T2P',
      'お名前 山田 花子',
      '2026年11月9日',
      'No. 12345678901',
      'Booking Ref: X1Y2',
      '整理番号 A123',
    );
    expect(stripSensitiveLines(input).map((l) => l.text)).toEqual([
      'STELLA NOVA',
      '2026年11月9日',
      '整理番号 A123',
    ]);
  });
});

describe('mergeResults', () => {
  it('逐字段取置信度更高的；同分本地优先', () => {
    const local: LocalRecognition = {
      result: {
        type: 'concert',
        title: { value: 'LIVE TOUR 2026', confidence: 0.55 },
        eventAt: { value: '2026-11-09T18:00', confidence: 0.92 },
        seat: { value: '1階 Bブロック 3列 15番', confidence: 0.86 },
        details: { doorsAt: { value: '17:00', confidence: 0.9 } },
        language: 'ja',
        sensitive: ['name'],
      },
      ocrQuality: 0.9,
      matchedRules: [],
    };
    const m = mergeResults(
      local,
      cloud({
        seat: { value: '1F B 3-15', confidence: 0.7 },
        details: {
          artist: { value: 'STELLA NOVA', confidence: 0.9 },
          doorsAt: { value: '17:00', confidence: 0.9 },
        },
        sensitive: ['booking_ref'],
        hasFoil: true,
      }),
    );
    expect(m.title.value).toBe('STELLA NOVA LIVE TOUR 2026');
    expect(m.eventAt).toEqual({ value: '2026-11-09T18:00', confidence: 0.92 });
    expect(m.seat?.value).toBe('1階 Bブロック 3列 15番');
    expect(m.details.artist?.value).toBe('STELLA NOVA');
    expect(m.sensitive.sort()).toEqual(['booking_ref', 'name']);
    expect(m.hasFoil).toBe(true);
  });

  it('条码字段永远优先；条码日期 + 云端时间', () => {
    const local = recognizeLocal(lines('BOARDING PASS'), {
      capturedAt: '2026-11-10T12:00:00+09:00',
      barcode: { format: 'PDF_417', text: BCBP_SAMPLES.withConditional },
    });
    expect(local.result.eventAt?.value).toBe('2026-11-09');
    const m = mergeResults(
      local,
      cloud({
        type: 'flight',
        title: { value: 'NH 061 Tokyo → Sapporo', confidence: 0.99 },
        eventAt: { value: '2026-11-09T07:30', confidence: 0.8 },
        seat: { value: '23A', confidence: 0.99 },
        details: {
          flightNo: { value: 'NH061', confidence: 0.99 },
          gate: { value: '8', confidence: 0.7 },
        },
      }),
    );
    expect(m.title.value).toBe('NH61 HND→CTS');
    expect(m.seat?.value).toBe('23K');
    expect(m.details.flightNo?.value).toBe('NH61');
    expect(m.details.gate?.value).toBe('8');
    expect(m.eventAt.value).toBe('2026-11-09T07:30');

    // 云端日期和条码不一致 → 保留条码日期
    const m2 = mergeResults(
      local,
      cloud({ type: 'flight', eventAt: { value: '2026-11-10T07:30', confidence: 0.95 } }),
    );
    expect(m2.eventAt.value).toBe('2026-11-09');
  });

  it('票型变了时丢弃本地 details', () => {
    const local: LocalRecognition = {
      result: { type: 'concert', details: { entryNo: { value: 'A1', confidence: 0.9 } } },
      ocrQuality: 0.9,
      matchedRules: [],
    };
    const m = mergeResults(local, cloud({ type: 'theater' }));
    expect(m.type).toBe('theater');
    expect(m.details.entryNo).toBeUndefined();
  });
});

describe('recognizeLocal（边界情况）', () => {
  it('没有 capturedAt 时用当天推断年份，并降低置信度', () => {
    const input = lines(['乗車券', 0.06], ['東京 → 新大阪', 0.1], '11月9日(月)');
    const withRef = recognizeLocal(input, { capturedAt: '2026-11-10T00:00:00+09:00' });
    const noRef = recognizeLocal(input);
    expect(withRef.result.eventAt?.value).toBe('2026-11-09');
    expect(noRef.matchedRules).toContain('year:no-captured-at');
    expect(noRef.result.eventAt?.confidence ?? 1).toBeLessThan(
      withRef.result.eventAt?.confidence ?? 0,
    );
  });

  it('星期帮助推断年份', () => {
    // 2025-11-09 是星期日：在 2026-11-20 扫描、印着(日) → 2025 年
    const r = recognizeLocal(lines('乗車券', '東京 → 新大阪', '11月9日(日)'), {
      capturedAt: '2026-11-20T00:00:00+09:00',
    });
    expect(r.result.eventAt?.value).toBe('2025-11-09');
    expect(r.matchedRules).toContain('year:weekday');
  });

  it('非条码字段的置信度永远 < 1', () => {
    const r = recognizeLocal(
      lines(
        ['乗車券・新幹線特急券', 0.06, 1],
        ['東京 → 新大阪', 0.1, 1],
        ['11月9日(18:30発)', 0.05, 1],
        ['のぞみ 1号 1号車 1番A席', 0.05, 1],
      ),
      { capturedAt: '2026-11-10' },
    );
    const fields = [
      r.result.title,
      r.result.eventAt,
      r.result.seat,
      ...Object.values(r.result.details ?? {}),
    ];
    for (const f of fields) expect(f?.confidence ?? 0).toBeLessThan(1);
    expect(r.barcodeFields).toBeUndefined();
  });

  it('空输入不会抛错', () => {
    const r = recognizeLocal([]);
    expect(r.result.type).toBe('other');
    expect(r.ocrQuality).toBe(0);
    expect(decideNextStep(r, online)).toBe('cloud-image');
  });
});
