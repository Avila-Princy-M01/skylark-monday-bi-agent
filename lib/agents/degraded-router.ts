import { Deal, WorkOrder, MetricFactSheet } from "../data/types";
import { computePipelineHealth, getStalledDeals } from "../metrics/pipeline";
import { computeRevenueMetrics } from "../metrics/revenue";
import { computeCollectionsMetrics } from "../metrics/collections";
import { computeOperationsMetrics } from "../metrics/operations";
import { computeConcentrationRisk } from "../metrics/concentration";
import { computeStuckMoney } from "../metrics/stuck-money";
import { renderDeterministicFallback } from "../narrate/numeric-guard";

export interface DegradedResponse {
  answer: string;
  matchedCategory: string;
  factSheets: MetricFactSheet[];
  isDegradedFallback: true;
}

/**
 * Deterministic rule-based router as a safety net when all LLM providers fail
 */
export function routeDegradedQuery(
  query: string,
  deals: Deal[],
  workOrders: WorkOrder[],
  asOfDate: string = "2026-03-31"
): DegradedResponse {
  const q = query.toLowerCase();
  const factSheets: MetricFactSheet[] = [];
  let category = "general";

  // Whole-word test. Plain substring matching silently mis-routed questions:
  // "softWARe attach rate" and "how ARe we doing" both contain "ar" and were
  // being answered with receivables metrics.
  const hasWord = (word: string) => new RegExp(`\\b${word}\\b`).test(q);

  if (q.includes("stalled") || q.includes("aging") || q.includes("delayed")) {
    category = "stalled_pipeline";
    const res = getStalledDeals(deals, { asOfDate });
    factSheets.push(res.factSheet);
  } else if (
    q.includes("pipeline") ||
    q.includes("deal") ||
    q.includes("funnel") ||
    q.includes("stage")
  ) {
    category = "pipeline";
    const res = computePipelineHealth(deals, { asOfDate });
    factSheets.push(res.factSheet);
  } else if (
    q.includes("collection") ||
    hasWord("ar") ||
    q.includes("receivable") ||
    q.includes("over-billed")
  ) {
    category = "collections";
    const res = computeCollectionsMetrics(workOrders, { asOfDate });
    factSheets.push(res.factSheet);
  } else if (
    q.includes("revenue") ||
    q.includes("billed") ||
    q.includes("order book") ||
    q.includes("contract")
  ) {
    category = "revenue";
    const res = computeRevenueMetrics(workOrders, { asOfDate });
    factSheets.push(res.factSheet);
  } else if (
    q.includes("operation") ||
    q.includes("delivery") ||
    q.includes("attach") ||
    q.includes("spectra")
  ) {
    category = "operations";
    const res = computeOperationsMetrics(workOrders, { asOfDate });
    factSheets.push(res.factSheet);
  } else if (q.includes("concentration") || q.includes("top client") || q.includes("risk")) {
    category = "concentration";
    const res = computeConcentrationRisk(deals, workOrders, { asOfDate });
    factSheets.push(res.factSheet);
  } else if (q.includes("stuck") || q.includes("conversion")) {
    category = "stuck_money";
    const res = computeStuckMoney(deals, workOrders, { asOfDate });
    factSheets.push(res.factSheet);
  } else {
    category = "cross_board";
    const pRes = computePipelineHealth(deals, { asOfDate });
    const rRes = computeRevenueMetrics(workOrders, { asOfDate });
    const cRes = computeCollectionsMetrics(workOrders, { asOfDate });
    factSheets.push(pRes.factSheet, rRes.factSheet, cRes.factSheet);
  }

  const answer = `> ⚠️ **Notice**: LLM inference is currently unavailable. Serving deterministic degraded-mode report.\n\n${renderDeterministicFallback(factSheets)}`;

  return {
    answer,
    matchedCategory: category,
    factSheets,
    isDegradedFallback: true,
  };
}
