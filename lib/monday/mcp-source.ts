import { MondayApiError, withExponentialBackoff } from "./errors";
import { RawMondayItem } from "../data/normalize";
import {
  MondayBoardSchema,
  MondayColumnMapping,
  MondayDataSource,
  ITEMS_PAGE_LIMIT,
} from "./source";

/**
 * monday.com MCP data source.
 *
 * The official monday Platform MCP server (https://mcp.monday.com/mcp) speaks
 * the Model Context Protocol over Streamable HTTP, i.e. JSON-RPC 2.0 POSTs.
 *
 * Design note: MCP is an interactive, LLM-oriented protocol, so it is a poor
 * fit for bulk ETL — every call still consumes the same monday API quota, with
 * extra serialization overhead. The GraphQL source is therefore the default,
 * and this implementation exists so the transport is a configuration choice
 * (MONDAY_DATA_SOURCE=mcp) rather than a code change, which is what the brief
 * asks for.
 */

/** monday MCP tool names, kept as constants so drift is easy to spot. */
export const MCP_TOOLS = {
  boardInfo: "get_board_info",
  boardItemsPage: "get_board_items_page",
  /** Generic escape hatch: proxies a raw GraphQL query through the MCP server. */
  rawGraphQL: "all_monday_api",
} as const;

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

type FetchLike = typeof fetch;

export interface McpSourceOptions {
  apiToken?: string;
  serverUrl?: string;
  apiVersion?: string;
  fetchImpl?: FetchLike;
}

export class MondayMcpSource implements MondayDataSource {
  public readonly kind = "mcp" as const;

  private apiToken: string;
  private serverUrl: string;
  private apiVersion: string;
  private fetchImpl: FetchLike;
  private requestId = 0;

  constructor(options: McpSourceOptions = {}) {
    this.apiToken = options.apiToken || process.env.MONDAY_API_TOKEN || "";
    this.serverUrl = options.serverUrl || "https://mcp.monday.com/mcp";
    this.apiVersion = options.apiVersion || "2024-10";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.apiToken) {
      throw new MondayApiError(
        "unauthorized",
        "MONDAY_API_TOKEN is missing. Please set your monday.com API key."
      );
    }

    return withExponentialBackoff(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let res: Response;
      try {
        res = await this.fetchImpl(this.serverUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${this.apiToken}`,
            "API-Version": this.apiVersion,
            "MCP-Protocol-Version": "2025-06-18",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: ++this.requestId,
            method,
            params,
          }),
          signal: controller.signal,
        });
      } catch (networkErr) {
        throw new MondayApiError("network_error", "Failed to reach the monday MCP server", {
          originalError: networkErr,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 401 || res.status === 403) {
        throw new MondayApiError("unauthorized", "Invalid or expired Monday API token", {
          statusCode: res.status,
        });
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
        throw new MondayApiError("rate_limited", "Monday MCP rate limit hit", {
          statusCode: 429,
          retryAfterSeconds: retryAfter,
        });
      }

      if (!res.ok) {
        throw new MondayApiError("unknown", `MCP server responded with HTTP ${res.status}`, {
          statusCode: res.status,
        });
      }

      const text = await res.text();
      // Streamable HTTP servers may answer with an SSE frame rather than bare JSON.
      const payload = text.trimStart().startsWith("event:")
        ? text
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("")
        : text;

      let json: JsonRpcResponse;
      try {
        json = JSON.parse(payload) as JsonRpcResponse;
      } catch {
        throw new MondayApiError("malformed_response", "MCP server returned unparseable JSON");
      }

      if (json.error) {
        const message = json.error.message || "Unknown MCP error";
        if (/complexity/i.test(message)) {
          throw new MondayApiError("complexity_budget_exceeded", message);
        }
        if (/daily limit/i.test(message)) {
          throw new MondayApiError("daily_limit_exceeded", message);
        }
        throw new MondayApiError("malformed_response", message);
      }

      return json;
    });
  }

  /** Calls an MCP tool and returns its decoded payload. */
  public async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.rpc("tools/call", { name, arguments: args });
    const result = response.result;

    if (!result) {
      throw new MondayApiError("malformed_response", `MCP tool ${name} returned no result`);
    }
    if (result.isError) {
      const message = result.content?.[0]?.text || `MCP tool ${name} failed`;
      throw new MondayApiError("malformed_response", message);
    }
    if (result.structuredContent) return result.structuredContent;

    const text = result.content?.find((part) => part.type === "text")?.text;
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** Handshake used by MCP clients before tool calls. Failure is non-fatal. */
  public async initialize(): Promise<boolean> {
    try {
      await this.rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "skylark-bi-agent", version: "1.0.0" },
      });
      return true;
    } catch {
      return false;
    }
  }

  public async getBoardSchema(boardId: string): Promise<MondayBoardSchema> {
    const info = (await this.callTool(MCP_TOOLS.boardInfo, { boardId })) as {
      id?: string;
      name?: string;
      columns?: MondayBoardSchema["columns"];
    } | null;

    if (!info || !info.columns) {
      throw new MondayApiError(
        "board_not_found",
        `MCP server did not return a schema for board ${boardId}`
      );
    }

    return {
      id: String(info.id ?? boardId),
      name: info.name ?? `Board ${boardId}`,
      columns: info.columns.map((col) => ({
        id: col.id,
        title: col.title,
        type: col.type,
      })),
    };
  }

  public buildColumnMapping(schema: MondayBoardSchema): MondayColumnMapping {
    const map: MondayColumnMapping = {};
    for (const col of schema.columns) {
      map[col.title.trim()] = col.id;
    }
    return map;
  }

  public async fetchAllItems(boardId: string): Promise<RawMondayItem[]> {
    const allItems: RawMondayItem[] = [];
    let cursor: string | null = null;

    for (;;) {
      const page = (await this.callTool(MCP_TOOLS.boardItemsPage, {
        boardId,
        limit: ITEMS_PAGE_LIMIT,
        ...(cursor ? { cursor } : {}),
      })) as { cursor?: string | null; items?: RawMondayItem[] } | null;

      const items = page?.items ?? [];
      allItems.push(...items);

      cursor = page?.cursor ?? null;
      if (!cursor || items.length === 0) break;
    }

    return allItems;
  }
}
