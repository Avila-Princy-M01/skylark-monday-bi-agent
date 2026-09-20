import { describe, it, expect, beforeEach } from "vitest";
import {
  recordSnapshot,
  getSnapshotLedger,
  clearSnapshotLedger,
  computeTemporalTrends,
  FinancialSnapshot,
} from "../lib/data/snapshot-ledger";
import { normalizeDeals, normalizeWorkOrders } from "../lib/data/normalize";
import { mockDealsItems, mockDealsBoardSchema } from "./fixtures/monday/deals.fixture";
import {
  mockWorkOrdersItems,
  mockWorkOrdersColumnMap,
} from "./fixtures/monday/work-orders.fixture";
import { createDeterministicToolRegistry } from "../lib/tools/registry";

describe("Temporal Snapshot Ledger & Metric Velocity", () => {
  const dealsColumnMap: Record<string, string> = {};
  for (const c of mockDealsBoardSchema.columns) {
    dealsColumnMap[c.title] = c.id;
  }

  const { deals } = normalizeDeals(mockDealsItems, dealsColumnMap);
  const { workOrders } = normalizeWorkOrders(mockWorkOrdersItems, mockWorkOrdersColumnMap);

  beforeEach(() => {
    clearSnapshotLedger();
  });

  it("records a financial snapshot with accurate baseline metrics", () => {
    const snap = recordSnapshot(deals, workOrders, "2026-03-31");

    expect(snap.id).toMatch(/^snap_/);
    expect(snap.openPipeline).toBeGreaterThan(0);
    expect(snap.openDealsCount).toBe(2);
    expect(snap.contractedOrderValue).toBeGreaterThan(0);
    expect(snap.billedRevenue).toBeGreaterThan(0);
    expect(snap.collectedCash).toBeGreaterThan(0);
    expect(snap.uncollectedAr).toBeGreaterThan(0);
    expect(snap.collectionEfficiencyPct).toBeGreaterThan(0);

    const ledger = getSnapshotLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].id).toBe(snap.id);
  });

  it("returns baseline narrative when only one snapshot exists", () => {
    recordSnapshot(deals, workOrders, "2026-03-31");
    const trends = computeTemporalTrends();

    expect(trends.snapshotCount).toBe(1);
    expect(trends.velocities.length).toBe(0);
    expect(trends.summary).toContain("Baseline snapshot recorded");
  });

  it("calculates multi-snapshot velocity and directional deltas accurately", () => {
    const customLedger: FinancialSnapshot[] = [
      {
        id: "snap_1",
        timestamp: "2026-03-01T10:00:00.000Z",
        openPipeline: 10000000,
        weightedPipeline: 6000000,
        openDealsCount: 10,
        stalledDealsAmount: 2000000,
        stalledDealsCount: 2,
        contractedOrderValue: 8000000,
        billedRevenue: 5000000,
        collectedCash: 3500000,
        uncollectedAr: 1500000,
        collectionEfficiencyPct: 70.0,
        activeWorkOrdersCount: 5,
      },
      {
        id: "snap_2",
        timestamp: "2026-03-15T10:00:00.000Z",
        openPipeline: 12000000,
        weightedPipeline: 7500000,
        openDealsCount: 12,
        stalledDealsAmount: 1500000,
        stalledDealsCount: 1,
        contractedOrderValue: 9500000,
        billedRevenue: 6500000,
        collectedCash: 5200000,
        uncollectedAr: 1300000,
        collectionEfficiencyPct: 80.0,
        activeWorkOrdersCount: 6,
      },
    ];

    const trends = computeTemporalTrends(customLedger);

    expect(trends.snapshotCount).toBe(2);
    expect(trends.velocities.length).toBe(6);

    const pipeVel = trends.velocities.find((v) => v.metric === "Open Pipeline Value");
    expect(pipeVel).toBeDefined();
    expect(pipeVel!.delta).toBe(2000000);
    expect(pipeVel!.pctChange).toBe(20.0);
    expect(pipeVel!.direction).toBe("up");

    const stalledVel = trends.velocities.find((v) => v.metric === "Stalled Deals Amount");
    expect(stalledVel).toBeDefined();
    expect(stalledVel!.delta).toBe(-500000);
    expect(stalledVel!.direction).toBe("down");

    const effVel = trends.velocities.find((v) => v.metric === "Collection Efficiency (%)");
    expect(effVel).toBeDefined();
    expect(effVel!.delta).toBe(10);
    expect(effVel!.direction).toBe("up");

    expect(trends.summary).toContain("Analyzed 2 snapshots");
    expect(trends.summary).toContain("Pipeline shifted");
  });

  it("executes get_temporal_trends via deterministic tool registry", async () => {
    // Populate ledger with initial snapshot
    recordSnapshot(deals, workOrders, "2026-03-31");

    const registry = createDeterministicToolRegistry({
      deals,
      workOrders,
      asOfDate: "2026-03-31",
    });

    const result = await registry.get_temporal_trends.execute({});
    expect(result.trends).toBeDefined();
    expect(result.factSheet.numbers).toBeDefined();
    expect(result.factSheet.assumptions.length).toBeGreaterThan(0);
    expect(result.trends.snapshotCount).toBeGreaterThanOrEqual(1);
  });
});
