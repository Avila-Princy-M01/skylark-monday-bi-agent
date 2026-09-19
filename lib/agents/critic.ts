import { MetricFactSheet } from "../data/types";
import { CriticReview, AgentTraceStep } from "./types";
import { validateNumericGrounding } from "../narrate/numeric-guard";
import { MetricToolName } from "../tools/registry";

/**
 * The Critic is an evaluator-optimizer pass sitting between the Analyst and the
 * user. It answers three questions:
 *
 *   1. Is every number in the draft traceable to a verified fact sheet?
 *   2. Did the draft actually answer what was asked?
 *   3. Is the analysis complete enough that a founder would not immediately ask
 *      an obvious follow-up?
 *
 * When it fails a draft it does not merely complain: it names the specific
 * deterministic tools the Analyst should run next, which is what turns the
 * revision loop into real work rather than re-wording the same prose.
 */

interface CompletenessCheck {
  missing: string;
  requestedTools: MetricToolName[];
}

function checkCompleteness(
  query: string,
  prose: string,
  factSheets: MetricFactSheet[]
): CompletenessCheck {
  const q = query.toLowerCase();
  const p = prose.toLowerCase();
  const metricKeys = new Set(factSheets.flatMap((fs) => Object.keys(fs.numbers)));
  const blockers: string[] = [];
  const requestedTools: MetricToolName[] = [];

  if (
    (q.includes("stalled") || q.includes("aging") || q.includes("overdue")) &&
    !p.includes("stall")
  ) {
    blockers.push(
      "The question asked about stalled pipeline but the draft never reports a stalled figure."
    );
    requestedTools.push("get_stalled_deals");
  }

  const asksAboutReceivables =
    q.includes("receivable") ||
    q.includes("collection") ||
    q.includes("unpaid") ||
    q.includes("ar ");
  if (asksAboutReceivables && !p.includes("collection") && !p.includes("receivable")) {
    blockers.push(
      "The question asked about receivables but the draft omits collection efficiency and outstanding AR."
    );
    requestedTools.push("get_collections_and_ar");
  }

  if (
    q.includes("revenue") &&
    !metricKeys.has("billedAmountExclGst") &&
    !p.includes("contracted")
  ) {
    blockers.push(
      "Revenue was requested, but the draft does not separate the three revenue bases (contracted, billed, collected)."
    );
    requestedTools.push("get_revenue_metrics");
  }

  if (
    (q.includes("concentration") || q.includes("top client") || q.includes("risk")) &&
    !metricKeys.has("pipelineTop3ClientSharePct")
  ) {
    blockers.push("Concentration risk was requested but no top-client share figure was computed.");
    requestedTools.push("get_concentration_risk");
  }

  if (
    (q.includes("stuck") || q.includes("trapped")) &&
    !metricKeys.has("uncollectedArValueInclGst")
  ) {
    blockers.push(
      "The 'where is the money stuck' chain needs the won → billed → uncollected sequence."
    );
    requestedTools.push("get_stuck_money_analysis");
  }

  if (
    (q.includes("attach") || q.includes("spectra") || q.includes("dmo")) &&
    !metricKeys.has("softwareAttachRatePct")
  ) {
    blockers.push("Software attach rate was requested but not computed.");
    requestedTools.push("get_operational_metrics");
  }

  return { missing: blockers.join(" "), requestedTools: Array.from(new Set(requestedTools)) };
}

export interface CriticOutput {
  review: CriticReview;
  trace: AgentTraceStep;
}

export function runCriticVerification(
  query: string,
  factSheets: MetricFactSheet[],
  candidateProse: string,
  iterationCount: number = 0
): CriticOutput {
  const missingAngles: string[] = [];
  const requestedTools: MetricToolName[] = [];

  const grounding = validateNumericGrounding(candidateProse, factSheets);
  if (!grounding.isGrounded) {
    missingAngles.push(
      `Hallucination/Ungrounded numbers detected: ${grounding.unverifiedNumbers.join(", ")}`
    );
  }

  const completeness = checkCompleteness(query, candidateProse, factSheets);
  if (completeness.missing) {
    missingAngles.push(completeness.missing);
    requestedTools.push(...completeness.requestedTools);
  }

  const approved = grounding.isGrounded && missingAngles.length === 0;
  const score = approved ? 10 : Math.max(2, 8 - missingAngles.length * 3);

  // Feedback is what the Narrator is told to fix on the next pass. It carries
  // the specific defects verbatim so the revision is targeted rather than a
  // vague "try again".
  const feedback = approved ? undefined : missingAngles.join("\n");

  const trace: AgentTraceStep = {
    id: `trace_critic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: "critic",
    title: "Critic / Verifier Audit Pass",
    timestamp: new Date().toISOString(),
    content: approved
      ? "Audit passed (score 10/10): every figure is grounded in the fact sheet and the question was answered."
      : `Revision requested (pass ${iterationCount + 1}): ${missingAngles.join(" ")}` +
        (requestedTools.length > 0
          ? ` Sending the Analyst back to run: ${requestedTools.join(", ")}.`
          : " The Analyst does not need to re-run metrics; the write-up must change."),
    status: approved ? "completed" : "warn",
    metadata: {
      score,
      approved,
      unverifiedNumbers: grounding.unverifiedNumbers,
      missingAngles,
      requestedTools,
      reanalysisRequired: requestedTools.length > 0,
    },
  };

  return {
    review: {
      approved,
      score,
      feedback,
      missingAngles,
      groundingFailures: grounding.unverifiedNumbers,
      requestedTools,
      reanalysisRequired: requestedTools.length > 0,
    },
    trace,
  };
}
