import { z } from "zod";
import { ClarifierVerdict, AgentTraceStep } from "./types";
import { resolveSectorQuery } from "../query/aliases";
import { completeJson, isLlmAvailable } from "../llm/client";

/**
 * The Clarifier decides whether a question can be answered as asked.
 *
 * Two behaviours are deliberate:
 *  - Ask only when the ambiguity genuinely changes the number (see "revenue"
 *    below, which maps to three different, non-comparable figures).
 *  - Otherwise proceed, but state the assumption inline with a one-click switch,
 *    rather than blocking the user with a question they did not need.
 */

const ClarifierSchema = z.object({
  isAmbiguous: z.boolean(),
  question: z.string().nullable().default(null),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        explanation: z.string().nullable().default(null),
      })
    )
    .max(4)
    .default([]),
  assumptions: z.array(z.string()).max(5).default([]),
});

const SYSTEM_PROMPT = `You are the Clarifier for a business-intelligence agent over two monday.com boards (Deals = sales pipeline, Work Orders = project execution and billing).

Decide whether the question is answerable as asked.

Ask a clarifying question ONLY when the ambiguity would change the number materially. The canonical case: "revenue" is ambiguous because the boards support three non-comparable figures — contracted order value (excl. GST), billed revenue (excl. GST), and cash collected (incl. GST). Asking here is correct.

Do NOT ask when a reasonable default plus a stated assumption is enough. Every answer already discloses its assumptions and the user can override with one click, so unnecessary questions waste the user's time.

Additional context you may rely on:
- "energy" is not a stored sector; the data has Renewables and Powerline.
- The fiscal year is Indian: 1 April to 31 March.
- Money is Indian Rupees (INR).

Respond with raw JSON only, no prose and no markdown fences:
{"isAmbiguous":false,"question":null,"options":[],"assumptions":["..."]}

When isAmbiguous is true, supply 2-4 options, each with a short "label", a snake_case "value", and a plain-English "explanation".`;

const REVENUE_DEFINITION_OPTIONS: ClarifierVerdict["options"] = [
  {
    label: "Contracted Order Book Value (Excl. GST)",
    value: "contracted",
    explanation: "Pre-tax total value of signed Work Orders.",
  },
  {
    label: "Billed Revenue (Invoiced to date)",
    value: "billed",
    explanation: "Actual invoiced revenue for executed milestones.",
  },
  {
    label: "Cash Collected (Receipts incl. GST)",
    value: "collected",
    explanation: "Banked cash receipts to date.",
  },
];

const FISCAL_ASSUMPTION =
  "All quarterly and year-to-date metrics adhere to the Indian Fiscal Year (April 1 to March 31).";

function isBareRevenueQuestion(query: string): boolean {
  const q = query
    .toLowerCase()
    .trim()
    .replace(/[?.!]+$/, "");
  return (
    q === "what is our revenue" ||
    q === "what is revenue" ||
    q === "total revenue" ||
    q === "revenue" ||
    q === "how much revenue" ||
    q === "whats our revenue" ||
    q === "what's our revenue"
  );
}

/**
 * Deterministic clarification. Always available, no LLM required.
 * Kept synchronous because existing callers and tests depend on that shape.
 */
export function runClarifier(query: string): {
  verdict: ClarifierVerdict;
  trace: AgentTraceStep;
} {
  const assumptions: string[] = [];
  let isAmbiguous = false;
  let question: string | undefined;
  let options: ClarifierVerdict["options"];

  if (isBareRevenueQuestion(query)) {
    isAmbiguous = true;
    question = "How would you like revenue defined for this inquiry?";
    options = REVENUE_DEFINITION_OPTIONS;
    assumptions.push(
      "Defaulting to Billed Revenue (Excl. GST) as standard recognized operational revenue."
    );
  }

  const sectorResolution = resolveSectorQuery(query);
  if (sectorResolution.isSyntheticComposite) {
    assumptions.push(
      `Mapped sector query '${sectorResolution.input}' to composite sectors: ${sectorResolution.matchedSectors.join(
        " + "
      )}.`
    );
  }

  assumptions.push(FISCAL_ASSUMPTION);

  const trace: AgentTraceStep = {
    id: `trace_clarifier_${Date.now()}`,
    role: "clarifier",
    title: "Clarifier Ambiguity & Intent Resolution",
    timestamp: new Date().toISOString(),
    content: isAmbiguous
      ? "Detected ambiguity regarding the revenue definition. Prepared quick-reply options and inline assumptions."
      : `Intent resolved unambiguously. Stated ${assumptions.length} explicit operational assumptions.`,
    status: "completed",
    metadata: {
      isAmbiguous,
      assumptionsCount: assumptions.length,
      matchedSectors: sectorResolution.matchedSectors,
      mode: "deterministic",
    },
  };

  return { verdict: { isAmbiguous, question, options, assumptions }, trace };
}

export interface LlmClarifierOptions {
  /** Test seam: force the deterministic clarifier. */
  disableLlm?: boolean;
  /** Prior conversation turns, so follow-up answers aren't re-clarified. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * LLM-assisted clarification. Falls back to `runClarifier` whenever no provider
 * is configured, every provider fails, the response fails schema validation, or
 * the model returns an unusable question (ambiguous with no options).
 */
export async function runClarifierWithLlm(
  query: string,
  options: LlmClarifierOptions = {}
): Promise<{ verdict: ClarifierVerdict; trace: AgentTraceStep }> {
  const deterministic = runClarifier(query);

  if (options.disableLlm || !isLlmAvailable()) {
    return deterministic;
  }

  const history = options.history ?? [];
  const historyBlock =
    history.length > 0
      ? `\n\nConversation so far (oldest first):\n${history
          .map((turn) => `${turn.role === "user" ? "User" : "Agent"}: ${turn.content}`)
          .join(
            "\n"
          )}\n\nTreat the new question as a continuation of this conversation: resolve "it", "that", "and for X?"-style follow-ups against the earlier turns, and do NOT re-ask something the user has already answered.`
      : "";

  const result = await completeJson(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${query}${historyBlock}` },
    ],
    ClarifierSchema,
    { temperature: 0 }
  );

  if (!result) {
    return {
      ...deterministic,
      trace: {
        ...deterministic.trace,
        content: `${deterministic.trace.content} (LLM clarification unavailable; used deterministic rules.)`,
        metadata: { ...deterministic.trace.metadata, mode: "deterministic_fallback" },
      },
    };
  }

  const { isAmbiguous, question, options: llmOptions, assumptions } = result.data;

  // Guard against a malformed clarification: asking a question with no options
  // would dead-end the user, so treat that as "not ambiguous".
  const usableOptions = (llmOptions ?? [])
    .filter((option) => option.label && option.value)
    .map((option) => ({
      label: option.label,
      value: option.value,
      explanation: option.explanation ?? undefined,
    }));

  const wantsToAsk = isAmbiguous && Boolean(question) && usableOptions.length >= 2;

  // Deterministic sector and fiscal disclosures always apply regardless of what
  // the model returned, because they are facts about the data, not judgements.
  const mergedAssumptions = [
    ...(assumptions ?? []),
    ...deterministic.verdict.assumptions.filter(
      (assumption) => !(assumptions ?? []).includes(assumption)
    ),
  ];

  const verdict: ClarifierVerdict = {
    isAmbiguous: wantsToAsk,
    question: wantsToAsk ? (question ?? undefined) : undefined,
    options: wantsToAsk ? usableOptions : undefined,
    assumptions: mergedAssumptions,
  };

  const trace: AgentTraceStep = {
    id: `trace_clarifier_llm_${Date.now()}`,
    role: "clarifier",
    title: "Clarifier Ambiguity & Intent Resolution (LLM-assisted)",
    timestamp: new Date().toISOString(),
    content: wantsToAsk
      ? `Model flagged the question as ambiguous and proposed ${usableOptions.length} options.`
      : `Model judged the question answerable as asked under ${mergedAssumptions.length} stated assumptions.`,
    status: "completed",
    metadata: {
      isAmbiguous: wantsToAsk,
      assumptionsCount: mergedAssumptions.length,
      provider: result.provider,
      model: result.model,
      mode: "llm",
    },
  };

  return { verdict, trace };
}
