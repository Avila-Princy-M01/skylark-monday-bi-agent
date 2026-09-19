import { NextResponse } from "next/server";

export async function GET() {
  const envStatus = {
    hasMondayToken: !!process.env.MONDAY_API_TOKEN,
    hasDealsBoardId: !!process.env.DEALS_BOARD_ID,
    hasWorkOrdersBoardId: !!process.env.WORK_ORDERS_BOARD_ID,
    hasLlmKey: !!(
      process.env.GEMINI_API_KEY ||
      process.env.GLM_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.OPENROUTER_API_KEY
    ),
  };

  return NextResponse.json(
    {
      status: "healthy",
      service: "skylark-monday-bi-agent",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: {
        configured: envStatus,
        cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 300),
        dataSource: process.env.MONDAY_DATA_SOURCE || "graphql",
      },
    },
    { status: 200 }
  );
}
