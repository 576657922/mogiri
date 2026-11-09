import { normalizeText } from './normalize';
import type { Box, NormLine, OcrLine } from './types';

/** 测试用：构造规范化后的行 */
export function nl(
  text: string,
  index = 0,
  confidence = 1,
  box: Box = [0, index * 0.1, 0.5, 0.05],
): NormLine {
  return { index, raw: text, text: normalizeText(text), box, confidence };
}

/** 测试用：构造多行（按顺序排列，框高可选） */
export function lines(...rows: Array<string | [string, number?, number?]>): OcrLine[] {
  return rows.map((r, i) => {
    const [text, h = 0.05, confidence = 0.95] = typeof r === 'string' ? [r] : r;
    return { text, box: [0.05, i * 0.08, 0.6, h], confidence };
  });
}
