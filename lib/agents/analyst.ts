import { Deal, WorkOrder, MetricFactSheet } from "../data/types";
import { createDeterministicToolRegistry, MetricToolName } from "../tools/registry";
import { resolveSectorQuery } from "../query/aliases";
import { AgentTraceStep } from "./types";
import { BudgetTracker } from "./budgets";
import { AnalystPlan, planDeterministically } from "./planner";

export interface AnalystResult {
  factSheets: MetricFactSheet[];
  executedToolNames: string[];
  selfCorrections: string[];
  traces: AgentTraceStep[];
}

export interface AnalystOptions {
  asOfDate?: string;
  /** Plan produced by the LLM planner, or by the deterministic router. */
  plan?: AnalystPlan;
  /** Feedback from the Critic that triggered this re-analysis pass. */
  criticFeedback?: string;
  /** Tools the Critic asked to be run again or additionally. */
  requestedTools?: MetricToolName[];
}

interface ToolExecution {
  factSheet: MetricFactSheet;
  /** True when the filter matched nothing, which drives self-correction. */
  isEmpty: boolean;
}

/**
 * Executes the deterministic metric toolbelt.
 *
 * The Analyst never computes anything itself: it selects tools (from a plan),
 * observes their results, and reacts. Its autonomy is limited to reacting well —
 * retrying with a widened filter when a sector match comes back empty, and
 * pulling supporting metrics when the Critic asks for more depth.
 */
export async function runAnalyst(
  query: string,
  deals: Deal[],
  workOrders: WorkOrder[],
  budget: BudgetTracker,
  options: AnalystOptions = {}
): Promise<AnalystResult> {
  const asOf = options.asOfDate || "2026-03-31";
  const tools = createDeterministicToolRegistry({ deals, workOrders, asOfDate: asOf });
  const traces: AgentTraceStep[] = [];
  const factSheets: MetricFactSheet[] = [];
  const executedToolNames: string[] = [];
  const selfCorrections: string[] = [];

  let plan = options.plan ?? planDeterministically(query);

  // A critic-requested re-analysis prioritises the tools it explicitly named.
  if (options.requestedTools && options.requestedTools.length > 0) {
    plan = {
      ...plan,
      primaryTool: options.requestedTools[0],
      supportingTools: options.requestedTools.slice(1),
    };
  }

  // Sector scope comes from the plan, or from the alias table (which also
  // resolves composites like "energy" -> Renewables + Powerline). If that filter
  // matches nothing, the self-correction step below widens it and says so, so a
  // bad alias can never be silently reported as "zero business".
  const targetsSectors =
    plan.sectors && plan.sectors.length > 0
      ? plan.sectors
      : (() => {
          const alias = resolveSectorQuery(query);
          return alias.matchedSectors.length > 0 ? alias.matchedSectors : undefined;
        })();

  /** Runs one tool and reports whether its filter matched nothing. */
  const runTool = async (toolName: MetricToolName): Promise<ToolExecution | undefined> => {
    if (!budget.recordAnalystToolCall()) return undefined;

    const args = { sector: targetsSectors, asOfDate: asOf };

    switch (toolName) {
      case "get_pipeline_health": {
        const res = await tools.get_pipeline_health.execute(args);
        return { factSheet: res.factSheet, isEmpty: res.openDealsCount === 0 };
      }
      case "get_stalled_deals": {
        const res = await tools.get_stalled_deals.execute(args);
        return { factSheet: res.factSheet, isEmpty: res.stalledDealsCount === 0 };
      }
      case "get_revenue_metrics": {
        const res = await tools.get_revenue_metrics.execute(args);
        return { factSheet: res.factSheet, isEmpty: res.workOrderCount === 0 };
      }
      case "get_collections_and_ar": {
        const res = await tools.get_collections_and_ar.execute(args);
        return {
          factSheet: res.factSheet,
          isEmpty: res.arPriorityAccounts.length === 0 && res.totalBilledInclGst === 0,
        };
      }
      case "get_operational_metrics": {
        const res = await tools.get_operational_metrics.execute(args);
        return { factSheet: res.factSheet, isEmpty: res.totalWorkOrders === 0 };
      }
      case "get_cross_board_scorecards": {
        const res = await tools.get_cross_board_scorecards.execute({ asOfDate: asOf });
        return {
          factSheet: res.factSheet,
          isEmpty:
            res.ownerScorecards.length === 0 &&
            res.sectorScorecards.length === 0 &&
            deals.length + workOrders.length > 0,
        };
      }
      case "get_concentration_risk": {
        const res = await tools.get_concentration_risk.execute({ topN: 5, asOfDate: asOf });
        return { factSheet: res.factSheet, isEmpty: res.topClientsPipeline.length === 0 };
      }
      case "get_stuck_money_analysis": {
        const res = await tools.get_stuck_money_analysis.execute({ asOfDate: asOf });
        return { factSheet: res.factSheet, isEmpty: false };
      }
      default:
        return undefined;
    }
  };

  const recordTool = (toolName: MetricToolName, execution: ToolExecution, note?: string) => {
    executedToolNames.push(toolName);
    factSheets.push(execution.factSheet);
    traces.push({
      id: `trace_analyst_${toolName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: "analyst",
      title: `Executed ${toolName}`,
      timestamp: new Date().toISOString(),
      content: note,
      toolCall: {
        toolName,
        args: { sector: targetsSectors ?? null, asOfDate: asOf },
        rowsScanned: execution.factSheet.rowsScanned,
        sourceRowIds: execution.factSheet.sourceRowIds,
      },
      status: "completed",
      metadata: {
        emptyResult: execution.isEmpty,
        metricKeys: Object.keys(execution.factSheet.numbers),
      },
    });
  };

  if (options.criticFeedback) {
    traces.push({
      id: `trace_analyst_reanalysis_${Date.now()}`,
      role: "analyst",
      title: "Analyst re-running metrics after Critic feedback",
      timestamp: new Date().toISOString(),
      content: options.criticFeedback,
      status: "running",
    });
  }

  // 1. Primary tool
  const primary = await runTool(plan.primaryTool);
  if (primary) {
    recordTool(plan.primaryTool, primary);
  }

  // 2. Self-correction: an empty sector match is usually a filter problem, not a
  //    "we have no business" answer, so widen the filter and say so.
  if (primary?.isEmpty && targetsSectors && targetsSectors.length > 0) {
    const message =
      `Initial query returned 0 rows for sector filter ${JSON.stringify(targetsSectors)}. ` +
      "Widening the filter and querying the global baseline so the answer is not misread as zero business.";
    selfCorrections.push(message);

    if (budget.recordAnalystToolCall()) {
      const widenedArgs = { sector: undefined, asOfDate: asOf };
      let widenedExec: ToolExecution | undefined;
      switch (plan.primaryTool) {
        case "get_revenue_metrics": {
          const res = await tools.get_revenue_metrics.execute(widenedArgs);
          widenedExec = { factSheet: res.factSheet, isEmpty: res.workOrderCount === 0 };
          break;
        }
        case "get_pipeline_health": {
          const res = await tools.get_pipeline_health.execute(widenedArgs);
          widenedExec = { factSheet: res.factSheet, isEmpty: res.openDealsCount === 0 };
          break;
        }
        case "get_stalled_deals": {
          const res = await tools.get_stalled_deals.execute(widenedArgs);
          widenedExec = { factSheet: res.factSheet, isEmpty: res.stalledDealsCount === 0 };
          break;
        }
        case "get_collections_and_ar": {
          const res = await tools.get_collections_and_ar.execute(widenedArgs);
          widenedExec = { factSheet: res.factSheet, isEmpty: res.totalBilledInclGst === 0 };
          break;
        }
        case "get_operational_metrics": {
          const res = await tools.get_operational_metrics.execute(widenedArgs);
          widenedExec = { factSheet: res.factSheet, isEmpty: res.totalWorkOrders === 0 };
          break;
        }
      }

      if (widenedExec && !widenedExec.isEmpty) {
        if (factSheets.length > 0) {
          factSheets[0] = widenedExec.factSheet;
        } else {
          factSheets.push(widenedExec.factSheet);
        }
        executedToolNames.push(`${plan.primaryTool} (widened)`);
      } else {
        const widened = await tools.get_pipeline_health.execute({ asOfDate: asOf });
        factSheets.push(widened.factSheet);
        executedToolNames.push("get_pipeline_health (widened)");
      }

      traces.push({
        id: `trace_analyst_self_correct_${Date.now()}`,
        role: "analyst",
        title: "Analyst self-correction: widened empty filter",
        timestamp: new Date().toISOString(),
        content: message,
        status: "warn",
        metadata: { droppedFilter: targetsSectors },
      });
    }
  }

  // 3. Supporting tools requested by the plan
  for (const toolName of plan.supportingTools) {
    if (toolName === plan.primaryTool) continue;
    if (budget.isTimeExceeded()) break;
    const execution = await runTool(toolName);
    if (execution) {
      recordTool(toolName, execution, "Supporting metric pulled for additional context.");
    }
  }

  return { factSheets, executedToolNames, selfCorrections, traces };
}
