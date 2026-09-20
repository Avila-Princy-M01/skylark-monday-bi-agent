import { describe, it, expect } from "vitest";
import { runSupervisorLoop } from "../lib/agents/supervisor";
import { runClarifier } from "../lib/agents/clarifier";
import { runDataSteward } from "../lib/agents/data-steward";
import { runAnalyst } from "../lib/agents/analyst";
import { runCriticVerification } from "../lib/agents/critic";
import { BudgetTracker } from "../lib/agents/budgets";
import { routeDegradedQuery } from "../lib/agents/degraded-router";
import { Deal, WorkOrder, DataQualityReport } from "../lib/data/types";

describe("Multi-Agent Behavioral & Delegation Suite", () => {
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
      tentativeCloseDate: "2026-02-15",
      rawTentativeCloseDate: "2026-02-15",
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

  const sampleReport: DataQualityReport = {
    totalRawDealsRows: 3,
    totalValidDeals: 1,
    totalRawWorkOrdersRows: 1,
    totalValidWorkOrders: 1,
    junkRowsDropped: 1,
    emptyColumnsExcluded: ["Close Date (A)"],
    maskedPlaceholderValuesCount: 1,
    maskedPlaceholderTotalSumExcluded: 1.2332,
    overBilledRecordsCount: 0,
    dateAnomaliesCount: 0,
    statusStageContradictionsCount: 0,
    nearDuplicatesCount: 0,
    issues: [],
    generatedAt: "2026-03-31T00:00:00.000Z",
  };

  it("Data Steward generates data quality caveats from audit report", () => {
    const steward = runDataSteward(sampleDeals, sampleWorkOrders, sampleReport);
    expect(steward.isFresh).toBe(true);
    expect(steward.caveats.length).toBeGreaterThanOrEqual(2);
    expect(steward.caveats.some((c) => c.includes("junk/header"))).toBe(true);
    expect(steward.caveats.some((c) => c.includes("Close Date (A)"))).toBe(true);
  });

  it("Clarifier detects ambiguous revenue questions and generates quick reply choices", () => {
    const { verdict } = runClarifier("what is our revenue?");
    expect(verdict.isAmbiguous).toBe(true);
    expect(verdict.options?.length).toBe(3);
    expect(verdict.options?.[0].value).toBe("contracted");
    expect(verdict.options?.[1].value).toBe("billed");
    expect(verdict.options?.[2].value).toBe("collected");
  });

  it("Clarifier resolves composite sector aliases with stated assumptions", () => {
    const { verdict } = runClarifier("How is energy pipeline performing?");
    expect(verdict.isAmbiguous).toBe(false);
    expect(verdict.assumptions.some((a) => a.includes("Renewables + Powerline"))).toBe(true);
  });

  it("Analyst executes tools and self-corrects on zero-result filters", async () => {
    const budget = new BudgetTracker();
    const result = await runAnalyst(
      "pipeline in Mining sector", // sampleDeals only has Renewables
      sampleDeals,
      sampleWorkOrders,
      budget,
      { asOfDate: "2026-03-31" }
    );
    expect(result.executedToolNames).toContain("get_pipeline_health");
    expect(result.selfCorrections.length).toBeGreaterThan(0);
    expect(result.selfCorrections[0]).toContain("returned 0 rows");
  });

  it("Critic verifier approves complete grounded prose with 10/10 score", () => {
    const factSheet = {
      numbers: { totalOpenValue: 1000000, openDealsCount: 1 },
      sourceRowIds: ["deal_1"],
      rowsScanned: 1,
      assumptions: [],
      caveats: [],
      asOfDate: "2026-03-31",
      fiscalYear: "FY25-26",
    };
    const prose = "Total open value is ₹10.00 L across 1 open deals.";
    const { review } = runCriticVerification("pipeline health", [factSheet], prose);
    expect(review.approved).toBe(true);
    expect(review.score).toBe(10);
  });

  it("Critic verifier rejects ungrounded hallucinations and provides corrective feedback", () => {
    const factSheet = {
      numbers: { totalOpenValue: 1000000 },
      sourceRowIds: ["deal_1"],
      rowsScanned: 1,
      assumptions: [],
      caveats: [],
      asOfDate: "2026-03-31",
      fiscalYear: "FY25-26",
    };
    const hallucinatedProse =
      "Total open value is ₹10.00 L and we have ₹85.00 Cr in ungrounded pipeline.";
    const { review } = runCriticVerification("pipeline health", [factSheet], hallucinatedProse);
    expect(review.approved).toBe(false);
    expect(review.groundingFailures?.length).toBeGreaterThan(0);
    expect(review.feedback).toContain("Hallucination/Ungrounded");
  });

  it("Supervisor completes full end-to-end delegation loop within step and time budgets", async () => {
    const result = await runSupervisorLoop("What is our open pipeline and stalled deals?", {
      deals: sampleDeals,
      workOrders: sampleWorkOrders,
      report: sampleReport,
      asOfDate: "2026-03-31",
    });

    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(50);
    expect(result.traces.length).toBeGreaterThanOrEqual(4);
    expect(result.factSheets.length).toBeGreaterThan(0);
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it("Degraded mode router provides reliable deterministic fallback when LLMs are down", () => {
    const fallback = routeDegradedQuery(
      "pipeline status",
      sampleDeals,
      sampleWorkOrders,
      "2026-03-31"
    );
    expect(fallback.isDegradedFallback).toBe(true);
    expect(fallback.matchedCategory).toBe("pipeline");
    expect(fallback.answer).toContain("Deterministic Fallback");
  });

  it("Supervisor does not treat natural language queries as fake sector filters and computes non-zero revenue", async () => {
    const result = await runSupervisorLoop(
      "Show me contracted vs billed vs collected revenue for FY25-26",
      {
        deals: sampleDeals,
        workOrders: sampleWorkOrders,
        report: sampleReport,
        asOfDate: "2026-03-31",
        disableLlm: true,
      }
    );

    const revFactSheet = result.factSheets.find(
      (fs) => fs.numbers.contractedOrderValueExclGst !== undefined
    );
    expect(revFactSheet).toBeDefined();
    expect(revFactSheet?.numbers.contractedOrderValueExclGst).toBe(1000000);
    expect(revFactSheet?.numbers.billedAmountExclGst).toBe(800000);
    expect(revFactSheet?.numbers.collectedAmountInclGst).toBe(500000);
    expect(revFactSheet?.numbers.workOrderCount).toBe(1);
    const selfCorrectTrace = result.traces.find((t) => t.title.includes("self-correction"));
    expect(selfCorrectTrace).toBeUndefined();
  });

  it("Supervisor handles stuck money queries cleanly without negative adjustment hallucination flags", async () => {
    const result = await runSupervisorLoop(
      "Where is the money stuck across won deals, unbilled backlog, and uncollected AR?",
      {
        deals: sampleDeals,
        workOrders: sampleWorkOrders,
        report: sampleReport,
        asOfDate: "2026-03-31",
        disableLlm: true,
      }
    );

    expect(result.answer).toBeDefined();
    const criticTraces = result.traces.filter((t) => t.role === "critic");
    for (const trace of criticTraces) {
      expect(trace.content).not.toContain("Hallucination/Ungrounded numbers detected: 108312");
    }

    const stuckFactSheet = result.factSheets.find(
      (fs) => fs.numbers.unbilledBacklogValueExclGst !== undefined
    );
    expect(stuckFactSheet).toBeDefined();
    expect(stuckFactSheet?.numbers.unbilledBacklogValueExclGst).toBe(200000);
    expect(stuckFactSheet?.numbers.uncollectedArValueInclGst).toBe(444000);
  });

  it("Supervisor halts immediately on ambiguous queries without answering until operator selects an option", async () => {
    const result = await runSupervisorLoop("what is our revenue?", {
      deals: sampleDeals,
      workOrders: sampleWorkOrders,
      report: sampleReport,
      asOfDate: "2026-03-31",
      disableLlm: true,
    });

    // Answer must be empty so no premature or speculative answer is shown
    expect(result.answer).toBe("");
    expect(result.clarifyingVerdict?.isAmbiguous).toBe(true);
    expect(result.clarifyingVerdict?.options?.length).toBe(3);
    expect(result.factSheets.length).toBe(0);

    const pauseTrace = result.traces.find((t) => t.title.includes("paused execution"));
    expect(pauseTrace).toBeDefined();
    expect(pauseTrace?.content).toContain("Execution paused until operator selects a resolution");

    // Next turn: Operator clarifies by choosing an option
    const resolvedResult = await runSupervisorLoop("Billed Revenue (Invoiced to date)", {
      deals: sampleDeals,
      workOrders: sampleWorkOrders,
      report: sampleReport,
      asOfDate: "2026-03-31",
      disableLlm: true,
      history: [
        { role: "user", content: "what is our revenue?" },
        {
          role: "assistant",
          content:
            "[Clarification requested: How would you like revenue defined for this inquiry?]",
        },
      ],
    });

    expect(resolvedResult.clarifyingVerdict?.isAmbiguous).toBeFalsy();
    expect(resolvedResult.answer.length).toBeGreaterThan(0);
    expect(resolvedResult.factSheets.length).toBeGreaterThan(0);
  });
});
