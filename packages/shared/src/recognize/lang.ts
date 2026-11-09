/**
 * 粗略的票面语言判断（ja / zh / ko / en），只用于选默认币种、时区和日期写法。
 */
export type TicketLanguage = 'ja' | 'zh' | 'ko' | 'en';

/** 日文专用的新字体汉字（简体中文和繁体中文里都不这样写） */
const JA_ONLY_KANJI = /[乗発駅円込払戻様県鉄図売観覧験沢浜恵広辺歳巻]/gu;
/** 简体中文专用字 */
const ZH_SIMPLIFIED = /[们这时间场厅门车铁价张贵宾区馆们观览剧乐动开无请购买东该进]/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const HANGUL = /\p{Script=Hangul}/gu;
const HAN = /\p{Script=Han}/gu;

function count(s: string, re: RegExp): number {
  return s.match(re)?.length ?? 0;
}

export function detectLanguage(text: string): TicketLanguage {
  // 「ー」「・」不是判断依据（中文里也会出现），先去掉
  const t = text.replace(/[ー・]/g, '');
  const kana = count(t, KANA);
  const jaKanji = count(t, JA_ONLY_KANJI);
  const zhChars = count(t, ZH_SIMPLIFIED);
  const hangul = count(t, HANGUL);
  const han = count(t, HAN);

  const jaScore = kana + 2 * jaKanji;
  if (hangul >= 2 && hangul >= jaScore) return 'ko';
  if (jaScore >= 2 && jaScore >= zhChars * 2) return 'ja';
  // 有假名、又没有任何简体字（「開場 開演 お名前」）→ 日文
  if (kana >= 1 && zhChars === 0) return 'ja';
  if (han >= 2) return 'zh';
  if (jaScore >= 2) return 'ja';
  return 'en';
}
