import type { TicketLanguage } from '../lang';
import type { Hit, NormLine } from '../types';

export type PriceValue = { amount: number; currency: string };
export type PriceHit = Hit<PriceValue> & { labeled: boolean };

const AMOUNT = '(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?';

const toAmount = (int: string | undefined, frac: string | undefined) =>
  Number(`${(int ?? '').replace(/,/g, '')}${frac ? `.${frac}` : ''}`);

/** 「¥」既可能是日元也可能是人民币：有日文时取 JPY，中文时取 CNY，默认 JPY */
export function yenCurrency(lang: TicketLanguage, locale?: string): 'JPY' | 'CNY' {
  if (lang === 'ja') return 'JPY';
  if (lang === 'zh') return 'CNY';
  if (locale && /^zh/i.test(locale)) return 'CNY';
  return 'JPY';
}

const DOLLAR_PREFIX: Record<string, string> = {
  HK: 'HKD',
  NT: 'TWD',
  A: 'AUD',
  C: 'CAD',
  S: 'SGD',
  US: 'USD',
};

type Pattern = {
  rule: string;
  re: RegExp;
  certainty: number;
  currency: (m: RegExpExecArray, ctx: { lang: TicketLanguage; locale?: string }) => string;
  /** 金额所在的捕获组（整数, 小数） */
  groups: [number, number];
};

const PATTERNS: Pattern[] = [
  {
    rule: 'price:dollar',
    re: new RegExp(`(HK|NT|US|A|C|S)?\\$\\s*${AMOUNT}`, 'g'),
    certainty: 0.9,
    currency: (m) => DOLLAR_PREFIX[m[1] ?? 'US'] ?? 'USD',
    groups: [2, 3],
  },
  {
    rule: 'price:yen-sign',
    re: new RegExp(`[¥\\\\]\\s*${AMOUNT}`, 'g'),
    certainty: 0.9,
    currency: (_m, c) => yenCurrency(c.lang, c.locale),
    groups: [1, 2],
  },
  {
    rule: 'price:yen-suffix',
    re: new RegExp(`${AMOUNT}\\s*円`, 'g'),
    certainty: 0.92,
    currency: () => 'JPY',
    groups: [1, 2],
  },
  {
    rule: 'price:cny',
    re: new RegExp(`(?:(?:RMB|CNY)\\s*${AMOUNT}|${AMOUNT}\\s*(?:元|RMB))`, 'gi'),
    certainty: 0.92,
    currency: () => 'CNY',
    groups: [1, 2], // 第二种写法在 3,4 组，见 build
  },
  {
    rule: 'price:krw',
    re: new RegExp(`(?:(?:₩|KRW)\\s*${AMOUNT}|${AMOUNT}\\s*원)`, 'g'),
    certainty: 0.92,
    currency: () => 'KRW',
    groups: [1, 2],
  },
  {
    rule: 'price:eur',
    re: new RegExp(`(?:€\\s*${AMOUNT}|${AMOUNT}\\s*€)`, 'g'),
    certainty: 0.9,
    currency: () => 'EUR',
    groups: [1, 2],
  },
  {
    rule: 'price:gbp',
    re: new RegExp(`£\\s*${AMOUNT}`, 'g'),
    certainty: 0.9,
    currency: () => 'GBP',
    groups: [1, 2],
  },
];

const PRICE_LABEL =
  /(税込|料金|価格|金額|代金|票价|票價|价格|PRICE|FARE|TOTAL|合計|合计|대금|가격|요금|금액)/i;
const FEE_CONTEXT = /(手数料|手續費|手续费|FEE|サービス料|システム利用料|送料|수수료)/i;

function langDefaultCurrency(lang: TicketLanguage): string {
  return { ja: 'JPY', zh: 'CNY', ko: 'KRW', en: 'USD' }[lang];
}

export function extractPricesFromLine(
  line: NormLine,
  ctx: { lang: TicketLanguage; locale?: string },
): PriceHit[] {
  const text = line.text;
  const labeled = PRICE_LABEL.test(text);
  const fee = FEE_CONTEXT.test(text);
  const out: PriceHit[] = [];
  const taken: Array<[number, number]> = [];

  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (let m = p.re.exec(text); m; m = p.re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      // 有两种写法的模式：金额在第一组或第三组
      const [gi, gf] = p.groups;
      const int = m[gi] ?? m[gi + 2];
      const frac = m[gf] ?? m[gf + 2];
      if (!int) continue;
      const amount = toAmount(int, frac);
      // 太长的数字多半是订单号
      if (!Number.isFinite(amount) || int.replace(/,/g, '').length > 7) continue;
      taken.push([start, end]);
      let certainty = p.certainty;
      if (labeled) certainty = Math.min(1, certainty + 0.05);
      if (fee) certainty *= 0.5;
      out.push({
        value: { amount, currency: p.currency(m, ctx) },
        certainty,
        line: line.index,
        rule: p.rule,
        labeled,
      });
    }
  }

  // 只有标签、没有货币符号：「票价 380」
  if (out.length === 0 && labeled && !fee) {
    const m = new RegExp(
      `${PRICE_LABEL.source}\\s*[:：]?\\s*${AMOUNT}(?!\\s*[%:/年月日])`,
      'i',
    ).exec(text);
    if (m?.[2]) {
      out.push({
        value: { amount: toAmount(m[2], m[3]), currency: langDefaultCurrency(ctx.lang) },
        certainty: 0.6,
        line: line.index,
        rule: 'price:labeled-bare',
        labeled: true,
      });
    }
  }
  return out;
}

export function extractPrices(
  lines: readonly NormLine[],
  ctx: { lang: TicketLanguage; locale?: string },
): PriceHit[] {
  return lines.flatMap((l) => extractPricesFromLine(l, ctx));
}

/** 有标签的优先，其次按确定度；同分取先出现的 */
export function pickPrice(
  hits: readonly PriceHit[],
  lineConf: (line: number) => number,
): { hit: PriceHit; score: number } | null {
  const sorted = hits
    .map((hit) => ({ hit, score: hit.certainty * lineConf(hit.line) }))
    .sort((a, b) => Number(b.hit.labeled) - Number(a.hit.labeled) || b.score - a.score);
  return sorted[0] ?? null;
}
