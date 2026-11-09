import { fieldConfidence } from '../confidence';
import { CN_TRAIN_RE, JP_TRAIN_RE } from '../extract/train-names';
import type { Draft, RuleContext } from './context';
import { addRule, setDetail, setField } from './util';

const OPERATOR_RE =
  /JR\s*(東日本|東海|西日本|九州|北海道|四国)|(東日本|東海|西日本|九州|北海道|四国)旅客鉄道/;
const TICKET_KIND_RE =
  /(新幹線特急券|指定席特急券|自由席特急券|特急券|乗車券|グリーン券|指定席券|寝台券)/g;
const SEAT_CLASS_RE =
  /(グランクラス|グリーン車?|指定席|自由席|普通車|商务座|一等座|二等座|硬卧|软卧|硬座)/g;
const SEAT_CLASS_PRIORITY = [
  'グランクラス',
  'グリーン',
  '商务座',
  '一等座',
  '二等座',
  '软卧',
  '硬卧',
  '硬座',
  '指定席',
  '自由席',
  '普通車',
];

/**
 * 火车票规则（以 JR 磁气券为主，中国铁路车次只做最基本的支持）：
 * 车次（「のぞみ 123号」/ G1234）、铁路公司、乘车区间、车厢 / 座位 / 席别、出发时间。
 * 标题：「のぞみ 123号 東京→新大阪」；没有车次时用区间「東京→新大阪」。
 */
export function applyTrainRules(ctx: RuleContext, draft: Draft): void {
  const { lines } = ctx;

  // 车次
  let trainName: { value: string; confidence: number; line: number } | null = null;
  for (const line of lines) {
    JP_TRAIN_RE.lastIndex = 0;
    const m = JP_TRAIN_RE.exec(line.text);
    if (m?.[1] && m[2]) {
      trainName = {
        value: `${m[1]} ${Number(m[2])}号`,
        confidence: fieldConfidence(0.95, ctx.lineConf(line.index)),
        line: line.index,
      };
      addRule(draft, 'jr:train-name');
      break;
    }
  }
  if (!trainName) {
    for (const line of lines) {
      CN_TRAIN_RE.lastIndex = 0;
      const m = CN_TRAIN_RE.exec(line.text);
      if (m?.[1] && /车次|次|高铁|动车|铁路|站/.test(ctx.lines.map((l) => l.text).join(' '))) {
        trainName = {
          value: m[1],
          confidence: fieldConfidence(0.85, ctx.lineConf(line.index)),
          line: line.index,
        };
        addRule(draft, 'train:cn-number');
        break;
      }
    }
  }
  if (trainName) {
    setDetail(draft, 'trainName', trainName.value, trainName.confidence);
    draft.usedLines.add(trainName.line);
  }

  // 铁路公司
  const allText = lines.map((l) => l.text).join('\n');
  const op = OPERATOR_RE.exec(allText);
  if (op) {
    const line = lines.find((l) => OPERATOR_RE.test(l.text));
    setDetail(
      draft,
      'operator',
      `JR${op[1] ?? op[2] ?? ''}`,
      fieldConfidence(0.95, line ? ctx.lineConf(line.index) : 0.9),
      'jr:operator',
    );
  } else if (/\bJR\b/.test(allText)) {
    setDetail(draft, 'operator', 'JR', 0.6, 'jr:operator-generic');
  }

  // 乘车区间
  const route = [...ctx.routes].sort(
    (a, b) => b.certainty * ctx.lineConf(b.line) - a.certainty * ctx.lineConf(a.line),
  )[0];
  let routeConf = 0;
  if (route) {
    routeConf = fieldConfidence(route.certainty, ctx.lineConf(route.line));
    setDetail(draft, 'from', route.value.from, routeConf, 'jr:route');
    setDetail(draft, 'to', route.value.to, routeConf);
    draft.usedLines.add(route.line);
  }

  // 券种 → 副标题（「乗車券・新幹線特急券」）
  const kinds = [...new Set([...allText.matchAll(TICKET_KIND_RE)].map((m) => m[1] ?? ''))].filter(
    Boolean,
  );
  if (kinds.length) {
    setField(draft, 'subtitle', {
      value: kinds.join('・'),
      confidence: 0.85,
      rule: 'jr:ticket-kind',
    });
  }

  // 席别
  const classes = [...allText.matchAll(SEAT_CLASS_RE)].map((m) =>
    (m[1] ?? '').replace(/^グリーン車$/, 'グリーン'),
  );
  const seatClass = SEAT_CLASS_PRIORITY.find((c) => classes.includes(c));
  if (seatClass) setDetail(draft, 'seatClass', seatClass, 0.9, 'jr:seat-class');

  // 车厢（座位由通用提取给出；车厢放进 details.car）
  const carHit = ctx.seats.find((s) => s.value.car);
  if (carHit?.value.car) {
    setDetail(
      draft,
      'car',
      carHit.value.car,
      fieldConfidence(carHit.certainty, ctx.lineConf(carHit.line)),
      'jr:car',
    );
  }

  // 标题
  if (trainName && route) {
    setField(draft, 'title', {
      value: `${trainName.value} ${route.value.from}→${route.value.to}`,
      confidence: Math.min(trainName.confidence, routeConf),
      rule: 'jr:title',
    });
  } else if (route) {
    setField(draft, 'title', {
      value: `${route.value.from}→${route.value.to}`,
      confidence: fieldConfidence(0.92, ctx.lineConf(route.line)),
      rule: 'jr:title-route',
    });
  } else if (trainName) {
    setField(draft, 'title', {
      value: trainName.value,
      confidence: Math.min(0.75, trainName.confidence),
      rule: 'jr:title-train',
    });
  }

  // 时区：日文车票 → 日本；中文车票 → 中国
  if (ctx.lang === 'ja' || op) {
    draft.timezone = { value: 'Asia/Tokyo', confidence: 0.9 };
    draft.country = { value: 'JP', confidence: 0.9 };
  } else if (ctx.lang === 'zh') {
    draft.timezone = { value: 'Asia/Shanghai', confidence: 0.7 };
    draft.country = { value: 'CN', confidence: 0.7 };
  }
}
