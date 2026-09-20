"use client";

import React from "react";
import { MetricFactSheet } from "@/lib/data/types";
import { formatInr } from "@/lib/data/normalize";
import { TrendingUp, Award, DollarSign, AlertCircle, PieChart, ShieldCheck } from "lucide-react";

interface VisualTelemetryCardProps {
  factSheets?: MetricFactSheet[];
}

export function VisualTelemetryCard({ factSheets }: VisualTelemetryCardProps) {
  if (!factSheets || factSheets.length === 0) return null;

  // 1. Check for Entity Rankings (Top Clients, AR Priority Accounts, Top Owners)
  const entities = factSheets.flatMap((fs) => fs.entities || []);
  const topEntities = entities.slice(0, 5);

  // 2. Check for Financial Pipeline vs Order Book vs Revenue
  let pipelineVal = 0;
  let orderBookVal = 0;
  let billedVal = 0;
  let collectedVal = 0;
  let unbilledBacklog = 0;
  let uncollectedAr = 0;
  let efficiencyPct: number | null = null;

  for (const fs of factSheets) {
    const n = fs.numbers || {};
    if (typeof n.totalPipelineValue === "number")
      pipelineVal = Math.max(pipelineVal, n.totalPipelineValue);
    if (typeof n.totalOpenValue === "number") pipelineVal = Math.max(pipelineVal, n.totalOpenValue);
    if (typeof n.totalOrderBookValue === "number")
      orderBookVal = Math.max(orderBookVal, n.totalOrderBookValue);
    if (typeof n.totalContractedValue === "number")
      orderBookVal = Math.max(orderBookVal, n.totalContractedValue);
    if (typeof n.contractedOrderValueExclGst === "number")
      orderBookVal = Math.max(orderBookVal, n.contractedOrderValueExclGst);
    if (typeof n.totalBilledInclGst === "number")
      billedVal = Math.max(billedVal, n.totalBilledInclGst);
    if (typeof n.billedAmountInclGst === "number")
      billedVal = Math.max(billedVal, n.billedAmountInclGst);
    if (typeof n.totalCollectedInclGst === "number")
      collectedVal = Math.max(collectedVal, n.totalCollectedInclGst);
    if (typeof n.collectedAmountInclGst === "number")
      collectedVal = Math.max(collectedVal, n.collectedAmountInclGst);
    if (typeof n.unbilledBacklogValueExclGst === "number")
      unbilledBacklog = Math.max(unbilledBacklog, n.unbilledBacklogValueExclGst);
    if (typeof n.uncollectedArValueInclGst === "number")
      uncollectedAr = Math.max(uncollectedAr, n.uncollectedArValueInclGst);
    if (typeof n.overallCollectionEfficiencyPct === "number")
      efficiencyPct = n.overallCollectionEfficiencyPct;
  }

  const hasEntities = topEntities.length > 0;
  const hasConversionStages =
    pipelineVal > 0 || orderBookVal > 0 || billedVal > 0 || collectedVal > 0;
  const hasStuckMoney = unbilledBacklog > 0 || uncollectedAr > 0;

  if (!hasEntities && !hasConversionStages && !hasStuckMoney && efficiencyPct === null) {
    return null;
  }

  // Maximum value for scaling horizontal entity bars
  const maxEntityVal = topEntities.reduce((max, e) => Math.max(max, e.value ?? 0), 0);

  return (
    <div className="my-4 border border-[#2A2A2A] bg-gradient-to-b from-[#121212] to-[#0A0A0A] rounded p-4 font-mono text-xs space-y-5 shadow-2xl">
      {/* Header telemetry badge */}
      <div className="flex items-center justify-between border-b border-[#222] pb-2.5">
        <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider text-[10px]">
          <PieChart className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>[ VERIFIED VISUAL TELEMETRY // DYNAMIC BREAKDOWN ]</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded font-bold uppercase">
          <ShieldCheck className="w-3 h-3" />
          <span>DETERMINISTIC 0-DRIFT</span>
        </div>
      </div>

      {/* 1. Entity Breakdown Chart (e.g. Top Clients by Contracted / Billed / AR) */}
      {hasEntities && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-[#888] uppercase tracking-wider font-semibold">
            <span className="flex items-center gap-1.5 text-white">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Entity Ranking & Share Distribution</span>
            </span>
            <span className="text-[10px] text-[#666]">Top {topEntities.length} accounts</span>
          </div>

          <div className="space-y-2.5">
            {topEntities.map((entity, i) => {
              const val = entity.value ?? 0;
              const barWidthPct =
                maxEntityVal > 0 ? Math.max(6, Math.round((val / maxEntityVal) * 100)) : 0;
              const isTop1 = i === 0;

              return (
                <div
                  key={i}
                  className={`p-2.5 rounded border transition-all ${
                    isTop1
                      ? "bg-[#181D24] border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                      : "bg-[#141414] border-[#262626] hover:border-[#3A3A3A]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase ${
                          isTop1 ? "bg-amber-400 text-black shadow-sm" : "bg-[#2A2A2A] text-[#BBB]"
                        }`}
                      >
                        #{entity.rank ?? i + 1}
                      </span>
                      <span className="font-bold text-white tracking-wide truncate text-xs">
                        {entity.name}
                      </span>
                      {entity.category && (
                        <span className="hidden sm:inline-block text-[9px] text-[#777] bg-[#1C1C1C] px-1.5 py-0.5 rounded border border-[#2B2B2B]">
                          {entity.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-right shrink-0">
                      {entity.sharePct !== undefined && (
                        <span className="text-[10px] font-bold text-cyan-400">
                          {entity.sharePct}%
                        </span>
                      )}
                      <span className="font-black text-white text-xs">{formatInr(val)}</span>
                      {entity.count !== undefined && (
                        <span className="text-[9px] text-[#666] hidden md:inline">
                          ({entity.count} orders)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Relative bar track */}
                  <div className="h-1.5 w-full bg-[#1F1F1F] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isTop1
                          ? "bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                          : "bg-gradient-to-r from-blue-600 to-cyan-500"
                      }`}
                      style={{ width: `${barWidthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Capital Realization Stages Funnel (Pipeline -> Order Book -> Billed -> Collected) */}
      {hasConversionStages && (
        <div className="space-y-3 pt-2 border-t border-[#1C1C1C]">
          <div className="flex items-center justify-between text-[11px] text-[#888] uppercase tracking-wider font-semibold">
            <span className="flex items-center gap-1.5 text-white">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Capital Conversion Stages</span>
            </span>
            <span className="text-[10px] text-[#666]">FY25-26 Live Ledger</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {pipelineVal > 0 && (
              <div className="bg-[#141414] border border-[#262626] p-2.5 rounded flex flex-col justify-between">
                <span className="text-[9px] text-[#777] uppercase font-bold">Open Pipeline</span>
                <span className="text-sm font-black text-white mt-1">{formatInr(pipelineVal)}</span>
                <div className="mt-2 h-1 w-full bg-[#222] rounded overflow-hidden">
                  <div className="h-full bg-indigo-500 w-full" />
                </div>
              </div>
            )}

            {orderBookVal > 0 && (
              <div className="bg-[#141414] border border-[#262626] p-2.5 rounded flex flex-col justify-between">
                <span className="text-[9px] text-[#777] uppercase font-bold">
                  Contracted Orders
                </span>
                <span className="text-sm font-black text-cyan-400 mt-1">
                  {formatInr(orderBookVal)}
                </span>
                <div className="mt-2 h-1 w-full bg-[#222] rounded overflow-hidden">
                  <div className="h-full bg-cyan-400 w-full" />
                </div>
              </div>
            )}

            {billedVal > 0 && (
              <div className="bg-[#141414] border border-[#262626] p-2.5 rounded flex flex-col justify-between">
                <span className="text-[9px] text-[#777] uppercase font-bold">Billed Revenue</span>
                <span className="text-sm font-black text-teal-300 mt-1">
                  {formatInr(billedVal)}
                </span>
                <div className="mt-2 h-1 w-full bg-[#222] rounded overflow-hidden">
                  <div className="h-full bg-teal-400 w-full" />
                </div>
              </div>
            )}

            {collectedVal > 0 && (
              <div className="bg-[#141414] border border-[#262626] p-2.5 rounded flex flex-col justify-between">
                <span className="text-[9px] text-[#777] uppercase font-bold">Cash Collected</span>
                <span className="text-sm font-black text-emerald-400 mt-1">
                  {formatInr(collectedVal)}
                </span>
                <div className="mt-2 h-1 w-full bg-[#222] rounded overflow-hidden">
                  <div className="h-full bg-emerald-400 w-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Stuck Money Exposure (Unbilled Backlog vs Uncollected AR) */}
      {hasStuckMoney && (
        <div className="space-y-2 pt-2 border-t border-[#1C1C1C]">
          <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Capital Stuck Exposure</span>
            </span>
            <span>Total Stuck: {formatInr(unbilledBacklog + uncollectedAr)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-2.5 bg-[#1C160B] border border-amber-900/50 rounded flex justify-between items-center">
              <div>
                <div className="text-[9px] text-amber-300/80 uppercase font-bold">
                  Unbilled Backlog
                </div>
                <div className="text-xs font-black text-amber-400 mt-0.5">
                  {formatInr(unbilledBacklog)}
                </div>
              </div>
              <span className="text-[10px] text-amber-400/70">Execution Gap</span>
            </div>

            <div className="p-2.5 bg-[#221111] border border-rose-900/50 rounded flex justify-between items-center">
              <div>
                <div className="text-[9px] text-rose-300/80 uppercase font-bold">
                  Uncollected AR
                </div>
                <div className="text-xs font-black text-rose-400 mt-0.5">
                  {formatInr(uncollectedAr)}
                </div>
              </div>
              <span className="text-[10px] text-rose-400/70">Cashflow Risk</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Collection Efficiency Bar */}
      {efficiencyPct !== null && (
        <div className="pt-2 border-t border-[#1C1C1C] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-[#888] uppercase font-bold">
              Collection Efficiency
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 sm:w-36 h-2 bg-[#222] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  efficiencyPct >= 75
                    ? "bg-emerald-400"
                    : efficiencyPct >= 50
                      ? "bg-amber-400"
                      : "bg-rose-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, efficiencyPct))}%` }}
              />
            </div>
            <span className="text-xs font-black text-white">{efficiencyPct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
