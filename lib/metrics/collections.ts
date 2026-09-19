import { WorkOrder, MetricFactSheet } from "../data/types";

export interface CollectionsOptions {
  sector?: string[];
  bdKamPersonnelCode?: string;
  asOfDate?: string;
}

export interface ARAccount {
  clientCode: string;
  workOrderNumber: string;
  billedAmountInclGst: number;
  collectedAmountInclGst: number;
  outstandingArInclGst: number;
  executionStatus: string;
  billingStatus: string;
  poDate: string | null;
}

export interface CollectionsResult {
  totalBilledInclGst: number;
  totalCollectedInclGst: number;
  totalOutstandingArInclGst: number;
  overallCollectionEfficiencyPct: number;
  efficiencyBySector: Record<string, { billed: number; collected: number; efficiencyPct: number }>;
  arPriorityAccounts: ARAccount[];
  overBilledAccounts: Array<{
    workOrderNumber: string;
    clientCode: string;
    amountToBeBilledExclGst: number;
  }>;
  factSheet: MetricFactSheet;
}

export function computeCollectionsMetrics(
  workOrders: WorkOrder[],
  options: CollectionsOptions = {}
): CollectionsResult {
  const asOf = options.asOfDate || "2026-03-31";

  let filtered = workOrders;
  if (options.sector && options.sector.length > 0) {
    const sSet = new Set(options.sector.map((s) => s.toLowerCase()));
    filtered = filtered.filter((w) => sSet.has(w.sector.toLowerCase()));
  }

  if (options.bdKamPersonnelCode) {
    const code = options.bdKamPersonnelCode.toLowerCase();
    filtered = filtered.filter((w) => w.bdKamPersonnelCode.toLowerCase() === code);
  }

  let totalBilled = 0;
  let totalCollected = 0;
  const sectorBuckets: Record<string, { billed: number; collected: number }> = {};
  const arAccounts: ARAccount[] = [];
  const overBilledAccounts: Array<{
    workOrderNumber: string;
    clientCode: string;
    amountToBeBilledExclGst: number;
  }> = [];
  const sourceRowIds: string[] = [];

  for (const wo of filtered) {
    sourceRowIds.push(wo.id);
    totalBilled += wo.billedAmountInclGst;
    totalCollected += wo.collectedAmountInclGst;

    const s = wo.sector || "Uncategorized";
    if (!sectorBuckets[s]) {
      sectorBuckets[s] = { billed: 0, collected: 0 };
    }
    sectorBuckets[s].billed += wo.billedAmountInclGst;
    sectorBuckets[s].collected += wo.collectedAmountInclGst;

    const outstanding = wo.billedAmountInclGst - wo.collectedAmountInclGst;
    if (outstanding > 0) {
      arAccounts.push({
        clientCode: wo.clientCode,
        workOrderNumber: wo.workOrderNumber,
        billedAmountInclGst: Math.round(wo.billedAmountInclGst),
        collectedAmountInclGst: Math.round(wo.collectedAmountInclGst),
        outstandingArInclGst: Math.round(outstanding),
        executionStatus: wo.executionStatus,
        billingStatus: wo.billingStatus,
        poDate: wo.poDate,
      });
    }

    if (wo.isOverBilled) {
      overBilledAccounts.push({
        workOrderNumber: wo.workOrderNumber,
        clientCode: wo.clientCode,
        amountToBeBilledExclGst: wo.amountToBeBilledExclGst,
      });
    }
  }

  // Sort AR accounts by highest outstanding
  arAccounts.sort((a, b) => b.outstandingArInclGst - a.outstandingArInclGst);

  const overallEfficiency = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;
  const efficiencyBySector: Record<
    string,
    { billed: number; collected: number; efficiencyPct: number }
  > = {};

  for (const [sec, data] of Object.entries(sectorBuckets)) {
    efficiencyBySector[sec] = {
      billed: Math.round(data.billed),
      collected: Math.round(data.collected),
      efficiencyPct: data.billed > 0 ? Math.round((data.collected / data.billed) * 1000) / 10 : 0,
    };
  }

  const totalOutstanding = Math.max(0, totalBilled - totalCollected);

  return {
    totalBilledInclGst: Math.round(totalBilled),
    totalCollectedInclGst: Math.round(totalCollected),
    totalOutstandingArInclGst: Math.round(totalOutstanding),
    overallCollectionEfficiencyPct: Math.round(overallEfficiency * 10) / 10,
    efficiencyBySector,
    arPriorityAccounts: arAccounts.slice(0, 10),
    overBilledAccounts,
    factSheet: {
      numbers: {
        totalBilledInclGst: Math.round(totalBilled),
        totalCollectedInclGst: Math.round(totalCollected),
        totalOutstandingArInclGst: Math.round(totalOutstanding),
        overallCollectionEfficiencyPct: Math.round(overallEfficiency * 10) / 10,
        arAccountsCount: arAccounts.length,
        overBilledCount: overBilledAccounts.length,
      },
      sourceRowIds,
      rowsScanned: workOrders.length,
      assumptions: [
        "Collection efficiency is calculated as Total Collected (Incl. GST) ÷ Total Billed (Incl. GST)",
        "Outstanding AR is Billed (Incl. GST) minus Collected (Incl. GST)",
      ],
      caveats: [
        "Over-billed records with negative unbilled values are isolated from AR calculations.",
      ],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}
