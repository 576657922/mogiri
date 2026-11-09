import type { RecognitionResult } from '../recognition';
import type { OcrLine } from '../recognize/types';
import type { AiHints } from './prompt';

/** 图片模式的输入（压缩图：长边 1280，JPEG 质量 0.8；见 02-architecture §6.1） */
export type AiImageInput = {
  mimeType: string;
  /** 原始字节，或 base64 字符串 */
  data: Uint8Array | string;
};

/**
 * 大模型调用抽象（02-architecture §6.6）。Edge Function 里实现具体的提供商（例如 Gemini），
 * 以后可以换成其他提供商。实现方需要：
 * - 使用 prompt.ts 的 SYSTEM_PROMPT / buildTextPrompt / buildImagePrompt 和 toJsonSchema()；
 * - 用 parseModelOutput() 校验并规范化模型输出；
 * - 文字模式只接收已经 stripSensitiveLines 的行；任何情况下都不发送条码内容。
 */
export interface AiProvider {
  /** 云端文字模式：只发送 OCR 文字行 */
  recognizeText(lines: readonly OcrLine[], hints: AiHints): Promise<RecognitionResult>;
  /** 云端图片模式：发送压缩图 */
  recognizeImage(image: AiImageInput, hints: AiHints): Promise<RecognitionResult>;
}
