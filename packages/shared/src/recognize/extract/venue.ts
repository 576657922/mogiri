import type { Hit, NormLine } from '../types';

const VENUE_LABEL =
  /^(?:会場名?|開催場所|場所|VENUE|場館|场馆|演出场馆|演出地点|地点|地點|장소|공연장|PLACE|LOCATION)\s*[:：]?\s*(.+)$/i;

const VENUE_SUFFIX =
  /(?:ホール|HALL|ドーム|DOME|アリーナ|ARENA|スタジアム|STADIUM|劇場|THEATRE|THEATER|会館|体育館|体育馆|大剧院|剧院|剧场|音乐厅|ZEPP|球場|美術館|博物館|博物馆|美术馆|艺术中心|文化中心|体育中心|센터|홀|경기장|극장|박물관|미술관|PARK|FIELD|CENTER|CENTRE)(?:\s*[(（][^)）]*[)）]|\s+\S{1,6})?$/i;

/** 场馆：先找带标签的（会場 / VENUE / 场馆），再找以场馆类后缀结尾的短行 */
export function extractVenue(
  lines: readonly NormLine[],
  exclude: ReadonlySet<number>,
): Hit<string> | null {
  for (const line of lines) {
    const m = VENUE_LABEL.exec(line.text);
    if (m?.[1] && m[1].trim().length >= 2) {
      return { value: m[1].trim(), certainty: 0.88, line: line.index, rule: 'venue:labeled' };
    }
  }
  for (const line of lines) {
    if (exclude.has(line.index)) continue;
    const t = line.text;
    if (t.length > 30 || t.length < 3) continue;
    if (/\d{1,2}:\d{2}|[¥$₩€]|\d+\s*[円元]/.test(t)) continue;
    if (VENUE_SUFFIX.test(t)) {
      return { value: t, certainty: 0.65, line: line.index, rule: 'venue:suffix' };
    }
  }
  return null;
}

const ENTRY_NO =
  /(?:入場整理番号|整理番号|整理No\.?|入场序号|入場順|入场编号|ENTRY\s*(?:NO\.?|#|NUMBER)|입장\s*번호)\s*[:：.]?\s*([A-Z]{0,2}\s*-?\s*\d{1,5})(?:\s*番)?/i;

/** 整理番号 / 入场序号 → details.entryNo */
export function extractEntryNo(lines: readonly NormLine[]): Hit<string> | null {
  for (const line of lines) {
    const m = ENTRY_NO.exec(line.text);
    if (m?.[1]) {
      return {
        value: m[1].replace(/\s+/g, ''),
        certainty: 0.92,
        line: line.index,
        rule: 'entry-no',
      };
    }
  }
  return null;
}
