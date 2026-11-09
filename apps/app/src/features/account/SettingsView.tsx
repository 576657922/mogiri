import type { QualityTier } from '@mogiri/renderer';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cpu, Download, Globe, RefreshCw, RotateCcw, Settings, Trash2, Upload } from 'lucide-react';
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
import { type SupportedLocale, setAppLocale } from '../../i18n';
import { downloadOrShareBlob } from '../../platform';
import { useUiStore } from '../../ui';

const LOCALE_OPTIONS: { code: SupportedLocale; label: string }[] = [
  { code: 'zh-CN', label: '简体中文 (zh-CN)' },
  { code: 'ja', label: '日本語 (ja)' },
  { code: 'en', label: 'English (en)' },
];

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
        t('settings.importSuccess', {
          tickets: res.ticketsCount,
          media: res.mediaCount,
        }),
      );
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Invalid backup JSON');
    } finally {
      e.target.value = '';
    }
  };

  const handleResetSeed = async () => {
    await clearAllLocalData();
    await ensureSeedTickets();
  };

  const qualityChoices: { value: 'auto' | QualityTier; labelKey: string }[] = [
    { value: 'auto', labelKey: 'settings.qualityAuto' },
    { value: 'high', labelKey: 'settings.qualityHigh' },
    { value: 'mid', labelKey: 'settings.qualityMid' },
    { value: 'low', labelKey: 'settings.qualityLow' },
  ];

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
        <Settings className="h-5 w-5 text-amber-400" />
        {t('settings.title')}
      </h1>

      {/* 1. 语言切换 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
          <Globe className="h-4 w-4 text-amber-400" />
          {t('settings.languageSection')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {LOCALE_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              type="button"
              onClick={() => setAppLocale(opt.code)}
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-medium text-left transition ${
                i18n.language === opt.code
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                  : 'border-stone-800 bg-stone-950/60 text-stone-400 hover:text-stone-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* 2. 3D 渲染档位 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-amber-400" />
            {t('settings.qualitySection')}
          </h2>
          <span className="rounded-full bg-stone-800 px-2.5 py-0.5 font-mono text-[11px] text-amber-300">
            Active: {resolvedQuality.toUpperCase()}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {qualityChoices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              onClick={() => setQualityPref(choice.value)}
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-medium text-left transition ${
                qualityPref === choice.value
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                  : 'border-stone-800 bg-stone-950/60 text-stone-400 hover:text-stone-200'
              }`}
            >
              {t(choice.labelKey)}
            </button>
          ))}
        </div>
      </section>

      {/* 3. 数据备份与导入 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
          <Download className="h-4 w-4 text-amber-400" />
          {t('settings.backupSection')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleExportJson()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-stone-950 hover:bg-amber-300"
          >
            <Download className="h-3.5 w-3.5" />
            {t('settings.exportJson')}
          </button>

          <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-800 px-4 py-2 text-xs font-medium text-stone-200 hover:border-amber-500/50">
            <Upload className="h-3.5 w-3.5 text-amber-400" />
            {t('settings.importJson')}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportJson(e)}
              className="hidden"
            />
          </label>
        </div>
        {importMessage && <p className="text-xs text-amber-300">{importMessage}</p>}
      </section>

      {/* 4. 回收站（30 天内可恢复） */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-amber-400" />
          {t('settings.trashSection', { count: deletedTickets.length })}
        </h2>

        {deletedTickets.length === 0 ? (
          <p className="text-xs text-stone-500">{t('settings.trashEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {deletedTickets.map((tk) => {
              const daysLeft = daysUntilPermanentDelete(tk.deletedAt);
              return (
                <div
                  key={tk.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-800 bg-stone-950/70 px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <div className="font-medium text-stone-200">{tk.title}</div>
                    <div className="text-[11px] text-stone-500">
                      {tk.eventAt} · {t('settings.daysLeft', { days: daysLeft })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void restoreTicket(tk.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-emerald-300 hover:bg-emerald-500/25"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t('settings.restoreBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void hardDeleteTicket(tk.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-rose-300 hover:bg-rose-500/25"
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('settings.hardDeleteBtn')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. 重置默认演示数据 */}
      <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-amber-400" />
          {t('settings.dangerSection')}
        </h2>
        <button
          type="button"
          onClick={() => void handleResetSeed()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-medium text-stone-300 hover:border-amber-500/40 hover:text-amber-300"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('settings.resetSeedBtn')}
        </button>
      </section>
    </div>
  );
};
