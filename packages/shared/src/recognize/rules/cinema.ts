import { fieldConfidence } from '../confidence';
import { genericTitle, labeledTitle } from '../title';
import type { Draft, RuleContext } from './context';
import { setDetail, setField, toField } from './util';

/**
 * 连锁影院（P1：基础版本）。名称后面通常跟分店名（「TOHOシネマズ 新宿」「万达影城(CBD店)」），整行作为影院名。
 */
const CINEMA_CHAINS =
  /(TOHO\s*シネマズ|TOHO\s*CINEMAS|イオンシネマ|109\s*シネマズ|ユナイテッド・?シネマ|シネマサンシャイン|MOVIX|T・?ジョイ|新宿ピカデリー|ミッドランドスクエアシネマ|コロナシネマワールド|万达影城|万达影院|萬達影城|CGV|博纳国际影城|博納國際影城|横店电影城|金逸影城|大地影院|星美国际影城|UME国际影城|百老汇影城|SFC上影|卢米埃影城|메가박스|롯데시네마|AMC|REGAL|CINEWORLD|ODEON|VUE|CINEMARK)/i;

const SCREEN_RE =
  /(?:(スクリーン|SCREEN|シアター|THEATER|THEATRE|放映厅|影厅|影廳)\s*([A-Z0-9]{1,3})(?![A-Z0-9])|([0-9]{1,2}|[A-Z]{1,6})\s*(号厅|號廳|号影厅|厅|廳|관)(?![\p{L}]))/iu;

const FORMAT_RE =
  /(IMAX\s*(?:3D|レーザー|LASER)?|4DX|MX4D|DOLBY\s*CINEMA|DOLBY\s*ATMOS|SCREENX|ドルビーシネマ|杜比影院|\b3D\b|\b2D\b|字幕版?|吹替版?|国语|英语|原版)/i;

/** 座位单独一行、只有「F-12」或「F12」 */
const BARE_SEAT_RE = /^\s*([A-Z])\s*-?\s*(\d{1,2})\s*$/;

export function applyCinemaRules(ctx: RuleContext, draft: Draft): void {
  const { lines } = ctx;

  // 影院
  const chainLine = lines.find((l) => CINEMA_CHAINS.test(l.text));
  if (chainLine) {
    const name = chainLine.text.trim();
    const conf = fieldConfidence(0.92, ctx.lineConf(chainLine.index));
    setDetail(draft, 'cinema', name, conf, 'cinema:chain');
    setField(
      draft,
      'venue',
      { value: name, confidence: conf, rule: 'cinema:venue' },
      chainLine.index,
    );
  }

  // 影厅
  for (const line of lines) {
    const m = SCREEN_RE.exec(line.text);
    if (!m) continue;
    const value = m[0].replace(/\s+/g, '');
    setDetail(
      draft,
      'screen',
      value,
      fieldConfidence(0.9, ctx.lineConf(line.index)),
      'cinema:screen',
    );
    // 影厅行如果很短（只有影厅），不能作为标题
    if (line.text.replace(/\s/g, '').length <= value.length + 2) draft.usedLines.add(line.index);
    break;
  }

  // 版本
  for (const line of lines) {
    const m = FORMAT_RE.exec(line.text);
    if (m?.[1]) {
      setDetail(
        draft,
        'format',
        m[1].replace(/\s+/g, ' ').trim(),
        fieldConfidence(0.85, ctx.lineConf(line.index)),
        'cinema:format',
      );
      break;
    }
  }

  // 座位：通用提取没找到时，试试单独一行的「F-12」
  if (!draft.seat) {
    for (const line of lines) {
      const m = BARE_SEAT_RE.exec(line.text);
      if (m) {
        setField(
          draft,
          'seat',
          {
            value: `${m[1]}-${m[2]}`,
            confidence: fieldConfidence(0.75, ctx.lineConf(line.index)),
            rule: 'cinema:bare-seat',
          },
          line.index,
        );
        break;
      }
    }
  }

  // 片名：带标签的优先；否则在排除影院名 / 影厅 / 日期时间 / 座位 / 价格之后取字号最大的一行。
  // 识别出连锁影院时版式比较固定，确定度给到 0.85；否则按通用启发式。
  const labeled = labeledTitle(lines);
  if (labeled) {
    setField(draft, 'title', toField(ctx, labeled), labeled.line);
    return;
  }
  const generic = genericTitle(
    lines,
    draft.usedLines,
    chainLine ? { certainty: 0.85, rule: 'cinema:title' } : {},
  );
  if (generic) {
    // 去掉片名前后的版本标记，例如「【字幕】」「(吹替版)」
    const value =
      generic.value.replace(/^[【[(（][^】\])）]{1,6}[】\])）]\s*/, '').trim() || generic.value;
    setField(draft, 'title', toField(ctx, { ...generic, value }), generic.line);
  }
}
