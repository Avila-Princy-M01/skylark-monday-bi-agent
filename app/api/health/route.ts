import { NextRequest, NextResponse } from "next/server";
import {
  getConfig,
  getMondayConfig,
  isMondayConfigured,
  getCacheTtlSeconds,
  getAsOfDate,
} from "@/lib/config";
import { getCachedData } from "@/lib/data/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type HealthStatus = "healthy" | "degraded" | "misconfigured";

/**
 * Health endpoint.
 *
 * By default this is a cheap *configuration* readiness probe: it reports which
 * environment variables are present and which LLM providers are in the failover
 * chain, without spending monday.com API quota.
 *
 * Pass `?probe=1` to additionally perform a live connectivity test against
 * monday.com (one board-schema read per board). That distinguishes "configured"
 * from "actually working", which a pure env check cannot do.
 */
export async function GET(req: NextRequest) {
  const mondayConfigured = isMondayConfigured();
  const config = getConfig();
  const missing: string[] = [];

  if (!mondayConfigured) {
    const monday = getMondayConfig();
    if (!monday.apiToken) missing.push("MONDAY_API_TOKEN");
    if (!monday.dealsBoardId) missing.push("DEALS_BOARD_ID");
    if (!monday.workOrdersBoardId) missing.push("WORK_ORDERS_BOARD_ID");
  }

  const providersConfigured = config.llmChain.map((provider) => provider.providerName);
  const hasLlmKey = providersConfigured.length > 0;

  let upstreamProbe: {
    requested: true;
    mondayReachable: boolean;
    error: string | null;
  } | null = null;

  const shouldProbe = req.nextUrl.searchParams.get("probe") === "1";

  if (shouldProbe && mondayConfigured) {
    try {
      const { loadBoardData } = await import("@/lib/data/loader");
      await loadBoardData();
      upstreamProbe = { requested: true, mondayReachable: true, error: null };
    } catch (error) {
      upstreamProbe = {
        requested: true,
        mondayReachable: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const cached = getCachedData();

  let status: HealthStatus = "healthy";
  const issues: string[] = [];

  if (missing.length > 0) {
    status = "misconfigured";
    issues.push(`Missing monday.com configuration: ${missing.join(", ")}`);
  }

  if (!hasLlmKey) {
    // Without a provider key the agent still answers, deterministically.
    status = status === "misconfigured" ? "misconfigured" : "degraded";
    issues.push(
      "No LLM provider key configured; the agent runs in deterministic degraded mode (no generated prose)."
    );
  }

  if (upstreamProbe && !upstreamProbe.mondayReachable) {
    status = status === "misconfigured" ? "misconfigured" : "degraded";
    issues.push(`Live monday.com probe failed: ${upstreamProbe.error ?? "unknown error"}`);
  }

  if (cached?.isStale) {
    issues.push("The in-process cache is expired; the next request will attempt a live resync.");
  }

  return NextResponse.json(
    {
      status,
      service: "skylark-monday-bi-agent",
      checkType: upstreamProbe ? "configuration_and_connectivity" : "configuration_readiness",
      upstreamConnectivityVerified: Boolean(upstreamProbe?.mondayReachable),
      hint: "Append ?probe=1 to perform a live monday.com connectivity check.",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      diagnostics: {
        monday: {
          configured: mondayConfigured,
          dataSource: config.monday.dataSource,
          apiVersion: config.monday.apiVersion,
          dealsBoardId: config.monday.dealsBoardId ? "configured" : "missing",
          workOrdersBoardId: config.monday.workOrdersBoardId ? "configured" : "missing",
        },
        llm: {
          configured: hasLlmKey,
          providers: providersConfigured,
          order: ["gemini", "glm", "groq", "openrouter"],
        },
        cache: {
          ttlSeconds: getCacheTtlSeconds(),
          hasSnapshot: Boolean(cached),
          isStale: cached?.isStale ?? null,
          lastSyncedAt: cached?.lastSyncedAt ?? null,
        },
        time: {
          asOfDate: getAsOfDate(),
          fiscalYearConvention: "Indian fiscal year, 1 April to 31 March",
        },
        upstreamProbe,
      },
      issues: issues.length > 0 ? issues : undefined,
    },
    { status: status === "misconfigured" ? 503 : 200 }
  );
}
