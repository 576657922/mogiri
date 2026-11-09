import type { SENSITIVE_KINDS } from '../recognition';

export type SensitiveKind = (typeof SENSITIVE_KINDS)[number];

/** 姓名类标签 */
const NAME_LABEL =
  /(お名前|氏名|ご購入者|購入者名|姓名|乘客姓名|PASSENGER|\bNAME\b|이름|성명|예매자)/i;

/** 订单号 / 会员号类标签（注意：「整理番号」是需要的字段，不算敏感） */
const BOOKING_LABEL =
  /(予約番号|受付番号|購入番号|注文番号|申込番号|お問い?合わ?せ番号|引換番号|確認番号|会員番号|会员号|会员卡号|订单号|订单编号|訂單編號|取票码|取票號|取票号|验证码|BOOKING|CONFIRMATION|RESERVATION|ORDER\s*(?:NO|#|NUMBER)|\bPNR\b|MEMBER\s*(?:NO|#|ID)|예매번호|예약번호|주문번호|회원번호)/i;

const LABELS_RE = new RegExp(`${NAME_LABEL.source}|${BOOKING_LABEL.source}`, 'gi');

/** 10 位以上的连续数字（允许中间用连字符分隔，例如 1234-5678-9012） */
export function hasLongDigitRun(text: string): boolean {
  const runs = text.match(/\d(?:[\d-]*\d)?/g) ?? [];
  return runs.some((r) => r.replace(/-/g, '').length >= 10);
}

/** 这一行属于哪种敏感信息；不敏感返回 null */
/** 机票 / 护照式的拉丁字母姓名：「YAMADA/TARO MR」 */
const LATIN_NAME = /^[A-Z]{2,}\/[A-Z]{2,}(?:\s+(?:MR|MS|MRS|MISS|MSTR|DR))?$/;

export function detectSensitive(text: string): SensitiveKind | null {
  if (NAME_LABEL.test(text) || LATIN_NAME.test(text.trim())) return 'name';
  if (BOOKING_LABEL.test(text)) return 'booking_ref';
  if (hasLongDigitRun(text)) return 'booking_ref';
  return null;
}

/** 这一行是否只有敏感标签、没有值（值在下一行） */
export function isLabelOnly(text: string): boolean {
  const rest = text.replace(LABELS_RE, '').replace(/[\s:：.#/／()（）\-\]【】[]/g, '');
  return rest.length === 0;
}

/**
 * 找出所有敏感行（按数组顺序；标签单独一行时，连同下一行一起算敏感）。
 * 返回敏感行的下标集合和命中的敏感类别。
 */
export function findSensitiveLines(texts: readonly string[]): {
  indices: Set<number>;
  kinds: Set<SensitiveKind>;
} {
  const indices = new Set<number>();
  const kinds = new Set<SensitiveKind>();
  texts.forEach((t, i) => {
    const kind = detectSensitive(t);
    if (!kind) return;
    indices.add(i);
    kinds.add(kind);
    if (isLabelOnly(t) && i + 1 < texts.length) indices.add(i + 1);
  });
  return { indices, kinds };
}
