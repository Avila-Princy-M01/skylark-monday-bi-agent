import { Deal, WorkOrder, DataQualityReport } from "../data/types";
import { MultiAgentExecutionResult, AgentTraceStep } from "./types";
import { BudgetTracker, DEFAULT_BUDGET_CONFIG } from "./budgets";
import { runDataSteward } from "./data-steward";
import { runClarifierWithLlm } from "./clarifier";
import { runAnalyst } from "./analyst";
import { runCriticVerification } from "./critic";
import { runNarratorWithLlm } from "./narrator";
import { createAnalystPlan } from "./planner";
import { routeDegradedQuery } from "./degraded-router";

export interface SupervisorOptions {
  deals: Deal[];
  workOrders: WorkOrder[];
  report: DataQualityReport;
  lastSyncedAt?: string;
  asOfDate?: string;
  maxWallClockSeconds?: number;
  /** Loader warnings (stale snapshot, auth failure, …) surfaced as caveats. */
  warnings?: string[];
  /** Receives every trace step as it happens, enabling live streaming. */
  onTrace?: (step: AgentTraceStep) => void;
  /** Test seam: force every agent down its deterministic path. */
  disableLlm?: boolean;
}

function makeTraceId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Supervisor: the orchestration loop.
 *
 * Sequence and delegation:
 *   Data Steward  → freshness, schema and data-quality audit
 *   Clarifier     → ask, or proceed under stated assumptions
 *   Planner       → choose which deterministic metrics to compute
 *   Analyst       → execute those metrics, self-correct on empty filters
 *   Narrator      → write the answer over the verified fact sheet
 *   Critic        → verify grounding and completeness; may send the Analyst
 *                   BACK to recompute before the final write-up
 *
 * Every stage is bounded by the shared BudgetTracker, and the whole loop is
 * wrapped so that a total failure degrades to the deterministic router rather
 * than surfacing an error to the user.
 */
export async function runSupervisorLoop(
  query: string,
  options: SupervisorOptions
): Promise<MultiAgentExecutionResult> {
  const budget = new BudgetTracker({
    ...DEFAULT_BUDGET_CONFIG,
    maxWallClockSeconds: options.maxWallClockSeconds || DEFAULT_BUDGET_CONFIG.maxWallClockSeconds,
  });

  const allTraces: AgentTraceStep[] = [];
  const pushTrace = (step: AgentTraceStep) => {
    allTraces.push(step);
    options.onTrace?.(step);
  };

  const startTrace: AgentTraceStep = {
    id: makeTraceId("trace_sup_start"),
    role: "supervisor",
    title: "Supervisor initiated multi-agent delegation",
    timestamp: new Date().toISOString(),
    content: `Received query: "${query}". Sequence: Data Steward → Clarifier → Planner → Analyst → Narrator → Critic.`,
    status: "running",
  };
  pushTrace(startTrace);

  try {
    // ---- 1. Data Steward -------------------------------------------------
    budget.recordSupervisorStep();
    const stewardVerdict = runDataSteward(
      options.deals,
      options.workOrders,
      options.report,
      options.lastSyncedAt
    );
    pushTrace(stewardVerdict.trace);

    // ---- 2. Clarifier ----------------------------------------------------
    budget.recordSupervisorStep();
    const { verdict: clarifierVerdict, trace: clarifierTrace } = await runClarifierWithLlm(query, {
      disableLlm: options.disableLlm,
    });
    pushTrace(clarifierTrace);

    // ---- 3. Planner ------------------------------------------------------
    budget.recordSupervisorStep();
    const { plan, trace: plannerTrace } = await createAnalystPlan(query, {
      asOfDate: options.asOfDate,
      disableLlm: options.disableLlm,
    });
    pushTrace(plannerTrace);

    // ---- 4. Analyst (first pass) ----------------------------------------
    budget.recordSupervisorStep();
    let analystResult = await runAnalyst(query, options.deals, options.workOrders, budget, {
      asOfDate: options.asOfDate,
      plan,
    });
    analystResult.traces.forEach(pushTrace);

    let combinedAssumptions = [
      ...clarifierVerdict.assumptions,
      ...analystResult.factSheets.flatMap((fs) => fs.assumptions || []),
    ];

    if (plan.timeWindow) {
      combinedAssumptions.push(
        `Resolved time window: ${plan.timeWindow.label} (${plan.timeWindow.startDate} to ${plan.timeWindow.endDate}), fiscal year ${plan.timeWindow.fiscalYear}.`
      );
    }

    let combinedCaveats = [
      ...(options.warnings ?? []),
      ...stewardVerdict.caveats,
      ...analystResult.factSheets.flatMap((fs) => fs.caveats || []),
    ];

    // ---- 5. Narrator + Critic revision loop ------------------------------
    // The loop is bounded twice over: by the critic-revision budget and by the
    // wall-clock budget, and it degrades to serving the last draft rather than
    // failing if the budget runs out mid-revision.
    let narration = await runNarratorWithLlm(
      {
        query,
        factSheets: analystResult.factSheets,
        assumptions: combinedAssumptions,
        caveats: combinedCaveats,
      },
      { disableLlm: options.disableLlm }
    );
    pushTrace(narration.trace);

    let revisionPasses = 0;
    let criticApproved = false;
    let lastCriticTrace: AgentTraceStep | undefined;
    let pendingFeedback: string | undefined;

    while (revisionPasses < DEFAULT_BUDGET_CONFIG.maxCriticRevisions) {
      if (!budget.recordCriticRevision()) break;

      const { review, trace: criticTrace } = runCriticVerification(
        query,
        analystResult.factSheets,
        narration.prose,
        revisionPasses
      );
      lastCriticTrace = criticTrace;
      pushTrace(criticTrace);

      if (review.approved) {
        criticApproved = true;
        break;
      }

      revisionPasses++;
      pendingFeedback = review.feedback;

      // Send the Analyst back to recompute when the gap is missing data rather
      // than merely missing wording. This is the difference between a real
      // verification loop and re-phrasing the same answer.
      if (review.reanalysisRequired && !budget.isTimeExceeded()) {
        const reanalysis = await runAnalyst(query, options.deals, options.workOrders, budget, {
          asOfDate: options.asOfDate,
          plan,
          criticFeedback: review.feedback,
          requestedTools: review.requestedTools,
        });
        reanalysis.traces.forEach(pushTrace);

        analystResult = {
          factSheets: [...analystResult.factSheets, ...reanalysis.factSheets],
          executedToolNames: [...analystResult.executedToolNames, ...reanalysis.executedToolNames],
          selfCorrections: [...analystResult.selfCorrections, ...reanalysis.selfCorrections],
          traces: [...analystResult.traces, ...reanalysis.traces],
        };

        combinedAssumptions = [
          ...combinedAssumptions,
          ...reanalysis.factSheets.flatMap((fs) => fs.assumptions || []),
        ];
        combinedCaveats = [
          ...combinedCaveats,
          ...reanalysis.factSheets.flatMap((fs) => fs.caveats || []),
        ];
      }
    }

    // ---- 6. Final narration with whatever the Critic asked for -----------
    if (!criticApproved && pendingFeedback) {
      narration = await runNarratorWithLlm(
        {
          query,
          factSheets: analystResult.factSheets,
          assumptions: combinedAssumptions,
          caveats: combinedCaveats,
          criticFeedback: pendingFeedback,
        },
        { disableLlm: options.disableLlm }
      );
      pushTrace(narration.trace);
    }

    // ---- 7. Source rows --------------------------------------------------
    const sourceRowIds = new Set<string>();
    for (const fs of analystResult.factSheets) {
      fs.sourceRowIds?.forEach((id: string) => sourceRowIds.add(id));
    }

    pushTrace({
      id: makeTraceId("trace_sup_done"),
      role: "supervisor",
      title: "Supervisor execution completed",
      timestamp: new Date().toISOString(),
      content:
        `Finished in ${budget.getElapsedSeconds()}s across ${analystResult.executedToolNames.length} tool executions ` +
        `and ${revisionPasses} Critic revision pass(es).` +
        (criticApproved
          ? " Final answer approved by the verifier."
          : " Verifier did not fully approve within the revision budget; the answer is served with its caveats attached."),
      status: criticApproved ? "completed" : "warn",
      metadata: {
        revisionPasses,
        criticApproved,
        toolExecutions: analystResult.executedToolNames,
        selfCorrections: analystResult.selfCorrections,
        elapsedSeconds: budget.getElapsedSeconds(),
        budget: budget.getStatus(),
        lastCriticScore: lastCriticTrace?.metadata?.score,
      },
    });

    return {
      answer: narration.prose,
      traces: allTraces,
      factSheets: analystResult.factSheets,
      assumptions: Array.from(new Set(combinedAssumptions)),
      caveats: Array.from(new Set(combinedCaveats)),
      sourceRowIds: Array.from(sourceRowIds),
      dataQualityIssuesCount: options.report.issues.length,
      clarifyingVerdict: clarifierVerdict.isAmbiguous ? clarifierVerdict : undefined,
      revisionPasses,
      criticRejectedFinal: !criticApproved,
    };
  } catch (err: unknown) {
    // Total failure of the agent runtime: still answer, deterministically.
    const degraded = routeDegradedQuery(query, options.deals, options.workOrders, options.asOfDate);

    pushTrace({
      id: makeTraceId("trace_sup_fallback"),
      role: "supervisor",
      title: "Supervisor dropped to degraded deterministic mode",
      timestamp: new Date().toISOString(),
      content: `Agent runtime exception: ${err instanceof Error ? err.message : String(err)}. Served the deterministic fallback.`,
      status: "error",
    });

    return {
      answer: degraded.answer,
      traces: allTraces,
      factSheets: degraded.factSheets,
      assumptions: ["Served via the deterministic degraded-mode fallback router."],
      caveats: [
        ...(options.warnings ?? []),
        "LLM inference was unavailable; figures were still computed deterministically.",
      ],
      sourceRowIds: [],
      dataQualityIssuesCount: options.report.issues.length,
      isDegradedFallback: true,
      revisionPasses: 0,
      criticRejectedFinal: false,
    };
  }
}
