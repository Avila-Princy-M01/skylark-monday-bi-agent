import { z } from "zod";
import { completeJson, isLlmAvailable } from "../llm/client";
import { jevChoice, isJevConfigured } from "../jev/client";
import { METRIC_TOOL_NAMES, MetricToolName } from "../tools/registry";
import { resolveSectorQuery, KNOWN_CANONICAL_SECTORS } from "../query/aliases";
import { resolveDateWindow, DateWindow } from "../query/fiscal";
import { JevConfig } from "../config";
import { AgentTraceStep } from "./types";

/**
 * The Analyst's execution plan.
 *
 * This is the one place where the LLM is allowed to "decide" anything, and what
 * it decides is strictly bounded: WHICH deterministic metrics to run, in WHICH
 * order, and against WHICH sector/time filter. It cannot invent a metric, and it
 * cannot produce a number. If it proposes an unknown tool, the plan is rejected
 * and the deterministic router runs instead.
 */

const PlanSchema = z.object({
  primaryTool: z.enum(METRIC_TOOL_NAMES),
  supportingTools: z.array(z.enum(METRIC_TOOL_NAMES)).max(3).nullish(),
  sectors: z.array(z.string()).max(4).nullish(),
  timeExpression: z.string().nullish(),
  rationale: z.string().nullish(),
});

export type AnalystPlanSource = "jev" | "llm" | "deterministic";

export interface AnalystPlan {
  primaryTool: MetricToolName;
  supportingTools: MetricToolName[];
  sectors?: string[];
  timeExpression?: string;
  timeWindow?: DateWindow;
  rationale: string;
  source: AnalystPlanSource;
  /** Populated when the configured provider chain was degraded. */
  llmWarning?: string;
}

const SYSTEM_PROMPT = `You are the Analyst planner for a business-intelligence agent over two monday.com boards: "Deals" (sales pipeline) and "Work Orders" (project execution and billing).

Your ONLY job is to choose which deterministic metric tools to run. You never perform arithmetic, never estimate a figure, and never answer the question yourself.

Available tools:
- get_pipeline_health: total open pipeline value, probability-weighted pipeline, deal counts, mean/median deal size, sector/owner/stage breakdowns.
- get_stalled_deals: open deals whose tentative close date has already passed.
- get_revenue_metrics: contracted order value (excl. GST) vs billed revenue (excl. GST) vs cash collected (incl. GST).
- get_collections_and_ar: collection efficiency percentage, outstanding receivables, top AR-risk accounts.
- get_operational_metrics: execution status mix, work orders not started despite a past PO date, software attach rate.
- get_cross_board_scorecards: owner and sector scorecards joining both boards on owner code and sector.
- get_concentration_risk: top client and owner share of pipeline and order book.
- get_stuck_money_analysis: the conversion chain from won deals to unbilled backlog to uncollected receivables.
- get_temporal_trends: historical velocity, pipeline shifts, collection efficiency trend, and delta metrics across synchronization snapshots.

Sector vocabulary present in the data: Mining, Powerline, Renewables, Railways, DSP, Tender, Construction, Security and Surveillance, Aviation, Manufacturing, Others.
Note: "energy" is not a stored sector. If the user says energy, return ["Renewables", "Powerline"].

Rules:
- Choose exactly one primaryTool: the metric that most directly answers the question.
- Add up to 3 supportingTools only when they are genuinely needed to answer fully.
- Only populate "sectors" if the user named a sector; use canonical sector names from the list above.
- Put the user's time framing verbatim in "timeExpression" (for example "this quarter", "last quarter", "FY25-26"), or null if they gave none.
- Keep "rationale" to one short sentence.

Respond with raw JSON only, no prose and no markdown fences:
{"primaryTool":"...","supportingTools":["..."],"sectors":["..."],"timeExpression":null,"rationale":"..."}`;

/**
 * Deterministic keyword router.
 *
 * Used when no provider key is configured, when every provider fails, or when
 * the model returns an invalid plan. This is what guarantees the agent still
 * answers questions with zero working LLM credentials.
 */
export function planDeterministically(query: string): AnalystPlan {
  const q = query.toLowerCase();

  let primaryTool: MetricToolName = "get_pipeline_health";
  const supportingTools: MetricToolName[] = [];

  if (
    q.includes("trend") ||
    q.includes("velocity") ||
    q.includes("trajectory") ||
    q.includes("over time") ||
    q.includes("historical") ||
    q.includes("month over month") ||
    q.includes("mom")
  ) {
    primaryTool = "get_temporal_trends";
    supportingTools.push("get_pipeline_health", "get_collections_and_ar");
  } else if (q.includes("stalled") || q.includes("aging") || q.includes("overdue")) {
    primaryTool = "get_stalled_deals";
    supportingTools.push("get_pipeline_health");
  } else if (q.includes("concentration") || q.includes("top client") || q.includes("client risk")) {
    primaryTool = "get_concentration_risk";
    supportingTools.push("get_pipeline_health");
  } else if (q.includes("stuck") || q.includes("conversion") || q.includes("trapped")) {
    primaryTool = "get_stuck_money_analysis";
    supportingTools.push("get_pipeline_health", "get_collections_and_ar");
  } else if (
    q.includes("collection") ||
    q.includes("receivable") ||
    q.includes(" ar") ||
    q.includes("ar ") ||
    q.includes("unpaid")
  ) {
    primaryTool = "get_collections_and_ar";
    supportingTools.push("get_revenue_metrics");
  } else if (
    q.includes("revenue") ||
    q.includes("billed") ||
    q.includes("order book") ||
    q.includes("contract")
  ) {
    primaryTool = "get_revenue_metrics";
    supportingTools.push("get_collections_and_ar");
  } else if (
    q.includes("operation") ||
    q.includes("delivery") ||
    q.includes("attach") ||
    q.includes("spectra") ||
    q.includes("not started")
  ) {
    primaryTool = "get_operational_metrics";
    supportingTools.push("get_revenue_metrics");
  } else if (
    q.includes("scorecard") ||
    q.includes("cross board") ||
    q.includes("cross-board") ||
    q.includes("performing") ||
    q.includes("performance")
  ) {
    // Deliberately does NOT trigger on the bare word "sector": "pipeline in the
    // Mining sector" is a pipeline question, and matching on "sector" alone
    // would silently redirect it to the cross-board scorecard instead.
    primaryTool = "get_cross_board_scorecards";
    supportingTools.push("get_pipeline_health");
  }

  return {
    primaryTool,
    supportingTools,
    sectors: undefined,
    timeExpression: undefined,
    rationale: "Selected by the deterministic keyword router.",
    source: "deterministic",
  };
}

function resolveSectorsFromQuery(query: string, llmSectors: string[]): string[] | undefined {
  // Prefer the model's canonical sectors, but let the alias table override when
  // it recognises a composite ("energy" -> Renewables + Powerline), because that
  // mapping is curated and tested.
  const alias = resolveSectorQuery(query);
  if (alias.isSyntheticComposite || alias.matchedSectors.length === 1) {
    if (alias.matchedSectors.length > 0) return alias.matchedSectors;
  }

  // Only accept LLM-proposed sectors if they match canonical sectors in our data
  const validLlmSectors = llmSectors
    .map((s) =>
      KNOWN_CANONICAL_SECTORS.find((canon) => canon.toLowerCase() === s.trim().toLowerCase())
    )
    .filter((s): s is string => Boolean(s));

  return validLlmSectors.length > 0 ? validLlmSectors : undefined;
}

export interface PlanOptions {
  asOfDate?: string;
  /** Test seam: force deterministic planning. */
  disableLlm?: boolean;
  /** Prior conversation turns, so follow-ups inherit the earlier intent. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Test seam: lets tests inject a mocked fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam: lets tests inject a custom Jev config. */
  jevConfig?: JevConfig;
}

export async function createAnalystPlan(
  query: string,
  options: PlanOptions = {}
): Promise<{ plan: AnalystPlan; trace: AgentTraceStep }> {
  const asOfDate = options.asOfDate;
  const deterministic = planDeterministically(query);

  let plan = deterministic;
  let llmWarning: string | undefined;

  // 1. First preference: Jev System-1 Calibrated Decision Engine (if configured)
  const jevConfigured = options.jevConfig ? Boolean(options.jevConfig.apiKey) : isJevConfigured();
  if (!options.disableLlm && jevConfigured) {
    try {
      const jevChoiceResult = await jevChoice(
        {
          query,
          context: "Select the single primary metric tool that directly answers this query.",
        },
        "primaryTool",
        `Which deterministic metric tool is the primary tool needed to answer: "${query}"?`,
        METRIC_TOOL_NAMES,
        { fetchImpl: options.fetchImpl, config: options.jevConfig }
      );

      if (jevChoiceResult && METRIC_TOOL_NAMES.includes(jevChoiceResult.choice)) {
        const sectorAlias = resolveSectorQuery(query);
        const matchedSectors =
          sectorAlias.matchedSectors.length > 0 ? sectorAlias.matchedSectors : undefined;

        // Populate supporting tools aligned with the deterministic topology
        const defaultSupporting = deterministic.supportingTools.filter(
          (t) => t !== jevChoiceResult.choice
        );

        plan = {
          primaryTool: jevChoiceResult.choice,
          supportingTools: defaultSupporting,
          sectors: matchedSectors,
          timeExpression: undefined,
          rationale: `Selected by Jev System-1 decision model (confidence: ${(
            jevChoiceResult.confidence * 100
          ).toFixed(0)}%).`,
          source: "jev",
        };
      }
    } catch (err) {
      console.warn("[Planner] Jev decision failed, falling back to LLM chain:", err);
    }
  }

  // 2. Second preference: LLM Provider Chain (Gemini / GLM / Groq / OpenRouter) if Jev wasn't used
  if (plan.source === "deterministic" && !options.disableLlm && isLlmAvailable()) {
    const history = options.history ?? [];
    const historyBlock =
      history.length > 0
        ? `\n\nConversation so far (oldest first):\n${history
            .map((turn) => `${turn.role === "user" ? "User" : "Agent"}: ${turn.content}`)
            .join(
              "\n"
            )}\n\nThe new question may be a follow-up ("and for mining?", "what about last quarter?"). Inherit the sector, metric basis and time frame from the earlier turns that the follow-up does not override.`
        : "";

    const result = await completeJson(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${query}${historyBlock}` },
      ],
      PlanSchema,
      { temperature: 0 }
    );

    if (result) {
      const llmSectors = resolveSectorsFromQuery(query, result.data.sectors ?? []);
      plan = {
        primaryTool: result.data.primaryTool,
        supportingTools: (result.data.supportingTools ?? []).filter(
          (tool) => tool !== result.data.primaryTool
        ),
        sectors: llmSectors,
        timeExpression: result.data.timeExpression ?? undefined,
        rationale: result.data.rationale || "Selected by the LLM planner.",
        source: "llm",
      };
    } else {
      llmWarning =
        "Every configured LLM provider failed during planning; fell back to the deterministic keyword router.";
    }
  } else if (!options.disableLlm && plan.source === "deterministic" && !isJevConfigured()) {
    llmWarning = "No LLM provider key configured; planner ran the deterministic keyword router.";
  }

  const timeWindow = resolveDateWindow(plan.timeExpression || "", asOfDate);
  plan = { ...plan, timeWindow, llmWarning };

  const trace: AgentTraceStep = {
    id: `trace_planner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: "supervisor",
    title:
      plan.source === "jev"
        ? "Supervisor delegated tool selection to Jev System-1 decision model"
        : plan.source === "llm"
          ? "Supervisor delegated tool selection to the LLM planner"
          : "Supervisor used the deterministic planner",
    timestamp: new Date().toISOString(),
    content:
      `${plan.rationale} Primary=${plan.primaryTool}` +
      (plan.supportingTools.length > 0 ? `; supporting=${plan.supportingTools.join(", ")}` : "") +
      (plan.sectors?.length ? `; sectors=${plan.sectors.join(" + ")}` : "") +
      (plan.timeExpression ? `; time="${plan.timeExpression}"` : ""),
    status: llmWarning ? "warn" : "completed",
    metadata: {
      source: plan.source,
      primaryTool: plan.primaryTool,
      supportingTools: plan.supportingTools,
      sectors: plan.sectors ?? [],
      timeWindow: plan.timeWindow && {
        label: plan.timeWindow.label,
        startDate: plan.timeWindow.startDate,
        endDate: plan.timeWindow.endDate,
      },
      llmWarning,
    },
  };

  return { plan, trace };
}

export { PlanSchema };
