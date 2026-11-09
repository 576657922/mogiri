/**
 * 识别流程的所有阈值（见 02-architecture §6.1、03-development §5.7）。
 * ⚠️ 改动后必须重跑评测集（fixtures.test.ts），确认准确率没有下降。
 */
export const RECOGNIZE_CONFIG = {
  /** 本地结果够用：title 和 eventAt 的置信度都 ≥ 该值 → 'done' */
  localDoneConfidence: 0.8,
  /** OCR 文字质量够用（ocrQuality ≥ 该值）→ 走云端文字模式，否则走图片模式 */
  ocrQualityMin: 0.6,
  /** OCR 有效字符（字母 / 数字 / 汉字 / 假名 / 韩文）最少个数 */
  ocrMinValidChars: 15,
  /** 云端文字模式返回的 title / eventAt 置信度 < 该值 → 升级到图片模式 */
  cloudEscalateBelow: 0.5,
  /**
   * 本地规则（非条码）给出的置信度上限。
   * 置信度 1 保留给条码解析出的字段（02-architecture §6.6「条码字段视为 1」）。
   */
  localMaxConfidence: 0.98,
  /** 通用标题启发式（「字号最大的那一行」）的置信度上限：故意低于 localDoneConfidence */
  genericTitleMaxConfidence: 0.6,
  /** 置信度低于该值的 OCR 行视为噪声，不参与标题等提取 */
  noiseLineConfidence: 0.4,
} as const;

/**
 * 推断年份时，「未来」方向允许的天数窗口（见 year.ts）。
 * 依据：JR 指定席最早提前 1 个月发售；登机牌一般在起飞前 1–2 天才出；
 * 电影票通常提前几天买；演出 / 展览可能提前数月，但这类票绝大多数印有年份。
 */
export const FUTURE_WINDOW_DAYS = {
  train: 31,
  flight: 7,
  movie: 14,
  concert: 180,
  theater: 180,
  sports: 120,
  exhibition: 90,
  other: 31,
} as const;
