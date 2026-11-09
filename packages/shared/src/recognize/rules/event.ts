import { fieldConfidence } from '../confidence';
import { extractEntryNo } from '../extract/venue';
import { genericTitle, labeledTitle, versusTitle } from '../title';
import { formatDate, inferYear } from '../year';
import type { Draft, RuleContext } from './context';
import { setDetail, setField, toField } from './util';

/**
 * 演唱会 / 话剧 / 体育 / 展览 / 其他：版式不固定，只做通用补充。
 * 标题：带标签的 > 「A vs B」（体育） > 通用启发式（置信度 ≤ 0.6，按设计走云端）。
 */
export function applyEventRules(ctx: RuleContext, draft: Draft): void {
  const { lines, type } = ctx;

  if (type === 'concert' || type === 'other') {
    const entry = extractEntryNo(lines);
    if (entry) {
      const f = toField(ctx, entry);
      setDetail(draft, 'entryNo', f.value, f.confidence, entry.rule);
      draft.usedLines.add(entry.line);
    }
  }

  if (type === 'exhibition') {
    if (draft.venue)
      setDetail(draft, 'museum', draft.venue.value, draft.venue.confidence, 'exhibition:museum');
    const until = ctx.dates.find((d) => d.value.role === 'valid-until');
    if (until) {
      const { month, day } = until.value;
      const year =
        until.value.year ?? inferYear({ month, day }, ctx.refDate, { futureWindowDays: 365 })?.year;
      if (year !== undefined) {
        setDetail(
          draft,
          'validUntil',
          formatDate({ year, month, day }),
          fieldConfidence(until.certainty, ctx.lineConf(until.line)),
          'exhibition:valid-until',
        );
      }
    }
  }

  const labeled = labeledTitle(lines);
  if (labeled) {
    setField(draft, 'title', toField(ctx, labeled), labeled.line);
    return;
  }

  if (type === 'sports') {
    const vs = versusTitle(lines);
    if (vs) {
      setField(draft, 'title', toField(ctx, vs), vs.line);
      const conf = fieldConfidence(0.8, ctx.lineConf(vs.line));
      setDetail(draft, 'home', vs.home, conf, 'sports:versus');
      setDetail(draft, 'away', vs.away, conf);
      return;
    }
  }

  const generic = genericTitle(lines, draft.usedLines);
  if (generic) setField(draft, 'title', toField(ctx, generic), generic.line);
}
