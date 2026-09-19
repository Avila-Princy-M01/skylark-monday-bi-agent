"use client";

import React, { useState } from "react";
import { Table, X, Download } from "lucide-react";

interface SourceRowDrawerProps {
  sourceRowIds: string[];
}

export function SourceRowDrawer({ sourceRowIds }: SourceRowDrawerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  if (!sourceRowIds || sourceRowIds.length === 0) return null;

  const handleExportCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8," + ["Record ID", ...sourceRowIds].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `skylark_source_records_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] border border-zinc-700/80 rounded bg-zinc-900/60 hover:bg-zinc-800 transition text-zinc-400 font-mono"
      >
        <Table className="w-3 h-3 text-zinc-400" />
        <span>Show the data ({sourceRowIds.length} source records)</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm font-mono">
          <div className="w-full max-w-md border border-zinc-700 rounded-lg bg-[#12151b] shadow-2xl p-5 text-zinc-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2 font-bold text-xs text-white">
                <Table className="w-3.5 h-3.5 text-emerald-400" />
                <span>Underlying Source Row Audit</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-zinc-400 hover:text-white transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-zinc-400">
              Deterministic figures were computed strictly across the following verified Monday.com
              row IDs:
            </p>

            <div className="max-h-48 overflow-y-auto p-2.5 rounded bg-zinc-950/80 border border-zinc-800 text-[11px] space-y-1 font-mono">
              {sourceRowIds.map((id, idx) => (
                <div key={id} className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-500">#{idx + 1}</span>
                  <span className="text-emerald-400 font-medium">{id}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={handleExportCsv}
                className="px-3 py-1.5 text-xs border border-zinc-700 rounded bg-zinc-900 hover:bg-zinc-800 transition flex items-center gap-1.5 text-zinc-300"
              >
                <Download className="w-3 h-3" />
                <span>Export CSV</span>
              </button>
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
