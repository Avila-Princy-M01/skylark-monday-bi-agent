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
    <div className="min-h-screen bg-[#0A0A0A] text-[#EAEAEA] p-4 md:p-8 font-mono max-w-[1440px] mx-auto border-x border-[#1C1C1C]">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Telemetry Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#262626]">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-3 py-1.5 border border-[#333] bg-[#141414] hover:bg-[#1C1C1C] transition flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#BBB]"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#FF2A2A]" />
              <span>[ ESC : BACK TO TERMINAL ]</span>
            </Link>
            <div>
              <h1 className="text-xs md:text-sm font-black tracking-widest text-white uppercase flex items-center gap-2">
                <span>SKYLARK // EXECUTIVE BRIEFING DISPATCH</span>
              </h1>
              <p className="text-[10px] text-[#777] uppercase tracking-wider">
                COMPREHENSIVE COMMERCIAL & OPERATIONAL SYNTHESIS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchBrief}
              disabled={loading}
              className="px-3 py-1.5 text-xs border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] transition flex items-center gap-1.5 font-bold uppercase tracking-wider text-[#BBB]"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#FF2A2A]" : ""}`}
              />
              <span className="text-[10px]">REFRESH</span>
            </button>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] transition flex items-center gap-1.5 text-[#4AF626] font-bold uppercase tracking-wider"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="text-[10px]">{copied ? "COPIED" : "COPY MD"}</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] transition flex items-center gap-1.5 font-bold uppercase tracking-wider text-[#BBB]"
            >
              <Download className="w-3.5 h-3.5 text-[#FF2A2A]" />
              <span className="text-[10px]">DOWNLOAD .MD</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs border border-[#FF2A2A] bg-[#2A0808] hover:bg-[#3D0C0C] text-[#FF6B6B] transition flex items-center gap-1.5 font-bold uppercase tracking-wider"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="text-[10px]">PRINT / PDF</span>
            </button>
          </div>
        </div>

        {/* Content Container */}
        {loading ? (
          <div className="p-16 border border-[#262626] bg-[#0E0E0E] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[#FF2A2A]" />
            <span className="text-xs text-[#888] uppercase tracking-widest font-bold">
              [ SYNTHESIZING VERIFIED DETERMINISTIC LEADERSHIP DOSSIER... ]
            </span>
          </div>
        ) : (
          <div className="border border-[#262626] bg-[#0E0E0E] p-6 md:p-10 shadow-2xl overflow-x-auto print:bg-white print:text-black print:border-none">
            <div className="flex items-center justify-between border-b border-[#1C1C1C] pb-3 mb-6 text-[10px] text-[#666] tracking-widest uppercase font-bold print:hidden">
              <span>SECURITY CLASSIFICATION: CONFIDENTIAL / INTERNAL BI</span>
              <span>SDPL // AUTOMATED AUDIT TRAIL VERIFIED</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs md:text-sm leading-relaxed text-[#D0D0D0] print:text-black">
              {markdown}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
