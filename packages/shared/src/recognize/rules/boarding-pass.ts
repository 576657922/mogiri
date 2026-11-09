import type { BcbpResult } from '../../bcbp/parse';
import { bcbpToRecognition } from '../../bcbp/recognition';
import { fieldConfidence } from '../confidence';
import { formatDate, formatTime, parseIsoDate } from '../year';
import type { Draft, RuleContext } from './context';
import { addRule, findLabeledValue, setDetail, setField, toField } from './util';

const GATE_LABEL = /(?:GATE|搭乗口|登机口|登機門|게이트|탑승구)/i;
const GATE_VALUE = /[A-Z]?\d{1,3}[A-Z]?/;
const BOARDING_LABEL =
  /(?:BOARDING\s*TIME|BOARDING(?!\s*PASS)|搭乗開始時刻|搭乗開始|搭乗時刻|登机时间|登機時間|탑승\s*시간)/i;
const DEPARTURE_LABEL =
  /(?:DEPARTURE\s*TIME|DEPARTURE|DEP|出発時刻|出発|起飞时间|起飛時間|출발\s*시간|출발)/i;
const TIME_VALUE = /\d{1,2}:\d{2}/;
const FLIGHT_LABEL = /(?:FLIGHT\s*(?:NO\.?)?|FLT|便名|航班号?|航班號|편명)/i;
const FLIGHT_VALUE = /[A-Z0-9]{2}\s?\d{1,4}[A-Z]?/;
const IATA_PAIR = /(?<![A-Z])([A-Z]{3})\s*(?:→|->|>|-|–|TO|✈)\s*([A-Z]{3})(?![A-Z])/;

const parseHm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h !== undefined && m !== undefined && h <= 23 && m <= 59 ? { hour: h, minute: m } : null;
};

/**
 * 登机牌规则。条码（BCBP）字段为准、置信度 1，并记录到 barcodeFields；
 * OCR 只补充登机口、登机时间、出发时间（02-architecture §6.5 ③）。
 * 没有条码时用 OCR 做基本的航班号 / 机场对提取。
 */
export function applyBoardingPassRules(
  ctx: RuleContext,
  draft: Draft,
  bcbp: BcbpResult | null,
): void {
  const { lines } = ctx;

  if (bcbp) {
    const ref = ctx.hints.capturedAt ?? formatDate(ctx.refDate);
    const r = bcbpToRecognition(bcbp, ref);
    addRule(draft, 'bcbp');
    if (r.title) {
      draft.title = { ...r.title, rule: 'bcbp' };
      draft.barcodeFields.push('title');
    }
    if (r.subtitle) {
      draft.subtitle = r.subtitle;
      draft.barcodeFields.push('subtitle');
    }
    if (r.seat) {
      draft.seat = r.seat;
      draft.barcodeFields.push('seat');
    }
    for (const [k, v] of Object.entries(r.details ?? {})) {
      draft.details[k] = v;
      draft.barcodeFields.push(`details.${k}`);
    }
    const ymd = r.eventAt ? parseIsoDate(r.eventAt.value) : null;
    if (ymd) {
      draft.date = { ymd, confidence: 1 };
      draft.barcodeFields.push('eventAt.date');
    }
    draft.barcodeFields.push('type');
  } else {
    const flight = findLabeledValue(lines, FLIGHT_LABEL, FLIGHT_VALUE);
    if (flight) {
      const no = flight.value.replace(/\s+/g, '');
      setDetail(
        draft,
        'flightNo',
        no,
        fieldConfidence(flight.certainty, ctx.lineConf(flight.line)),
        'bp:flight-no',
      );
      setDetail(draft, 'airline', no.slice(0, 2), fieldConfidence(0.8, ctx.lineConf(flight.line)));
    }
    for (const line of lines) {
      const m = IATA_PAIR.exec(line.text);
      if (m?.[1] && m[2]) {
        const conf = fieldConfidence(0.85, ctx.lineConf(line.index));
        setDetail(draft, 'from', m[1], conf, 'bp:iata-pair');
        setDetail(draft, 'to', m[2], conf);
        draft.usedLines.add(line.index);
        break;
      }
    }
    const no = draft.details.flightNo;
    const from = draft.details.from;
    const to = draft.details.to;
    if (no && from && to) {
      setField(draft, 'title', {
        value: `${no.value} ${from.value}→${to.value}`,
        confidence: Math.min(no.confidence, from.confidence),
        rule: 'bp:title',
      });
    }
  }

  // 登机口
  const gate = findLabeledValue(lines, GATE_LABEL, GATE_VALUE);
  if (gate) {
    const f = toField(ctx, gate);
    setDetail(draft, 'gate', f.value, f.confidence, 'bp:gate');
    draft.usedLines.add(gate.line);
  }

  // 登机时间
  const boarding = findLabeledValue(lines, BOARDING_LABEL, TIME_VALUE);
  const bt = boarding ? parseHm(boarding.value) : null;
  if (boarding && bt) {
    const f = toField(ctx, boarding);
    setDetail(
      draft,
      'boardingTime',
      formatTime(bt.hour, bt.minute),
      f.confidence,
      'bp:boarding-time',
    );
  }

  // 出发时间 → eventAt 的时间部分（只认带标签的时间，避免把登机时间当成出发时间）
  const dep = findLabeledValue(lines, DEPARTURE_LABEL, TIME_VALUE);
  const dt = dep ? parseHm(dep.value) : null;
  if (dep && dt && !(boarding && dep.line === boarding.line && dep.value === boarding.value)) {
    draft.time = { ...dt, confidence: toField(ctx, dep).confidence };
    addRule(draft, 'bp:departure-time');
  } else {
    // 不使用通用时间（可能是登机时间）
    delete draft.time;
  }
  if (bcbp && draft.seat) addRule(draft, 'bp:seat-from-bcbp');
}
