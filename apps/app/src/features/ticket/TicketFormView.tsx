import { type MaterialName, renderThumbnailDataUrl } from '@mogiri/renderer';
import { MATERIALS, TICKET_TYPES, type TicketType } from '@mogiri/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
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
import { Btn, btnClass, Container, Field, Label, SectionHead, ticketTypeCode } from '../../ui';

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

  const tempRecord = useMemo<TicketRecord>(() => {
    const parsedPrice = Number(priceAmountStr);
    const parsedLat = Number(latStr);
    const parsedLng = Number(lngStr);
    return {
      id: existingTicket?.id ?? 'preview',
      type,
      title: title.trim() || 'STARLIGHT PARADE',
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
        const url = renderThumbnailDataUrl(spec, 640);
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

  const renderLowBadge = (fieldKey: string) => {
    if (!initialDraft) return null;
    if (!initialDraft.lowConfidenceKeys.includes(fieldKey)) return null;
    const conf = initialDraft.confidences[fieldKey] ?? 0;
    const pct = Math.round(conf * 100);
    return (
      <span className="border border-accent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
        {t('form.lowConfidence', { pct })}
      </span>
    );
  };

  const isLow = (fieldKey: string): boolean =>
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
      const thumbDataUrl = renderThumbnailDataUrl(specForThumb, 640);

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
  const content = (
    <form onSubmit={handleSubmit} className="space-y-12">
      {!initialDraft && (
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div className="space-y-2">
            <Label index={existingTicket ? 'EDIT' : 'NEW'}>
              {existingTicket ? t('form.eyebrowEdit') : t('form.eyebrowNew')}
            </Label>
            <h1 className="display text-4xl sm:text-5xl text-fg">
              {existingTicket ? t('form.editTitle') : t('form.createTitle')}
            </h1>
          </div>

          <Btn
            variant="outline"
            onClick={() =>
              existingTicket
                ? void navigate({ to: '/t/$id', params: { id: existingTicket.id } })
                : void navigate({ to: '/' })
            }
          >
            {t('form.cancel')}
          </Btn>
        </div>
      )}

      {/* 双栏排版：左侧常驻实时打样台，右侧分章表单 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* 左栏：实时票面打样（Live Proof） */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
          <div className="flex items-center justify-between">
            <Label index="PROOF">{t('form.preview')}</Label>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
              {ticketTypeCode(type)} · {t(`materials.${material}`)}
            </span>
          </div>

          <div className="cropmarks border border-line bg-bg-raised/70 p-6 sm:p-8 flex flex-col items-center justify-center min-h-[260px]">
            {previewUrl && (
              <img
                src={previewUrl}
                alt={title || 'Ticket proof'}
                className="max-h-56 w-auto object-contain stub-shadow"
              />
            )}
          </div>

          <p className="text-xs text-muted">{t('form.previewHint')}</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className={`${btnClass('outline', 'h-9 px-4 text-xs')} cursor-pointer`}>
              <span>{scanDataUrl ? t('form.replaceScan') : t('form.uploadScan')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadScanFront}
                className="hidden"
              />
            </label>
            {scanDataUrl && (
              <Btn
                variant="ghost"
                className="h-9 px-3 text-xs text-accent"
                onClick={() => setScanDataUrl(undefined)}
              >
                {t('form.clearScan')}
              </Btn>
            )}
          </div>

          {initialDraft && initialDraft.lowConfidenceKeys.length > 0 && (
            <div className="border-l-2 border-accent pl-3.5 py-1 text-xs text-accent">
              {t('form.lowConfidenceHint')}
            </div>
          )}
        </div>

        {/* 右栏：四章编辑表单 */}
        <div className="lg:col-span-7 space-y-14">
          {/* 01 基本信息 */}
          <section className="space-y-6">
            <SectionHead index="01" title={t('form.s1')} />

            <div className="space-y-2.5">
              <div className="label">{t('form.type')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TICKET_TYPES.map((tk) => {
                  const active = type === tk;
                  return (
                    <button
                      key={tk}
                      type="button"
                      onClick={() => handleTypeChange(tk)}
                      className={`border px-3.5 py-2.5 text-left transition-colors flex items-baseline justify-between gap-2 ${
                        active
                          ? 'border-fg bg-fg text-bg'
                          : 'border-line hover:border-fg text-fg bg-bg-raised/40'
                      }`}
                    >
                      <span className="text-xs font-medium">{t(`types.${tk}`)}</span>
                      <span
                        className={`font-mono text-[10px] tracking-[0.12em] ${
                          active ? 'text-bg/80' : 'text-muted'
                        }`}
                      >
                        {ticketTypeCode(tk)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
              <Field
                className="sm:col-span-2"
                label={t('form.title')}
                htmlFor="field-title"
                badge={renderLowBadge('title')}
              >
                <input
                  id="field-title"
                  type="text"
                  required
                  placeholder={t('form.titlePlaceholder')}
                  value={title}
                  data-low={isLow('title')}
                  onChange={(e) => setTitle(e.target.value)}
                  className="field text-lg font-medium"
                />
              </Field>

              <Field className="sm:col-span-2" label={t('form.subtitle')} htmlFor="field-subtitle">
                <input
                  id="field-subtitle"
                  type="text"
                  placeholder={t('form.subtitlePlaceholder')}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="field"
                />
              </Field>

              <Field
                label={t('form.eventAt')}
                htmlFor="field-eventAt"
                hint={t('form.eventAtHint')}
                badge={renderLowBadge('eventAt')}
              >
                <input
                  id="field-eventAt"
                  type="text"
                  required
                  placeholder="2026-11-09T19:00"
                  value={eventAt}
                  data-low={isLow('eventAt')}
                  onChange={(e) => setEventAt(e.target.value)}
                  className="field font-mono"
                />
              </Field>

              <Field label={t('form.eventTz')} htmlFor="field-eventTz">
                <input
                  id="field-eventTz"
                  type="text"
                  required
                  placeholder="Asia/Tokyo"
                  value={eventTz}
                  onChange={(e) => setEventTz(e.target.value)}
                  className="field font-mono"
                />
              </Field>

              <Field
                label={t('form.venueName')}
                htmlFor="field-venueName"
                badge={renderLowBadge('venueName')}
              >
                <input
                  id="field-venueName"
                  type="text"
                  value={venueName}
                  data-low={isLow('venueName')}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="field"
                />
              </Field>

              <div className="grid grid-cols-3 gap-4">
                <Field className="col-span-2" label={t('form.city')} htmlFor="field-city">
                  <input
                    id="field-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="field"
                  />
                </Field>
                <Field label={t('form.country')} htmlFor="field-country">
                  <input
                    id="field-country"
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    className="field font-mono"
                  />
                </Field>
              </div>

              <Field label={t('form.seat')} htmlFor="field-seat" badge={renderLowBadge('seat')}>
                <input
                  id="field-seat"
                  type="text"
                  value={seat}
                  data-low={isLow('seat')}
                  onChange={(e) => setSeat(e.target.value)}
                  className="field font-mono"
                />
              </Field>

              <div className="grid grid-cols-3 gap-4">
                <Field
                  className="col-span-2"
                  label={t('form.priceAmount')}
                  htmlFor="field-price"
                  badge={renderLowBadge('price')}
                >
                  <input
                    id="field-price"
                    type="number"
                    step="any"
                    value={priceAmountStr}
                    data-low={isLow('price')}
                    onChange={(e) => setPriceAmountStr(e.target.value)}
                    className="field font-mono"
                  />
                </Field>
                <Field label={t('form.priceCurrency')} htmlFor="field-currency">
                  <input
                    id="field-currency"
                    type="text"
                    value={priceCurrency}
                    onChange={(e) => setPriceCurrency(e.target.value.toUpperCase())}
                    className="field font-mono"
                  />
                </Field>
              </div>

              <Field label={t('form.lat')} htmlFor="field-lat" hint={t('form.coordsHint')}>
                <input
                  id="field-lat"
                  type="number"
                  step="any"
                  placeholder="35.7056"
                  value={latStr}
                  onChange={(e) => setLatStr(e.target.value)}
                  className="field font-mono"
                />
              </Field>

              <Field label={t('form.lng')} htmlFor="field-lng" hint={t('form.coordsHint')}>
                <input
                  id="field-lng"
                  type="number"
                  step="any"
                  placeholder="139.7519"
                  value={lngStr}
                  onChange={(e) => setLngStr(e.target.value)}
                  className="field font-mono"
                />
              </Field>
            </div>
          </section>

          {/* 02 票面细节 */}
          {extFields.length > 0 && (
            <section className="space-y-6">
              <SectionHead index="02" title={`${t('form.s2')} · ${t(`types.${type}`)}`} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                {extFields.map((key) => (
                  <Field
                    key={key}
                    label={t(`form.ext.${key}`)}
                    htmlFor={`ext-${key}`}
                    badge={renderLowBadge(`details.${key}`)}
                  >
                    <input
                      id={`ext-${key}`}
                      type="text"
                      value={details[key] ?? ''}
                      data-low={isLow(`details.${key}`)}
                      onChange={(e) => setDetails((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="field"
                    />
                  </Field>
                ))}
              </div>
            </section>
          )}

          {/* 03 纸张与工艺 */}
          <section className="space-y-6">
            <SectionHead index="03" title={t('form.s3')} />

            <div className="space-y-2.5">
              <div className="label">{t('form.material')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MATERIALS.map((mat) => {
                  const active = material === mat;
                  return (
                    <button
                      key={mat}
                      type="button"
                      onClick={() => setMaterial(mat)}
                      className={`border px-3.5 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-fg bg-fg text-bg'
                          : 'border-line hover:border-fg text-fg bg-bg-raised/40'
                      }`}
                    >
                      <div className="text-xs font-medium">{t(`materials.${mat}`)}</div>
                      <div
                        className={`font-mono text-[10px] uppercase tracking-[0.12em] mt-0.5 ${
                          active ? 'text-bg/75' : 'text-muted'
                        }`}
                      >
                        {mat}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <span className="label shrink-0">{t('form.age')}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="range"
                aria-label={t('form.age')}
              />
              <span className="font-mono text-xs text-muted w-10 text-right">
                {Math.round(age * 100)}%
              </span>
            </div>
          </section>

          {/* 04 那一天 */}
          <section className="space-y-6">
            <SectionHead index="04" title={t('form.s4')} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <div className="label mb-2.5">{t('form.rating')}</div>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`h-8 w-8 rounded-full border font-mono text-xs transition-colors ${
                        star <= rating
                          ? 'border-fg bg-fg text-bg'
                          : 'border-line text-muted hover:border-fg'
                      }`}
                    >
                      {star}
                    </button>
                  ))}
                </div>
              </div>

              <Field
                label={t('form.companions')}
                htmlFor="field-companions"
                hint={t('form.listHint')}
              >
                <input
                  id="field-companions"
                  type="text"
                  value={companionsStr}
                  onChange={(e) => setCompanionsStr(e.target.value)}
                  className="field"
                />
              </Field>

              <Field label={t('form.tags')} htmlFor="field-tags" hint={t('form.listHint')}>
                <input
                  id="field-tags"
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  className="field"
                />
              </Field>
            </div>

            <Field label={t('form.note')} htmlFor="field-note">
              <textarea
                id="field-note"
                rows={3}
                placeholder={t('form.notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="field resize-y"
              />
            </Field>
          </section>

          <div className="pt-4 border-t border-line flex justify-end">
            <Btn type="submit" variant="solid" arrow disabled={saving}>
              {saving ? t('form.saving') : t('form.save')}
            </Btn>
          </div>
        </div>
      </div>
    </form>
  );

  if (initialDraft) {
    return content;
  }

  return <Container className="py-10 sm:py-14">{content}</Container>;
};
