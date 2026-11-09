import { db as defaultDb, type MogiriDB } from './db';
import { type MediaRecord, MediaRecordSchema } from './schemas';
import { syncEngine } from './sync';
import { uuidv7 } from './uuid';

export type AddMediaInput = {
  ticketId: string;
  kind?: 'photo' | 'video';
  blob?: Blob;
  dataUrl: string;
  width: number;
  height: number;
  durationMs?: number;
  takenAt?: string;
  caption?: string;
};

/**
 * 为票据添加照片或视频（MEM-01）：自动排在末尾，同一个事务写入 media、blobs、outbox。
 */
export async function addTicketMedia(
  input: AddMediaInput,
  database: MogiriDB = defaultDb,
): Promise<MediaRecord> {
  const now = new Date().toISOString();
  const id = uuidv7();
  const blobKey = `media/${input.ticketId}/${id}`;

  const existing = await database.media
    .where('ticketId')
    .equals(input.ticketId)
    .filter((m) => !m.deletedAt)
    .toArray();
  const maxOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1);

  const record: MediaRecord = MediaRecordSchema.parse({
    id,
    ticketId: input.ticketId,
    kind: input.kind ?? 'photo',
    blobKey,
    dataUrl: input.dataUrl,
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
    durationMs: input.durationMs,
    takenAt: input.takenAt,
    caption: input.caption,
    sortOrder: maxOrder + 1,
    clientUpdatedAt: now,
    serverSeq: 0,
  });

  await database.transaction('rw', [database.media, database.blobs, database.outbox], async () => {
    if (input.blob) {
      await database.blobs.put({
        key: blobKey,
        blob: input.blob,
        mimeType: input.blob.type || 'image/jpeg',
        updatedAt: now,
      });
    }
    await database.media.put(record);
    await database.outbox.add({
      entity: 'media',
      entityId: record.id,
      op: 'upsert',
      at: now,
    });
  });

  syncEngine.schedule();
  return record;
}

/**
 * 调整同一张票下的照片顺序（MEM-01）。
 */
export async function reorderTicketMedia(
  ticketId: string,
  orderedIds: string[],
  database: MogiriDB = defaultDb,
): Promise<void> {
  const now = new Date().toISOString();
  await database.transaction('rw', database.media, database.outbox, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (!id) continue;
      const item = await database.media.get(id);
      if (!item || item.ticketId !== ticketId) continue;
      await database.media.update(id, { sortOrder: i, clientUpdatedAt: now });
      await database.outbox.add({
        entity: 'media',
        entityId: id,
        op: 'upsert',
        at: now,
      });
    }
  });
  syncEngine.schedule();
}

/**
 * 更新照片说明文字。
 */
export async function updateMediaCaption(
  id: string,
  caption: string,
  database: MogiriDB = defaultDb,
): Promise<void> {
  const now = new Date().toISOString();
  await database.transaction('rw', database.media, database.outbox, async () => {
    await database.media.update(id, { caption, clientUpdatedAt: now });
    await database.outbox.add({
      entity: 'media',
      entityId: id,
      op: 'upsert',
      at: now,
    });
  });
  syncEngine.schedule();
}

/**
 * 删除单张附加照片（MEM-01）。
 */
export async function deleteTicketMedia(id: string, database: MogiriDB = defaultDb): Promise<void> {
  const now = new Date().toISOString();
  await database.transaction('rw', [database.media, database.blobs, database.outbox], async () => {
    const item = await database.media.get(id);
    if (!item) return;
    await database.blobs.delete(item.blobKey);
    await database.media.delete(id);
    await database.outbox.add({
      entity: 'media',
      entityId: id,
      op: 'delete',
      at: now,
    });
  });
  syncEngine.schedule();
}
