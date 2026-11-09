import { RECOGNIZE_CONFIG } from './config';
import type { Hit, NormLine } from './types';

/** 票面上的固定字样（不可能是标题） */
const BOILERPLATE =
  /^(チケット|電子チケット|入場券|入場整理券|TICKET|E-?TICKET|ADMISSION|ADMIT\s*ONE|入场券|门票|門票|电子票|電子票|観覧券|鑑賞券|指定席|自由席|指定席券|乗車券|特急券|座席|整理番号|開場|開演|OPEN|START|DATE|TIME|SEAT|ROW|GATE|PRICE|料金|会場|VENUE|入場口|一般|大人|小人|学生|ADULT|CHILD|STUDENT|S席|A席|SS席|VIP|BOARDING\s*PASS|搭乗券|登机牌|티켓|입장권|관람권)$/i;

/** 注意事项、主办方、网址等说明文字 */
const NOTICE =
  /(※|注意|ご注意|禁止|払戻|払い戻し|再入場|再発行|転売|转售|退票|退换|不可|無効|无效|お問い?合わ?せ|問合せ|https?:|www\.|\.com|\.jp|\.cn|主催|主办|主辦|協力|後援|承办|協賛|\bTEL\b|電話|电话|\bNOTICE\b|PROHIBITED|REFUND|不得|请|請|ください|下さい|します|\bPlease\b|\bmust\b|valid only|有効|当日限り|途中下車|前途無効)/i;

/** 可以作为标题的行吗（不是日期 / 时间 / 价格 / 座位 / 敏感 / 固定字样 / 说明文字） */
export function isTitleCandidate(line: NormLine): boolean {
  const t = line.text;
  if (line.confidence < RECOGNIZE_CONFIG.noiseLineConfidence) return false;
  if (t.length < 2 || t.length > 40) return false;
  const letters = t.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 2) return false;
  // 数字和符号占大多数的行
  if (letters / t.replace(/\s/g, '').length < 0.5) return false;
  if (BOILERPLATE.test(t.replace(/[\s:：・/]/g, ''))) return false;
  if (NOTICE.test(t)) return false;
  return true;
}

const TITLE_LABEL =
  /^(?:公演名|イベント名|作品名|演目|演出名称|演出项目|演出項目|节目名称|節目名稱|影片|片名|映画名|电影|電影|EVENT|TITLE|SHOW|PERFORMANCE|공연명|영화)\s*[:：]\s*(.+)$/i;

/** 带标签的标题（「公演名：…」「影片：…」）。确定度较高 */
export function labeledTitle(lines: readonly NormLine[]): Hit<string> | null {
  for (const line of lines) {
    const m = TITLE_LABEL.exec(line.text);
    const v = m?.[1]?.trim();
    if (v && v.length >= 2) {
      return { value: v, certainty: 0.88, line: line.index, rule: 'title:labeled' };
    }
  }
  return null;
}

/** 「A vs B」类体育比赛标题 */
export function versusTitle(
  lines: readonly NormLine[],
): (Hit<string> & { home: string; away: string }) | null {
  for (const line of lines) {
    const m =
      /^(.{2,30}?)\s*(?:(?<![A-Za-z])vs\.?(?![A-Za-z])|VS\.?|\s対\s|\s×\s)\s*(.{2,30})$/i.exec(
        line.text,
      );
    if (m?.[1] && m[2]) {
      const home = m[1].trim();
      const away = m[2].trim();
      return {
        value: `${home} vs ${away}`,
        home,
        away,
        certainty: 0.85,
        line: line.index,
        rule: 'title:versus',
      };
    }
  }
  return null;
}

/**
 * 通用标题启发式：在候选行里取字号（框高）最大的一行。
 * 最大行明显比第二大的行高（≥ 1.3 倍）时确定度 0.6，否则 0.5；最终置信度不超过 genericTitleMaxConfidence。
 * 这样演唱会等票的标题通常达不到 0.8，按设计走云端文字模式（02-architecture §6.5 NOTE）。
 */
export function genericTitle(
  lines: readonly NormLine[],
  exclude: ReadonlySet<number>,
  opts: { certainty?: number; rule?: string } = {},
): Hit<string> | null {
  const candidates = lines
    .filter((l) => !exclude.has(l.index) && isTitleCandidate(l))
    // 高度相同时取更靠上的
    .sort((a, b) => b.box[3] - a.box[3] || a.box[1] - b.box[1]);
  const best = candidates[0];
  if (!best) return null;
  const second = candidates[1];
  const dominant = !second || best.box[3] >= second.box[3] * 1.3;
  const certainty = opts.certainty ?? (dominant ? 0.6 : 0.5);
  return { value: best.text, certainty, line: best.index, rule: opts.rule ?? 'title:generic' };
}
