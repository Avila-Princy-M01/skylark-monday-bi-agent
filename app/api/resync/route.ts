import { NextResponse } from "next/server";
import { invalidateCache, setCachedData } from "@/lib/data/cache";
import { MondayGraphQLSource } from "@/lib/monday/graphql-source";
import { generateDataQualityReport } from "@/lib/data/quality-report";

export async function POST() {
  try {
    invalidateCache();

    const dealsBoardId = process.env.MONDAY_DEALS_BOARD_ID || "";
    const woBoardId = process.env.MONDAY_WORK_ORDERS_BOARD_ID || "";

    if (!process.env.MONDAY_API_TOKEN || !dealsBoardId || !woBoardId) {
      return NextResponse.json({
        success: true,
        message: "Cache cleared. (Live Monday credentials not configured; serving mock data).",
        lastSyncedAt: new Date().toISOString(),
      });
    }

    const client = new MondayGraphQLSource();
    const [dealsSchema, woSchema] = await Promise.all([
      client.getBoardSchema(dealsBoardId),
      client.getBoardSchema(woBoardId),
    ]);

    const dealsColMap = client.buildColumnMapping(dealsSchema);
    const woColMap = client.buildColumnMapping(woSchema);

    const [rawDeals, rawWos] = await Promise.all([
      client.fetchAllItems(dealsBoardId),
      client.fetchAllItems(woBoardId),
    ]);

    const normalized = generateDataQualityReport(rawDeals, rawWos, dealsColMap, woColMap);
    const cached = setCachedData({
      deals: normalized.deals,
      workOrders: normalized.workOrders,
      report: normalized.report,
      lastSyncedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      dealsCount: cached.deals.length,
      workOrdersCount: cached.workOrders.length,
      issuesCount: cached.report.issues.length,
      lastSyncedAt: cached.lastSyncedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync with Monday.com",
      },
      { status: 500 }
    );
  }
}
