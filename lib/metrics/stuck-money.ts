import { Deal, WorkOrder, MetricFactSheet } from "../data/types";
import { computeCollectionsMetrics } from "./collections";

export interface StuckMoneyBreakdown {
  wonDealsValueExclGst: number;
  contractedOrderValueExclGst: number;
  contractedOrderValueInclGst: number;
  totalBilledValueExclGst: number;
  totalBilledValueInclGst: number;
  totalCollectedValueInclGst: number;
  unbilledContractValueExclGst: number;
  unbilledBacklogValueExclGst: number;
  uncollectedArValueInclGst: number;
  uncollectedArValueExclGst: number;
  totalOperationalStuckExclGst: number;
  totalOperationalStuckInclGst: number;
  totalStuckAcrossStagesExclGst: number;
  totalStuckAcrossStages: number;
  unbilledBacklogSharePct: number;
  uncollectedArSharePct: number;
  overBilledNegativeAdjustment: number;
  wonDealsCount: number;
  workOrdersCount: number;
  arAccountsCount: number;
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
  const contractedExcl = workOrders.reduce((sum, w) => sum + w.orderValueExclGst, 0);
  const contractedIncl = workOrders.reduce((sum, w) => sum + w.orderValueInclGst, 0);

  const unbilledBacklogExcl = Math.max(0, contractedExcl - billedExcl);
  const uncollectedArExcl = Math.round(collections.totalOutstandingArInclGst / 1.18);
  const totalOperationalStuckExcl = Math.round(unbilledBacklogExcl + uncollectedArExcl);
  const totalOperationalStuckIncl = Math.round(
    unbilledBacklogExcl * 1.18 + collections.totalOutstandingArInclGst
  );
  const totalStuckAcrossStagesExcl = Math.round(
    wonDealsVal + unbilledBacklogExcl + uncollectedArExcl
  );
  const totalStuckAcrossStages = Math.round(
    wonDealsVal + unbilledBacklogExcl + collections.totalOutstandingArInclGst
  );

  const unbilledBacklogSharePct =
    totalOperationalStuckExcl > 0
      ? Math.round((unbilledBacklogExcl / totalOperationalStuckExcl) * 1000) / 10
      : 0;
  const uncollectedArSharePct =
    totalOperationalStuckExcl > 0
      ? Math.round((uncollectedArExcl / totalOperationalStuckExcl) * 1000) / 10
      : 0;

  let overBilledNegatives = 0;
  for (const ob of collections.overBilledAccounts) {
    overBilledNegatives += ob.amountToBeBilledExclGst;
  }

  return {
    wonDealsValueExclGst: Math.round(wonDealsVal),
    contractedOrderValueExclGst: Math.round(contractedExcl),
    contractedOrderValueInclGst: Math.round(contractedIncl),
    totalBilledValueExclGst: Math.round(billedExcl),
    totalBilledValueInclGst: collections.totalBilledInclGst,
    totalCollectedValueInclGst: collections.totalCollectedInclGst,
    unbilledContractValueExclGst: Math.round(unbilledBacklogExcl),
    unbilledBacklogValueExclGst: Math.round(unbilledBacklogExcl),
    uncollectedArValueInclGst: collections.totalOutstandingArInclGst,
    uncollectedArValueExclGst: uncollectedArExcl,
    totalOperationalStuckExclGst: totalOperationalStuckExcl,
    totalOperationalStuckInclGst: totalOperationalStuckIncl,
    totalStuckAcrossStagesExclGst: totalStuckAcrossStagesExcl,
    totalStuckAcrossStages: totalStuckAcrossStages,
    unbilledBacklogSharePct,
    uncollectedArSharePct,
    overBilledNegativeAdjustment: Math.round(overBilledNegatives),
    wonDealsCount: wonDeals.length,
    workOrdersCount: workOrders.length,
    arAccountsCount: collections.arPriorityAccounts.length,
    factSheet: {
      numbers: {
        wonDealsValueExclGst: Math.round(wonDealsVal),
        contractedOrderValueExclGst: Math.round(contractedExcl),
        contractedOrderValueInclGst: Math.round(contractedIncl),
        totalBilledValueExclGst: Math.round(billedExcl),
        totalBilledValueInclGst: collections.totalBilledInclGst,
        totalCollectedValueInclGst: collections.totalCollectedInclGst,
        unbilledContractValueExclGst: Math.round(unbilledBacklogExcl),
        unbilledBacklogValueExclGst: Math.round(unbilledBacklogExcl),
        uncollectedArValueInclGst: collections.totalOutstandingArInclGst,
        uncollectedArValueExclGst: uncollectedArExcl,
        totalOperationalStuckExclGst: totalOperationalStuckExcl,
        totalOperationalStuckInclGst: totalOperationalStuckIncl,
        totalStuckAcrossStagesExclGst: totalStuckAcrossStagesExcl,
        totalStuckAcrossStages: totalStuckAcrossStages,
        unbilledBacklogSharePct,
        uncollectedArSharePct,
        overBilledNegativeAdjustment: Math.round(overBilledNegatives),
        wonDealsCount: wonDeals.length,
        workOrdersCount: workOrders.length,
        arAccountsCount: collections.arPriorityAccounts.length,
      },
      sourceRowIds: [...wonDeals.map((d) => d.id), ...workOrders.map((w) => w.id)],
      rowsScanned: deals.length + workOrders.length,
      assumptions: [
        "Won deals represent pipeline converted to commitments pending execution (Excl. GST)",
        "Unbilled backlog represents signed contracts pending execution/invoicing (Excl. GST)",
        "Billed amount represents executed services invoiced",
        "Outstanding AR represents cash trapped in unpaid receivables (Incl. GST)",
      ],
      caveats: [
        "Won deals from the pipeline board are not linked one-to-one to work order records due to separate entity identifiers.",
      ],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}
