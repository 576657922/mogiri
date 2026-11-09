import { describe, expect, it } from 'vitest';
import {
  bcbpFlightDate,
  bcbpToRecognition,
  looksLikeBcbp,
  normalizeFlightNumber,
  normalizeSeat,
  parseBcbp,
} from './index';
import { BCBP_SAMPLES, buildBcbp } from './samples';

/** 文档里的标准示例（IATA Resolution 792 Implementation Guide） */
const SAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';

describe('parseBcbp', () => {
  it('解析单航段的必填字段', () => {
    const r = parseBcbp(SAMPLE);
    expect(r).not.toBeNull();
    expect(r?.legCount).toBe(1);
    expect(r?.passengerName).toBe('DESMARAIS/LUC');
    expect(r?.electronicTicket).toBe(true);
    expect(r?.legs[0]).toMatchObject({
      pnr: 'ABC123',
      from: 'YUL',
      to: 'FRA',
      carrier: 'AC',
      flightNumber: '834',
      flightNo: 'AC834',
      julianDate: 326,
      compartment: 'J',
      seat: '1A',
      checkInSequence: '25',
      passengerStatus: '1',
    });
    expect(r?.hasSecurityData).toBe(false);
  });

  it('扫描器去掉了末尾空格时也能解析', () => {
    const full = buildBcbp('DOE/JANE', [
      {
        pnr: 'PNR001',
        from: 'NRT',
        to: 'SFO',
        carrier: 'UA',
        flight: '838',
        julian: 120,
        compartment: 'Y',
        seat: '',
        sequence: 0,
      },
    ]);
    expect(full).toHaveLength(60);
    expect(parseBcbp(full)?.legs[0]?.seat).toBeNull();
    expect(parseBcbp(full.slice(0, 58))?.legs[0]?.from).toBe('NRT');
    expect(parseBcbp(`${full}\r\n`)?.legs[0]?.flightNo).toBe('UA838');
  });

  it('解析版本号、签发日期、市场方航司和安全数据', () => {
    const r = parseBcbp(BCBP_SAMPLES.withConditional);
    expect(r?.version).toBe(6);
    expect(r?.issueDate).toEqual({ yearDigit: 6, julianDate: 312 });
    expect(r?.legs[0]?.marketingCarrier).toBe('NH');
    expect(r?.hasSecurityData).toBe(true);
  });

  it('解析多航段', () => {
    const r = parseBcbp(BCBP_SAMPLES.twoLegs);
    expect(r?.legCount).toBe(2);
    expect(r?.legs.map((l) => `${l.flightNo} ${l.from}-${l.to}`)).toEqual([
      'LH401 JFK-FRA',
      'LH1234 FRA-MUC',
    ]);
    expect(r?.legs[1]?.seat).toBe('23C');
  });

  it('拒绝非法输入', () => {
    expect(parseBcbp('')).toBeNull();
    expect(parseBcbp('hello world')).toBeNull();
    expect(parseBcbp(SAMPLE.replace('M1', 'S1'))).toBeNull();
    expect(parseBcbp(SAMPLE.replace('M1', 'M9'))).toBeNull();
    expect(parseBcbp(SAMPLE.replace('YUL', 'Y1L'))).toBeNull();
    expect(parseBcbp(SAMPLE.replace('326', '999'))).toBeNull();
    expect(looksLikeBcbp(SAMPLE)).toBe(true);
    expect(looksLikeBcbp('https://example.com')).toBe(false);
  });
});

describe('normalizers', () => {
  it('航班号去掉前导零', () => {
    expect(normalizeFlightNumber('0834 ')).toBe('834');
    expect(normalizeFlightNumber('0012A')).toBe('12A');
    expect(normalizeFlightNumber(' 5   ')).toBe('5');
  });
  it('座位去掉前导零', () => {
    expect(normalizeSeat('001A')).toBe('1A');
    expect(normalizeSeat('012A')).toBe('12A');
    expect(normalizeSeat('    ')).toBeNull();
    expect(normalizeSeat('INF ')).toBe('INF');
  });
});

describe('bcbpFlightDate', () => {
  const ref = { year: 2026, month: 11, day: 25 };
  it('儒略日 → 最近的过去日期', () => {
    expect(bcbpFlightDate(326, ref)).toEqual({ year: 2026, month: 11, day: 22 });
    // 1 月 5 日扫描 12 月的登机牌 → 去年
    expect(bcbpFlightDate(360, { year: 2027, month: 1, day: 5 })).toEqual({
      year: 2026,
      month: 12,
      day: 26,
    });
  });
  it('允许几天后的航班（提前打印的登机牌）', () => {
    expect(bcbpFlightDate(331, ref)).toEqual({ year: 2026, month: 11, day: 27 });
  });
  it('有签发日期时按签发年份计算', () => {
    // 签发 2025 年第 365 天，航班儒略日 2 → 2026-01-02
    expect(
      bcbpFlightDate(2, { year: 2026, month: 3, day: 1 }, { yearDigit: 5, julianDate: 365 }),
    ).toEqual({
      year: 2026,
      month: 1,
      day: 2,
    });
  });
});

describe('bcbpToRecognition', () => {
  it('条码字段置信度都是 1，不输出姓名和 PNR', () => {
    const bcbp = parseBcbp(SAMPLE);
    if (!bcbp) throw new Error('parse failed');
    const r = bcbpToRecognition(bcbp, '2026-11-25T10:00:00+09:00');
    expect(r.type).toBe('flight');
    expect(r.title).toEqual({ value: 'AC834 YUL→FRA', confidence: 1 });
    expect(r.eventAt).toEqual({ value: '2026-11-22', confidence: 1 });
    expect(r.seat).toEqual({ value: '1A', confidence: 1 });
    expect(r.details?.flightNo?.value).toBe('AC834');
    expect(r.details?.cabin?.value).toBe('J');
    expect(r.sensitive).toEqual(['name', 'booking_ref', 'barcode']);
    expect(JSON.stringify(r)).not.toContain('DESMARAIS');
    expect(JSON.stringify(r)).not.toContain('ABC123');
  });

  it('多航段给出完整行程', () => {
    const bcbp = parseBcbp(BCBP_SAMPLES.twoLegs);
    if (!bcbp) throw new Error('parse failed');
    const r = bcbpToRecognition(bcbp, '2026-11-10');
    expect(r.title?.value).toBe('LH401 JFK→FRA');
    expect(r.subtitle?.value).toBe('JFK→FRA→MUC');
  });
});
