export const mockLlmClarifierResponse = {
  needsClarification: true,
  question:
    "Revenue can mean Contracted Value, Billed Value, or Cash Collected. Which basis would you like to view?",
  quickReplies: [
    "Billed Value (Excl. GST)",
    "Contracted Order Value (Excl. GST)",
    "Cash Collected (Incl. GST)",
  ],
  defaultAssumption: "Proceeding with Billed Value (Excl. GST) unless overridden.",
};

export const mockLlmAnalystPlan = {
  steps: [
    { tool: "get_pipeline_health", args: { sector: "Renewables" } },
    { tool: "get_collections_efficiency", args: { sector: "Renewables" } },
  ],
};
