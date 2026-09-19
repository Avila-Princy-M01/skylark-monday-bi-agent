import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getLlmProviderChain, LlmProviderName } from "../config";

/**
 * Provider configuration for the LLM failover chain.
 *
 * The chain itself lives in `lib/config.ts` so there is a single source of
 * truth for environment variables. These helpers are thin adapters over it:
 * `getAvailableProviderChain` for hand-rolled HTTP calls (`lib/llm/client.ts`),
 * and `createLanguageModel` for the Vercel AI SDK path.
 */

export interface LLMProviderConfig {
  providerName: LlmProviderName["providerName"] | "mock";
  modelName: string;
  apiKey?: string;
  baseURL?: string;
}

export function getAvailableProviderChain(): LLMProviderConfig[] {
  const chain: LLMProviderConfig[] = getLlmProviderChain().map((provider) => ({ ...provider }));

  // Sentinel appended last so tests and zero-credential environments always have
  // a defined terminal entry. It is never a usable model.
  chain.push({
    providerName: "mock",
    modelName: "mock-deterministic-model",
    apiKey: "",
    baseURL: "",
  });

  return chain;
}

export function createLanguageModel(config: LLMProviderConfig) {
  if (config.providerName === "mock" || !config.baseURL) {
    return null;
  }

  const provider = createOpenAICompatible({
    name: config.providerName,
    baseURL: config.baseURL,
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
  });

  return provider(config.modelName);
}
