export type MondayErrorKind =
  | "unauthorized"
  | "rate_limited"
  | "daily_limit_exceeded"
  | "complexity_budget_exceeded"
  | "board_not_found"
  | "network_error"
  | "malformed_response"
  | "unknown";

export class MondayApiError extends Error {
  public readonly kind: MondayErrorKind;
  public readonly statusCode?: number;
  public readonly retryAfterSeconds?: number;
  public readonly originalError?: unknown;

  constructor(
    kind: MondayErrorKind,
    message: string,
    options: {
      statusCode?: number;
      retryAfterSeconds?: number;
      originalError?: unknown;
    } = {}
  ) {
    super(`[MondayApiError:${kind}] ${message}`);
    this.name = "MondayApiError";
    this.kind = kind;
    this.statusCode = options.statusCode;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.originalError = options.originalError;
  }
}

/**
 * Retries an asynchronous function with exponential backoff and jitter
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let delay = options.initialDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 4000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (
        err instanceof MondayApiError &&
        (err.kind === "unauthorized" || err.kind === "board_not_found")
      ) {
        throw err; // Non-retryable
      }

      if (attempt === maxRetries) {
        throw err;
      }

      const jitter = Math.random() * 200;
      const sleepMs = Math.min(delay + jitter, maxDelay);
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      delay *= 2;
    }
  }

  throw new Error("Retry loop unexpectedly finished");
}
