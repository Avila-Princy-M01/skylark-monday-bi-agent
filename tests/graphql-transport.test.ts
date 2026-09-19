import { describe, it, expect, vi, afterEach } from "vitest";
import { MondayGraphQLSource } from "../lib/monday/graphql-source";
import { ITEMS_PAGE_LIMIT } from "../lib/monday/source";
import { MondayApiError } from "../lib/monday/errors";

/**
 * Transport-level tests for the monday.com GraphQL source.
 *
 * These exist because the previous suite only covered `buildColumnMapping` and
 * the backoff helper, leaving the actual HTTP layer — auth headers, cursor
 * pagination and error classification — almost entirely unverified.
 *
 * Every test injects `fetchImpl`, so nothing here touches the network.
 */

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    })
  );
}

const SCHEMA_OK = {
  data: {
    boards: [
      {
        id: "123",
        name: "Deals",
        columns: [
          { id: "text_1", title: "Owner code", type: "text" },
          { id: "num_1", title: "Masked Deal value", type: "numbers" },
          { id: "date_1", title: "  Created Date  ", type: "date" },
        ],
      },
    ],
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("monday.com GraphQL transport", () => {
  it("sends the API token and pins the API-Version header", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(SCHEMA_OK)
    );
    const client = new MondayGraphQLSource({
      apiToken: "my-secret-token",
      apiVersion: "2025-04-01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.getBoardSchema("123");

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toContain("my-secret-token");
    expect(headers["API-Version"]).toBe("2025-04-01");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("discovers the schema at runtime and maps column titles to ids", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SCHEMA_OK));
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const schema = await client.getBoardSchema("123");
    const mapping = client.buildColumnMapping(schema);

    expect(schema.name).toBe("Deals");
    expect(mapping["Owner code"]).toBe("text_1");
    expect(mapping["Masked Deal value"]).toBe("num_1");
    // Titles are trimmed, so a padded header still resolves.
    expect(mapping["Created Date"]).toBe("date_1");
  });

  it("throws board_not_found when the board list comes back empty", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { boards: [] } }));
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getBoardSchema("999")).rejects.toThrow(/not found/i);
  });

  it("requests the first page with the 100-item cap", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        data: { boards: [{ items_page: { cursor: null, items: [] } }] },
      })
    );
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.fetchAllItems("1");

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as { query: string };
    expect(body.query).toContain(`items_page(limit: ${ITEMS_PAGE_LIMIT})`);
  });

  it("follows the cursor across pages and stops when it goes null", async () => {
    let page = 0;
    const fetchImpl = vi.fn(async () => {
      page++;
      if (page === 1) {
        return jsonResponse({
          data: {
            boards: [
              {
                items_page: {
                  cursor: "cursor_1",
                  items: [{ id: "1", name: "first", column_values: [] }],
                },
              },
            ],
          },
        });
      }
      if (page === 2) {
        return jsonResponse({
          data: {
            next_items_page: {
              cursor: "cursor_2",
              items: [{ id: "2", name: "second", column_values: [] }],
            },
          },
        });
      }
      return jsonResponse({
        data: {
          next_items_page: {
            cursor: null,
            items: [{ id: "3", name: "third", column_values: [] }],
          },
        },
      });
    });

    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const items = await client.fetchAllItems("1");
    expect(items.map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("stops paginating when a page returns no items even if a cursor remains", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: { boards: [{ items_page: { cursor: "still_set", items: [] } }] },
      })
    );
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const items = await client.fetchAllItems("1");
    expect(items).toEqual([]);
    // Guards against an infinite loop on a misbehaving cursor.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps HTTP 401 to a non-retryable unauthorized error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 401));
    const client = new MondayGraphQLSource({
      apiToken: "bad",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getBoardSchema("1")).rejects.toThrow(/invalid or expired/i);
    // Retrying a bad token only burns quota.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps HTTP 403 to unauthorized as well", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "forbidden" }, 403));
    const client = new MondayGraphQLSource({
      apiToken: "bad",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getBoardSchema("1")).rejects.toThrow(/invalid or expired/i);
  });

  it("maps HTTP 429 to rate_limited and honours Retry-After", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "slow down" }, 429, { "Retry-After": "2" })
    );
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const error = await client.getBoardSchema("1").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(MondayApiError);
    if (error instanceof MondayApiError) {
      expect(error.kind).toBe("rate_limited");
      expect(error.retryAfterSeconds).toBe(2);
    }
  });

  it("classifies a complexity-budget GraphQL error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errors: [{ message: "Complexity budget exhausted" }] })
    );
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const error = await client.getBoardSchema("1").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(MondayApiError);
    if (error instanceof MondayApiError) {
      expect(error.kind).toBe("complexity_budget_exceeded");
    }
  });

  it("classifies a daily-limit GraphQL error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errors: [{ message: "Daily limit reached for this account" }] })
    );
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const error = await client.getBoardSchema("1").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(MondayApiError);
    if (error instanceof MondayApiError) {
      expect(error.kind).toBe("daily_limit_exceeded");
    }
  });

  it("classifies any other GraphQL error as malformed_response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errors: [{ message: "Field 'nope' doesn't exist" }] })
    );
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const error = await client.getBoardSchema("1").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(MondayApiError);
    if (error instanceof MondayApiError) {
      expect(error.kind).toBe("malformed_response");
    }
  });

  it("surfaces an unexpected HTTP status with its code", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "boom" }, 500));
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getBoardSchema("1")).rejects.toThrow(/HTTP status 500/i);
  });

  it("maps a thrown fetch into a typed network_error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const client = new MondayGraphQLSource({
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const error = await client.getBoardSchema("1").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(MondayApiError);
    if (error instanceof MondayApiError) {
      expect(error.kind).toBe("network_error");
    }
  });

  it("refuses to call the API at all when the token is missing", async () => {
    // The constructor falls back to process.env, so a real local token would
    // otherwise mask this check.
    vi.stubEnv("MONDAY_API_TOKEN", "");
    const fetchImpl = vi.fn(async () => jsonResponse(SCHEMA_OK));
    const client = new MondayGraphQLSource({
      apiToken: "",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getBoardSchema("1")).rejects.toThrow(/MONDAY_API_TOKEN is missing/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
