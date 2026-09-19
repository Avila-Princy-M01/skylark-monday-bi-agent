import { describe, it, expect } from "vitest";
import { computePipelineHealth } from "../lib/metrics/pipeline";
import { computeRevenueMetrics } from "../lib/metrics/revenue";
import { computeCollectionsMetrics } from "../lib/metrics/collections";
import { Deal, WorkOrder } from "../lib/data/types";

describe("Golden-Answer Invariance Suite", () => {
  const goldenDeals: Deal[] = [
    {
      id: "golden_deal_1",
      name: "Solar MegaProject",
      ownerCode: "OWNER_001",
      clientCode: "COMPANY_A",
      status: "Open",
      rawStatus: "Open",
      probability: "High",
      rawProbability: "High",
      dealValue: 5000000,
      isMaskedPlaceholder: false,
      rawDealValue: "5000000",
      tentativeCloseDate: "2026-03-15",
      rawTentativeCloseDate: "2026-03-15",
      stage: "B. Sales Qualified Leads",
      stageCategory: "Qualified",
      product: "Spectra",
      sector: "Renewables",
      createdDate: "2025-05-01",
      rawCreatedDate: "2025-05-01",
      dedupHash: "ghash1",
      isDuplicate: false,
    },
    {
      id: "golden_deal_2",
      name: "Powerline Drone LiDAR",
      ownerCode: "OWNER_002",
      clientCode: "COMPANY_B",
      status: "Open",
      rawStatus: "Open",
      probability: "Medium",
      rawProbability: "Medium",
      dealValue: 2000000,
      isMaskedPlaceholder: false,
      rawDealValue: "2000000",
      tentativeCloseDate: "2026-04-01",
      rawTentativeCloseDate: "2026-04-01",
      stage: "C. Proposal Sent",
      stageCategory: "Proposal",
      product: "Service",
      sector: "Powerline",
      createdDate: "2025-06-01",
      rawCreatedDate: "2025-06-01",
      dedupHash: "ghash2",
      isDuplicate: false,
    },
  ];

  const goldenWorkOrders: WorkOrder[] = [
    {
      id: "golden_wo_1",
      workOrderNumber: "SDPL/FY25-26/100",
      clientCode: "WOCOMPANY_100",
      bdKamPersonnelCode: "OWNER_001",
      sector: "Renewables",
      natureOfWork: "Solar Thermography",
      poDate: "2025-06-01",
      rawPoDate: "2025-06-01",
      dataDeliveryDate: "2025-06-15",
      rawDeliveryDate: "2025-06-15",
      orderValueExclGst: 3000000,
      orderValueInclGst: 3540000,
      billedAmountExclGst: 3000000,
      billedAmountInclGst: 3540000,
      collectedAmountInclGst: 2500000,
      amountToBeBilledExclGst: 0,
      isOverBilled: false,
      uncollectedAmountInclGst: 1040000,
      executionStatus: "Completed",
      billingStatus: "Billed",
      poQuantity: { value: 100, unit: "MW", raw: "100MW" },
      deliveredQuantity: { value: 100, unit: "MW", raw: "100MW" },
      invoiceNumber: "INV-100",
      hasDeliveryBeforePoAnomaly: false,
      dedupHash: "gwohash1",
      isDuplicate: false,
    },
  ];

  it("yields identical golden figures for Pipeline across consecutive invocations", () => {
    const run1 = computePipelineHealth(goldenDeals, { asOfDate: "2026-03-31" });
    const run2 = computePipelineHealth(goldenDeals, { asOfDate: "2026-03-31" });
    expect(run1.totalOpenValue).toBe(7000000);
    expect(run1.weightedPipelineValue).toBe(4300000); // 5M * 0.7 + 2M * 0.4 = 3.5M + 0.8M = 4.3M
    expect(run1.totalOpenValue).toBe(run2.totalOpenValue);
    expect(run1.weightedPipelineValue).toBe(run2.weightedPipelineValue);
  });

  it("yields identical golden figures for Revenue and Collections across consecutive invocations", () => {
    const rev1 = computeRevenueMetrics(goldenWorkOrders, { asOfDate: "2026-03-31" });
    const col1 = computeCollectionsMetrics(goldenWorkOrders, { asOfDate: "2026-03-31" });
    expect(rev1.contractedOrderValueExclGst).toBe(3000000);
    expect(col1.totalOutstandingArInclGst).toBe(1040000);
    expect(col1.overallCollectionEfficiencyPct).toBe(70.6); // 2.5M / 3.54M = 70.62% -> 70.6%
  });
});
