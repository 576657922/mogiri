import { describe, expect, it } from 'vitest';
import { classify } from './classify';
import { consistencyFactors, fieldConfidence } from './confidence';
import { RECOGNIZE_CONFIG } from './config';
import { nl } from './test-utils';
import { genericTitle, isTitleCandidate, labeledTitle, versusTitle } from './title';
import { dayNumber, inferYear, julianToYmd, parseIsoDate, weekdayOf } from './year';

describe('classify', () => {
  it.each([
    ['乗車券・新幹線特急券 東京→新大阪 5号車 12番A席', 'train'],
    ['JR東日本 指定席 ひかり 501号', 'train'],
    ['G1234 北京南站 二等座 05车', 'train'],
    ['BOARDING PASS GATE 52 FLIGHT NH123', 'flight'],
    ['登机牌 航班 CA1234 登机口 B12', 'flight'],
    ['TOHOシネマズ スクリーン5 18:30~', 'movie'],
    ['万达影城 3号厅 IMAX', 'movie'],
    ['劇場版 名探偵 上映 シネマ', 'movie'],
    ['LIVE TOUR 2026 開場 17:00 開演 18:00 整理番号 A12', 'concert'],
    ['2026 星河巡回演唱会 入场', 'concert'],
    ['劇団四季 ミュージカル 開演 13:00', 'theater'],
    ['话剧 雷雨 北京人艺 首都剧场', 'theater'],
    ['SEATTLE MARINERS vs NEW YORK YANKEES', 'sports'],
    ['阪神 対 巨人 甲子園球場 一塁側', 'sports'],
    ['東京国立博物館 特別展 観覧券', 'exhibition'],
    ['국립중앙박물관 관람권', 'exhibition'],
  ])('%s → %s', (text, type) => {
    expect(classify(text).type).toBe(type);
  });

  it('「劇場版」不算话剧', () => {
    const r = classify('劇場版 星降る夜のメロディ');
    expect(r.scores.theater).toBeUndefined();
  });

  it('没有关键词 → other / 低置信度；有 BCBP → flight / 1', () => {
    expect(classify('hello world')).toMatchObject({ type: 'other', confidence: 0.3 });
    expect(classify('anything', { hasBcbp: true })).toMatchObject({
      type: 'flight',
      confidence: 1,
    });
  });

  it('强特征越多置信度越高', () => {
    expect(classify('乗車券 特急券 新幹線').confidence).toBeGreaterThan(
      classify('乗車券').confidence,
    );
  });
});

describe('title', () => {
  it('排除固定字样、说明文字、数字为主的行和噪声', () => {
    expect(isTitleCandidate(nl('チケット'))).toBe(false);
    expect(isTitleCandidate(nl('TICKET'))).toBe(false);
    expect(isTitleCandidate(nl('※再入場はできません'))).toBe(false);
    expect(isTitleCandidate(nl('2026/11/09 18:30'))).toBe(false);
    expect(isTitleCandidate(nl('STELLA NOVA', 0, 0.2))).toBe(false);
    expect(isTitleCandidate(nl('STELLA NOVA'))).toBe(true);
  });

  it('通用启发式取框高最大的一行，置信度 ≤ 0.6', () => {
    const t = genericTitle(
      [
        nl('presents', 0, 1, [0, 0, 0.5, 0.03]),
        nl('LIVE TOUR 2026', 1, 1, [0, 0.1, 0.8, 0.09]),
        nl('STELLA NOVA', 2, 1, [0, 0.2, 0.5, 0.05]),
      ],
      new Set(),
    );
    expect(t?.value).toBe('LIVE TOUR 2026');
    expect(t?.certainty).toBeLessThanOrEqual(RECOGNIZE_CONFIG.genericTitleMaxConfidence);
  });

  it('带标签的标题 / A vs B', () => {
    expect(labeledTitle([nl('公演名：オペラ座の怪人')])?.value).toBe('オペラ座の怪人');
    expect(labeledTitle([nl('影片：星际旅人')])?.value).toBe('星际旅人');
    const vs = versusTitle([nl('阪神タイガース 対 読売ジャイアンツ')]);
    expect(vs).toMatchObject({ home: '阪神タイガース', away: '読売ジャイアンツ' });
  });
});

describe('year', () => {
  const ref = { year: 2026, month: 11, day: 20 };

  it('日期工具', () => {
    expect(parseIsoDate('2026-11-09T18:30:00+09:00')).toEqual({ year: 2026, month: 11, day: 9 });
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(weekdayOf({ year: 2026, month: 11, day: 9 })).toBe(1);
    expect(julianToYmd(2026, 313)).toEqual({ year: 2026, month: 11, day: 9 });
    expect(julianToYmd(2028, 366)).toEqual({ year: 2028, month: 12, day: 31 });
    expect(julianToYmd(2026, 366)).toBeNull();
    expect(dayNumber({ year: 1970, month: 1, day: 2 })).toBe(1);
  });

  it('过去的日期 → 今年；比 ref 晚太多 → 去年', () => {
    expect(inferYear({ month: 11, day: 9 }, ref, { futureWindowDays: 1 })).toMatchObject({
      year: 2026,
      certainty: 0.95,
    });
    expect(inferYear({ month: 12, day: 25 }, ref, { futureWindowDays: 1 })?.year).toBe(2025);
  });

  it('未来窗口内 → 今年（JR 指定席提前 1 个月）', () => {
    expect(inferYear({ month: 12, day: 15 }, ref, { futureWindowDays: 31 })).toMatchObject({
      year: 2026,
      certainty: 0.9,
    });
  });

  it('跨年：1 月扫描 12 月的票 → 去年；12 月扫描 1 月初的票（窗口内）→ 明年', () => {
    expect(
      inferYear({ month: 12, day: 28 }, { year: 2027, month: 1, day: 3 }, { futureWindowDays: 31 })
        ?.year,
    ).toBe(2026);
    expect(
      inferYear({ month: 1, day: 5 }, { year: 2026, month: 12, day: 20 }, { futureWindowDays: 31 })
        ?.year,
    ).toBe(2027);
  });

  it('星期校验：对得上 0.97；对不上时按星期反推年份', () => {
    expect(
      inferYear({ month: 11, day: 9, weekday: 1 }, ref, { futureWindowDays: 1 }),
    ).toMatchObject({
      year: 2026,
      certainty: 0.97,
    });
    // 2025-11-09 是星期日
    expect(
      inferYear({ month: 11, day: 9, weekday: 0 }, ref, { futureWindowDays: 1 }),
    ).toMatchObject({
      year: 2025,
      rule: 'year:weekday',
    });
  });

  it('2 月 29 日：取最近的闰年', () => {
    expect(inferYear({ month: 2, day: 29 }, ref, { futureWindowDays: 1 })?.year).toBe(2024);
  });
});

describe('confidence', () => {
  it('OCR 置信度 × 规则确定度，上限 localMaxConfidence', () => {
    expect(fieldConfidence(0.9, 0.9)).toBe(0.81);
    expect(fieldConfidence(1, 1)).toBe(RECOGNIZE_CONFIG.localMaxConfidence);
  });

  it('开场早于开演 → 加分；反过来 → 减分', () => {
    expect(
      consistencyFactors({ doors: { hour: 17, minute: 0 }, event: { hour: 18, minute: 0 } }).event,
    ).toBeGreaterThan(1);
    expect(
      consistencyFactors({ doors: { hour: 19, minute: 0 }, event: { hour: 18, minute: 0 } }).event,
    ).toBeLessThan(1);
  });

  it('出发早于到达（跨午夜也算一致）', () => {
    const dep = { hour: 23, minute: 30 };
    expect(
      consistencyFactors({ departure: dep, arrival: { hour: 6, minute: 10 } }).departure,
    ).toBeGreaterThan(1);
    expect(
      consistencyFactors({ departure: dep, arrival: { hour: 23, minute: 0 } }).departure,
    ).toBeLessThan(1);
  });
});
