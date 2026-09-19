import { Deal, WorkOrder, MetricFactSheet } from "../data/types";

export interface ConcentrationShare {
  entity: string;
  totalValue: number;
  sharePercentage: number;
  count: number;
}

export interface ConcentrationRiskResult {
  topClientsPipeline: ConcentrationShare[];
  topOwnersPipeline: ConcentrationShare[];
  topClientsOrderBook: ConcentrationShare[];
  topOwnersOrderBook: ConcentrationShare[];
  pipelineTop3ClientSharePct: number;
  orderBookTop3ClientSharePct: number;
  factSheet: MetricFactSheet;
}

export function computeConcentrationRisk(
  deals: Deal[],
  workOrders: WorkOrder[],
  options: { topN?: number; asOfDate?: string } = {}
): ConcentrationRiskResult {
  const topN = options.topN || 5;
  const asOf = options.asOfDate || "2026-03-31";

  // 1. Pipeline Client and Owner concentration (Open deals with valid values)
  const openDeals = deals.filter((d) => d.status === "Open" && d.dealValue !== null);
  const totalPipelineVal = openDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0);

  const clientPipeMap: Record<string, { val: number; count: number }> = {};
  const ownerPipeMap: Record<string, { val: number; count: number }> = {};

  for (const d of openDeals) {
    const c = d.clientCode || "Unknown";
    const o = d.ownerCode || "Unknown";
    const val = d.dealValue || 0;

    if (!clientPipeMap[c]) clientPipeMap[c] = { val: 0, count: 0 };
    clientPipeMap[c].val += val;
    clientPipeMap[c].count++;

    if (!ownerPipeMap[o]) ownerPipeMap[o] = { val: 0, count: 0 };
    ownerPipeMap[o].val += val;
    ownerPipeMap[o].count++;
  }

  const toSortedShares = (
    map: Record<string, { val: number; count: number }>,
    total: number
  ): ConcentrationShare[] => {
    return Object.entries(map)
      .map(([entity, data]) => ({
        entity,
        totalValue: Math.round(data.val),
        sharePercentage: total > 0 ? Math.round((data.val / total) * 1000) / 10 : 0,
        count: data.count,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  };

  const topClientsPipeline = toSortedShares(clientPipeMap, totalPipelineVal).slice(0, topN);
  const topOwnersPipeline = toSortedShares(ownerPipeMap, totalPipelineVal).slice(0, topN);

  // 2. Order Book (Work Orders) concentration
  const totalOrderBookVal = workOrders.reduce((sum, w) => sum + w.orderValueExclGst, 0);
  const clientWoMap: Record<string, { val: number; count: number }> = {};
  const ownerWoMap: Record<string, { val: number; count: number }> = {};

  for (const w of workOrders) {
    const c = w.clientCode || "Unknown";
    const o = w.bdKamPersonnelCode || "Unknown";
    const val = w.orderValueExclGst;

    if (!clientWoMap[c]) clientWoMap[c] = { val: 0, count: 0 };
    clientWoMap[c].val += val;
    clientWoMap[c].count++;

    if (!ownerWoMap[o]) ownerWoMap[o] = { val: 0, count: 0 };
    ownerWoMap[o].val += val;
    ownerWoMap[o].count++;
  }

  const topClientsOrderBook = toSortedShares(clientWoMap, totalOrderBookVal).slice(0, topN);
  const topOwnersOrderBook = toSortedShares(ownerWoMap, totalOrderBookVal).slice(0, topN);

  const pipelineTop3ClientSharePct = topClientsPipeline
    .slice(0, 3)
    .reduce((sum, c) => sum + c.sharePercentage, 0);

  const orderBookTop3ClientSharePct = topClientsOrderBook
    .slice(0, 3)
    .reduce((sum, c) => sum + c.sharePercentage, 0);

  return {
    topClientsPipeline,
    topOwnersPipeline,
    topClientsOrderBook,
    topOwnersOrderBook,
    pipelineTop3ClientSharePct: Math.round(pipelineTop3ClientSharePct * 10) / 10,
    orderBookTop3ClientSharePct: Math.round(orderBookTop3ClientSharePct * 10) / 10,
    factSheet: {
      numbers: {
        pipelineTop3ClientSharePct: Math.round(pipelineTop3ClientSharePct * 10) / 10,
        orderBookTop3ClientSharePct: Math.round(orderBookTop3ClientSharePct * 10) / 10,
        totalPipelineValue: Math.round(totalPipelineVal),
        totalOrderBookValue: Math.round(totalOrderBookVal),
      },
      sourceRowIds: [...openDeals.map((d) => d.id), ...workOrders.map((w) => w.id)],
      rowsScanned: deals.length + workOrders.length,
      assumptions: [
        "Pipeline concentration computed over open deals with non-masked deal values",
        "Order book concentration computed over Order Value (Excl. GST)",
      ],
      caveats: [
        "Undisclosed/masked placeholder deals are excluded from pipeline concentration share denominators.",
      ],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}
