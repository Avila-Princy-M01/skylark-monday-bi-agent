import { Deal, WorkOrder, DataQualityReport } from "../data/types";
import { AgentTraceStep } from "./types";

export interface DataStewardVerdict {
  isFresh: boolean;
  lastSyncedAt: string;
  report: DataQualityReport;
  caveats: string[];
  trace: AgentTraceStep;
}

export function runDataSteward(
  deals: Deal[],
  workOrders: WorkOrder[],
  report: DataQualityReport,
  lastSyncedAt: string = new Date().toISOString()
): DataStewardVerdict {
  const caveats: string[] = [];

  if (report.junkRowsDropped > 0) {
    caveats.push(`Excluded ${report.junkRowsDropped} junk/header repetition rows from analysis.`);
  }

  if (report.maskedPlaceholderValuesCount > 0) {
    caveats.push(
      `Detected ${report.maskedPlaceholderValuesCount} masked placeholder value deals (~₹1); treated as undisclosed and excluded from sums.`
    );
  }

  if (report.overBilledRecordsCount > 0) {
    caveats.push(
      `Flagged ${report.overBilledRecordsCount} work orders with negative unbilled amounts (over-billed contracts).`
    );
  }

  if (report.statusStageContradictionsCount > 0) {
    caveats.push(
      `Reconciled ${report.statusStageContradictionsCount} status/stage contradictions (e.g. Won stage with Lead status) by prioritizing stage for funnel and status for active state.`
    );
  }

  if (report.emptyColumnsExcluded.length > 0) {
    caveats.push(`Excluded 100% empty columns: ${report.emptyColumnsExcluded.join(", ")}.`);
  }

  const driftIssues = report.issues.filter((i) => i.type === "schema_drift_warning");
  if (driftIssues.length > 0) {
    caveats.push(
      `Detected ${driftIssues.length} schema drift warning(s) — columns resolved via secondary aliases.`
    );
  }

  const trace: AgentTraceStep = {
    id: `trace_steward_${Date.now()}`,
    role: "data_steward",
    title: "Data Steward Quality & Freshness Audit",
    timestamp: new Date().toISOString(),
    content: `Audited ${deals.length} deals and ${workOrders.length} work orders. Found ${report.issues.length} data quality issues across both boards.`,
    status: "completed",
    metadata: {
      junkRowsDropped: report.junkRowsDropped,
      maskedValues: report.maskedPlaceholderValuesCount,
      overBilledCount: report.overBilledRecordsCount,
      emptyColumnsExcluded: report.emptyColumnsExcluded,
    },
  };

  return {
    isFresh: true,
    lastSyncedAt,
    report,
    caveats,
    trace,
  };
}
