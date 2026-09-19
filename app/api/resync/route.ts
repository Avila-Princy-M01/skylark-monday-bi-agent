import { NextResponse } from "next/server";
import { forceResync } from "@/lib/data/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual cache invalidation. Clears the cache and immediately re-reads both
 * monday.com boards.
 *
 * Previously this reported success even when credentials were absent, which made
 * an empty dataset look like a successful sync. It now surfaces the real data
 * source and any degradation, so the UI can show it.
 */
export async function POST() {
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
  }
}
