import { MetricFactSheet } from "../data/types";
import { formatInr } from "../data/normalize";
import { validateNumericGrounding, renderDeterministicFallback } from "../narrate/numeric-guard";
import { AgentTraceStep } from "./types";

export interface NarratorInput {
  query: string;
  factSheets: MetricFactSheet[];
  assumptions: string[];
  caveats: string[];
  criticFeedback?: string;
}

export function runNarrator(input: NarratorInput): {
  prose: string;
  isGrounded: boolean;
  trace: AgentTraceStep;
} {
  const sections: string[] = [];

  // 1. Executive Summary Headline
  sections.push("### 📈 Executive Business Intelligence Summary");
  sections.push("");

  // 2. Metric Details from Verified Fact Sheets
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
          if (key.toLowerCase().includes("pct") || key.toLowerCase().includes("rate")) {
            displayVal = `${val}%`;
          } else if (
            val >= 100000 ||
            key.toLowerCase().includes("val") ||
            key.toLowerCase().includes("amount")
          ) {
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

  // 3. Assumptions disclosure
  if (input.assumptions.length > 0) {
    sections.push("#### 📋 Stated Assumptions");
    for (const a of input.assumptions) {
      sections.push(`- ${a}`);
    }
    sections.push("");
  }

  // 4. Data Quality Caveats
  if (input.caveats.length > 0) {
    sections.push("#### ⚠️ Data Quality & Business Caveats");
    for (const c of input.caveats) {
      sections.push(`- ${c}`);
    }
    sections.push("");
  }

  const initialProse = sections.join("\n");

  // 5. Run Numeric Grounding Guard
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
      ? `Synthesized founder-grade executive prose with 100% strict numeric grounding.`
      : `Numeric grounding guard intercepted ungrounded figures; rendered deterministic fallback.`,
    status: grounding.isGrounded ? "completed" : "warn",
    metadata: {
      isGrounded: grounding.isGrounded,
      tokensExtracted: grounding.extractedTokens.length,
      verifiedTokens: grounding.verifiedNumbers.length,
      unverifiedTokens: grounding.unverifiedNumbers.length,
    },
  };

  return {
    prose: finalProse,
    isGrounded: grounding.isGrounded,
    trace,
  };
}

function formatMetricLabel(camelCase: string): string {
  return camelCase
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/Excl Gst/gi, "(Excl. GST)")
    .replace(/Incl Gst/gi, "(Incl. GST)")
    .replace(/Pct/gi, "(%)");
}
