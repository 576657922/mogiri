import { describe, expect, it } from 'vitest';
import { detectLanguage } from './lang';
import {
  collapseNumericSpaces,
  fixNumericConfusions,
  joinSpacedCjk,
  normalizeText,
  toHalfWidth,
} from './normalize';
import { detectSensitive, findSensitiveLines, hasLongDigitRun, isLabelOnly } from './sensitive';

describe('normalize', () => {
  it('全角 → 半角（数字、字母、标点、空格、货币符号）', () => {
    expect(toHalfWidth('２０２６年１１月９日（月）')).toBe('2026年11月9日(月)');
    expect(toHalfWidth('ＪＲ　Ａ席：１８：３０')).toBe('JR A席:18:30');
    expect(toHalfWidth('￥１４，７２０')).toBe('¥14,720');
    expect(toHalfWidth('１８：３０〜２０：４５')).toBe('18:30~20:45');
  });

  it('不动平假名 / 汉字 / 长音；半角片假名转全角并合成浊音', () => {
    expect(toHalfWidth('のぞみ・ひかり ー 東京')).toBe('のぞみ・ひかり ー 東京');
    expect(toHalfWidth('ｶﾞｲﾄﾞ ｽｸﾘｰﾝ')).toBe('ガイド スクリーン');
  });

  it('数字上下文里的 O/l/I 修正', () => {
    expect(fixNumericConfusions('1O:3O')).toBe('10:30');
    expect(fixNumericConfusions('2O26年1l月')).toBe('2026年11月');
    expect(fixNumericConfusions('ZONE A Row 5 IO')).toBe('ZONE A Row 5 IO');
    expect(fixNumericConfusions('OPEN 17:30')).toBe('OPEN 17:30');
  });

  it('去掉数字内部和数字与单位之间的空格', () => {
    expect(collapseNumericSpaces('1 1月 9日')).toBe('11月9日');
    expect(collapseNumericSpaces('2 0 2 6 年')).toBe('2026年');
    expect(collapseNumericSpaces('18 : 30')).toBe('18:30');
    expect(collapseNumericSpaces('8, 800円')).toBe('8,800円');
    expect(collapseNumericSpaces('2026 / 11 / 09')).toBe('2026/11/09');
    expect(collapseNumericSpaces('¥ 4 8 0')).toBe('¥480');
    // 不应该合并的
    expect(collapseNumericSpaces('Nov 9, 2026')).toBe('Nov 9, 2026');
    expect(collapseNumericSpaces('5号車 12番')).toBe('5号車 12番');
  });

  it('完整流程', () => {
    expect(normalizeText('  １１月 ９日（１８：３０発）  ')).toBe('11月9日(18:30発)');
  });

  it('合并单字之间的空格，但不粘连多字词', () => {
    expect(joinSpacedCjk('東 京')).toBe('東京');
    expect(joinSpacedCjk('乗車券 東 京')).toBe('乗車券 東京');
    expect(joinSpacedCjk('新 大 阪 (市内)')).toBe('新大阪 (市内)');
  });
});

describe('detectLanguage', () => {
  it.each([
    ['乗車券 東京→新大阪 指定席', 'ja'],
    ['開場 17:00 / 開演 18:00 お名前', 'ja'],
    ['演出时间 2026年11月9日 票价 880元', 'zh'],
    ['관람일 2026년 11월 9일', 'ko'],
    ['SEC 128 ROW 12 SEAT 5', 'en'],
  ])('%s → %s', (text, lang) => {
    expect(detectLanguage(text)).toBe(lang);
  });
});

describe('sensitive', () => {
  it.each([
    ['予約番号 ABC123', 'booking_ref'],
    ['受付番号：1234-5678', 'booking_ref'],
    ['订单号：DM2026', 'booking_ref'],
    ['Booking Ref: X1Y2Z3', 'booking_ref'],
    ['会員番号 00123', 'booking_ref'],
    ['お名前 山田 花子', 'name'],
    ['YAMADA/TARO MR', 'name'],
    ['1234567890', 'booking_ref'],
    ['1234-5678-9012', 'booking_ref'],
  ])('%s → %s', (text, kind) => {
    expect(detectSensitive(text)).toBe(kind);
  });

  it.each(['整理番号 A123', '2026/11/09 18:30', '東日本旅客鉄道', '1階 Bブロック 3列 15番'])(
    '%s 不敏感',
    (text) => {
      expect(detectSensitive(text)).toBeNull();
    },
  );

  it('10 位以上连续数字', () => {
    expect(hasLongDigitRun('No. 123456789')).toBe(false);
    expect(hasLongDigitRun('No. 12345-67890')).toBe(true);
  });

  it('标签单独一行时连同下一行', () => {
    expect(isLabelOnly('予約番号')).toBe(true);
    expect(isLabelOnly('お名前：')).toBe(true);
    expect(isLabelOnly('予約番号 ABC')).toBe(false);
    const { indices, kinds } = findSensitiveLines(['TITLE', '予約番号', 'QX7T2P', '2026/11/09']);
    expect([...indices]).toEqual([1, 2]);
    expect([...kinds]).toEqual(['booking_ref']);
  });
});
