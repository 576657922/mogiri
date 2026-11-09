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
  updateMediaCaption,
  updateTicket,
} from '../../data';
import { formatEventDateDisplay, toTicketSpec } from '../../domain';
import { downloadOrShareBlob } from '../../platform';
import { Btn, btnClass, Container, RatingDots, SectionHead, useUiStore } from '../../ui';

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

export function TicketDetailView({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setActiveStage = useUiStore((s) => s.setActiveStage);

  const ticket = useLiveQuery(() => db.tickets.get(id), [id]);
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
    void persistWear({ ...ticket.wear, torn: true });
  }, [ticket, persistWear]);

  useEffect(() => {
    if (!spec) {
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
  }, [spec, flipped, handleTearFromStage, setActiveStage]);

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
  const hasStub = Boolean(tpl.stub);

  const handleToggleStub = () => {
    void persistWear({ ...ticket.wear, torn: !ticket.wear.torn });
  };

  const handlePunchHole = () => {
    const size = spec.sizeMm ?? tpl.size;
    const newPunch = {
      x: Number((6 + Math.random() * Math.min(28, size.w * 0.25)).toFixed(1)),
      y: Number((8 + Math.random() * (size.h - 16)).toFixed(1)),
    };
    void persistWear({
      ...ticket.wear,
      punches: [...ticket.wear.punches, newPunch],
    });
  };

  const handleClearPunches = () => {
    void persistWear({ ...ticket.wear, punches: [] });
  };

  const handleAgeChange = (ageVal: number) => {
    void persistWear({ ...ticket.wear, age: ageVal });
  };

  const handleExportPng = async () => {
    const cardCanvas = renderTicketCardCanvas(spec, 1600);
    const out = document.createElement('canvas');
    out.width = 1800;
    out.height = 1200;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    const bg = ctx.createRadialGradient(900, 560, 80, 900, 600, 1000);
    bg.addColorStop(0, '#1e1c19');
    bg.addColorStop(1, '#0e0d0c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);

    const scale = Math.min(
      (out.width * 0.84) / cardCanvas.width,
      (out.height * 0.76) / cardCanvas.height,
    );
    const dw = cardCanvas.width * scale;
    const dh = cardCanvas.height * scale;
    const dx = (out.width - dw) / 2;
    const dy = (out.height - dh) / 2 - 20;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.68)';
    ctx.shadowBlur = 52;
    ctx.shadowOffsetY = 26;
    ctx.drawImage(cardCanvas, dx, dy, dw, dh);
    ctx.restore();

    ctx.fillStyle = 'rgba(239,233,223,0.48)';
    ctx.font = '500 20px "JetBrains Mono Variable", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${ticket.title.toUpperCase()}   ·   HANKEN`, out.width / 2, out.height - 46);

    out.toBlob(async (blob) => {
      if (!blob) return;
      await downloadOrShareBlob(blob, `${ticket.title.replace(/\s+/g, '-')}.png`, ticket.title);
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

  const specRows: { label: string; value: string }[] = [
    {
      label: t('ticket.specDate'),
      value: `${formatEventDateDisplay(ticket.eventAt, i18n.language)} (${ticket.eventTz})`,
    },
    ...(ticket.venueName || ticket.city
      ? [
          {
            label: t('ticket.specVenue'),
            value: [ticket.venueName, ticket.city, ticket.country].filter(Boolean).join(' · '),
          },
        ]
      : []),
    ...(ticket.seat ? [{ label: t('ticket.specSeat'), value: ticket.seat }] : []),
    ...(ticket.priceAmount !== undefined
      ? [
          {
            label: t('ticket.specPrice'),
            value: `${ticket.priceCurrency ?? 'JPY'} ${ticket.priceAmount.toLocaleString()}`,
          },
        ]
      : []),
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

  return (
    <Container className="py-6 sm:py-8 space-y-6">
      {/* 1. 顶部操作导航栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className={btnClass('pill')}>
          <span>←</span>
          <span>{t('ticket.back')}</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="pill" onClick={() => void handleExportPng()}>
            {t('ticket.export')}
          </Btn>
          <Link
            to="/t/$id/edit"
            params={{ id: ticket.id }}
            className={btnClass('outline', 'h-8 px-3.5 text-[12.5px]')}
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

      {/* 2. 票面标题区 */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
            <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-fg">
              {t(`types.${ticket.type}`)}
            </span>
            <span>·</span>
            <span>{t(`materials.${ticket.material}`)}</span>
            {ticket.wear.torn && (
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-accent">
                {t('home.torn')}
              </span>
            )}
          </div>
          <h1 className="text-[24px] sm:text-[32px] font-semibold tracking-[-0.025em] text-fg">
            {ticket.title}
          </h1>
          {ticket.subtitle && <p className="text-[14px] text-muted">{ticket.subtitle}</p>}
        </div>

        <div className="text-[12.5px] font-mono text-muted sm:text-right">
          <div>{formatEventDateDisplay(ticket.eventAt, i18n.language)}</div>
          {ticket.venueName && (
            <div className="text-fg font-sans font-medium">
              {ticket.venueName}
              {ticket.city ? ` · ${ticket.city}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* 3. 3D 暗房检视舞台卡片（圆角黑盒 + 底部悬浮毛玻璃控制条） */}
      <div className="relative rounded-[24px] spotlight p-4 sm:p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.14)] overflow-hidden">
        <div className="pointer-events-none flex items-center justify-between text-[11px] font-mono text-white/45 pb-1">
          <span>{t('ticket.hint')}</span>
          <span>{flipped ? 'REVERSE' : 'OBVERSE'}</span>
        </div>

        <section
          id="mogiri-stage-slot"
          className="w-full h-[240px] sm:h-[380px] lg:h-[440px]"
          aria-label={ticket.title}
        />

        {/* 悬浮毛玻璃工具坞 */}
        <div className="mt-2 rounded-2xl bg-white/[0.08] backdrop-blur-md border border-white/[0.1] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="h-8 rounded-full bg-white/12 hover:bg-white/22 px-3.5 text-[12px] font-medium text-white transition-colors cursor-pointer"
            >
              {t('ticket.flip')}
            </button>

            {hasStub && (
              <button
                type="button"
                onClick={handleToggleStub}
                className={`h-8 rounded-full px-3.5 text-[12px] font-medium transition-colors cursor-pointer ${
                  ticket.wear.torn
                    ? 'bg-white/12 hover:bg-white/22 text-white'
                    : 'bg-accent text-white hover:opacity-90'
                }`}
              >
                {ticket.wear.torn ? t('ticket.restore') : t('ticket.tear')}
              </button>
            )}

            <button
              type="button"
              onClick={handlePunchHole}
              className="h-8 rounded-full bg-white/12 hover:bg-white/22 px-3.5 text-[12px] font-medium text-white transition-colors cursor-pointer"
            >
              {t('ticket.punch')}
            </button>

            {ticket.wear.punches.length > 0 && (
              <button
                type="button"
                onClick={handleClearPunches}
                className="h-8 rounded-full bg-white/8 hover:bg-white/16 px-3 text-[12px] text-white/75 transition-colors cursor-pointer"
              >
                {t('ticket.clearPunches')} ({ticket.wear.punches.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => void requestMotionPermission()}
              className="sm:hidden h-8 rounded-full bg-white/8 hover:bg-white/16 px-3 text-[12px] text-white/75 transition-colors cursor-pointer"
            >
              {t('ticket.gyro')}
            </button>
          </div>

          <div className="flex items-center gap-2.5 min-w-[180px]">
            <span className="text-[11.5px] text-white/65">{t('ticket.age')}</span>
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
            <span className="font-mono text-[11px] text-white/70 w-8 text-right">
              {Math.round(ticket.wear.age * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* 4. 双栏详情 Bento 卡片 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 左卡片：票面规格 */}
        <div className="lg:col-span-5 rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
          <SectionHead title={t('form.s2')} />
          <dl className="divide-y divide-line">
            {specRows.map((row) => (
              <div key={row.label} className="py-2.5 flex items-baseline justify-between gap-4">
                <dt className="text-[12.5px] text-muted shrink-0">{row.label}</dt>
                <dd className="text-[13px] font-medium text-fg text-right break-words">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 右卡片：当日记忆与照片 */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
            <SectionHead
              title={t('ticket.memory')}
              aside={
                ticket.rating !== undefined ? (
                  <RatingDots value={ticket.rating} size={7} />
                ) : undefined
              }
            />

            <p className="text-[16px] leading-relaxed text-fg whitespace-pre-wrap">
              {ticket.note || <span className="text-muted">{t('ticket.noNote')}</span>}
            </p>

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
                  <div className="flex items-center gap-1.5">
                    {ticket.tags.map((tg) => (
                      <span
                        key={tg}
                        className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-[12px] text-muted"
                      >
                        #{tg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 现场照片卡片 */}
          <div className="rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
            <SectionHead
              title={`${t('ticket.photos')} (${mediaList.length})`}
              aside={
                <label className={`${btnClass('pill')} cursor-pointer`}>
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
              <p className="rounded-xl bg-bg-subtle/60 py-10 text-center text-[13px] text-muted">
                {t('ticket.noPhotos')}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {mediaList.map((m, idx) => (
                  <div key={m.id} className="rounded-xl bg-bg-subtle/60 p-3 space-y-2.5">
                    {m.dataUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxMedia(m)}
                        className="block w-full aspect-[4/3] overflow-hidden rounded-lg bg-bg group cursor-pointer"
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

      {/* 全屏灯箱 */}
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
