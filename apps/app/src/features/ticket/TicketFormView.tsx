import { type MaterialName, renderThumbnailDataUrl } from '@mogiri/renderer';
import { MATERIALS, TICKET_TYPES, type TicketType } from '@mogiri/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Check, ImagePlus, Save, Sparkles, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createTicket,
  db,
  getBlob,
  saveBlob,
  type TicketCreateInput,
  type TicketRecord,
  type TicketSource,
  updateTicket,
} from '../../data';
import {
  defaultMaterialForType,
  defaultTemplateForType,
  type RecognitionDraft,
  toTicketSpec,
} from '../../domain';
import { dataUrlToBlob, getDefaultTimezone, readFileAsDataUrl } from '../../platform';

/** 每种票型对应的专属扩展字段 key 列表（见 02-architecture §7.1） */
const EXT_FIELDS_BY_TYPE: Record<TicketType, readonly string[]> = {
  flight: ['airline', 'flightNo', 'from', 'to', 'gate', 'cabin', 'boardingTime'],
  train: ['operator', 'trainName', 'from', 'to', 'car', 'seatClass'],
  movie: ['cinema', 'screen', 'format'],
  concert: ['artist', 'tour', 'doorsAt', 'entryNo'],
  theater: ['company', 'doorsAt'],
  sports: ['home', 'away', 'competition', 'stand'],
  exhibition: ['museum', 'validUntil'],
  other: [],
};

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export interface TicketFormViewProps {
  ticketId?: string;
  initialDraft?: RecognitionDraft;
  initialScanDataUrl?: string;
  initialSizeMm?: { w: number; h: number };
  onSaved?: (ticket: TicketRecord) => void;
}

export const TicketFormView: React.FC<TicketFormViewProps> = ({
  ticketId,
  initialDraft,
  initialScanDataUrl,
  initialSizeMm,
  onSaved,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const existingTicket = useLiveQuery(
    async () => (ticketId ? await db.tickets.get(ticketId) : undefined),
    [ticketId],
  );

  const [type, setType] = useState<TicketType>(initialDraft?.input.type ?? 'concert');
  const [title, setTitle] = useState<string>(initialDraft?.input.title ?? '');
  const [subtitle, setSubtitle] = useState<string>(initialDraft?.input.subtitle ?? '');
  const [eventAt, setEventAt] = useState<string>(initialDraft?.input.eventAt ?? '2026-11-09T19:00');
  const [eventTz, setEventTz] = useState<string>(
    initialDraft?.input.eventTz ?? getDefaultTimezone(),
  );
  const [venueName, setVenueName] = useState<string>(initialDraft?.input.venueName ?? '');
  const [city, setCity] = useState<string>(initialDraft?.input.city ?? '');
  const [country, setCountry] = useState<string>(initialDraft?.input.country ?? 'JP');
  const [latStr, setLatStr] = useState<string>(
    initialDraft?.input.lat !== undefined ? String(initialDraft.input.lat) : '',
  );
  const [lngStr, setLngStr] = useState<string>(
    initialDraft?.input.lng !== undefined ? String(initialDraft.input.lng) : '',
  );
  const [seat, setSeat] = useState<string>(initialDraft?.input.seat ?? '');
  const [priceAmountStr, setPriceAmountStr] = useState<string>(
    initialDraft?.input.priceAmount !== undefined ? String(initialDraft.input.priceAmount) : '',
  );
  const [priceCurrency, setPriceCurrency] = useState<string>(
    initialDraft?.input.priceCurrency ?? 'JPY',
  );
  const [details, setDetails] = useState<Record<string, string>>(initialDraft?.input.details ?? {});
  const [material, setMaterial] = useState<MaterialName>(
    initialDraft?.input.material ?? defaultMaterialForType(initialDraft?.input.type ?? 'concert'),
  );
  const [age, setAge] = useState<number>(initialDraft?.input.wear?.age ?? 0);
  const [rating, setRating] = useState<number>(initialDraft?.input.rating ?? 5);
  const [companionsStr, setCompanionsStr] = useState<string>(
    (initialDraft?.input.companions ?? []).join(', '),
  );
  const [tagsStr, setTagsStr] = useState<string>((initialDraft?.input.tags ?? []).join(', '));
  const [note, setNote] = useState<string>(initialDraft?.input.note ?? '');
  const [scanDataUrl, setScanDataUrl] = useState<string | undefined>(initialScanDataUrl);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // 当 initialDraft 更新时（例如在确认页点击了「模拟 AI 文字增强」），同步表单字段
  useEffect(() => {
    if (!initialDraft) return;
    const inp = initialDraft.input;
    setType(inp.type);
    setTitle(inp.title);
    setSubtitle(inp.subtitle ?? '');
    setEventAt(inp.eventAt);
    setEventTz(inp.eventTz);
    setVenueName(inp.venueName ?? '');
    setCity(inp.city ?? '');
    setCountry(inp.country ?? 'JP');
    setSeat(inp.seat ?? '');
    setPriceAmountStr(inp.priceAmount !== undefined ? String(inp.priceAmount) : '');
    setPriceCurrency(inp.priceCurrency ?? 'JPY');
    setDetails(inp.details ?? {});
    setMaterial(inp.material);
  }, [initialDraft]);

  // 编辑已有票据时回填数据
  useEffect(() => {
    if (!existingTicket) return;
    setType(existingTicket.type);
    setTitle(existingTicket.title);
    setSubtitle(existingTicket.subtitle ?? '');
    setEventAt(existingTicket.eventAt);
    setEventTz(existingTicket.eventTz);
    setVenueName(existingTicket.venueName ?? '');
    setCity(existingTicket.city ?? '');
    setCountry(existingTicket.country ?? '');
    setLatStr(existingTicket.lat !== undefined ? String(existingTicket.lat) : '');
    setLngStr(existingTicket.lng !== undefined ? String(existingTicket.lng) : '');
    setSeat(existingTicket.seat ?? '');
    setPriceAmountStr(
      existingTicket.priceAmount !== undefined ? String(existingTicket.priceAmount) : '',
    );
    setPriceCurrency(existingTicket.priceCurrency ?? 'JPY');
    setDetails(existingTicket.details);
    setMaterial(existingTicket.material);
    setAge(existingTicket.wear.age);
    setRating(existingTicket.rating ?? 5);
    setCompanionsStr(existingTicket.companions.join(', '));
    setTagsStr(existingTicket.tags.join(', '));
    setNote(existingTicket.note ?? '');

    if (existingTicket.scanFrontKey) {
      void getBlob(existingTicket.scanFrontKey).then((blob) => {
        if (blob) {
          void readFileAsDataUrl(blob).then(setScanDataUrl);
        }
      });
    }
  }, [existingTicket]);

  // 实时生成预览缩略图
  const tempRecord = useMemo<TicketRecord>(() => {
    const parsedPrice = Number(priceAmountStr);
    const parsedLat = Number(latStr);
    const parsedLng = Number(lngStr);
    return {
      id: existingTicket?.id ?? 'preview',
      type,
      title: title.trim() || 'Sample Ticket',
      ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
      eventAt: /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(eventAt.trim())
        ? eventAt.trim()
        : '2026-11-09T19:00',
      eventTz: eventTz.trim() || 'Asia/Tokyo',
      ...(venueName.trim() ? { venueName: venueName.trim() } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(country.trim() ? { country: country.trim() } : {}),
      ...(latStr.trim() !== '' && !Number.isNaN(parsedLat) ? { lat: parsedLat } : {}),
      ...(lngStr.trim() !== '' && !Number.isNaN(parsedLng) ? { lng: parsedLng } : {}),
      ...(seat.trim() ? { seat: seat.trim() } : {}),
      ...(priceAmountStr.trim() !== '' && !Number.isNaN(parsedPrice)
        ? { priceAmount: parsedPrice }
        : {}),
      ...(priceCurrency.trim() ? { priceCurrency: priceCurrency.trim() } : {}),
      details,
      material,
      templateId: defaultTemplateForType(type),
      wear: {
        torn: existingTicket?.wear.torn ?? false,
        punches: existingTicket?.wear.punches ?? [],
        age,
      },
      source: existingTicket?.source ?? initialDraft?.input.source ?? 'manual',
      ...(initialSizeMm
        ? { sizeMm: initialSizeMm }
        : existingTicket?.sizeMm
          ? { sizeMm: existingTicket.sizeMm }
          : {}),
      tags: [],
      companions: [],
      status: 'active',
      clientUpdatedAt: '',
      serverSeq: 0,
    };
  }, [
    existingTicket,
    initialDraft,
    initialSizeMm,
    type,
    title,
    subtitle,
    eventAt,
    eventTz,
    venueName,
    city,
    country,
    latStr,
    lngStr,
    seat,
    priceAmountStr,
    priceCurrency,
    details,
    material,
    age,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let faceImage: HTMLImageElement | undefined;
        if (scanDataUrl) {
          faceImage = await loadHtmlImage(scanDataUrl);
        }
        if (cancelled) return;
        const spec = toTicketSpec(tempRecord, faceImage ? { faceImage } : undefined);
        const url = renderThumbnailDataUrl(spec, 560);
        if (!cancelled) setPreviewUrl(url);
      } catch {
        // 忽略图片未就绪时的临时错误
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tempRecord, scanDataUrl]);

  const handleTypeChange = (nextType: TicketType) => {
    setType(nextType);
    if (!existingTicket) {
      setMaterial(defaultMaterialForType(nextType));
    }
  };

  const renderLowConfidenceBadge = (fieldKey: string) => {
    if (!initialDraft) return null;
    if (!initialDraft.lowConfidenceKeys.includes(fieldKey)) return null;
    const conf = initialDraft.confidences[fieldKey] ?? 0;
    const pct = Math.round(conf * 100);
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-500/30">
        <AlertTriangle className="h-3 w-3" />
        {t('form.lowConfidenceHint', { pct })}
      </span>
    );
  };

  const isFieldLowConfidence = (fieldKey: string): boolean =>
    Boolean(initialDraft?.lowConfidenceKeys.includes(fieldKey));

  const handleUploadScanFront = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await readFileAsDataUrl(file);
    setScanDataUrl(url);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const normalizedEventAt = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(eventAt.trim())
        ? eventAt.trim()
        : '2026-11-09T19:00';

      let scanFrontKey = existingTicket?.scanFrontKey;
      let faceImage: HTMLImageElement | undefined;
      if (scanDataUrl) {
        scanFrontKey = scanFrontKey ?? `scan-front:${Date.now()}`;
        await saveBlob(scanFrontKey, dataUrlToBlob(scanDataUrl));
        faceImage = await loadHtmlImage(scanDataUrl);
      } else {
        scanFrontKey = undefined;
      }

      const companions = companionsStr
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const tags = tagsStr
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const parsedPrice = Number(priceAmountStr);
      const parsedLat = Number(latStr);
      const parsedLng = Number(lngStr);

      const specForThumb = toTicketSpec(
        {
          ...tempRecord,
          title: title.trim() || 'Untitled Ticket',
          eventAt: normalizedEventAt,
        },
        faceImage ? { faceImage } : undefined,
      );
      const thumbDataUrl = renderThumbnailDataUrl(specForThumb, 520);

      const source: TicketSource = existingTicket?.source ?? initialDraft?.input.source ?? 'manual';

      const basePayload: TicketCreateInput = {
        type,
        title: title.trim() || 'Untitled Ticket',
        ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
        eventAt: normalizedEventAt,
        eventTz: eventTz.trim() || getDefaultTimezone(),
        ...(venueName.trim() ? { venueName: venueName.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(country.trim() ? { country: country.trim() } : {}),
        ...(latStr.trim() !== '' && !Number.isNaN(parsedLat) ? { lat: parsedLat } : {}),
        ...(lngStr.trim() !== '' && !Number.isNaN(parsedLng) ? { lng: parsedLng } : {}),
        ...(seat.trim() ? { seat: seat.trim() } : {}),
        ...(priceAmountStr.trim() !== '' && !Number.isNaN(parsedPrice)
          ? { priceAmount: parsedPrice }
          : {}),
        ...(priceCurrency.trim() ? { priceCurrency: priceCurrency.trim() } : {}),
        details,
        material,
        templateId: defaultTemplateForType(type),
        wear: {
          torn: existingTicket?.wear.torn ?? false,
          punches: existingTicket?.wear.punches ?? [],
          age,
        },
        source,
        ...(scanFrontKey ? { scanFrontKey } : {}),
        thumbDataUrl,
        ...(initialSizeMm
          ? { sizeMm: initialSizeMm }
          : existingTicket?.sizeMm
            ? { sizeMm: existingTicket.sizeMm }
            : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        rating,
        tags,
        companions,
        status: 'active',
      };

      let saved: TicketRecord;
      if (existingTicket) {
        saved = await updateTicket(existingTicket.id, basePayload);
      } else {
        saved = await createTicket(basePayload);
      }

      if (onSaved) {
        onSaved(saved);
      } else {
        void navigate({ to: '/t/$id', params: { id: saved.id } });
      }
    } finally {
      setSaving(false);
    }
  };

  const extFields = EXT_FIELDS_BY_TYPE[type];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-8">
      {!initialDraft && (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-stone-100">
            {existingTicket ? t('form.editTitle') : t('form.createTitle')}
          </h1>
          <button
            type="button"
            onClick={() =>
              existingTicket
                ? void navigate({ to: '/t/$id', params: { id: existingTicket.id } })
                : void navigate({ to: '/' })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900 px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200"
          >
            <X className="h-3.5 w-3.5" />
            {t('form.cancel')}
          </button>
        </div>
      )}

      {/* 顶部实时票面预览 */}
      <div className="rounded-2xl border border-stone-800/80 bg-stone-900/60 p-4 flex flex-col items-center gap-3">
        {previewUrl && (
          <img
            src={previewUrl}
            alt={title || 'Preview'}
            className="max-h-52 w-auto object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.65)]"
          />
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800/80 px-3 py-1.5 text-xs font-medium text-stone-200 hover:border-amber-500/50">
            <ImagePlus className="h-3.5 w-3.5 text-amber-400" />
            {t('form.uploadScanFront')}
            <input
              type="file"
              accept="image/*"
              onChange={handleUploadScanFront}
              className="hidden"
            />
          </label>
          {scanDataUrl && (
            <button
              type="button"
              onClick={() => setScanDataUrl(undefined)}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs text-stone-400 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('form.clearScanFront')}
            </button>
          )}
        </div>
      </div>

      {/* 1. 基本信息 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-stone-200">{t('form.basicSection')}</h2>

        {/* 8 种票型选择 */}
        <div>
          <div className="block text-xs text-stone-400 mb-2">{t('form.type')}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TICKET_TYPES.map((tk) => (
              <button
                key={tk}
                type="button"
                onClick={() => handleTypeChange(tk)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition text-left flex items-center justify-between ${
                  type === tk
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                    : 'border-stone-800 bg-stone-950/60 text-stone-400 hover:text-stone-200'
                }`}
              >
                <span>{t(`types.${tk}`)}</span>
                {type === tk && <Check className="h-3.5 w-3.5 text-amber-400" />}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="field-title" className="text-xs text-stone-400">
                {t('form.title')}
              </label>
              {renderLowConfidenceBadge('title')}
            </div>
            <input
              id="field-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2 text-sm text-stone-100 focus:outline-none ${
                isFieldLowConfidence('title')
                  ? 'border-amber-500/70 bg-amber-500/10 focus:border-amber-400'
                  : 'border-stone-800 bg-stone-950 focus:border-amber-500/50'
              }`}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="field-subtitle" className="block text-xs text-stone-400 mb-1">
              {t('form.subtitle')}
            </label>
            <input
              id="field-subtitle"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="field-eventAt" className="text-xs text-stone-400">
                {t('form.eventAt')}
              </label>
              {renderLowConfidenceBadge('eventAt')}
            </div>
            <input
              id="field-eventAt"
              type="text"
              required
              placeholder="2026-11-09T19:00"
              value={eventAt}
              onChange={(e) => setEventAt(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-mono text-stone-100 focus:outline-none ${
                isFieldLowConfidence('eventAt')
                  ? 'border-amber-500/70 bg-amber-500/10 focus:border-amber-400'
                  : 'border-stone-800 bg-stone-950 focus:border-amber-500/50'
              }`}
            />
          </div>

          <div>
            <label htmlFor="field-eventTz" className="block text-xs text-stone-400 mb-1">
              {t('form.eventTz')}
            </label>
            <input
              id="field-eventTz"
              type="text"
              required
              placeholder="Asia/Tokyo"
              value={eventTz}
              onChange={(e) => setEventTz(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm font-mono text-stone-100 focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="field-venueName" className="text-xs text-stone-400">
                {t('form.venueName')}
              </label>
              {renderLowConfidenceBadge('venueName')}
            </div>
            <input
              id="field-venueName"
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="field-city" className="block text-xs text-stone-400 mb-1">
                {t('form.city')}
              </label>
              <input
                id="field-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="field-country" className="block text-xs text-stone-400 mb-1">
                {t('form.country')}
              </label>
              <input
                id="field-country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm font-mono text-stone-100 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="field-seat" className="text-xs text-stone-400">
                {t('form.seat')}
              </label>
              {renderLowConfidenceBadge('seat')}
            </div>
            <input
              id="field-seat"
              type="text"
              value={seat}
              onChange={(e) => setSeat(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-price" className="text-xs text-stone-400">
                  {t('form.priceAmount')}
                </label>
                {renderLowConfidenceBadge('price')}
              </div>
              <input
                id="field-price"
                type="number"
                step="any"
                value={priceAmountStr}
                onChange={(e) => setPriceAmountStr(e.target.value)}
                className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm font-mono text-stone-100 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="field-currency" className="block text-xs text-stone-400 mb-1">
                {t('form.priceCurrency')}
              </label>
              <input
                id="field-currency"
                type="text"
                value={priceCurrency}
                onChange={(e) => setPriceCurrency(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm font-mono text-stone-100 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="field-lat" className="block text-xs text-stone-400 mb-1">
              {t('form.lat')}
            </label>
            <input
              id="field-lat"
              type="number"
              step="any"
              placeholder="35.7056"
              value={latStr}
              onChange={(e) => setLatStr(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm font-mono text-stone-100 focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="field-lng" className="block text-xs text-stone-400 mb-1">
              {t('form.lng')}
            </label>
            <input
              id="field-lng"
              type="number"
              step="any"
              placeholder="139.7519"
              value={lngStr}
              onChange={(e) => setLngStr(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm font-mono text-stone-100 focus:border-amber-500/50 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* 2. 票型专属扩展字段 */}
      {extFields.length > 0 && (
        <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-200">
            {t('form.detailsSection')} · {t(`types.${type}`)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {extFields.map((key) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={`ext-${key}`} className="text-xs text-stone-400">
                    {t(`form.ext.${key}`)}
                  </label>
                  {renderLowConfidenceBadge(`details.${key}`)}
                </div>
                <input
                  id={`ext-${key}`}
                  type="text"
                  value={details[key] ?? ''}
                  onChange={(e) => setDetails((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-amber-500/50 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. 纸张与工艺材质 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-amber-400" />
          {t('form.appearanceSection')}
        </h2>
        <div>
          <div className="block text-xs text-stone-400 mb-2">{t('form.material')}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MATERIALS.map((mat) => (
              <button
                key={mat}
                type="button"
                onClick={() => setMaterial(mat)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium text-left transition ${
                  material === mat
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                    : 'border-stone-800 bg-stone-950/60 text-stone-400 hover:text-stone-200'
                }`}
              >
                {t(`materials.${mat}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400 shrink-0">{t('form.age')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
            className="w-full accent-amber-400"
          />
          <span className="text-xs font-mono text-stone-400 w-10 text-right">
            {Math.round(age * 100)}%
          </span>
        </div>
      </section>

      {/* 4. 回忆、评分与标签 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-stone-200">{t('form.memorySection')}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="block text-xs text-stone-400 mb-1.5">{t('form.rating')}</div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`h-8 w-8 rounded-lg border text-sm transition ${
                    star <= rating
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                      : 'border-stone-800 bg-stone-950 text-stone-600'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="field-companions" className="block text-xs text-stone-400 mb-1">
              {t('form.companions')}
            </label>
            <input
              id="field-companions"
              type="text"
              value={companionsStr}
              onChange={(e) => setCompanionsStr(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="field-tags" className="block text-xs text-stone-400 mb-1">
              {t('form.tags')}
            </label>
            <input
              id="field-tags"
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-amber-500/50 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="field-note" className="block text-xs text-stone-400 mb-1">
            {t('form.note')}
          </label>
          <textarea
            id="field-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-2.5 text-sm font-semibold text-stone-950 shadow-lg shadow-amber-500/20 hover:bg-amber-300 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {t('form.save')}
        </button>
      </div>
    </form>
  );
};
