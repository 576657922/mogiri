import type { QualityTier } from '@mogiri/renderer';
import { useLiveQuery } from 'dexie-react-hooks';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clearAllLocalData,
  db,
  exportBackupBundle,
  hardDeleteTicket,
  importBackupBundle,
  restoreTicket,
} from '../../data';
import { daysUntilPermanentDelete, ensureSeedTickets } from '../../domain';
import { SUPPORTED_LOCALES, type SupportedLocale, setAppLocale } from '../../i18n';
import { downloadOrShareBlob } from '../../platform';
import { Btn, btnClass, Container, Label, MaskLine, Reveal, useUiStore } from '../../ui';

export const SettingsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const qualityPref = useUiStore((s) => s.qualityPref);
  const resolvedQuality = useUiStore((s) => s.resolvedQuality);
  const setQualityPref = useUiStore((s) => s.setQualityPref);

  const [importMessage, setImportMessage] = useState<string | null>(null);

  const deletedTickets = useLiveQuery(
    async () => await db.tickets.where('status').equals('deleted').toArray(),
    [],
    [],
  );

  const handleExportJson = async () => {
    const bundle = await exportBackupBundle();
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    await downloadOrShareBlob(blob, `mogiri-backup-${bundle.exportedAt.slice(0, 10)}.json`);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      const res = await importBackupBundle(raw);
      setImportMessage(
        t('settings.importDone', {
          tickets: res.ticketsCount,
          media: res.mediaCount,
        }),
      );
    } catch {
      setImportMessage(t('settings.importFailed'));
    } finally {
      e.target.value = '';
    }
  };

  const handleResetSeed = async () => {
    await clearAllLocalData();
    await ensureSeedTickets();
  };

  const qualityChoices: { value: 'auto' | QualityTier; labelKey: string; descKey: string }[] = [
    {
      value: 'auto',
      labelKey: 'settings.qualityAuto',
      descKey: 'settings.qualityAutoDesc',
    },
    {
      value: 'high',
      labelKey: 'settings.qualityHigh',
      descKey: 'settings.qualityHighDesc',
    },
    {
      value: 'mid',
      labelKey: 'settings.qualityMid',
      descKey: 'settings.qualityMidDesc',
    },
    {
      value: 'low',
      labelKey: 'settings.qualityLow',
      descKey: 'settings.qualityLowDesc',
    },
  ];

  return (
    <Container className="py-10 sm:py-16 space-y-14">
      {/* 刊头 */}
      <header className="border-b border-line pb-10 space-y-4">
        <Label index="06">{t('settings.eyebrow')}</Label>
        <h1 className="display text-[36px] sm:text-[54px] lg:text-[64px]">
          <MaskLine>{t('settings.title')}</MaskLine>
        </h1>
      </header>

      <div className="divide-y divide-line border-b border-line">
        {/* 01 语言 */}
        <Reveal className="py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">
          <div className="lg:col-span-4 space-y-1.5">
            <Label index="01">{t('settings.language')}</Label>
            <h2 className="display text-[26px]">{t('settings.language')}</h2>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 border-t border-l border-line">
            {SUPPORTED_LOCALES.map((loc) => {
              const active = i18n.language === loc.code;
              return (
                <button
                  key={loc.code}
                  type="button"
                  onClick={() => setAppLocale(loc.code as SupportedLocale)}
                  className={`border-r border-b border-line p-5 text-left transition-colors ${
                    active ? 'bg-fg text-bg' : 'bg-bg-raised/60 hover:bg-bg-raised text-fg'
                  }`}
                >
                  <div
                    className={`font-mono text-[11px] uppercase tracking-[0.16em] ${
                      active ? 'text-bg/70' : 'text-muted'
                    }`}
                  >
                    {loc.code}
                  </div>
                  <div className="display text-[22px] mt-1">{loc.label}</div>
                </button>
              );
            })}
          </div>
        </Reveal>

        {/* 02 渲染档位 */}
        <Reveal className="py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">
          <div className="lg:col-span-4 space-y-2">
            <Label index="02">{t('settings.quality')}</Label>
            <h2 className="display text-[26px]">{t('settings.quality')}</h2>
            <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-accent">
              {t('settings.qualityCurrent', { tier: resolvedQuality.toUpperCase() })}
            </p>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 border-t border-l border-line">
            {qualityChoices.map((choice) => {
              const active = qualityPref === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setQualityPref(choice.value)}
                  className={`border-r border-b border-line p-5 text-left transition-colors ${
                    active ? 'bg-fg text-bg' : 'bg-bg-raised/60 hover:bg-bg-raised text-fg'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="display text-[22px]">{t(choice.labelKey)}</span>
                    <span
                      className={`font-mono text-[10.5px] uppercase tracking-[0.14em] ${
                        active ? 'text-bg/70' : 'text-faint'
                      }`}
                    >
                      {choice.value}
                    </span>
                  </div>
                  <p className={`mt-1.5 text-[12.5px] ${active ? 'text-bg/80' : 'text-muted'}`}>
                    {t(choice.descKey)}
                  </p>
                </button>
              );
            })}
          </div>
        </Reveal>

        {/* 03 备份 */}
        <Reveal className="py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">
          <div className="lg:col-span-4 space-y-2">
            <Label index="03">{t('settings.backup')}</Label>
            <h2 className="display text-[26px]">{t('settings.backup')}</h2>
            <p className="text-[13.5px] text-muted">{t('settings.backupDesc')}</p>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Btn variant="solid" arrow onClick={() => void handleExportJson()}>
                {t('settings.export')}
              </Btn>

              <label className={`${btnClass('outline')} cursor-pointer`}>
                <span>{t('settings.import')}</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => void handleImportJson(e)}
                  className="hidden"
                />
              </label>
            </div>
            {importMessage && <p className="font-mono text-[12px] text-accent">{importMessage}</p>}
          </div>
        </Reveal>

        {/* 04 回收站 */}
        <Reveal className="py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">
          <div className="lg:col-span-4 space-y-2">
            <Label index="04">{t('settings.trash')}</Label>
            <h2 className="display text-[26px]">
              {t('settings.trash')} ({deletedTickets.length})
            </h2>
            <p className="text-[13.5px] text-muted">{t('settings.trashDesc')}</p>
          </div>

          <div className="lg:col-span-8">
            {deletedTickets.length === 0 ? (
              <p className="text-[14px] text-muted py-2">{t('settings.trashEmpty')}</p>
            ) : (
              <div className="divide-y divide-line border-y border-line">
                {deletedTickets.map((tk) => {
                  const daysLeft = daysUntilPermanentDelete(tk.deletedAt);
                  return (
                    <div
                      key={tk.id}
                      className="py-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="display text-[20px]">{tk.title}</div>
                        <div className="font-mono text-[11.5px] text-muted mt-0.5">
                          {tk.eventAt} · {t('settings.daysLeft', { days: daysLeft })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Btn variant="outline" onClick={() => void restoreTicket(tk.id)}>
                          {t('settings.restore')}
                        </Btn>
                        <Btn variant="ghost" onClick={() => void hardDeleteTicket(tk.id)}>
                          {t('settings.deleteForever')}
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Reveal>

        {/* 05 示例数据 */}
        <Reveal className="py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">
          <div className="lg:col-span-4 space-y-2">
            <Label index="05">{t('settings.reset')}</Label>
            <h2 className="display text-[26px]">{t('settings.reset')}</h2>
            <p className="text-[13.5px] text-muted">{t('settings.resetDesc')}</p>
          </div>

          <div className="lg:col-span-8">
            <Btn variant="outline" onClick={() => void handleResetSeed()}>
              {t('settings.resetBtn')}
            </Btn>
          </div>
        </Reveal>
      </div>
    </Container>
  );
};
