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

export function invalidateCache(): void {
  globalCache = null;
}
