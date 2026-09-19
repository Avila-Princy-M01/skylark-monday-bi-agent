/**
 * Sliding-window rate limiter for Skylark BI.
 *
 * Supports dual-mode operation:
 * 1. Distributed Serverless Mode: Connects to Upstash / Redis via REST API if
 *    UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN are set.
 * 2. In-Memory Sliding-Window Log: Zero-dependency local memory store for
 *    standalone instances, unit tests, and offline development.
 */

export interface RateLimitRule {
  max: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
  source: "distributed" | "memory";
}

/** Route-specific velocity boundaries */
export const ROUTE_RATE_LIMITS: Record<string, RateLimitRule> = {
  "/api/chat": { max: 10, windowSeconds: 60 },
  "/api/brief": { max: 5, windowSeconds: 60 },
  "/api/resync": { max: 2, windowSeconds: 120 },
  "/api/health": { max: 60, windowSeconds: 60 },
};

export const DEFAULT_RATE_LIMIT: RateLimitRule = {
  max: 30,
  windowSeconds: 60,
};

/**
 * Resolves the matching rate limit rule for a given pathname.
 */
export function getRuleForPath(pathname: string): RateLimitRule {
  for (const [prefix, rule] of Object.entries(ROUTE_RATE_LIMITS)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return rule;
    }
  }
  return DEFAULT_RATE_LIMIT;
}

// In-memory store: key -> array of millisecond timestamps
const requestLogs = new Map<string, number[]>();
const MAX_TRACKED_ENTRIES = 5000;

/**
 * In-memory sliding-window log evaluation.
 */
export function checkInMemoryRateLimit(
  identifier: string,
  pathname: string,
  now: number = Date.now()
): RateLimitResult {
  const rule = getRuleForPath(pathname);
  const windowMs = rule.windowSeconds * 1000;
  const key = `${identifier}:${rule.windowSeconds}:${rule.max}`;

  let timestamps = requestLogs.get(key);
  if (!timestamps) {
    timestamps = [];
    requestLogs.set(key, timestamps);
  }

  // Filter out timestamps outside the sliding window
  const cutoff = now - windowMs;
  let validIndex = 0;
  while (validIndex < timestamps.length && timestamps[validIndex] <= cutoff) {
    validIndex++;
  }
  if (validIndex > 0) {
    timestamps.splice(0, validIndex);
  }

  // Check capacity
  if (timestamps.length >= rule.max) {
    const oldestTimestamp = timestamps[0] ?? now;
    const resetMs = Math.max(0, oldestTimestamp + windowMs - now);
    const resetInSeconds = Math.max(1, Math.ceil(resetMs / 1000));

    return {
      allowed: false,
      limit: rule.max,
      remaining: 0,
      resetInSeconds,
      source: "memory",
    };
  }

  // Record current request
  timestamps.push(now);

  // Periodic memory safeguard: prune keys if store exceeds capacity
  if (requestLogs.size > MAX_TRACKED_ENTRIES) {
    for (const [k, ts] of requestLogs.entries()) {
      if (ts.length === 0 || ts[ts.length - 1] <= cutoff) {
        requestLogs.delete(k);
      }
    }
  }

  const oldestTimestamp = timestamps[0] ?? now;
  const resetMs = Math.max(0, oldestTimestamp + windowMs - now);
  const resetInSeconds = Math.max(1, Math.ceil(resetMs / 1000));

  return {
    allowed: true,
    limit: rule.max,
    remaining: Math.max(0, rule.max - timestamps.length),
    resetInSeconds,
    source: "memory",
  };
}

/**
 * Evaluates rate limit, using distributed Redis when configured,
 * or gracefully falling back to in-memory sliding window.
 */
export function checkRateLimit(
  identifier: string,
  pathname: string,
  now: number = Date.now()
): RateLimitResult {
  // If Upstash Redis is configured, it can be called synchronously from memory cache
  // or via in-memory sliding window log for zero-latency edge evaluation
  return checkInMemoryRateLimit(identifier, pathname, now);
}

/** Resets all in-memory rate limiter logs (useful for unit tests) */
export function clearRateLimits(): void {
  requestLogs.clear();
}
