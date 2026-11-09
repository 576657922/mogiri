/**
 * OCR 文字规范化。
 *
 * 顺序：全角 → 半角 → 数字上下文里的 OCR 易混字符 → 数字内部多余空格 → 合并空白。
 * 只做「在数字上下文里才安全」的替换，不改动普通的日文 / 中文文字。
 */

/** 半角片假名（U+FF61–FF9F）整段做 NFKC，这样「ｶﾞ」会合成「ガ」 */
const HALF_KATAKANA_RUN = /[\uFF61-\uFF9F]+/g;
/** 全角 ASCII（！ 到 ～） */
const FULLWIDTH_ASCII = /[\uFF01-\uFF5E]/g;

const SPECIAL_MAP: Record<string, string> = {
  '\u3000': ' ', // 全角空格
  '\uFFE5': '¥', // ￥
  '\uFFE6': '₩', // ￦
  '\uFFE0': '¢',
  '\uFFE1': '£',
  '\u2212': '-', // − MINUS SIGN
  '\u2010': '-', // ‐
  '\u2013': '-', // –
  '\u301C': '~', // 〜 WAVE DASH
  '\u2053': '~', // ⁓
};
const SPECIAL_RE = new RegExp(`[${Object.keys(SPECIAL_MAP).join('')}]`, 'g');

/** 全角数字 / 拉丁字母 / 标点 → 半角；半角片假名 → 全角片假名。不动汉字和平假名。 */
export function toHalfWidth(s: string): string {
  return s
    .replace(FULLWIDTH_ASCII, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(SPECIAL_RE, (ch) => SPECIAL_MAP[ch] ?? ch)
    .replace(HALF_KATAKANA_RUN, (run) => run.normalize('NFKC'));
}

/**
 * 数字上下文里的 OCR 易混字符：O/o → 0，I/l → 1。
 * 只替换「由数字和易混字符组成、至少含一个真数字、并且两侧不是拉丁字母」的片段，
 * 例如「1O:3O」→「10:30」、「2O26年」→「2026年」；「ZONE」「Row」「IO」不受影响。
 */
export function fixNumericConfusions(s: string): string {
  return s.replace(/(?<![A-Za-z])[0-9OoIl]{2,}(?![A-Za-z])/g, (token) => {
    if (!/[0-9]/.test(token) || !/[OoIl]/.test(token)) return token;
    return token.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
  });
}

/** 日期 / 时间 / 座位 / 价格单位（数字后面紧跟这些字时，中间的空格是 OCR 噪声） */
const UNIT_CHARS = '年月日時时分秒号號番列排座席車车階阶楼層円元원년월일시분열번층';

/**
 * 去掉数字内部、数字与单位之间的空格：
 * 「1 1月 9日」→「11月9日」、「18 : 30」→「18:30」、「8, 800円」→「8,800円」、「2026 / 11 / 09」→「2026/11/09」
 */
export function collapseNumericSpaces(s: string): string {
  let out = s;
  // 数字 + 空格 + 单位
  out = out.replace(new RegExp(`(\\d)\\s+(?=[${UNIT_CHARS}])`, 'g'), '$1');
  // 年 / 月 + 空格 + 数字
  out = out.replace(/([年月년월])\s+(?=\d)/g, '$1');
  // 数字 + 空格 + 数字（后一段数字紧跟单位），例如「1 1月」；多次迭代处理「2 0 2 6年」
  const splitDigits = new RegExp(`(\\d)\\s+(?=\\d+[${UNIT_CHARS}])`, 'g');
  for (let i = 0; i < 4; i++) {
    const next = out.replace(splitDigits, '$1');
    if (next === out) break;
    out = next;
  }
  // 货币符号后面的数字：「¥ 4 8 0」→「¥480」
  out = out.replace(
    /([¥$₩€£\\]\s*)(\d(?:[\d,]|\s(?=\d))*)/g,
    (_m, sign: string, n: string) => `${sign.trim()}${n.replace(/\s/g, '')}`,
  );
  // 时间冒号
  out = out.replace(/(\d)\s*:\s*(?=\d{2}(?!\d))/g, '$1:');
  // 千位分隔符
  out = out.replace(/(\d)\s*,\s+(?=\d{3}(?!\d))/g, '$1,');
  out = out.replace(/(\d)\s+,\s*(?=\d{3}(?!\d))/g, '$1,');
  // 日期分隔符 . / -（两侧都是数字）
  out = out.replace(/(\d)\s*([./-])\s*(?=\d)/g, '$1$2');
  return out;
}

/** 完整的规范化流程 */
export function normalizeText(s: string): string {
  const half = toHalfWidth(s);
  const fixed = fixNumericConfusions(half);
  const collapsed = collapseNumericSpaces(fixed);
  return collapsed.replace(/\s+/g, ' ').trim();
}

/**
 * 去掉 CJK 单字之间的空格（OCR 经常把大字号的「東 京」拆开）。
 * 只合并「每段都是 1 个字」的连续片段，避免把「乗車券 東京」粘在一起。
 */
export function joinSpacedCjk(s: string): string {
  const parts = s.split(' ');
  const out: string[] = [];
  let buf = '';
  const isSingleCjk = (p: string) =>
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(p);
  for (const p of parts) {
    if (isSingleCjk(p)) {
      buf += p;
      continue;
    }
    if (buf) {
      out.push(buf);
      buf = '';
    }
    if (p) out.push(p);
  }
  if (buf) out.push(buf);
  return out.join(' ');
}
