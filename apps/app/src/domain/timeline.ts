import type { TicketType } from '@mogiri/shared';
import type { TicketRecord } from '../data';
import { compareEventAtDesc, getYearMonthKey, isUpcomingEvent } from './time';

export type TimelineFilters = {
  type?: TicketType | 'all';
  year?: number | 'all';
  tag?: string | 'all';
  query?: string;
};

export type YearMonthGroup = {
  yearMonth: string;
  year: number;
  month: number;
  tickets: TicketRecord[];
};

export type GroupedTimeline = {
  upcoming: TicketRecord[];
  groups: YearMonthGroup[];
  availableYears: number[];
  availableTags: string[];
};

/**
 * 按票型、年份、标签与全文关键词筛选票据（TL-03）。
 */
export function filterTickets(tickets: TicketRecord[], filters: TimelineFilters): TicketRecord[] {
  const q = filters.query?.trim().toLowerCase() ?? '';
  return tickets.filter((t) => {
    if (t.status !== 'active') return false;
    if (filters.type && filters.type !== 'all' && t.type !== filters.type) return false;
    if (filters.year && filters.year !== 'all') {
      const { year } = getYearMonthKey(t.eventAt);
      if (year !== filters.year) return false;
    }
    if (filters.tag && filters.tag !== 'all' && !t.tags.includes(filters.tag)) return false;
    if (q) {
      const haystack = [
        t.title,
        t.subtitle,
        t.venueName,
        t.city,
        t.seat,
        t.note,
        ...t.tags,
        ...t.companions,
        ...Object.values(t.details),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * 将筛选后的票据拆分为「即将到来（带倒计时）」与「按年/月倒序分组」（TL-01、TL-05）。
 */
export function groupTicketsByYearMonth(
  allActiveTickets: TicketRecord[],
  filteredTickets: TicketRecord[],
  nowMs = Date.now(),
): GroupedTimeline {
  const yearSet = new Set<number>();
  const tagSet = new Set<string>();
  for (const t of allActiveTickets) {
    if (t.status !== 'active') continue;
    yearSet.add(getYearMonthKey(t.eventAt).year);
    for (const tag of t.tags) tagSet.add(tag);
  }

  const upcoming: TicketRecord[] = [];
  const pastOrToday: TicketRecord[] = [];

  for (const t of filteredTickets) {
    if (isUpcomingEvent(t.eventAt, t.eventTz, nowMs)) {
      upcoming.push(t);
    } else {
      pastOrToday.push(t);
    }
  }

  // 即将到来的票按时间正序（最近要发生的排在最前）
  upcoming.sort((a, b) => compareEventAtDesc(b.eventAt, a.eventAt));
  // 全部按活动时间倒序分组
  const sorted = [...filteredTickets].sort((a, b) => compareEventAtDesc(a.eventAt, b.eventAt));

  const groupMap = new Map<string, YearMonthGroup>();
  for (const t of sorted) {
    const { year, month, yearMonth } = getYearMonthKey(t.eventAt);
    let grp = groupMap.get(yearMonth);
    if (!grp) {
      grp = { yearMonth, year, month, tickets: [] };
      groupMap.set(yearMonth, grp);
    }
    grp.tickets.push(t);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    b.yearMonth.localeCompare(a.yearMonth),
  );

  return {
    upcoming,
    groups,
    availableYears: Array.from(yearSet).sort((a, b) => b - a),
    availableTags: Array.from(tagSet).sort(),
  };
}

export type RecapStats = {
  totalTickets: number;
  byType: Partial<Record<TicketType, number>>;
  spendByCurrency: Record<string, number>;
  topVenues: { name: string; count: number; city?: string }[];
  cities: string[];
  tornCount: number;
  averageRating: number | null;
};

/**
 * 计算年度回顾与统计数据（SHARE-04）。
 */
export function computeRecapStats(
  tickets: TicketRecord[],
  year: number | 'all' = 'all',
): RecapStats {
  const scoped = tickets.filter((t) => {
    if (t.status !== 'active') return false;
    if (year !== 'all' && getYearMonthKey(t.eventAt).year !== year) return false;
    return true;
  });

  const byType: Partial<Record<TicketType, number>> = {};
  const spendByCurrency: Record<string, number> = {};
  const venueCounts = new Map<string, { name: string; count: number; city?: string }>();
  const citySet = new Set<string>();
  let tornCount = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  for (const t of scoped) {
    byType[t.type] = (byType[t.type] ?? 0) + 1;
    if (t.priceAmount !== undefined && t.priceAmount > 0) {
      const cur = (t.priceCurrency ?? 'JPY').toUpperCase();
      spendByCurrency[cur] = (spendByCurrency[cur] ?? 0) + t.priceAmount;
    }
    if (t.venueName) {
      const prev = venueCounts.get(t.venueName);
      if (prev) {
        prev.count++;
      } else {
        venueCounts.set(t.venueName, {
          name: t.venueName,
          count: 1,
          ...(t.city ? { city: t.city } : {}),
        });
      }
    }
    if (t.city) citySet.add(t.city);
    if (t.wear.torn) tornCount++;
    if (t.rating !== undefined) {
      ratingSum += t.rating;
      ratingCount++;
    }
  }

  const topVenues = Array.from(venueCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalTickets: scoped.length,
    byType,
    spendByCurrency,
    topVenues,
    cities: Array.from(citySet),
    tornCount,
    averageRating: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : null,
  };
}
