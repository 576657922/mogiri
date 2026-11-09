import { fieldConfidence } from '../confidence';
import type { Hit, NormLine } from '../types';
import type { Draft, FieldDraft, RuleContext } from './context';

/** 命中 → 字段（置信度 = 规则确定度 × 行置信度 × 系数） */
export function toField(ctx: RuleContext, hit: Hit<string>, factor = 1, cap?: number): FieldDraft {
  return {
    value: hit.value,
    confidence: fieldConfidence(hit.certainty, ctx.lineConf(hit.line), factor, cap),
    rule: hit.rule,
  };
}

/** 设置字段并记录规则名和占用的行 */
export function setField<K extends 'title' | 'subtitle' | 'venue' | 'seat'>(
  draft: Draft,
  key: K,
  field: FieldDraft,
  line?: number,
): void {
  draft[key] = field;
  if (field.rule && !draft.matchedRules.includes(field.rule)) draft.matchedRules.push(field.rule);
  if (line !== undefined) draft.usedLines.add(line);
}

export function setDetail(
  draft: Draft,
  key: string,
  value: string,
  confidence: number,
  rule?: string,
): void {
  if (!value) return;
  const prev = draft.details[key];
  if (prev && prev.confidence >= confidence) return;
  draft.details[key] = { value, confidence };
  if (rule && !draft.matchedRules.includes(rule)) draft.matchedRules.push(rule);
}

export function addRule(draft: Draft, rule: string): void {
  if (!draft.matchedRules.includes(rule)) draft.matchedRules.push(rule);
}

/**
 * 找「标签 + 值」：值在标签同一行的后面；或者标签单独一行、值在正下方（x 方向重叠）的下一行。
 * 适合登机牌这种「GATE」在上、「52」在下的版式。
 */
export function findLabeledValue(
  lines: readonly NormLine[],
  label: RegExp,
  value: RegExp,
): Hit<string> | null {
  const sticky = new RegExp(
    `${label.source}\\s*[:：.]?\\s*(?<v>${value.source})`,
    label.flags.replace('g', ''),
  );
  for (const line of lines) {
    const v = sticky.exec(line.text)?.groups?.v;
    if (v) return { value: v, certainty: 0.9, line: line.index, rule: 'labeled:inline' };
  }
  const valueOnly = new RegExp(`^\\s*(${value.source})\\s*$`, value.flags.replace('g', ''));
  for (const line of lines) {
    if (!label.test(line.text)) continue;
    const [x, y, w, h] = line.box;
    const below = lines
      .filter((l) => {
        const [lx, ly, lw] = l.box;
        return ly > y && ly - (y + h) < h * 2.5 && lx < x + w && lx + lw > x;
      })
      .sort((a, b) => a.box[1] - b.box[1]);
    for (const b of below) {
      const m = valueOnly.exec(b.text);
      if (m?.[1]) return { value: m[1], certainty: 0.85, line: b.index, rule: 'labeled:below' };
    }
  }
  return null;
}
