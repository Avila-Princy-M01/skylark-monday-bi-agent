import { MondayApiError, withExponentialBackoff } from "./errors";
import { RawMondayItem } from "../data/normalize";

export interface MondayBoardSchema {
  id: string;
  name: string;
  columns: Array<{
    id: string;
    title: string;
    type: string;
  }>;
}

export interface MondayColumnMapping {
  [title: string]: string; // Column Title -> Column ID
}

interface PageResponse {
  boards?: Array<{
    items_page: {
      cursor: string | null;
      items: RawMondayItem[];
    };
  }>;
  next_items_page?: {
    cursor: string | null;
    items: RawMondayItem[];
  };
}

export class MondayGraphQLSource {
  private apiToken: string;
  private apiVersion: string;
  private endpoint = "https://api.monday.com/v2";

  constructor(options: { apiToken?: string; apiVersion?: string } = {}) {
    this.apiToken = options.apiToken || process.env.MONDAY_API_TOKEN || "";
    this.apiVersion = options.apiVersion || "2024-10";
  }

  private async fetchGraphQL<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.apiToken) {
      throw new MondayApiError(
        "unauthorized",
        "MONDAY_API_TOKEN is missing. Please set your monday.com API key."
      );
    }

    return withExponentialBackoff(async () => {
      let res: Response;
      try {
        res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: this.apiToken,
            "API-Version": this.apiVersion,
          },
          body: JSON.stringify({ query, variables }),
        });
      } catch (networkErr) {
        throw new MondayApiError("network_error", "Failed to connect to monday.com API", {
          originalError: networkErr,
        });
      }

      if (res.status === 401 || res.status === 403) {
        throw new MondayApiError("unauthorized", "Invalid or expired Monday API token", {
          statusCode: res.status,
        });
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
        throw new MondayApiError("rate_limited", "Monday API rate limit hit", {
          statusCode: 429,
          retryAfterSeconds: retryAfter,
        });
      }

      if (!res.ok) {
        throw new MondayApiError("unknown", `Monday API responded with HTTP status ${res.status}`, {
          statusCode: res.status,
        });
      }

      const json = await res.json();
      if (json.errors && json.errors.length > 0) {
        const msg = json.errors.map((e: { message: string }) => e.message).join(", ");
        if (msg.includes("Complexity budget exhausted")) {
          throw new MondayApiError("complexity_budget_exceeded", msg);
        }
        if (msg.includes("Daily limit")) {
          throw new MondayApiError("daily_limit_exceeded", msg);
        }
        throw new MondayApiError("malformed_response", msg);
      }

      return json.data as T;
    });
  }

  /**
   * Runtime Dynamic Schema Discovery: Fetch columns for a board by ID
   */
  public async getBoardSchema(boardId: string): Promise<MondayBoardSchema> {
    const query = `
      query GetBoardSchema($boardIds: [ID!]) {
        boards(ids: $boardIds) {
          id
          name
          columns {
            id
            title
            type
          }
        }
      }
    `;

    interface SchemaResponse {
      boards: Array<{
        id: string;
        name: string;
        columns: Array<{ id: string; title: string; type: string }>;
      }>;
    }

    const data = await this.fetchGraphQL<SchemaResponse>(query, { boardIds: [boardId] });
    if (!data.boards || data.boards.length === 0) {
      throw new MondayApiError("board_not_found", `Board ${boardId} not found`);
    }

    return data.boards[0];
  }

  /**
   * Builds title-to-id mapping dynamically from board schema
   */
  public buildColumnMapping(schema: MondayBoardSchema): MondayColumnMapping {
    const map: MondayColumnMapping = {};
    for (const col of schema.columns) {
      map[col.title.trim()] = col.id;
    }
    return map;
  }

  /**
   * Fetches all items from a board using cursor pagination
   */
  public async fetchAllItems(boardId: string): Promise<RawMondayItem[]> {
    const allItems: RawMondayItem[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const queryStr: string = cursor
        ? `
          query GetNextItems($cursor: String!) {
            next_items_page(cursor: $cursor, limit: 100) {
              cursor
              items {
                id
                name
                column_values {
                  id
                  text
                  value
                }
              }
            }
          }
        `
        : `
          query GetInitialItems($boardIds: [ID!]) {
            boards(ids: $boardIds) {
              items_page(limit: 100) {
                cursor
                items {
                  id
                  name
                  column_values {
                    id
                    text
                    value
                  }
                }
              }
            }
          }
        `;

      const data: PageResponse = await this.fetchGraphQL<PageResponse>(
        queryStr,
        cursor ? { cursor } : { boardIds: [boardId] }
      );

      let items: RawMondayItem[] = [];
      if (cursor) {
        items = data.next_items_page?.items || [];
        cursor = data.next_items_page?.cursor || null;
      } else {
        const board = data.boards?.[0];
        if (!board) {
          throw new MondayApiError("board_not_found", `Board ${boardId} returned no data`);
        }
        items = board.items_page.items || [];
        cursor = board.items_page.cursor || null;
      }

      allItems.push(...items);
      hasMore = Boolean(cursor && items.length > 0);
    }

    return allItems;
  }
}
