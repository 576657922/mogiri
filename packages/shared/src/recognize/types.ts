import type { RecognitionResult } from '../recognition';

/** 相对坐标 0..1：[x, y, w, h] */
export type Box = [x: number, y: number, w: number, h: number];

/** 平台 OCR 插件输出的一行文字（见 02-architecture §6.4） */
export type OcrLine = {
  text: string;
  box: Box;
  /** 0..1 */
  confidence: number;
};

export type RecognizeHints = {
  /** 拍摄时间（或图片 EXIF 时间），ISO 8601。用于推断票面上缺失的年份 */
  capturedAt?: string;
  /** App 界面语言 / 用户地区，例如 'ja-JP' */
  locale?: string;
  /** zxing 解析出的条码。⚠️ 条码内容从不发送到云端 */
  barcode?: { format: string; text: string };
};

export type LocalRecognition = {
  /** 本地能提取到的字段 */
  result: Partial<RecognitionResult>;
  /** 0..1，用来决定走文字模式还是图片模式 */
  ocrQuality: number;
  /** 例如 ['classify:train', 'jr:route', 'date:ja-md']，用于统计 */
  matchedRules: string[];
  /**
   * 条码（BCBP）解析出的字段路径，例如 'title'、'seat'、'details.flightNo'、'eventAt.date'。
   * 合并云端结果时这些字段永远优先（mergeResults）。
   */
  barcodeFields?: string[];
  /** 本地票型判断的置信度（RecognitionResult.type 本身不带置信度） */
  typeConfidence?: number;
};

/** 规范化之后的一行（内部使用） */
export type NormLine = {
  /** 在原始 lines 数组中的下标 */
  index: number;
  /** 原文 */
  raw: string;
  /** 规范化后的文字 */
  text: string;
  box: Box;
  confidence: number;
};

/** 提取器的一次命中（内部使用） */
export type Hit<T> = {
  value: T;
  /** 规则本身的确定程度 0..1（还没乘 OCR 置信度） */
  certainty: number;
  /** NormLine.index */
  line: number;
  rule: string;
};
