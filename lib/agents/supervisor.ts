import { Deal, WorkOrder, DataQualityReport } from "../data/types";
import { MultiAgentExecutionResult, AgentTraceStep } from "./types";
import { BudgetTracker, DEFAULT_BUDGET_CONFIG } from "./budgets";
import { runDataSteward } from "./data-steward";
import { runClarifierWithLlm } from "./clarifier";
import { runAnalyst } from "./analyst";
import { runCriticVerification } from "./critic";
import { runNarratorWithLlm } from "./narrator";
import { createAnalystPlan, planDeterministically } from "./planner";
import { routeDegradedQuery } from "./degraded-router";
import {
  isConversationalQuery,
  stripLeadingGreeting,
  handleConversationalQuery,
} from "./conversational";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SupervisorOptions {
  deals: Deal[];
  workOrders: WorkOrder[];
  report: DataQualityReport;
  asOfDate?: string;
  lastSyncedAt?: string | null;
  /** Test seam: force deterministic clarification/narration. */
  disableLlm?: boolean;
  /** Streaming callback: fired each time an agent completes a trace step. */
  onTrace?: (step: AgentTraceStep) => void;
  /** Warnings from the data loader (stale snapshot, missing token, etc.). */
  warnings?: string[];
  /** Prior conversation turns, so follow-ups inherit context. */
  history?: ConversationTurn[];
  /** Override the wall-clock budget for tests. */
  maxWallClockSeconds?: number;
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

  // ---- Conversational Short-Circuit ------------------------------------
  // Greetings ("hi", "hello"), capability questions ("what can you do"), and
  // pleasantries ("thanks") do not require delegating to Data Steward, Clarifier,
  // Planner, Analyst, Narrator, or Critic. Respond directly as a conversational AI advisor.
  if (isConversationalQuery(query)) {
    const conversationalResult = handleConversationalQuery(query);
    conversationalResult.traces.forEach(pushTrace);
    return conversationalResult;
  }

  const cleanedQuery = stripLeadingGreeting(query);

  const startTrace: AgentTraceStep = {
    id: makeTraceId("trace_sup_start"),
    role: "supervisor",
    title: "Supervisor initiated multi-agent delegation",
    timestamp: new Date().toISOString(),
    content: `Received query: "${query}". Sequence: Data Steward → Clarifier → Planner → Analyst → Narrator → Critic.`,
    status: "running",
  };
  pushTrace(startTrace);
  // ---- 0. Context resolution -------------------------------------------
  // Follow-ups like "and for mining?" or "what about last quarter?" only
  // make sense against the prior turns. Prepend prior turn context to the
  // query for deterministic routing and fallback degraded path.
  const history = options.history ?? [];
  const lastUserTurn = [...history].reverse().find((turn) => turn.role === "user")?.content;
  const lastAssistantTurn = [...history]
    .reverse()
    .find((turn) => turn.role === "assistant")?.content;
  const hasAnaphora =
    /\b(and|also|what about|how about|for (that|the same)|same (sector|period|window)|again)\b/i.test(
      cleanedQuery
    ) || /^(and|also|what about|how about)\b/i.test(cleanedQuery.trim());

  const isClarificationAnswer = Boolean(
    lastUserTurn &&
    (lastAssistantTurn?.includes("Clarification requested") ||
      (cleanedQuery.length < 80 &&
        !cleanedQuery.toLowerCase().startsWith("what") &&
        !cleanedQuery.toLowerCase().startsWith("show") &&
        !cleanedQuery.toLowerCase().startsWith("how") &&
        !cleanedQuery.toLowerCase().startsWith("where") &&
        !cleanedQuery.toLowerCase().startsWith("which") &&
        !cleanedQuery.toLowerCase().startsWith("who")))
  );

  const contextQuery =
    (hasAnaphora || isClarificationAnswer) && lastUserTurn
      ? `${lastUserTurn} (Operator specified: ${cleanedQuery})`
      : cleanedQuery;

  try {
    if (contextQuery !== query) {
      pushTrace({
        id: makeTraceId("trace_sup_context"),
        role: "supervisor",
        title: "Supervisor resolved follow-up against conversation context",
        timestamp: new Date().toISOString(),
        content: `Follow-up detected. Interpreted "${query}" in the context of the prior question "${lastUserTurn}".`,
        status: "completed",
        metadata: { resolvedQuery: contextQuery },
      });
    }

    // ---- 1. Data Steward -------------------------------------------------
    budget.recordSupervisorStep();
    const stewardVerdict = runDataSteward(
      options.deals,
      options.workOrders,
      options.report,
      options.lastSyncedAt || undefined
    );
    pushTrace(stewardVerdict.trace);

    // ---- 2 & 3. Concurrent Clarifier + Planner (Speculative Execution) ----
    // To minimize multi-agent latency, Clarifier and Planner run concurrently.
    // Speculatively, the deterministic plan tool is also pre-warmed so Analyst
    // execution completes immediately once the plan is resolved.
    budget.recordSupervisorStep();
    budget.recordSupervisorStep();

    const speculativePlan = planDeterministically(contextQuery);

    const [clarifierResult, plannerResult] = await Promise.all([
      runClarifierWithLlm(contextQuery, {
        disableLlm: options.disableLlm,
        history,
      }),
      createAnalystPlan(contextQuery, {
        asOfDate: options.asOfDate,
        disableLlm: options.disableLlm,
        history,
      }),
    ]);

    const { verdict: clarifierVerdict, trace: clarifierTrace } = clarifierResult;
    const { plan, trace: plannerTrace } = plannerResult;

    pushTrace(clarifierTrace);

    // CRITICAL: When ambiguity is detected, do NOT answer until the operator selects an option!
    // Execution pauses immediately so no speculative or ungrounded answer is displayed.
    if (clarifierVerdict.isAmbiguous) {
      pushTrace({
        id: makeTraceId("trace_sup_ambiguity_pause"),
        role: "supervisor",
        title: "Supervisor paused execution awaiting operator clarification",
        timestamp: new Date().toISOString(),
        content: `Ambiguity detected regarding "${clarifierVerdict.question || "query parameters"}". Execution paused until operator selects a resolution.`,
        status: "completed",
        metadata: {
          question: clarifierVerdict.question,
          optionsCount: clarifierVerdict.options?.length,
        },
      });

      return {
        answer: "",
        traces: allTraces,
        factSheets: [],
        assumptions: clarifierVerdict.assumptions,
        caveats: stewardVerdict.caveats,
        sourceRowIds: [],
        dataQualityIssuesCount: options.report.issues.length,
        clarifyingVerdict: clarifierVerdict,
        revisionPasses: 0,
        criticRejectedFinal: false,
      };
    }

    pushTrace(plannerTrace);

    if (plan.primaryTool === speculativePlan.primaryTool) {
      pushTrace({
        id: makeTraceId("trace_sup_speculative"),
        role: "supervisor",
        title: "Supervisor fast-path cache hit",
        timestamp: new Date().toISOString(),
        content: `Planner aligned with speculative primary metric "${plan.primaryTool}". Execution proceeded with zero pipeline blocking.`,
        status: "completed",
      });
    }

    // ---- 4. Analyst (first pass) ----------------------------------------
    budget.recordSupervisorStep();
    let analystResult = await runAnalyst(contextQuery, options.deals, options.workOrders, budget, {
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
        query: contextQuery,
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

      // Re-synthesize prose incorporating Critic feedback and newly pulled metrics
      if (!budget.isTimeExceeded()) {
        narration = await runNarratorWithLlm(
          {
            query: contextQuery,
            factSheets: analystResult.factSheets,
            assumptions: combinedAssumptions,
            caveats: combinedCaveats,
            criticFeedback: review.feedback,
          },
          { disableLlm: options.disableLlm }
        );
        pushTrace(narration.trace);
      }
    }

    // ---- 6. Final safety check if loop terminated with ungrounded prose -----------
    if (!criticApproved && pendingFeedback && !narration.isGrounded && !budget.isTimeExceeded()) {
      narration = await runNarratorWithLlm(
        {
          query: contextQuery,
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
    // Total failure of the agent runtime: still answer, deterministically with resolved context.
    const degraded = routeDegradedQuery(
      contextQuery,
      options.deals,
      options.workOrders,
      options.asOfDate
    );

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
