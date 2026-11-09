import { describe, expect, it } from 'vitest';
import { nl } from '../test-utils';
import { extractDatesFromLine, pickEventDate } from './date';
import { extractPricesFromLine, yenCurrency } from './price';
import { extractRoutes } from './route';
import { extractSeatFromLine } from './seat';
import { extractTimes, extractTimesFromLine, labelOnlyRole } from './time';
import { extractEntryNo, extractVenue } from './venue';

const date = (text: string) => {
  const hit = extractDatesFromLine(nl(text))[0];
  return hit ? { ...hit.value, rule: hit.rule, certainty: hit.certainty } : null;
};

describe('extract/date', () => {
  it.each([
    ['2026年11月9日(月)', { year: 2026, month: 11, day: 9, weekday: 1, weekdayConsistent: true }],
    ['２０２６年１１月 ９日', { year: 2026, month: 11, day: 9 }],
    ['2026/11/09', { year: 2026, month: 11, day: 9 }],
    ['2026.11.09 18:30', { year: 2026, month: 11, day: 9 }],
    ['2026-11-09T18:30', { year: 2026, month: 11, day: 9 }],
    ['26.11.9', { year: 2026, month: 11, day: 9 }],
    ['令和8年11月9日', { year: 2026, month: 11, day: 9 }],
    ['令和元年5月1日', { year: 2019, month: 5, day: 1 }],
    ['平成31年4月30日', { year: 2019, month: 4, day: 30 }],
    ['11月9日', { month: 11, day: 9 }],
    ['1 1月 9日（月）', { month: 11, day: 9, weekday: 1 }],
    ['Nov 9, 2026', { year: 2026, month: 11, day: 9 }],
    ['November 9th 2026', { year: 2026, month: 11, day: 9 }],
    ['9 NOV 2026', { year: 2026, month: 11, day: 9 }],
    ['09NOV26', { year: 2026, month: 11, day: 9 }],
    ['DATE 09NOV', { month: 11, day: 9 }],
    ['2026년 11월 9일', { year: 2026, month: 11, day: 9 }],
    ['11/09/2026', { year: 2026, month: 11, day: 9 }],
    ['25/12/2026', { year: 2026, month: 12, day: 25 }],
    [
      '2026年11月9日 星期一',
      { year: 2026, month: 11, day: 9, weekday: 1, weekdayConsistent: true },
    ],
    ['SUN, NOV 8, 2026', { year: 2026, month: 11, day: 8, weekday: 0, weekdayConsistent: true }],
  ])('%s', (text, want) => {
    expect(date(text)).toMatchObject(want);
  });

  it('非法日期不匹配', () => {
    expect(date('2026/02/30')).toBeNull();
    expect(date('13月40日')).toBeNull();
    expect(date('18:30')).toBeNull();
  });

  it('星期对不上时降低确定度', () => {
    const ok = date('2026年11月9日(月)');
    const bad = date('2026年11月9日(火)');
    expect(bad?.weekdayConsistent).toBe(false);
    expect(bad?.certainty ?? 1).toBeLessThan((ok?.certainty ?? 0) * 0.7);
  });

  it('判断日期角色：发行日 / 有效期 / 活动日', () => {
    expect(date('26.11.1 東京駅MV1発行')?.role).toBe('issue');
    expect(date('有効期限 2026年12月31日')?.role).toBe('valid-until');
    expect(date('2026年12月31日まで有効')?.role).toBe('valid-until');
    expect(date('公演日 2026年11月9日')?.role).toBe('event');
  });

  it('活动日期优先于发行日；有接近的竞争日期时降低置信度', () => {
    const hits = [
      ...extractDatesFromLine(nl('11月9日(18:30発)', 0)),
      ...extractDatesFromLine(nl('26.11.1 東京駅発行', 1)),
    ];
    const picked = pickEventDate(hits, () => 1);
    expect(picked?.hit.value).toMatchObject({ month: 11, day: 9 });
    expect(picked?.ambiguity).toBe(1);

    const rival = [
      ...extractDatesFromLine(nl('2026年11月9日', 0)),
      ...extractDatesFromLine(nl('2026年11月10日', 1)),
    ];
    expect(pickEventDate(rival, () => 1)?.ambiguity).toBeLessThan(1);
  });
});

const times = (text: string) =>
  extractTimesFromLine(nl(text)).map((t) => [t.value.hour, t.value.minute, t.value.role]);

describe('extract/time', () => {
  it.each([
    ['18:30', [[18, 30, 'unknown']]],
    ['18時30分', [[18, 30, 'unknown']]],
    ['6時半開演', [[6, 30, 'event']]],
    [
      '開場 17:30 / 開演 18:30',
      [
        [17, 30, 'doors'],
        [18, 30, 'event'],
      ],
    ],
    [
      '17:30開場 18:30開演',
      [
        [17, 30, 'doors'],
        [18, 30, 'event'],
      ],
    ],
    [
      'OPEN 17:00 START 18:00',
      [
        [17, 0, 'doors'],
        [18, 0, 'event'],
      ],
    ],
    [
      '开场 19:00 开演 19:30',
      [
        [19, 0, 'doors'],
        [19, 30, 'event'],
      ],
    ],
    [
      '(18:30発)→(20:57着)',
      [
        [18, 30, 'departure'],
        [20, 57, 'arrival'],
      ],
    ],
    [
      '18:30~20:45',
      [
        [18, 30, 'event'],
        [20, 45, 'end'],
      ],
    ],
    ['7:10 PM', [[19, 10, 'unknown']]],
    ['午後6時30分', [[18, 30, 'unknown']]],
    ['搭乗開始 09:35', [[9, 35, 'boarding']]],
    [
      'DEP 10:15 ARR 12:30',
      [
        [10, 15, 'departure'],
        [12, 30, 'arrival'],
      ],
    ],
    ['입장시간：18:00', [[18, 0, 'doors']]],
  ])('%s', (text, want) => {
    expect(times(text)).toEqual(want);
  });

  it('不把秒、日期、长数字当成时间', () => {
    expect(times('18:30:00')).toEqual([[18, 30, 'unknown']]);
    expect(times('25:99')).toEqual([]);
    expect(times('所要時間 2時間')).toEqual([]);
  });

  it('标签单独一行时作用于下一行的时间', () => {
    expect(labelOnlyRole('開演')).toBe('event');
    expect(labelOnlyRole('開演時間')).toBe('event');
    expect(labelOnlyRole('開演 18:30')).toBeNull();
    const hits = extractTimes([nl('開場', 0), nl('17:30', 1)]);
    expect(hits[0]?.value.role).toBe('doors');
  });
});

const seat = (text: string) => {
  const h = extractSeatFromLine(nl(text));
  return h ? { ...h.value, rule: h.rule } : null;
};

describe('extract/seat', () => {
  it.each([
    ['A列12番', { seat: 'A列12番' }],
    ['1階 Bブロック 3列 15番', { seat: '1階 Bブロック 3列 15番' }],
    ['アリーナ A3ブロック 12列 5番', { seat: 'アリーナ A3ブロック 12列 5番' }],
    ['3排5号', { seat: '3排5号' }],
    ['看台 C区 12排 8号', { seat: 'C区 12排 8号' }],
    ['5排08座', { seat: '5排08座' }],
    ['5号車 12番A席', { seat: '12番A席', car: '5', rule: 'seat:train' }],
    ['のぞみ123号 5号車 12番 A席', { seat: '12番A席', car: '5' }],
    ['05车 12F号', { seat: '12F号', car: '05' }],
    ['Row 5 Seat 12', { seat: 'Row 5 Seat 12' }],
    ['SEC 128 ROW 12 SEAT 5', { seat: 'SEC 128 ROW 12 SEAT 5' }],
    ['座席 SEAT 12A', { seat: '12A', rule: 'seat:flight' }],
    ['座席 F-12', { seat: 'F-12', rule: 'seat:dash' }],
    ['12열 5번', { seat: '12열 5번' }],
    ['5号車', { seat: '', car: '5', rule: 'seat:car' }],
  ])('%s', (text, want) => {
    expect(seat(text)).toMatchObject(want);
  });

  it.each(['のぞみ 123号', '整理番号 A123', '11月9号 19:30', '3番線', '2026年11月9日'])(
    '%s 不是座位',
    (text) => {
      expect(seat(text)).toBeNull();
    },
  );
});

const price = (text: string, lang: 'ja' | 'zh' | 'en' | 'ko' = 'ja') =>
  extractPricesFromLine(nl(text), { lang }).map((p) => p.value);

describe('extract/price', () => {
  it.each([
    ['¥8,800', 'ja', { amount: 8800, currency: 'JPY' }],
    ['8,800円(税込)', 'ja', { amount: 8800, currency: 'JPY' }],
    ['￥45', 'zh', { amount: 45, currency: 'CNY' }],
    ['￥45', 'ja', { amount: 45, currency: 'JPY' }],
    ['45元', 'zh', { amount: 45, currency: 'CNY' }],
    ['票价：380', 'zh', { amount: 380, currency: 'CNY' }],
    ['$25.00', 'en', { amount: 25, currency: 'USD' }],
    ['HK$480', 'zh', { amount: 480, currency: 'HKD' }],
    ['₩15,000', 'ko', { amount: 15000, currency: 'KRW' }],
    ['15,000원', 'ko', { amount: 15000, currency: 'KRW' }],
    ['€12.50', 'en', { amount: 12.5, currency: 'EUR' }],
    ['税込 ¥ 4 8 0', 'ja', { amount: 480, currency: 'JPY' }],
  ] as const)('%s (%s)', (text, lang, want) => {
    expect(price(text, lang)[0]).toEqual(want);
  });

  it('太长的数字不是价格', () => {
    expect(price('¥123456789')).toEqual([]);
  });

  it('¥ 的币种：日文 → JPY，中文 → CNY，其他按 locale', () => {
    expect(yenCurrency('ja')).toBe('JPY');
    expect(yenCurrency('zh')).toBe('CNY');
    expect(yenCurrency('en', 'zh-CN')).toBe('CNY');
    expect(yenCurrency('en')).toBe('JPY');
  });
});

describe('extract/route', () => {
  const route = (...texts: string[]) =>
    extractRoutes(texts.map((t, i) => nl(t, i))).map((r) => `${r.value.from}|${r.value.to}`);

  it.each([
    ['東京 → 新大阪', '東京|新大阪'],
    ['東京▶新大阪', '東京|新大阪'],
    ['東 京 → 新大阪', '東京|新大阪'],
    ['乗車券 東京都区内→横 浜', '東京都区内|横浜'],
    ['東京(18:30発) → 新大阪(20:57着)', '東京|新大阪'],
    ['北京南站→上海虹桥站', '北京南站|上海虹桥站'],
    ['品川駅 ⇒ 名古屋駅', '品川|名古屋'],
  ])('%s', (text, want) => {
    expect(route(text)).toEqual([want]);
  });

  it('箭头单独一行', () => {
    expect(route('東京', '→', '新大阪')).toEqual(['東京|新大阪']);
  });

  it('时间范围不是区间', () => {
    expect(route('11月9日(18:30発)→(20:57着)')).toEqual([]);
  });
});

describe('extract/venue', () => {
  it('带标签的场馆优先', () => {
    const v = extractVenue([nl('東京ドーム', 0), nl('会場：日本武道館', 1)], new Set());
    expect(v?.value).toBe('日本武道館');
    expect(v?.rule).toBe('venue:labeled');
  });
  it('以场馆后缀结尾的短行', () => {
    expect(extractVenue([nl('Zepp Haneda', 0)], new Set())?.value).toBe('Zepp Haneda');
    expect(extractVenue([nl('T-MOBILE PARK', 0)], new Set())?.value).toBe('T-MOBILE PARK');
    expect(extractVenue([nl('劇場版 名探偵', 0)], new Set())).toBeNull();
  });
  it('整理番号', () => {
    expect(extractEntryNo([nl('整理番号 A123', 0)])?.value).toBe('A123');
    expect(extractEntryNo([nl('入场序号：0582', 0)])?.value).toBe('0582');
    expect(extractEntryNo([nl('整理番号 123番', 0)])?.value).toBe('123');
  });
});
