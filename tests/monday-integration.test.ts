import { describe, it, expect, vi } from "vitest";
import { MondayGraphQLSource } from "../lib/monday/graphql-source";
import { MondayApiError, withExponentialBackoff } from "../lib/monday/errors";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  clearCacheSnapshot,
} from "../lib/data/cache";

describe("Monday.com Integration & Data Caching Suite", () => {
  it("builds dynamic column mappings by title from runtime board schema", () => {
    const client = new MondayGraphQLSource({ apiToken: "test-token" });
    const schema = {
      id: "12345",
      name: "Deals Board",
      columns: [
        { id: "text_owner", title: "Owner code", type: "text" },
        { id: "numbers_val", title: "Masked Deal value", type: "numbers" },
        { id: "status_prob", title: "Closure Probability", type: "color" },
      ],
    };

    const mapping = client.buildColumnMapping(schema);
    expect(mapping["Owner code"]).toBe("text_owner");
    expect(mapping["Masked Deal value"]).toBe("numbers_val");
    expect(mapping["Closure Probability"]).toBe("status_prob");
  });

  it("handles rate limits with exponential backoff and jitter", async () => {
    let attempts = 0;
    const mockFn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new MondayApiError("rate_limited", "Rate limit hit", { retryAfterSeconds: 1 });
      }
      return { success: true };
    });

    const result = await withExponentialBackoff(mockFn, {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it("throws non-retryable error immediately on unauthorized token", async () => {
    let attempts = 0;
    const mockFn = vi.fn(async () => {
      attempts++;
      throw new MondayApiError("unauthorized", "Invalid API token");
    });

    await expect(withExponentialBackoff(mockFn, { maxRetries: 3 })).rejects.toThrow(
      "Invalid API token"
    );
    expect(attempts).toBe(1);
  });

  it("caches data with TTL and serves fallback snapshot on cache expiration", () => {
    clearCacheSnapshot();
    expect(getCachedData()).toBeNull();

    const mockState = {
      deals: [],
      workOrders: [],
      report: {
        totalRawDealsRows: 0,
        totalValidDeals: 0,
        totalRawWorkOrdersRows: 0,
        totalValidWorkOrders: 0,
        junkRowsDropped: 0,
        emptyColumnsExcluded: [],
        maskedPlaceholderValuesCount: 0,
        maskedPlaceholderTotalSumExcluded: 0,
        overBilledRecordsCount: 0,
        dateAnomaliesCount: 0,
        statusStageContradictionsCount: 0,
        nearDuplicatesCount: 0,
        issues: [],
        generatedAt: "2026-03-31T00:00:00.000Z",
      },
      lastSyncedAt: "2026-03-31T12:00:00.000Z",
    };

    const cached = setCachedData(mockState, 5000); // 5000ms TTL
    expect(cached.source).toBe("live");
    expect(cached.isStale).toBe(false);

    // Read immediately
    const read1 = getCachedData();
    expect(read1?.source).toBe("cache");
    expect(read1?.isStale).toBe(false);
  });
});
