/**
 * 云端兜底（大模型）的提示词、Schema、输出校验和提供商接口。
 * 具体的 HTTP 调用在 Edge Function 里实现（见 02-architecture §6.6）。
 */
export { clampConfidence, ModelOutputError, normalizeLocalIso, parseModelOutput } from './output';
export {
  type AiHints,
  buildImagePrompt,
  buildTextPrompt,
  formatOcrLines,
  SYSTEM_PROMPT,
  toAiHints,
  toJsonSchema,
} from './prompt';
export type { AiImageInput, AiProvider } from './provider';
