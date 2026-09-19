import { NextRequest, NextResponse } from "next/server";
import { runSupervisorLoop } from "@/lib/agents/supervisor";
import { getCachedData, setCachedData } from "@/lib/data/cache";
import { MondayGraphQLSource } from "@/lib/monday/graphql-source";
import { generateDataQualityReport } from "@/lib/data/quality-report";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = body.query || body.message || "";

    if (!query.trim()) {
      return NextResponse.json({ error: "Query cannot be empty" }, { status: 400 });
    }

    // 1. Get cached data or fetch live from monday.com
    let cached = getCachedData();

    if (!cached) {
      const dealsBoardId = process.env.MONDAY_DEALS_BOARD_ID || "";
      const woBoardId = process.env.MONDAY_WORK_ORDERS_BOARD_ID || "";

      if (process.env.MONDAY_API_TOKEN && dealsBoardId && woBoardId) {
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
        cached = setCachedData({
          deals: normalized.deals,
          workOrders: normalized.workOrders,
          report: normalized.report,
          lastSyncedAt: new Date().toISOString(),
        });
      } else {
        // Fallback demo/mock fixtures
        const normalized = generateDataQualityReport([], []);
        cached = setCachedData({
          deals: normalized.deals,
          workOrders: normalized.workOrders,
          report: normalized.report,
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }

    // 2. Execute multi-agent supervisor loop
    const result = await runSupervisorLoop(query, {
      deals: cached.deals,
      workOrders: cached.workOrders,
      report: cached.report,
      lastSyncedAt: cached.lastSyncedAt,
      asOfDate: body.asOfDate || "2026-03-31",
    });

    return NextResponse.json({
      answer: result.answer,
      traces: result.traces,
      factSheets: result.factSheets,
      assumptions: result.assumptions,
      caveats: result.caveats,
      sourceRowIds: result.sourceRowIds,
      clarifyingVerdict: result.clarifyingVerdict,
      isDegradedFallback: result.isDegradedFallback,
      lastSyncedAt: cached.lastSyncedAt,
      isStale: cached.isStale,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
