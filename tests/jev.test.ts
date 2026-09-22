import { describe, it, expect, vi } from "vitest";
import { jevSystemOne, jevChoice, jevNoul } from "../lib/jev/client";
import { createAnalystPlan } from "../lib/agents/planner";
import { runClarifierWithLlm } from "../lib/agents/clarifier";
import { METRIC_TOOL_NAMES } from "../lib/tools/registry";
import { JevConfig } from "../lib/config";

const mockJevConfig: JevConfig = {
  apiKey: "test-jev-key",
  baseURL: "https://api.typesafe.ai/v1",
  modelName: "jev-latest",
};

describe("Jev (TypeSafe AI) System-1 Client", () => {
  it("executes a parallel systemone choice question correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        model: "systemone",
        results: [
          {
            name: "primaryTool",
            type: "choice",
            value: "get_pipeline_health",
            confidence: 0.98,
            probabilities: { get_pipeline_health: 0.98, get_revenue_metrics: 0.02 },
          },
        ],
      }),
    });

    const response = await jevSystemOne(
      "what is my total open pipeline?",
      [
        {
          name: "primaryTool",
          type: "choice",
          question: "Which tool directly computes this?",
          options: METRIC_TOOL_NAMES,
        },
      ],
      { fetchImpl: mockFetch as unknown as typeof fetch, config: mockJevConfig }
    );

    expect(response).not.toBeNull();
    expect(response?.results[0]?.value).toBe("get_pipeline_health");
    expect(response?.results[0]?.confidence).toBe(0.98);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.typesafe.ai/v1/systemone",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-jev-key",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("evaluates a single choice helper with confidence", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            name: "metricChoice",
            type: "choice",
            value: "get_stalled_deals",
            confidence: 0.95,
          },
        ],
      }),
    });

    const result = await jevChoice(
      "show me stalled deals",
      "metricChoice",
      "Which metric tool?",
      METRIC_TOOL_NAMES,
      { fetchImpl: mockFetch as unknown as typeof fetch, config: mockJevConfig }
    );

    expect(result).toEqual({
      choice: "get_stalled_deals",
      confidence: 0.95,
      probabilities: undefined,
    });
  });

  it("evaluates a boolean noul helper with calibrated probability", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            name: "isAmbiguous",
            type: "noul",
            value: true,
            confidence: 0.92,
          },
        ],
      }),
    });

    const result = await jevNoul(
      "what is our revenue?",
      "isAmbiguous",
      "Is this query ambiguous between revenue definitions?",
      { fetchImpl: mockFetch as unknown as typeof fetch, config: mockJevConfig }
    );

    expect(result).toEqual({
      result: true,
      confidence: 0.92,
      probabilities: undefined,
    });
  });

  it("handles HTTP errors gracefully and returns null without throwing", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = await jevChoice("test query", "tool", "Which tool?", METRIC_TOOL_NAMES, {
      fetchImpl: mockFetch as unknown as typeof fetch,
      config: mockJevConfig,
    });

    expect(result).toBeNull();
  });
});

describe("Agent Orchestration with Jev Wiring", () => {
  it("planner delegates to Jev and records source: 'jev' when Jev returns a decision", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            name: "primaryTool",
            type: "choice",
            value: "get_stuck_money_analysis",
            confidence: 0.96,
          },
        ],
      }),
    });

    const { plan, trace } = await createAnalystPlan("where is the money stuck?", {
      asOfDate: "2026-03-31",
      fetchImpl: mockFetch as unknown as typeof fetch,
      jevConfig: mockJevConfig,
    });

    expect(plan.primaryTool).toBe("get_stuck_money_analysis");
    expect(plan.source).toBe("jev");
    expect(plan.rationale).toContain("Jev System-1 decision model");
    expect(trace.title).toContain("Jev System-1");
  });

  it("clarifier uses Jev Noul decision to detect revenue ambiguity in sub-50ms", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            name: "isAmbiguous",
            type: "noul",
            value: true,
            confidence: 0.94,
          },
        ],
      }),
    });

    const { verdict, trace } = await runClarifierWithLlm("what is revenue?", {
      fetchImpl: mockFetch as unknown as typeof fetch,
      jevConfig: mockJevConfig,
    });

    expect(verdict.isAmbiguous).toBe(true);
    expect(verdict.options?.length).toBeGreaterThan(0);
    expect(trace.metadata?.provider).toBe("jev");
    expect(trace.metadata?.mode).toBe("jev_system1");
  });
});
