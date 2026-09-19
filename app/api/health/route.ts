import { NextResponse } from "next/server";

export type HealthStatus = "healthy" | "degraded" | "misconfigured";

export async function GET() {
  const hasMondayToken = !!process.env.MONDAY_API_TOKEN;
  const hasDealsBoardId = !!process.env.DEALS_BOARD_ID;
  const hasWorkOrdersBoardId = !!process.env.WORK_ORDERS_BOARD_ID;
  const hasLlmKey = !!(
    process.env.GEMINI_API_KEY ||
    process.env.GLM_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );

  // Evaluate real system readiness state
  let systemStatus: HealthStatus = "healthy";
  const issues: string[] = [];

  if (!hasMondayToken || !hasDealsBoardId || !hasWorkOrdersBoardId) {
    systemStatus = "misconfigured";
    issues.push("Missing Monday.com API credentials or board IDs");
  }

  if (!hasLlmKey) {
    // If Monday is configured but no LLM key exists, system runs in degraded deterministic mode
    systemStatus = systemStatus === "misconfigured" ? "misconfigured" : "degraded";
    issues.push(
      "No active LLM provider configured; operating in degraded deterministic rule-based mode"
    );
  }

  const httpStatus = systemStatus === "misconfigured" ? 503 : 200;

  return NextResponse.json(
    {
      status: systemStatus,
      checkType: "configuration_readiness",
      scope: "lightweight_readiness_probe",
      description:
        "Lightweight configuration readiness probe verifying environment variables, board mappings, and LLM key presence. Does not make live upstream network calls to Monday.com or LLM providers during basic probe.",
      upstreamConnectivityVerified: false,
      service: "skylark-monday-bi-agent",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      diagnostics: {
        monday: {
          configured: hasMondayToken && hasDealsBoardId && hasWorkOrdersBoardId,
          dataSource: process.env.MONDAY_DATA_SOURCE || "graphql",
          dealsBoardId: hasDealsBoardId ? "configured" : "missing",
          workOrdersBoardId: hasWorkOrdersBoardId ? "configured" : "missing",
        },
        llm: {
          configured: hasLlmKey,
          providers: {
            gemini: !!process.env.GEMINI_API_KEY,
            glm: !!process.env.GLM_API_KEY,
            groq: !!process.env.GROQ_API_KEY,
            openrouter: !!process.env.OPENROUTER_API_KEY,
          },
        },
        cache: {
          ttlSeconds: Number(process.env.CACHE_TTL_SECONDS || 300),
          asOfDate: process.env.AS_OF_DATE || "auto",
        },
      },
      issues: issues.length > 0 ? issues : undefined,
    },
    { status: httpStatus }
  );
}
