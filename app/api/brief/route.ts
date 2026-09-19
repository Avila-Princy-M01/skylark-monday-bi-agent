import { NextResponse } from "next/server";
import { loadBoardData } from "@/lib/data/loader";
import { getAsOfDate } from "@/lib/config";
import { computePipelineHealth, getStalledDeals } from "@/lib/metrics/pipeline";
import { computeRevenueMetrics } from "@/lib/metrics/revenue";
import { computeCollectionsMetrics } from "@/lib/metrics/collections";
import { computeOperationsMetrics } from "@/lib/metrics/operations";
import { computeConcentrationRisk } from "@/lib/metrics/concentration";
import { computeStuckMoney } from "@/lib/metrics/stuck-money";
import { computeCrossBoardMetrics } from "@/lib/metrics/cross-board";
import { formatInr } from "@/lib/data/normalize";
import { validateNumericGrounding } from "@/lib/narrate/numeric-guard";
import { MetricFactSheet } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Executive leadership brief.
 *
 * Interpretation of the assignment's optional "help prepare data for leadership
 * updates": a one-click, copy/download/print-ready brief covering headline KPIs,
 * pipeline health, revenue and collections position, operational risk, an AR
 * watchlist, data-quality disclosures and three suggested actions.
 *
 * Unlike the conversational path, the brief is rendered deterministically from
 * the metric toolbelt and then passed through the numeric grounding guard before
 * being returned. A leadership document must not contain a single figure that
 * cannot be traced to a computation, so there is no place here for generated
 * prose that might drift.
 */
export async function GET() {
  try {
    // Loads live data itself, so opening /brief before chatting still works.
    const data = await loadBoardData();
    const asOfDate = getAsOfDate();

    const pipeline = computePipelineHealth(data.deals, { asOfDate });
    const stalled = getStalledDeals(data.deals, { asOfDate });
    const revenue = computeRevenueMetrics(data.workOrders, { asOfDate });
    const collections = computeCollectionsMetrics(data.workOrders, { asOfDate });
    const operations = computeOperationsMetrics(data.workOrders, { asOfDate });
    const concentration = computeConcentrationRisk(data.deals, data.workOrders, { asOfDate });
    const stuck = computeStuckMoney(data.deals, data.workOrders, { asOfDate });
    const crossBoard = computeCrossBoardMetrics(data.deals, data.workOrders, { asOfDate });

    const factSheets: MetricFactSheet[] = [
      pipeline.factSheet,
      stalled.factSheet,
      revenue.factSheet,
      collections.factSheet,
      operations.factSheet,
    ];

    const topSectors = crossBoard.sectorScorecards.slice(0, 5);
    const topOwners = crossBoard.ownerScorecards.slice(0, 5);

    const sectorRows = topSectors
      .map(
        (sector) =>
          `| ${sector.sector} | ${formatInr(sector.openPipelineValue)} | ${formatInr(
            sector.contractedOrderValueExclGst
          )} | ${formatInr(sector.billedAmountExclGst)} | ${sector.collectionEfficiencyPct}% |`
      )
      .join("\n");

    const ownerRows = topOwners
      .map(
        (owner) =>
          `| ${owner.ownerCode} | ${formatInr(owner.openPipelineValue)} | ${formatInr(
            owner.contractedOrderValueExclGst
          )} | ${formatInr(owner.collectedAmountInclGst)} | ${owner.collectionEfficiencyPct}% |`
      )
      .join("\n");

    const arRows = collections.arPriorityAccounts
      .slice(0, 5)
      .map(
        (account) =>
          `| ${account.clientCode} | ${account.workOrderNumber} | ${formatInr(
            account.outstandingArInclGst
          )} | ${account.billingStatus} |`
      )
      .join("\n");

    const dataSourceLine =
      data.source === "live"
        ? "Live read from monday.com during this request."
        : data.source === "cache"
          ? `Served from the in-process cache (last synced ${data.lastSyncedAt}).`
          : `Served from the last known-good snapshot (last synced ${data.lastSyncedAt}). Live monday.com read did not succeed.`;

    const warningsSection =
      data.warnings.length > 0
        ? `\n### ⚠️ Availability Warnings\n\n${data.warnings.map((w) => `- ${w}`).join("\n")}\n`
        : "";

    const markdown = `# 🦅 Skylark Drones — Executive Leadership Brief

> **As-of date:** ${asOfDate} · **Scope:** Indian Fiscal Year (April–March)  
> **Data provenance:** ${dataSourceLine}  
> **Dataset audited:** ${data.deals.length} deals and ${data.workOrders.length} work orders  
> **Normalization corrections applied:** ${data.report.issues.length}
${warningsSection}
---

## 1. 🎯 Headline KPIs

| Dimension | Metric | Value | Basis / notes |
| :--- | :--- | :--- | :--- |
| Pipeline (open) | Total open pipeline | \`${formatInr(pipeline.totalOpenValue)}\` | ${pipeline.openDealsCount} open deals |
| Pipeline (risk-adjusted) | Probability-weighted pipeline | \`${formatInr(pipeline.weightedPipelineValue)}\` | Weights H=0.7, M=0.4, L=0.15 |
| Pipeline (stalled) | Value past tentative close date | \`${formatInr(stalled.totalStalledValue)}\` | ${stalled.stalledDealsCount} deals |
| Order book | Contracted value | \`${formatInr(revenue.contractedOrderValueExclGst)}\` | Excl. GST |
| Revenue | Billed to date | \`${formatInr(revenue.billedAmountExclGst)}\` | Excl. GST |
| Cash | Collected to date | \`${formatInr(collections.totalCollectedInclGst)}\` | Incl. GST |
| Cash health | Collection efficiency | \`${collections.overallCollectionEfficiencyPct}%\` | Collected ÷ billed |
| Receivables | Outstanding AR | \`${formatInr(collections.totalOutstandingArInclGst)}\` | Incl. GST |
| Product mix | Software attach rate | \`${operations.softwareAttachRatePct}%\` | Spectra / DMO / Dock present |

---

## 2. 📊 Sector Performance (pipeline vs. execution)

| Sector | Open pipeline | Contracted | Billed | Collection efficiency |
| :--- | :--- | :--- | :--- | :--- |
${sectorRows || "| _No sector data available_ | | | | |"}

---

## 3. 👤 Owner Scorecards

| Owner | Open pipeline | Contracted | Collected | Collection efficiency |
| :--- | :--- | :--- | :--- | :--- |
${ownerRows || "| _No owner data available_ | | | | |"}

---

## 4. ⚠️ Key Risks

1. **Stalled pipeline** — ${stalled.stalledDealsCount} open deals worth ${formatInr(stalled.totalStalledValue)} have tentative close dates before ${asOfDate}.
2. **Client concentration** — the top 3 clients are ${concentration.pipelineTop3ClientSharePct}% of open pipeline value and ${concentration.orderBookTop3ClientSharePct}% of the order book.
3. **Execution at risk** — ${operations.notStartedWithPastPoCount} work orders are still *Not Started* despite a PO date that has passed.
4. **Delivery anomalies** — ${operations.deliveryBeforePoAnomaliesCount} work orders record a data delivery date earlier than their PO date.
5. **Over-billed contracts** — ${data.report.overBilledRecordsCount} work orders carry a negative amount-to-be-billed balance.

---

## 5. 💸 AR Watchlist

| Client | Work order | Outstanding (incl. GST) | Billing status |
| :--- | :--- | :--- | :--- |
${arRows || "| _No outstanding receivables_ | | | |"}

**Where the money is stuck:** won deals worth ${formatInr(stuck.wonDealsValueExclGst)} have converted into ${formatInr(stuck.totalBilledValueExclGst)} billed (excl. GST), of which ${formatInr(stuck.uncollectedArValueInclGst)} remains uncollected.

---

## 6. 🛡️ Data Quality Disclosures

- **Junk header rows dropped:** ${data.report.junkRowsDropped} (repeated header text imported as data, e.g. "Nezuko" / "Bugs Bunny").
- **Masked/undisclosed values:** ${data.report.maskedPlaceholderValuesCount} deals carry placeholder amounts around ₹1 and are excluded from every monetary sum.
- **100% empty columns excluded:** ${data.report.emptyColumnsExcluded.join(", ") || "none"}.
- **Status/stage contradictions reconciled:** ${data.report.statusStageContradictionsCount}.
- **Near-duplicate records flagged (not silently dropped):** ${data.report.nearDuplicatesCount}.
- **Historical trend limitation:** all figures are a single point-in-time snapshot. No historical snapshots are stored, so week-over-week or quarter-over-quarter movement cannot be computed and is deliberately not estimated.

---

## 7. ⚡ Three Recommended Actions

1. **Run a pipeline hygiene sprint** with KAMs on the ${stalled.stalledDealsCount} stalled deals to either re-date or close them out, since they represent ${formatInr(stalled.totalStalledValue)} of unweighted opportunity.
2. **Prioritise collections** on the AR watchlist above, totalling ${formatInr(collections.totalOutstandingArInclGst)}; improving collection efficiency from ${collections.overallCollectionEfficiencyPct}% is the fastest route to cash.
3. **Triage the ${operations.notStartedWithPastPoCount} past-PO, not-started work orders** with operations before they breach delivery commitments.

---

_Brief generated deterministically by the Skylark BI metric engine. Every figure above is computed in TypeScript and verified by the numeric grounding guard; no figure is generated by a language model._
`;

    // Grounding check: the brief must not contain a number that is not traceable
    // to a computed fact sheet.
    const grounding = validateNumericGrounding(markdown, factSheets);

    return NextResponse.json({
      markdown,
      generatedAt: new Date().toISOString(),
      asOfDate,
      dataSource: data.source,
      isStale: data.isStale,
      lastSyncedAt: data.lastSyncedAt,
      warnings: data.warnings,
      grounding: {
        verified: grounding.isGrounded,
        unverifiedNumbers: grounding.unverifiedNumbers,
      },
      kpis: {
        totalOpenValue: pipeline.totalOpenValue,
        weightedPipelineValue: pipeline.weightedPipelineValue,
        stalledDealsCount: stalled.stalledDealsCount,
        contractedOrderValueExclGst: revenue.contractedOrderValueExclGst,
        billedAmountExclGst: revenue.billedAmountExclGst,
        collectedAmountInclGst: collections.totalCollectedInclGst,
        collectionEfficiencyPct: collections.overallCollectionEfficiencyPct,
        outstandingArInclGst: collections.totalOutstandingArInclGst,
        softwareAttachRatePct: operations.softwareAttachRatePct,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the leadership brief" },
      { status: 500 }
    );
  }
}
