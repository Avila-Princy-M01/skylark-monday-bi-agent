import { RawMondayItem } from "../data/normalize";

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export interface MondayBoardSchema {
  id: string;
  name: string;
  columns: MondayColumn[];
}

export interface MondayColumnMapping {
  [title: string]: string; // Column Title -> Column ID
}

export interface BoardFetchResult {
  schema: MondayBoardSchema;
  items: RawMondayItem[];
  columnMapping: MondayColumnMapping;
}

/**
 * Data-source abstraction for monday.com.
 *
 * The assignment allows either the GraphQL API or MCP. Implementing both behind
 * one interface means the transport is a configuration choice rather than a
 * code change, and keeps the normalization/metric layers transport-agnostic.
 */
export interface MondayDataSource {
  readonly kind: "graphql" | "mcp";
  getBoardSchema(boardId: string): Promise<MondayBoardSchema>;
  fetchAllItems(boardId: string): Promise<RawMondayItem[]>;
  buildColumnMapping(schema: MondayBoardSchema): MondayColumnMapping;
}

/** Cursor pagination is mandatory: items_page caps `limit` at 100. */
export const ITEMS_PAGE_LIMIT = 100;
