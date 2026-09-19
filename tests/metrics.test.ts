import { describe, it, expect } from "vitest";
import { computePipelineHealth, getStalledDeals } from "../lib/metrics/pipeline";
import { computeRevenueMetrics } from "../lib/metrics/revenue";
import { computeCollectionsMetrics } from "../lib/metrics/collections";
import { computeOperationsMetrics } from "../lib/metrics/operations";
import { computeCrossBoardMetrics } from "../lib/metrics/cross-board";
import { computeConcentrationRisk } from "../lib/metrics/concentration";
import { computeStuckMoney } from "../lib/metrics/stuck-money";
import { Deal, WorkOrder } from "../lib/data/types";

describe("Business Metrics Deterministic Computation Suite", () => {
  const sampleDeals: Deal[] = [
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
      tentativeCloseDate: "2026-04-15",
      rawTentativeCloseDate: "2026-04-15",
      stage: "B. Sales Qualified Leads",
      stageCategory: "Qualified",
      product: "Service + Spectra",
      sector: "Renewables",
      createdDate: "2025-05-01",
      rawCreatedDate: "2025-05-01",
      dedupHash: "hash1",
      isDuplicate: false,
    },
    {
      id: "deal_2",
      name: "Wind Survey B",
      ownerCode: "OWNER_002",
      clientCode: "COMPANY002",
      status: "Open",
      rawStatus: "Open",
      probability: "Medium",
      rawProbability: "Medium",
      dealValue: 500000,
      isMaskedPlaceholder: false,
      rawDealValue: "500000",
      tentativeCloseDate: "2025-10-01", // Past asOf 2026-03-31 -> Stalled!
      rawTentativeCloseDate: "2025-10-01",
      stage: "C. Proposal Sent",
      stageCategory: "Proposal",
      product: "Service",
      sector: "Renewables",
      createdDate: "2025-04-01",
      rawCreatedDate: "2025-04-01",
      dedupHash: "hash2",
      isDuplicate: false,
    },
    {
      id: "deal_3",
      name: "Powerline Inspection C",
      ownerCode: "OWNER_001",
      clientCode: "COMPANY003",
      status: "Won",
      rawStatus: "Won",
      probability: "High",
      rawProbability: "High",
      dealValue: 2000000,
      isMaskedPlaceholder: false,
      rawDealValue: "2000000",
      tentativeCloseDate: "2025-08-01",
      rawTentativeCloseDate: "2025-08-01",
      stage: "G. Project Won",
      stageCategory: "Won",
      product: "Spectra",
      sector: "Powerline",
      createdDate: "2025-03-01",
      rawCreatedDate: "2025-03-01",
      dedupHash: "hash3",
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
      natureOfWork: "Solar Thermography & Spectra DMO",
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
    {
      id: "wo_2",
      workOrderNumber: "SDPL/FY25-26/002",
      clientCode: "WOCOMPANY_002",
      bdKamPersonnelCode: "OWNER_002",
      sector: "Powerline",
      natureOfWork: "Transmission Line LiDAR",
      poDate: "2025-04-01",
      rawPoDate: "2025-04-01",
      dataDeliveryDate: null,
      rawDeliveryDate: null,
      orderValueExclGst: 500000,
      orderValueInclGst: 590000,
      billedAmountExclGst: 600000,
      billedAmountInclGst: 708000,
      collectedAmountInclGst: 708000,
      amountToBeBilledExclGst: -100000, // Over-billed negative!
      isOverBilled: true,
      uncollectedAmountInclGst: 0,
      executionStatus: "Not Started", // Long past PO date!
      billingStatus: "Billed",
      poQuantity: { value: 50, unit: "km", raw: "50km" },
      deliveredQuantity: { value: 0, unit: null, raw: "-" },
      invoiceNumber: "INV-002",
      hasDeliveryBeforePoAnomaly: false,
      dedupHash: "wohash2",
      isDuplicate: false,
    },
  ];

  it("calculates pipeline health metrics with exact configurable weights", () => {
    const pipe = computePipelineHealth(sampleDeals, { asOfDate: "2026-03-31" });
    // Open deals: deal_1 (1000000, High: 0.7 -> 700000) + deal_2 (500000, Medium: 0.4 -> 200000) = 1500000 total, 900000 weighted
    expect(pipe.totalOpenValue).toBe(1500000);
    expect(pipe.weightedPipelineValue).toBe(900000);
    expect(pipe.openDealsCount).toBe(2);
    expect(pipe.meanDealSize).toBe(750000);
    expect(pipe.breakdownBySector["Renewables"].openValue).toBe(1500000);
  });

  it("identifies stalled deals past the as-of date correctly", () => {
    const stalled = getStalledDeals(sampleDeals, { asOfDate: "2026-03-31" });
    // deal_2 close date 2025-10-01 is past 2026-03-31
    expect(stalled.stalledDealsCount).toBe(1);
    expect(stalled.stalledDeals[0].dealName).toBe("Wind Survey B");
    expect(stalled.totalStalledValue).toBe(500000);
  });

  it("calculates revenue metrics separating contracted, billed, and collected amounts", () => {
    const rev = computeRevenueMetrics(sampleWorkOrders, { asOfDate: "2026-03-31" });
    expect(rev.contractedOrderValueExclGst).toBe(1500000);
    expect(rev.contractedOrderValueInclGst).toBe(1770000);
    expect(rev.billedAmountExclGst).toBe(1400000);
    expect(rev.collectedAmountInclGst).toBe(1208000);
    expect(rev.unbilledContractValueExclGst).toBe(100000);
  });

  it("computes collections, collection efficiency %, and AR priority ranking", () => {
    const col = computeCollectionsMetrics(sampleWorkOrders, { asOfDate: "2026-03-31" });
    expect(col.totalBilledInclGst).toBe(1652000);
    expect(col.totalCollectedInclGst).toBe(1208000);
    expect(col.totalOutstandingArInclGst).toBe(444000);
    // Overall efficiency: 1208000 / 1652000 = 73.1%
    expect(col.overallCollectionEfficiencyPct).toBe(73.1);
    expect(col.arPriorityAccounts.length).toBe(1);
    expect(col.arPriorityAccounts[0].clientCode).toBe("WOCOMPANY_001");
    expect(col.overBilledAccounts.length).toBe(1);
    expect(col.overBilledAccounts[0].amountToBeBilledExclGst).toBe(-100000);
  });

  it("detects operational execution status mix, unstarted PO risks, and software attach rate", () => {
    const ops = computeOperationsMetrics(sampleWorkOrders, { asOfDate: "2026-03-31" });
    expect(ops.totalWorkOrders).toBe(2);
    expect(ops.executionStatusBreakdown["Completed"]).toBe(1);
    expect(ops.executionStatusBreakdown["Not Started"]).toBe(1);
    expect(ops.notStartedWithPastPoCount).toBe(1);
    expect(ops.softwareAttachCount).toBe(1);
    expect(ops.softwareAttachRatePct).toBe(50);
  });

  it("computes cross-board scorecards across Owners and Sectors while enforcing company non-join", () => {
    const cross = computeCrossBoardMetrics(sampleDeals, sampleWorkOrders, {
      asOfDate: "2026-03-31",
    });
    expect(cross.ownerScorecards.length).toBe(2);
    expect(cross.sectorScorecards.length).toBe(2);
    expect(cross.explicitNonJoinCompanyRule).toContain("strictly forbidden");
  });

  it("calculates pipeline and order book concentration risk shares", () => {
    const conc = computeConcentrationRisk(sampleDeals, sampleWorkOrders, {
      asOfDate: "2026-03-31",
    });
    expect(conc.topClientsPipeline.length).toBe(2);
    expect(conc.topClientsPipeline[0].entity).toBe("COMPANY001");
    expect(conc.topClientsPipeline[0].sharePercentage).toBe(66.7);
    expect(conc.pipelineTop3ClientSharePct).toBe(100);
  });

  it("traces stuck money conversion chain from won deals to uncollected AR", () => {
    const stuck = computeStuckMoney(sampleDeals, sampleWorkOrders, { asOfDate: "2026-03-31" });
    expect(stuck.wonDealsValueExclGst).toBe(2000000);
    expect(stuck.totalBilledValueExclGst).toBe(1400000);
    expect(stuck.uncollectedArValueInclGst).toBe(444000);
    expect(stuck.overBilledNegativeAdjustment).toBe(-100000);
  });
});
