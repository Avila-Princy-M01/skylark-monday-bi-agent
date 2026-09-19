"use client";

import React, { useState } from "react";
import { Table, X, Download, Database } from "lucide-react";

interface SourceRowDrawerProps {
  sourceRowIds: string[];
}

export function SourceRowDrawer({ sourceRowIds }: SourceRowDrawerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  if (!sourceRowIds || sourceRowIds.length === 0) return null;

  const handleExportCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8," + ["RECORD_ID", ...sourceRowIds].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `skylark_audit_records_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] border border-[#2B2B2B] bg-[#121212] hover:bg-[#1A1A1A] hover:border-[#444] transition text-[#AAA] font-mono font-bold uppercase tracking-wider"
      >
        <Database className="w-3 h-3 text-[#FF2A2A]" />
        <span>[ AUDIT DATA: {sourceRowIds.length} VERIFIED ROW IDS ]</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-mono">
          <div className="w-full max-w-lg border border-[#333] bg-[#0E0E0E] shadow-2xl p-5 text-[#CCC] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#222]">
              <div className="flex items-center gap-2 font-black text-xs text-white uppercase tracking-wider">
                <Table className="w-3.5 h-3.5 text-[#FF2A2A]" />
                <span>[ UNDERLYING_SOURCE_ROW_MANIFEST ]</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-[#666] hover:text-white transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-[#888]">
              All numeric facts were computed strictly across the following verified Monday.com row
              IDs:
            </p>

            <div className="max-h-52 overflow-y-auto p-2.5 bg-[#080808] border border-[#1F1F1F] text-[10px] space-y-1 font-mono">
              {sourceRowIds.map((id, idx) => (
                <div
                  key={id}
                  className="flex items-center justify-between text-[#AAA] border-b border-[#141414] py-0.5"
                >
                  <span className="text-[#555]">[{String(idx + 1).padStart(3, "0")}]</span>
                  <span className="text-[#4AF626] font-bold">{id}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-[#1C1C1C]">
              <button
                onClick={handleExportCsv}
                className="px-3 py-1.5 text-xs border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] transition flex items-center gap-1.5 text-white font-bold uppercase tracking-wider"
              >
                <Download className="w-3 h-3 text-[#FF2A2A]" />
                <span>EXPORT CSV MANIFEST</span>
              </button>
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
