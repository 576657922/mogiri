import {
  decideNextStep,
  type OcrLine,
  type RecognizeHints,
  recognizeLocal,
} from '@mogiri/shared/recognize';
import { useNavigate } from '@tanstack/react-router';
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
import { Btn, btnClass, Container, Field, Label, SectionHead, useUiStore } from '../../ui';

const PRESET_SHORT_KEY: Record<string, 'jr' | 'flight' | 'movie' | 'concert'> = {
  'jr-shinkansen': 'jr',
  'flight-bcbp': 'flight',
  'cinema-toho': 'movie',
  'concert-live': 'concert',
};

const PRESET_CODE: Record<string, string> = {
  'jr-shinkansen': 'TRN',
  'flight-bcbp': 'FLT',
  'cinema-toho': 'CIN',
  'concert-live': 'LIV',
};

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
    <Container className="py-10 sm:py-14 space-y-14">
      {/* 刊头 */}
      <div className="max-w-3xl space-y-4">
        <Label index="02">{t('scan.eyebrow')}</Label>
        <h1 className="display text-[clamp(2.4rem,5vw,4.2rem)] text-fg">{t('scan.title')}</h1>
        <p className="text-[15px] leading-relaxed text-muted">{t('scan.lead')}</p>
      </div>

      {/* 双栏工作台 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* 左栏：照片导入与四角透视校正 + 样本选择器 */}
        <div className="lg:col-span-6 space-y-10">
          <section className="space-y-5">
            <SectionHead
              index="01"
              title={t('scan.step1')}
              aside={
                rawImageUrl ? (
                  <label className={`${btnClass('ghost', 'h-8 px-3 text-xs')} cursor-pointer`}>
                    <span>{t('scan.replacePhoto')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadImage}
                      className="hidden"
                    />
                  </label>
                ) : undefined
              }
            />

            {!rawImageUrl ? (
              <label className="cropmarks border border-line bg-bg-raised/60 hover:bg-bg-raised transition-colors p-10 flex flex-col items-center justify-center text-center gap-2 cursor-pointer min-h-[220px]">
                <span className="display text-2xl text-fg">{t('scan.dropTitle')}</span>
                <span className="label">{t('scan.dropHint')}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadImage}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted">{t('scan.cropHint')}</p>

                <div
                  ref={containerRef}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => setDraggingCorner(null)}
                  onPointerLeave={() => setDraggingCorner(null)}
                  className="relative select-none overflow-hidden border border-line bg-bg-raised touch-none"
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
                      fill="rgba(224, 64, 42, 0.14)"
                      stroke="#e0402a"
                      strokeWidth="0.7"
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
                        className="absolute -translate-x-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-bg bg-accent cursor-grab active:cursor-grabbing"
                        aria-label={`Corner ${idx + 1}`}
                      />
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Btn variant="solid" className="h-9 px-4 text-xs" onClick={handleApplyWarp}>
                      {t('scan.apply')}
                    </Btn>
                    <Btn
                      variant="outline"
                      className="h-9 px-4 text-xs"
                      onClick={() => setQuad(DEFAULT_QUAD)}
                    >
                      {t('scan.reset')}
                    </Btn>
                  </div>

                  {warpedSizeMm && (
                    <span className="label text-fg">
                      {t('scan.rectified', { w: warpedSizeMm.w, h: warpedSizeMm.h })}
                    </span>
                  )}
                </div>

                {warpedDataUrl && (
                  <div className="cropmarks border border-line bg-bg-raised/60 p-4 flex justify-center">
                    <img
                      src={warpedDataUrl}
                      alt="Rectified ticket"
                      className="max-h-48 w-auto object-contain stub-shadow"
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 4 张内置真机样本卡片 */}
          <section className="space-y-4">
            <div className="label">{t('scan.samplesLabel')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SAMPLE_OCR_PRESETS.map((preset) => {
                const shortKey = PRESET_SHORT_KEY[preset.id] ?? 'jr';
                const code = PRESET_CODE[preset.id] ?? 'DOC';
                const active = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`border p-4 text-left transition-colors space-y-1.5 ${
                      active
                        ? 'border-fg bg-fg text-bg'
                        : 'border-line bg-bg-raised/40 hover:border-fg text-fg'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                          active ? 'text-bg/75' : 'text-muted'
                        }`}
                      >
                        {code}
                      </span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    </div>
                    <div className="text-sm font-medium">{t(`scan.sample.${shortKey}`)}</div>
                    <div className={`text-[11.5px] ${active ? 'text-bg/75' : 'text-muted'}`}>
                      {t(`scan.sampleMeta.${shortKey}`)}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* 右栏：OCR 文本行与条码识别 */}
        <div className="lg:col-span-6 space-y-6">
          <SectionHead index="02" title={t('scan.step2')} />

          <Field label={t('scan.ocrLabel')} htmlFor="ocr-lines-input" hint={t('scan.ocrHint')}>
            <textarea
              id="ocr-lines-input"
              rows={8}
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              className="mt-2 w-full border border-line bg-bg-raised/60 p-4 font-mono text-xs leading-relaxed text-fg focus:border-fg focus:outline-none"
            />
          </Field>

          <Field
            label={t('scan.barcodeLabel')}
            htmlFor="barcode-input"
            hint={t('scan.barcodeHint')}
          >
            <input
              id="barcode-input"
              type="text"
              value={barcodeText}
              onChange={(e) => setBarcodeText(e.target.value)}
              placeholder="M1YAMADA/TARO       EABC123 HNDCTSNH 0065 105Y018A0025 100"
              className="field font-mono text-xs"
            />
          </Field>

          <div className="pt-4 border-t border-line flex flex-wrap items-center justify-between gap-4">
            <span className="label">{t('scan.runHint')}</span>
            <Btn variant="solid" arrow data-testid="run-recognize" onClick={handleRunRecognize}>
              {t('scan.run')}
            </Btn>
          </div>
        </div>
      </div>
    </Container>
  );
};
