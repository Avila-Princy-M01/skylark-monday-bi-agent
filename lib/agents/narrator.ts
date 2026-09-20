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

const SYSTEM_PROMPT = `You are the Executive Business Intelligence Advisor for Skylark Drones. You speak directly to the founder and leadership in clear, natural, professional, high-impact executive language.

You will be given a verified fact sheet containing the exact numbers you are allowed to use.

COMMUNICATION & FORMATTING GUIDELINES:
1. DELIVER THE DIRECT ANSWER FIRST: In the very first sentence, state the exact, direct answer to the user's specific question (e.g. name the client, state the metric). Never bury the lead.
2. STAY STRICTLY FOCUSED ON THE QUESTION: Answer what was asked. If the user asks about a specific client or risk (e.g. "who is my worst client by AR"), provide that answer and only the 2-3 most directly relevant supporting numbers. DO NOT dump unrelated pipeline, revenue, or operations dossiers unless explicitly asked.
3. CURRENCY SYMBOL RULES (CRITICAL):
   - ONLY prefix monetary financial amounts with ₹ (e.g. ₹12.50 L, ₹3.20 Cr, ₹4.50 L).
   - NEVER put currency symbols (₹) in front of counts, quantities, deals, work orders, accounts, or percentages!
   - CORRECT: "64 won deals", "177 work orders", "88 accounts", "71.4% efficiency".
   - INCORRECT (FORBIDDEN): "₹64 won deals", "₹177 work orders", "₹88 accounts".
4. EXECUTIVE STRUCTURE:
   - Use clean, prominent bold subheadings (e.g., **Key Executive Takeaway**, **Receivables & Exposure Risk**).
   - Use concise, well-spaced bullet points (max 2-3 bullets per section).
   - Never write dense, unreadable walls of text or giant run-on paragraphs.
5. ASSUMPTIONS & CAVEATS:
   - Keep Assumptions and Data Caveats concise and separated into 2-3 short bullet points at the very end under a distinct **Assumptions & Caveats** header. Never merge them into a continuous block of text.

STRICT NUMERIC GROUNDING RULES:
- Use ONLY numbers that appear verbatim in the fact sheet. Never calculate, estimate, average, or invent new figures.
- Never invent trends, comparisons, or time-series facts not present in the fact sheet.`;

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

    if (fs.entities && fs.entities.length > 0) {
      lines.push("- verified entity breakdowns (top clients, priority accounts, owners):");
      for (const e of fs.entities) {
        const details: string[] = [];
        if (e.rank) details.push(`Rank #${e.rank}`);
        details.push(`Name: ${e.name}`);
        if (typeof e.value === "number") details.push(`Value: ${e.value} (${formatInr(e.value)})`);
        if (typeof e.sharePct === "number") details.push(`Share: ${e.sharePct}%`);
        if (typeof e.count === "number") details.push(`Count: ${e.count}`);
        lines.push(`  - ${e.category ? `[${e.category}] ` : ""}${details.join(", ")}`);
      }
    }
    return lines.join("\n");
  });

  return blocks.join("\n\n");
}

function deterministicSections(input: NarratorInput): string {
  const sections: string[] = [];
  sections.push("Executive Business Intelligence Summary\n");

  for (const fs of input.factSheets) {
    const nums = fs.numbers || {};
    const metricEntries = Object.entries(nums);

    if (metricEntries.length > 0 || (fs.entities && fs.entities.length > 0)) {
      sections.push(
        `Scope: ${fs.fiscalYear} (As of ${fs.asOfDate}, ${fs.rowsScanned} records audited)\n`
      );

      if (fs.entities && fs.entities.length > 0) {
        sections.push("Top Entity Rankings & Breakdowns:");
        for (const e of fs.entities.slice(0, 5)) {
          const parts: string[] = [];
          if (e.rank) parts.push(`#${e.rank}`);
          parts.push(e.name);
          if (typeof e.value === "number") parts.push(formatInr(e.value));
          if (typeof e.sharePct === "number") parts.push(`(${e.sharePct}%)`);
          if (typeof e.count === "number") parts.push(`[${e.count} records]`);
          sections.push(`• ${e.category ? `${e.category}: ` : ""}${parts.join(" ")}`);
        }
        sections.push("");
      }

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
        sections.push(`• ${formatMetricLabel(key)}: ${displayVal}`);
      }
      sections.push("");
    }
  }

  if (input.assumptions.length > 0) {
    sections.push("Key Assumptions:");
    for (const assumption of input.assumptions) sections.push(`• ${assumption}`);
    sections.push("");
  }

  if (input.caveats.length > 0) {
    sections.push("Data Quality Caveats:");
    for (const caveat of input.caveats) sections.push(`• ${caveat}`);
    sections.push("");
  }

  return sections.join("\n").trim();
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
            ? `Verified calculation assumptions (mention only the 1-2 most directly relevant as brief bullets):\n${Array.from(
                new Set(input.assumptions)
              )
                .slice(0, 5)
                .map((a) => `- ${a}`)
                .join("\n")}`
            : "",
          "",
          input.caveats.length > 0
            ? `Data caveats (mention only 1-2 most relevant as brief bullets if applicable):\n${Array.from(
                new Set(input.caveats)
              )
                .slice(0, 4)
                .map((c) => `- ${c}`)
                .join("\n")}`
            : "",
          "",
          input.criticFeedback
            ? `A previous draft was rejected by the verifier for this reason — fix it:\n${input.criticFeedback}`
            : "",
          "",
          `The user asked: ${input.query}`,
          "",
          "Write the executive answer now, focusing specifically on what was asked. Deliver the direct answer first, followed by concise supporting insights. Do NOT put ₹ on counts or quantities.",
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

  let finalProse = generated.text;
  let grounding = validateNumericGrounding(finalProse, input.factSheets);

  // Self-correction pass: If the initial draft contains minor ungrounded figures (e.g. 1-4 tokens),
  // immediately give the model one targeted chance to self-correct rather than prematurely falling back.
  if (!grounding.isGrounded && grounding.unverifiedNumbers.length <= 4) {
    const retry = await completeText(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            buildFactSheetText(input.factSheets),
            "",
            input.assumptions.length > 0
              ? `Stated assumptions:\n${input.assumptions.map((a) => `- ${a}`).join("\n")}`
              : "",
            input.caveats.length > 0
              ? `Data caveats:\n${input.caveats.map((c) => `- ${c}`).join("\n")}`
              : "",
            `The user asked: ${input.query}`,
            "",
            `CORRECTION REQUIRED: Your previous draft was rejected because it contained these unverified numbers: [${grounding.unverifiedNumbers.join(
              ", "
            )}].`,
            "Rewrite your response now using ONLY verified figures from the fact sheet. Do not include or invent any numbers outside the fact sheet.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      { temperature: 0.1, maxTokens: 1400 }
    );

    if (retry) {
      const retryGrounding = validateNumericGrounding(retry.text, input.factSheets);
      if (retryGrounding.isGrounded) {
        finalProse = retry.text;
        grounding = retryGrounding;
      }
    }
  }

  const trace: AgentTraceStep = {
    id: `trace_narrator_llm_${Date.now()}`,
    role: "narrator",
    title: "Narrator Synthesis & Grounding Check (LLM)",
    timestamp: new Date().toISOString(),
    content: grounding.isGrounded
      ? `Generated founder-grade prose with ${grounding.verifiedNumbers.length} verified figures and zero ungrounded numbers.`
      : `Grounding guard rejected ${grounding.unverifiedNumbers.length} ungrounded figure(s) [${grounding.unverifiedNumbers.join(", ")}]; served the deterministic fallback instead.`,
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
    prose: grounding.isGrounded ? finalProse : renderDeterministicFallback(input.factSheets),
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
