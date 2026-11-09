import { db as defaultDb, type MogiriDB } from './db';
import {
  type BackupBundle,
  BackupBundleSchema,
  type TicketCreateInput,
  TicketCreateInputSchema,
  type TicketPatch,
  TicketPatchSchema,
  type TicketRecord,
  TicketRecordSchema,
} from './schemas';
import { syncEngine } from './sync';
import { uuidv7 } from './uuid';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 新建票据：写入 tickets 与 outbox 在同一个事务内完成（见 03-development §5.4）。
 */
export async function createTicket(
  input: TicketCreateInput,
  database: MogiriDB = defaultDb,
): Promise<TicketRecord> {
  const parsed = TicketCreateInputSchema.parse(input);
  const now = new Date().toISOString();
  const record: TicketRecord = TicketRecordSchema.parse({
    ...parsed,
    id: uuidv7(),
    details: parsed.details ?? {},
    wear: parsed.wear ?? { torn: false, punches: [], age: 0 },
    source: parsed.source ?? 'manual',
    tags: parsed.tags ?? [],
    companions: parsed.companions ?? [],
    status: parsed.status ?? 'active',
    clientUpdatedAt: now,
    serverSeq: 0,
  });

  await database.transaction('rw', database.tickets, database.outbox, async () => {
    await database.tickets.put(record);
    await database.outbox.add({
      entity: 'tickets',
      entityId: record.id,
      op: 'upsert',
      at: now,
    });
  });

  syncEngine.schedule();
  return record;
}

/**
 * 更新票据：写入 tickets 与 outbox 在同一个事务内完成。
 */
export async function updateTicket(
  id: string,
  patch: TicketPatch,
  database: MogiriDB = defaultDb,
): Promise<TicketRecord> {
  const parsed = TicketPatchSchema.parse(patch);
  const now = new Date().toISOString();
  let updated: TicketRecord | undefined;

  await database.transaction('rw', database.tickets, database.outbox, async () => {
    const existing = await database.tickets.get(id);
    if (!existing) throw new Error(`Ticket not found: ${id}`);
    updated = TicketRecordSchema.parse({
      ...existing,
      ...parsed,
      id,
      clientUpdatedAt: now,
    });
    await database.tickets.put(updated);
    await database.outbox.add({
      entity: 'tickets',
      entityId: id,
      op: 'upsert',
      at: now,
    });
  });

  syncEngine.schedule();
  if (!updated) throw new Error(`Failed to update ticket: ${id}`);
  return updated;
}

/**
 * 软删除票据（TKT-01）：标记 status='deleted' 与 deletedAt，30 天内可恢复。
 */
export async function softDeleteTicket(
  id: string,
  database: MogiriDB = defaultDb,
): Promise<TicketRecord> {
  const now = new Date().toISOString();
  return updateTicket(id, { status: 'deleted', deletedAt: now }, database);
}

/**
 * 恢复软删除的票据（30 天内）。
 */
export async function restoreTicket(
  id: string,
  database: MogiriDB = defaultDb,
): Promise<TicketRecord> {
  const now = new Date().toISOString();
  let restored: TicketRecord | undefined;

  await database.transaction('rw', database.tickets, database.outbox, async () => {
    const existing = await database.tickets.get(id);
    if (!existing) throw new Error(`Ticket not found: ${id}`);
    const { deletedAt: _removed, ...rest } = existing;
    restored = TicketRecordSchema.parse({
      ...rest,
      status: 'active',
      clientUpdatedAt: now,
    });
    await database.tickets.put(restored);
    await database.outbox.add({
      entity: 'tickets',
      entityId: id,
      op: 'upsert',
      at: now,
    });
  });

  syncEngine.schedule();
  if (!restored) throw new Error(`Failed to restore ticket: ${id}`);
  return restored;
}

/**
 * 彻底删除单张票据及其关联媒体、二进制文件。
 */
export async function hardDeleteTicket(id: string, database: MogiriDB = defaultDb): Promise<void> {
  const now = new Date().toISOString();
  await database.transaction(
    'rw',
    [database.tickets, database.media, database.blobs, database.outbox],
    async () => {
      const ticket = await database.tickets.get(id);
      if (ticket) {
        for (const key of [ticket.scanFrontKey, ticket.scanBackKey, ticket.thumbKey]) {
          if (key) await database.blobs.delete(key);
        }
      }
      const mediaItems = await database.media.where('ticketId').equals(id).toArray();
      for (const m of mediaItems) {
        await database.blobs.delete(m.blobKey);
        await database.media.delete(m.id);
      }
      await database.tickets.delete(id);
      await database.outbox.add({
        entity: 'tickets',
        entityId: id,
        op: 'delete',
        at: now,
      });
    },
  );
  syncEngine.schedule();
}

/**
 * 清理软删除超过 30 天的票据（TKT-01）。
 */
export async function purgeExpiredDeletedTickets(
  nowMs = Date.now(),
  database: MogiriDB = defaultDb,
): Promise<number> {
  const deleted = await database.tickets.where('status').equals('deleted').toArray();
  let purged = 0;
  for (const t of deleted) {
    if (!t.deletedAt) continue;
    const deletedMs = Date.parse(t.deletedAt);
    if (!Number.isNaN(deletedMs) && nowMs - deletedMs >= THIRTY_DAYS_MS) {
      await hardDeleteTicket(t.id, database);
      purged++;
    }
  }
  return purged;
}

export async function saveBlob(
  key: string,
  blob: Blob,
  database: MogiriDB = defaultDb,
): Promise<string> {
  await database.blobs.put({
    key,
    blob,
    mimeType: blob.type || 'application/octet-stream',
    updatedAt: new Date().toISOString(),
  });
  return key;
}

export async function getBlob(
  key: string,
  database: MogiriDB = defaultDb,
): Promise<Blob | undefined> {
  const rec = await database.blobs.get(key);
  return rec?.blob;
}

/**
 * 导出全部票据与媒体数据为经过 Zod 校验的 JSON 包（ACC-04）。
 */
export async function exportBackupBundle(database: MogiriDB = defaultDb): Promise<BackupBundle> {
  const [tickets, media] = await Promise.all([
    database.tickets.toArray(),
    database.media.toArray(),
  ]);
  return BackupBundleSchema.parse({
    version: 1,
    exportedAt: new Date().toISOString(),
    tickets,
    media,
  });
}

/**
 * 导入外部 JSON 备份包（所有外部数据必须过 Zod 校验）。
 */
export async function importBackupBundle(
  raw: unknown,
  database: MogiriDB = defaultDb,
): Promise<{ ticketsCount: number; mediaCount: number }> {
  const parsed = BackupBundleSchema.parse(raw);
  const now = new Date().toISOString();
  await database.transaction(
    'rw',
    [database.tickets, database.media, database.outbox],
    async () => {
      for (const ticket of parsed.tickets) {
        await database.tickets.put(ticket);
        await database.outbox.add({
          entity: 'tickets',
          entityId: ticket.id,
          op: 'upsert',
          at: now,
        });
      }
      for (const item of parsed.media) {
        await database.media.put(item);
        await database.outbox.add({
          entity: 'media',
          entityId: item.id,
          op: 'upsert',
          at: now,
        });
      }
    },
  );
  syncEngine.schedule();
  return { ticketsCount: parsed.tickets.length, mediaCount: parsed.media.length };
}

/**
 * 清空本地全部数据（删除账号 ACC-05 或重置本地数据时使用）。
 */
export async function clearAllLocalData(database: MogiriDB = defaultDb): Promise<void> {
  await database.transaction(
    'rw',
    [database.tickets, database.media, database.blobs, database.outbox, database.meta],
    async () => {
      await Promise.all([
        database.tickets.clear(),
        database.media.clear(),
        database.blobs.clear(),
        database.outbox.clear(),
        database.meta.clear(),
      ]);
    },
  );
}
