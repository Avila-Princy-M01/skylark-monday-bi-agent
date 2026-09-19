import { Deal, WorkOrder, MetricFactSheet } from "../data/types";
import { createDeterministicToolRegistry } from "../tools/registry";
import { resolveSectorQuery } from "../query/aliases";
import { AgentTraceStep } from "./types";
import { BudgetTracker } from "./budgets";
import { StalledDealsResult, PipelineHealthResult } from "../metrics/pipeline";
import { RevenueResult } from "../metrics/revenue";
import { CollectionsResult } from "../metrics/collections";
import { OperationsResult } from "../metrics/operations";
import { CrossBoardResult } from "../metrics/cross-board";
import { ConcentrationRiskResult } from "../metrics/concentration";
import { StuckMoneyBreakdown } from "../metrics/stuck-money";

export interface AnalystExecutionPlan {
  primaryTool: string;
  supportingTools: string[];
  inferredSector?: string[];
  inferredAsOfDate?: string;
}

export interface AnalystResult {
  factSheets: MetricFactSheet[];
  executedToolNames: string[];
  selfCorrections: string[];
  traces: AgentTraceStep[];
}

type ToolExecutionOutput =
  | StalledDealsResult
  | PipelineHealthResult
  | CollectionsResult
  | RevenueResult
  | OperationsResult
  | ConcentrationRiskResult
  | StuckMoneyBreakdown
  | CrossBoardResult;

export async function runAnalyst(
  query: string,
  deals: Deal[],
  workOrders: WorkOrder[],
  budget: BudgetTracker,
  options: { asOfDate?: string } = {}
): Promise<AnalystResult> {
  const asOf = options.asOfDate || "2026-03-31";
  const tools = createDeterministicToolRegistry({ deals, workOrders, asOfDate: asOf });
  const traces: AgentTraceStep[] = [];
  const factSheets: MetricFactSheet[] = [];
  const executedToolNames: string[] = [];
  const selfCorrections: string[] = [];

  const q = query.toLowerCase();

  // 1. Sector alias detection & resolution
  const sectorResolution = resolveSectorQuery(query);
  const targetSectors =
    sectorResolution.matchedSectors.length > 0 ? sectorResolution.matchedSectors : undefined;

  // 2. Identify primary and supporting tools based on query intent
  let primaryToolName = "get_pipeline_health";
  const supportingTools: string[] = [];

  if (q.includes("stalled") || q.includes("aging") || q.includes("delayed")) {
    primaryToolName = "get_stalled_deals";
    supportingTools.push("get_pipeline_health");
  } else if (
    q.includes("collection") ||
    q.includes("ar") ||
    q.includes("receivable") ||
    q.includes("over-billed")
  ) {
    primaryToolName = "get_collections_and_ar";
    supportingTools.push("get_revenue_metrics");
  } else if (
    q.includes("revenue") ||
    q.includes("billed") ||
    q.includes("contract") ||
    q.includes("order book")
  ) {
    primaryToolName = "get_revenue_metrics";
    supportingTools.push("get_collections_and_ar");
  } else if (
    q.includes("operation") ||
    q.includes("delivery") ||
    q.includes("attach") ||
    q.includes("spectra") ||
    q.includes("not started")
  ) {
    primaryToolName = "get_operational_metrics";
    supportingTools.push("get_revenue_metrics");
  } else if (q.includes("concentration") || q.includes("top client") || q.includes("client risk")) {
    primaryToolName = "get_concentration_risk";
    supportingTools.push("get_pipeline_health");
  } else if (q.includes("stuck") || q.includes("conversion")) {
    primaryToolName = "get_stuck_money_analysis";
    supportingTools.push("get_pipeline_health", "get_collections_and_ar");
  } else if (
    q.includes("cross") ||
    q.includes("owner scorecard") ||
    q.includes("sector scorecard") ||
    q.includes("performance")
  ) {
    primaryToolName = "get_cross_board_scorecards";
  }

  // Execute primary tool
  if (budget.recordAnalystToolCall()) {
    executedToolNames.push(primaryToolName);
    let res: ToolExecutionOutput | undefined;

    if (primaryToolName === "get_stalled_deals") {
      res = await tools.get_stalled_deals.execute({ sector: targetSectors, asOfDate: asOf });
    } else if (primaryToolName === "get_pipeline_health") {
      res = await tools.get_pipeline_health.execute({ sector: targetSectors, asOfDate: asOf });
    } else if (primaryToolName === "get_collections_and_ar") {
      res = await tools.get_collections_and_ar.execute({ sector: targetSectors, asOfDate: asOf });
    } else if (primaryToolName === "get_revenue_metrics") {
      res = await tools.get_revenue_metrics.execute({ sector: targetSectors, asOfDate: asOf });
    } else if (primaryToolName === "get_operational_metrics") {
      res = await tools.get_operational_metrics.execute({ sector: targetSectors, asOfDate: asOf });
    } else if (primaryToolName === "get_concentration_risk") {
      res = await tools.get_concentration_risk.execute({ topN: 5, asOfDate: asOf });
    } else if (primaryToolName === "get_stuck_money_analysis") {
      res = await tools.get_stuck_money_analysis.execute({ asOfDate: asOf });
    } else if (primaryToolName === "get_cross_board_scorecards") {
      res = await tools.get_cross_board_scorecards.execute({ asOfDate: asOf });
    }

    if (res && res.factSheet) {
      factSheets.push(res.factSheet);
    }

    traces.push({
      id: `trace_analyst_primary_${Date.now()}`,
      role: "analyst",
      title: `Executed ${primaryToolName}`,
      timestamp: new Date().toISOString(),
      toolCall: {
        toolName: primaryToolName,
        args: { sector: targetSectors, asOfDate: asOf },
        output: res,
        rowsScanned: res?.factSheet?.rowsScanned,
        sourceRowIds: res?.factSheet?.sourceRowIds,
      },
      status: "completed",
    });

    // Self-correction check: If result is empty / 0 rows matching sector filter
    const openCount =
      "openDealsCount" in (res || {}) ? (res as PipelineHealthResult).openDealsCount : undefined;
    const woCount =
      "workOrderCount" in (res || {}) ? (res as RevenueResult).workOrderCount : undefined;

    if (openCount === 0 || woCount === 0) {
      selfCorrections.push(
        `Initial query returned 0 rows for sector filter ${JSON.stringify(
          targetSectors
        )}. Expanding alias and querying global baseline.`
      );
      if (budget.recordAnalystToolCall()) {
        const fallbackRes = await tools.get_pipeline_health.execute({ asOfDate: asOf });
        if (fallbackRes?.factSheet) {
          factSheets.push(fallbackRes.factSheet);
        }
        traces.push({
          id: `trace_analyst_self_correct_${Date.now()}`,
          role: "analyst",
          title: "Analyst Autonomous Self-Correction",
          timestamp: new Date().toISOString(),
          content:
            "Self-corrected zero-match filter by pulling global baseline for comparative context.",
          status: "completed",
        });
      }
    }
  }

  // Execute supporting tools if budget allows
  for (const suppTool of supportingTools) {
    if (!budget.recordAnalystToolCall()) break;
    executedToolNames.push(suppTool);
    let sRes: ToolExecutionOutput | undefined;

    if (suppTool === "get_pipeline_health") {
      sRes = await tools.get_pipeline_health.execute({ sector: targetSectors, asOfDate: asOf });
    } else if (suppTool === "get_revenue_metrics") {
      sRes = await tools.get_revenue_metrics.execute({ sector: targetSectors, asOfDate: asOf });
    } else if (suppTool === "get_collections_and_ar") {
      sRes = await tools.get_collections_and_ar.execute({ sector: targetSectors, asOfDate: asOf });
    }

    if (sRes?.factSheet) {
      factSheets.push(sRes.factSheet);
    }

    traces.push({
      id: `trace_analyst_supp_${suppTool}_${Date.now()}`,
      role: "analyst",
      title: `Executed supporting tool ${suppTool}`,
      timestamp: new Date().toISOString(),
      toolCall: {
        toolName: suppTool,
        args: { sector: targetSectors, asOfDate: asOf },
        output: sRes,
        rowsScanned: sRes?.factSheet?.rowsScanned,
      },
      status: "completed",
    });
  }

  return {
    factSheets,
    executedToolNames,
    selfCorrections,
    traces,
  };
}
