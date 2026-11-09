import { joinSpacedCjk } from '../normalize';
import type { Hit, NormLine } from '../types';

export type RouteValue = { from: string; to: string };
export type RouteHit = Hit<RouteValue>;

const ARROW = /\s*(?:→|⇒|➡|➔|➜|▶|►|▷|⇨|⟶|=>|->|—>|―>|~>)\s*/;
const ARROW_ONLY = /^\s*(?:→|⇒|➡|➔|➜|▶|►|▷|⇨|⟶|=>|->|—>|―>|~>)\s*$/;

/** 站名里允许出现的字符 */
const NAME_CHARS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・A-Za-z()（）]/u;

/** 去掉括号里的时间等附加信息（「東京(18:30発)」→「東京」）和末尾的「駅」 */
function cleanName(s: string): string {
  return s
    .replace(/[(（][^)）]*[)）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/駅$/, '');
}

/** 左侧取最后一个站名（「乗車券 東 京」→「東京」） */
function lastName(left: string): string {
  const joined = joinSpacedCjk(cleanName(left));
  const segs = joined.split(' ');
  const last = segs[segs.length - 1] ?? '';
  return [...last].every((c) => NAME_CHARS.test(c)) ? last : '';
}

/** 右侧取第一个站名（「新 大 阪 (20:57着)」→「新大阪」） */
function firstName(right: string): string {
  const joined = joinSpacedCjk(cleanName(right));
  const first = joined.split(' ')[0] ?? '';
  return [...first].every((c) => NAME_CHARS.test(c)) ? first : '';
}

const valid = (s: string) => s.length >= 1 && /\p{L}/u.test(s) && !/^\d+$/.test(s);

/** 「東京 → 新大阪」「東 京 ▶ 新大阪」「北京南站→上海虹桥站」；箭头单独一行时取上下两行 */
export function extractRoutes(lines: readonly NormLine[]): RouteHit[] {
  const out: RouteHit[] = [];
  lines.forEach((line, i) => {
    if (ARROW_ONLY.test(line.text)) {
      const prev = lines[i - 1];
      const next = lines[i + 1];
      if (!prev || !next) return;
      const from = lastName(prev.text);
      const to = firstName(next.text);
      if (valid(from) && valid(to)) {
        out.push({
          value: { from, to },
          certainty: 0.8,
          line: line.index,
          rule: 'route:arrow-line',
        });
      }
      return;
    }
    const parts = line.text.split(ARROW);
    if (parts.length < 2) return;
    const from = lastName(parts[0] ?? '');
    const to = firstName(parts[1] ?? '');
    if (valid(from) && valid(to) && from !== to) {
      out.push({ value: { from, to }, certainty: 0.9, line: line.index, rule: 'route:arrow' });
    }
  });
  return out;
}
