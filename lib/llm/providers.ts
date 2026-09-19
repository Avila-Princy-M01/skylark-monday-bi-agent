import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export interface LLMProviderConfig {
  providerName: "gemini" | "glm" | "groq" | "openrouter" | "mock";
  modelName: string;
  apiKey?: string;
  baseURL?: string;
}

export function getAvailableProviderChain(): LLMProviderConfig[] {
  const chain: LLMProviderConfig[] = [];

  // 1. Google Gemini via OpenAI compatible endpoint
  if (process.env.GEMINI_API_KEY) {
    chain.push({
      providerName: "gemini",
      modelName: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }

  // 2. GLM / Z.ai
  if (process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY) {
    chain.push({
      providerName: "glm",
      modelName: process.env.GLM_MODEL || "glm-4-flash",
      apiKey: process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY,
      baseURL: "https://open.bigmodel.cn/api/paas/v4/",
    });
  }

  // 3. Groq
  if (process.env.GROQ_API_KEY) {
    chain.push({
      providerName: "groq",
      modelName: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }

  // 4. OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    chain.push({
      providerName: "openrouter",
      modelName: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  // 5. Default mock fallback for unit tests and zero-credential environments
  chain.push({
    providerName: "mock",
    modelName: "mock-deterministic-model",
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
