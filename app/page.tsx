"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Terminal,
  Send,
  RefreshCw,
  FileText,
  AlertTriangle,
  Crosshair,
  ChevronRight,
} from "lucide-react";
import { AgentTraceStream } from "@/components/AgentTraceStream";
import { DataHealthModal } from "@/components/DataHealthModal";
import { SourceRowDrawer } from "@/components/SourceRowDrawer";
import { AgentTraceStep, ClarifierVerdict } from "@/lib/agents/types";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  traces?: AgentTraceStep[];
  caveats?: string[];
  assumptions?: string[];
  sourceRowIds?: string[];
  clarifyingVerdict?: ClarifierVerdict;
  isDegradedFallback?: boolean;
}

const STARTER_TELEMETRY_QUERIES = [
  {
    label: "PIPELINE_STALL_SCAN",
    query: "What is our open pipeline and how much is stalled past as-of date?",
  },
  {
    label: "REVENUE_RECOGNITION",
    query: "Show me pre-tax contracted vs recognized billed vs cash collected for FY25-26",
  },
  {
    label: "AR_AGING_EXPOSURE",
    query: "What is our collection efficiency and top 10 AR-risk accounts?",
  },
  {
    label: "STUCK_CAPITAL_AUDIT",
    query: "Where is the money stuck across won deals, unbilled backlog, and uncollected AR?",
  },
  {
    label: "ATTACH_RATE_MIX",
    query: "What is the software attach rate (Spectra/DMO/Dock vs pure service) in execution?",
  },
  {
    label: "CROSS_BOARD_SECTOR",
    query: "How is the energy sector performing across pipeline and execution?",
  },
  {
    label: "CONCENTRATION_RISK",
    query: "What is our top client and owner concentration risk in pipeline and order book?",
  },
];

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [resyncing, setResyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(new Date().toISOString());

  const handleSend = async (queryText?: string) => {
    const q = (queryText || input).trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text: q,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();

      if (data.lastSyncedAt) {
        setLastSyncedAt(data.lastSyncedAt);
      }

      const botMsg: ChatMessage = {
        id: `sys_${Date.now()}`,
        sender: "assistant",
        text: data.answer || data.error || "CRITICAL: No telemetry stream returned.",
        traces: data.traces,
        caveats: data.caveats,
        assumptions: data.assumptions,
        sourceRowIds: data.sourceRowIds,
        clarifyingVerdict: data.clarifyingVerdict,
        isDegradedFallback: data.isDegradedFallback,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: "assistant",
        text: `[SYSTEM FAULT] Multi-agent execution halted: ${err instanceof Error ? err.message : String(err)}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const res = await fetch("/api/resync", { method: "POST" });
      const data = await res.json();
      if (data.lastSyncedAt) {
        setLastSyncedAt(data.lastSyncedAt);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setResyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#EAEAEA] flex flex-col font-mono selection:bg-[#FF2A2A] selection:text-white border-x border-[#1C1C1C] max-w-[1440px] mx-auto">
      {/* Top Telemetry Header */}
      <header className="border-b border-[#262626] bg-[#0E0E0E] sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#181818] border border-[#333] flex items-center justify-center text-[#FF2A2A] font-bold text-xs">
            <Crosshair className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-white uppercase">
                SKYLARK // TELEMETRY BI AGENT
              </span>
              <span className="text-[9px] px-1.5 py-0.5 bg-[#1F1F1F] text-[#888] border border-[#2E2E2E] uppercase font-bold">
                REV 2.0
              </span>
              <span className="text-[9px] px-1.5 py-0.5 bg-[#193319] text-[#4AF626] border border-[#295229] uppercase font-bold">
                ONLINE
              </span>
            </div>
            <p className="text-[10px] text-[#777] uppercase tracking-wider">
              DETERMINISTIC MATH ENGINE • ZERO ARITHMETIC DRIFT • MONDAY GRAPHQL
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DataHealthModal lastSyncedAt={lastSyncedAt} />

          <button
            onClick={handleResync}
            disabled={resyncing}
            className="px-2.5 py-1.5 border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] hover:border-[#555] text-[#BBB] transition text-xs flex items-center gap-1.5 font-bold uppercase tracking-wider"
            title="Resync Monday.com GraphQL Boards"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${resyncing ? "animate-spin text-[#FF2A2A]" : ""}`}
            />
            <span className="hidden sm:inline text-[10px]">SYNC BOARDS</span>
          </button>

          <Link
            href="/brief"
            className="px-3 py-1.5 text-xs border border-[#FF2A2A] bg-[#2A0808] hover:bg-[#3D0C0C] text-[#FF6B6B] transition flex items-center gap-1.5 font-bold uppercase tracking-wider"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[10px]">EXEC BRIEF</span>
          </Link>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 p-4 md:p-6 flex flex-col justify-between max-w-6xl w-full mx-auto">
        {/* Messages Stream */}
        <div className="space-y-4 flex-1 mb-6">
          {messages.length === 0 ? (
            <div className="py-8 space-y-6">
              {/* Technical Banner */}
              <div className="border border-[#262626] bg-[#0E0E0E] p-6 space-y-3">
                <div className="flex items-center justify-between border-b border-[#1E1E1E] pb-2">
                  <div className="flex items-center gap-2 text-[#888] text-[10px] tracking-widest uppercase font-bold">
                    <Terminal className="w-3.5 h-3.5 text-[#FF2A2A]" />
                    <span>[ SYSTEM INITIALIZATION : STANDBY ]</span>
                  </div>
                  <span className="text-[9px] text-[#555] tracking-widest font-mono uppercase">
                    SYS_ID: SDPL-BI-MESH
                  </span>
                </div>
                <h2 className="text-sm md:text-base font-black tracking-tight text-white uppercase">
                  AUTONOMOUS COMMERCIAL & OPERATIONAL TELEMETRY
                </h2>
                <p className="text-xs text-[#999] leading-relaxed max-w-3xl">
                  Query pipeline health, revenue realization, past-PO execution bottlenecks, and
                  concentration exposures. Every numeric metric is strictly validated by the Critic
                  against deterministic TypeScript calculation registries.
                </p>
              </div>

              {/* Preset Telemetry Inquiries */}
              <div className="space-y-2">
                <div className="text-[10px] text-[#777] uppercase tracking-widest font-bold flex items-center gap-2">
                  <span>{"///"}</span>
                  <span>PRE-CONFIGURED TELEMETRY TARGETS</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {STARTER_TELEMETRY_QUERIES.map((sq, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(sq.query)}
                      className="p-3 text-left bg-[#0E0E0E] hover:bg-[#141414] border border-[#222] hover:border-[#444] transition flex flex-col gap-1 group"
                    >
                      <div className="flex items-center justify-between text-[9px] text-[#666] group-hover:text-[#FF2A2A] font-bold tracking-widest">
                        <span>[ {sq.label} ]</span>
                        <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="text-xs text-[#CCC] group-hover:text-white font-mono leading-snug">
                        {sq.query}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                {/* Message Header Tag */}
                <div className="text-[9px] text-[#666] tracking-widest uppercase font-bold px-1">
                  {msg.sender === "user" ? "[ OPERATOR INQUIRY ]" : "[ BI TELEMETRY DISPATCH ]"}
                </div>

                <div
                  className={`w-full max-w-4xl border p-4 font-mono text-xs md:text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-[#141414] border-[#333] text-white"
                      : "bg-[#0E0E0E] border-[#262626] text-[#D8D8D8]"
                  }`}
                >
                  {/* Multi-Agent Reasoning Trace */}
                  {msg.traces && msg.traces.length > 0 && <AgentTraceStream traces={msg.traces} />}

                  {/* Clarification Alert */}
                  {msg.clarifyingVerdict?.isAmbiguous && msg.clarifyingVerdict.options && (
                    <div className="my-3 p-3 bg-[#1F1708] border border-[#523E15] text-[#FFD666] space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-[10px] tracking-wider uppercase text-[#E5A800]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>[ AMBIGUITY DETECTED // OPERATOR SELECTION REQUIRED ]</span>
                      </div>
                      <p className="text-xs">{msg.clarifyingVerdict.question}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {msg.clarifyingVerdict.options.map((opt, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(opt.label)}
                            className="px-2.5 py-1 text-xs bg-[#2E2208] hover:bg-[#42310B] border border-[#7A5B17] text-[#FFE8A3] font-bold uppercase tracking-wider transition"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Telemetry Output Text */}
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                  {/* Grounded Source Rows Drawer */}
                  {msg.sourceRowIds && msg.sourceRowIds.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[#1F1F1F] flex items-center justify-between">
                      <SourceRowDrawer sourceRowIds={msg.sourceRowIds} />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="border border-[#262626] bg-[#0E0E0E] p-4 flex items-center gap-3 text-xs text-[#888] font-mono animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-[#FF2A2A]" />
              <div className="space-y-0.5">
                <div className="text-[10px] text-[#FF2A2A] font-bold tracking-widest uppercase">
                  [ PIPELINE EXECUTING ]
                </div>
                <div className="text-[11px] text-[#AAA]">
                  SUPERVISOR ROUTING → DATA STEWARD NORMALIZATION → ANALYST DETERMINISTIC REGISTRY →
                  CRITIC GROUNDING AUDIT
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tactical Query Input Bar */}
        <div className="sticky bottom-0 bg-[#0A0A0A]/95 pt-2 pb-4 border-t border-[#1C1C1C]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 p-1.5 border border-[#333] bg-[#0E0E0E] focus-within:border-[#FF2A2A] transition"
          >
            <div className="pl-2 text-[#666] font-bold text-xs select-none">&gt;&gt;</div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ENTER TELEMETRY QUERY (E.G. STALLED PIPELINE, AR RISK, ATTACH RATE, CONCENTRATION)..."
              className="flex-1 bg-transparent px-2 py-2 text-xs md:text-sm text-white placeholder-[#555] focus:outline-none font-mono tracking-tight"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-[#FF2A2A] hover:bg-[#E02020] disabled:opacity-30 disabled:hover:bg-[#FF2A2A] text-white font-black text-xs uppercase tracking-widest transition flex items-center gap-1.5 shrink-0"
            >
              <span>TRANSMIT</span>
              <Send className="w-3 h-3" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
