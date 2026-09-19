import { Deal, WorkOrder, MetricFactSheet } from "../data/types";
import { computePipelineHealth } from "./pipeline";
import { computeRevenueMetrics } from "./revenue";
import { computeCollectionsMetrics } from "./collections";

export interface OwnerScorecard {
  ownerCode: string;
  openPipelineValue: number;
  openDealsCount: number;
  contractedOrderValueExclGst: number;
  billedAmountExclGst: number;
  collectedAmountInclGst: number;
  workOrdersCount: number;
  collectionEfficiencyPct: number;
}

export interface SectorScorecard {
  sector: string;
  openPipelineValue: number;
  openDealsCount: number;
  contractedOrderValueExclGst: number;
  billedAmountExclGst: number;
  collectedAmountInclGst: number;
  workOrdersCount: number;
  collectionEfficiencyPct: number;
}

export interface CrossBoardResult {
  ownerScorecards: OwnerScorecard[];
  sectorScorecards: SectorScorecard[];
  explicitNonJoinCompanyRule: string;
  factSheet: MetricFactSheet;
}

export function computeCrossBoardMetrics(
  deals: Deal[],
  workOrders: WorkOrder[],
  options: { asOfDate?: string } = {}
): CrossBoardResult {
  const asOf = options.asOfDate || "2026-03-31";

  // Gather unique Owners
  const owners = new Set<string>();
  deals.forEach((d) => d.ownerCode && owners.add(d.ownerCode));
  workOrders.forEach((w) => w.bdKamPersonnelCode && owners.add(w.bdKamPersonnelCode));

  const ownerScorecards: OwnerScorecard[] = [];

  for (const owner of owners) {
    const ownerDeals = deals.filter((d) => d.ownerCode.toLowerCase() === owner.toLowerCase());
    const ownerWos = workOrders.filter(
      (w) => w.bdKamPersonnelCode.toLowerCase() === owner.toLowerCase()
    );

    const pipe = computePipelineHealth(ownerDeals, { asOfDate: asOf });
    const rev = computeRevenueMetrics(ownerWos, { asOfDate: asOf });
    const col = computeCollectionsMetrics(ownerWos, { asOfDate: asOf });

    ownerScorecards.push({
      ownerCode: owner,
      openPipelineValue: pipe.totalOpenValue,
      openDealsCount: pipe.openDealsCount,
      contractedOrderValueExclGst: rev.contractedOrderValueExclGst,
      billedAmountExclGst: rev.billedAmountExclGst,
      collectedAmountInclGst: rev.collectedAmountInclGst,
      workOrdersCount: ownerWos.length,
      collectionEfficiencyPct: col.overallCollectionEfficiencyPct,
    });
  }

  // Gather unique Sectors
  const sectors = new Set<string>();
  deals.forEach((d) => d.sector && sectors.add(d.sector));
  workOrders.forEach((w) => w.sector && sectors.add(w.sector));

  const sectorScorecards: SectorScorecard[] = [];

  for (const sec of sectors) {
    const secDeals = deals.filter((d) => d.sector.toLowerCase() === sec.toLowerCase());
    const secWos = workOrders.filter((w) => w.sector.toLowerCase() === sec.toLowerCase());

    const pipe = computePipelineHealth(secDeals, { asOfDate: asOf });
    const rev = computeRevenueMetrics(secWos, { asOfDate: asOf });
    const col = computeCollectionsMetrics(secWos, { asOfDate: asOf });

    sectorScorecards.push({
      sector: sec,
      openPipelineValue: pipe.totalOpenValue,
      openDealsCount: pipe.openDealsCount,
      contractedOrderValueExclGst: rev.contractedOrderValueExclGst,
      billedAmountExclGst: rev.billedAmountExclGst,
      collectedAmountInclGst: rev.collectedAmountInclGst,
      workOrdersCount: secWos.length,
      collectionEfficiencyPct: col.overallCollectionEfficiencyPct,
    });
  }

  ownerScorecards.sort(
    (a, b) =>
      b.openPipelineValue +
      b.contractedOrderValueExclGst -
      (a.openPipelineValue + a.contractedOrderValueExclGst)
  );

  sectorScorecards.sort(
    (a, b) =>
      b.openPipelineValue +
      b.contractedOrderValueExclGst -
      (a.openPipelineValue + a.contractedOrderValueExclGst)
  );

  return {
    ownerScorecards,
    sectorScorecards,
    explicitNonJoinCompanyRule:
      "Company-level joins are strictly forbidden because Deals ('COMPANY089') and Work Orders ('WOCOMPANY_002') inhabit independent entity namespaces.",
    factSheet: {
      numbers: {
        totalOwnersScored: ownerScorecards.length,
        totalSectorsScored: sectorScorecards.length,
      },
      sourceRowIds: [...deals.map((d) => d.id), ...workOrders.map((w) => w.id)],
      rowsScanned: deals.length + workOrders.length,
      assumptions: [
        "Owner Code in Deals matches BD/KAM Personnel Code in Work Orders",
        "Sector strings are normalized across both boards",
      ],
      caveats: [
        "Company-level joins between Deals and Work Orders are strictly disabled due to separate identifier namespaces.",
      ],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}
