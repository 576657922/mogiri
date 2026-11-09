import { type Field, RecognitionResult, SENSITIVE_KINDS } from '../recognition';
import { isValidDate } from '../recognize/year';
import { TicketType } from '../ticket';

/** 模型输出无法修复（不是 JSON 对象，或修复后仍然不符合 Schema） */
export class ModelOutputError extends Error {
  constructor(
    message: string,
    readonly raw: unknown,
  ) {
    super(message);
    this.name = 'ModelOutputError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 宽松解析 JSON：去掉 ```json 代码块，取第一个 { 到最后一个 } */
function parseJsonLoose(s: string): unknown {
  const unfenced = s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const a = unfenced.indexOf('{');
    const b = unfenced.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(unfenced.slice(a, b + 1));
      } catch {
        // 落到下面统一报错
      }
    }
    throw new ModelOutputError('model output is not valid JSON', s);
  }
}

/** 置信度：缺失 → 0.5；2–100 的整数视为百分数 → /100；其余限制在 [0, 1] */
export function clampConfidence(c: unknown): number {
  let n = typeof c === 'string' ? Number(c) : c;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0.5;
  if (n > 1 && n <= 100 && Number.isInteger(n)) n /= 100;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/** 字符串字段：接受 { value, confidence }、裸字符串 / 数字；空字符串 → undefined */
function stringField(v: unknown): Field<string> | undefined {
  if (typeof v === 'string' || typeof v === 'number') {
    const value = String(v).trim();
    return value ? { value, confidence: 0.5 } : undefined;
  }
  if (!isObj(v)) return undefined;
  const raw = v.value;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const value = String(raw).trim();
  if (!value) return undefined;
  return { value, confidence: clampConfidence(v.confidence) };
}

/**
 * 规范化为「YYYY-MM-DD」或「YYYY-MM-DDTHH:mm」。
 * 接受空格分隔、带秒、带时区偏移（偏移会被去掉：Schema 约定为本地时间）。无法识别返回 null。
 */
export function normalizeLocalIso(s: string): string | null {
  const m =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(
      s.trim(),
    );
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidDate(y, mo, d)) return null;
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (m[4] === undefined) return date;
  const h = Number(m[4]);
  const min = Number(m[5]);
  if (h > 23 || min > 59) return null;
  return `${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function priceField(v: unknown): RecognitionResult['price'] {
  if (!isObj(v) || !isObj(v.value)) return undefined;
  const { amount, currency } = v.value;
  const n = typeof amount === 'string' ? Number(amount.replace(/[,\s]/g, '')) : amount;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return undefined;
  if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency.trim())) return undefined;
  return {
    value: { amount: n, currency: currency.trim().toUpperCase() },
    confidence: clampConfidence(v.confidence),
  };
}

const OPTIONAL_STRING_FIELDS = ['subtitle', 'timezone', 'venue', 'city', 'seat'] as const;

/**
 * 校验并规范化大模型的输出（03-development §4：所有外部数据都要过 Zod 校验）：
 * 限制置信度范围、去掉空字符串字段、规范 eventAt 格式、未知票型 → other、过滤未知的敏感类别。
 * @throws ModelOutputError
 */
export function parseModelOutput(raw: unknown): RecognitionResult {
  const data = typeof raw === 'string' ? parseJsonLoose(raw) : raw;
  if (!isObj(data)) throw new ModelOutputError('model output is not an object', raw);

  const typeParsed = TicketType.safeParse(
    typeof data.type === 'string' ? data.type.trim().toLowerCase() : data.type,
  );

  let eventAt = stringField(data.eventAt) ?? { value: '', confidence: 0 };
  if (eventAt.value) {
    const iso = normalizeLocalIso(eventAt.value);
    eventAt = iso
      ? { value: iso, confidence: eventAt.confidence }
      : { value: eventAt.value, confidence: Math.round(eventAt.confidence * 50) / 100 };
  }

  const details: Record<string, Field<string>> = {};
  if (isObj(data.details)) {
    for (const [k, v] of Object.entries(data.details)) {
      const f = stringField(v);
      if (f) details[k] = f;
    }
  }

  const out: RecognitionResult = {
    type: typeParsed.success ? typeParsed.data : 'other',
    title: stringField(data.title) ?? { value: '', confidence: 0 },
    eventAt,
    details,
    language:
      typeof data.language === 'string' && data.language.trim() ? data.language.trim() : 'und',
    sensitive: Array.isArray(data.sensitive)
      ? [
          ...new Set(
            data.sensitive.filter((s): s is (typeof SENSITIVE_KINDS)[number] =>
              (SENSITIVE_KINDS as readonly unknown[]).includes(s),
            ),
          ),
        ]
      : [],
  };
  for (const key of OPTIONAL_STRING_FIELDS) {
    const f = stringField(data[key]);
    if (f) out[key] = f;
  }
  const country = stringField(data.country);
  if (country && /^[A-Za-z]{2}$/.test(country.value)) {
    out.country = { value: country.value.toUpperCase(), confidence: country.confidence };
  }
  const price = priceField(data.price);
  if (price) out.price = price;
  if (typeof data.hasFoil === 'boolean') out.hasFoil = data.hasFoil;

  const checked = RecognitionResult.safeParse(out);
  if (!checked.success) {
    throw new ModelOutputError(
      `model output failed schema validation: ${checked.error.message}`,
      raw,
    );
  }
  return checked.data;
}
