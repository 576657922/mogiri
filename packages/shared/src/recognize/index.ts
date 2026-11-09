/**
 * 本地票据识别引擎（纯 TypeScript，不依赖平台）。见 02-architecture §6。
 */
export { type Classification, classify, scoreTypes } from './classify';
export { FUTURE_WINDOW_DAYS, RECOGNIZE_CONFIG } from './config';
export { type DateHit, extractDates, pickEventDate } from './extract/date';
export { extractPrices, type PriceHit, pickPrice, yenCurrency } from './extract/price';
export { extractRoutes, type RouteHit } from './extract/route';
export { extractSeats, pickSeat, type SeatHit } from './extract/seat';
export { extractTimes, type TimeHit, type TimeRole } from './extract/time';
export { extractEntryNo, extractVenue } from './extract/venue';
export { detectLanguage, type TicketLanguage } from './lang';
export { normalizeText, toHalfWidth } from './normalize';
export {
  type DecisionContext,
  decideNextStep,
  isComplete,
  mergeResults,
  type NextStep,
  normalizeLines,
  ocrQuality,
  recognizeLocal,
  shouldEscalateToImage,
  stripSensitiveLines,
} from './pipeline';
export { detectSensitive, findSensitiveLines, type SensitiveKind } from './sensitive';
export type { Box, LocalRecognition, OcrLine, RecognizeHints } from './types';
export { inferYear, type YMD } from './year';
