import { Deal, MetricFactSheet } from "../data/types";

export interface PipelineWeightFactors {
  high: number;
  medium: number;
  low: number;
}

export const DEFAULT_PIPELINE_WEIGHTS: PipelineWeightFactors = {
  high: 0.7,
  medium: 0.4,
  low: 0.15,
};

export interface PipelineHealthResult {
  totalOpenValue: number;
  weightedPipelineValue: number;
  dealCount: number;
  openDealsCount: number;
  meanDealSize: number;
  medianDealSize: number;
  undisclosedMaskedCount: number;
  bySector: Record<string, { value: number; count: number; openValue: number }>;
  breakdownBySector: Record<string, { value: number; count: number; openValue: number }>;
  byOwner: Record<string, { value: number; count: number; openValue: number }>;
  breakdownByOwner: Record<string, { value: number; count: number; openValue: number }>;
  byStage: Record<string, { value: number; count: number; openValue: number }>;
  breakdownByStage: Record<string, { value: number; count: number; openValue: number }>;
  factSheet: MetricFactSheet;
}

export function computePipelineHealth(
  deals: Deal[],
  options: {
    sector?: string[];
    owner?: string;
    ownerCode?: string;
    stageCategory?: string;
    asOfDate?: string;
    weights?: PipelineWeightFactors;
  } = {}
): PipelineHealthResult {
  const asOf = options.asOfDate || "2026-03-31";
  const weights = options.weights || DEFAULT_PIPELINE_WEIGHTS;

  let filtered = deals.filter((d) => d.status === "Open");

  if (options.sector && options.sector.length > 0) {
    const sSet = new Set(options.sector.map((s) => s.toLowerCase()));
    filtered = filtered.filter((d) => sSet.has(d.sector.toLowerCase()));
  }

  const targetOwner = options.ownerCode || options.owner;
  if (targetOwner) {
    const o = targetOwner.toLowerCase();
    filtered = filtered.filter((d) => d.ownerCode.toLowerCase() === o);
  }

  if (options.stageCategory) {
    filtered = filtered.filter((d) => d.stageCategory === options.stageCategory);
  }

  let totalOpenValue = 0;
  let weightedPipelineValue = 0;
  let undisclosedMaskedCount = 0;
  const values: number[] = [];

  const bySector: Record<string, { value: number; count: number; openValue: number }> = {};
  const byOwner: Record<string, { value: number; count: number; openValue: number }> = {};
  const byStage: Record<string, { value: number; count: number; openValue: number }> = {};
  const sourceRowIds: string[] = [];

  for (const deal of filtered) {
    sourceRowIds.push(deal.id);

    const sec = deal.sector || "Unassigned";
    const own = deal.ownerCode || "Unassigned";
    const stg = deal.stage || "Unassigned";

    bySector[sec] = bySector[sec] || { value: 0, count: 0, openValue: 0 };
    bySector[sec].count++;

    byOwner[own] = byOwner[own] || { value: 0, count: 0, openValue: 0 };
    byOwner[own].count++;

    byStage[stg] = byStage[stg] || { value: 0, count: 0, openValue: 0 };
    byStage[stg].count++;

    if (deal.dealValue !== null) {
      const val = deal.dealValue;
      totalOpenValue += val;
      values.push(val);

      bySector[sec].value += val;
      bySector[sec].openValue += val;
      byOwner[own].value += val;
      byOwner[own].openValue += val;
      byStage[stg].value += val;
      byStage[stg].openValue += val;

      let w = 0;
      if (deal.probability === "High") w = weights.high;
      else if (deal.probability === "Medium") w = weights.medium;
      else if (deal.probability === "Low") w = weights.low;
      weightedPipelineValue += val * w;
    } else {
      undisclosedMaskedCount++;
    }
  }

  values.sort((a, b) => a - b);
  const dealCount = filtered.length;
  const validValueCount = values.length;
  const meanDealSize = validValueCount > 0 ? totalOpenValue / validValueCount : 0;

  let medianDealSize = 0;
  if (validValueCount > 0) {
    const mid = Math.floor(validValueCount / 2);
    medianDealSize = validValueCount % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  }

  return {
    totalOpenValue: Math.round(totalOpenValue),
    weightedPipelineValue: Math.round(weightedPipelineValue),
    dealCount,
    openDealsCount: dealCount,
    meanDealSize: Math.round(meanDealSize),
    medianDealSize: Math.round(medianDealSize),
    undisclosedMaskedCount,
    bySector,
    breakdownBySector: bySector,
    byOwner,
    breakdownByOwner: byOwner,
    byStage,
    breakdownByStage: byStage,
    factSheet: {
      numbers: {
        totalOpenValue: Math.round(totalOpenValue),
        weightedPipelineValue: Math.round(weightedPipelineValue),
        dealCount,
        openDealsCount: dealCount,
        meanDealSize: Math.round(meanDealSize),
        medianDealSize: Math.round(medianDealSize),
        undisclosedMaskedCount,
      },
      sourceRowIds,
      rowsScanned: deals.length,
      assumptions: [
        `Weighted probability weights: High=${weights.high}, Medium=${weights.medium}, Low=${weights.low}`,
        "Masked placeholder values (~₹1) excluded from monetary aggregations and reported as undisclosed",
      ],
      caveats:
        undisclosedMaskedCount > 0
          ? [
              `${undisclosedMaskedCount} open deals have masked/undisclosed values and are omitted from totals.`,
            ]
          : [],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}

export interface StalledDealItem {
  dealName: string;
  clientCode: string;
  ownerCode: string;
  tentativeCloseDate: string;
  dealValue: number | null;
  ageDays: number;
}

export interface StalledDealsResult {
  stalledDealCount: number;
  stalledDealsCount: number;
  stalledDealValue: number;
  totalStalledValue: number;
  stalledDeals: StalledDealItem[];
  deals: Deal[];
  factSheet: MetricFactSheet;
}

export function getStalledDeals(
  deals: Deal[],
  options: {
    asOfDate?: string;
    sector?: string[];
    ownerCode?: string;
  } = {}
): StalledDealsResult {
  const asOf = options.asOfDate || "2026-03-31";
  const asOfTime = new Date(asOf).getTime();

  let filtered = deals.filter((d) => d.status === "Open");

  if (options.sector && options.sector.length > 0) {
    const sSet = new Set(options.sector.map((s) => s.toLowerCase()));
    filtered = filtered.filter((d) => sSet.has(d.sector.toLowerCase()));
  }

  if (options.ownerCode) {
    const o = options.ownerCode.toLowerCase();
    filtered = filtered.filter((d) => d.ownerCode.toLowerCase() === o);
  }

  const stalledItems: StalledDealItem[] = [];
  const stalledRawDeals: Deal[] = [];
  let totalStalledValue = 0;
  const sourceRowIds: string[] = [];

  for (const d of filtered) {
    if (d.tentativeCloseDate) {
      const closeTime = new Date(d.tentativeCloseDate).getTime();
      if (closeTime < asOfTime) {
        stalledRawDeals.push(d);
        sourceRowIds.push(d.id);
        const val = d.dealValue ?? 0;
        totalStalledValue += val;

        const ageDays = Math.max(0, Math.floor((asOfTime - closeTime) / (1000 * 60 * 60 * 24)));

        stalledItems.push({
          dealName: d.name,
          clientCode: d.clientCode,
          ownerCode: d.ownerCode,
          tentativeCloseDate: d.tentativeCloseDate,
          dealValue: d.dealValue,
          ageDays,
        });
      }
    }
  }

  return {
    stalledDealCount: stalledItems.length,
    stalledDealsCount: stalledItems.length,
    stalledDealValue: Math.round(totalStalledValue),
    totalStalledValue: Math.round(totalStalledValue),
    stalledDeals: stalledItems,
    deals: stalledRawDeals,
    factSheet: {
      numbers: {
        stalledDealsCount: stalledItems.length,
        totalStalledValue: Math.round(totalStalledValue),
      },
      sourceRowIds,
      rowsScanned: deals.length,
      assumptions: [
        `Stalled criteria: Open deals with tentative close date strictly prior to ${asOf}`,
      ],
      caveats: [],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}

export const computeStalledDeals = (deals: Deal[], asOfDate = "2026-03-31") =>
  getStalledDeals(deals, { asOfDate });
