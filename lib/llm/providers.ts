import { getLlmProviderChain, LlmProviderName } from "../config";

/**
 * Provider configuration for the LLM failover chain.
 *
 * The chain itself lives in `lib/config.ts` so there is a single source of
 * truth for environment variables. These helpers are thin adapters over it:
 * `getAvailableProviderChain` for hand-rolled HTTP calls (`lib/llm/client.ts`).
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
