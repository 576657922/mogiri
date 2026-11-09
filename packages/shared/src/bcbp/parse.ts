/**
 * IATA BCBP（Bar Coded Boarding Pass，Resolution 792）解析。
 *
 * 只解析 Format 'M'。结构：
 *
 * | 部分                 | 长度 | 说明                                         |
 * | -------------------- | ---- | -------------------------------------------- |
 * | Format Code          | 1    | 'M'                                          |
 * | Number of Legs       | 1    | 1–4                                          |
 * | Passenger Name       | 20   | ⚠️ 敏感                                      |
 * | E-ticket Indicator   | 1    | 'E'                                          |
 * | 每个航段的必填部分   | 35   | PNR(7) 出发(3) 到达(3) 航司(3) 航班号(5) 儒略日(3) 舱位(1) 座位(4) 值机序号(5) 状态(1) |
 * | 每个航段的可变字段长度 | 2  | 十六进制                                     |
 * | 可变字段             | n    | 第一个航段以 '>' 开头，包含版本号和唯一条件字段 |
 * | 安全数据（可选）     |      | '^' 开头                                     |
 *
 * 敏感字段：passengerName、pnr。这些字段只在本地使用，**绝不上传**（OCR-05）。
 */

export type BcbpLeg = {
  /** ⚠️ 敏感：订座记录编号 */
  pnr: string;
  /** 出发机场 IATA 三字码 */
  from: string;
  /** 到达机场 IATA 三字码 */
  to: string;
  /** 运营航司 IATA 代码（去掉空格），例如 'AC' */
  carrier: string;
  /** 航班号（去掉前导零和空格），例如 '834'、'12A' */
  flightNumber: string;
  /** 航司 + 航班号，例如 'AC834' */
  flightNo: string;
  /** 航班日期：一年中的第几天（1–366），年份需要另外推断 */
  julianDate: number;
  /** 舱位代码（订座舱位，例如 'J'、'Y'） */
  compartment: string;
  /** 座位，例如 '1A'；没有座位（空白）时为 null；'INF' 等原样保留 */
  seat: string | null;
  /** 值机序号，例如 '25'；空白时为 null */
  checkInSequence: string | null;
  passengerStatus: string;
  /** 条件字段：市场方航司 */
  marketingCarrier?: string;
};

export type BcbpResult = {
  formatCode: 'M';
  legCount: number;
  /** ⚠️ 敏感：旅客姓名（「SURNAME/GIVEN」） */
  passengerName: string;
  electronicTicket: boolean;
  /** BCBP 版本号（条件字段） */
  version?: number;
  /** 登机牌签发日期（条件字段）：年份的最后一位 + 儒略日，用来确定航班年份 */
  issueDate?: { yearDigit: number; julianDate: number };
  legs: BcbpLeg[];
  hasSecurityData: boolean;
};

const UNIQUE_HEADER_LEN = 23;
const LEG_MANDATORY_LEN = 35;

const parseHex = (s: string | undefined): number | null =>
  s !== undefined && /^[0-9A-Fa-f]{2}$/.test(s) ? Number.parseInt(s, 16) : null;

/** 「0834 」→「834」，「0012A」→「12A」 */
export function normalizeFlightNumber(raw: string): string {
  const t = raw.trim();
  const m = /^0*(\d+)([A-Z]?)$/.exec(t);
  if (!m) return t;
  return `${m[1]}${m[2] ?? ''}`;
}

/** 「001A」→「1A」，「012A」→「12A」；空白 → null */
export function normalizeSeat(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const m = /^0*(\d+)([A-Z])$/.exec(t);
  return m ? `${m[1]}${m[2]}` : t;
}

/** 「0025 」→「25」 */
function normalizeSequence(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const m = /^0*(\d+)([A-Z]?)$/.exec(t);
  return m ? `${m[1]}${m[2] ?? ''}` : t;
}

function parseMandatoryLeg(s: string): BcbpLeg | null {
  const pnr = s.slice(0, 7).trim();
  const from = s.slice(7, 10);
  const to = s.slice(10, 13);
  const carrier = s.slice(13, 16).trim();
  const flightRaw = s.slice(16, 21);
  const julianRaw = s.slice(21, 24);
  const compartment = s.slice(24, 25).trim();
  const seatRaw = s.slice(25, 29);
  const seqRaw = s.slice(29, 34);
  const passengerStatus = s.slice(34, 35).trim();

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  if (!/^[A-Z0-9]{2,3}$/.test(carrier)) return null;
  if (!/^\d{3}$/.test(julianRaw.trim().padStart(3, '0'))) return null;
  const julianDate = Number(julianRaw.trim());
  if (!Number.isInteger(julianDate) || julianDate < 1 || julianDate > 366) return null;
  const flightNumber = normalizeFlightNumber(flightRaw);
  if (!/^\d{1,4}[A-Z]?$/.test(flightNumber)) return null;

  return {
    pnr,
    from,
    to,
    carrier,
    flightNumber,
    flightNo: `${carrier}${flightNumber}`,
    julianDate,
    compartment,
    seat: normalizeSeat(seatRaw),
    checkInSequence: normalizeSequence(seqRaw),
    passengerStatus,
  };
}

/** 解析「重复条件字段」：长度(2 hex) + 航司数字代码(3) 票号(10) 安检(1) 证件核验(1) 市场方航司(3) … */
function parseRepeatedConditional(field: string): { marketingCarrier?: string } {
  const size = parseHex(field.slice(0, 2));
  if (size === null || size < 18) return {};
  const body = field.slice(2, 2 + size);
  const marketing = body.slice(15, 18).trim();
  return /^[A-Z0-9]{2,3}$/.test(marketing) ? { marketingCarrier: marketing } : {};
}

/**
 * 解析 BCBP 字符串；不是合法的 Format M 返回 null。
 * 条件字段解析失败时忽略，只保留必填字段。
 */
export function parseBcbp(raw: string): BcbpResult | null {
  let s = raw.replace(/[\r\n]+$/, '');
  const minLen = UNIQUE_HEADER_LEN + LEG_MANDATORY_LEN + 2;
  // 扫描器有时会去掉末尾空格：差几个字符时用空格补齐
  if (s.length < minLen && s.length >= minLen - 8) s = s.padEnd(minLen, ' ');
  if (s.length < minLen || s[0] !== 'M') return null;

  const legCount = Number(s[1]);
  if (!Number.isInteger(legCount) || legCount < 1 || legCount > 4) return null;

  const result: BcbpResult = {
    formatCode: 'M',
    legCount,
    passengerName: s.slice(2, 22).trim(),
    electronicTicket: s[22] === 'E',
    legs: [],
    hasSecurityData: false,
  };

  let pos = UNIQUE_HEADER_LEN;
  for (let i = 0; i < legCount; i++) {
    const mandatory = s.slice(pos, pos + LEG_MANDATORY_LEN);
    if (mandatory.length < LEG_MANDATORY_LEN) return null;
    const leg = parseMandatoryLeg(mandatory);
    if (!leg) return null;
    pos += LEG_MANDATORY_LEN;

    const sizeField = s.slice(pos, pos + 2);
    // 被截断补齐的空白长度字段按 0 处理
    const varSize = sizeField.trim() === '' ? 0 : parseHex(sizeField);
    if (varSize === null) return null;
    pos += 2;
    const variable = s.slice(pos, pos + varSize);
    pos += varSize;

    if (i === 0 && variable.startsWith('>')) {
      const version = Number(variable[1]);
      if (Number.isInteger(version)) result.version = version;
      const uniqueSize = parseHex(variable.slice(2, 4));
      if (uniqueSize !== null) {
        const unique = variable.slice(4, 4 + uniqueSize);
        // 旅客描述(1) 值机来源(1) 登机牌签发来源(1) 签发日期(4) …
        const issue = unique.slice(3, 7);
        if (/^\d{4}$/.test(issue)) {
          const julian = Number(issue.slice(1));
          if (julian >= 1 && julian <= 366) {
            result.issueDate = { yearDigit: Number(issue[0]), julianDate: julian };
          }
        }
        Object.assign(leg, parseRepeatedConditional(variable.slice(4 + uniqueSize)));
      }
    } else if (variable.length >= 2) {
      Object.assign(leg, parseRepeatedConditional(variable));
    }
    result.legs.push(leg);
  }

  result.hasSecurityData = s.slice(pos).startsWith('^');
  return result;
}

/** 看起来像 BCBP 吗（用于在扫描到条码时快速判断） */
export function looksLikeBcbp(raw: string): boolean {
  return /^M[1-4].{20}[E ]/.test(raw) && raw.length >= 58;
}
