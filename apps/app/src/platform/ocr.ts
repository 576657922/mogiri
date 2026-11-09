import { BCBP_SAMPLES } from '@mogiri/shared/bcbp';
import type { OcrLine, RecognizeHints } from '@mogiri/shared/recognize';

/**
 * 原生 Capacitor OCR 插件协议（见 02-architecture §6.4）。
 * iOS 由 VNRecognizeTextRequest 实现，Android 由 ML Kit Text Recognition v2 实现。
 */
export interface NativeOcrPlugin {
  recognize(opts: { imagePath: string; languages: string[] }): Promise<{ lines: OcrLine[] }>;
}

interface CapacitorWithOcr {
  Plugins?: {
    Ocr?: NativeOcrPlugin;
  };
}

export async function runNativeOcr(
  imagePath: string,
  languages = ['ja', 'zh-Hans', 'zh-Hant', 'en', 'ko'],
): Promise<OcrLine[]> {
  const cap = (globalThis as { Capacitor?: CapacitorWithOcr }).Capacitor;
  const plugin = cap?.Plugins?.Ocr;
  if (!plugin) return [];
  const res = await plugin.recognize({ imagePath, languages });
  return res.lines;
}

export type SampleOcrPreset = {
  id: string;
  labelKey: string;
  lines: OcrLine[];
  hints: RecognizeHints;
};

/**
 * 内置的扫描识别演示样本（假数据，不含任何真实个人信息），
 * 方便在 Web 端或无真机环境下直接体验「本地条码 + 本地 OCR 规则提取 + 置信度决策」全流程。
 */
export const SAMPLE_OCR_PRESETS: SampleOcrPreset[] = [
  {
    id: 'jr-shinkansen',
    labelKey: 'scan.sample.jr',
    hints: { capturedAt: '2026-11-09T10:00:00Z', locale: 'ja-JP' },
    lines: [
      { text: '乗車券・新幹線特急券', box: [0.06, 0.06, 0.56, 0.08], confidence: 0.96 },
      { text: '東京 → 新大阪', box: [0.06, 0.19, 0.72, 0.12], confidence: 0.97 },
      { text: '11月 9日  09:30発  のぞみ 21号', box: [0.06, 0.38, 0.84, 0.08], confidence: 0.95 },
      { text: '7号車 12番A席  指定席', box: [0.06, 0.52, 0.78, 0.09], confidence: 0.96 },
      { text: '¥14,720', box: [0.06, 0.7, 0.3, 0.08], confidence: 0.95 },
      { text: 'JR東海', box: [0.7, 0.84, 0.2, 0.06], confidence: 0.92 },
    ],
  },
  {
    id: 'flight-bcbp',
    labelKey: 'scan.sample.flight',
    hints: {
      capturedAt: '2026-11-09T08:00:00Z',
      locale: 'ja-JP',
      barcode: {
        format: 'PDF_417',
        text: BCBP_SAMPLES.withConditional,
      },
    },
    lines: [
      { text: 'BOARDING PASS 搭乗券', box: [0.45, 0.05, 0.45, 0.06], confidence: 0.96 },
      { text: 'GATE 62', box: [0.45, 0.56, 0.16, 0.07], confidence: 0.94 },
      { text: 'BOARDING 09:45', box: [0.28, 0.56, 0.22, 0.07], confidence: 0.93 },
    ],
  },
  {
    id: 'cinema-toho',
    labelKey: 'scan.sample.movie',
    hints: { capturedAt: '2026-11-09T12:00:00Z', locale: 'ja-JP' },
    lines: [
      { text: 'TOHOシネマズ 新宿', box: [0.08, 0.08, 0.62, 0.07], confidence: 0.96 },
      { text: 'IMAX レーザー', box: [0.68, 0.08, 0.24, 0.06], confidence: 0.92 },
      { text: '銀河鉄道の夜 2026', box: [0.08, 0.24, 0.8, 0.11], confidence: 0.95 },
      { text: '2026年11月9日(月) 19:15', box: [0.08, 0.46, 0.72, 0.08], confidence: 0.95 },
      { text: 'スクリーン10  G-14', box: [0.08, 0.62, 0.6, 0.08], confidence: 0.94 },
      { text: '一般 ¥2,000', box: [0.08, 0.78, 0.35, 0.07], confidence: 0.93 },
    ],
  },
  {
    id: 'concert-live',
    labelKey: 'scan.sample.concert',
    hints: { capturedAt: '2026-11-09T12:00:00Z', locale: 'ja-JP' },
    lines: [
      { text: 'HOSHINO LUMI LIVE TOUR 2026', box: [0.12, 0.1, 0.76, 0.06], confidence: 0.91 },
      { text: 'STARLIGHT PARADE', box: [0.12, 0.2, 0.78, 0.13], confidence: 0.93 },
      {
        text: '2026年11月21日(土) 開場 16:30 開演 18:00',
        box: [0.12, 0.44, 0.76, 0.07],
        confidence: 0.95,
      },
      { text: '東京ドーム', box: [0.12, 0.58, 0.42, 0.08], confidence: 0.95 },
      { text: '1階 Aブロック 12列 34番', box: [0.12, 0.7, 0.64, 0.08], confidence: 0.94 },
      { text: '整理番号 A-0347  ¥11,000', box: [0.12, 0.82, 0.6, 0.06], confidence: 0.92 },
    ],
  },
];
