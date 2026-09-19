import { describe, it, expect } from "vitest";
import {
  extractNumbersFromProse,
  parseTokenToNumber,
  validateNumericGrounding,
  renderDeterministicFallback,
} from "../lib/narrate/numeric-guard";
import { MetricFactSheet } from "../lib/data/types";

describe("Numeric Grounding Guard & Anti-Hallucination Bot", () => {
  const verifiedFactSheet: MetricFactSheet = {
    numbers: {
      totalOpenValue: 1500000,
      weightedPipelineValue: 900000,
      openDealsCount: 2,
      collectionEfficiencyPct: 73.1,
      totalOutstandingArInclGst: 444000,
    },
    sourceRowIds: ["deal_1", "deal_2"],
    rowsScanned: 2,
    assumptions: ["Standard Indian Fiscal Year 2025-26"],
    caveats: ["Masked values excluded"],
    asOfDate: "2026-03-31",
    fiscalYear: "FY25-26",
  };

  it("extracts numeric tokens accurately from prose", () => {
    const text =
      "Total pipeline is ₹15.00 L with a weighted value of ₹9.00 L and 73.1% efficiency on 2 deals.";
    const tokens = extractNumbersFromProse(text);
    expect(tokens).toContain("₹15.00 L");
    expect(tokens).toContain("₹9.00 L");
    expect(tokens).toContain("73.1%");
    expect(tokens).toContain("2");
  });

  it("parses diverse currency and percentage tokens to normalized numbers", () => {
    expect(parseTokenToNumber("₹1.50 Cr")).toBe(15000000);
    expect(parseTokenToNumber("₹15.00 L")).toBe(1500000);
    expect(parseTokenToNumber("73.1%")).toBe(73.1);
    expect(parseTokenToNumber("444000")).toBe(444000);
    expect(parseTokenToNumber("50k")).toBe(50000);
  });

  it("approves prose when all figures are strictly grounded in verified fact sheet", () => {
    const validProse =
      "In FY25-26 as of 2026-03-31, we audited 2 deals. Total open value is ₹15.00 L and collection efficiency is 73.1% with ₹444000 in AR.";
    const result = validateNumericGrounding(validProse, [verifiedFactSheet]);
    expect(result.isGrounded).toBe(true);
    expect(result.unverifiedNumbers.length).toBe(0);
  });

  it("approves natural language prose containing calendar dates, fiscal years, and numbered bullets", () => {
    const naturalProse = `
      Executive Summary:
      As of March 31, 2026, for FY26 Q4, we have audited 2 deals.
      1. Direct answer: Total open pipeline stands at ₹15.00 L.
      2. Core performance: Collection efficiency achieved is 73.1%.
      3. Risk posture: Total outstanding AR is ₹444000.
    `;
    const result = validateNumericGrounding(naturalProse, [verifiedFactSheet]);
    expect(result.isGrounded).toBe(true);
    expect(result.unverifiedNumbers).toEqual([]);
  });

  it("intercepts and rejects ungrounded hallucinated numbers", () => {
    const hallucinatedProse =
      "Total open value is ₹15.00 L, but we also generated ₹99.50 Cr in phantom pipeline with 99.9% win rate.";
    const result = validateNumericGrounding(hallucinatedProse, [verifiedFactSheet]);
    expect(result.isGrounded).toBe(false);
    expect(result.unverifiedNumbers).toContain("₹99.50 Cr");
    expect(result.unverifiedNumbers).toContain("99.9%");
    expect(result.fallbackTemplateProse).toBeDefined();
    expect(result.fallbackTemplateProse).toContain("Deterministic Fallback");
  });

  it("renders deterministic fallback with verified figures when hallucination occurs", () => {
    const rendered = renderDeterministicFallback([verifiedFactSheet]);
    expect(rendered).toContain("Executive Business Intelligence Summary (Deterministic Fallback)");
    expect(rendered).toContain("₹15.00 L");
    expect(rendered).toContain("73.1");
    expect(rendered).toContain("Masked values excluded");
  });

  it("handles negative financial adjustments correctly without false ungrounded flags", () => {
    const stuckMoneyFactSheet: MetricFactSheet = {
      numbers: {
        wonDealsValueExclGst: 95000000,
        overBilledNegativeAdjustment: -108312,
        uncollectedArValueInclGst: 36300000,
      },
      sourceRowIds: ["deal_1"],
      rowsScanned: 513,
      assumptions: [],
      caveats: [],
      asOfDate: "2026-03-31",
      fiscalYear: "FY25-26",
    };

    const proseWithNegative =
      "Won deals stand at ₹9.50 Cr with an over-billed negative adjustment of 108312 and uncollected AR of ₹3.63 Cr.";
    const result = validateNumericGrounding(proseWithNegative, [stuckMoneyFactSheet]);
    expect(result.isGrounded).toBe(true);
    expect(result.unverifiedNumbers).toEqual([]);

    const rendered = renderDeterministicFallback([stuckMoneyFactSheet]);
    expect(rendered).toContain("-₹1.08 L");
  });

  it("approves statutory GST rate mentions, complementary percentages, and derived ratios", () => {
    const revenueFactSheet: MetricFactSheet = {
      numbers: {
        contractedOrderValueExclGst: 210600000,
        billedAmountExclGst: 107400000,
        overallCollectionEfficiencyPct: 71.4,
      },
      sourceRowIds: ["wo_1"],
      rowsScanned: 177,
      assumptions: [],
      caveats: [],
      asOfDate: "2026-03-31",
      fiscalYear: "FY25-26",
    };

    const prose =
      "Out of ₹21.06 Cr contracted value, we have billed ₹10.74 Cr (51% billed). Collection efficiency is 71.4% with 28.6% uncollected, subject to standard 18% GST.";
    const result = validateNumericGrounding(prose, [revenueFactSheet]);
    expect(result.isGrounded).toBe(true);
    expect(result.unverifiedNumbers).toEqual([]);
  });
});
