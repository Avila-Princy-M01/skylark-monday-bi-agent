/**
 * Security & authorization guard utilities for Skylark BI endpoints.
 */

import { NextRequest } from "next/server";

export const MAX_BODY_SIZE_BYTES = 16 * 1024; // 16 KB
export const MAX_QUERY_LENGTH = 500; // 500 characters

/**
 * Resolves client IP address from standard reverse-proxy headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  return "127.0.0.1";
}

/**
 * Validates whether the incoming request size exceeds maximum allowed payload bounds.
 */
export function isPayloadTooLarge(req: NextRequest): boolean {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const parsed = parseInt(contentLength, 10);
    if (!Number.isNaN(parsed) && parsed > MAX_BODY_SIZE_BYTES) {
      return true;
    }
  }
  return false;
}

/**
 * Verifies if the request carries valid administrative authorization.
 */
export function isAuthorizedAdmin(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  if (!adminKey) {
    // If no admin key configured, authorization is not enforced (demo fallback)
    return false;
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === adminKey) return true;
  }

  const customKey = req.headers.get("x-admin-key")?.trim();
  if (customKey === adminKey) return true;

  return false;
}

// Global mutex state for /api/resync to prevent parallel GraphQL complexity storms
let isResyncLocked = false;
let resyncLockAcquiredAt = 0;
const MAX_LOCK_TTL_MS = 60000; // 60s auto-release failsafe

/**
 * Attempts to acquire an exclusive lock for resync execution.
 */
export function acquireResyncLock(): boolean {
  const now = Date.now();
  if (isResyncLocked) {
    if (now - resyncLockAcquiredAt > MAX_LOCK_TTL_MS) {
      // Auto-recover from an abandoned lock
      isResyncLocked = true;
      resyncLockAcquiredAt = now;
      return true;
    }
    return false;
  }
  isResyncLocked = true;
  resyncLockAcquiredAt = now;
  return true;
}

/**
 * Releases the exclusive resync lock.
 */
export function releaseResyncLock(): void {
  isResyncLocked = false;
  resyncLockAcquiredAt = 0;
}
