/**
 * Centralized runtime configuration.
 *
 * Why this file exists: the board-ID environment variables were previously read
 * with two different names in different modules (`DEALS_BOARD_ID` in the health
 * route and `.env.example`, but `MONDAY_DEALS_BOARD_ID` in the chat/resync
 * routes). That mismatch allowed the health endpoint to report "configured"
 * while the chat route silently fell back to empty data.
 *
 * Both names are accepted here, so existing deployments keep working, but there
 * is now exactly ONE source of truth for the whole application.
 */

export interface MondayConfig {
  apiToken: string;
  dealsBoardId: string;
  workOrdersBoardId: string;
  apiVersion: string;
  dataSource: "graphql" | "mcp";
  mcpServerUrl: string;
}

export interface LlmProviderName {
  providerName: "gemini" | "glm" | "groq" | "openrouter";
  modelName: string;
  fallbackModels?: string[];
  apiKey: string;
  baseURL: string;
}

export interface AppConfig {
  monday: MondayConfig;
  cacheTtlSeconds: number;
  asOfDate: string;
  llmChain: LlmProviderName[];
  llmTimeoutMs: number;
}

/** Reads the first non-empty value among the provided env var names. */
function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return "";
}

export function getMondayConfig(): MondayConfig {
  return {
    apiToken: firstEnv("MONDAY_API_TOKEN", "MONDAY_TOKEN"),
    dealsBoardId: firstEnv("MONDAY_DEALS_BOARD_ID", "DEALS_BOARD_ID"),
    workOrdersBoardId: firstEnv("MONDAY_WORK_ORDERS_BOARD_ID", "WORK_ORDERS_BOARD_ID"),
    apiVersion: firstEnv("MONDAY_API_VERSION") || "2024-10",
    dataSource: firstEnv("MONDAY_DATA_SOURCE").toLowerCase() === "mcp" ? "mcp" : "graphql",
    mcpServerUrl: firstEnv("MONDAY_MCP_SERVER_URL") || "https://mcp.monday.com/mcp",
  };
}

/**
 * The as-of date anchors every time-based calculation.
 *
 * The supplied dataset extends into 2026, so resolving "this quarter" against
 * the real wall clock would return empty results. Defaults to the last day of
 * the dataset's fiscal year, overridable with AS_OF_DATE.
 */
export function getAsOfDate(): string {
  const configured = firstEnv("AS_OF_DATE");
  if (configured && configured.toLowerCase() !== "auto") return configured;
  return "2026-03-31";
}

export function getCacheTtlSeconds(): number {
  const parsed = Number(firstEnv("CACHE_TTL_SECONDS"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
}

/**
 * Provider failover chain, ordered by preference.
 *
 * Every entry is OpenAI-wire-compatible, so one client implementation covers
 * Gemini, GLM (Z.ai), Groq and OpenRouter. Providers without a key are omitted
 * rather than included and skipped later.
 */
/**
 * Unit tests must be hermetic: if a developer happens to have a provider key in
 * their shell, tests must still never touch the network. Set
 * LLM_FORCE_IN_TESTS=1 to opt back in when writing integration-style tests.
 */
function isTestEnvironment(): boolean {
  return Boolean(process.env.VITEST) && process.env.LLM_FORCE_IN_TESTS !== "1";
}

export function getLlmProviderChain(): LlmProviderName[] {
  if (isTestEnvironment()) return [];

  const chain: LlmProviderName[] = [];

  const geminiKey = firstEnv("GEMINI_API_KEY", "GOOGLE_API_KEY");
  if (geminiKey) {
    const primaryModel = firstEnv("GEMINI_MODEL") || "gemini-3.5-flash";
    const possibleFallbacks = [
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.7-flash",
    ];
    chain.push({
      providerName: "gemini",
      modelName: primaryModel,
      fallbackModels: possibleFallbacks.filter((m) => m !== primaryModel),
      apiKey: geminiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }

  const glmKey = firstEnv("GLM_API_KEY", "ZHIPU_API_KEY");
  if (glmKey) {
    chain.push({
      providerName: "glm",
      modelName: firstEnv("GLM_MODEL") || "glm-4-flash",
      apiKey: glmKey,
      baseURL: "https://open.bigmodel.cn/api/paas/v4/",
    });
  }

  const groqKey = firstEnv("GROQ_API_KEY");
  if (groqKey) {
    chain.push({
      providerName: "groq",
      modelName: firstEnv("GROQ_MODEL") || "llama-3.3-70b-versatile",
      apiKey: groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }

  const openRouterKey = firstEnv("OPENROUTER_API_KEY");
  if (openRouterKey) {
    chain.push({
      providerName: "openrouter",
      modelName: firstEnv("OPENROUTER_MODEL") || "nex-agi/nex-n2.5-pro:free",
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  return chain;
}

export function getConfig(): AppConfig {
  return {
    monday: getMondayConfig(),
    cacheTtlSeconds: getCacheTtlSeconds(),
    asOfDate: getAsOfDate(),
    llmChain: getLlmProviderChain(),
    llmTimeoutMs: Number(firstEnv("LLM_TIMEOUT_MS")) || 20000,
  };
}

/** True when the Monday credentials required for a live board read are present. */
export function isMondayConfigured(config: MondayConfig = getMondayConfig()): boolean {
  return Boolean(config.apiToken && config.dealsBoardId && config.workOrdersBoardId);
}
