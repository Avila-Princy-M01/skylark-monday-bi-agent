import { WorkOrder, MetricFactSheet } from "../data/types";

export interface OperationsOptions {
  asOfDate?: string;
  sector?: string[];
}

export interface OperationsResult {
  totalWorkOrders: number;
  executionStatusBreakdown: Record<string, number>;
  notStartedWithPastPoCount: number;
  notStartedWithPastPoAccounts: Array<{
    workOrderNumber: string;
    clientCode: string;
    poDate: string;
    orderValueExclGst: number;
  }>;
  deliveryBeforePoAnomaliesCount: number;
  deliveryBeforePoAnomalies: Array<{
    workOrderNumber: string;
    clientCode: string;
    poDate: string;
    deliveryDate: string;
  }>;
  quantityDiscrepanciesCount: number;
  softwareAttachCount: number;
  pureServiceCount: number;
  softwareAttachRatePct: number;
  factSheet: MetricFactSheet;
}

export function computeOperationsMetrics(
  workOrders: WorkOrder[],
  options: OperationsOptions = {}
): OperationsResult {
  const asOf = options.asOfDate || "2026-03-31";

  let filtered = workOrders;
  if (options.sector && options.sector.length > 0) {
    const sSet = new Set(options.sector.map((s) => s.toLowerCase()));
    filtered = filtered.filter((w) => sSet.has(w.sector.toLowerCase()));
  }

  const executionBreakdown: Record<string, number> = {
    Completed: 0,
    "In Progress": 0,
    "Not Started": 0,
    "On Hold": 0,
    Cancelled: 0,
    Unknown: 0,
  };

  const notStartedPastPo: OperationsResult["notStartedWithPastPoAccounts"] = [];
  const deliveryAnomalies: OperationsResult["deliveryBeforePoAnomalies"] = [];
  let quantityDiscrepancies = 0;
  let softwareAttach = 0;
  let pureService = 0;
  const sourceRowIds: string[] = [];

  for (const wo of filtered) {
    sourceRowIds.push(wo.id);
    const status = wo.executionStatus || "Unknown";
    executionBreakdown[status] = (executionBreakdown[status] || 0) + 1;

    // Not started with past PO date (> 30 days past PO date relative to asOf)
    if (status === "Not Started" && wo.poDate) {
      if (wo.poDate < asOf) {
        notStartedPastPo.push({
          workOrderNumber: wo.workOrderNumber,
          clientCode: wo.clientCode,
          poDate: wo.poDate,
          orderValueExclGst: wo.orderValueExclGst,
        });
      }
    }

    if (wo.hasDeliveryBeforePoAnomaly && wo.poDate && wo.dataDeliveryDate) {
      deliveryAnomalies.push({
        workOrderNumber: wo.workOrderNumber,
        clientCode: wo.clientCode,
        poDate: wo.poDate,
        deliveryDate: wo.dataDeliveryDate,
      });
    }

    // Quantity Delivered vs PO Quantity check
    if (
      wo.poQuantity.value !== null &&
      wo.deliveredQuantity.value !== null &&
      wo.poQuantity.value > 0
    ) {
      if (wo.deliveredQuantity.value < wo.poQuantity.value) {
        quantityDiscrepancies++;
      }
    }

    // Software Attach Detection (Spectra / DMO / Dock vs Pure Service)
    const nature = (wo.natureOfWork || "").toLowerCase();
    if (
      nature.includes("spectra") ||
      nature.includes("dmo") ||
      nature.includes("dock") ||
      nature.includes("software") ||
      nature.includes("platform")
    ) {
      softwareAttach++;
    } else {
      pureService++;
    }
  }

  const total = filtered.length;
  const softwareAttachRate = total > 0 ? (softwareAttach / total) * 100 : 0;

  return {
    totalWorkOrders: total,
    executionStatusBreakdown: executionBreakdown,
    notStartedWithPastPoCount: notStartedPastPo.length,
    notStartedWithPastPoAccounts: notStartedPastPo,
    deliveryBeforePoAnomaliesCount: deliveryAnomalies.length,
    deliveryBeforePoAnomalies: deliveryAnomalies,
    quantityDiscrepanciesCount: quantityDiscrepancies,
    softwareAttachCount: softwareAttach,
    pureServiceCount: pureService,
    softwareAttachRatePct: Math.round(softwareAttachRate * 10) / 10,
    factSheet: {
      numbers: {
        totalWorkOrders: total,
        completedCount: executionBreakdown["Completed"] || 0,
        inProgressCount: executionBreakdown["In Progress"] || 0,
        notStartedCount: executionBreakdown["Not Started"] || 0,
        notStartedWithPastPoCount: notStartedPastPo.length,
        deliveryBeforePoAnomaliesCount: deliveryAnomalies.length,
        quantityDiscrepanciesCount: quantityDiscrepancies,
        softwareAttachCount: softwareAttach,
        softwareAttachRatePct: Math.round(softwareAttachRate * 10) / 10,
      },
      sourceRowIds,
      rowsScanned: workOrders.length,
      assumptions: [
        "Software attach detected when Nature of Work references Spectra, DMO, Dock, or platform",
        "Not started risk flagged when execution status is 'Not Started' and PO Date precedes as-of date",
      ],
      caveats: [
        "Delivered quantity vs PO quantity comparison is only valid when both specify numerical units.",
      ],
      asOfDate: asOf,
      fiscalYear: "FY25-26",
    },
  };
}
