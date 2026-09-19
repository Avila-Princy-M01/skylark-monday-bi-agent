import { Deal, WorkOrder, MetricFactSheet } from "../data/types";
import { computeCollectionsMetrics } from "./collections";

export interface StuckMoneyBreakdown {
  wonDealsValueExclGst: number;
  totalBilledValueExclGst: number;
  totalBilledValueInclGst: number;
  totalCollectedValueInclGst: number;
  uncollectedArValueInclGst: number;
  overBilledNegativeAdjustment: number;
  factSheet: MetricFactSheet;
}

export function computeStuckMoney(
  deals: Deal[],
  workOrders: WorkOrder[],
  options: { asOfDate?: string } = {}
): StuckMoneyBreakdown {
  const asOf = options.asOfDate || "2026-03-31";

  // 1. Won deals value
  const wonDeals = deals.filter((d) => d.status === "Won" && d.dealValue !== null);
  const wonDealsVal = wonDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0);

  // 2. Collections and AR analysis
  const collections = computeCollectionsMetrics(workOrders, { asOfDate: asOf });
  const billedExcl = workOrders.reduce((sum, w) => sum + w.billedAmountExclGst, 0);

  let overBilledNegatives = 0;
  for (const ob of collections.overBilledAccounts) {
    overBilledNegatives += ob.amountToBeBilledExclGst;
  }

  return {
    wonDealsValueExclGst: Math.round(wonDealsVal),
    totalBilledValueExclGst: Math.round(billedExcl),
    totalBilledValueInclGst: collections.totalBilledInclGst,
    totalCollectedValueInclGst: collections.totalCollectedInclGst,
    uncollectedArValueInclGst: collections.totalOutstandingArInclGst,
    overBilledNegativeAdjustment: Math.round(overBilledNegatives),
    factSheet: {
      numbers: {
        wonDealsValueExclGst: Math.round(wonDealsVal),
        totalBilledValueExclGst: Math.round(billedExcl),
        totalBilledValueInclGst: collections.totalBilledInclGst,
        totalCollectedValueInclGst: collections.totalCollectedInclGst,
        uncollectedArValueInclGst: collections.totalOutstandingArInclGst,
        overBilledNegativeAdjustment: Math.round(overBilledNegatives),
      },
      sourceRowIds: [...wonDeals.map((d) => d.id), ...workOrders.map((w) => w.id)],
      rowsScanned: deals.length + workOrders.length,
      assumptions: [
        "Won deals represent pipeline converted to commitments (Excl. GST)",
        "Billed amount represents executed services invoiced",
        "Outstanding AR represents cash trapped in unpaid receivables",
      ],
      caveats: [
        "Won deals from the pipeline board are not linked one-to-one to work order records due to separate entity identifiers.",
      ],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}
