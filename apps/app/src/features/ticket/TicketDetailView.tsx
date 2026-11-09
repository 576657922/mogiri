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
import {
  Btn,
  btnClass,
  Container,
  Label,
  RatingDots,
  SectionHead,
  ticketTypeCode,
  useUiStore,
} from '../../ui';

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
      const thumbDataUrl = renderThumbnailDataUrl(nextSpec, 640);
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
      <Container className="py-24 text-center space-y-5">
        <p className="display text-3xl text-fg">{t('ticket.notFound')}</p>
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
    ctx.fillText(
      `${ticket.title.toUpperCase()}   ·   HANKEN ARCHIVE`,
      out.width / 2,
      out.height - 46,
    );

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
    <div className="pt-8 pb-16 space-y-12">
      {/* 1. 顶部返回与编辑栏 */}
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-fg transition-colors"
          >
            <span>←</span>
            <span>{t('ticket.back')}</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="ghost" onClick={() => void handleExportPng()}>
              {t('ticket.export')}
            </Btn>
            <Link
              to="/t/$id/edit"
              params={{ id: ticket.id }}
              className={btnClass('outline', 'h-9 px-4 text-xs')}
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

        {/* 票根大标题区 */}
        <div className="pt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-8 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Label index={ticketTypeCode(ticket.type)}>{t(`types.${ticket.type}`)}</Label>
              {ticket.wear.torn && (
                <span className="border border-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  {t('home.torn')}
                </span>
              )}
            </div>
            <h1 className="display text-[clamp(2.2rem,4.5vw,4rem)] text-fg">{ticket.title}</h1>
            {ticket.subtitle && (
              <p className="text-base sm:text-lg text-muted">{ticket.subtitle}</p>
            )}
          </div>

          <div className="lg:col-span-4 lg:text-right space-y-1 font-mono text-xs text-muted">
            <div>{formatEventDateDisplay(ticket.eventAt, i18n.language)}</div>
            {ticket.venueName && (
              <div className="text-fg">
                {ticket.venueName}
                {ticket.city ? ` · ${ticket.city}` : ''}
              </div>
            )}
            {ticket.seat && <div>{ticket.seat}</div>}
          </div>
        </div>
      </Container>

      {/* 2. 暗房聚光灯 3D 舞台（全局 TicketCanvas 自动覆盖 #mogiri-stage-slot） */}
      <Container>
        <div className="relative cropmarks spotlight border border-line bg-bg-raised/40 p-3 sm:p-6">
          {/* 四角技术标尺信息 */}
          <div className="pointer-events-none flex items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-[0.16em] text-faint pb-2">
            <span className="truncate">STOCK · {ticket.material.toUpperCase()}</span>
            <span className="truncate">TEMPLATE · {spec.templateId.toUpperCase()}</span>
          </div>

          <section
            id="mogiri-stage-slot"
            className="w-full h-[220px] sm:h-[380px] lg:h-[480px]"
            aria-label={ticket.title}
          />

          <div className="pointer-events-none flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono tracking-[0.1em] text-muted pt-3 border-t border-line">
            <span>{t('ticket.hint')}</span>
            <span>{flipped ? 'SIDE B · REVERSE' : 'SIDE A · OBVERSE'}</span>
          </div>
        </div>

        {/* 物理交互控制坞 */}
        <div className="mt-4 border border-line bg-bg-raised/70 px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              variant="outline"
              className="h-9 px-4 text-xs"
              onClick={() => setFlipped((f) => !f)}
            >
              {t('ticket.flip')}
            </Btn>

            {hasStub && (
              <Btn
                variant={ticket.wear.torn ? 'outline' : 'accent'}
                className="h-9 px-4 text-xs"
                onClick={handleToggleStub}
              >
                {ticket.wear.torn ? t('ticket.restore') : t('ticket.tear')}
              </Btn>
            )}

            <Btn variant="outline" className="h-9 px-4 text-xs" onClick={handlePunchHole}>
              {t('ticket.punch')}
            </Btn>

            {ticket.wear.punches.length > 0 && (
              <Btn variant="ghost" className="h-9 px-3 text-xs" onClick={handleClearPunches}>
                {t('ticket.clearPunches')} ({ticket.wear.punches.length})
              </Btn>
            )}

            <Btn
              variant="ghost"
              className="h-9 px-3 text-xs sm:hidden"
              onClick={() => void requestMotionPermission()}
            >
              {t('ticket.gyro')}
            </Btn>
          </div>

          <div className="flex items-center gap-3 min-w-[210px]">
            <span className="label">{t('ticket.age')}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={ticket.wear.age}
              onChange={(e) => handleAgeChange(Number(e.target.value))}
              className="range w-28"
              aria-label={t('ticket.age')}
            />
            <span className="font-mono text-xs text-muted w-9 text-right">
              {Math.round(ticket.wear.age * 100)}%
            </span>
          </div>
        </div>
      </Container>

      <div aria-hidden className="perforation" />

      {/* 3. 双栏档案卷宗：左栏票面规格，右栏当日回忆与现场照片 */}
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* 左栏：票面规格表 */}
          <div className="lg:col-span-5 space-y-6">
            <SectionHead index="01" title={t('form.s2')} />
            <dl className="divide-y divide-line border-b border-line">
              {specRows.map((row) => (
                <div key={row.label} className="py-3.5 grid grid-cols-3 gap-4 items-baseline">
                  <dt className="label">{row.label}</dt>
                  <dd className="col-span-2 font-mono text-xs sm:text-[13px] text-fg break-words">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* 右栏：那一天（回忆、同行人、评分、照片底片） */}
          <div className="lg:col-span-7 space-y-12">
            <div className="space-y-6">
              <SectionHead
                index="02"
                title={t('ticket.memory')}
                aside={
                  ticket.rating !== undefined ? (
                    <RatingDots value={ticket.rating} size={8} />
                  ) : undefined
                }
              />

              <blockquote className="display text-2xl sm:text-3xl leading-relaxed text-fg whitespace-pre-wrap">
                {ticket.note || <span className="text-muted italic">{t('ticket.noNote')}</span>}
              </blockquote>

              {(ticket.companions.length > 0 || ticket.tags.length > 0) && (
                <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-line">
                  {ticket.companions.length > 0 && (
                    <div className="flex items-center gap-2.5">
                      <span className="label">{t('ticket.companions')}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {ticket.companions.map((c) => (
                          <span
                            key={c}
                            className="border border-line-strong px-2.5 py-0.5 font-mono text-xs text-fg"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {ticket.tags.length > 0 && (
                    <div className="flex items-center gap-2.5">
                      <span className="label">{t('ticket.tags')}</span>
                      <div className="flex flex-wrap gap-2">
                        {ticket.tags.map((tg) => (
                          <span key={tg} className="font-mono text-xs text-muted">
                            #{tg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 现场照片底片墙 */}
            <div className="space-y-6">
              <SectionHead
                index="03"
                title={`${t('ticket.photos')} (${mediaList.length})`}
                aside={
                  <label className={`${btnClass('outline', 'h-9 px-4 text-xs')} cursor-pointer`}>
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
                <p className="border border-dashed border-line py-12 text-center text-xs text-muted">
                  {t('ticket.noPhotos')}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {mediaList.map((m, idx) => (
                    <div key={m.id} className="border border-line bg-bg-raised/50 p-3 space-y-3">
                      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-faint">
                        <span>FRAME {String(idx + 1).padStart(2, '0')}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void handleMoveMedia(idx, -1)}
                            className="hover:text-fg disabled:opacity-30"
                            title={t('ticket.moveLeft')}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            disabled={idx === mediaList.length - 1}
                            onClick={() => void handleMoveMedia(idx, 1)}
                            className="hover:text-fg disabled:opacity-30"
                            title={t('ticket.moveRight')}
                          >
                            →
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteTicketMedia(m.id)}
                            className="hover:text-accent ml-1"
                          >
                            {t('ticket.removePhoto')}
                          </button>
                        </div>
                      </div>

                      {m.dataUrl && (
                        <button
                          type="button"
                          onClick={() => setLightboxMedia(m)}
                          className="block w-full aspect-[4/3] overflow-hidden bg-bg group"
                        >
                          <img
                            src={m.dataUrl}
                            alt={m.caption ?? ''}
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                          />
                        </button>
                      )}

                      <input
                        type="text"
                        defaultValue={m.caption ?? ''}
                        placeholder={t('ticket.captionPlaceholder')}
                        onBlur={(e) => void updateMediaCaption(m.id, e.target.value)}
                        className="field text-xs py-1.5"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>

      {/* 全屏灯箱 */}
      {lightboxMedia?.dataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxMedia(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxMedia(null)}
          className="fixed inset-0 z-50 bg-black/92 flex flex-col items-center justify-center p-6 cursor-zoom-out"
        >
          <img
            src={lightboxMedia.dataUrl}
            alt={lightboxMedia.caption ?? ''}
            className="max-w-full max-h-[85vh] object-contain"
          />
          {lightboxMedia.caption && (
            <p className="mt-4 font-mono text-xs text-stone-300">{lightboxMedia.caption}</p>
          )}
        </div>
      )}
    </div>
  );
}
