import { NextRequest, NextResponse } from "next/server";
import { forceResync } from "@/lib/data/loader";
import { acquireResyncLock, releaseResyncLock, isAuthorizedAdmin } from "@/lib/security/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual cache invalidation. Clears the cache and immediately re-reads both
 * monday.com boards.
 *
 * Protected by concurrency locking and optional administrative authorization
 * to prevent upstream GraphQL complexity exhaustion.
 */
export async function POST(req: NextRequest) {
  // 1. Strict admin auth check if STRICT_AUTH_MODE is enabled
  if (process.env.STRICT_AUTH_MODE === "true" && !isAuthorizedAdmin(req)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized. Admin credentials required for upstream board resync.",
        code: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  // 2. Concurrency lock to prevent parallel cache-busting floods
  if (!acquireResyncLock()) {
    return NextResponse.json(
      {
        success: false,
        error: "A resync operation is currently running. Please wait for it to finish.",
        code: "RESYNC_IN_PROGRESS",
      },
      { status: 429 }
    );
  }

  try {
    const data = await forceResync();

    const degraded = data.source !== "live";

    return NextResponse.json(
      {
        success: !degraded,
        source: data.source,
        isStale: data.isStale,
        dealsCount: data.deals.length,
        workOrdersCount: data.workOrders.length,
        issuesCount: data.report.issues.length,
        lastSyncedAt: data.lastSyncedAt,
        mondayError: data.mondayError ?? null,
        warnings: data.warnings,
        message: degraded
          ? "Resync did not complete against monday.com. See warnings for the reason."
          : `Resynced ${data.deals.length} deals and ${data.workOrders.length} work orders from monday.com.`,
      },
      { status: degraded && data.source === "unavailable" ? 503 : 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync with monday.com",
      },
      { status: 500 }
    );
  } finally {
    releaseResyncLock();
  }
}
