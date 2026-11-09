import { renderThumbnailDataUrl } from '@mogiri/renderer';
import { TICKET_TYPES, type TicketType } from '@mogiri/shared';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calendar, Grid, Layers, MapPin, Plus, Search, Sparkles, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type TicketRecord } from '../../data';
import {
  daysUntilEvent,
  filterTickets,
  formatEventDateDisplay,
  groupTicketsByYearMonth,
  toTicketSpec,
} from '../../domain';
import { ticketTypeEmoji, useUiStore } from '../../ui';

function TicketThumbnailImg({ ticket }: { ticket: TicketRecord }) {
  const thumb = useMemo(() => {
    if (ticket.thumbDataUrl) return ticket.thumbDataUrl;
    try {
      return renderThumbnailDataUrl(toTicketSpec(ticket), 560);
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
      <div className="w-full aspect-[18/7] rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center text-stone-400 text-sm">
        {ticket.title}
      </div>
    );
  }

  return (
    <img
      src={thumb}
      alt={ticket.title}
      loading="lazy"
      className="w-full h-auto object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:scale-[1.02] group-hover:-translate-y-0.5"
    />
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

  return (
    <div className="space-y-6">
      {/* 顶部标题与操作栏 */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-100">
            {t('timeline.title')}
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            {t('timeline.subtitle', { count: allActive.length })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/scan"
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm flex items-center gap-1.5 shadow-lg shadow-amber-500/15 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>{t('nav.scan')}</span>
          </Link>
          <Link
            to="/t/new/edit"
            className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-100 font-medium text-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('nav.newTicket')}</span>
          </Link>
        </div>
      </div>

      {/* 搜索与筛选工具栏 */}
      <div className="bg-stone-900/70 border border-stone-800/90 rounded-2xl p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('timeline.searchPlaceholder')}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-stone-950 border border-stone-800 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label={t('timeline.filterYearAll')}
              value={yearFilter}
              onChange={(e) =>
                setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 focus:outline-none"
            >
              <option value="all">{t('timeline.filterYearAll')}</option>
              {grouped.availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <select
              aria-label={t('timeline.filterTagAll')}
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 focus:outline-none"
            >
              <option value="all">{t('timeline.filterTagAll')}</option>
              {grouped.availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>

            <div className="flex rounded-xl bg-stone-950 border border-stone-800 p-0.5">
              <button
                type="button"
                onClick={() => setTimelineView('stack')}
                title={t('timeline.viewStack')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                  timelineView === 'stack'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('timeline.viewStack')}</span>
              </button>
              <button
                type="button"
                onClick={() => setTimelineView('grid')}
                title={t('timeline.viewGrid')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                  timelineView === 'grid'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('timeline.viewGrid')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 票型筛选胶囊 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              typeFilter === 'all'
                ? 'bg-amber-400 text-stone-950'
                : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
            }`}
          >
            {t('types.all')}
          </button>
          {TICKET_TYPES.map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setTypeFilter(tp)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1 transition-colors ${
                typeFilter === tp
                  ? 'bg-amber-400 text-stone-950'
                  : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <span>{ticketTypeEmoji(tp)}</span>
              <span>{t(`types.${tp}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 即将到来的票（带倒计时 TL-05） */}
      {grouped.upcoming.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
              {t('timeline.upcomingSection')}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grouped.upcoming.map((ticket) => {
              const days = daysUntilEvent(ticket.eventAt, ticket.eventTz);
              return (
                <Link
                  key={`upcoming-${ticket.id}`}
                  to="/t/$id"
                  params={{ id: ticket.id }}
                  className="group relative rounded-2xl bg-gradient-to-br from-amber-500/10 via-stone-900/90 to-stone-900 border border-amber-500/30 p-4 hover:border-amber-400/60 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                      <span>{ticketTypeEmoji(ticket.type)}</span>
                      <span>{t(`types.${ticket.type}`)}</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-stone-950">
                      {days <= 0
                        ? t('timeline.countdownToday')
                        : t('timeline.countdownDays', { days })}
                    </span>
                  </div>
                  <TicketThumbnailImg ticket={ticket} />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 按年月倒序分组的票夹列表（TL-01 / TL-02 / TL-04） */}
      {grouped.groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-800 p-12 text-center space-y-3">
          <div className="text-3xl">🎟</div>
          <div className="text-base font-semibold text-stone-200">{t('timeline.emptyTitle')}</div>
          <p className="text-xs text-stone-400 max-w-md mx-auto">{t('timeline.emptyHint')}</p>
          <div className="pt-2">
            <Link
              to="/t/new/edit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-stone-950 text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{t('timeline.createFirst')}</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.groups.map((grp) => (
            <section key={grp.yearMonth} className="space-y-3.5">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-stone-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>{t('timeline.monthHeader', { year: grp.year, month: grp.month })}</span>
                </h2>
                <div className="h-px flex-1 bg-stone-800/80" />
                <span className="text-xs text-stone-500 font-mono">{grp.tickets.length}</span>
              </div>

              <div
                className={
                  timelineView === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
                    : 'space-y-4 max-w-3xl mx-auto'
                }
              >
                {grp.tickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    to="/t/$id"
                    params={{ id: ticket.id }}
                    className="group block rounded-2xl bg-stone-900/65 hover:bg-stone-900 border border-stone-800/80 hover:border-stone-700 p-4 transition-all"
                  >
                    <div className="mb-3">
                      <TicketThumbnailImg ticket={ticket} />
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-stone-400">
                          <span>{ticketTypeEmoji(ticket.type)}</span>
                          <span>{formatEventDateDisplay(ticket.eventAt, i18n.language)}</span>
                          {ticket.venueName && (
                            <>
                              <span>·</span>
                              <span className="truncate flex items-center gap-0.5">
                                <MapPin className="w-3 h-3 inline" />
                                {ticket.venueName}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="font-bold text-stone-100 group-hover:text-amber-300 transition-colors truncate mt-0.5">
                          {ticket.title}
                        </h3>
                        {ticket.seat && (
                          <div className="text-xs font-mono text-stone-400 mt-0.5">
                            {ticket.seat}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {ticket.wear.torn && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {t('timeline.tornBadge')}
                          </span>
                        )}
                        {ticket.rating !== undefined && (
                          <div className="flex items-center gap-0.5 text-amber-400 text-xs">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span className="font-mono">{ticket.rating}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {ticket.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {ticket.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md bg-stone-950 border border-stone-800 text-[11px] text-stone-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
