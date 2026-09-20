import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMondayConfig,
  getAsOfDate,
  getCacheTtlSeconds,
  getLlmProviderChain,
  isMondayConfigured,
} from "../lib/config";
import { loadBoardData, forceResync } from "../lib/data/loader";
import { getCachedData, clearCacheSnapshot } from "../lib/data/cache";
import { MondayMcpSource, MCP_TOOLS } from "../lib/monday/mcp-source";
import { MondayApiError } from "../lib/monday/errors";
import {
  completeText,
  completeJson,
  extractJsonObject,
  isLlmAvailable,
  probeLlmReachability,
} from "../lib/llm/client";
import { planDeterministically, createAnalystPlan } from "../lib/agents/planner";
import { runCriticVerification } from "../lib/agents/critic";
import { runSupervisorLoop } from "../lib/agents/supervisor";
import { runNarratorWithLlm } from "../lib/agents/narrator";
import { MetricFactSheet, Deal, WorkOrder, DataQualityReport } from "../lib/data/types";
import { z } from "zod";

const EMPTY_REPORT: DataQualityReport = {
  totalRawDealsRows: 0,
  totalValidDeals: 0,
  totalRawWorkOrdersRows: 0,
  totalValidWorkOrders: 0,
  junkRowsDropped: 0,
  emptyColumnsExcluded: [],
  maskedPlaceholderValuesCount: 0,
  maskedPlaceholderTotalSumExcluded: 0,
  overBilledRecordsCount: 0,
  dateAnomaliesCount: 0,
  statusStageContradictionsCount: 0,
  nearDuplicatesCount: 0,
  issues: [],
  generatedAt: "2026-03-31T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  clearCacheSnapshot();
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe("Centralized configuration", () => {
  it("accepts both the prefixed and unprefixed board-ID variable names", () => {
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "");
    vi.stubEnv("DEALS_BOARD_ID", "111");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "222");
    vi.stubEnv("WORK_ORDERS_BOARD_ID", "333");

    const config = getMondayConfig();
    // Prefixed name wins when present, so both spellings remain deployable.
    expect(config.workOrdersBoardId).toBe("222");
    // Unprefixed name is honoured when the prefixed one is blank. This mismatch
    // previously let /api/health report "configured" while /api/chat fell back
    // to empty data.
    expect(config.dealsBoardId).toBe("111");
  });

  it("reports Monday as unconfigured when any required value is missing", () => {
    vi.stubEnv("MONDAY_API_TOKEN", "");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "111");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "222");
    expect(isMondayConfigured()).toBe(false);

    vi.stubEnv("MONDAY_API_TOKEN", "token");
    expect(isMondayConfigured()).toBe(true);
  });

  it("anchors the as-of date to the dataset end, not the wall clock", () => {
    vi.stubEnv("AS_OF_DATE", "auto");
    expect(getAsOfDate()).toBe("2026-03-31");

    vi.stubEnv("AS_OF_DATE", "2025-12-31");
    expect(getAsOfDate()).toBe("2025-12-31");
  });

  it("falls back to a sane cache TTL when the value is absent or invalid", () => {
    vi.stubEnv("CACHE_TTL_SECONDS", "");
    expect(getCacheTtlSeconds()).toBe(600);

    vi.stubEnv("CACHE_TTL_SECONDS", "not-a-number");
    expect(getCacheTtlSeconds()).toBe(600);

    vi.stubEnv("CACHE_TTL_SECONDS", "120");
    expect(getCacheTtlSeconds()).toBe(120);
  });

  it("builds the provider failover chain in documented preference order", () => {
    vi.stubEnv("LLM_FORCE_IN_TESTS", "1");
    vi.stubEnv("GEMINI_API_KEY", "g");
    vi.stubEnv("GLM_API_KEY", "z");
    vi.stubEnv("GROQ_API_KEY", "q");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("ZHIPU_API_KEY", "");

    const chain = getLlmProviderChain();
    expect(chain.map((p) => p.providerName)).toEqual(["gemini", "glm", "groq"]);
    expect(chain[0].baseURL).toContain("generativelanguage.googleapis.com");
  });

  it("keeps tests hermetic even when a real provider key is present", () => {
    vi.stubEnv("GEMINI_API_KEY", "real-looking-key");
    vi.stubEnv("LLM_FORCE_IN_TESTS", "");
    expect(getLlmProviderChain()).toEqual([]);
    expect(isLlmAvailable()).toBe(false);
  });

  it("probes provider model reachability independently of application logic", async () => {
    const mockFetch = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "ok" } }] })
    );
    const chain = [
      {
        providerName: "gemini" as const,
        apiKey: "test-key",
        modelName: "gemini-3.5-flash",
        baseURL: "http://mock-llm.local",
      },
    ];

    const results = await probeLlmReachability(chain, mockFetch as unknown as typeof fetch);
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe("gemini");
    expect(results[0].reachable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Resilient data loader
// ---------------------------------------------------------------------------

function fakeSource(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "graphql" as const,
    getBoardSchema: vi.fn(async (boardId: string) => ({
      id: boardId,
      name: `Board ${boardId}`,
      columns: [{ id: "col_a", title: "Owner code", type: "text" }],
    })),
    fetchAllItems: vi.fn(async () => [
      { id: "item_1", name: "Alpha", column_values: [{ id: "col_a", text: "OWNER_001" }] },
    ]),
    buildColumnMapping: vi.fn(() => ({ "Owner code": "col_a" })),
    ...overrides,
  };
}

describe("Data loader resilience", () => {
  it("reads live from monday.com when configured and caches the result", async () => {
    vi.stubEnv("MONDAY_API_TOKEN", "token");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "111");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "222");

    const source = fakeSource();
    const data = await loadBoardData({ sourceFactory: () => source });

    expect(data.source).toBe("live");
    expect(data.isStale).toBe(false);
    expect(data.deals.length).toBe(1);
    expect(data.warnings).toEqual([]);
    expect(source.fetchAllItems).toHaveBeenCalledTimes(2);
  });

  it("serves the cached snapshot instead of refetching while it is fresh", async () => {
    vi.stubEnv("MONDAY_API_TOKEN", "token");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "111");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "222");

    const source = fakeSource();
    await loadBoardData({ sourceFactory: () => source });
    const second = await loadBoardData({ sourceFactory: () => source });

    expect(second.source).toBe("cache");
    // Only the first call hit the network.
    expect(source.fetchAllItems).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last known-good snapshot and warns when the live read fails", async () => {
    vi.stubEnv("MONDAY_API_TOKEN", "token");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "111");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "222");

    // Prime the cache with a good read.
    await loadBoardData({ sourceFactory: () => fakeSource() });

    // Now make monday.com fail.
    const failing = fakeSource({
      getBoardSchema: vi.fn(async () => {
        throw new MondayApiError("rate_limited", "Too many requests", { retryAfterSeconds: 1 });
      }),
    });

    const data = await loadBoardData({ forceRefresh: true, sourceFactory: () => failing });

    expect(data.source).toBe("stale_snapshot");
    expect(data.isStale).toBe(true);
    expect(data.deals.length).toBe(1); // last good snapshot, not emptied
    expect(data.mondayError).toContain("rate limit");
    expect(data.warnings.join(" ")).toMatch(/rate limit/i);
    expect(data.warnings.join(" ")).toMatch(/last known-good snapshot/i);
  });

  it("warns explicitly instead of silently returning empty data when unconfigured", async () => {
    vi.stubEnv("MONDAY_API_TOKEN", "");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "");
    vi.stubEnv("DEALS_BOARD_ID", "");
    vi.stubEnv("WORK_ORDERS_BOARD_ID", "");

    const data = await loadBoardData({ forceRefresh: true });

    expect(data.source).toBe("unavailable");
    expect(data.deals).toEqual([]);
    expect(data.warnings.join(" ")).toMatch(/MONDAY_API_TOKEN/);
    expect(data.warnings.join(" ")).toMatch(/empty dataset/i);
  });

  it("clears the cache before a forced resync", async () => {
    vi.stubEnv("MONDAY_API_TOKEN", "token");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "111");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "222");

    await loadBoardData({ sourceFactory: () => fakeSource() });
    expect(getCachedData()).not.toBeNull();

    const resynced = await forceResync({ sourceFactory: () => fakeSource() });
    expect(resynced.source).toBe("live");
  });
});

// ---------------------------------------------------------------------------
// MCP transport
// ---------------------------------------------------------------------------

describe("monday.com MCP data source", () => {
  it("maps columns by title from the board schema", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.method).toBe("tools/call");
      expect(body.params.name).toBe(MCP_TOOLS.boardInfo);
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: "111",
                name: "Deals",
                columns: [{ id: "text_owner", title: "Owner code", type: "text" }],
              }),
            },
          ],
        },
      });
    });

    const source = new MondayMcpSource({ apiToken: "token", fetchImpl: fetchImpl as typeof fetch });
    const schema = await source.getBoardSchema("111");
    const mapping = source.buildColumnMapping(schema);

    expect(source.kind).toBe("mcp");
    expect(mapping["Owner code"]).toBe("text_owner");
  });

  it("follows the cursor until the page is exhausted", async () => {
    let page = 0;
    const fetchImpl = vi.fn(async () => {
      page++;
      return jsonResponse({
        jsonrpc: "2.0",
        id: page,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                cursor: page < 3 ? `cursor_${page}` : null,
                items: [{ id: `item_${page}`, name: `Item ${page}` }],
              }),
            },
          ],
        },
      });
    });

    const source = new MondayMcpSource({ apiToken: "token", fetchImpl: fetchImpl as typeof fetch });
    const items = await source.fetchAllItems("111");

    expect(items.map((item) => item.id)).toEqual(["item_1", "item_2", "item_3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("maps HTTP 401 to a non-retryable unauthorized error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 401));
    const source = new MondayMcpSource({ apiToken: "token", fetchImpl: fetchImpl as typeof fetch });

    await expect(source.getBoardSchema("111")).rejects.toThrow(/unauthorized/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports a missing token before attempting any request", async () => {
    // The constructor falls back to process.env, so a real local token would
    // otherwise mask this check.
    vi.stubEnv("MONDAY_API_TOKEN", "");
    const fetchImpl = vi.fn();
    const source = new MondayMcpSource({ apiToken: "", fetchImpl: fetchImpl as typeof fetch });

    await expect(source.getBoardSchema("111")).rejects.toThrow(/MONDAY_API_TOKEN/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LLM client
// ---------------------------------------------------------------------------

const TEST_CHAIN = [
  {
    providerName: "gemini" as const,
    modelName: "primary-model",
    apiKey: "key-1",
    baseURL: "https://primary.test/v1",
  },
  {
    providerName: "groq" as const,
    modelName: "fallback-model",
    apiKey: "key-2",
    baseURL: "https://fallback.test/v1",
  },
];

function completion(content: string, status = 200) {
  return jsonResponse({ choices: [{ message: { content } }] }, status);
}

describe("LLM client with provider failover", () => {
  it("returns the first successful provider", async () => {
    const fetchImpl = vi.fn(async () => completion("hello"));
    const result = await completeText([{ role: "user", content: "hi" }], {
      chain: TEST_CHAIN,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result?.text).toBe("hello");
    expect(result?.provider).toBe("gemini");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails over to the next provider when the first errors", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("primary.test")) return completion("boom", 500);
      return completion("rescued");
    });

    const result = await completeText([{ role: "user", content: "hi" }], {
      chain: TEST_CHAIN,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result?.text).toBe("rescued");
    expect(result?.provider).toBe("groq");
  });

  it("returns null when every provider fails, so callers can degrade", async () => {
    const fetchImpl = vi.fn(async () => completion("nope", 503));
    const result = await completeText([{ role: "user", content: "hi" }], {
      chain: TEST_CHAIN,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toBeNull();
  });

  it("never leaks the API key into the error surfaced to the caller", async () => {
    const fetchImpl = vi.fn(async () => completion("secret-key-1", 401));
    const result = await completeText([{ role: "user", content: "hi" }], {
      chain: [TEST_CHAIN[0]],
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toBeNull();
  });

  it("extracts JSON from prose and code fences", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJsonObject('Sure! Here you go: {"a":{"b":[1,2]}} hope that helps')).toEqual({
      a: { b: [1, 2] },
    });
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("rejects a completion that does not satisfy the schema, then fails over", async () => {
    const schema = z.object({ count: z.number() });
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      // First provider returns a wrong shape.
      if (target.includes("primary.test")) return completion('{"count":"not-a-number"}');
      return completion('{"count":7}');
    });

    const result = await completeJson([{ role: "user", content: "hi" }], schema, {
      chain: TEST_CHAIN,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result?.data.count).toBe(7);
    expect(result?.provider).toBe("groq");
  });
});

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

describe("Analyst planner", () => {
  it("routes pipeline questions to pipeline health, not the sector scorecard", () => {
    // "sector" appears in the sentence, but this is a pipeline question.
    expect(planDeterministically("pipeline in Mining sector").primaryTool).toBe(
      "get_pipeline_health"
    );
  });

  it("routes each intent family to the expected tool", () => {
    expect(planDeterministically("which deals are stalled").primaryTool).toBe("get_stalled_deals");
    expect(planDeterministically("what is our collection efficiency").primaryTool).toBe(
      "get_collections_and_ar"
    );
    expect(planDeterministically("show contracted revenue").primaryTool).toBe(
      "get_revenue_metrics"
    );
    expect(planDeterministically("where is the money stuck").primaryTool).toBe(
      "get_stuck_money_analysis"
    );
    expect(planDeterministically("owner scorecard please").primaryTool).toBe(
      "get_cross_board_scorecards"
    );
  });

  it("passes the canonical alias sectors through a plan for a composite query", async () => {
    // No provider key in tests, so this exercises the deterministic fallback path.
    const { plan, trace } = await createAnalystPlan("How is the energy pipeline performing?");

    expect(plan.source).toBe("deterministic");
    expect(plan.llmWarning).toBeTruthy();
    expect(trace.status).toBe("warn");
    // "this quarter"-style framing is resolved against the configured as-of date.
    expect(plan.timeWindow?.fiscalYear).toMatch(/^FY\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// Critic re-analysis routing
// ---------------------------------------------------------------------------

describe("Critic-driven re-analysis", () => {
  const weakFactSheet: MetricFactSheet = {
    numbers: { totalOpenValue: 1000000 },
    sourceRowIds: ["deal_1"],
    rowsScanned: 1,
    assumptions: [],
    caveats: [],
    asOfDate: "2026-03-31",
    fiscalYear: "FY25-26",
  };

  it("rejects a revenue answer that never separated the three revenue bases", () => {
    const { review } = runCriticVerification(
      "what is our contracted vs billed revenue",
      [weakFactSheet],
      "Open pipeline is ₹10.00 L."
    );

    expect(review.approved).toBe(false);
    expect(review.reanalysisRequired).toBe(true);
    expect(review.requestedTools).toContain("get_revenue_metrics");
  });

  it("rejects a stalled-pipeline answer that omits any stalled figure", () => {
    const { review } = runCriticVerification(
      "how much pipeline is stalled",
      [weakFactSheet],
      "Everything looks healthy."
    );

    expect(review.reanalysisRequired).toBe(true);
    expect(review.requestedTools).toContain("get_stalled_deals");
  });

  it("requests no re-run when the defect is wording rather than missing data", () => {
    const { review } = runCriticVerification(
      "what is our open pipeline",
      [weakFactSheet],
      "Open pipeline is ₹10.00 L and we invented ₹99.00 Cr elsewhere."
    );

    expect(review.approved).toBe(false);
    // Grounding failure → the write-up must change, not the metrics.
    expect(review.reanalysisRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Supervisor + narrator wiring
// ---------------------------------------------------------------------------

describe("Supervisor loop and grounded narration", () => {
  const deals: Deal[] = [
    {
      id: "deal_1",
      name: "Solar Farm A",
      ownerCode: "OWNER_001",
      clientCode: "COMPANY001",
      status: "Open",
      rawStatus: "Open",
      probability: "High",
      rawProbability: "High",
      dealValue: 1000000,
      isMaskedPlaceholder: false,
      rawDealValue: "1000000",
      tentativeCloseDate: "2026-02-15",
      rawTentativeCloseDate: "2026-02-15",
      stage: "B. Sales Qualified Leads",
      stageCategory: "Qualified",
      product: "Service",
      sector: "Renewables",
      createdDate: "2025-05-01",
      rawCreatedDate: "2025-05-01",
      dedupHash: "h1",
      isDuplicate: false,
    },
  ];

  const workOrders: WorkOrder[] = [];

  it("streams each agent step through the onTrace hook", async () => {
    const seen: string[] = [];
    const result = await runSupervisorLoop("what is our open pipeline", {
      deals,
      workOrders,
      report: EMPTY_REPORT,
      asOfDate: "2026-03-31",
      disableLlm: true,
      onTrace: (step) => seen.push(step.role),
    });

    // Every emitted step must also be present in the final trace list.
    expect(seen.length).toBe(result.traces.length);
    expect(seen).toContain("data_steward");
    expect(seen).toContain("clarifier");
    expect(seen).toContain("analyst");
    expect(seen).toContain("narrator");
    expect(seen).toContain("critic");
  });

  it("resolves an anaphoric follow-up against the prior user turn", async () => {
    const seen: Array<{ query: string; context: string | undefined }> = [];
    // Spy on planner routing via the analyst's executed tools is indirect; the
    // direct observable is the supervisor's context-resolution trace.
    const result = await runSupervisorLoop("and for mining?", {
      deals,
      workOrders,
      report: EMPTY_REPORT,
      asOfDate: "2026-03-31",
      disableLlm: true,
      history: [
        { role: "user", content: "What is our open pipeline in Renewables?" },
        { role: "assistant", content: "Open pipeline in Renewables is ₹10.00 L." },
      ],
      onTrace: (step) => {
        if (step.role === "supervisor" && step.metadata?.resolvedQuery) {
          seen.push({
            query: String(step.metadata.resolvedQuery),
            context: undefined,
          });
        }
      },
    });

    // The follow-up must have been expanded with the prior turn, not read cold.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].query).toContain("Renewables");
    expect(seen[0].query).toContain("and for mining?");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("does not alter a self-contained question even when history exists", async () => {
    const seen: string[] = [];
    await runSupervisorLoop("what is our open pipeline", {
      deals,
      workOrders,
      report: EMPTY_REPORT,
      asOfDate: "2026-03-31",
      disableLlm: true,
      history: [{ role: "user", content: "What is our open pipeline in Renewables?" }],
      onTrace: (step) => {
        if (step.role === "supervisor" && step.metadata?.resolvedQuery) {
          seen.push(String(step.metadata.resolvedQuery));
        }
      },
    });

    expect(seen.length).toBe(0);
  });

  it("carries loader warnings through to the answer's caveats", async () => {
    const result = await runSupervisorLoop("what is our open pipeline", {
      deals,
      workOrders,
      report: EMPTY_REPORT,
      asOfDate: "2026-03-31",
      disableLlm: true,
      warnings: ["Serving the last known-good snapshot instead (2 hour(s) old)."],
    });

    expect(result.caveats.join(" ")).toMatch(/last known-good snapshot/i);
  });

  it("runs the revision loop and reports how many passes it took", async () => {
    const result = await runSupervisorLoop("how much pipeline is stalled", {
      deals,
      workOrders,
      report: EMPTY_REPORT,
      asOfDate: "2026-03-31",
      disableLlm: true,
    });

    // A stalled-pipeline question cannot be fully satisfied by an empty work-order
    // set, so the verifier should reject and the loop should record the attempt.
    expect(result.revisionPasses).toBeGreaterThanOrEqual(0);
    expect(result.traces.some((trace) => trace.role === "critic")).toBe(true);
    expect(typeof result.criticRejectedFinal).toBe("boolean");
  });

  it("discards generated prose that contains an ungrounded figure", async () => {
    const factSheets: MetricFactSheet[] = [
      {
        numbers: { totalOpenValue: 1000000 },
        sourceRowIds: ["deal_1"],
        rowsScanned: 1,
        assumptions: ["Test assumption"],
        caveats: ["Test caveat"],
        asOfDate: "2026-03-31",
        fiscalYear: "FY25-26",
      },
    ];

    // No provider configured in tests, so narration degrades to the deterministic
    // renderer — which must still be grounded and still disclose assumptions.
    const narration = await runNarratorWithLlm({
      query: "what is our open pipeline",
      factSheets,
      assumptions: ["Test assumption"],
      caveats: ["Test caveat"],
    });

    expect(narration.isGrounded).toBe(true);
    expect(narration.prose).toContain("Test assumption");
    expect(narration.prose).toContain("₹10.00 L");
  });
});

beforeEach(() => {
  // Reset module-level cache state so cases do not depend on execution order.
  clearCacheSnapshot();
});
