import { Deal, WorkOrder, DataQualityReport } from "./types";

export interface CachedDataState {
  deals: Deal[];
  workOrders: WorkOrder[];
  report: DataQualityReport;
  lastSyncedAt: string;
  source: "live" | "cache" | "fallback_snapshot";
  isStale: boolean;
}

interface CacheEntry {
  state: CachedDataState;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

let globalCache: CacheEntry | null = null;
let durableSnapshot: CachedDataState | null = null;

export function getCachedData(): CachedDataState | null {
  if (!globalCache) {
    if (durableSnapshot) {
      return {
        ...durableSnapshot,
        source: "fallback_snapshot",
        isStale: true,
      };
    }
    return null;
  }

  const isExpired = Date.now() > globalCache.expiresAt;
  return {
    ...globalCache.state,
    source: "cache",
    isStale: isExpired,
  };
}

export function setCachedData(
  state: Omit<CachedDataState, "source" | "isStale">,
  ttlMs: number = DEFAULT_TTL_MS
): CachedDataState {
  const fullState: CachedDataState = {
    ...state,
    source: "live",
    isStale: false,
  };

  globalCache = {
    state: fullState,
    expiresAt: Date.now() + ttlMs,
  };

  // Keep a durable snapshot to survive temporary network outages
  durableSnapshot = fullState;

  return fullState;
}

/**
 * Drops the live cache entry but keeps the durable snapshot.
 *
 * This is what a manual resync should do: force a re-read from monday.com while
 * still being able to fall back to the previous good data if that read fails.
 */
export function invalidateCache(): void {
  globalCache = null;
}

/**
 * Drops the cache AND the durable snapshot.
 *
 * Only used to reset module state between tests, where a snapshot surviving from
 * a previous case would make assertions depend on execution order.
 */
export function clearCacheSnapshot(): void {
  globalCache = null;
  durableSnapshot = null;
}

/** The timestamp of the retained snapshot, if one exists. */
export function getSnapshotTimestamp(): string | null {
  return durableSnapshot?.lastSyncedAt ?? null;
}
