/**
 * Sliding-window rate limiter for Skylark BI.
 *
 * Supports dual-mode operation:
 * 1. Distributed Serverless Mode: Connects to Upstash Redis via native REST API
 *    when UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN are configured.
 * 2. In-Memory Sliding-Window Log: High-performance local memory store for
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
  backend?: "distributed" | "memory";
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
      backend: "memory",
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
    backend: "memory",
  };
}

/**
 * Evaluates rate limit against distributed Upstash Redis if configured,
 * automatically falling back to in-memory evaluation.
 */
export async function checkRateLimitAsync(
  identifier: string,
  pathname: string,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (upstashUrl && upstashToken) {
    try {
      const rule = getRuleForPath(pathname);
      const windowBucket = Math.floor(now / (rule.windowSeconds * 1000));
      const redisKey = `ratelimit:${identifier}:${pathname}:${windowBucket}`;

      // Pipeline INCR and EXPIRE atomically
      const res = await fetch(`${upstashUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["EXPIRE", redisKey, rule.windowSeconds],
          ["TTL", redisKey],
        ]),
        // Short timeout so external network degradation never wedges API requests
        signal: AbortSignal.timeout(1200),
      });

      if (res.ok) {
        const data = (await res.json()) as Array<{ result: number }>;
        const count = data[0]?.result ?? 1;
        const ttl = data[2]?.result ?? rule.windowSeconds;
        const resetInSeconds = ttl > 0 ? ttl : rule.windowSeconds;

        if (count > rule.max) {
          return {
            allowed: false,
            limit: rule.max,
            remaining: 0,
            resetInSeconds,
            source: "distributed",
            backend: "distributed",
          };
        }

        return {
          allowed: true,
          limit: rule.max,
          remaining: Math.max(0, rule.max - count),
          resetInSeconds,
          source: "distributed",
          backend: "distributed",
        };
      }
    } catch {
      // Fall through to in-memory on any Upstash network error or timeout
    }
  }

  return checkInMemoryRateLimit(identifier, pathname, now);
}

/** Synchronous rate limit check for unit tests and edge environments */
export function checkRateLimit(
  identifier: string,
  pathname: string,
  now: number = Date.now()
): RateLimitResult {
  return checkInMemoryRateLimit(identifier, pathname, now);
}

/** Resets all in-memory rate limiter logs (useful for unit tests) */
export function clearRateLimits(): void {
  requestLogs.clear();
}
