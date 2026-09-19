import { ClarifierVerdict, AgentTraceStep } from "./types";
import { resolveSectorQuery } from "../query/aliases";

export function runClarifier(query: string): {
  verdict: ClarifierVerdict;
  trace: AgentTraceStep;
} {
  const q = query.toLowerCase().trim();
  const assumptions: string[] = [];
  let isAmbiguous = false;
  let question: string | undefined;
  let options: ClarifierVerdict["options"];

  // 1. Check for ambiguous revenue term
  if (
    q === "what is our revenue?" ||
    q === "total revenue" ||
    q === "revenue" ||
    q === "what is revenue?"
  ) {
    isAmbiguous = true;
    question = "How would you like revenue defined for this inquiry?";
    options = [
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
    assumptions.push(
      "Defaulting to Billed Revenue (Excl. GST) as standard recognized operational revenue."
    );
  }

  // 2. Check sector query alias
  const sectorResolution = resolveSectorQuery(query);
  if (sectorResolution.isSyntheticComposite) {
    assumptions.push(
      `Mapped sector query '${sectorResolution.input}' to composite sectors: ${sectorResolution.matchedSectors.join(
        " + "
      )}.`
    );
  }

  // 3. Indian Fiscal Year assumption
  assumptions.push(
    "All quarterly and year-to-date metrics adhere to the Indian Fiscal Year (April 1 to March 31)."
  );

  const trace: AgentTraceStep = {
    id: `trace_clarifier_${Date.now()}`,
    role: "clarifier",
    title: "Clarifier Ambiguity & Intent Resolution",
    timestamp: new Date().toISOString(),
    content: isAmbiguous
      ? `Detected ambiguity regarding revenue definition. Prepared quick-reply options and inline assumptions.`
      : `Intent resolved unambiguously. Stated ${assumptions.length} explicit operational assumptions.`,
    status: "completed",
    metadata: {
      isAmbiguous,
      assumptionsCount: assumptions.length,
      matchedSectors: sectorResolution.matchedSectors,
    },
  };

  return {
    verdict: {
      isAmbiguous,
      question,
      options,
      assumptions,
    },
    trace,
  };
}
