import { z } from "zod";
import { getConfig, LlmProviderName } from "../config";

/**
 * Minimal OpenAI-wire-compatible chat client with provider failover.
 *
 * Every provider in the configured chain (Gemini, GLM/Z.ai, Groq, OpenRouter)
 * speaks the same `/chat/completions` protocol, so a single implementation
 * covers all of them and the chain is ordered purely by configuration.
 *
 * The LLM is only ever used to (a) parse intent into a typed plan and (b) write
 * prose over already-computed numbers. It never performs arithmetic. When every
 * provider fails, these helpers return null and callers fall back to the
 * deterministic router, so the application still answers questions.
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmTextResult {
  text: string;
  provider: string;
  model: string;
}

export interface LlmFailure {
  provider: string;
  error: string;
}

export interface LlmCallMeta {
  failures: LlmFailure[];
  attempts: number;
}

export interface LlmResult<T> {
  data: T;
  provider: string;
  model: string;
  meta: LlmCallMeta;
}

type FetchLike = typeof fetch;

interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  /** Test seam: lets tests inject a mocked fetch. */
  fetchImpl?: FetchLike;
  /** Test seam: lets tests force a specific provider chain. */
  chain?: LlmProviderName[];
}

/** True when at least one provider has a key configured. */
export function isLlmAvailable(chain: LlmProviderName[] = getConfig().llmChain): boolean {
  return chain.length > 0;
}

function buildBody(
  provider: LlmProviderName,
  messages: LlmMessage[],
  options: CallOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: provider.modelName,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 1200,
  };

  // JSON mode is best-effort: not every gateway honours response_format, so the
  // prompt also demands raw JSON and the parser is tolerant.
  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  return body;
}

async function callProvider(
  provider: LlmProviderName,
  messages: LlmMessage[],
  options: CallOptions,
  fetchImpl: FetchLike
): Promise<string> {
  const modelsToTry = [provider.modelName, ...(provider.fallbackModels ?? [])];
  let lastError: Error | null = null;

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const currentModel = modelsToTry[mIdx];
    const controller = new AbortController();
    const perAttemptTimeout =
      options.timeoutMs ?? (modelsToTry.length > 1 ? 10000 : getConfig().llmTimeoutMs);
    const timeout = setTimeout(() => controller.abort(), perAttemptTimeout);

    try {
      const body = { ...buildBody(provider, messages, options), model: currentModel };
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      };
      if (provider.providerName === "openrouter") {
        headers["HTTP-Referer"] = "https://skylark-monday-bi-agent-blush.vercel.app";
        headers["X-Title"] = "Skylark Drones BI Agent";
      }

      const res = await fetchImpl(`${provider.baseURL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new Error("Provider returned an empty completion");
      }
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (mIdx < modelsToTry.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Provider call failed");
}

/** Extracts the first balanced JSON object from a model response. */
export function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i++) {
    const char = candidate[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Runs a chat completion against the configured chain, returning the first
 * success or null when every provider fails.
 */
export async function completeText(
  messages: LlmMessage[],
  options: CallOptions = {}
): Promise<LlmTextResult | null> {
  const chain = options.chain ?? getConfig().llmChain;
  const fetchImpl = options.fetchImpl ?? fetch;

  for (const provider of chain) {
    try {
      const text = await callProvider(provider, messages, options, fetchImpl);
      return { text, provider: provider.providerName, model: provider.modelName };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[LLM client] Provider ${provider.providerName} failed: ${errMsg}`);
    }
  }

  return null;
}

/**
 * Runs a completion and validates the returned JSON against a Zod schema.
 * Returns null if every provider fails or the schema never validates.
 */
export async function completeJson<T>(
  messages: LlmMessage[],
  schema: z.ZodType<T>,
  options: CallOptions = {}
): Promise<LlmResult<T> | null> {
  const chain = options.chain ?? getConfig().llmChain;
  const fetchImpl = options.fetchImpl ?? fetch;
  const failures: LlmFailure[] = [];
  let attempts = 0;

  for (const provider of chain) {
    attempts++;
    try {
      const text = await callProvider(provider, messages, { ...options, json: true }, fetchImpl);
      const parsed = extractJsonObject(text);
      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        throw new Error(
          `Schema validation failed: ${validated.error.issues[0]?.message ?? "unknown"}`
        );
      }
      return {
        data: validated.data,
        provider: provider.providerName,
        model: provider.modelName,
        meta: { failures, attempts },
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[LLM client] Provider ${provider.providerName} failed: ${errMsg}`);
      failures.push({
        provider: provider.providerName,
        error: errMsg,
      });
    }
  }

  return null;
}

export interface LlmProviderReachability {
  provider: string;
  configured: boolean;
  model: string;
  reachable: boolean;
  error?: string;
}

/**
 * Diagnostic helper: probes LLM providers to verify model reachability independently of app logic.
 */
export async function probeLlmReachability(
  chain: LlmProviderName[] = getConfig().llmChain,
  fetchImpl: FetchLike = fetch
): Promise<LlmProviderReachability[]> {
  const results: LlmProviderReachability[] = [];
  const testMessages: LlmMessage[] = [{ role: "user", content: "hi" }];

  for (const provider of chain) {
    try {
      await callProvider(provider, testMessages, { maxTokens: 5, timeoutMs: 5000 }, fetchImpl);
      results.push({
        provider: provider.providerName,
        configured: true,
        model: provider.modelName,
        reachable: true,
      });
    } catch (err) {
      results.push({
        provider: provider.providerName,
        configured: true,
        model: provider.modelName,
        reachable: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
