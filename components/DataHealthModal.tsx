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
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-[#333] bg-[#141414] hover:bg-[#1C1C1C] hover:border-[#555] transition text-[#CCC] font-mono font-bold uppercase tracking-wider"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-[#4AF626]" />
        <span className="text-[10px] text-[#888]">DATA_HEALTH:</span>
        <span className="text-[10px] text-[#4AF626]">100% AUDITED</span>
        {isStale && (
          <span className="px-1 py-0.2 bg-[#332200] text-[#FFB020] text-[8px] border border-[#664400]">
            CACHED
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-mono">
          <div className="w-full max-w-xl border border-[#333] bg-[#0E0E0E] shadow-2xl p-6 text-[#D0D0D0] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <div className="flex items-center gap-2 font-black text-xs text-white uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-[#4AF626]" />
                <span>[ SINGLE_NORMALIZATION_LAYER & RESILIENCE_REPORT ]</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-[#666] hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="p-3 bg-[#141414] border border-[#262626] space-y-1">
                <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">
                  MONDAY.COM GRAPHQL V2 CONNECTOR
                </div>
                <div className="text-[#4AF626] font-bold text-xs uppercase">
                  LIVE DYNAMIC COLUMN DISCOVERY & CURSOR PAGINATION
                </div>
                {lastSyncedAt && (
                  <div className="text-[#777] text-[10px]">
                    TIMESTAMP: {new Date(lastSyncedAt).toISOString()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="font-bold text-white uppercase text-[10px] tracking-wider text-[#FF2A2A]">
                  ACTIVE RESILIENCE GUARDRAILS
                </div>
                <div className="border border-[#1F1F1F] bg-[#0A0A0A] p-3 space-y-2 text-[11px] text-[#999]">
                  <div className="flex items-start gap-2">
                    <span className="text-[#FF2A2A] font-bold">&gt;&gt;</span>
                    <div>
                      <strong className="text-white">JUNK HEADER ROWS: </strong>
                      Repeated header strings (e.g. &quot;Nezuko&quot;, &quot;Bugs Bunny&quot;)
                      automatically purged.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#FF2A2A] font-bold">&gt;&gt;</span>
                    <div>
                      <strong className="text-white">MASKED VALUES (~₹1): </strong>
                      Isolated from revenue sums and categorized as confidential/undisclosed.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#FF2A2A] font-bold">&gt;&gt;</span>
                    <div>
                      <strong className="text-white">OVER-BILLED NEGATIVES: </strong>
                      Negative unbilled balances segregated and tagged for accounting review.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#FF2A2A] font-bold">&gt;&gt;</span>
                    <div>
                      <strong className="text-white">100% EMPTY COLUMNS: </strong>
                      Unused columns (e.g. Close Date A) pruned from calculations.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#FF2A2A] font-bold">&gt;&gt;</span>
                    <div>
                      <strong className="text-white">CROSS-BOARD NAMESPACES: </strong>
                      Client/Company codes kept isolated between Deals and Work Orders.
                    </div>
                  </div>
                </div>
              </div>

              {dataQualityIssuesCount > 0 && (
                <div className="flex items-center gap-2 p-2 bg-[#2E2000] border border-[#664400] text-[#FFB020] text-[10px] font-bold uppercase">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {dataQualityIssuesCount} NORMALIZATION CORRECTIONS APPLIED TO ACTIVE DATASET
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end border-t border-[#1C1C1C]">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 text-xs bg-[#1C1C1C] hover:bg-[#2A2A2A] border border-[#333] text-white font-bold uppercase tracking-wider transition"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
