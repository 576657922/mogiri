import { TICKET_TYPES } from '@mogiri/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Award, Building2, Calendar, Coins, MapPin, Scissors, Star, Ticket } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data';
import { computeRecapStats, getYearMonthKey } from '../../domain';

export interface RecapViewProps {
  yearParam: string;
}

export const RecapView: React.FC<RecapViewProps> = ({ yearParam }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const allTickets = useLiveQuery(
    async () => await db.tickets.where('status').equals('active').toArray(),
    [],
    [],
  );

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (const tk of allTickets) {
      s.add(getYearMonthKey(tk.eventAt).year);
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [allTickets]);

  const selectedYear: number | 'all' =
    yearParam === 'all' || Number.isNaN(Number(yearParam)) ? 'all' : Number(yearParam);

  const stats = useMemo(
    () => computeRecapStats(allTickets, selectedYear),
    [allTickets, selectedYear],
  );

  const spendEntries = Object.entries(stats.spendByCurrency);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-400" />
            {selectedYear === 'all'
              ? t('recap.allYears')
              : t('recap.title', { year: selectedYear })}
          </h1>
        </div>

        {/* 年份切换 */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-900/70 p-1">
          <button
            type="button"
            onClick={() => void navigate({ to: '/recap/$year', params: { year: 'all' } })}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              selectedYear === 'all'
                ? 'bg-amber-400 text-stone-950'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            {t('timeline.filterYearAll')}
          </button>
          {availableYears.map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => void navigate({ to: '/recap/$year', params: { year: String(yr) } })}
              className={`rounded-lg px-3 py-1 text-xs font-mono font-medium transition ${
                selectedYear === yr
                  ? 'bg-amber-400 text-stone-950'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <Ticket className="h-3.5 w-3.5 text-amber-400" />
            {t('recap.totalTickets')}
          </div>
          <div className="text-2xl font-bold font-mono text-stone-100">{stats.totalTickets}</div>
        </div>

        <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <Scissors className="h-3.5 w-3.5 text-amber-400" />
            {t('recap.tornStubs')}
          </div>
          <div className="text-2xl font-bold font-mono text-stone-100">{stats.tornCount}</div>
        </div>

        <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <MapPin className="h-3.5 w-3.5 text-amber-400" />
            {t('recap.citiesCount')}
          </div>
          <div className="text-2xl font-bold font-mono text-stone-100">{stats.cities.length}</div>
        </div>

        <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <Star className="h-3.5 w-3.5 text-amber-400" />
            {t('recap.avgRating')}
          </div>
          <div className="text-2xl font-bold font-mono text-stone-100">
            {stats.averageRating !== null ? `★ ${stats.averageRating}` : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 票型分布 */}
        <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-400" />
            {t('recap.byTypeTitle')}
          </h2>
          <div className="space-y-3">
            {TICKET_TYPES.map((tk) => {
              const count = stats.byType[tk] ?? 0;
              if (count === 0) return null;
              const pct =
                stats.totalTickets > 0 ? Math.round((count / stats.totalTickets) * 100) : 0;
              return (
                <div key={tk} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-300">{t(`types.${tk}`)}</span>
                    <span className="font-mono text-stone-400">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                      style={{ width: `${Math.max(6, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 累计支出与常去场馆 */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-400" />
              {t('recap.spendTitle')}
            </h2>
            {spendEntries.length === 0 ? (
              <p className="text-xs text-stone-500">—</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {spendEntries.map(([currency, amount]) => (
                  <div
                    key={currency}
                    className="rounded-xl border border-stone-800 bg-stone-950/70 px-4 py-2.5"
                  >
                    <div className="text-[11px] font-mono text-stone-400">{currency}</div>
                    <div className="text-lg font-bold font-mono text-amber-300">
                      {amount.toLocaleString('en-US')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-400" />
              {t('recap.topVenuesTitle')}
            </h2>
            <div className="space-y-2">
              {stats.topVenues.map((v, idx) => (
                <div
                  key={v.name}
                  className="flex items-center justify-between rounded-xl border border-stone-800/70 bg-stone-950/60 px-3.5 py-2 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-amber-400">#{idx + 1}</span>
                    <div>
                      <div className="font-medium text-stone-200">{v.name}</div>
                      {v.city && <div className="text-[11px] text-stone-500">{v.city}</div>}
                    </div>
                  </div>
                  <span className="rounded-full bg-stone-800 px-2.5 py-0.5 font-mono text-stone-300">
                    {t('recap.visitCount', { count: v.count })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
