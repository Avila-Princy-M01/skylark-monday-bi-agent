import { NextResponse } from "next/server";
import { getCachedData, setCachedData } from "@/lib/data/cache";
import { generateDataQualityReport } from "@/lib/data/quality-report";
import { computePipelineHealth, getStalledDeals } from "@/lib/metrics/pipeline";
import { computeRevenueMetrics } from "@/lib/metrics/revenue";
import { computeCollectionsMetrics } from "@/lib/metrics/collections";
import { computeOperationsMetrics } from "@/lib/metrics/operations";
import { computeConcentrationRisk } from "@/lib/metrics/concentration";
import { formatInr } from "@/lib/data/normalize";

export async function GET() {
  try {
    let cached = getCachedData();
    if (!cached) {
      const normalized = generateDataQualityReport([], []);
      cached = setCachedData({
        deals: normalized.deals,
        workOrders: normalized.workOrders,
        report: normalized.report,
        lastSyncedAt: new Date().toISOString(),
      });
    }

    const asOfDate = "2026-03-31";
    const pipe = computePipelineHealth(cached.deals, { asOfDate });
    const stalled = getStalledDeals(cached.deals, { asOfDate });
    const rev = computeRevenueMetrics(cached.workOrders, { asOfDate });
    const col = computeCollectionsMetrics(cached.workOrders, { asOfDate });
    const ops = computeOperationsMetrics(cached.workOrders, { asOfDate });
    const conc = computeConcentrationRisk(cached.deals, cached.workOrders, { asOfDate });

    const markdown = `# 🦅 Skylark Drones — Executive Leadership Brief

> **As-Of Date:** ${asOfDate} | **Scope:** Full Indian Fiscal Year (FY25-26)  
> **Data Quality Status:** ${cached.report.issues.length} normalization adjustments applied across ${cached.deals.length} deals & ${cached.workOrders.length} work orders.

---

## 1. 🎯 Headline Commercial & Operational KPIs

| Dimension | Primary Metric | Deterministic Value | Notes / Basis |
| :--- | :--- | :--- | :--- |
| **Pipeline (Open)** | Total Open Pipeline | \`${formatInr(pipe.totalOpenValue)}\` | ${pipe.openDealsCount} active deals |
| **Pipeline (Risk-Adjusted)** | Weighted Pipeline | \`${formatInr(pipe.weightedPipelineValue)}\` | Weights: H=0.7, M=0.4, L=0.15 |
| **Contracted Order Book** | Pre-Tax Signed Orders | \`${formatInr(rev.contractedOrderValueExclGst)}\` | Excl. GST |
| **Recognized Billed Revenue**| Milestone Invoiced | \`${formatInr(rev.billedAmountExclGst)}\` | Excl. GST |
| **Cash Collections** | Inflows to Bank | \`${formatInr(col.totalCollectedInclGst)}\` | Incl. GST |
| **Collection Efficiency** | Cash Inflow ÷ Billed | \`${col.overallCollectionEfficiencyPct}%\` | Across all executed contracts |
| **Outstanding Receivables** | Trapped AR | \`${formatInr(col.totalOutstandingArInclGst)}\` | Incl. GST |
| **Software Attach Rate** | Platform vs Pure Service | \`${ops.softwareAttachRatePct}%\` | Spectra / DMO / Dock presence |

---

## 2. ⚠️ Key Commercial & Execution Risks

1. **Stalled Pipeline Concentration**:
   - **${stalled.stalledDealsCount} open deals** valued at **${formatInr(stalled.totalStalledValue)}** have tentative close dates strictly prior to ${asOfDate}.
2. **Top-Client Concentration Risk**:
   - Top 3 clients constitute **${conc.pipelineTop3ClientSharePct}%** of total open pipeline value.
   - Top 3 clients constitute **${conc.orderBookTop3ClientSharePct}%** of the active order book.
3. **Execution Bottlenecks**:
   - **${ops.notStartedWithPastPoCount} work orders** remain in *Not Started* status despite passed PO dates.

---

## 3. 🛡️ Data Quality Disclosures & Caveats

- **Masked Values**: Excluded ${cached.report.maskedPlaceholderValuesCount} placeholder rows hovering around ~₹1 (treated as undisclosed).
- **Over-Billed Negative Contracts**: ${cached.report.overBilledRecordsCount} work orders exhibited negative unbilled balances and are monitored separately.
- **Empty Columns**: Excluded 100% empty columns (${cached.report.emptyColumnsExcluded.join(", ") || "None"}).
- **Historical Snapshot Limitation**: All metrics represent the current live point-in-time state. Historical week-over-week trends are omitted to prevent ungrounded inferences.

---

## 4. ⚡ 3 Recommended Executive Actions

1. **Conduct Pipeline Hygiene Sprint**: Review the ${stalled.stalledDealsCount} stalled deals with KAMs to revise tentative close dates or mark dead.
2. **Accelerate AR Collection on Top Debtors**: Prioritize outreach on the top receivables accounts representing ${formatInr(col.totalOutstandingArInclGst)}.
3. **Unblock Past-PO Work Orders**: Triage the ${ops.notStartedWithPastPoCount} unstarted work orders with the operations team to prevent delivery SLA breaches.
`;

    return NextResponse.json({
      markdown,
      generatedAt: new Date().toISOString(),
      asOfDate,
      kpis: {
        totalOpenValue: pipe.totalOpenValue,
        weightedPipelineValue: pipe.weightedPipelineValue,
        contractedOrderValueExclGst: rev.contractedOrderValueExclGst,
        billedAmountExclGst: rev.billedAmountExclGst,
        collectedAmountInclGst: col.totalCollectedInclGst,
        collectionEfficiencyPct: col.overallCollectionEfficiencyPct,
        outstandingArInclGst: col.totalOutstandingArInclGst,
        stalledDealsCount: stalled.stalledDealsCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate brief" },
      { status: 500 }
    );
  }
}
