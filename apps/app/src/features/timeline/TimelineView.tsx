import { renderThumbnailDataUrl } from '@mogiri/renderer';
import { TICKET_TYPES, type TicketType } from '@mogiri/shared';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type TicketRecord } from '../../data';
import {
  daysUntilEvent,
  filterTickets,
  formatEventDateDisplay,
  getYearMonthKey,
  groupTicketsByYearMonth,
  toTicketSpec,
} from '../../domain';
import {
  Arrow,
  btnClass,
  Container,
  Label,
  MaskLine,
  RatingDots,
  Reveal,
  Segmented,
  stubTilt,
  ticketTypeCode,
  useUiStore,
} from '../../ui';

function TicketStubPreview({
  ticket,
  tilt = 0,
  className = '',
}: {
  ticket: TicketRecord;
  tilt?: number;
  className?: string;
}) {
  const thumb = useMemo(() => {
    if (ticket.thumbDataUrl) return ticket.thumbDataUrl;
    try {
      return renderThumbnailDataUrl(toTicketSpec(ticket), 640);
    } catch {
      return '';
    }
  }, [ticket]);

  useEffect(() => {
    if (!ticket.thumbDataUrl && thumb) {
      void db.tickets.update(ticket.id, { thumbDataUrl: thumb });
    }
  }, [ticket.id, ticket.thumbDataUrl, thumb]);

  if (!thumb) {
    return (
      <div className="aspect-[18/7] w-full border border-line bg-bg-raised flex items-center justify-center font-mono text-xs text-muted">
        {ticket.title}
      </div>
    );
  }

  return (
    <div
      style={{ transform: `rotate(${tilt}deg)` }}
      className={`transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-0 group-hover:-translate-y-1.5 ${className}`}
    >
      <img
        src={thumb}
        alt={ticket.title}
        className="w-full h-auto max-h-[240px] object-contain stub-shadow select-none"
      />
    </div>
  );
}

export function TimelineView() {
  const { t, i18n } = useTranslation();
  const timelineView = useUiStore((s) => s.timelineView);
  const setTimelineView = useUiStore((s) => s.setTimelineView);

  const [typeFilter, setTypeFilter] = useState<TicketType | 'all'>('all');
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | 'all'>('all');
  const [query, setQuery] = useState('');

  const allActive = useLiveQuery(
    () => db.tickets.where('status').equals('active').toArray(),
    [],
    [] as TicketRecord[],
  );

  const filtered = useMemo(
    () =>
      filterTickets(allActive, {
        type: typeFilter,
        year: yearFilter,
        tag: tagFilter,
        query,
      }),
    [allActive, typeFilter, yearFilter, tagFilter, query],
  );

  const grouped = useMemo(
    () => groupTicketsByYearMonth(allActive, filtered),
    [allActive, filtered],
  );

  // 统计不同票型数量、城市数量与最早年份
  const archiveMeta = useMemo(() => {
    const countsByType: Partial<Record<TicketType, number>> = {};
    const cities = new Set<string>();
    let minYear = 2026;
    for (const tk of allActive) {
      countsByType[tk.type] = (countsByType[tk.type] ?? 0) + 1;
      if (tk.city) cities.add(tk.city);
      const yr = getYearMonthKey(tk.eventAt).year;
      if (yr < minYear) minYear = yr;
    }
    return {
      countsByType,
      citiesCount: cities.size,
      sinceYear: allActive.length > 0 ? minYear : new Date().getFullYear(),
    };
  }, [allActive]);

  // 编号映射（按时间正序给每张票分配固定档案编号 No.01, No.02...）
  const catalogNumbers = useMemo(() => {
    const sortedAsc = [...allActive].sort((a, b) => a.eventAt.localeCompare(b.eventAt));
    const map = new Map<string, string>();
    sortedAsc.forEach((tk, idx) => {
      map.set(tk.id, String(idx + 1).padStart(2, '0'));
    });
    return map;
  }, [allActive]);

  const featuredUpcoming = grouped.upcoming[0] ?? allActive[0];
  const upcomingDays = featuredUpcoming
    ? daysUntilEvent(featuredUpcoming.eventAt, featuredUpcoming.eventTz)
    : null;

  const hasActiveFilters =
    typeFilter !== 'all' || yearFilter !== 'all' || tagFilter !== 'all' || query.trim() !== '';

  const resetFilters = () => {
    setTypeFilter('all');
    setYearFilter('all');
    setTagFilter('all');
    setQuery('');
  };

  return (
    <div>
      {/* 1. 刊头（Hero Masthead） */}
      <section className="pt-10 pb-14 sm:pt-14 sm:pb-20">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-end">
            {/* 左侧大字宣言 */}
            <div className="lg:col-span-7 space-y-6">
              <Label index="01">{t('app.tagline')}</Label>

              <h1 className="display text-[clamp(2.6rem,5.8vw,5rem)] text-fg">
                <MaskLine>{t('home.heroLine1')}</MaskLine>
                <MaskLine delay={0.08}>
                  <span className="italic">{t('home.heroLine2')}</span>
                </MaskLine>
              </h1>

              <p className="max-w-xl text-[15px] sm:text-[16px] leading-relaxed text-muted">
                {t('home.heroLead')}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Link to="/scan" className={btnClass('solid')}>
                  <span>{t('nav.scan')}</span>
                  <Arrow />
                </Link>
                <Link to="/t/new/edit" className={btnClass('outline')}>
                  <span>{t('nav.new')}</span>
                </Link>
              </div>
            </div>

            {/* 右侧档案计数与「下一张」橱窗 */}
            <div className="lg:col-span-5">
              <div className="border border-line bg-bg-raised/70 p-6 sm:p-7 space-y-6">
                {/* 三栏核心档案数字 */}
                <div className="grid grid-cols-3 gap-4 border-b border-line pb-5">
                  <div>
                    <div className="display text-3xl sm:text-4xl text-fg">{allActive.length}</div>
                    <div className="label mt-1">{t('home.statStubs')}</div>
                  </div>
                  <div className="border-l border-line pl-4">
                    <div className="display text-3xl sm:text-4xl text-fg">
                      {archiveMeta.citiesCount}
                    </div>
                    <div className="label mt-1">{t('home.statCities')}</div>
                  </div>
                  <div className="border-l border-line pl-4">
                    <div className="display text-3xl sm:text-4xl text-fg">
                      {archiveMeta.sinceYear}
                    </div>
                    <div className="label mt-1">{t('home.statSince')}</div>
                  </div>
                </div>

                {/* 即将到来的票根橱窗 */}
                {featuredUpcoming && (
                  <Link
                    to="/t/$id"
                    params={{ id: featuredUpcoming.id }}
                    className="group block space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 label text-fg">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        <span>{t('home.nextUp')}</span>
                      </span>
                      {upcomingDays !== null && upcomingDays >= 0 && (
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent font-medium">
                          {upcomingDays === 0
                            ? t('home.today')
                            : `${upcomingDays} ${t('home.daysUntil')}`}
                        </span>
                      )}
                    </div>

                    <div className="py-2 px-3">
                      <TicketStubPreview ticket={featuredUpcoming} tilt={-1.4} />
                    </div>

                    <div className="flex items-baseline justify-between gap-4 pt-1 border-t border-line">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-fg truncate group-hover:text-accent transition-colors">
                          {featuredUpcoming.title}
                        </div>
                        <div className="font-mono text-[11px] text-muted truncate mt-0.5">
                          {formatEventDateDisplay(featuredUpcoming.eventAt, i18n.language)}
                          {featuredUpcoming.venueName ? ` · ${featuredUpcoming.venueName}` : ''}
                        </div>
                      </div>
                      <span className="font-mono text-xs text-muted group-hover:translate-x-1 transition-transform">
                        →
                      </span>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 齿孔分隔线 */}
      <div aria-hidden className="perforation" />

      {/* 2. 检索与视图控制栏 */}
      <section className="sticky top-16 z-20 border-b border-line bg-bg/92 backdrop-blur-md">
        <Container className="py-4 space-y-3.5">
          {/* 第一行：票型编码筛选 + 视图切换 */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`h-8 px-3 rounded-full text-xs transition-colors flex items-baseline gap-1.5 whitespace-nowrap ${
                  typeFilter === 'all' ? 'bg-fg text-bg font-medium' : 'text-muted hover:text-fg'
                }`}
              >
                <span className="font-mono text-[10px] tracking-[0.1em]">ALL</span>
                <span>{t('types.all')}</span>
                <span className="font-mono text-[10px] opacity-70">{allActive.length}</span>
              </button>

              {TICKET_TYPES.map((tp) => {
                const count = archiveMeta.countsByType[tp] ?? 0;
                const active = typeFilter === tp;
                return (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setTypeFilter(tp)}
                    className={`h-8 px-3 rounded-full text-xs transition-colors flex items-baseline gap-1.5 whitespace-nowrap ${
                      active ? 'bg-fg text-bg font-medium' : 'text-muted hover:text-fg'
                    }`}
                  >
                    <span className="font-mono text-[10px] tracking-[0.1em] opacity-75">
                      {ticketTypeCode(tp)}
                    </span>
                    <span>{t(`types.${tp}`)}</span>
                    {count > 0 && <span className="font-mono text-[10px] opacity-70">{count}</span>}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <span className="label hidden sm:inline">
                {t('home.results', { count: filtered.length })}
              </span>
              <Segmented
                ariaLabel="View mode"
                value={timelineView}
                onChange={setTimelineView}
                options={[
                  { value: 'stack', label: t('home.viewTable') },
                  { value: 'grid', label: t('home.viewIndex') },
                ]}
              />
            </div>
          </div>

          {/* 第二行：下划线搜索框 + 年份与标签筛选 */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-1 border-t border-line">
            <div className="sm:col-span-7 flex items-center gap-2.5">
              <span className="font-mono text-[11px] text-faint select-none">/</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('home.searchPlaceholder')}
                className="w-full bg-transparent py-1.5 text-[13.5px] text-fg placeholder:text-faint focus:outline-none"
              />
            </div>

            <div className="sm:col-span-5 flex flex-wrap items-center justify-end gap-4">
              <select
                aria-label={t('home.yearAll')}
                value={yearFilter}
                onChange={(e) =>
                  setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="bg-transparent font-mono text-[11.5px] uppercase tracking-[0.1em] text-muted hover:text-fg focus:outline-none cursor-pointer py-1"
              >
                <option value="all">{t('home.yearAll')}</option>
                {grouped.availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <select
                aria-label={t('home.tagAll')}
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="bg-transparent font-mono text-[11.5px] tracking-[0.06em] text-muted hover:text-fg focus:outline-none cursor-pointer py-1"
              >
                <option value="all">{t('home.tagAll')}</option>
                {grouped.availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent hover:underline"
                >
                  {t('home.clearFilters')}
                </button>
              )}
            </div>
          </div>
        </Container>
      </section>

      {/* 3. 票根陈列区（桌面视图 vs 档案目录视图） */}
      <section className="py-12 sm:py-16">
        <Container>
          {grouped.groups.length === 0 ? (
            <div className="border border-line py-20 px-6 text-center space-y-4">
              <div className="display text-3xl sm:text-4xl text-fg">
                {hasActiveFilters ? t('home.emptyFiltered') : t('home.emptyTitle')}
              </div>
              <p className="text-sm text-muted max-w-md mx-auto">{t('home.emptyHint')}</p>
              <div className="pt-2 flex justify-center gap-3">
                {hasActiveFilters ? (
                  <button type="button" onClick={resetFilters} className={btnClass('outline')}>
                    {t('home.clearFilters')}
                  </button>
                ) : (
                  <Link to="/t/new/edit" className={btnClass('solid')}>
                    <span>{t('home.emptyCta')}</span>
                    <Arrow />
                  </Link>
                )}
              </div>
            </div>
          ) : timelineView === 'stack' ? (
            /* 视图 A：桌面陈列（Table View）—— 左栏超大年月，右栏带轻微倾角的实体票根 */
            <div className="space-y-20">
              {grouped.groups.map((grp) => (
                <div
                  key={grp.yearMonth}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 border-t border-line pt-8"
                >
                  {/* 左侧年月章节导轨 */}
                  <div className="lg:col-span-3 lg:sticky lg:top-40 lg:self-start flex lg:flex-col items-baseline justify-between gap-2">
                    <div>
                      <div className="label">{grp.year}</div>
                      <div className="display text-5xl sm:text-6xl text-fg mt-1">
                        {String(grp.month).padStart(2, '0')}
                      </div>
                    </div>
                    <div className="label">{t('home.results', { count: grp.tickets.length })}</div>
                  </div>

                  {/* 右侧票根桌面网格 */}
                  <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-14">
                    {grp.tickets.map((ticket, idx) => {
                      const no = catalogNumbers.get(ticket.id) ?? '01';
                      const tilt = stubTilt(ticket.id, 1.8);
                      return (
                        <Reveal key={ticket.id} delay={Math.min(0.24, idx * 0.05)}>
                          <Link
                            to="/t/$id"
                            params={{ id: ticket.id }}
                            className="group block space-y-5"
                          >
                            {/* 实体票根图像（直接悬浮在暖白档案纸上） */}
                            <div className="relative py-4 px-2 flex items-center justify-center min-h-[210px]">
                              <TicketStubPreview ticket={ticket} tilt={tilt} />
                            </div>

                            {/* 底部编目说明条 */}
                            <div className="border-t border-line pt-3.5 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] font-medium text-fg">
                                    No.{no}
                                  </span>
                                  <span aria-hidden className="text-faint">
                                    ·
                                  </span>
                                  <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
                                    {ticketTypeCode(ticket.type)} / {t(`types.${ticket.type}`)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2.5">
                                  {ticket.wear.torn && (
                                    <span className="border border-accent px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent">
                                      {t('home.torn')}
                                    </span>
                                  )}
                                  <span className="font-mono text-[11px] text-muted">
                                    {formatEventDateDisplay(ticket.eventAt, i18n.language)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-baseline justify-between gap-4">
                                <h3 className="display text-2xl text-fg group-hover:text-accent transition-colors truncate">
                                  {ticket.title}
                                </h3>
                                {ticket.rating !== undefined && (
                                  <RatingDots value={ticket.rating} />
                                )}
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                                <span className="truncate">
                                  {[ticket.venueName, ticket.city, ticket.seat]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                                {ticket.tags.length > 0 && (
                                  <span className="font-mono text-[10.5px] text-faint">
                                    {ticket.tags.map((tg) => `#${tg}`).join(' ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </Link>
                        </Reveal>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 视图 B：瑞士网格目录（Index View） */
            <div className="border-t border-line">
              <div className="hidden md:grid md:grid-cols-12 gap-4 py-3 border-b border-line-strong label">
                <div className="col-span-1">{t('home.colNo')}</div>
                <div className="col-span-2">{t('home.colDate')}</div>
                <div className="col-span-1">{t('home.colType')}</div>
                <div className="col-span-4">{t('home.colTitle')}</div>
                <div className="col-span-2">{t('home.colVenue')}</div>
                <div className="col-span-2 text-right">{t('form.seat')}</div>
              </div>

              {filtered.map((ticket) => {
                const no = catalogNumbers.get(ticket.id) ?? '01';
                return (
                  <Link
                    key={ticket.id}
                    to="/t/$id"
                    params={{ id: ticket.id }}
                    className="group grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center py-4 border-b border-line hover:bg-bg-raised/80 transition-colors px-2 -mx-2"
                  >
                    <div className="md:col-span-1 font-mono text-xs text-muted">No.{no}</div>
                    <div className="md:col-span-2 font-mono text-xs text-fg">
                      {ticket.eventAt.replace('T', ' ')}
                    </div>
                    <div className="md:col-span-1">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
                        {ticketTypeCode(ticket.type)}
                      </span>
                    </div>
                    <div className="md:col-span-4 min-w-0 flex items-baseline gap-2.5">
                      <span className="display text-xl text-fg group-hover:text-accent transition-colors truncate">
                        {ticket.title}
                      </span>
                      {ticket.wear.torn && (
                        <span className="border border-accent px-1 py-0.2 font-mono text-[9px] uppercase tracking-[0.12em] text-accent shrink-0">
                          {t('home.torn')}
                        </span>
                      )}
                    </div>
                    <div className="md:col-span-2 text-xs text-muted truncate">
                      {[ticket.venueName, ticket.city].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="md:col-span-2 font-mono text-xs text-muted md:text-right truncate">
                      {ticket.seat || '—'}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Container>
      </section>
    </div>
  );
}
