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
        className="island-button bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 font-mono text-[10px]"
      >
        <Database className="w-3 h-3 text-rose-400" />
        <span>AUDIT DATA: {sourceRowIds.length} VERIFIED ROW IDS</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-mono">
          <div className="w-full max-w-lg bezel-shell shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bezel-inner p-6 text-zinc-300 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2.5 font-sans font-black text-xs text-white uppercase tracking-wider">
                  <Table className="w-4 h-4 text-rose-400" />
                  <span>UNDERLYING SOURCE ROW MANIFEST</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400">
                All numeric facts were computed strictly across the following verified Monday.com
                row IDs:
              </p>

              <div className="max-h-56 overflow-y-auto p-3 rounded-xl bg-[#08080d] border border-white/5 text-[11px] space-y-1">
                {sourceRowIds.map((id, idx) => (
                  <div
                    key={id}
                    className="flex items-center justify-between text-zinc-400 border-b border-white/5 py-1"
                  >
                    <span className="text-zinc-500 font-mono">
                      [{String(idx + 1).padStart(3, "0")}]
                    </span>
                    <span className="text-emerald-400 font-mono font-bold">{id}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-white/5">
                <button
                  onClick={handleExportCsv}
                  className="island-button bg-white/10 hover:bg-white/15 text-white"
                >
                  <Download className="w-3.5 h-3.5 text-rose-400" />
                  <span>EXPORT CSV MANIFEST</span>
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="island-button bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white"
                >
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
