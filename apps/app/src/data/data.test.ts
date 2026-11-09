import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  addTicketMedia,
  clearAllLocalData,
  createTicket,
  deleteTicketMedia,
  exportBackupBundle,
  importBackupBundle,
  MogiriDB,
  mergeLwwRecord,
  purgeExpiredDeletedTickets,
  reorderTicketMedia,
  restoreTicket,
  softDeleteTicket,
  updateTicket,
  uuidv7,
} from './index';

function createTestDb() {
  return new MogiriDB(`test-mogiri-${uuidv7()}`, { indexedDB, IDBKeyRange });
}

describe('uuidv7', () => {
  it('generates valid version-7 UUIDs that sort monotonically by timestamp', () => {
    const a = uuidv7(1700000000000);
    const b = uuidv7(1700000000000);
    const c = uuidv7(1700000001000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });
});

describe('tickets.repo + outbox transaction', () => {
  it('creates, updates, soft-deletes, restores, and logs every change to outbox', async () => {
    const testDb = createTestDb();
    const created = await createTicket(
      {
        type: 'concert',
        title: 'STARLIGHT PARADE',
        eventAt: '2026-11-21T18:00',
        eventTz: 'Asia/Tokyo',
        material: 'foil-holo',
        templateId: 'concert-holo-v1',
      },
      testDb,
    );
    expect(created.status).toBe('active');

    const updated = await updateTicket(
      created.id,
      { seat: 'A3-12', wear: { torn: true, punches: [], age: 0.1 } },
      testDb,
    );
    expect(updated.seat).toBe('A3-12');
    expect(updated.wear.torn).toBe(true);

    const deleted = await softDeleteTicket(created.id, testDb);
    expect(deleted.status).toBe('deleted');
    expect(deleted.deletedAt).toBeDefined();

    const restored = await restoreTicket(created.id, testDb);
    expect(restored.status).toBe('active');
    expect(restored.deletedAt).toBeUndefined();

    const outbox = await testDb.outbox.toArray();
    expect(outbox.length).toBe(4);
    expect(outbox.every((o) => o.entity === 'tickets' && o.entityId === created.id)).toBe(true);
  });

  it('purges soft-deleted tickets older than 30 days', async () => {
    const testDb = createTestDb();
    const oldTicket = await createTicket(
      {
        type: 'movie',
        title: 'Old Movie',
        eventAt: '2026-01-01',
        eventTz: 'Asia/Tokyo',
        material: 'thermal',
        templateId: 'movie-thermal-v1',
        status: 'deleted',
        deletedAt: '2026-09-01T00:00:00.000Z',
      },
      testDb,
    );
    const recentTicket = await createTicket(
      {
        type: 'movie',
        title: 'Recent Movie',
        eventAt: '2026-10-25',
        eventTz: 'Asia/Tokyo',
        material: 'thermal',
        templateId: 'movie-thermal-v1',
        status: 'deleted',
        deletedAt: '2026-11-05T00:00:00.000Z',
      },
      testDb,
    );

    const nowMs = Date.parse('2026-11-09T12:00:00.000Z');
    const purged = await purgeExpiredDeletedTickets(nowMs, testDb);
    expect(purged).toBe(1);
    expect(await testDb.tickets.get(oldTicket.id)).toBeUndefined();
    expect(await testDb.tickets.get(recentTicket.id)).toBeDefined();
  });

  it('exports and imports backup JSON validated by Zod', async () => {
    const testDb = createTestDb();
    await createTicket(
      {
        type: 'train',
        title: 'Nozomi 21',
        eventAt: '2026-11-09T09:30',
        eventTz: 'Asia/Tokyo',
        material: 'magnetic',
        templateId: 'jr-magnetic-v1',
      },
      testDb,
    );
    const bundle = await exportBackupBundle(testDb);
    expect(bundle.version).toBe(1);
    expect(bundle.tickets.length).toBe(1);

    await clearAllLocalData(testDb);
    expect(await testDb.tickets.count()).toBe(0);

    const imported = await importBackupBundle(bundle, testDb);
    expect(imported.ticketsCount).toBe(1);
    expect(await testDb.tickets.count()).toBe(1);
  });
});

describe('media.repo', () => {
  it('adds, reorders, and deletes photos attached to a ticket', async () => {
    const testDb = createTestDb();
    const m1 = await addTicketMedia(
      { ticketId: 't1', dataUrl: 'data:image/png;base64,AA==', width: 800, height: 600 },
      testDb,
    );
    const m2 = await addTicketMedia(
      { ticketId: 't1', dataUrl: 'data:image/png;base64,BB==', width: 800, height: 600 },
      testDb,
    );
    expect(m1.sortOrder).toBe(0);
    expect(m2.sortOrder).toBe(1);

    await reorderTicketMedia('t1', [m2.id, m1.id], testDb);
    const afterReorder = await testDb.media.where('ticketId').equals('t1').toArray();
    const byId = new Map(afterReorder.map((m) => [m.id, m.sortOrder]));
    expect(byId.get(m2.id)).toBe(0);
    expect(byId.get(m1.id)).toBe(1);

    await deleteTicketMedia(m1.id, testDb);
    expect(await testDb.media.count()).toBe(1);
  });
});

describe('LWW sync conflict resolution', () => {
  it('picks newer clientUpdatedAt unless local has pending unpushed changes', () => {
    const local = { id: '1', clientUpdatedAt: '2026-11-09T10:00:00.000Z', serverSeq: 1 };
    const newer = { id: '1', clientUpdatedAt: '2026-11-09T11:00:00.000Z', serverSeq: 2 };
    const older = { id: '1', clientUpdatedAt: '2026-11-09T09:00:00.000Z', serverSeq: 2 };

    expect(mergeLwwRecord(local, newer, false)).toEqual({ winner: newer, updated: true });
    expect(mergeLwwRecord(local, older, false)).toEqual({ winner: local, updated: false });
    expect(mergeLwwRecord(local, newer, true)).toEqual({ winner: local, updated: false });
  });
});
