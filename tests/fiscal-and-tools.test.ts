import { describe, it, expect } from "vitest";
import {
  getIndianFiscalYear,
  getFiscalQuarter,
  resolveDateWindow,
  resolveIndianFiscalWindow,
} from "../lib/query/fiscal";
import { createDeterministicToolRegistry } from "../lib/tools/registry";
import { getAvailableProviderChain, createLanguageModel } from "../lib/llm/providers";
import { resolveOwnerCode } from "../lib/query/aliases";
import { Deal, WorkOrder } from "../lib/data/types";

describe("Fiscal Semantics & Tool Registry Coverage Suite", () => {
  const sampleDeals: Deal[] = [
    {
      id: "deal_1",
      name: "Solar Project Alpha",
      ownerCode: "OWNER_001",
      clientCode: "COMPANY001",
      status: "Open",
      rawStatus: "Open",
      probability: "High",
      rawProbability: "High",
      dealValue: 1000000,
      isMaskedPlaceholder: false,
      rawDealValue: "1000000",
      tentativeCloseDate: "2026-04-15",
      rawTentativeCloseDate: "2026-04-15",
      stage: "B. Sales Qualified Leads",
      stageCategory: "Qualified",
      product: "Spectra",
      sector: "Renewables",
      createdDate: "2025-05-01",
      rawCreatedDate: "2025-05-01",
      dedupHash: "hash1",
      isDuplicate: false,
    },
  ];

  const sampleWorkOrders: WorkOrder[] = [
    {
      id: "wo_1",
      workOrderNumber: "SDPL/FY25-26/001",
      clientCode: "WOCOMPANY_001",
      bdKamPersonnelCode: "OWNER_001",
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
      dedupHash: "wohash1",
      isDuplicate: false,
    },
  ];

  it("computes Indian fiscal years and quarters accurately", () => {
    expect(getIndianFiscalYear(new Date("2025-06-15"))).toBe("FY25-26");
    expect(getIndianFiscalYear(new Date("2026-02-15"))).toBe("FY25-26");
    expect(getIndianFiscalYear(new Date("2025-02-15"))).toBe("FY24-25");

    const q1 = getFiscalQuarter(new Date("2025-05-01"));
    expect(q1.quarter).toBe(1);

    const q2 = getFiscalQuarter(new Date("2025-08-01"));
    expect(q2.quarter).toBe(2);

    const q3 = getFiscalQuarter(new Date("2025-11-01"));
    expect(q3.quarter).toBe(3);

    const q4 = getFiscalQuarter(new Date("2026-02-01"));
    expect(q4.quarter).toBe(4);
  });

  it("resolves natural fiscal time expressions (this quarter, last quarter, FY25-26, 6 months)", () => {
    const tq = resolveDateWindow("this quarter", "2026-02-15");
    expect(tq.startDate).toBe("2026-01-01");
    expect(tq.endDate).toBe("2026-03-31");

    const lq = resolveDateWindow("last quarter", "2026-02-15");
    expect(lq.fiscalYear).toBe("FY25-26");

    const fy = resolveDateWindow("FY25-26");
    expect(fy.startDate).toBe("2025-04-01");
    expect(fy.endDate).toBe("2026-03-31");

    const m6 = resolveDateWindow("last 6 months", "2026-03-31");
    expect(m6.label).toBe("Last 6 Months");

    const alias = resolveIndianFiscalWindow("FY25-26");
    expect(alias.fiscalYear).toBe("FY25-26");
  });

  it("executes all tool registry endpoints deterministically", async () => {
    const registry = createDeterministicToolRegistry({
      deals: sampleDeals,
      workOrders: sampleWorkOrders,
      asOfDate: "2026-03-31",
    });

    const sAlias = await registry.resolve_sector_alias.execute({ query: "energy" });
    expect(sAlias.matchedSectors).toEqual(["Renewables", "Powerline"]);

    const fRes = await registry.resolve_fiscal_window.execute({ expression: "FY25-26" });
    expect(fRes.startDate).toBe("2025-04-01");

    const pipe = await registry.get_pipeline_health.execute({});
    expect(pipe.totalOpenValue).toBe(1000000);

    const stalled = await registry.get_stalled_deals.execute({});
    expect(stalled.stalledDealsCount).toBe(0);

    const rev = await registry.get_revenue_metrics.execute({});
    expect(rev.contractedOrderValueExclGst).toBe(1000000);

    const col = await registry.get_collections_and_ar.execute({});
    expect(col.totalBilledInclGst).toBe(944000);

    const ops = await registry.get_operational_metrics.execute({});
    expect(ops.totalWorkOrders).toBe(1);

    const cross = await registry.get_cross_board_scorecards.execute({});
    expect(cross.ownerScorecards.length).toBe(1);

    const conc = await registry.get_concentration_risk.execute({ topN: 5 });
    expect(conc.topClientsPipeline.length).toBe(1);

    const stuck = await registry.get_stuck_money_analysis.execute({});
    expect(stuck.totalBilledValueExclGst).toBe(800000);
  });

  it("provides available LLM provider chain and returns mock model gracefully", () => {
    const chain = getAvailableProviderChain();
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.some((p) => p.providerName === "mock")).toBe(true);

    const mockModel = createLanguageModel({ providerName: "mock", modelName: "mock" });
    expect(mockModel).toBeNull();
  });

  it("resolves owner codes consistently", () => {
    expect(resolveOwnerCode("owner_001")).toBe("OWNER_001");
  });
});
