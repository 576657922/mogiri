/**
 * 测试用的 BCBP 构造器（合成数据，姓名 / PNR 都是假的）。
 * 也方便以后在 fixtures 里生成条码内容。
 */

export type BcbpLegInput = {
  pnr: string;
  from: string;
  to: string;
  carrier: string;
  /** 航班号（不含航司），例如 '834' */
  flight: string;
  julian: number;
  compartment: string;
  /** 例如 '1A'；空字符串表示无座位 */
  seat: string;
  sequence: number;
  status?: string;
  /** 可变字段（条件字段 + 航司自用），不含长度前缀 */
  variable?: string;
};

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

function encodeSeat(seat: string): string {
  if (!seat) return '    ';
  const m = /^(\d+)([A-Z])$/.exec(seat);
  return m ? `${(m[1] ?? '').padStart(3, '0')}${m[2]}` : seat.padEnd(4, ' ');
}

export function buildLeg(l: BcbpLegInput): string {
  const variable = l.variable ?? '';
  return [
    l.pnr.padEnd(7, ' '),
    l.from,
    l.to,
    l.carrier.padEnd(3, ' '),
    l.flight.padStart(4, '0').padEnd(5, ' '),
    String(l.julian).padStart(3, '0'),
    l.compartment,
    encodeSeat(l.seat),
    String(l.sequence).padStart(4, '0').padEnd(5, ' '),
    l.status ?? '1',
    hex2(variable.length),
    variable,
  ].join('');
}

export function buildBcbp(name: string, legs: BcbpLegInput[], security?: string): string {
  const header = `M${legs.length}${name.padEnd(20, ' ').slice(0, 20)}E`;
  const sec = security ? `^1${hex2(security.length)}${security}` : '';
  return header + legs.map(buildLeg).join('') + sec;
}

/** 重复条件字段：航司数字代码(3) 票号(10) 安检(1) 证件核验(1) 市场方航司(3) 常旅客航司(3) 常旅客号(16) ID/AD(1) 免费行李(3) 快速通道(1) */
export function buildRepeatedConditional(marketing: string): string {
  const body = `2052123456789 0${marketing.padEnd(3, ' ')}${marketing.padEnd(3, ' ')}${'1234567890'.padEnd(16, ' ')} 20KN`;
  return `${hex2(body.length)}${body}`;
}

/** 第一个航段的可变字段：'>' + 版本 + 唯一条件字段 + 重复条件字段 */
export function buildFirstLegVariable(version: number, issue: string, marketing: string): string {
  const unique = `1WW${issue}BNH `;
  return `>${version}${hex2(unique.length)}${unique}${buildRepeatedConditional(marketing)}`;
}

export const BCBP_SAMPLES = {
  /** 带版本 6、签发日期 6312（2026 年第 312 天）、市场方航司 NH、安全数据 */
  withConditional: buildBcbp(
    'SATO/HANAKO',
    [
      {
        pnr: 'QWE456',
        from: 'HND',
        to: 'CTS',
        carrier: 'NH',
        flight: '61',
        julian: 313,
        compartment: 'Y',
        seat: '23K',
        sequence: 102,
        variable: buildFirstLegVariable(6, '6312', 'NH'),
      },
    ],
    'FAKESIGNATURE',
  ),
  /** 两个航段 */
  twoLegs: buildBcbp('MUSTERMANN/MAX', [
    {
      pnr: 'ZXC789',
      from: 'JFK',
      to: 'FRA',
      carrier: 'LH',
      flight: '401',
      julian: 310,
      compartment: 'Y',
      seat: '41A',
      sequence: 33,
    },
    {
      pnr: 'ZXC789',
      from: 'FRA',
      to: 'MUC',
      carrier: 'LH',
      flight: '1234',
      julian: 311,
      compartment: 'Y',
      seat: '23C',
      sequence: 8,
      variable: buildRepeatedConditional('LH'),
    },
  ]),
} as const;
