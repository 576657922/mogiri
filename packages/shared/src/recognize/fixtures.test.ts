/**
 * 评测集运行器（03-development §5.7）：对 fixtures/<type>/*.json 跑 recognizeLocal，
 * 校验 *.expected.json 里的字段，并输出每个字段的准确率和「本地识别完成率」。
 *
 * expected 格式：
 * - type / decision：必须一致（decision 按「联网、有额度、iOS」计算）
 * - fields：必须一致（路径写法：title、eventAt、seat、price、venue、details.car …）
 * - bestEffort：只计入准确率，不作为断言（例如演唱会的标题，预期由云端补）
 * - sensitive：结果里必须包含这些敏感类别
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { RecognitionResult } from '../recognition';
import type { TicketType } from '../ticket';
import { RECOGNIZE_CONFIG } from './config';
import { decideNextStep, isComplete, type NextStep, recognizeLocal } from './pipeline';
import type { OcrLine, RecognizeHints } from './types';

type FixtureInput = { description: string; hints: RecognizeHints; lines: OcrLine[] };
type Expected = {
  type: TicketType;
  decision: NextStep;
  fields: Record<string, unknown>;
  bestEffort?: Record<string, unknown>;
  sensitive?: string[];
};

const inputs = import.meta.glob<FixtureInput>(
  ['./fixtures/**/*.json', '!./fixtures/**/*.expected.json'],
  { eager: true, import: 'default' },
);
const expectations = import.meta.glob<Expected>('./fixtures/**/*.expected.json', {
  eager: true,
  import: 'default',
});

function actualValue(r: Partial<RecognitionResult>, path: string): unknown {
  if (path.startsWith('details.')) return r.details?.[path.slice('details.'.length)]?.value;
  const f = r[path as keyof RecognitionResult];
  return typeof f === 'object' && f !== null && 'value' in f ? f.value : undefined;
}

/** 每个字段路径的命中统计 */
const tally = new Map<string, { ok: number; total: number }>();
const completion: Array<{ name: string; complete: boolean; decision: NextStep }> = [];

function record(field: string, ok: boolean) {
  const t = tally.get(field) ?? { ok: 0, total: 0 };
  t.total++;
  if (ok) t.ok++;
  tally.set(field, t);
}

const cases = Object.entries(inputs).map(([path, input]) => {
  const expectedPath = path.replace(/\.json$/, '.expected.json');
  const expected = expectations[expectedPath];
  if (!expected) throw new Error(`missing ${expectedPath}`);
  return { name: path.replace('./fixtures/', '').replace(/\.json$/, ''), input, expected };
});

describe('fixtures（本地识别评测集）', () => {
  it('至少有 8 个样本', () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  for (const { name, input, expected } of cases) {
    it(`${name}: ${input.description}`, () => {
      const local = recognizeLocal(input.lines, input.hints);
      const r = local.result;
      const decision = decideNextStep(local, { online: true, quotaLeft: 10, platform: 'ios' });

      const all = { ...expected.fields, ...(expected.bestEffort ?? {}) };
      for (const [field, want] of Object.entries(all)) {
        record(
          field.startsWith('details.') ? field : field,
          isDeepEqual(actualValue(r, field), want),
        );
      }
      completion.push({
        name,
        complete: isComplete(r, RECOGNIZE_CONFIG.localDoneConfidence),
        decision,
      });

      expect(r.type, 'type').toBe(expected.type);
      for (const [field, want] of Object.entries(expected.fields)) {
        expect(actualValue(r, field), field).toEqual(want);
      }
      for (const kind of expected.sensitive ?? []) {
        expect(r.sensitive, 'sensitive').toContain(kind);
      }
      expect(
        decision,
        `decision (title=${JSON.stringify(r.title)}, eventAt=${JSON.stringify(r.eventAt)})`,
      ).toBe(expected.decision);
    });
  }

  afterAll(() => {
    const rows = [...tally.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([field, t]) =>
          `  ${field.padEnd(22)} ${t.ok}/${t.total}  ${((t.ok / t.total) * 100).toFixed(0)}%`,
      );
    const done = completion.filter((c) => c.complete).length;
    const byDecision = completion.reduce<Record<string, number>>((acc, c) => {
      acc[c.decision] = (acc[c.decision] ?? 0) + 1;
      return acc;
    }, {});
    // shared 包的 tsconfig 没有 DOM / Node 类型，这里手动声明 console
    (globalThis as unknown as { console: { log(s: string): void } }).console.log(
      [
        '',
        '── 本地识别评测（fixtures）──',
        '字段准确率：',
        ...rows,
        `本地识别完成率（title 和 eventAt 置信度 ≥ ${RECOGNIZE_CONFIG.localDoneConfidence}）：${done}/${completion.length} = ${((done / Math.max(1, completion.length)) * 100).toFixed(0)}%`,
        `下一步分布：${JSON.stringify(byDecision)}`,
        '',
      ].join('\n'),
    );
  });
});

function isDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
