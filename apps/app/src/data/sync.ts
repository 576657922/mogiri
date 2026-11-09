/**
 * 本地优先同步引擎与 LWW（最后写入胜出）合并规则（见 02-architecture §8.2）。
 * M1 阶段先写本地和发件箱；配置好远端适配器后自动推送发件箱并增量拉取。
 */

export interface VersionedEntity {
  id: string;
  clientUpdatedAt: string;
  serverSeq: number;
}

/**
 * 记录级 LWW 合并：
 * - 如果本地有未推送的修改（hasPendingLocal = true），保留本地版本；
 * - 否则比较 clientUpdatedAt（ISO 8601 UTC 字符串），incoming >= current 时采用 incoming。
 */
export function mergeLwwRecord<T extends VersionedEntity>(
  local: T | undefined,
  incoming: T,
  hasPendingLocal = false,
): { winner: T; updated: boolean } {
  if (!local) return { winner: incoming, updated: true };
  if (hasPendingLocal) return { winner: local, updated: false };
  if (incoming.clientUpdatedAt >= local.clientUpdatedAt) {
    return { winner: incoming, updated: true };
  }
  return { winner: local, updated: false };
}

export class SyncScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private syncing = false;
  private lastSyncedAt: string | null = null;

  constructor(private readonly debounceMs = 2000) {}

  /** 本地写入后调用，防抖 2 秒触发同步（见 03-development §5.4） */
  schedule(onFlush?: () => Promise<void>): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush(onFlush);
    }, this.debounceMs);
  }

  async flush(onFlush?: () => Promise<void>): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      await onFlush?.();
      this.lastSyncedAt = new Date().toISOString();
    } finally {
      this.syncing = false;
    }
  }

  getLastSyncedAt(): string | null {
    return this.lastSyncedAt;
  }
}

export const syncEngine = new SyncScheduler(2000);
