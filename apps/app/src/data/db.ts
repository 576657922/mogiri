import Dexie, { type Table } from 'dexie';
import type { BlobRecord, MediaRecord, MetaRecord, OutboxRecord, TicketRecord } from './schemas';

/**
 * 本地 IndexedDB 数据库（见 02-architecture §8.1）。
 * Dexie 是客户端唯一持久化数据源，UI 通过 useLiveQuery 自动响应变化。
 */
export class MogiriDB extends Dexie {
  tickets!: Table<TicketRecord, string>;
  media!: Table<MediaRecord, string>;
  blobs!: Table<BlobRecord, string>;
  outbox!: Table<OutboxRecord, number>;
  meta!: Table<MetaRecord, string>;

  constructor(
    name = 'mogiri-db',
    options?: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange },
  ) {
    super(name, options);
    this.version(1).stores({
      tickets: 'id, eventAt, type, status, [status+eventAt], *tags, serverSeq',
      media: 'id, ticketId, [ticketId+sortOrder]',
      blobs: 'key',
      outbox: '++seq, entity, entityId',
      meta: 'key',
    });
  }
}

export const db = new MogiriDB();
