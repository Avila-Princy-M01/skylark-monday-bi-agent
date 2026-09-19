import { Deal, WorkOrder, DataQualityReport } from "../data/types";
import { MultiAgentExecutionResult, AgentTraceStep } from "./types";
import { BudgetTracker, DEFAULT_BUDGET_CONFIG } from "./budgets";
import { runDataSteward } from "./data-steward";
import { runClarifier } from "./clarifier";
import { runAnalyst } from "./analyst";
import { runCriticVerification } from "./critic";
import { runNarrator } from "./narrator";
import { routeDegradedQuery } from "./degraded-router";

export interface SupervisorOptions {
  deals: Deal[];
  workOrders: WorkOrder[];
  report: DataQualityReport;
  lastSyncedAt?: string;
  asOfDate?: string;
  maxWallClockSeconds?: number;
}

export async function runSupervisorLoop(
  query: string,
  options: SupervisorOptions
): Promise<MultiAgentExecutionResult> {
  const budget = new BudgetTracker({
    ...DEFAULT_BUDGET_CONFIG,
    maxWallClockSeconds: options.maxWallClockSeconds || DEFAULT_BUDGET_CONFIG.maxWallClockSeconds,
  });

  const allTraces: AgentTraceStep[] = [];
  const sourceRowIds = new Set<string>();

  // Root Supervisor Trace
  allTraces.push({
    id: `trace_sup_start_${Date.now()}`,
    role: "supervisor",
    title: "Supervisor Initiated Multi-Agent Delegation Loop",
    timestamp: new Date().toISOString(),
    content: `Received query: "${query}". Initiating specialized agent sequence (Data Steward → Clarifier → Analyst → Critic → Narrator).`,
    status: "running",
  });

  try {
    // Step 1: Data Steward Audit
    budget.recordSupervisorStep();
    const stewardVerdict = runDataSteward(
      options.deals,
      options.workOrders,
      options.report,
      options.lastSyncedAt
    );
    allTraces.push(stewardVerdict.trace);

    // Step 2: Clarifier Ambiguity & Assumptions Check
    budget.recordSupervisorStep();
    const { verdict: clarifierVerdict, trace: clarifierTrace } = runClarifier(query);
    allTraces.push(clarifierTrace);

    // Step 3: Analyst Autonomous Tool Execution & Self-Correction
    budget.recordSupervisorStep();
    const analystResult = await runAnalyst(query, options.deals, options.workOrders, budget, {
      asOfDate: options.asOfDate,
    });
    allTraces.push(...analystResult.traces);

    // Collect source row IDs from fact sheets
    for (const fs of analystResult.factSheets) {
      if (fs.sourceRowIds) {
        fs.sourceRowIds.forEach((id: string) => sourceRowIds.add(id));
      }
    }

    const combinedAssumptions = [
      ...clarifierVerdict.assumptions,
      ...analystResult.factSheets.flatMap((fs) => fs.assumptions || []),
    ];
    const combinedCaveats = [
      ...stewardVerdict.caveats,
      ...analystResult.factSheets.flatMap((fs) => fs.caveats || []),
    ];

    // Step 4: Narrator First Pass
    const candidateNarrative = runNarrator({
      query,
      factSheets: analystResult.factSheets,
      assumptions: combinedAssumptions,
      caveats: combinedCaveats,
    });
    allTraces.push(candidateNarrative.trace);

    // Step 5: Critic Verification & Revision Loop (Bounded to max 2 passes)
    let criticPasses = 0;
    let finalNarrative = candidateNarrative;

    while (criticPasses < 2 && budget.recordCriticRevision()) {
      criticPasses++;
      const { review, trace: criticTrace } = runCriticVerification(
        query,
        analystResult.factSheets,
        finalNarrative.prose,
        criticPasses
      );
      allTraces.push(criticTrace);

      if (review.approved) {
        break;
      }

      // Re-run narrator with feedback
      finalNarrative = runNarrator({
        query,
        factSheets: analystResult.factSheets,
        assumptions: combinedAssumptions,
        caveats: combinedCaveats,
        criticFeedback: review.feedback,
      });
      allTraces.push(finalNarrative.trace);
    }

    // Supervisor Completion Trace
    allTraces.push({
      id: `trace_sup_done_${Date.now()}`,
      role: "supervisor",
      title: "Supervisor Execution Completed",
      timestamp: new Date().toISOString(),
      content: `Multi-agent loop successfully finished in ${budget.getElapsedSeconds()}s across ${analystResult.executedToolNames.length} tool executions.`,
      status: "completed",
    });

    return {
      answer: finalNarrative.prose,
      traces: allTraces,
      factSheets: analystResult.factSheets,
      assumptions: combinedAssumptions,
      caveats: combinedCaveats,
      sourceRowIds: Array.from(sourceRowIds),
      dataQualityIssuesCount: options.report.issues.length,
      clarifyingVerdict: clarifierVerdict.isAmbiguous ? clarifierVerdict : undefined,
    };
  } catch (err: unknown) {
    // Graceful degraded mode fallback on total failure
    const degraded = routeDegradedQuery(query, options.deals, options.workOrders, options.asOfDate);

    allTraces.push({
      id: `trace_sup_fallback_${Date.now()}`,
      role: "supervisor",
      title: "Supervisor Dropped to Degraded Deterministic Mode",
      timestamp: new Date().toISOString(),
      content: `Encountered agent runtime exception: ${err instanceof Error ? err.message : String(err)}. Served degraded fallback.`,
      status: "warn",
    });

    return {
      answer: degraded.answer,
      traces: allTraces,
      factSheets: degraded.factSheets,
      assumptions: ["Served via deterministic degraded-mode fallback router."],
      caveats: ["LLM runtime inference encountered an issue; figures computed deterministically."],
      sourceRowIds: [],
      dataQualityIssuesCount: options.report.issues.length,
      isDegradedFallback: true,
    };
  }
}
