import { DataQualityReport, Deal, WorkOrder } from "./types";
import { normalizeDeals, normalizeWorkOrders, RawMondayItem } from "./normalize";

export function generateDataQualityReport(
  rawDeals: RawMondayItem[],
  rawWorkOrders: RawMondayItem[],
  dealsColumnMap: Record<string, string> = {},
  workOrdersColumnMap: Record<string, string> = {}
): {
  deals: Deal[];
  workOrders: WorkOrder[];
  report: DataQualityReport;
} {
  const dealsResult = normalizeDeals(rawDeals, dealsColumnMap);
  const woResult = normalizeWorkOrders(rawWorkOrders, workOrdersColumnMap);

  const report: DataQualityReport = {
    totalRawDealsRows: dealsResult.report.totalRawDealsRows || 0,
    totalValidDeals: dealsResult.report.totalValidDeals || 0,
    totalRawWorkOrdersRows: woResult.report.totalRawWorkOrdersRows || 0,
    totalValidWorkOrders: woResult.report.totalValidWorkOrders || 0,
    junkRowsDropped:
      (dealsResult.report.junkRowsDropped || 0) + (woResult.report.junkRowsDropped || 0),
    emptyColumnsExcluded: dealsResult.report.emptyColumnsExcluded || [],
    missingRequiredColumns: [
      ...(dealsResult.report.missingRequiredColumns || []),
      ...(woResult.report.missingRequiredColumns || []),
    ],
    maskedPlaceholderValuesCount: dealsResult.report.maskedPlaceholderValuesCount || 0,
    maskedPlaceholderTotalSumExcluded: dealsResult.report.maskedPlaceholderTotalSumExcluded || 0,
    overBilledRecordsCount: woResult.report.overBilledRecordsCount || 0,
    dateAnomaliesCount: woResult.report.dateAnomaliesCount || 0,
    statusStageContradictionsCount: dealsResult.report.statusStageContradictionsCount || 0,
    nearDuplicatesCount:
      (dealsResult.report.nearDuplicatesCount || 0) + (woResult.report.nearDuplicatesCount || 0),
    issues: [...(dealsResult.report.issues || []), ...(woResult.report.issues || [])],
    generatedAt: new Date().toISOString(),
  };

  return {
    deals: dealsResult.deals,
    workOrders: woResult.workOrders,
    report,
  };
}
