import { TICKET_TYPES } from '@mogiri/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data';
import { compareEventAtDesc, computeRecapStats, getYearMonthKey } from '../../domain';
import { playDetentClick, playPaperFlip } from '../../platform';
import {
  Container,
  getTicketTypeTheme,
  Label,
  RatingDots,
  Reveal,
  SectionHead,
  stubTilt,
} from '../../ui';

const MONTH_CODES = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

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

  const scopedTickets = useMemo(() => {
    const filtered = allTickets.filter((tk) =>
      selectedYear === 'all' ? true : getYearMonthKey(tk.eventAt).year === selectedYear,
    );
    return filtered.sort((a, b) => compareEventAtDesc(a.eventAt, b.eventAt));
  }, [allTickets, selectedYear]);

  const stats = useMemo(
    () => computeRecapStats(allTickets, selectedYear),
    [allTickets, selectedYear],
  );

  const spendEntries = Object.entries(stats.spendByCurrency);
  const maxMonthCount = Math.max(1, ...stats.byMonth);
  const peakMonthValue = Math.max(0, ...stats.byMonth);

  return (
    <Container className="py-6 sm:py-8 space-y-6">
      {/* 顶部年鉴刊头与年份切换器 */}
      <Reveal className="archival-card rounded-[24px] p-6 sm:p-8 flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <Label index={t('recap.edition')}>{t('recap.eyebrow')}</Label>
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="font-editorial tabular-nums text-[44px] sm:text-[56px] leading-none tracking-[-0.03em] text-fg">
              {selectedYear === 'all' ? 'ALL' : selectedYear}
            </span>
            <h1 className="font-editorial text-[22px] sm:text-[26px] leading-snug tracking-[-0.015em] text-fg/90">
              {selectedYear === 'all'
                ? t('recap.headlineAll', { count: stats.totalTickets })
                : t('recap.headlineYear', { year: selectedYear, count: stats.totalTickets })}
            </h1>
          </div>
        </div>

        <div
          role="tablist"
          aria-label={t('recap.eyebrow')}
          className="recessed-plinth inline-flex items-center gap-1 rounded-full p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedYear === 'all'}
            onClick={() => {
              playDetentClick();
              void navigate({ to: '/recap/$year', params: { year: 'all' } });
            }}
            className={`h-8 px-4 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
              selectedYear === 'all' ? 'bg-fg text-bg-raised shadow-xs' : 'text-muted hover:text-fg'
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
              onClick={() => {
                playDetentClick();
                void navigate({ to: '/recap/$year', params: { year: String(yr) } });
              }}
              className={`h-8 px-4 rounded-full font-mono tabular-nums text-[12px] font-medium transition-all cursor-pointer ${
                selectedYear === yr ? 'bg-fg text-bg-raised shadow-xs' : 'text-muted hover:text-fg'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </Reveal>

      {/* 四栏瑞士计量指标卡 */}
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="archival-card rounded-[20px] p-5 flex flex-col justify-between">
          <dt className="flex items-center justify-between text-[12px] text-muted">
            <span>{t('recap.tickets')}</span>
            <span className="font-mono text-[10px] text-faint">01</span>
          </dt>
          <dd className="font-editorial tabular-nums text-[38px] leading-none tracking-[-0.03em] text-fg mt-3">
            {String(stats.totalTickets).padStart(2, '0')}
          </dd>
        </div>

        <div className="archival-card rounded-[20px] p-5 flex flex-col justify-between">
          <dt className="flex items-center justify-between text-[12px] text-muted">
            <span>{t('recap.torn')}</span>
            <span className="font-mono text-[10px] text-accent">✂ 02</span>
          </dt>
          <dd className="font-editorial tabular-nums text-[38px] leading-none tracking-[-0.03em] text-fg mt-3">
            {String(stats.tornCount).padStart(2, '0')}
          </dd>
        </div>

        <div className="archival-card rounded-[20px] p-5 flex flex-col justify-between">
          <dt className="flex items-center justify-between text-[12px] text-muted">
            <span>{t('recap.cities')}</span>
            <span className="font-mono text-[10px] text-faint">03</span>
          </dt>
          <dd className="font-editorial tabular-nums text-[38px] leading-none tracking-[-0.03em] text-fg mt-3">
            {String(stats.cities.length).padStart(2, '0')}
          </dd>
        </div>

        <div className="archival-card rounded-[20px] p-5 flex flex-col justify-between">
          <dt className="flex items-center justify-between text-[12px] text-muted">
            <span>{t('recap.rating')}</span>
            <span className="font-mono text-[10px] text-faint">04</span>
          </dt>
          <dd className="mt-3 flex items-baseline justify-between gap-2">
            <span className="font-editorial tabular-nums text-[38px] leading-none tracking-[-0.03em] text-fg">
              {stats.averageRating !== null ? stats.averageRating.toFixed(1) : '—'}
            </span>
            {stats.averageRating !== null && (
              <RatingDots value={Math.round(stats.averageRating)} size={6} />
            )}
          </dd>
        </div>
      </dl>

      {stats.totalTickets === 0 ? (
        <div className="archival-card rounded-[22px] py-20 text-center">
          <p className="font-editorial text-[20px] text-muted">{t('recap.empty')}</p>
        </div>
      ) : (
        <>
          {/* 年度馆藏实体票面微缩画廊 */}
          <section className="archival-card rounded-[22px] p-5 sm:p-6 space-y-4">
            <SectionHead
              index="A"
              title={t('recap.specimenStrip')}
              aside={
                <span className="font-mono tabular-nums text-[11px] text-muted">
                  {scopedTickets.length} SPECIMENS
                </span>
              }
            />
            <div className="recessed-plinth rounded-2xl p-4 sm:p-5 overflow-x-auto">
              <div className="flex items-center gap-4 min-w-max">
                {scopedTickets.map((tk, idx) => {
                  const tilt = stubTilt(tk.id, 1.8);
                  const tkTheme = getTicketTypeTheme(tk.type);
                  return (
                    <Link
                      key={tk.id}
                      to="/t/$id"
                      params={{ id: tk.id }}
                      onClick={() => playPaperFlip()}
                      style={{ transform: `rotate(${tilt}deg)` }}
                      className="group relative w-[184px] shrink-0 rounded-xl bg-bg-raised border border-line p-2.5 transition-all duration-300 hover:rotate-0 hover:-translate-y-1 shadow-xs"
                    >
                      {tk.thumbDataUrl ? (
                        <img
                          src={tk.thumbDataUrl}
                          alt={tk.title}
                          className="h-20 w-full object-contain stub-shadow"
                        />
                      ) : (
                        <div
                          className="h-20 w-full rounded-lg flex items-center justify-center font-mono text-xs"
                          style={{ background: tkTheme.tabBg, color: tkTheme.tabInk }}
                        >
                          {t(`typeCode.${tk.type}`)}
                        </div>
                      )}
                      <div className="mt-2 pt-1.5 border-t border-dashed border-line flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-semibold text-fg truncate group-hover:text-accent transition-colors">
                          {tk.title}
                        </span>
                        <span className="font-mono tabular-nums text-[10px] text-faint shrink-0">
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 主分析区：12 个月节律柱状图 + 语义色谱分布 + 账本与常去场馆 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 左 7 列：月度观演与出行节律 + 票种构成色谱 */}
            <div className="lg:col-span-7 space-y-5">
              {/* 12 个月节律 */}
              <section className="archival-card rounded-[22px] p-5 sm:p-6 space-y-4">
                <SectionHead
                  index="B"
                  title={t('recap.monthlyRhythm')}
                  aside={<span className="font-mono text-[10.5px] text-faint">01 — 12</span>}
                />
                <div className="recessed-plinth rounded-2xl p-4 sm:p-5">
                  <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-end h-36">
                    {MONTH_CODES.map((mCode, mIdx) => {
                      const count = stats.byMonth[mIdx] ?? 0;
                      const heightPct =
                        count === 0 ? 6 : Math.max(18, Math.round((count / maxMonthCount) * 100));
                      const isPeak = count > 0 && count === peakMonthValue;
                      return (
                        <div
                          key={mCode}
                          className="flex flex-col items-center justify-end h-full gap-1.5"
                        >
                          <span
                            className={`font-mono tabular-nums text-[10px] ${
                              count > 0 ? 'text-fg font-semibold' : 'text-transparent select-none'
                            }`}
                          >
                            {count}
                          </span>
                          <div className="w-full flex-1 flex items-end">
                            <div
                              className={`w-full rounded-t-md transition-all duration-500 ${
                                isPeak ? 'bg-accent' : count > 0 ? 'bg-fg/85' : 'bg-black/8'
                              }`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[9.5px] tracking-tight text-muted">
                            {mCode}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* 票种构成色谱 */}
              <section className="archival-card rounded-[22px] p-5 sm:p-6 space-y-4">
                <SectionHead index="C" title={t('recap.byType')} />
                <div className="space-y-3.5 pt-1">
                  {TICKET_TYPES.map((tk) => {
                    const count = stats.byType[tk] ?? 0;
                    if (count === 0) return null;
                    const pct =
                      stats.totalTickets > 0 ? Math.round((count / stats.totalTickets) * 100) : 0;
                    const theme = getTicketTypeTheme(tk);
                    return (
                      <div key={tk} className="space-y-1.5">
                        <div className="flex items-center justify-between text-[13px]">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ background: theme.rim }}
                            />
                            <span className="font-mono text-[10.5px] text-faint">
                              {t(`typeCode.${tk}`)}
                            </span>
                            <span className="font-medium text-fg">{t(`types.${tk}`)}</span>
                          </div>
                          <span className="font-mono tabular-nums text-[12px] text-muted">
                            {count} · {pct}%
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-bg-subtle overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(6, pct)}%`,
                              background: theme.rim,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* 右 5 列：票面累计面值凭单 + 常去场馆 + 足迹城市 */}
            <div className="lg:col-span-5 space-y-5">
              {/* 票面花费凭单 */}
              <section className="archival-card rounded-[22px] p-5 sm:p-6 space-y-4">
                <SectionHead index="D" title={t('recap.spend')} />
                <p className="text-[11.5px] text-muted -mt-2">{t('recap.spendNote')}</p>
                {spendEntries.length === 0 ? (
                  <p className="text-sm text-muted">—</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {spendEntries.map(([currency, amount]) => (
                      <div
                        key={currency}
                        className="recessed-plinth rounded-2xl p-4 border border-dashed border-line-strong"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] tracking-wider text-muted">
                            {currency}
                          </span>
                          <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                        </div>
                        <div className="font-editorial tabular-nums text-[28px] leading-tight tracking-[-0.02em] text-fg mt-1">
                          {amount.toLocaleString('en-US')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 常去场馆与车站 */}
              <section className="archival-card rounded-[22px] p-5 sm:p-6 space-y-4">
                <SectionHead index="E" title={t('recap.topVenues')} />
                <ol className="divide-y divide-line">
                  {stats.topVenues.map((v, idx) => (
                    <li key={v.name} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-2.5 min-w-0">
                        <span className="font-mono tabular-nums text-[11px] text-faint">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium text-fg truncate">{v.name}</div>
                          {v.city && <div className="text-[11.5px] text-muted">{v.city}</div>}
                        </div>
                      </div>
                      <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 font-mono tabular-nums text-[11px] text-muted shrink-0">
                        {t('recap.visits', { count: v.count })}
                      </span>
                    </li>
                  ))}
                </ol>

                {stats.cities.length > 0 && (
                  <div className="pt-3 border-t border-dashed border-line space-y-2">
                    <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">
                      {t('recap.citiesList')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.cities.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-bg-subtle px-2.5 py-1 text-[11.5px] font-medium text-fg"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </Container>
  );
};
