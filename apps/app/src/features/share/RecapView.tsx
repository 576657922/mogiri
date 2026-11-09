import { TICKET_TYPES } from '@mogiri/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data';
import { computeRecapStats, getYearMonthKey } from '../../domain';
import { Container, SectionHead } from '../../ui';

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
    <Container className="py-6 sm:py-8 space-y-6">
      {/* 顶部标题与年份胶囊 */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
            {t('recap.eyebrow')}
          </h1>
          <span className="text-[13.5px] text-muted">
            {selectedYear === 'all'
              ? t('recap.headlineAll', { count: stats.totalTickets })
              : t('recap.headlineYear', { year: selectedYear, count: stats.totalTickets })}
          </span>
        </div>

        <div
          role="tablist"
          aria-label={t('recap.eyebrow')}
          className="inline-flex items-center gap-1 rounded-full bg-bg-subtle p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedYear === 'all'}
            onClick={() => void navigate({ to: '/recap/$year', params: { year: 'all' } })}
            className={`h-7 px-3.5 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
              selectedYear === 'all'
                ? 'bg-bg-raised text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-muted hover:text-fg'
            }`}
          >
            {t('recap.allTime')}
          </button>
          {availableYears.map((yr) => (
            <button
              key={yr}
              type="button"
              role="tab"
              aria-selected={selectedYear === yr}
              onClick={() => void navigate({ to: '/recap/$year', params: { year: String(yr) } })}
              className={`h-7 px-3.5 rounded-full font-mono text-[12px] font-medium transition-all cursor-pointer ${
                selectedYear === yr
                  ? 'bg-bg-raised text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </header>

      {/* 四栏指标 Bento 卡片 */}
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[20px] bg-bg-raised border border-line p-5">
          <dt className="text-[12px] text-muted">{t('recap.tickets')}</dt>
          <dd className="text-[32px] font-semibold tracking-[-0.03em] text-fg mt-1">
            {stats.totalTickets}
          </dd>
        </div>

        <div className="rounded-[20px] bg-bg-raised border border-line p-5">
          <dt className="text-[12px] text-muted">{t('recap.torn')}</dt>
          <dd className="text-[32px] font-semibold tracking-[-0.03em] text-fg mt-1">
            {stats.tornCount}
          </dd>
        </div>

        <div className="rounded-[20px] bg-bg-raised border border-line p-5">
          <dt className="text-[12px] text-muted">{t('recap.cities')}</dt>
          <dd className="text-[32px] font-semibold tracking-[-0.03em] text-fg mt-1">
            {stats.cities.length}
          </dd>
        </div>

        <div className="rounded-[20px] bg-bg-raised border border-line p-5">
          <dt className="text-[12px] text-muted">{t('recap.rating')}</dt>
          <dd className="text-[32px] font-semibold tracking-[-0.03em] text-fg mt-1">
            {stats.averageRating !== null ? stats.averageRating.toFixed(1) : '—'}
          </dd>
        </div>
      </dl>

      {stats.totalTickets === 0 ? (
        <div className="rounded-[20px] bg-bg-raised border border-line py-20 text-center">
          <p className="text-[15px] text-muted">{t('recap.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 左卡片：类型分布 */}
          <div className="lg:col-span-7 rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
            <SectionHead title={t('recap.byType')} />
            <div className="space-y-4 pt-1">
              {TICKET_TYPES.map((tk) => {
                const count = stats.byType[tk] ?? 0;
                if (count === 0) return null;
                const pct =
                  stats.totalTickets > 0 ? Math.round((count / stats.totalTickets) * 100) : 0;
                return (
                  <div key={tk} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-medium text-fg">{t(`types.${tk}`)}</span>
                      <span className="font-mono text-[12px] text-muted">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-bg-subtle overflow-hidden">
                      <div
                        className="h-full rounded-full bg-fg transition-all duration-500"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右侧两张卡片 */}
          <div className="lg:col-span-5 space-y-5">
            {/* 票面花费 */}
            <section className="rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
              <SectionHead title={t('recap.spend')} />
              {spendEntries.length === 0 ? (
                <p className="text-sm text-muted">—</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {spendEntries.map(([currency, amount]) => (
                    <div key={currency} className="rounded-2xl bg-bg-subtle/75 p-4">
                      <div className="font-mono text-[11px] text-muted">{currency}</div>
                      <div className="text-[22px] font-semibold tracking-[-0.02em] text-fg mt-0.5">
                        {amount.toLocaleString('en-US')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 常去场馆 */}
            <section className="rounded-[20px] bg-bg-raised border border-line p-6 space-y-4">
              <SectionHead title={t('recap.topVenues')} />
              <ol className="divide-y divide-line">
                {stats.topVenues.map((v, idx) => (
                  <li key={v.name} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5 min-w-0">
                      <span className="font-mono text-[11px] text-faint">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-fg truncate">{v.name}</div>
                        {v.city && <div className="text-[11.5px] text-muted">{v.city}</div>}
                      </div>
                    </div>
                    <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 font-mono text-[11.5px] text-muted shrink-0">
                      {t('recap.visits', { count: v.count })}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </Container>
  );
};
