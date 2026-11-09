import { describe, expect, it } from 'vitest';
import { computeHomography, mapHomography } from '../platform';
import {
  computeRecapStats,
  daysUntilEvent,
  filterTickets,
  formatEventDateDisplay,
  groupTicketsByYearMonth,
  INITIAL_SAMPLE_TICKETS,
  isUpcomingEvent,
  parseEventLocalTime,
  recognitionToTicketDraft,
  toTicketSpec,
} from './index';

describe('time', () => {
  it('parses and formats local event time without timezone drift', () => {
    expect(parseEventLocalTime('2026-11-21T18:00')).toEqual({
      year: 2026,
      month: 11,
      day: 21,
      hour: 18,
      minute: 0,
    });
    expect(formatEventDateDisplay('2026-11-21T18:00', 'ja')).toBe('2026年11月21日 18:00');
    expect(formatEventDateDisplay('2026-11-21', 'en')).toBe('2026.11.21');
  });

  it('detects upcoming events and computes days countdown in event timezone', () => {
    const nowUtc = Date.parse('2026-11-09T03:00:00Z'); // 2026-11-09 12:00 Asia/Tokyo
    expect(isUpcomingEvent('2026-11-21T18:00', 'Asia/Tokyo', nowUtc)).toBe(true);
    expect(isUpcomingEvent('2026-10-03T19:15', 'Asia/Tokyo', nowUtc)).toBe(false);
    expect(daysUntilEvent('2026-11-21T18:00', 'Asia/Tokyo', nowUtc)).toBe(12);
  });
});

describe('timeline & recap stats', () => {
  const records = INITIAL_SAMPLE_TICKETS.map((t, i) => ({
    ...t,
    id: `sample-${i}`,
    details: t.details ?? {},
    wear: t.wear ?? { torn: false, punches: [], age: 0 },
    source: t.source ?? 'local',
    tags: t.tags ?? [],
    companions: t.companions ?? [],
    status: t.status ?? 'active',
    clientUpdatedAt: '2026-11-09T00:00:00.000Z',
    serverSeq: i + 1,
  }));

  it('filters by type, tag, and full-text query', () => {
    expect(filterTickets(records, { type: 'train' })).toHaveLength(1);
    expect(filterTickets(records, { tag: '推し活' })).toHaveLength(1);
    expect(filterTickets(records, { query: 'Hoshino' })).toHaveLength(1);
    expect(filterTickets(records, { query: 'Sapporo' })).toHaveLength(1);
  });

  it('groups by year-month and separates upcoming tickets', () => {
    const nowUtc = Date.parse('2026-11-09T03:00:00Z');
    const grouped = groupTicketsByYearMonth(records, records, nowUtc);
    expect(grouped.upcoming.map((t) => t.title)).toEqual(['STARLIGHT PARADE']);
    expect(grouped.groups.map((g) => g.yearMonth)).toEqual(['2026-11', '2026-10', '2026-09']);
  });

  it('computes recap stats', () => {
    const stats = computeRecapStats(records, 2026);
    expect(stats.totalTickets).toBe(5);
    expect(stats.spendByCurrency.JPY).toBe(11000 + 14720 + 24800 + 2200 + 16500);
    expect(stats.tornCount).toBe(1);
    expect(stats.cities).toContain('東京');
    expect(stats.cities).toContain('札幌');
  });

  it('converts TicketRecord to renderer TicketSpec', () => {
    const first = records[0];
    expect(first).toBeDefined();
    if (!first) return;
    const spec = toTicketSpec(first);
    expect(spec.templateId).toBe('concert-holo-v1');
    expect(spec.fields.title).toBe('STARLIGHT PARADE');
    expect(spec.fields['details.artist']).toBe('Hoshino Lumi');
    expect(spec.fields.price).toBe('¥11,000');
  });
});

describe('recognition bridge & perspective homography', () => {
  it('flags low-confidence fields for user confirmation', () => {
    const draft = recognitionToTicketDraft({
      type: 'concert',
      title: { value: 'STARLIGHT PARADE', confidence: 0.56 },
      eventAt: { value: '2026-11-21T18:00', confidence: 0.95 },
      seat: { value: 'A3-12', confidence: 0.92 },
    });
    expect(draft.lowConfidenceKeys).toEqual(['title']);
    expect(draft.input.title).toBe('STARLIGHT PARADE');
  });

  it('maps rectangle corners accurately through homography', () => {
    const quad = [
      { x: 10, y: 20 },
      { x: 110, y: 25 },
      { x: 105, y: 85 },
      { x: 12, y: 80 },
    ] as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ];
    const h = computeHomography(200, 100, quad);
    const p0 = mapHomography(h, 0, 0);
    const p2 = mapHomography(h, 200, 100);
    expect(p0.x).toBeCloseTo(10, 4);
    expect(p0.y).toBeCloseTo(20, 4);
    expect(p2.x).toBeCloseTo(105, 4);
    expect(p2.y).toBeCloseTo(85, 4);
  });
});
