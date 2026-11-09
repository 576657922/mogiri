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
import { Btn, btnClass, Container, SectionHead, useUiStore } from '../../ui';

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
    <Container className="py-6 sm:py-8 space-y-6 max-w-[920px]">
      <header className="flex items-baseline gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
          {t('settings.title')}
        </h1>
      </header>

      <div className="space-y-5">
        {/* 语言 */}
        <section className="rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
          <SectionHead title={t('settings.language')} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {SUPPORTED_LOCALES.map((loc) => {
              const active = i18n.language === loc.code;
              return (
                <button
                  key={loc.code}
                  type="button"
                  onClick={() => setAppLocale(loc.code as SupportedLocale)}
                  className={`rounded-2xl p-4 text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-fg text-bg-raised shadow-xs'
                      : 'bg-bg-subtle/75 hover:bg-bg-subtle text-fg'
                  }`}
                >
                  <div
                    className={`font-mono text-[11px] uppercase ${
                      active ? 'text-bg-raised/70' : 'text-muted'
                    }`}
                  >
                    {loc.code}
                  </div>
                  <div className="text-[15px] font-semibold mt-0.5">{loc.label}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 渲染档位 */}
        <section className="rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
          <SectionHead
            title={t('settings.quality')}
            aside={
              <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-muted">
                {t('settings.qualityCurrent', { tier: resolvedQuality.toUpperCase() })}
              </span>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {qualityChoices.map((choice) => {
              const active = qualityPref === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setQualityPref(choice.value)}
                  className={`rounded-2xl p-4 text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-fg text-bg-raised shadow-xs'
                      : 'bg-bg-subtle/75 hover:bg-bg-subtle text-fg'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14.5px] font-semibold">{t(choice.labelKey)}</span>
                    <span
                      className={`font-mono text-[10.5px] uppercase ${
                        active ? 'text-bg-raised/70' : 'text-muted'
                      }`}
                    >
                      {choice.value}
                    </span>
                  </div>
                  <p className={`mt-1 text-[12px] ${active ? 'text-bg-raised/75' : 'text-muted'}`}>
                    {t(choice.descKey)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 备份与恢复 */}
        <section className="rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
          <SectionHead title={t('settings.backup')} />
          <p className="text-[13px] text-muted">{t('settings.backupDesc')}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Btn variant="solid" onClick={() => void handleExportJson()}>
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
          {importMessage && <p className="text-[12.5px] text-accent">{importMessage}</p>}
        </section>

        {/* 回收站 */}
        <section className="rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
          <SectionHead title={`${t('settings.trash')} (${deletedTickets.length})`} />
          <p className="text-[13px] text-muted">{t('settings.trashDesc')}</p>

          {deletedTickets.length === 0 ? (
            <p className="rounded-xl bg-bg-subtle/60 py-6 text-center text-[13px] text-muted">
              {t('settings.trashEmpty')}
            </p>
          ) : (
            <div className="divide-y divide-line">
              {deletedTickets.map((tk) => {
                const daysLeft = daysUntilPermanentDelete(tk.deletedAt);
                return (
                  <div
                    key={tk.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-[14px] font-semibold text-fg">{tk.title}</div>
                      <div className="font-mono text-[11.5px] text-muted mt-0.5">
                        {tk.eventAt} · {t('settings.daysLeft', { days: daysLeft })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Btn variant="pill" onClick={() => void restoreTicket(tk.id)}>
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
        </section>

        {/* 示例数据 */}
        <section className="rounded-[20px] bg-bg-raised border border-line p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-[15px] font-semibold text-fg">{t('settings.reset')}</h2>
            <p className="text-[13px] text-muted">{t('settings.resetDesc')}</p>
          </div>
          <Btn variant="outline" onClick={() => void handleResetSeed()}>
            {t('settings.resetBtn')}
          </Btn>
        </section>
      </div>
    </Container>
  );
};
