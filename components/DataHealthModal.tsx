"use client";

import React, { useState } from "react";
import { ShieldCheck, X, AlertTriangle, CheckCircle2 } from "lucide-react";

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
        className="island-button bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white font-mono"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[10px] text-zinc-400">DATA_HEALTH:</span>
        <span className="text-[10px] text-emerald-400 font-bold">100% AUDITED</span>
        {isStale && (
          <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 text-[8px] border border-amber-500/30">
            CACHED
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-mono">
          <div className="w-full max-w-xl bezel-shell shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bezel-inner p-6 text-zinc-300 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2.5 font-sans font-black text-xs text-white uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>SINGLE NORMALIZATION LAYER & AUDIT TELEMETRY</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3 text-xs leading-relaxed">
                <div className="p-3.5 rounded-xl bg-[#08080d] border border-white/5 space-y-1">
                  <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
                    MONDAY.COM CONNECTOR ARCHITECTURE
                  </div>
                  <div className="text-emerald-400 font-bold text-xs uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    LIVE DYNAMIC COLUMN DISCOVERY & CURSOR PAGINATION
                  </div>
                  {lastSyncedAt && (
                    <div className="text-zinc-400 text-[10px] pl-5">
                      SYNC TIMESTAMP: {new Date(lastSyncedAt).toISOString()}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="font-sans font-bold text-white uppercase text-[11px] tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    ACTIVE RESILIENCE & SANITIZATION GUARDRAILS
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#08080d] p-3.5 space-y-2.5 text-[11px] text-zinc-400">
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold font-mono">&gt;&gt;</span>
                      <div>
                        <strong className="text-zinc-200">JUNK HEADER PURGING: </strong>
                        Repeated sheet headers (e.g. &quot;Nezuko&quot;, &quot;Bugs Bunny&quot;)
                        automatically pruned.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold font-mono">&gt;&gt;</span>
                      <div>
                        <strong className="text-zinc-200">MASKED VALUES (~₹1): </strong>
                        Isolated from arithmetic sums and tagged as confidential/undisclosed.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold font-mono">&gt;&gt;</span>
                      <div>
                        <strong className="text-zinc-200">OVER-BILLED NEGATIVES: </strong>
                        Negative unbilled amounts detected and tagged for financial reconciliation.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold font-mono">&gt;&gt;</span>
                      <div>
                        <strong className="text-zinc-200">SCHEMA VALIDATION: </strong>
                        Missing required columns surfaced loudly as high-severity DataQualityIssue.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold font-mono">&gt;&gt;</span>
                      <div>
                        <strong className="text-zinc-200">CROSS-BOARD NAMESPACES: </strong>
                        Client and owner codes isolated cleanly between Deals and Work Orders.
                      </div>
                    </div>
                  </div>
                </div>

                {dataQualityIssuesCount > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-200 text-[10px] font-bold uppercase">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      {dataQualityIssuesCount} NORMALIZATION CORRECTIONS APPLIED TO ACTIVE DATASET
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end border-t border-white/5">
                <button
                  onClick={() => setIsOpen(false)}
                  className="island-button bg-white/10 hover:bg-white/15 text-white"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
