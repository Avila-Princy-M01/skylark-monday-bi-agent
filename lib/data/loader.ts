import { generateDataQualityReport } from "./quality-report";
import { getCachedData, setCachedData, invalidateCache, CachedDataState } from "./cache";
import { createMondaySource } from "../monday/factory";
import { MondayApiError } from "../monday/errors";
import { getMondayConfig, isMondayConfigured } from "../config";
import { DataQualityReport, Deal, WorkOrder } from "./types";
import { getCacheTtlSeconds } from "../config";

export type DataSourceLabel = "live" | "cache" | "stale_snapshot" | "unavailable";

export interface LoadedBoardData {
  deals: Deal[];
  workOrders: WorkOrder[];
  report: DataQualityReport;
  lastSyncedAt: string;
  source: DataSourceLabel;
  isStale: boolean;
  /** Human-readable problems, surfaced in the UI and in every answer. */
  warnings: string[];
  /** Authored when the live read failed, for the health endpoint and traces. */
  mondayError?: string;
}

export const ttlSeconds = getCacheTtlSeconds;

const EMPTY_REPORT: DataQualityReport = {
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
  generatedAt: new Date(0).toISOString(),
};

function describeMondayError(error: unknown): string {
  if (error instanceof MondayApiError) {
    switch (error.kind) {
      case "unauthorized":
        return "monday.com rejected the API token (unauthorized). Check MONDAY_API_TOKEN.";
      case "rate_limited":
        return "monday.com rate limit reached; backing off.";
      case "daily_limit_exceeded":
        return "monday.com daily API limit exhausted.";
      case "complexity_budget_exceeded":
        return "monday.com complexity budget exhausted by the board read.";
      case "board_not_found":
        return "One of the configured monday.com boards could not be found.";
      case "network_error":
        return "Could not reach monday.com (network error or timeout).";
      default:
        return `monday.com read failed: ${error.message}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function ageDescription(isoTimestamp: string): string {
  const ageMs = Date.now() - new Date(isoTimestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "unknown age";
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "less than a minute old";
  if (minutes < 60) return `${minutes} minute(s) old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour(s) old`;
  return `${Math.floor(hours / 24)} day(s) old`;
}

function toLoaded(state: CachedDataState, warnings: string[]): LoadedBoardData {
  const source: DataSourceLabel =
    state.source === "fallback_snapshot"
      ? "stale_snapshot"
      : state.isStale
        ? "stale_snapshot"
        : state.source;

  return {
    deals: state.deals,
    workOrders: state.workOrders,
    report: state.report,
    lastSyncedAt: state.lastSyncedAt,
    source,
    isStale: state.isStale || state.source === "fallback_snapshot",
    warnings,
  };
}

export interface LoadOptions {
  /** Bypass the cache and force a live read. */
  forceRefresh?: boolean;
  /** Test seam: injected source factory. */
  sourceFactory?: typeof createMondaySource;
}

export async function loadBoardData(options: LoadOptions = {}): Promise<LoadedBoardData> {
  const warnings: string[] = [];

  if (!options.forceRefresh) {
    const cached = getCachedData();
    if (cached && !cached.isStale) {
      return toLoaded(cached, warnings);
    }
  }

  const mondayConfig = getMondayConfig();

  if (!isMondayConfigured(mondayConfig)) {
    // Be explicit rather than quietly serving nothing, which is what previously
    // let the UI look healthy while showing no real data.
    const missing = [
      !mondayConfig.apiToken && "MONDAY_API_TOKEN",
      !mondayConfig.dealsBoardId && "DEALS_BOARD_ID",
      !mondayConfig.workOrdersBoardId && "WORK_ORDERS_BOARD_ID",
    ].filter(Boolean) as string[];

    warnings.push(
      `Live monday.com data is unavailable: missing ${missing.join(", ")}. ` +
        "Answers below are computed from an empty dataset."
    );

    const previous = getCachedData();
    if (previous) {
      warnings.push(
        `Serving the last snapshot instead (${ageDescription(previous.lastSyncedAt)}).`
      );
      return { ...toLoaded(previous, warnings), source: "stale_snapshot", isStale: true };
    }

    return {
      deals: [],
      workOrders: [],
      report: { ...EMPTY_REPORT, generatedAt: new Date().toISOString() },
      lastSyncedAt: new Date().toISOString(),
      source: "unavailable",
      isStale: true,
      warnings,
    };
  }

  const factory = options.sourceFactory ?? createMondaySource;

  try {
    const source = factory(mondayConfig);

    const [dealsSchema, workOrdersSchema] = await Promise.all([
      source.getBoardSchema(mondayConfig.dealsBoardId),
      source.getBoardSchema(mondayConfig.workOrdersBoardId),
    ]);

    const dealsColumnMap = source.buildColumnMapping(dealsSchema);
    const workOrdersColumnMap = source.buildColumnMapping(workOrdersSchema);

    const [rawDeals, rawWorkOrders] = await Promise.all([
      source.fetchAllItems(mondayConfig.dealsBoardId),
      source.fetchAllItems(mondayConfig.workOrdersBoardId),
    ]);

    // Normalization is pure and synchronous: identical raw input always yields
    // identical output, which is what makes the "no AI for math" claim testable.
    const normalized = generateDataQualityReport(
      rawDeals,
      rawWorkOrders,
      dealsColumnMap,
      workOrdersColumnMap
    );

    const state = setCachedData({
      deals: normalized.deals,
      workOrders: normalized.workOrders,
      report: normalized.report,
      lastSyncedAt: new Date().toISOString(),
    });

    return toLoaded(state, warnings);
  } catch (error) {
    const mondayError = describeMondayError(error);
    warnings.push(`Live monday.com read failed: ${mondayError}`);

    const previous = getCachedData();
    if (previous) {
      warnings.push(
        `Serving the last known-good snapshot instead (${ageDescription(previous.lastSyncedAt)}). ` +
          "Figures may not reflect the most recent changes."
      );
      return {
        ...toLoaded(previous, warnings),
        source: "stale_snapshot",
        isStale: true,
        mondayError,
      };
    }

    warnings.push("No cached snapshot is available, so no board data could be loaded.");
    return {
      deals: [],
      workOrders: [],
      report: { ...EMPTY_REPORT, generatedAt: new Date().toISOString() },
      lastSyncedAt: new Date().toISOString(),
      source: "unavailable",
      isStale: true,
      warnings,
      mondayError,
    };
  }
}

/** Clears the cache and immediately reloads from monday.com. */
export async function forceResync(options: LoadOptions = {}): Promise<LoadedBoardData> {
  invalidateCache();
  return loadBoardData({ ...options, forceRefresh: true });
}
