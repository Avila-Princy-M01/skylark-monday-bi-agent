import { WorkOrder, MetricFactSheet } from "../data/types";

export interface RevenueOptions {
  sector?: string[];
  bdKamPersonnelCode?: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
}

export interface RevenueResult {
  contractedOrderValueExclGst: number;
  contractedOrderValueInclGst: number;
  billedAmountExclGst: number;
  billedAmountInclGst: number;
  collectedAmountInclGst: number;
  unbilledContractValueExclGst: number;
  workOrderCount: number;
  factSheet: MetricFactSheet;
}

export function computeRevenueMetrics(
  workOrders: WorkOrder[],
  options: RevenueOptions = {}
): RevenueResult {
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

  if (options.startDate || options.endDate) {
    filtered = filtered.filter((w) => {
      if (!w.poDate) return false;
      if (options.startDate && w.poDate < options.startDate) return false;
      if (options.endDate && w.poDate > options.endDate) return false;
      return true;
    });
  }

  let contractedExcl = 0;
  let contractedIncl = 0;
  let billedExcl = 0;
  let billedIncl = 0;
  let collectedIncl = 0;
  const sourceRowIds: string[] = [];

  for (const wo of filtered) {
    sourceRowIds.push(wo.id);
    contractedExcl += wo.orderValueExclGst;
    contractedIncl += wo.orderValueInclGst;
    billedExcl += wo.billedAmountExclGst;
    billedIncl += wo.billedAmountInclGst;
    collectedIncl += wo.collectedAmountInclGst;
  }

  const unbilledContractValueExclGst = Math.max(0, contractedExcl - billedExcl);

  return {
    contractedOrderValueExclGst: Math.round(contractedExcl),
    contractedOrderValueInclGst: Math.round(contractedIncl),
    billedAmountExclGst: Math.round(billedExcl),
    billedAmountInclGst: Math.round(billedIncl),
    collectedAmountInclGst: Math.round(collectedIncl),
    unbilledContractValueExclGst: Math.round(unbilledContractValueExclGst),
    workOrderCount: filtered.length,
    factSheet: {
      numbers: {
        contractedOrderValueExclGst: Math.round(contractedExcl),
        contractedOrderValueInclGst: Math.round(contractedIncl),
        billedAmountExclGst: Math.round(billedExcl),
        billedAmountInclGst: Math.round(billedIncl),
        collectedAmountInclGst: Math.round(collectedIncl),
        unbilledContractValueExclGst: Math.round(unbilledContractValueExclGst),
        workOrderCount: filtered.length,
      },
      sourceRowIds,
      rowsScanned: workOrders.length,
      assumptions: [
        "Contracted value is pre-tax (Excl. GST) order book value",
        "Billed amount is delivered revenue (Excl. GST)",
        "Collections are cash receipts (Incl. GST)",
      ],
      caveats: ["Never conflate contracted order value with recognized or billed revenue."],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}
