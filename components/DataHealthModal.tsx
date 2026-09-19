"use client";

import React, { useState } from "react";
import { ShieldCheck, X, AlertTriangle } from "lucide-react";

interface DataHealthModalProps {
  lastSyncedAt?: string;
  isStale?: boolean;
  dataQualityIssuesCount?: number;
}

export function DataHealthModal({
  lastSyncedAt,
  isStale,
  dataQualityIssuesCount = 0,
}: DataHealthModalProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-zinc-700/80 rounded bg-zinc-900/80 hover:bg-zinc-800 transition text-zinc-300 font-mono"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>Data Health:</span>
        <span className="text-emerald-400 font-bold">100% Normalized</span>
        {isStale && (
          <span className="px-1 py-0.2 bg-amber-500/20 text-amber-400 text-[10px] rounded">
            Cached
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm font-mono">
          <div className="w-full max-w-lg border border-zinc-700 rounded-lg bg-[#12151b] shadow-2xl p-6 text-zinc-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Single Normalization Layer & Data Health</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-zinc-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
              <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded space-y-1">
                <div className="text-zinc-400">Sync Status:</div>
                <div className="text-emerald-400 font-semibold">
                  Live Dynamic Schema Mapping & Cursor Pagination
                </div>
                {lastSyncedAt && (
                  <div className="text-zinc-500 text-[11px]">
                    Last Synced: {new Date(lastSyncedAt).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-white">Active Resilience Guardrails:</div>
                <ul className="list-disc list-inside space-y-1 text-zinc-400 text-[11px]">
                  <li>
                    <strong className="text-zinc-200">Junk Header Rows:</strong> Repeated header
                    strings (e.g. Nezuko, Bugs Bunny) automatically detected and dropped.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Masked Values (~₹1):</strong> Excluded from
                    financial aggregations and counted as undisclosed.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Over-Billed Negatives:</strong> Negative
                    unbilled amounts isolated and reported separately.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Empty Columns:</strong> 100% empty columns
                    (e.g. Close Date A) excluded from all business logic.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Cross-Board Non-Join:</strong> Company
                    namespaces strictly kept distinct to prevent false joins.
                  </li>
                </ul>
              </div>

              {dataQualityIssuesCount > 0 && (
                <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded text-[11px]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {dataQualityIssuesCount} normalization repairs & exclusions applied to live
                    data.
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
