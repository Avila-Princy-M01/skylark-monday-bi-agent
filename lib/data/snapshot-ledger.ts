import fs from "fs";
import path from "path";
import os from "os";
import { Deal, WorkOrder } from "./types";

export interface FinancialSnapshot {
  id: string;
  timestamp: string; // ISO 8601
  openPipeline: number;
  weightedPipeline: number;
  openDealsCount: number;
  stalledDealsAmount: number;
  stalledDealsCount: number;
  contractedOrderValue: number;
  billedRevenue: number;
  collectedCash: number;
  uncollectedAr: number;
  collectionEfficiencyPct: number;
  activeWorkOrdersCount: number;
}

export interface MetricVelocity {
  metric: string;
  previous: number;
  current: number;
  delta: number;
  pctChange: number | null;
  direction: "up" | "down" | "flat";
}

export interface TemporalTrendResult {
  snapshotCount: number;
  earliestTimestamp?: string;
  latestTimestamp?: string;
  timeSpanMinutes: number;
  velocities: MetricVelocity[];
  summary: string;
  snapshots: FinancialSnapshot[];
}

const MAX_LEDGER_ENTRIES = 30;
let memoryLedger: FinancialSnapshot[] = [];

function getLedgerFilePath(): string {
  try {
    return path.join(os.tmpdir(), "skylark_snapshot_ledger.json");
  } catch {
    return "skylark_snapshot_ledger.json";
  }
}

function loadDiskLedger(): FinancialSnapshot[] {
  try {
    const filePath = getLedgerFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Non-blocking in ephemeral/sandboxed environments
  }
  return [];
}

function saveDiskLedger(ledger: FinancialSnapshot[]): void {
  try {
    const filePath = getLedgerFilePath();
    fs.writeFileSync(filePath, JSON.stringify(ledger.slice(-MAX_LEDGER_ENTRIES)), "utf-8");
  } catch {
    // Non-blocking
  }
}

/**
 * Returns the rolling snapshot ledger (combines memory and disk)
 */
export function getSnapshotLedger(): FinancialSnapshot[] {
  if (memoryLedger.length === 0) {
    memoryLedger = loadDiskLedger();
  }
  return [...memoryLedger];
}

/**
 * Clears the snapshot ledger (useful for test isolation)
 */
export function clearSnapshotLedger(): void {
  memoryLedger = [];
  try {
    const filePath = getLedgerFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Non-blocking
  }
}

/**
 * Takes a financial snapshot of the current deals and work orders, appending it to the ledger.
 */
export function recordSnapshot(
  deals: Deal[],
  workOrders: WorkOrder[],
  asOfDate: string = new Date().toISOString().slice(0, 10),
  customTimestamp?: string
): FinancialSnapshot {
  const currentLedger = getSnapshotLedger();

  // Calculate Pipeline metrics
  const openDeals = deals.filter((d) => d.status === "Open" && !d.isDuplicate);
  const openPipeline = openDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0);
  const weightedPipeline = openDeals.reduce((sum, d) => {
    const val = d.dealValue || 0;
    const probWeight =
      d.probability === "High"
        ? 0.8
        : d.probability === "Medium"
          ? 0.5
          : d.probability === "Low"
            ? 0.2
            : 0.3;
    return sum + val * probWeight;
  }, 0);

  const stalledDeals = openDeals.filter(
    (d) => d.tentativeCloseDate && d.tentativeCloseDate < asOfDate
  );
  const stalledDealsAmount = stalledDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0);

  // Calculate Work Orders metrics
  const activeOrders = workOrders.filter(
    (wo) => !wo.isDuplicate && wo.executionStatus !== "Cancelled"
  );
  const contractedOrderValue = activeOrders.reduce((sum, wo) => sum + wo.orderValueExclGst, 0);
  const billedRevenue = activeOrders.reduce((sum, wo) => sum + wo.billedAmountExclGst, 0);
  const totalBilledInclGst = activeOrders.reduce((sum, wo) => sum + wo.billedAmountInclGst, 0);
  const collectedCash = activeOrders.reduce((sum, wo) => sum + wo.collectedAmountInclGst, 0);
  const uncollectedAr = activeOrders.reduce((sum, wo) => sum + wo.uncollectedAmountInclGst, 0);
  const collectionEfficiencyPct =
    totalBilledInclGst > 0 ? (collectedCash / totalBilledInclGst) * 100 : 0;

  const timestamp = customTimestamp || new Date().toISOString();
  const snapshot: FinancialSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp,
    openPipeline: Math.round(openPipeline),
    weightedPipeline: Math.round(weightedPipeline),
    openDealsCount: openDeals.length,
    stalledDealsAmount: Math.round(stalledDealsAmount),
    stalledDealsCount: stalledDeals.length,
    contractedOrderValue: Math.round(contractedOrderValue),
    billedRevenue: Math.round(billedRevenue),
    collectedCash: Math.round(collectedCash),
    uncollectedAr: Math.round(uncollectedAr),
    collectionEfficiencyPct: Math.round(collectionEfficiencyPct * 10) / 10,
    activeWorkOrdersCount: activeOrders.length,
  };

  currentLedger.push(snapshot);
  if (currentLedger.length > MAX_LEDGER_ENTRIES) {
    currentLedger.shift();
  }

  memoryLedger = currentLedger;
  saveDiskLedger(memoryLedger);

  return snapshot;
}

function calculateVelocity(metric: string, previous: number, current: number): MetricVelocity {
  const delta = current - previous;
  const pctChange = previous !== 0 ? (delta / previous) * 100 : null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return {
    metric,
    previous: Math.round(previous),
    current: Math.round(current),
    delta: Math.round(delta),
    pctChange: pctChange !== null ? Math.round(pctChange * 10) / 10 : null,
    direction,
  };
}

/**
 * Computes comparative velocities and trends across snapshots in the ledger.
 */
export function computeTemporalTrends(ledger?: FinancialSnapshot[]): TemporalTrendResult {
  const list = ledger || getSnapshotLedger();

  if (list.length === 0) {
    return {
      snapshotCount: 0,
      timeSpanMinutes: 0,
      velocities: [],
      summary:
        "No historical snapshots recorded yet. Trend analysis requires at least one snapshot.",
      snapshots: [],
    };
  }

  if (list.length === 1) {
    const single = list[0];
    return {
      snapshotCount: 1,
      earliestTimestamp: single.timestamp,
      latestTimestamp: single.timestamp,
      timeSpanMinutes: 0,
      velocities: [],
      summary: `Baseline snapshot recorded at ${single.timestamp}. Open pipeline is ₹${(single.openPipeline / 1e7).toFixed(2)} Cr with collection efficiency at ${single.collectionEfficiencyPct}%. Subsequent synchronizations will calculate velocity and trends.`,
      snapshots: list,
    };
  }

  const earliest = list[0];
  const latest = list[list.length - 1];
  const timeSpanMinutes = Math.max(
    0,
    Math.round(
      (new Date(latest.timestamp).getTime() - new Date(earliest.timestamp).getTime()) / 60000
    )
  );

  const velocities: MetricVelocity[] = [
    calculateVelocity("Open Pipeline Value", earliest.openPipeline, latest.openPipeline),
    calculateVelocity(
      "Stalled Deals Amount",
      earliest.stalledDealsAmount,
      latest.stalledDealsAmount
    ),
    calculateVelocity("Billed Revenue (Excl. GST)", earliest.billedRevenue, latest.billedRevenue),
    calculateVelocity("Cash Collected", earliest.collectedCash, latest.collectedCash),
    calculateVelocity("Uncollected AR", earliest.uncollectedAr, latest.uncollectedAr),
    calculateVelocity(
      "Collection Efficiency (%)",
      earliest.collectionEfficiencyPct,
      latest.collectionEfficiencyPct
    ),
  ];

  const pipeVel = velocities.find((v) => v.metric === "Open Pipeline Value")!;
  const collVel = velocities.find((v) => v.metric === "Collection Efficiency (%)")!;
  const stalledVel = velocities.find((v) => v.metric === "Stalled Deals Amount")!;

  const summary =
    `Analyzed ${list.length} snapshots across ${timeSpanMinutes} minutes. ` +
    `Pipeline shifted by ₹${(pipeVel.delta / 1e5).toFixed(1)} Lakh (${pipeVel.pctChange !== null ? `${pipeVel.pctChange}%` : "N/A"}), ` +
    `Stalled deals changed by ₹${(stalledVel.delta / 1e5).toFixed(1)} Lakh, ` +
    `and Collection Efficiency changed by ${collVel.delta >= 0 ? `+${collVel.delta}` : collVel.delta}% percentage points.`;

  return {
    snapshotCount: list.length,
    earliestTimestamp: earliest.timestamp,
    latestTimestamp: latest.timestamp,
    timeSpanMinutes,
    velocities,
    summary,
    snapshots: list,
  };
}
