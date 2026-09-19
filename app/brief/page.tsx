"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Download, Printer, RefreshCw } from "lucide-react";

export default function ExecBriefPage() {
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchBrief = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brief");
      const data = await res.json();
      if (data.markdown) {
        setMarkdown(data.markdown);
      }
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
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([markdown], { type: "text/markdown" });
    element.href = URL.createObjectURL(file);
    element.download = `Skylark_Executive_Brief_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-zinc-100 p-4 md:p-8 font-mono">
      <div className="max-w-4xl mx-auto">
        {/* Header Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-8 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 border border-zinc-700 rounded bg-zinc-900 hover:bg-zinc-800 transition flex items-center gap-2 text-sm text-zinc-300"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Chat</span>
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="text-emerald-400">⚡</span> Exec Briefing
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchBrief}
              disabled={loading}
              className="px-3 py-1.5 text-xs border border-zinc-700 rounded bg-zinc-900 hover:bg-zinc-800 transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs border border-zinc-700 rounded bg-zinc-900 hover:bg-zinc-800 transition flex items-center gap-1.5 text-emerald-400"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy MD"}</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs border border-zinc-700 rounded bg-zinc-900 hover:bg-zinc-800 transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .md</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs border border-zinc-700 rounded bg-zinc-900 hover:bg-zinc-800 transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Content Container */}
        {loading ? (
          <div className="p-12 border border-zinc-800 rounded-lg bg-zinc-900/50 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-sm text-zinc-400">
              Generating verified deterministic leadership brief...
            </span>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-lg bg-[#12151a] p-6 md:p-10 shadow-2xl overflow-x-auto print:bg-white print:text-black print:border-none">
            <pre className="whitespace-pre-wrap font-mono text-xs md:text-sm leading-relaxed text-zinc-200 print:text-black">
              {markdown}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
