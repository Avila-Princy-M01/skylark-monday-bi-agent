import { NextRequest } from "next/server";
import { runSupervisorLoop } from "@/lib/agents/supervisor";
import { loadBoardData } from "@/lib/data/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Long enough for a full agent loop, bounded so a hung run cannot wedge the function. */
export const maxDuration = 60;

interface ChatBody {
  query?: string;
  message?: string;
  asOfDate?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

function sse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Streaming conversational endpoint.
 *
 * Individual agent trace steps are pushed to the client as Server-Sent Events
 * while the loop runs, so the reviewer watches the delegation happen rather
 * than receiving one opaque blob at the end. The terminal `final` event carries
 * the answer plus assumptions, caveats and source row ids.
 */
export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response(JSON.stringify({ error: "Request body must be valid JSON." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const query = (body.query || body.message || "").trim();
  if (!query) {
    return new Response(JSON.stringify({ error: "Query cannot be empty." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(sse(event, payload)));
      };

      try {
        // 1. Resolve board data: live, else cache, else last known-good snapshot.
        const data = await loadBoardData();

        send("data-source", {
          source: data.source,
          isStale: data.isStale,
          lastSyncedAt: data.lastSyncedAt,
          mondayError: data.mondayError ?? null,
          warnings: data.warnings,
          dealsCount: data.deals.length,
          workOrdersCount: data.workOrders.length,
        });

        // 2. Run the multi-agent loop, streaming each step as it completes.
        const result = await runSupervisorLoop(query, {
          deals: data.deals,
          workOrders: data.workOrders,
          report: data.report,
          lastSyncedAt: data.lastSyncedAt,
          asOfDate: body.asOfDate,
          warnings: data.warnings,
          onTrace: (step) => send("trace", step),
        });

        send("final", {
          answer: result.answer,
          traces: result.traces,
          factSheets: result.factSheets,
          assumptions: result.assumptions,
          caveats: result.caveats,
          sourceRowIds: result.sourceRowIds,
          clarifyingVerdict: result.clarifyingVerdict,
          isDegradedFallback: result.isDegradedFallback ?? false,
          revisionPasses: result.revisionPasses ?? 0,
          criticRejectedFinal: result.criticRejectedFinal ?? false,
          dataSource: data.source,
          isStale: data.isStale,
          lastSyncedAt: data.lastSyncedAt,
          mondayError: data.mondayError ?? null,
        });
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Internal server error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
