import { MultiAgentExecutionResult } from "./types";

const GREETINGS = new Set([
  "hi",
  "hello",
  "hey",
  "howdy",
  "greetings",
  "good morning",
  "good afternoon",
  "good evening",
  "good day",
  "sup",
  "yo",
  "hola",
  "namaste",
]);

const CAPABILITIES = new Set([
  "who are you",
  "what can you do",
  "what are your capabilities",
  "how can you help",
  "how can you help me",
  "help",
  "what do you do",
  "what is your role",
  "what is your purpose",
  "what are you",
]);

const ACKNOWLEDGEMENTS = new Set([
  "thanks",
  "thank you",
  "thanks a lot",
  "thank you so much",
  "ok thanks",
  "okay thanks",
  "got it",
  "understood",
  "cool",
  "awesome",
  "perfect",
  "bye",
  "goodbye",
  "see you",
]);

export function isConversationalQuery(rawQuery: string): boolean {
  const q = rawQuery
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:]+$/, "");
  if (GREETINGS.has(q) || CAPABILITIES.has(q) || ACKNOWLEDGEMENTS.has(q)) {
    return true;
  }
  if (/^(hi|hello|hey)\s+(there|team|bot|agent|advisor)\b/i.test(q)) {
    return true;
  }
  if (/^(good\s+(morning|afternoon|evening))\s*(team|all|there)?$/i.test(q)) {
    return true;
  }
  return false;
}

export function stripLeadingGreeting(query: string): string {
  const stripped = query
    .replace(/^(?:hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening))\s*[,;:-]?\s*/i, "")
    .trim();
  return stripped.length > 0 ? stripped : query;
}

export function handleConversationalQuery(query: string): MultiAgentExecutionResult {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:]+$/, "");
  let answer: string;

  if (
    ACKNOWLEDGEMENTS.has(q) ||
    ["thanks", "thank you", "got it", "understood", "cool"].some((k) => q.startsWith(k))
  ) {
    if (["bye", "goodbye", "see you"].some((k) => q.includes(k))) {
      answer =
        "Goodbye! Let me know whenever you need fresh telemetry across our pipeline or work orders.";
    } else {
      answer =
        "You're welcome! Let me know if you would like to inspect pipeline health, conversion bottlenecks, revenue realization, or AR risks across our boards.";
    }
  } else if (CAPABILITIES.has(q) || q.includes("what can you do") || q.includes("help")) {
    answer = `I am your Executive Business Intelligence Advisor for Skylark Drones, monitoring telemetry across **Deals** (sales pipeline) and **Work Orders** (execution, billing, and cash collections).

Here is how I can assist your executive review:
• **Conversion Chain & Stuck Money**: Trace cash trapped across won pipeline deals, unbilled contract backlog, and uncollected AR.
• **Revenue Realization**: Compare contracted order book value vs. delivered billed revenue vs. collected cash.
• **Collection Efficiency & Receivables**: Inspect overall collection rates, aging brackets, and top at-risk debtor accounts.
• **Pipeline Health & Velocity**: Audit total and probability-weighted pipeline, deal velocity, and stalled deals.
• **Concentration Risks**: Gauge client and owner exposure across open pipeline and active order books.

Try asking:
> *"Where is the money stuck across won deals, unbilled backlog, and uncollected AR?"*
> *"What is our collection efficiency and top AR-risk accounts?"*
> *"What is our open pipeline and stalled deals?"*`;
  } else {
    answer = `Hello! I am your Executive Business Intelligence Advisor for Skylark Drones.

I continuously analyze live telemetry across our **Deals** board (sales pipeline) and **Work Orders** board (project execution, billing, and cash collections).

How can I help you today? You can ask about:
• **Stuck Money Analysis**: *"Where is the money stuck across won deals, unbilled backlog, and uncollected AR?"*
• **Revenue Realization**: *"Show me contracted vs billed vs collected revenue for FY25-26."*
• **Receivables Risk**: *"What is our collection efficiency and top AR-risk accounts?"*
• **Pipeline Health**: *"What is our open pipeline and stalled deals?"*
• **Concentration**: *"What is our top client and owner concentration risk?"*`;
  }

  return {
    answer,
    traces: [
      {
        id: `trace_sup_conv_${Date.now()}`,
        role: "supervisor",
        title: "Supervisor conversational response",
        timestamp: new Date().toISOString(),
        content: `Recognized conversational message ("${query}"). Responding directly as the Executive Business Intelligence Advisor.`,
        status: "completed",
      },
    ],
    factSheets: [],
    assumptions: ["Direct conversational assistance mode."],
    caveats: [],
    sourceRowIds: [],
    dataQualityIssuesCount: 0,
    revisionPasses: 0,
    criticRejectedFinal: false,
  };
}
