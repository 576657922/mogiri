import type { TicketType } from '@mogiri/shared';
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
  playDetentClick,
  playPaperFlip,
  readFileAsDataUrl,
  runNativeOcr,
  SAMPLE_OCR_PRESETS,
  type SampleOcrPreset,
  warpPerspectiveToCanvas,
} from '../../platform';
import {
  Btn,
  btnClass,
  Container,
  Field,
  getTicketTypeTheme,
  Label,
  Reveal,
  SectionHead,
  useUiStore,
} from '../../ui';

const PRESET_SHORT_KEY: Record<string, 'jr' | 'flight' | 'movie' | 'concert'> = {
  'jr-shinkansen': 'jr',
  'flight-bcbp': 'flight',
  'cinema-toho': 'movie',
  'concert-live': 'concert',
};

const PRESET_TICKET_TYPE: Record<string, TicketType> = {
  'jr-shinkansen': 'train',
  'flight-bcbp': 'flight',
  'cinema-toho': 'movie',
  'concert-live': 'concert',
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
  const [isDragOver, setIsDragOver] = useState(false);

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

  const loadImageFile = async (file: File) => {
    playPaperFlip();
    const url = await readFileAsDataUrl(file);
    setRawImageUrl(url);
    setWarpedDataUrl(undefined);
    setQuad(DEFAULT_QUAD);
    const nativeLines = await runNativeOcr(url);
    if (nativeLines.length > 0) {
      setPresetLines(nativeLines);
      setOcrText(nativeLines.map((l) => l.text).join('\n'));
    }
  };

  const handleSelectPreset = (preset: SampleOcrPreset) => {
    playPaperFlip();
    setActivePresetId(preset.id);
    setPresetLines(preset.lines);
    setOcrText(preset.lines.map((l) => l.text).join('\n'));
    setBarcodeText(preset.hints.barcode?.text ?? '');
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadImageFile(file);
    e.target.value = '';
  };

  const handleDropFile = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) {
      await loadImageFile(file);
    }
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
    playDetentClick();
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

  const executeRecognition = (
    overrideLines?: OcrLine[],
    overrideText?: string,
    overrideBarcode?: string,
  ) => {
    playDetentClick();
    const sourceText = overrideText ?? ocrText;
    const sourcePresetLines = overrideLines ?? presetLines;
    const sourceBarcode = overrideBarcode ?? barcodeText;

    const rawLines = sourceText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const presetJoined = sourcePresetLines.map((l) => l.text).join('\n');
    const lines: OcrLine[] =
      sourceText.trim() === presetJoined.trim()
        ? sourcePresetLines
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
      ...(sourceBarcode.trim()
        ? {
            barcode: {
              format: 'PDF_417',
              text: sourceBarcode.trim(),
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
  const activeLineCount = ocrText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean).length;

  return (
    <Container className="py-6 sm:py-8 space-y-6">
      {/* 顶部光学识票台报头 + 三级隐私识别管线指示器 */}
      <Reveal className="space-y-4">
        <div className="space-y-1.5">
          <Label index="SCAN">{t('scan.eyebrow')}</Label>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="font-editorial text-[26px] sm:text-[32px] leading-[1.12] tracking-[-0.02em] text-fg">
              {t('scan.title')}
            </h1>
            <p className="text-[13px] text-muted max-w-xl">{t('scan.lead')}</p>
          </div>
        </div>

        {/* 三级本地优先识别架构仪表条 */}
        <div className="recessed-plinth rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {(
            [
              { key: 't1', code: 'TIER 01', dot: 'bg-emerald-600' },
              { key: 't2', code: 'TIER 02', dot: 'bg-amber-600' },
              { key: 't3', code: 'TIER 03', dot: 'bg-accent' },
            ] as const
          ).map((tier) => (
            <div
              key={tier.key}
              className="rounded-xl bg-bg-raised/90 border border-line px-3.5 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tier.dot}`} />
                  <span className="text-[12.5px] font-semibold text-fg truncate">
                    {t(`scan.pipeline.${tier.key}`)}
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-0.5 truncate">
                  {t(`scan.pipeline.${tier.key}Desc`)}
                </p>
              </div>
              <span className="font-mono text-[10px] tracking-wider text-faint shrink-0">
                {tier.code}
              </span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* 双栏光学工作台 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左栏：光学取景台 + 内置真机票据样本 */}
        <div className="lg:col-span-6 space-y-5">
          <section className="archival-card rounded-[22px] p-5 sm:p-6 space-y-4">
            <SectionHead
              index="01"
              title={t('scan.step1')}
              aside={
                rawImageUrl ? (
                  <label className={`${btnClass('pill')} cursor-pointer`}>
                    <span>{t('scan.replacePhoto')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleUploadImage(e)}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <span className="font-mono text-[10.5px] text-faint">8×9 HOMOGRAPHY</span>
                )
              }
            />

            {!rawImageUrl ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => void handleDropFile(e)}
                className={`recessed-plinth relative rounded-2xl border transition-all p-8 sm:p-10 flex flex-col items-center justify-center text-center gap-3 cursor-pointer min-h-[224px] overflow-hidden group ${
                  isDragOver
                    ? 'border-accent bg-accent/6 ring-2 ring-accent/20'
                    : 'border-dashed border-line-strong hover:border-fg/35'
                }`}
              >
                {/* 取景器四角刻度 */}
                <span className="pointer-events-none absolute top-3 left-3.5 font-mono text-[11px] text-faint">
                  ⌜
                </span>
                <span className="pointer-events-none absolute top-3 right-3.5 font-mono text-[11px] text-faint">
                  ⌝
                </span>
                <span className="pointer-events-none absolute bottom-3 left-3.5 font-mono text-[11px] text-faint">
                  ⌞
                </span>
                <span className="pointer-events-none absolute bottom-3 right-3.5 font-mono text-[11px] text-faint">
                  ⌟
                </span>

                {/* 四角单应性透视示意图标 */}
                <svg
                  viewBox="0 0 88 52"
                  className="w-20 h-12 text-fg/75 transition-transform duration-300 group-hover:scale-105"
                  aria-hidden="true"
                >
                  <polygon
                    points="16,12 74,7 79,42 10,45"
                    fill="rgba(217, 56, 30, 0.08)"
                    stroke="#d9381e"
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                  />
                  <line
                    x1="58"
                    y1="10"
                    x2="61"
                    y2="43"
                    stroke="currentColor"
                    strokeOpacity="0.3"
                    strokeDasharray="2 2"
                  />
                  {[
                    [16, 12],
                    [74, 7],
                    [79, 42],
                    [10, 45],
                  ].map(([cx, cy]) => (
                    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.8" fill="#d9381e" />
                  ))}
                </svg>

                <div className="space-y-1">
                  <div className="text-[15px] font-semibold text-fg">{t('scan.dropTitle')}</div>
                  <div className="text-[12px] text-muted max-w-sm">{t('scan.dropHint')}</div>
                </div>

                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUploadImage(e)}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-4">
                <p className="text-[12px] text-muted">{t('scan.cropHint')}</p>

                <div
                  ref={containerRef}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => setDraggingCorner(null)}
                  onPointerLeave={() => setDraggingCorner(null)}
                  className="stage-obsidian relative select-none overflow-hidden rounded-2xl border border-line p-2 touch-none"
                >
                  <img
                    ref={imgRef}
                    src={rawImageUrl}
                    alt="Raw ticket scan"
                    className="block w-full h-auto max-h-72 object-contain pointer-events-none rounded-lg"
                  />
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full pointer-events-none"
                  >
                    <title>Perspective crop quad</title>
                    <polygon
                      points={polygonPoints}
                      fill="rgba(217, 56, 30, 0.16)"
                      stroke="#d9381e"
                      strokeWidth="0.65"
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
                        className="absolute -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white bg-accent shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center"
                        aria-label={`Corner ${idx + 1}`}
                      >
                        <span className="h-1 w-1 rounded-full bg-white" />
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Btn variant="solid" onClick={handleApplyWarp}>
                      {t('scan.apply')}
                    </Btn>
                    <Btn
                      variant="pill"
                      onClick={() => {
                        playDetentClick();
                        setQuad(DEFAULT_QUAD);
                      }}
                    >
                      {t('scan.reset')}
                    </Btn>
                  </div>

                  {warpedSizeMm && (
                    <span className="font-mono tabular-nums text-xs text-muted">
                      {t('scan.rectified', { w: warpedSizeMm.w, h: warpedSizeMm.h })}
                    </span>
                  )}
                </div>

                {warpedDataUrl && (
                  <div className="recessed-plinth rounded-2xl p-5 flex justify-center">
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

          {/* 4 张内置模切样本卡片 */}
          <section className="archival-card rounded-[22px] p-5 sm:p-6 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-muted">{t('scan.samplesLabel')}</span>
              <span className="font-mono text-[10.5px] text-faint">04 PRESETS</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SAMPLE_OCR_PRESETS.map((preset) => {
                const shortKey = PRESET_SHORT_KEY[preset.id] ?? 'jr';
                const ticketType = PRESET_TICKET_TYPE[preset.id] ?? 'other';
                const theme = getTicketTypeTheme(ticketType);
                const active = activePresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`group relative rounded-2xl border transition-all overflow-hidden ${
                      active
                        ? 'bg-fg text-bg-raised border-fg shadow-sm'
                        : 'bg-bg-subtle/70 hover:bg-bg-subtle border-line text-fg'
                    }`}
                  >
                    {/* 左侧票种语义色脊线 */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1.5"
                      style={{ background: theme.rim }}
                    />

                    <button
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className="w-full pl-4 pr-3.5 pt-3 pb-2.5 text-left cursor-pointer space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-mono text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded ${
                            active ? 'bg-white/14 text-bg-raised' : 'bg-black/6 text-muted'
                          }`}
                        >
                          {t(`typeCode.${ticketType}`)}
                        </span>
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />}
                      </div>
                      <div className="text-[13.5px] font-semibold leading-snug">
                        {t(`scan.sample.${shortKey}`)}
                      </div>
                      <div
                        className={`text-[11px] leading-relaxed ${
                          active ? 'text-bg-raised/72' : 'text-muted'
                        }`}
                      >
                        {t(`scan.sampleMeta.${shortKey}`)}
                      </div>
                    </button>

                    <div
                      className={`pl-4 pr-3.5 py-1.5 border-t border-dashed flex items-center justify-end ${
                        active ? 'border-white/15' : 'border-line'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectPreset(preset);
                          executeRecognition(
                            preset.lines,
                            preset.lines.map((l) => l.text).join('\n'),
                            preset.hints.barcode?.text ?? '',
                          );
                        }}
                        className={`font-mono text-[10.5px] font-medium tracking-tight transition-colors cursor-pointer ${
                          active
                            ? 'text-bg-raised/90 hover:text-white'
                            : 'text-accent hover:opacity-80'
                        }`}
                      >
                        {t('scan.quickRun')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* 右栏：OCR 文本行流与条码原始载荷解析台 */}
        <div className="lg:col-span-6 archival-card rounded-[22px] p-5 sm:p-6 space-y-5">
          <SectionHead
            index="02"
            title={t('scan.step2')}
            aside={
              <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 font-mono tabular-nums text-[10.5px] text-muted">
                {String(activeLineCount).padStart(2, '0')} LINES
              </span>
            }
          />

          <Field label={t('scan.ocrLabel')} htmlFor="ocr-lines-input" hint={t('scan.ocrHint')}>
            <div className="recessed-plinth rounded-xl p-1">
              <textarea
                id="ocr-lines-input"
                rows={9}
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                className="field border-0 bg-bg-raised/90 font-mono text-xs leading-relaxed"
              />
            </div>
          </Field>

          <Field
            label={t('scan.barcodeLabel')}
            htmlFor="barcode-input"
            hint={t('scan.barcodeHint')}
          >
            <div className="recessed-plinth rounded-xl p-1">
              <input
                id="barcode-input"
                type="text"
                value={barcodeText}
                onChange={(e) => setBarcodeText(e.target.value)}
                placeholder="M1YAMADA/TARO       EABC123 HNDCTSNH 0065 105Y018A0025 100"
                className="field border-0 bg-bg-raised/90 font-mono text-xs"
              />
            </div>
          </Field>

          <div className="pt-4 border-t border-line flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              <span>{t('scan.runHint')}</span>
            </div>
            <Btn
              variant="solid"
              arrow
              data-testid="run-recognize"
              onClick={() => executeRecognition()}
            >
              {t('scan.run')}
            </Btn>
          </div>
        </div>
      </div>
    </Container>
  );
};
