import { MetricFactSheet } from "../data/types";
import { formatInr } from "../data/normalize";
import { validateNumericGrounding, renderDeterministicFallback } from "../narrate/numeric-guard";
import { completeText, isLlmAvailable } from "../llm/client";
import { AgentTraceStep } from "./types";

export interface NarratorInput {
  query: string;
  factSheets: MetricFactSheet[];
  assumptions: string[];
  caveats: string[];
  criticFeedback?: string;
}

export interface NarratorOutput {
  prose: string;
  isGrounded: boolean;
  trace: AgentTraceStep;
}

const SYSTEM_PROMPT = `You are the Narrator for a founder-facing business-intelligence agent covering a drone-survey company. You write for a busy executive who wants the answer first.

You will be given a verified fact sheet containing every number you are allowed to use.

ABSOLUTE RULES:
1. Use ONLY numbers that appear verbatim in the fact sheet. Do not add, subtract, average, extrapolate, or round into a new figure. If a number is not in the fact sheet, do not write it.
2. Never invent trends, comparisons, or time-series facts. There is no historical snapshot data, so week-over-week or quarter-over-quarter change cannot be computed.
3. Lead with the direct answer in one or two sentences.
4. Then give the supporting figures as a short markdown table.
5. Then list the stated assumptions, then the data-quality caveats, if any were supplied.
6. Be explicit about which revenue basis you are quoting (contracted, billed, or collected) — these are not interchangeable.
7. Use ₹ with Indian lakh/crore notation. Keep it tight; no filler, no motivational language.

Write plain markdown. Do not wrap the whole response in a code fence.`;

function buildFactSheetText(factSheets: MetricFactSheet[]): string {
  const blocks = factSheets.map((fs, index) => {
    const lines: string[] = [];
    lines.push(`### Fact sheet ${index + 1}`);
    lines.push(`- as_of_date: ${fs.asOfDate}`);
    lines.push(`- fiscal_year: ${fs.fiscalYear}`);
    lines.push(`- rows_scanned: ${fs.rowsScanned}`);
    if (fs.basis) lines.push(`- basis: ${fs.basis}`);

    lines.push("- figures (the ONLY numbers you may use, exact values):");
    for (const [key, value] of Object.entries(fs.numbers)) {
      if (typeof value === "number") {
        const isPercentage = /pct|rate|efficiency/i.test(key);
        lines.push(
          `  - ${key} = ${value}${isPercentage ? "%" : ` (formatted: ${formatInr(value)})`}`
        );
      }
    }
    return lines.join("\n");
  });

  return blocks.join("\n\n");
}

function deterministicSections(input: NarratorInput): string {
  const sections: string[] = [];
  sections.push("### 📈 Executive Business Intelligence Summary");
  sections.push("");

  for (const fs of input.factSheets) {
    const nums = fs.numbers || {};
    const metricEntries = Object.entries(nums);

    if (metricEntries.length > 0) {
      sections.push(`**Time Window / Scope**: ${fs.fiscalYear} (As of ${fs.asOfDate})`);
      sections.push(`**Records Audited**: ${fs.rowsScanned} rows`);
      sections.push("");
      sections.push("| Metric | Verified Value |");
      sections.push("| :--- | :--- |");

      for (const [key, val] of metricEntries) {
        let displayVal = String(val);
        if (typeof val === "number") {
          if (/pct|rate|efficiency/i.test(key)) {
            displayVal = `${val}%`;
          } else if (val >= 100000 || /val|amount/i.test(key)) {
            displayVal = formatInr(val);
          } else {
            displayVal = val.toLocaleString("en-IN");
          }
        }
        sections.push(`| **${formatMetricLabel(key)}** | \`${displayVal}\` |`);
      }
      sections.push("");
    }
  }

  if (input.assumptions.length > 0) {
    sections.push("#### 📋 Stated Assumptions");
    for (const assumption of input.assumptions) sections.push(`- ${assumption}`);
    sections.push("");
  }

  if (input.caveats.length > 0) {
    sections.push("#### ⚠️ Data Quality & Business Caveats");
    for (const caveat of input.caveats) sections.push(`- ${caveat}`);
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Deterministic narration. Always available, no LLM required, and the only
 * renderer that runs when the grounding guard rejects generated prose.
 */
export function runNarrator(input: NarratorInput): NarratorOutput {
  const initialProse = deterministicSections(input);
  const grounding = validateNumericGrounding(initialProse, input.factSheets);
  const finalProse = grounding.isGrounded
    ? initialProse
    : renderDeterministicFallback(input.factSheets);

  const trace: AgentTraceStep = {
    id: `trace_narrator_${Date.now()}`,
    role: "narrator",
    title: "Narrator Synthesis & Grounding Check",
    timestamp: new Date().toISOString(),
    content: grounding.isGrounded
      ? "Synthesized executive prose from the verified fact sheet with strict numeric grounding."
      : "Numeric grounding guard intercepted ungrounded figures; rendered the deterministic fallback.",
    status: grounding.isGrounded ? "completed" : "warn",
    metadata: {
      mode: "deterministic",
      isGrounded: grounding.isGrounded,
      tokensExtracted: grounding.extractedTokens.length,
      verifiedTokens: grounding.verifiedNumbers.length,
      unverifiedTokens: grounding.unverifiedNumbers.length,
    },
  };

  return { prose: finalProse, isGrounded: grounding.isGrounded, trace };
}

export interface LlmNarratorOptions {
  /** Test seam: force deterministic narration. */
  disableLlm?: boolean;
}

/**
 * LLM narration, constrained by the numeric grounding guard.
 *
 * The model is given only the fact sheet and writes prose over it. Its output is
 * then re-scanned: every numeric token must match a verified figure within a 3%
 * tolerance. If any number is unaccounted for, the generated text is discarded
 * entirely and the deterministic table is served instead — so a hallucinated
 * figure can never reach the user.
 */
export async function runNarratorWithLlm(
  input: NarratorInput,
  options: LlmNarratorOptions = {}
): Promise<NarratorOutput> {
  const fallback = runNarrator(input);

  if (options.disableLlm || !isLlmAvailable() || input.factSheets.length === 0) {
    return fallback;
  }

  const generated = await completeText(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          buildFactSheetText(input.factSheets),
          "",
          input.assumptions.length > 0
            ? `Stated assumptions to include:\n${input.assumptions.map((a) => `- ${a}`).join("\n")}`
            : "No assumptions were stated.",
          "",
          input.caveats.length > 0
            ? `Data-quality caveats to include:\n${input.caveats.map((c) => `- ${c}`).join("\n")}`
            : "No data-quality caveats apply.",
          "",
          input.criticFeedback
            ? `A previous draft was rejected by the verifier for this reason — fix it:\n${input.criticFeedback}`
            : "",
          "",
          `The user asked: ${input.query}`,
          "",
          "Write the executive answer now, using only the fact sheet numbers above.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    { temperature: 0.2, maxTokens: 1400 }
  );

  if (!generated) {
    return {
      ...fallback,
      trace: {
        ...fallback.trace,
        content: `${fallback.trace.content} (LLM narration unavailable; served the deterministic render.)`,
        metadata: { ...fallback.trace.metadata, mode: "deterministic_fallback" },
      },
    };
  }

  const grounding = validateNumericGrounding(generated.text, input.factSheets);

  const trace: AgentTraceStep = {
    id: `trace_narrator_llm_${Date.now()}`,
    role: "narrator",
    title: "Narrator Synthesis & Grounding Check (LLM)",
    timestamp: new Date().toISOString(),
    content: grounding.isGrounded
      ? `Generated founder-grade prose with ${grounding.verifiedNumbers.length} verified figures and zero ungrounded numbers.`
      : `Grounding guard rejected ${grounding.unverifiedNumbers.length} ungrounded figure(s); served the deterministic fallback instead.`,
    status: grounding.isGrounded ? "completed" : "warn",
    metadata: {
      mode: grounding.isGrounded ? "llm" : "llm_rejected",
      provider: generated.provider,
      model: generated.model,
      isGrounded: grounding.isGrounded,
      tokensExtracted: grounding.extractedTokens.length,
      verifiedTokens: grounding.verifiedNumbers.length,
      unverifiedNumbers: grounding.unverifiedNumbers,
    },
  };

  return {
    prose: grounding.isGrounded ? generated.text : renderDeterministicFallback(input.factSheets),
    isGrounded: grounding.isGrounded,
    trace,
  };
}

export function formatMetricLabel(camelCase: string): string {
  return camelCase
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/Excl Gst/gi, "(Excl. GST)")
    .replace(/Incl Gst/gi, "(Incl. GST)")
    .replace(/Pct/gi, "(%)");
}
