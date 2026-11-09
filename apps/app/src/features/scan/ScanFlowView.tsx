import {
  decideNextStep,
  type OcrLine,
  type RecognizeHints,
  recognizeLocal,
} from '@mogiri/shared/recognize';
import { useNavigate } from '@tanstack/react-router';
import { Camera, Crop, RotateCcw, ScanLine, Sparkles, Wand2 } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recognitionToTicketDraft } from '../../domain';
import {
  DEFAULT_QUAD,
  type Point2D,
  readFileAsDataUrl,
  runNativeOcr,
  SAMPLE_OCR_PRESETS,
  type SampleOcrPreset,
  warpPerspectiveToCanvas,
} from '../../platform';
import { useUiStore } from '../../ui';

export const ScanFlowView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setScanSession = useUiStore((s) => s.setScanSession);

  const [rawImageUrl, setRawImageUrl] = useState<string | undefined>();
  const [warpedDataUrl, setWarpedDataUrl] = useState<string | undefined>();
  const [warpedSizeMm, setWarpedSizeMm] = useState<{ w: number; h: number } | undefined>();
  const [quad, setQuad] = useState<[Point2D, Point2D, Point2D, Point2D]>(DEFAULT_QUAD);
  const [draggingCorner, setDraggingCorner] = useState<number | null>(null);

  const defaultPreset = SAMPLE_OCR_PRESETS[0] ?? {
    id: 'jr-shinkansen',
    labelKey: 'scan.sample.jr',
    hints: {},
    lines: [],
  };
  const [activePresetId, setActivePresetId] = useState<string>(defaultPreset.id);
  const [ocrText, setOcrText] = useState<string>(defaultPreset.lines.map((l) => l.text).join('\n'));
  const [barcodeText, setBarcodeText] = useState<string>(defaultPreset.hints.barcode?.text ?? '');
  const [presetLines, setPresetLines] = useState<OcrLine[]>(defaultPreset.lines);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleSelectPreset = (preset: SampleOcrPreset) => {
    setActivePresetId(preset.id);
    setPresetLines(preset.lines);
    setOcrText(preset.lines.map((l) => l.text).join('\n'));
    setBarcodeText(preset.hints.barcode?.text ?? '');
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await readFileAsDataUrl(file);
    setRawImageUrl(url);
    setWarpedDataUrl(undefined);
    setQuad(DEFAULT_QUAD);
    const nativeLines = await runNativeOcr(url);
    if (nativeLines.length > 0) {
      setPresetLines(nativeLines);
      setOcrText(nativeLines.map((l) => l.text).join('\n'));
    }
    e.target.value = '';
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingCorner === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
    setQuad((prev) => {
      const next: [Point2D, Point2D, Point2D, Point2D] = [
        { ...prev[0] },
        { ...prev[1] },
        { ...prev[2] },
        { ...prev[3] },
      ];
      next[draggingCorner] = { x, y };
      return next;
    });
  };

  const handleApplyWarp = () => {
    const img = imgRef.current;
    if (!img?.naturalWidth || !img.naturalHeight) return;
    const { canvas, sizeMm } = warpPerspectiveToCanvas(
      img,
      img.naturalWidth,
      img.naturalHeight,
      quad,
      1100,
    );
    setWarpedDataUrl(canvas.toDataURL('image/jpeg', 0.9));
    setWarpedSizeMm(sizeMm);
  };

  const handleRunRecognize = () => {
    const rawLines = ocrText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    // 如果用户没有改动预设文本行，保留预设的精细文本框坐标；否则按行顺序生成垂直分布框
    const presetJoined = presetLines.map((l) => l.text).join('\n');
    const lines: OcrLine[] =
      ocrText.trim() === presetJoined.trim()
        ? presetLines
        : rawLines.map((text, idx) => ({
            text,
            box: [
              0.08,
              Math.min(0.9, 0.08 + (idx / Math.max(1, rawLines.length)) * 0.8),
              0.8,
              idx === 1 ? 0.12 : 0.07,
            ] as [number, number, number, number],
            confidence: 0.93,
          }));

    const hints: RecognizeHints = {
      capturedAt: '2026-11-09T10:00:00Z',
      locale: 'ja-JP',
      ...(barcodeText.trim()
        ? {
            barcode: {
              format: 'PDF_417',
              text: barcodeText.trim(),
            },
          }
        : {}),
    };

    const localOutput = recognizeLocal(lines, hints);
    const decision = decideNextStep(localOutput, {
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      quotaLeft: 5,
      platform: 'ios',
    });
    const draft = recognitionToTicketDraft(localOutput.result, 'local');

    setScanSession({
      draft,
      decision,
      matchedRules: localOutput.matchedRules,
      localOutput,
      ...(warpedDataUrl
        ? { scanFrontDataUrl: warpedDataUrl }
        : rawImageUrl
          ? { scanFrontDataUrl: rawImageUrl }
          : {}),
      ...(warpedSizeMm ? { sizeMm: warpedSizeMm } : {}),
    });

    void navigate({ to: '/scan/confirm' });
  };

  const polygonPoints = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-amber-400" />
          {t('scan.title')}
        </h1>
        <p className="text-xs text-stone-400 mt-1">{t('scan.subtitle')}</p>
      </div>

      {/* 步骤 1：导入照片与四角透视校正 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-200">{t('scan.stepUpload')}</h2>
          <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-stone-800 px-3.5 py-2 text-xs font-medium text-stone-100 hover:bg-stone-700 transition">
            <Camera className="h-3.5 w-3.5 text-amber-400" />
            {t('scan.uploadPhoto')}
            <input type="file" accept="image/*" onChange={handleUploadImage} className="hidden" />
          </label>
        </div>

        {rawImageUrl && (
          <div className="space-y-3">
            <p className="text-xs text-stone-400">{t('scan.cropHint')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div
                ref={containerRef}
                onPointerMove={handlePointerMove}
                onPointerUp={() => setDraggingCorner(null)}
                onPointerLeave={() => setDraggingCorner(null)}
                className="relative select-none overflow-hidden rounded-xl border border-stone-700 bg-stone-950 touch-none"
              >
                <img
                  ref={imgRef}
                  src={rawImageUrl}
                  alt="Raw ticket scan"
                  className="block w-full h-auto max-h-72 object-contain pointer-events-none"
                />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full pointer-events-none"
                >
                  <title>Perspective crop quad</title>
                  <polygon
                    points={polygonPoints}
                    fill="rgba(251, 191, 36, 0.16)"
                    stroke="#fbbf24"
                    strokeWidth="0.8"
                  />
                </svg>
                {(['tl', 'tr', 'br', 'bl'] as const).map((cornerKey, idx) => {
                  const pt = quad[idx] ?? { x: 0.5, y: 0.5 };
                  return (
                    <button
                      key={cornerKey}
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingCorner(idx);
                      }}
                      style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-stone-950 bg-amber-400 shadow-md cursor-grab active:cursor-grabbing"
                      aria-label={`Corner ${idx + 1}`}
                    />
                  );
                })}
              </div>

              {warpedDataUrl && (
                <div className="rounded-xl border border-stone-800 bg-stone-950/70 p-3 flex flex-col items-center gap-2">
                  <img
                    src={warpedDataUrl}
                    alt="Rectified ticket"
                    className="max-h-56 w-auto object-contain rounded"
                  />
                  {warpedSizeMm && (
                    <span className="text-[11px] font-mono text-stone-400">
                      {warpedSizeMm.w}mm × {warpedSizeMm.h}mm
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleApplyWarp}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400/20 border border-amber-500/40 px-3.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/30"
              >
                <Crop className="h-3.5 w-3.5" />
                {t('scan.applyPerspective')}
              </button>
              <button
                type="button"
                onClick={() => setQuad(DEFAULT_QUAD)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-900 px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('scan.resetCorners')}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 步骤 2：本地识别引擎样本与 OCR 规则提取 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-amber-400" />
          {t('scan.sampleTitle')}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SAMPLE_OCR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset)}
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-medium text-left transition ${
                activePresetId === preset.id
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                  : 'border-stone-800 bg-stone-950/60 text-stone-400 hover:text-stone-200'
              }`}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="ocr-lines-input" className="block text-xs text-stone-400 mb-1.5">
            {t('scan.customOcrLabel')}
          </label>
          <textarea
            id="ocr-lines-input"
            rows={6}
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2.5 text-xs font-mono text-stone-200 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="barcode-input" className="block text-xs text-stone-400 mb-1.5">
            {t('scan.barcodeLabel')}
          </label>
          <input
            id="barcode-input"
            type="text"
            value={barcodeText}
            onChange={(e) => setBarcodeText(e.target.value)}
            placeholder="M1YAMADA/TARO       EABC123 HNDCTSNH 0065 105Y018A0025 100"
            className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-xs font-mono text-stone-200 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleRunRecognize}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 shadow-lg shadow-amber-500/20 hover:bg-amber-300 transition"
          >
            <Wand2 className="h-4 w-4" />
            {t('scan.runLocalRecognize')}
          </button>
        </div>
      </section>
    </div>
  );
};
