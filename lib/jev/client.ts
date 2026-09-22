import { getConfig, getJevConfig, JevConfig, isJevConfigured } from "../config";

/**
 * Jev (TypeSafe AI) System-1 Decision API Client.
 *
 * Jev is a fast, calibrated System-1 decision model designed for structured
 * automated choices, boolean gate checks, and classification rather than
 * conversational prose generation.
 *
 * Endpoint: POST /v1/systemone
 */

export type JevQuestionType = "choice" | "noul" | "score";

export interface JevQuestion {
  id?: string;
  name: string;
  type: JevQuestionType;
  question: string;
  options?: readonly string[] | string[];
  levels?: readonly string[] | string[];
}

export interface JevDecisionResult {
  id?: string;
  name: string;
  type: JevQuestionType;
  value: string | boolean | number;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface JevSystemOneResponse {
  results: JevDecisionResult[];
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface JevCallOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  config?: JevConfig;
}

export { isJevConfigured };

/**
 * Executes a System-1 parallel decision pass with Jev.
 */
export async function jevSystemOne(
  state: Record<string, unknown> | string,
  questions: JevQuestion[],
  options: JevCallOptions = {}
): Promise<JevSystemOneResponse | null> {
  const config = options.config ?? getJevConfig();
  if (!config.apiKey) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? getConfig().llmTimeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${config.baseURL.replace(/\/$/, "")}/systemone`;
    const body = {
      model: config.modelName || "jev-latest",
      state: typeof state === "string" ? { text: state } : state,
      questions,
    };

    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Jev API HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as JevSystemOneResponse;
    if (!data || !Array.isArray(data.results)) {
      throw new Error("Jev API returned an invalid response structure");
    }

    return data;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[Jev Client] Call failed: ${errMsg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience helper to evaluate a single Choice question with Jev.
 */
export async function jevChoice<T extends string>(
  state: Record<string, unknown> | string,
  questionName: string,
  questionPrompt: string,
  choices: readonly T[],
  options: JevCallOptions = {}
): Promise<{ choice: T; confidence: number; probabilities?: Record<string, number> } | null> {
  const response = await jevSystemOne(
    state,
    [
      {
        name: questionName,
        type: "choice",
        question: questionPrompt,
        options: [...choices],
      },
    ],
    options
  );

  if (!response || !response.results.length) return null;
  const match = response.results.find((r) => r.name === questionName) ?? response.results[0];
  if (!match) return null;

  const choiceVal = String(match.value) as T;
  if (choices.includes(choiceVal)) {
    return {
      choice: choiceVal,
      confidence: match.confidence ?? 1.0,
      probabilities: match.probabilities,
    };
  }

  // Case-insensitive fallback match
  const ciMatch = choices.find((c) => c.toLowerCase() === choiceVal.toLowerCase());
  if (ciMatch) {
    return {
      choice: ciMatch,
      confidence: match.confidence ?? 1.0,
      probabilities: match.probabilities,
    };
  }

  return null;
}

/**
 * Convenience helper to evaluate a boolean (Noul) question with Jev.
 */
export async function jevNoul(
  state: Record<string, unknown> | string,
  questionName: string,
  questionPrompt: string,
  options: JevCallOptions = {}
): Promise<{ result: boolean; confidence: number; probabilities?: Record<string, number> } | null> {
  const response = await jevSystemOne(
    state,
    [
      {
        name: questionName,
        type: "noul",
        question: questionPrompt,
      },
    ],
    options
  );

  if (!response || !response.results.length) return null;
  const match = response.results.find((r) => r.name === questionName) ?? response.results[0];
  if (!match) return null;

  let boolVal = false;
  if (typeof match.value === "boolean") {
    boolVal = match.value;
  } else if (typeof match.value === "string") {
    boolVal = match.value.toLowerCase() === "true" || match.value.toLowerCase() === "yes";
  }

  return {
    result: boolVal,
    confidence: match.confidence ?? 1.0,
    probabilities: match.probabilities,
  };
}
