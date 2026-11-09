import { TICKET_TYPES } from '@mogiri/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data';
import { computeRecapStats, getYearMonthKey } from '../../domain';
import { Container, Label, MaskLine, Reveal, SectionHead, ticketTypeCode } from '../../ui';

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
    <Container className="py-10 sm:py-16 space-y-14">
      {/* 刊头与年份选择器 */}
      <header className="border-b border-line pb-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Label index="04">{t('recap.eyebrow')}</Label>

          <div
            role="tablist"
            aria-label={t('recap.eyebrow')}
            className="inline-flex flex-wrap items-center gap-1 rounded-full border border-line p-1 bg-bg-raised/60"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedYear === 'all'}
              onClick={() => void navigate({ to: '/recap/$year', params: { year: 'all' } })}
              className={`h-8 px-3.5 rounded-full text-[12px] font-medium transition-colors ${
                selectedYear === 'all' ? 'bg-fg text-bg' : 'text-muted hover:text-fg'
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
                className={`h-8 px-3.5 rounded-full font-mono text-[12px] transition-colors ${
                  selectedYear === yr ? 'bg-fg text-bg font-medium' : 'text-muted hover:text-fg'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        <h1 className="display text-[36px] sm:text-[56px] lg:text-[68px] max-w-4xl">
          <MaskLine>
            {selectedYear === 'all'
              ? t('recap.headlineAll', { count: stats.totalTickets })
              : t('recap.headlineYear', { year: selectedYear, count: stats.totalTickets })}
          </MaskLine>
        </h1>
      </header>

      {/* 四栏大数字总览 */}
      <Reveal>
        <dl className="grid grid-cols-2 lg:grid-cols-4 border-y border-line divide-y lg:divide-y-0 lg:divide-x divide-line">
          <div className="py-6 lg:pr-8">
            <dt className="label">{t('recap.tickets')}</dt>
            <dd className="display text-[44px] sm:text-[58px] mt-2 leading-none">
              {String(stats.totalTickets).padStart(2, '0')}
            </dd>
          </div>

          <div className="py-6 pl-6 lg:px-8 border-l border-line lg:border-l-0">
            <dt className="label">{t('recap.torn')}</dt>
            <dd className="display text-[44px] sm:text-[58px] mt-2 leading-none">
              {String(stats.tornCount).padStart(2, '0')}
            </dd>
          </div>

          <div className="py-6 lg:px-8">
            <dt className="label">{t('recap.cities')}</dt>
            <dd className="display text-[44px] sm:text-[58px] mt-2 leading-none">
              {String(stats.cities.length).padStart(2, '0')}
            </dd>
          </div>

          <div className="py-6 pl-6 lg:pl-8 border-l border-line lg:border-l-0">
            <dt className="label">{t('recap.rating')}</dt>
            <dd className="display text-[44px] sm:text-[58px] mt-2 leading-none">
              {stats.averageRating !== null ? stats.averageRating.toFixed(1) : '—'}
            </dd>
          </div>
        </dl>
      </Reveal>

      {stats.totalTickets === 0 ? (
        <div className="py-20 text-center">
          <p className="display text-2xl text-muted">{t('recap.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          {/* 左栏：票型分布 */}
          <Reveal className="lg:col-span-7 space-y-6">
            <SectionHead index="01" title={t('recap.byType')} />
            <div className="divide-y divide-line border-b border-line">
              {TICKET_TYPES.map((tk) => {
                const count = stats.byType[tk] ?? 0;
                if (count === 0) return null;
                const pct =
                  stats.totalTickets > 0 ? Math.round((count / stats.totalTickets) * 100) : 0;
                return (
                  <div key={tk} className="py-4 space-y-2.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                          {ticketTypeCode(tk)}
                        </span>
                        <span className="text-[15px] font-medium text-fg">{t(`types.${tk}`)}</span>
                      </div>
                      <span className="font-mono text-[12px] text-muted">
                        {String(count).padStart(2, '0')} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-fg/10 overflow-hidden">
                      <div
                        className="h-full bg-fg transition-all duration-700"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>

          {/* 右栏：票面花费、常去场馆与城市目录 */}
          <Reveal delay={0.1} className="lg:col-span-5 space-y-12">
            {/* 02 票面花费 */}
            <section className="space-y-5">
              <SectionHead index="02" title={t('recap.spend')} />
              {spendEntries.length === 0 ? (
                <p className="text-sm text-muted">—</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {spendEntries.map(([currency, amount]) => (
                    <div key={currency} className="border border-line bg-bg-raised/60 p-4">
                      <div className="label">{currency}</div>
                      <div className="display text-[28px] mt-1">
                        {amount.toLocaleString('en-US')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 03 最常去的地方 */}
            <section className="space-y-5">
              <SectionHead index="03" title={t('recap.topVenues')} />
              <ol className="divide-y divide-line border-b border-line">
                {stats.topVenues.map((v, idx) => (
                  <li key={v.name} className="py-3.5 flex items-baseline justify-between gap-4">
                    <div className="flex items-baseline gap-3 min-w-0">
                      <span className="font-mono text-[11px] text-faint">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium text-fg truncate">{v.name}</div>
                        {v.city && <div className="text-[12px] text-muted">{v.city}</div>}
                      </div>
                    </div>
                    <span className="font-mono text-[12px] text-muted shrink-0">
                      {t('recap.visits', { count: v.count })}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {/* 04 去过的城市 */}
            {stats.cities.length > 0 && (
              <section className="space-y-4">
                <SectionHead index="04" title={t('recap.citiesList')} />
                <div className="flex flex-wrap gap-2">
                  {stats.cities.map((city) => (
                    <span
                      key={city}
                      className="inline-flex items-center border border-line bg-bg-raised/70 px-3 py-1 text-[12.5px] text-fg"
                    >
                      {city}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </Reveal>
        </div>
      )}
    </Container>
  );
};
