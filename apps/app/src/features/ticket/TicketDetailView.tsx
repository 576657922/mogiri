import {
  getTemplate,
  renderThumbnailDataUrl,
  renderTicketCardCanvas,
  requestMotionPermission,
} from '@mogiri/renderer';
import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addTicketMedia,
  db,
  deleteTicketMedia,
  getBlob,
  type MediaRecord,
  reorderTicketMedia,
  softDeleteTicket,
  type TicketRecord,
  updateMediaCaption,
  updateTicket,
} from '../../data';
import { formatEventDateDisplay, toTicketSpec } from '../../domain';
import {
  downloadOrShareBlob,
  playDetentClick,
  playPaperFlip,
  playPunchClack,
  playTearRip,
} from '../../platform';
import {
  Btn,
  btnClass,
  Container,
  getTicketTypeTheme,
  MATERIAL_SWATCH_BG,
  RatingDots,
  SectionHead,
  type StageBackdrop,
  useUiStore,
} from '../../ui';

type PosterEdition = 'obsidian' | 'ivory' | 'vermilion';

async function loadBlobAsImage(key: string | undefined): Promise<HTMLImageElement | undefined> {
  if (!key) return undefined;
  const blob = await getBlob(key);
  if (!blob) return undefined;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

/**
 * 冲印 1800×1200 展签级分享海报（支持三款装裱底色 + SHARE-03 条码与精确座位隐私打码）
 */
function buildArchivalPosterCanvas(opts: {
  ticket: TicketRecord;
  spec: ReturnType<typeof toTicketSpec>;
  edition: PosterEdition;
  redactPrivacy: boolean;
  catalogNo: string;
  dateText: string;
  redactedLabel: string;
}): HTMLCanvasElement {
  const { ticket, spec, edition, redactPrivacy, catalogNo, dateText, redactedLabel } = opts;
  const effectiveSpec = redactPrivacy
    ? {
        ...spec,
        fields: {
          ...spec.fields,
          seat: '•••',
          barcode: 'REDACTED-PRIVACY',
        },
      }
    : spec;

  const cardCanvas = renderTicketCardCanvas(effectiveSpec, 1600);
  const out = document.createElement('canvas');
  out.width = 1800;
  out.height = 1200;
  const ctx = out.getContext('2d');
  if (!ctx) return out;

  const palette =
    edition === 'ivory'
      ? {
          bg0: '#f6f4ed',
          bg1: '#e7e4da',
          ink: '#171715',
          sub: 'rgba(23,23,21,0.52)',
          rule: 'rgba(23,23,21,0.14)',
          accent: '#d64c35',
          shadow: 'rgba(20,19,16,0.24)',
        }
      : edition === 'vermilion'
        ? {
            bg0: '#cf4832',
            bg1: '#9f2f1e',
            ink: '#fbfaf6',
            sub: 'rgba(251,250,246,0.72)',
            rule: 'rgba(251,250,246,0.22)',
            accent: '#fbfaf6',
            shadow: 'rgba(15,8,6,0.48)',
          }
        : {
            bg0: '#211f1d',
            bg1: '#0e0d0c',
            ink: '#f4f1ea',
            sub: 'rgba(244,241,234,0.52)',
            rule: 'rgba(244,241,234,0.14)',
            accent: '#d64c35',
            shadow: 'rgba(0,0,0,0.68)',
          };

  const bg = ctx.createRadialGradient(900, 540, 80, 900, 600, 1050);
  bg.addColorStop(0, palette.bg0);
  bg.addColorStop(1, palette.bg1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);

  // 展签外框细线与四角靶标
  ctx.strokeStyle = palette.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, out.width - 112, out.height - 112);

  // 顶部档案铭文
  ctx.fillStyle = palette.sub;
  ctx.font = '600 21px "JetBrains Mono Variable", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HANKEN 半券  ·  SPECIMEN #${catalogNo}`, 96, 108);

  ctx.textAlign = 'right';
  ctx.fillText(
    redactPrivacy ? `${ticket.type.toUpperCase()}  ·  ${redactedLabel}` : ticket.type.toUpperCase(),
    out.width - 96,
    108,
  );

  // 居中绘制高分辨率仿真票面
  const scale = Math.min(
    (out.width * 0.78) / cardCanvas.width,
    (out.height * 0.62) / cardCanvas.height,
  );
  const dw = cardCanvas.width * scale;
  const dh = cardCanvas.height * scale;
  const dx = (out.width - dw) / 2;
  const dy = (out.height - dh) / 2 - 24;

  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 58;
  ctx.shadowOffsetY = 28;
  ctx.drawImage(cardCanvas, dx, dy, dw, dh);
  ctx.restore();

  // 若开启隐私打码，在副券条码区加盖半透明斜纹护封章
  if (redactPrivacy) {
    const stampW = Math.round(dw * 0.2);
    const stampH = Math.round(dh * 0.42);
    const sx = dx + dw - stampW - dw * 0.03;
    const sy = dy + dh * 0.34;
    ctx.save();
    ctx.fillStyle = 'rgba(20,20,19,0.82)';
    ctx.beginPath();
    ctx.roundRect(sx, sy, stampW, stampH, 10);
    ctx.fill();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px "JetBrains Mono Variable", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('REDACTED', sx + stampW / 2, sy + stampH / 2 + 6);
    ctx.restore();
  }

  // 底部展签主标题与时间场馆脚注
  ctx.fillStyle = palette.ink;
  ctx.font = '700 34px "Inter Variable", "PingFang SC", "Hiragino Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(ticket.title, 96, out.height - 116);

  ctx.fillStyle = palette.sub;
  ctx.font = '500 21px "JetBrains Mono Variable", "PingFang SC", sans-serif';
  const venuePart = [ticket.venueName, ticket.city].filter(Boolean).join(' · ');
  const seatPart = !redactPrivacy && ticket.seat ? `  ·  ${ticket.seat}` : '';
  ctx.fillText(
    `${dateText}${venuePart ? `  ·  ${venuePart}` : ''}${seatPart}`,
    96,
    out.height - 80,
  );

  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(out.width - 104, out.height - 96, 8, 0, Math.PI * 2);
  ctx.fill();

  return out;
}

export function TicketDetailView({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setActiveStage = useUiStore((s) => s.setActiveStage);
  const resolvedQuality = useUiStore((s) => s.resolvedQuality);
  const stageBackdrop = useUiStore((s) => s.stageBackdrop);
  const setStageBackdrop = useUiStore((s) => s.setStageBackdrop);

  const ticket = useLiveQuery(() => db.tickets.get(id), [id]);
  const allActive = useLiveQuery(
    () => db.tickets.where('status').equals('active').toArray(),
    [],
    [] as TicketRecord[],
  );

  const sortedActive = useMemo(
    () => [...allActive].sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
    [allActive],
  );

  const mediaList = useLiveQuery(
    async () => {
      const items = await db.media.where('ticketId').equals(id).toArray();
      return items.filter((m) => !m.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [id],
    [] as MediaRecord[],
  );

  const [flipped, setFlipped] = useState(false);
  const [faceImg, setFaceImg] = useState<HTMLImageElement | undefined>(undefined);
  const [backImg, setBackImg] = useState<HTMLImageElement | undefined>(undefined);
  const [lightboxMedia, setLightboxMedia] = useState<MediaRecord | null>(null);

  // 海报冲印工作室弹窗状态（默认开启 SHARE-03 隐私打码）
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterEdition, setPosterEdition] = useState<PosterEdition>('obsidian');
  const [redactPrivacy, setRedactPrivacy] = useState(true);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string>('');
  const [lastTicketId, setLastTicketId] = useState(id);

  if (lastTicketId !== id) {
    setLastTicketId(id);
    setFlipped(false);
  }

  useEffect(() => {
    let cancelled = false;
    void loadBlobAsImage(ticket?.scanFrontKey).then((img) => {
      if (!cancelled) setFaceImg(img);
    });
    void loadBlobAsImage(ticket?.scanBackKey).then((img) => {
      if (!cancelled) setBackImg(img);
    });
    return () => {
      cancelled = true;
    };
  }, [ticket?.scanFrontKey, ticket?.scanBackKey]);

  const spec = useMemo(() => {
    if (!ticket) return null;
    return toTicketSpec(ticket, {
      ...(faceImg ? { faceImage: faceImg } : {}),
      ...(backImg ? { backImage: backImg } : {}),
    });
  }, [ticket, faceImg, backImg]);

  const persistWear = useCallback(
    async (nextWear: { torn: boolean; punches: { x: number; y: number }[]; age: number }) => {
      if (!ticket) return;
      const updated = await updateTicket(ticket.id, { wear: nextWear });
      const nextSpec = toTicketSpec(updated, {
        ...(faceImg ? { faceImage: faceImg } : {}),
        ...(backImg ? { backImage: backImg } : {}),
      });
      const thumbDataUrl = renderThumbnailDataUrl(nextSpec, 720);
      await db.tickets.update(ticket.id, { thumbDataUrl });
    },
    [ticket, faceImg, backImg],
  );

  const handleTearFromStage = useCallback(() => {
    if (!ticket) return;
    playTearRip();
    void persistWear({ ...ticket.wear, torn: true });
  }, [ticket, persistWear]);

  useEffect(() => {
    if (!spec || posterOpen || lightboxMedia) {
      setActiveStage(null);
      return;
    }
    setActiveStage({
      spec,
      flipped,
      onTear: handleTearFromStage,
    });
    return () => {
      setActiveStage(null);
    };
  }, [spec, flipped, posterOpen, lightboxMedia, handleTearFromStage, setActiveStage]);

  const currentIdx = useMemo(
    () => sortedActive.findIndex((tk) => tk.id === id),
    [sortedActive, id],
  );
  const catalogNo =
    currentIdx >= 0 ? String(sortedActive.length - currentIdx).padStart(3, '0') : '001';
  const prevTicket = currentIdx > 0 ? sortedActive[currentIdx - 1] : undefined;
  const nextTicket =
    currentIdx >= 0 && currentIdx < sortedActive.length - 1
      ? sortedActive[currentIdx + 1]
      : undefined;

  useEffect(() => {
    if (!posterOpen || !ticket || !spec) return;
    const canvas = buildArchivalPosterCanvas({
      ticket,
      spec,
      edition: posterEdition,
      redactPrivacy,
      catalogNo,
      dateText: formatEventDateDisplay(ticket.eventAt, i18n.language),
      redactedLabel: t('ticket.poster.redactedStamp'),
    });
    setPosterPreviewUrl(canvas.toDataURL('image/png'));
  }, [posterOpen, ticket, spec, posterEdition, redactPrivacy, catalogNo, i18n.language, t]);

  if (!ticket || !spec) {
    return (
      <Container className="py-24 text-center space-y-4">
        <p className="text-[20px] font-semibold text-fg">{t('ticket.notFound')}</p>
        <div>
          <Link to="/" className={btnClass('outline')}>
            ← {t('ticket.back')}
          </Link>
        </div>
      </Container>
    );
  }

  const tpl = getTemplate(spec.templateId);
  const sizeMm = spec.sizeMm ?? tpl.size;
  const hasStub = Boolean(tpl.stub);
  const theme = getTicketTypeTheme(ticket.type);
  const isLightStage = stageBackdrop === 'limestone';

  const handleToggleStub = () => {
    playTearRip();
    void persistWear({ ...ticket.wear, torn: !ticket.wear.torn });
  };

  const handlePunchHole = () => {
    playPunchClack();
    const newPunch = {
      x: Number((6 + Math.random() * Math.min(28, sizeMm.w * 0.25)).toFixed(1)),
      y: Number((8 + Math.random() * (sizeMm.h - 16)).toFixed(1)),
    };
    void persistWear({
      ...ticket.wear,
      punches: [...ticket.wear.punches, newPunch],
    });
  };

  const handleClearPunches = () => {
    playDetentClick();
    void persistWear({ ...ticket.wear, punches: [] });
  };

  const handleAgeChange = (ageVal: number) => {
    void persistWear({ ...ticket.wear, age: ageVal });
  };

  const handleDownloadPoster = async () => {
    const canvas = buildArchivalPosterCanvas({
      ticket,
      spec,
      edition: posterEdition,
      redactPrivacy,
      catalogNo,
      dateText: formatEventDateDisplay(ticket.eventAt, i18n.language),
      redactedLabel: t('ticket.poster.redactedStamp'),
    });
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await downloadOrShareBlob(
        blob,
        `hanken-${catalogNo}-${ticket.title.replace(/\s+/g, '-')}.png`,
        ticket.title,
      );
    }, 'image/png');
  };

  const handleSoftDelete = async () => {
    await softDeleteTicket(ticket.id);
    void navigate({ to: '/' });
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.readAsDataURL(file);
      });
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 });
        img.onerror = () => resolve({ w: 800, h: 600 });
        img.src = dataUrl;
      });
      await addTicketMedia({
        ticketId: ticket.id,
        kind: 'photo',
        blob: file,
        dataUrl,
        width: dims.w,
        height: dims.h,
        takenAt: new Date(file.lastModified || Date.now()).toISOString(),
      });
    }
    e.target.value = '';
  };

  const handleMoveMedia = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= mediaList.length) return;
    const ids = mediaList.map((m) => m.id);
    const currentId = ids[index];
    const targetId = ids[targetIdx];
    if (!currentId || !targetId) return;
    ids[index] = targetId;
    ids[targetIdx] = currentId;
    await reorderTicketMedia(ticket.id, ids);
  };

  const specRows: { label: string; value: string; mono?: boolean }[] = [
    {
      label: t('ticket.specDate'),
      value: `${formatEventDateDisplay(ticket.eventAt, i18n.language)} (${ticket.eventTz})`,
      mono: true,
    },
    ...(ticket.venueName || ticket.city
      ? [
          {
            label: t('ticket.specVenue'),
            value: [ticket.venueName, ticket.city, ticket.country].filter(Boolean).join(' · '),
          },
        ]
      : []),
    {
      label: t('ticket.specDimensions'),
      value: `${sizeMm.w} × ${sizeMm.h} mm`,
      mono: true,
    },
    {
      label: t('ticket.specMaterial'),
      value: t(`materials.${ticket.material}`),
    },
    {
      label: t('ticket.specSource'),
      value: t(`ticket.source.${ticket.source}`),
    },
    ...Object.entries(ticket.details)
      .filter(([, val]) => Boolean(val))
      .map(([k, val]) => ({
        label: t(`form.ext.${k}`, { defaultValue: k }),
        value: val,
      })),
  ];

  const backdropOptions: { id: StageBackdrop; swatch: string }[] = [
    { id: 'obsidian', swatch: '#181816' },
    { id: 'limestone', swatch: '#dfddd5' },
    { id: 'velvet', swatch: '#3d1c1d' },
  ];

  return (
    <Container className="py-4 sm:py-5 space-y-4 sm:space-y-5">
      {/* 1. 顶部档案导航与操作台 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/" onClick={() => playPaperFlip()} className={btnClass('pill')}>
            <span>←</span>
            <span>{t('ticket.back')}</span>
          </Link>

          {/* 馆藏前后快速翻阅拨片 */}
          {(prevTicket || nextTicket) && (
            <div className="inline-flex items-center rounded-full recessed-plinth p-0.5">
              {prevTicket ? (
                <Link
                  to="/t/$id"
                  params={{ id: prevTicket.id }}
                  onClick={() => playDetentClick()}
                  title={prevTicket.title}
                  className="h-7 px-2.5 rounded-full text-[11.5px] font-mono text-muted hover:text-fg flex items-center transition-colors"
                >
                  ← {t('ticket.prevStub')}
                </Link>
              ) : (
                <span className="h-7 px-2.5 text-[11.5px] font-mono text-faint/50 flex items-center">
                  ←
                </span>
              )}
              <span className="h-3.5 w-px bg-black/10" />
              {nextTicket ? (
                <Link
                  to="/t/$id"
                  params={{ id: nextTicket.id }}
                  onClick={() => playDetentClick()}
                  title={nextTicket.title}
                  className="h-7 px-2.5 rounded-full text-[11.5px] font-mono text-muted hover:text-fg flex items-center transition-colors"
                >
                  {t('ticket.nextStub')} →
                </Link>
              ) : (
                <span className="h-7 px-2.5 text-[11.5px] font-mono text-faint/50 flex items-center">
                  →
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Btn
            variant="solid"
            onClick={() => {
              playPaperFlip();
              setPosterOpen(true);
            }}
          >
            <span>✦</span>
            <span>{t('ticket.export')}</span>
          </Btn>
          <Link
            to="/t/$id/edit"
            params={{ id: ticket.id }}
            className={btnClass('outline', 'h-9 px-3.5 text-[12.5px]')}
          >
            {t('ticket.edit')}
          </Link>
          <Btn
            variant="ghost"
            onClick={() => void handleSoftDelete()}
            className="text-muted hover:text-accent"
          >
            {t('ticket.delete')}
          </Btn>
        </div>
      </div>

      {/* 2. 典藏展签级标题区 */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-1">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-medium text-muted">
            <span className="font-mono text-[11px] tracking-wider text-fg font-semibold">
              {t('ticket.catalog', { no: catalogNo })}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-raised border border-line px-2.5 py-0.5 text-fg">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.rim }} />
              {t(`types.${ticket.type}`)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-raised border border-line px-2.5 py-0.5 text-fg">
              <span
                className="w-2 h-2 rounded-full border border-black/15"
                style={{ background: MATERIAL_SWATCH_BG[ticket.material] }}
              />
              {t(`materials.${ticket.material}`)}
            </span>
            {ticket.wear.torn && (
              <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-accent font-semibold">
                {t('home.torn')}
              </span>
            )}
          </div>
          <h1 className="text-[26px] sm:text-[34px] font-semibold tracking-[-0.03em] leading-[1.12] text-fg">
            {ticket.title}
          </h1>
          {ticket.subtitle && <p className="text-[14.5px] text-muted">{ticket.subtitle}</p>}
        </div>

        <div className="text-[12.5px] font-mono text-muted sm:text-right shrink-0">
          <div className="tabular-nums">
            {formatEventDateDisplay(ticket.eventAt, i18n.language)}
          </div>
          {ticket.venueName && (
            <div className="text-fg font-sans font-medium mt-0.5">
              {ticket.venueName}
              {ticket.city ? ` · ${ticket.city}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* 3. 3D 光学检视暗房舞台（支持三档光学底衬 + 四角取景准星 + 磨砂控制台） */}
      <div
        className={`relative rounded-[26px] stage-${stageBackdrop} p-3.5 sm:p-5 ${
          isLightStage
            ? 'text-fg border border-line shadow-[0_18px_40px_rgba(20,20,18,0.08)]'
            : 'text-white shadow-[0_24px_56px_rgba(15,14,12,0.22)]'
        } overflow-hidden transition-colors duration-300`}
      >
        {/* 顶部光学取景遥测 HUD */}
        <div className="relative z-30 flex flex-wrap items-center justify-between gap-2 pb-1 text-[11px] font-mono">
          <div
            className={`flex items-center gap-2 ${isLightStage ? 'text-fg/65' : 'text-white/55'}`}
          >
            <span className="uppercase tracking-wider">
              {sizeMm.w}×{sizeMm.h}MM · {resolvedQuality.toUpperCase()}
            </span>
            <span className="hidden md:inline">·</span>
            <span className="hidden md:inline font-sans">{t('ticket.hint')}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] tracking-wider ${
                isLightStage ? 'bg-black/[0.06] text-fg/80' : 'bg-white/[0.1] text-white/80'
              }`}
            >
              {flipped ? t('ticket.reverse') : t('ticket.obverse')}
            </span>

            {/* 三档舞台背景色卡切换 */}
            <div
              className={`inline-flex items-center gap-1 rounded-full p-1 ${
                isLightStage ? 'bg-black/[0.06]' : 'bg-white/[0.1]'
              }`}
            >
              {backdropOptions.map((opt) => {
                const active = stageBackdrop === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      playDetentClick(0.75);
                      setStageBackdrop(opt.id);
                    }}
                    title={t(`ticket.backdrop.${opt.id}`)}
                    aria-label={t(`ticket.backdrop.${opt.id}`)}
                    className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                      active ? 'scale-110 ring-2 ring-accent' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: opt.swatch }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* 四角光学准星 + WebGL 宿主槽位（移动端增高至 330px，令竖排长票完整舒展） */}
        <div className="relative my-1">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-2 left-2 font-mono text-xs ${
              isLightStage ? 'text-black/25' : 'text-white/25'
            }`}
          >
            ⌜
          </span>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-2 right-2 font-mono text-xs ${
              isLightStage ? 'text-black/25' : 'text-white/25'
            }`}
          >
            ⌝
          </span>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-2 left-2 font-mono text-xs ${
              isLightStage ? 'text-black/25' : 'text-white/25'
            }`}
          >
            ⌞
          </span>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-2 right-2 font-mono text-xs ${
              isLightStage ? 'text-black/25' : 'text-white/25'
            }`}
          >
            ⌟
          </span>

          <section
            id="mogiri-stage-slot"
            className="w-full h-[248px] sm:h-[328px] lg:h-[358px]"
            aria-label={ticket.title}
          />
        </div>

        {/* 底部悬浮暗房物理交互操作台 */}
        <div
          className={`relative z-30 mt-2 rounded-2xl backdrop-blur-md border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 ${
            isLightStage
              ? 'bg-white/70 border-black/[0.08] text-fg'
              : 'bg-white/[0.08] border-white/[0.11] text-white'
          }`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                playPaperFlip();
                setFlipped((f) => !f);
              }}
              className={`h-8 rounded-full px-3.5 text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                isLightStage
                  ? 'bg-black/[0.07] hover:bg-black/[0.13] text-fg'
                  : 'bg-white/14 hover:bg-white/24 text-white'
              }`}
            >
              <span>↻</span>
              <span>{t('ticket.flip')}</span>
            </button>

            {hasStub && (
              <button
                type="button"
                onClick={handleToggleStub}
                className={`h-8 rounded-full px-3.5 text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  ticket.wear.torn
                    ? isLightStage
                      ? 'bg-black/[0.07] hover:bg-black/[0.13] text-fg'
                      : 'bg-white/14 hover:bg-white/24 text-white'
                    : 'bg-accent text-white hover:opacity-90 shadow-xs'
                }`}
              >
                <span>✂</span>
                <span>{ticket.wear.torn ? t('ticket.restore') : t('ticket.tear')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePunchHole}
              className={`h-8 rounded-full px-3.5 text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                isLightStage
                  ? 'bg-black/[0.07] hover:bg-black/[0.13] text-fg'
                  : 'bg-white/14 hover:bg-white/24 text-white'
              }`}
            >
              <span>◉</span>
              <span>{t('ticket.punch')}</span>
            </button>

            {ticket.wear.punches.length > 0 && (
              <button
                type="button"
                onClick={handleClearPunches}
                className={`h-8 rounded-full px-3 text-[12px] transition-colors cursor-pointer ${
                  isLightStage
                    ? 'bg-black/[0.05] hover:bg-black/[0.1] text-muted'
                    : 'bg-white/8 hover:bg-white/16 text-white/75'
                }`}
              >
                {t('ticket.clearPunches')} ({ticket.wear.punches.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => void requestMotionPermission()}
              className={`sm:hidden h-8 rounded-full px-3 text-[12px] transition-colors cursor-pointer ${
                isLightStage
                  ? 'bg-black/[0.05] hover:bg-black/[0.1] text-muted'
                  : 'bg-white/8 hover:bg-white/16 text-white/75'
              }`}
            >
              {t('ticket.gyro')}
            </button>
          </div>

          <div className="flex items-center gap-2.5 min-w-[180px]">
            <span className={`text-[11.5px] ${isLightStage ? 'text-muted' : 'text-white/70'}`}>
              {t('ticket.age')}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={ticket.wear.age}
              onChange={(e) => handleAgeChange(Number(e.target.value))}
              className="range w-24"
              aria-label={t('ticket.age')}
            />
            <span
              className={`font-mono text-[11px] w-9 text-right tabular-nums ${
                isLightStage ? 'text-fg/75' : 'text-white/75'
              }`}
            >
              {Math.round(ticket.wear.age * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* 4. 双栏馆藏档案卡（左：博物馆入藏规格表 · 右：典藏衬线手记与现场底片接触印相） */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 左栏：博物馆入藏规格表 */}
        <div className="lg:col-span-5 rounded-[22px] archival-card p-6 space-y-5">
          <SectionHead index="01" title={t('form.s2')} />

          {/* 席位与面值双联高亮读数 */}
          {(ticket.seat || ticket.priceAmount !== undefined) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl recessed-plinth p-3.5">
                <div className="label">{t('ticket.specSeat')}</div>
                <div className="font-mono text-[15px] font-semibold text-fg mt-1 truncate">
                  {ticket.seat || '—'}
                </div>
              </div>
              <div className="rounded-2xl recessed-plinth p-3.5">
                <div className="label">{t('ticket.specPrice')}</div>
                <div className="font-mono text-[15px] font-semibold text-fg mt-1 tabular-nums">
                  {ticket.priceAmount !== undefined
                    ? `${ticket.priceCurrency ?? 'JPY'} ${ticket.priceAmount.toLocaleString()}`
                    : 'ADMIT ONE'}
                </div>
              </div>
            </div>
          )}

          <dl className="divide-y divide-line">
            {specRows.map((row) => (
              <div key={row.label} className="py-2.5 flex items-baseline justify-between gap-4">
                <dt className="text-[12.5px] text-muted shrink-0">{row.label}</dt>
                <dd
                  className={`text-[13px] font-medium text-fg text-right break-words ${
                    row.mono ? 'font-mono text-[12px] tabular-nums' : ''
                  }`}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 右栏：散场手记与底片接触印相 */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-[22px] archival-card p-6 space-y-4">
            <SectionHead
              index="02"
              title={t('ticket.memory')}
              aside={
                ticket.rating !== undefined ? (
                  <RatingDots value={ticket.rating} size={7} />
                ) : undefined
              }
            />

            {ticket.note ? (
              <blockquote className="relative pl-4 border-l-2 border-accent/60 py-0.5">
                <p className="font-editorial text-[19px] sm:text-[21px] leading-[1.65] text-fg whitespace-pre-wrap">
                  {ticket.note}
                </p>
              </blockquote>
            ) : (
              <p className="text-[14px] leading-relaxed text-muted">{t('ticket.noNote')}</p>
            )}

            {(ticket.companions.length > 0 || ticket.tags.length > 0) && (
              <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-line">
                {ticket.companions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-muted">{t('ticket.companions')}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {ticket.companions.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-[12px] font-medium text-fg"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {ticket.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ticket.tags.map((tg) => (
                      <span
                        key={tg}
                        className="rounded-full recessed-plinth px-2.5 py-0.5 font-mono text-[11px] text-muted"
                      >
                        #{tg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 现场照片底片接触印相夹 */}
          <div className="rounded-[22px] archival-card p-6 space-y-4">
            <SectionHead
              index="03"
              title={`${t('ticket.photos')} (${mediaList.length})`}
              aside={
                <label
                  className={`${btnClass('outline', 'h-8 px-3.5 text-[12px]')} cursor-pointer`}
                >
                  <span>+ {t('ticket.addPhoto')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => void handlePhotoUpload(e)}
                    className="hidden"
                  />
                </label>
              }
            />

            {mediaList.length === 0 ? (
              <label className="rounded-2xl recessed-plinth py-9 px-6 flex flex-col items-center justify-center text-center gap-2 cursor-pointer hover:bg-black/[0.03] transition-colors">
                <div className="flex items-center gap-2 text-muted/60 font-mono text-[10.5px] tracking-widest">
                  <span>[ 01A ]</span>
                  <span>·</span>
                  <span>[ 02A ]</span>
                  <span>·</span>
                  <span>[ 03A ]</span>
                </div>
                <p className="text-[13.5px] font-medium text-fg/85 max-w-md">
                  {t('ticket.noPhotos')}
                </p>
                <span className="text-[11.5px] text-muted">{t('ticket.noPhotosHint')}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => void handlePhotoUpload(e)}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {mediaList.map((m, idx) => (
                  <div key={m.id} className="rounded-2xl recessed-plinth p-3 space-y-2.5">
                    <div className="flex items-center justify-between font-mono text-[10px] text-muted px-0.5">
                      <span>FRAME {String(idx + 1).padStart(2, '0')}A</span>
                      <span>
                        {m.width}×{m.height}
                      </span>
                    </div>
                    {m.dataUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxMedia(m)}
                        className="block w-full aspect-[4/3] overflow-hidden rounded-xl bg-bg group cursor-pointer"
                      >
                        <img
                          src={m.dataUrl}
                          alt={m.caption ?? ''}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        />
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        defaultValue={m.caption ?? ''}
                        placeholder={t('ticket.captionPlaceholder')}
                        onBlur={(e) => void updateMediaCaption(m.id, e.target.value)}
                        className="field text-xs py-1.5 bg-bg-raised"
                      />
                      <div className="flex items-center gap-1 text-xs text-muted shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => void handleMoveMedia(idx, -1)}
                          className="hover:text-fg disabled:opacity-30 px-1 cursor-pointer"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          disabled={idx === mediaList.length - 1}
                          onClick={() => void handleMoveMedia(idx, 1)}
                          className="hover:text-fg disabled:opacity-30 px-1 cursor-pointer"
                        >
                          →
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTicketMedia(m.id)}
                          className="hover:text-accent px-1 cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. 珍藏海报冲印工作室弹窗（SHARE-01 & SHARE-03） */}
      {posterOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('ticket.poster.title')}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
        >
          <button
            type="button"
            aria-label={t('ticket.poster.close')}
            onClick={() => setPosterOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative z-10 w-full max-w-[780px] rounded-[26px] archival-card p-5 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
                  {t('ticket.poster.title')}
                </h2>
                <p className="text-[12.5px] text-muted mt-0.5">{t('ticket.poster.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setPosterOpen(false)}
                className="w-8 h-8 rounded-full bg-bg-subtle hover:bg-black/15 text-fg flex items-center justify-center cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* 实时冲印预览框 */}
            <div className="rounded-2xl recessed-plinth p-3 sm:p-4 flex items-center justify-center">
              {posterPreviewUrl && (
                <img
                  src={posterPreviewUrl}
                  alt={ticket.title}
                  className="w-full h-auto max-h-[46vh] object-contain rounded-xl shadow-md"
                />
              )}
            </div>

            {/* 装裱版式与隐私打码控制 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="space-y-1.5">
                <div className="label">{t('ticket.poster.edition')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'obsidian', label: t('ticket.poster.themeObsidian') },
                      { id: 'ivory', label: t('ticket.poster.themeIvory') },
                      { id: 'vermilion', label: t('ticket.poster.themeVermilion') },
                    ] as const
                  ).map((ed) => (
                    <button
                      key={ed.id}
                      type="button"
                      onClick={() => {
                        playDetentClick(0.75);
                        setPosterEdition(ed.id);
                      }}
                      className={`h-8 px-3.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                        posterEdition === ed.id
                          ? 'bg-fg text-bg-raised'
                          : 'bg-bg-subtle text-muted hover:text-fg'
                      }`}
                    >
                      {ed.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="rounded-2xl recessed-plinth p-3.5 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={redactPrivacy}
                  onChange={(e) => {
                    playDetentClick(0.75);
                    setRedactPrivacy(e.target.checked);
                  }}
                  className="mt-0.5 accent-[#d64c35] w-4 h-4"
                />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-fg">
                    {t('ticket.poster.redact')}
                  </div>
                  <div className="text-[11px] text-muted leading-snug mt-0.5">
                    {t('ticket.poster.redactHint')}
                  </div>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Btn variant="pill" onClick={() => setPosterOpen(false)}>
                {t('ticket.poster.close')}
              </Btn>
              <Btn variant="solid" arrow onClick={() => void handleDownloadPoster()}>
                {t('ticket.poster.download')}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* 6. 现场原片全屏灯箱 */}
      {lightboxMedia?.dataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxMedia(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxMedia(null)}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6 cursor-zoom-out"
        >
          <img
            src={lightboxMedia.dataUrl}
            alt={lightboxMedia.caption ?? ''}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
          {lightboxMedia.caption && (
            <p className="mt-4 text-xs text-white/80">{lightboxMedia.caption}</p>
          )}
        </div>
      )}
    </Container>
  );
}
