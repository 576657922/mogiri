import {
  getTemplate,
  renderThumbnailDataUrl,
  renderTicketCardCanvas,
  requestMotionPermission,
} from '@mogiri/renderer';
import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  CircleDot,
  Compass,
  Download,
  Edit3,
  ImagePlus,
  RotateCw,
  Scissors,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react';
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
import { ticketTypeEmoji, useUiStore } from '../../ui';

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
      const thumbDataUrl = renderThumbnailDataUrl(nextSpec, 560);
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
      <div className="py-16 text-center space-y-4">
        <p className="text-stone-400 text-sm">{t('timeline.emptyTitle')}</p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 border border-stone-800 text-xs text-stone-200"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t('ticket.backToTimeline')}</span>
        </Link>
      </div>
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

    const bg = ctx.createRadialGradient(900, 600, 80, 900, 600, 1000);
    bg.addColorStop(0, '#272a35');
    bg.addColorStop(1, '#0e1015');
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
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 24;
    ctx.drawImage(cardCanvas, dx, dy, dw, dh);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${ticket.title}  ·  Hanken / Mogiri`, out.width / 2, out.height - 44);

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

  return (
    <div className="space-y-6">
      {/* 顶部返回与编辑操作 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t('ticket.backToTimeline')}</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExportPng()}
            className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-medium text-stone-200 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('ticket.exportPng')}</span>
          </button>
          <Link
            to="/t/$id/edit"
            params={{ id: ticket.id }}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold flex items-center gap-1.5"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{t('ticket.editTicket')}</span>
          </Link>
          <button
            type="button"
            onClick={() => void handleSoftDelete()}
            className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-medium text-rose-300 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('ticket.deleteTicket')}</span>
          </button>
        </div>
      </div>

      {/* 3D 仿真渲染舞台槽位（全局唯一 TicketCanvas 自动覆盖到此区域） */}
      <div className="relative rounded-3xl bg-radial from-stone-800/70 via-stone-900/95 to-stone-950 border border-stone-800 overflow-hidden shadow-2xl">
        <section
          id="mogiri-stage-slot"
          className="w-full h-[360px] sm:h-[440px] md:h-[500px]"
          aria-label={ticket.title}
        />
        <div className="px-4 py-2.5 bg-stone-950/80 border-t border-stone-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
          <span>{t('ticket.hintInteract')}</span>
          <span className="font-mono text-[11px] text-stone-500">
            {t(`materials.${ticket.material}`)} · {t(`ticket.source.${ticket.source}`)}
          </span>
        </div>
      </div>

      {/* 仿真物理交互工具栏（翻面、撕副券、检票打孔、岁月泛黄、陀螺仪） */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="px-3.5 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-700 text-xs font-medium text-stone-100 flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            <span>{flipped ? t('ticket.flipBack') : t('ticket.flipFront')}</span>
          </button>

          {hasStub && (
            <button
              type="button"
              onClick={handleToggleStub}
              className="px-3.5 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-700 text-xs font-medium text-stone-100 flex items-center gap-1.5"
            >
              {ticket.wear.torn ? (
                <>
                  <Undo2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('ticket.restoreStub')}</span>
                </>
              ) : (
                <>
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('ticket.tearStub')}</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handlePunchHole}
            className="px-3.5 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-700 text-xs font-medium text-stone-100 flex items-center gap-1.5"
          >
            <CircleDot className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('ticket.punchTicket')}</span>
          </button>

          {ticket.wear.punches.length > 0 && (
            <button
              type="button"
              onClick={handleClearPunches}
              className="px-3 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-800 text-xs text-stone-400"
            >
              {t('ticket.clearPunches')} ({ticket.wear.punches.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => void requestMotionPermission()}
            className="px-3 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-800 text-xs text-stone-300 flex items-center gap-1.5 sm:hidden"
          >
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('ticket.enableGyro')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5 text-xs text-stone-300">
          <span>{t('ticket.ageLabel')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={ticket.wear.age}
            onChange={(e) => handleAgeChange(Number(e.target.value))}
            className="w-28 accent-amber-400 cursor-pointer"
          />
          <span className="font-mono text-stone-400 w-9">{Math.round(ticket.wear.age * 100)}%</span>
        </div>
      </div>

      {/* 票面详细信息与当天的回忆 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-300">
              {t('ticket.detailsSection')}
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-stone-950 border border-stone-800 text-stone-300">
              {ticketTypeEmoji(ticket.type)} {t(`types.${ticket.type}`)}
            </span>
          </div>

          <div>
            <h1 className="text-xl font-bold text-stone-100">{ticket.title}</h1>
            {ticket.subtitle && <p className="text-sm text-stone-400 mt-0.5">{ticket.subtitle}</p>}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-stone-800/80">
            <div>
              <dt className="text-stone-500">{t('form.eventAt')}</dt>
              <dd className="font-mono text-stone-200 mt-0.5">
                {formatEventDateDisplay(ticket.eventAt, i18n.language)} ({ticket.eventTz})
              </dd>
            </div>
            {ticket.venueName && (
              <div>
                <dt className="text-stone-500">{t('form.venueName')}</dt>
                <dd className="text-stone-200 mt-0.5">
                  {ticket.venueName}
                  {ticket.city ? ` · ${ticket.city}` : ''}
                </dd>
              </div>
            )}
            {ticket.seat && (
              <div>
                <dt className="text-stone-500">{t('form.seat')}</dt>
                <dd className="font-mono text-stone-200 mt-0.5">{ticket.seat}</dd>
              </div>
            )}
            {ticket.priceAmount !== undefined && (
              <div>
                <dt className="text-stone-500">{t('form.priceAmount')}</dt>
                <dd className="font-mono text-stone-200 mt-0.5">
                  {ticket.priceCurrency ?? 'JPY'} {ticket.priceAmount.toLocaleString()}
                </dd>
              </div>
            )}
            {Object.entries(ticket.details).map(([k, v]) =>
              v ? (
                <div key={k}>
                  <dt className="text-stone-500">{t(`form.ext.${k}`, { defaultValue: k })}</dt>
                  <dd className="font-mono text-stone-200 mt-0.5">{v}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </section>

        <section className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-300">
              {t('ticket.memorySection')}
            </h2>
            {ticket.rating !== undefined && (
              <div className="flex items-center gap-1 text-amber-400">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${star <= (ticket.rating ?? 0) ? 'fill-amber-400' : 'text-stone-700'}`}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="text-sm text-stone-200 whitespace-pre-wrap leading-relaxed">
            {ticket.note || <span className="text-stone-500">{t('ticket.noNote')}</span>}
          </p>

          {(ticket.companions.length > 0 || ticket.tags.length > 0) && (
            <div className="pt-3 border-t border-stone-800/80 space-y-2 text-xs">
              {ticket.companions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-stone-500">{t('ticket.companions')}:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ticket.companions.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      >
                        @{c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {ticket.tags.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-stone-500">{t('ticket.tags')}:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ticket.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-stone-950 border border-stone-800 text-stone-300"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 现场照片墙（支持多选上传、排序、说明文字、全屏预览、删除 MEM-01） */}
      <section className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-300">
            {t('ticket.photosSection', { count: mediaList.length })}
          </h2>
          <label className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">
            <ImagePlus className="w-3.5 h-3.5" />
            <span>{t('ticket.addPhoto')}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => void handlePhotoUpload(e)}
              className="hidden"
            />
          </label>
        </div>

        {mediaList.length === 0 ? (
          <p className="text-xs text-stone-500 py-6 text-center">{t('ticket.noPhotos')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {mediaList.map((m, idx) => (
              <div
                key={m.id}
                className="rounded-xl bg-stone-950 border border-stone-800 overflow-hidden flex flex-col"
              >
                {m.dataUrl && (
                  <button
                    type="button"
                    onClick={() => setLightboxMedia(m)}
                    className="relative aspect-4/3 w-full bg-stone-900 overflow-hidden group"
                  >
                    <img
                      src={m.dataUrl}
                      alt={m.caption ?? ''}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </button>
                )}
                <div className="p-2.5 space-y-2">
                  <input
                    type="text"
                    defaultValue={m.caption ?? ''}
                    placeholder={t('ticket.photoCaptionPlaceholder')}
                    onBlur={(e) => void updateMediaCaption(m.id, e.target.value)}
                    className="w-full bg-transparent text-xs text-stone-200 placeholder:text-stone-600 focus:outline-none border-b border-transparent focus:border-stone-700 pb-1"
                  />
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => void handleMoveMedia(idx, -1)}
                        className="p-1 rounded hover:bg-stone-900 disabled:opacity-30"
                        title={t('ticket.moveLeft')}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === mediaList.length - 1}
                        onClick={() => void handleMoveMedia(idx, 1)}
                        className="p-1 rounded hover:bg-stone-900 disabled:opacity-30"
                        title={t('ticket.moveRight')}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteTicketMedia(m.id)}
                      className="text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded"
                    >
                      {t('ticket.removePhoto')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 全屏图片查看器 */}
      {lightboxMedia?.dataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxMedia(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxMedia(null)}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={lightboxMedia.dataUrl}
            alt={lightboxMedia.caption ?? ''}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
          {lightboxMedia.caption && (
            <p className="mt-3 text-sm text-stone-200">{lightboxMedia.caption}</p>
          )}
        </div>
      )}
    </div>
  );
}
