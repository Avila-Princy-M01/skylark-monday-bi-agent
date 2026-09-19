import { MetricFactSheet } from "../data/types";
import { CriticReview, AgentTraceStep } from "./types";
import { validateNumericGrounding } from "../narrate/numeric-guard";

export function runCriticVerification(
  query: string,
  factSheets: MetricFactSheet[],
  candidateProse: string,
  iterationCount: number = 0
): {
  review: CriticReview;
  trace: AgentTraceStep;
} {
  const missingAngles: string[] = [];
  const grounding = validateNumericGrounding(candidateProse, factSheets);

  // 1. Verify Numeric Grounding
  if (!grounding.isGrounded) {
    missingAngles.push(
      `Hallucination/Ungrounded numbers detected: ${grounding.unverifiedNumbers.join(", ")}`
    );
  }

  // 2. Check completeness against query keywords
  const q = query.toLowerCase();
  if (
    (q.includes("stalled") || q.includes("aging")) &&
    !candidateProse.toLowerCase().includes("stalled")
  ) {
    missingAngles.push("Missing explicit analysis of stalled pipeline deals.");
  }

  if (
    (q.includes("ar") || q.includes("collection") || q.includes("receivable")) &&
    !candidateProse.toLowerCase().includes("ar") &&
    !candidateProse.toLowerCase().includes("collection")
  ) {
    missingAngles.push("Missing receivables / collection efficiency metric details.");
  }

  const approved = grounding.isGrounded && missingAngles.length === 0;
  const score = approved ? 10 : Math.max(2, 8 - missingAngles.length * 3);

  const trace: AgentTraceStep = {
    id: `trace_critic_${Date.now()}`,
    role: "critic",
    title: "Critic / Verifier Audit Pass",
    timestamp: new Date().toISOString(),
    content: approved
      ? `Audit Passed (Score 10/10). All numbers strictly grounded in fact sheet with zero unverified figures.`
      : `Audit Revision Requested (Iteration ${iterationCount + 1}): ${missingAngles.join("; ")}`,
    status: approved ? "completed" : "warn",
    metadata: {
      score,
      approved,
      unverifiedNumbers: grounding.unverifiedNumbers,
      missingAngles,
    },
  };

  return {
    review: {
      approved,
      score,
      feedback: approved ? undefined : missingAngles.join("\n"),
      missingAngles,
      groundingFailures: grounding.unverifiedNumbers,
    },
    trace,
  };
}
