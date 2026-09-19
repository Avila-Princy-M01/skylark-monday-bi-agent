import { describe, it, expect, vi, afterEach } from "vitest";
import { createMondaySource } from "../lib/monday/factory";
import { MondayConfig } from "../lib/config";
import { MondayGraphQLSource } from "../lib/monday/graphql-source";
import { MondayMcpSource } from "../lib/monday/mcp-source";
import { routeDegradedQuery } from "../lib/agents/degraded-router";
import { validateNumericGrounding } from "../lib/narrate/numeric-guard";
import { Deal, WorkOrder } from "../lib/data/types";

/**
 * Covers the two lowest-coverage modules in the project:
 *   - the transport factory, which makes GraphQL/MCP a config choice
 *   - the degraded router, which is the safety net when no LLM is reachable
 *
 * The degraded path matters disproportionately: it is what answers the
 * reviewer's question if every provider key is missing or rate-limited.
 */

const GRAPHQL_CONFIG: MondayConfig = {
  apiToken: "token",
  dealsBoardId: "111",
  workOrdersBoardId: "222",
  apiVersion: "2025-04-01",
  dataSource: "graphql",
  mcpServerUrl: "https://mcp.monday.com/mcp",
};

const MCP_CONFIG: MondayConfig = { ...GRAPHQL_CONFIG, dataSource: "mcp" };

function deal(id: string, sector = "Renewables"): Deal {
  return {
    id,
    name: `Deal ${id}`,
    ownerCode: "OWNER_1",
    clientCode: "COMPANY001",
    status: "Open",
    rawStatus: "Open",
    probability: "High",
    rawProbability: "High",
    dealValue: 1000000,
    isMaskedPlaceholder: false,
    rawDealValue: "1000000",
    // In the past relative to the as-of date, so the stalled metric is non-zero.
    tentativeCloseDate: "2025-12-01",
    rawTentativeCloseDate: "2025-12-01",
    stage: "B. Sales Qualified Leads",
    stageCategory: "Qualified",
    product: "Service",
    sector,
    createdDate: "2025-05-01",
    rawCreatedDate: "2025-05-01",
    dedupHash: id,
    isDuplicate: false,
  };
}

function workOrder(id: string): WorkOrder {
  return {
    id,
    workOrderNumber: `SDPL/FY25-26/${id}`,
    clientCode: "WOCOMPANY_001",
    bdKamPersonnelCode: "OWNER_1",
    sector: "Renewables",
    natureOfWork: "Solar Thermography",
    poDate: "2025-06-01",
    rawPoDate: "2025-06-01",
    dataDeliveryDate: "2025-06-15",
    rawDeliveryDate: "2025-06-15",
    orderValueExclGst: 1000000,
    orderValueInclGst: 1180000,
    billedAmountExclGst: 800000,
    billedAmountInclGst: 944000,
    collectedAmountInclGst: 500000,
    amountToBeBilledExclGst: 200000,
    isOverBilled: false,
    uncollectedAmountInclGst: 444000,
    executionStatus: "Completed",
    billingStatus: "Partially Billed",
    poQuantity: { value: 100, unit: "MW", raw: "100MW" },
    deliveredQuantity: { value: 100, unit: "MW", raw: "100MW" },
    invoiceNumber: "INV-001",
    hasDeliveryBeforePoAnomaly: false,
    dedupHash: id,
    isDuplicate: false,
  };
}

const DEALS = [deal("d1"), deal("d2", "Mining")];
const WORK_ORDERS = [workOrder("w1"), workOrder("w2")];
const AS_OF = "2026-03-31";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("monday.com transport factory", () => {
  it("builds a GraphQL source by default", () => {
    const source = createMondaySource(GRAPHQL_CONFIG);
    expect(source).toBeInstanceOf(MondayGraphQLSource);
    expect(source.kind).toBe("graphql");
  });

  it("builds an MCP source when the transport is switched by config", () => {
    const source = createMondaySource(MCP_CONFIG);
    expect(source).toBeInstanceOf(MondayMcpSource);
    expect(source.kind).toBe("mcp");
  });

  it("reads the transport from MONDAY_DATA_SOURCE when no config is passed", () => {
    vi.stubEnv("MONDAY_API_TOKEN", "token");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "111");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "222");
    vi.stubEnv("MONDAY_DATA_SOURCE", "mcp");

    expect(createMondaySource().kind).toBe("mcp");

    vi.stubEnv("MONDAY_DATA_SOURCE", "graphql");
    expect(createMondaySource().kind).toBe("graphql");
  });

  it("exposes an identical interface regardless of transport", () => {
    for (const source of [createMondaySource(GRAPHQL_CONFIG), createMondaySource(MCP_CONFIG)]) {
      expect(typeof source.getBoardSchema).toBe("function");
      expect(typeof source.fetchAllItems).toBe("function");
      expect(typeof source.buildColumnMapping).toBe("function");
    }
  });
});

describe("Deterministic degraded-mode router", () => {
  const cases: Array<{ query: string; category: string }> = [
    { query: "which deals are stalled", category: "stalled_pipeline" },
    { query: "what is our open pipeline", category: "pipeline" },
    { query: "what is our collection efficiency", category: "collections" },
    { query: "show contracted revenue", category: "revenue" },
    { query: "what is the software attach rate", category: "operations" },
    { query: "top client concentration", category: "concentration" },
    { query: "where is the money stuck", category: "stuck_money" },
    { query: "how are we doing overall", category: "cross_board" },
  ];

  it.each(cases)("routes '$query' to the $category metric", ({ query, category }) => {
    const result = routeDegradedQuery(query, DEALS, WORK_ORDERS, AS_OF);
    expect(result.matchedCategory).toBe(category);
    expect(result.factSheets.length).toBeGreaterThan(0);
    expect(result.isDegradedFallback).toBe(true);
  });

  it("states plainly that the answer came from degraded mode", () => {
    const result = routeDegradedQuery("what is our open pipeline", DEALS, WORK_ORDERS, AS_OF);
    // The reviewer must never mistake a degraded answer for a full one.
    expect(result.answer).toMatch(/LLM inference is currently unavailable/i);
  });

  it("never emits a number that is not present in a computed fact sheet", () => {
    for (const { query } of cases) {
      const result = routeDegradedQuery(query, DEALS, WORK_ORDERS, AS_OF);
      const grounding = validateNumericGrounding(result.answer, result.factSheets);
      expect(grounding.isGrounded).toBe(true);
      expect(grounding.unverifiedNumbers).toEqual([]);
    }
  });

  it("answers rather than throwing when both boards are empty", () => {
    const result = routeDegradedQuery("what is our open pipeline", [], [], AS_OF);
    expect(result.factSheets.length).toBeGreaterThan(0);
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("combines several metrics for an unrecognised question", () => {
    const result = routeDegradedQuery("give me everything", DEALS, WORK_ORDERS, AS_OF);
    expect(result.matchedCategory).toBe("cross_board");
    // Pipeline + revenue + collections, so a vague question still lands somewhere useful.
    expect(result.factSheets.length).toBeGreaterThanOrEqual(3);
  });
});
