"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  Printer,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Building,
  Users,
  DollarSign,
  FileText,
  Clock,
} from "lucide-react";
import { formatInr } from "@/lib/data/normalize";

interface BriefData {
  markdown: string;
  generatedAt: string;
  asOfDate: string;
  dataSource: string;
  isStale: boolean;
  lastSyncedAt: string;
  warnings?: string[];
  dataset?: {
    dealsCount: number;
    workOrdersCount: number;
    correctionsApplied: number;
    provenance: string;
  };
  grounding?: {
    verified: boolean;
    unverifiedNumbers?: string[];
  };
  kpis?: {
    totalOpenValue: number;
    openDealsCount: number;
    weightedPipelineValue: number;
    stalledValue: number;
    stalledDealsCount: number;
    contractedOrderValueExclGst: number;
    billedAmountExclGst: number;
    collectedAmountInclGst: number;
    collectionEfficiencyPct: number;
    outstandingArInclGst: number;
    softwareAttachRatePct: number;
  };
  topSectors?: Array<{
    sector: string;
    openPipelineValue: number;
    contractedOrderValueExclGst: number;
    billedAmountExclGst: number;
    collectionEfficiencyPct: number;
  }>;
  topOwners?: Array<{
    ownerCode: string;
    openPipelineValue: number;
    contractedOrderValueExclGst: number;
    collectedAmountInclGst: number;
    collectionEfficiencyPct: number;
  }>;
  arWatchlist?: Array<{
    clientCode: string;
    workOrderNumber: string;
    outstandingArInclGst: number;
    billingStatus: string;
  }>;
  stuckMoney?: {
    wonDealsValueExclGst: number;
    totalBilledValueExclGst: number;
    uncollectedArValueInclGst: number;
  };
  risks?: Array<{ title: string; detail: string }>;
  disclosures?: string[];
  recommendations?: string[];
}

export default function ExecBriefPage() {
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"visual" | "markdown">("visual");

  const fetchBrief = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brief");
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrief();
  }, []);

  const handleCopy = () => {
    if (!data?.markdown) return;
    navigator.clipboard.writeText(data.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!data?.markdown) return;
    const element = document.createElement("a");
    const file = new Blob([data.markdown], { type: "text/markdown" });
    element.href = URL.createObjectURL(file);
    element.download = `Skylark_Executive_Brief_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handlePrint = () => {
    window.print();
  };

  const kpis = data?.kpis;

  return (
    <div className="min-h-screen bg-[#070707] text-[#E0E0E0] p-4 md:p-8 font-sans max-w-[1440px] mx-auto border-x border-[#1A1A1A] print:border-none print:p-0 print:bg-white print:text-black">
      {/* Print Stylesheet */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm 15mm 12mm 15mm;
          }
          body {
            background: #ffffff !important;
            color: #111111 !important;
            font-family:
              -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .print-card {
            border: 1px solid #e0e0e0 !important;
            background: #fafafa !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
          .print-table th {
            background-color: #f0f0f0 !important;
            color: #000000 !important;
            border: 1px solid #d0d0d0 !important;
          }
          .print-table td {
            border: 1px solid #e5e5e5 !important;
            color: #111111 !important;
          }
        }
      `}</style>

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation & Action Header */}
        <div className="no-print flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#222]">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-3 py-1.5 border border-[#333] bg-[#111] hover:bg-[#1A1A1A] transition flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#BBB]"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#FF2A2A]" />
              <span>[ Back to Terminal ]</span>
            </Link>
            <div>
              <h1 className="text-sm md:text-base font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <span>Skylark Drones — Executive Leadership Brief</span>
              </h1>
              <p className="text-xs text-[#888]">
                Commercial Performance, Pipeline Health & Operations Dossier
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-[#121212] border border-[#2B2B2B] p-0.5 flex rounded">
              <button
                onClick={() => setViewMode("visual")}
                className={`px-3 py-1 text-xs font-medium rounded transition ${
                  viewMode === "visual"
                    ? "bg-[#242424] text-white shadow-sm font-semibold"
                    : "text-[#888] hover:text-white"
                }`}
              >
                Executive View
              </button>
              <button
                onClick={() => setViewMode("markdown")}
                className={`px-3 py-1 text-xs font-medium rounded transition ${
                  viewMode === "markdown"
                    ? "bg-[#242424] text-white shadow-sm font-semibold"
                    : "text-[#888] hover:text-white"
                }`}
              >
                Raw Text
              </button>
            </div>

            <button
              onClick={fetchBrief}
              disabled={loading}
              className="px-3 py-1.5 text-xs border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] transition flex items-center gap-1.5 font-mono font-bold text-[#BBB]"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#FF2A2A]" : ""}`}
              />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] transition flex items-center gap-1.5 text-[#4AF626] font-mono font-bold"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] transition flex items-center gap-1.5 font-mono font-bold text-[#BBB]"
            >
              <Download className="w-3.5 h-3.5 text-[#FF2A2A]" />
              <span>Export .MD</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs border border-[#E53935] bg-[#C62828] hover:bg-[#D32F2F] text-white transition flex items-center gap-1.5 font-bold shadow-lg shadow-red-950/40 rounded-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="p-16 border border-[#222] bg-[#0D0D0D] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[#FF2A2A]" />
            <span className="text-xs text-[#888] uppercase tracking-widest font-mono font-bold">
              Synthesizing Verified Executive Dossier...
            </span>
          </div>
        ) : viewMode === "markdown" ? (
          /* Raw Markdown Mode */
          <div className="border border-[#262626] bg-[#0E0E0E] p-6 md:p-10 shadow-2xl overflow-x-auto">
            <pre className="whitespace-pre-wrap font-mono text-xs md:text-sm leading-relaxed text-[#D0D0D0]">
              {data?.markdown}
            </pre>
          </div>
        ) : (
          /* Visual Executive Presentation / PDF View */
          <div className="space-y-6 print:space-y-4">
            {/* Dossier Cover Header */}
            <div className="border border-[#262626] bg-gradient-to-b from-[#141414] to-[#0A0A0A] p-6 md:p-8 rounded-lg shadow-2xl print-card print:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#2A2A2A] pb-6 print:border-gray-300">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest font-bold bg-[#FF2A2A]/20 text-[#FF6B6B] border border-[#FF2A2A]/40 rounded">
                      Commercial BI Intelligence
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest bg-[#1F3D1F] text-[#66FF66] border border-[#2E5C2E] rounded flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      100% Deterministic Grounded
                    </span>
                  </div>
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white print:text-black">
                    Skylark Drones — Executive Leadership Brief
                  </h1>
                  <p className="text-xs text-[#999] print:text-gray-600 mt-1">
                    Audited dataset across Deals Pipeline and Work Orders Fulfillment
                  </p>
                </div>

                <div className="text-right text-xs font-mono space-y-1 text-[#AAA] print:text-gray-700">
                  <div>
                    <span className="text-[#666] print:text-gray-500">As-Of Date:</span>{" "}
                    <strong className="text-white print:text-black font-semibold">
                      {data?.asOfDate}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#666] print:text-gray-500">Scope:</span> Indian Fiscal
                    Year (April–March)
                  </div>
                  <div>
                    <span className="text-[#666] print:text-gray-500">Audit Provenance:</span>{" "}
                    {data?.dataset?.dealsCount} Deals · {data?.dataset?.workOrdersCount} Work Orders
                  </div>
                </div>
              </div>

              {/* Data Provenance Notice */}
              {data?.dataset?.provenance && (
                <div className="mt-4 p-3 bg-[#111] border border-[#262626] rounded text-xs text-[#AAA] flex items-center justify-between print-card print:p-2 print:text-black">
                  <span>{data.dataset.provenance}</span>
                  <span className="text-[11px] font-mono text-[#777] print:text-gray-500">
                    {data.dataset.correctionsApplied} data-hygiene normalizations applied
                  </span>
                </div>
              )}
            </div>

            {/* Headline KPI Cards */}
            {kpis && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4 print-break-inside-avoid">
                <div className="p-4 bg-[#0F0F0F] border border-[#242424] rounded-lg space-y-1 print-card">
                  <div className="text-[11px] font-medium text-[#888] print:text-gray-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Open Pipeline</span>
                    <TrendingUp className="w-3.5 h-3.5 text-[#3B82F6]" />
                  </div>
                  <div className="text-xl md:text-2xl font-bold text-white print:text-black font-mono">
                    {formatInr(kpis.totalOpenValue)}
                  </div>
                  <div className="text-[11px] text-[#777] print:text-gray-500">
                    {kpis.openDealsCount} active deals
                  </div>
                </div>

                <div className="p-4 bg-[#0F0F0F] border border-[#242424] rounded-lg space-y-1 print-card">
                  <div className="text-[11px] font-medium text-[#888] print:text-gray-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Weighted Pipeline</span>
                    <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
                  </div>
                  <div className="text-xl md:text-2xl font-bold text-[#FBBF24] print:text-black font-mono">
                    {formatInr(kpis.weightedPipelineValue)}
                  </div>
                  <div className="text-[11px] text-[#777] print:text-gray-500">
                    H=0.7 · M=0.4 · L=0.15
                  </div>
                </div>

                <div className="p-4 bg-[#0F0F0F] border border-[#242424] rounded-lg space-y-1 print-card">
                  <div className="text-[11px] font-medium text-[#888] print:text-gray-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Billed Revenue</span>
                    <DollarSign className="w-3.5 h-3.5 text-[#10B981]" />
                  </div>
                  <div className="text-xl md:text-2xl font-bold text-[#34D399] print:text-black font-mono">
                    {formatInr(kpis.billedAmountExclGst)}
                  </div>
                  <div className="text-[11px] text-[#777] print:text-gray-500">Excl. GST</div>
                </div>

                <div className="p-4 bg-[#0F0F0F] border border-[#242424] rounded-lg space-y-1 print-card">
                  <div className="text-[11px] font-medium text-[#888] print:text-gray-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Collection Efficiency</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  </div>
                  <div className="text-xl md:text-2xl font-bold text-[#A78BFA] print:text-black font-mono">
                    {kpis.collectionEfficiencyPct}%
                  </div>
                  <div className="text-[11px] text-[#777] print:text-gray-500">
                    Cash: {formatInr(kpis.collectedAmountInclGst)}
                  </div>
                </div>
              </div>
            )}

            {/* Section 1: Core Financial & Operational Position */}
            {kpis && (
              <div className="border border-[#262626] bg-[#0E0E0E] rounded-lg p-6 space-y-4 print-card print-break-inside-avoid">
                <div className="flex items-center justify-between border-b border-[#222] pb-3 print:border-gray-300">
                  <h2 className="text-base font-bold text-white print:text-black flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#FF2A2A]" />
                    <span>1. Commercial & Cash Position Scorecard</span>
                  </h2>
                  <span className="text-xs text-[#777] print:text-gray-500 font-mono">
                    All numbers strictly verified
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse print-table">
                    <thead>
                      <tr className="border-b border-[#2B2B2B] text-[#999] font-mono text-[11px] uppercase bg-[#141414]">
                        <th className="p-2.5">Dimension</th>
                        <th className="p-2.5">Metric</th>
                        <th className="p-2.5 text-right">Verified Figure</th>
                        <th className="p-2.5">Accounting Basis & Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F1F1F] text-[#DDD]">
                      <tr>
                        <td className="p-2.5 text-[#AAA]">Pipeline (Open)</td>
                        <td className="p-2.5 font-medium text-white print:text-black">
                          Total Open Pipeline
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-white print:text-black">
                          {formatInr(kpis.totalOpenValue)}
                        </td>
                        <td className="p-2.5 text-[#888] print:text-gray-600">
                          {kpis.openDealsCount} active deals in sales stages
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-[#AAA]">Pipeline (Weighted)</td>
                        <td className="p-2.5 font-medium text-white print:text-black">
                          Probability-Weighted Pipeline
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-[#FBBF24] print:text-black">
                          {formatInr(kpis.weightedPipelineValue)}
                        </td>
                        <td className="p-2.5 text-[#888] print:text-gray-600">
                          Risk-weighted (High=0.7, Medium=0.4, Low=0.15)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-[#AAA]">Pipeline (Stalled)</td>
                        <td className="p-2.5 font-medium text-white print:text-black">
                          Stalled Past Close Date
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-[#EF4444] print:text-black">
                          {formatInr(kpis.stalledValue)}
                        </td>
                        <td className="p-2.5 text-[#888] print:text-gray-600">
                          {kpis.stalledDealsCount} open deals with close date &lt; {data?.asOfDate}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-[#AAA]">Order Book</td>
                        <td className="p-2.5 font-medium text-white print:text-black">
                          Contracted Order Value
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-white print:text-black">
                          {formatInr(kpis.contractedOrderValueExclGst)}
                        </td>
                        <td className="p-2.5 text-[#888] print:text-gray-600">
                          Signed POs (Excl. GST)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-[#AAA]">Revenue</td>
                        <td className="p-2.5 font-medium text-white print:text-black">
                          Billed Revenue
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-[#34D399] print:text-black">
                          {formatInr(kpis.billedAmountExclGst)}
                        </td>
                        <td className="p-2.5 text-[#888] print:text-gray-600">
                          Invoiced to date (Excl. GST)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-[#AAA]">Cash &amp; AR</td>
                        <td className="p-2.5 font-medium text-white print:text-black">
                          Cash Collected
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-white print:text-black">
                          {formatInr(kpis.collectedAmountInclGst)}
                        </td>
                        <td className="p-2.5 text-[#888] print:text-gray-600">
                          Realized bank deposits (Incl. GST)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-[#AAA]">Receivables</td>
                        <td className="p-2.5 font-medium text-white print:text-black">
                          Outstanding AR
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-[#F87171] print:text-black">
                          {formatInr(kpis.outstandingArInclGst)}
                        </td>
                        <td className="p-2.5 text-[#888] print:text-gray-600">
                          Uncollected invoiced amount (Incl. GST)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-[#AAA]">Product Mix</td>
                        <td className="p-2.5 font-medium text-white print:text-black">
                          Software Attach Rate
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-[#A78BFA] print:text-black">
                          {kpis.softwareAttachRatePct}%
                        </td>
                        <td className="p-2.5 text-[#888] print:text-gray-600">
                          Orders including Spectra / DMO analytics platform
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section 2: Sector Scorecards */}
            {data?.topSectors && data.topSectors.length > 0 && (
              <div className="border border-[#262626] bg-[#0E0E0E] rounded-lg p-6 space-y-4 print-card print-break-inside-avoid">
                <div className="flex items-center justify-between border-b border-[#222] pb-3 print:border-gray-300">
                  <h2 className="text-base font-bold text-white print:text-black flex items-center gap-2">
                    <Building className="w-4 h-4 text-[#3B82F6]" />
                    <span>2. Sector Performance (Pipeline vs. Execution)</span>
                  </h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse print-table">
                    <thead>
                      <tr className="border-b border-[#2B2B2B] text-[#999] font-mono text-[11px] uppercase bg-[#141414]">
                        <th className="p-2.5">Sector</th>
                        <th className="p-2.5 text-right">Open Pipeline</th>
                        <th className="p-2.5 text-right">Contracted Order Book</th>
                        <th className="p-2.5 text-right">Billed Amount</th>
                        <th className="p-2.5 text-right">Collection Efficiency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F1F1F] text-[#DDD]">
                      {data.topSectors.map((s, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-medium text-white print:text-black">
                            {s.sector}
                          </td>
                          <td className="p-2.5 text-right font-mono font-semibold">
                            {formatInr(s.openPipelineValue)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-[#AAA]">
                            {formatInr(s.contractedOrderValueExclGst)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-[#34D399]">
                            {formatInr(s.billedAmountExclGst)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-[#A78BFA]">
                            {s.collectionEfficiencyPct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section 3: Owner Scorecards & AR Watchlist (2 Columns) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2">
              {/* Owner Scorecards */}
              {data?.topOwners && data.topOwners.length > 0 && (
                <div className="border border-[#262626] bg-[#0E0E0E] rounded-lg p-5 space-y-3 print-card print-break-inside-avoid">
                  <h3 className="text-sm font-bold text-white print:text-black flex items-center gap-2 border-b border-[#222] pb-2">
                    <Users className="w-4 h-4 text-[#10B981]" />
                    <span>3. Key Owner Scorecards</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse print-table">
                      <thead>
                        <tr className="border-b border-[#2B2B2B] text-[#888] font-mono text-[10px] uppercase bg-[#141414]">
                          <th className="p-2">Owner Code</th>
                          <th className="p-2 text-right">Pipeline</th>
                          <th className="p-2 text-right">Contracted</th>
                          <th className="p-2 text-right">Efficiency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F1F1F]">
                        {data.topOwners.map((o, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-mono font-bold text-white print:text-black">
                              {o.ownerCode}
                            </td>
                            <td className="p-2 text-right font-mono text-[#CCC]">
                              {formatInr(o.openPipelineValue)}
                            </td>
                            <td className="p-2 text-right font-mono text-[#AAA]">
                              {formatInr(o.contractedOrderValueExclGst)}
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-[#34D399]">
                              {o.collectionEfficiencyPct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* AR Priority Watchlist */}
              {data?.arWatchlist && data.arWatchlist.length > 0 && (
                <div className="border border-[#262626] bg-[#0E0E0E] rounded-lg p-5 space-y-3 print-card print-break-inside-avoid">
                  <h3 className="text-sm font-bold text-white print:text-black flex items-center gap-2 border-b border-[#222] pb-2">
                    <DollarSign className="w-4 h-4 text-[#F59E0B]" />
                    <span>4. AR Priority Recovery Watchlist</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse print-table">
                      <thead>
                        <tr className="border-b border-[#2B2B2B] text-[#888] font-mono text-[10px] uppercase bg-[#141414]">
                          <th className="p-2">Client Code</th>
                          <th className="p-2">Work Order</th>
                          <th className="p-2 text-right">Outstanding (Incl. GST)</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F1F1F]">
                        {data.arWatchlist.map((a, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-mono font-bold text-white print:text-black">
                              {a.clientCode}
                            </td>
                            <td className="p-2 font-mono text-[#AAA] text-[11px]">
                              {a.workOrderNumber}
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-[#F87171]">
                              {formatInr(a.outstandingArInclGst)}
                            </td>
                            <td className="p-2 text-[10px] text-[#888]">{a.billingStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: Key Risks & Trapped Capital Chain */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2">
              {data?.risks && data.risks.length > 0 && (
                <div className="border border-[#262626] bg-[#0E0E0E] rounded-lg p-5 space-y-3 print-card print-break-inside-avoid">
                  <h3 className="text-sm font-bold text-white print:text-black flex items-center gap-2 border-b border-[#222] pb-2">
                    <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
                    <span>5. Critical Commercial &amp; Delivery Risks</span>
                  </h3>
                  <ul className="space-y-2 text-xs text-[#CCC] print:text-gray-800">
                    {data.risks.map((risk, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#EF4444] font-bold mt-0.5">•</span>
                        <div>
                          <strong className="text-white print:text-black font-semibold">
                            {risk.title}:
                          </strong>{" "}
                          {risk.detail}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data?.recommendations && data.recommendations.length > 0 && (
                <div className="border border-[#262626] bg-[#0E0E0E] rounded-lg p-5 space-y-3 print-card print-break-inside-avoid">
                  <h3 className="text-sm font-bold text-white print:text-black flex items-center gap-2 border-b border-[#222] pb-2">
                    <Zap className="w-4 h-4 text-[#10B981]" />
                    <span>6. Recommended Leadership Action Items</span>
                  </h3>
                  <ul className="space-y-2.5 text-xs text-[#CCC] print:text-gray-800">
                    {data.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="px-1.5 py-0.5 bg-[#1F3D1F] text-[#4AF626] font-mono text-[10px] rounded font-bold">
                          0{idx + 1}
                        </span>
                        <div className="leading-relaxed">{rec}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Section 5: Data Quality & Normalization Disclosures */}
            {data?.disclosures && data.disclosures.length > 0 && (
              <div className="border border-[#262626] bg-[#0E0E0E] rounded-lg p-5 space-y-2 print-card print-break-inside-avoid">
                <h3 className="text-xs font-bold text-[#AAA] print:text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <span>7. Data Governance, Freshness &amp; Audit Disclosures</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-[#888] print:text-gray-600">
                  {data.disclosures.map((disc, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-[#555]">•</span>
                      <span>{disc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Sign-off */}
            <div className="pt-4 border-t border-[#1C1C1C] text-center text-[11px] text-[#666] print:text-gray-500 font-mono print-break-inside-avoid">
              Skylark Business Intelligence Engine · Generated deterministically with strict numeric
              grounding · Confidential
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
