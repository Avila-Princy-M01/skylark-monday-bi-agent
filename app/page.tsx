"use client";

import React, { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  Terminal,
  Send,
  RefreshCw,
  FileText,
  AlertTriangle,
  Crosshair,
  ArrowUpRight,
  Activity,
  Zap,
  ShieldCheck,
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
  revisionPasses?: number;
  streaming?: boolean;
}

interface DataSourceInfo {
  source: string;
  isStale: boolean;
  lastSyncedAt: string;
  warnings: string[];
  mondayError: string | null;
  dealsCount: number;
  workOrdersCount: number;
}

const STARTER_TELEMETRY_QUERIES = [
  {
    tag: "PIPELINE STALL",
    category: "COMMERCIAL",
    query: "What is our open pipeline and how much is stalled past the as-of date?",
    highlight: "₹ Cr stalled past 28-Feb-2026",
  },
  {
    tag: "REVENUE RECOGNITION",
    category: "FINANCE",
    query: "Show me contracted vs billed vs collected revenue for FY25-26",
    highlight: "Billed vs collected gap analysis",
  },
  {
    tag: "AR AGING EXPOSURE",
    category: "COLLECTIONS",
    query: "What is our collection efficiency and top AR-risk accounts?",
    highlight: "Exposure by client & overdue age",
  },
  {
    tag: "STUCK CAPITAL AUDIT",
    category: "TREASURY",
    query: "Where is the money stuck across won deals, unbilled backlog, and uncollected AR?",
    highlight: "Cross-board locked capital map",
  },
  {
    tag: "SOFTWARE ATTACH",
    category: "PRODUCT MIX",
    query: "What is the software attach rate (Spectra/DMO/Dock vs pure service) in execution?",
    highlight: "SaaS vs services margin telemetry",
  },
  {
    tag: "SECTOR DEEP DIVE",
    category: "CROSS-BOARD",
    query: "How is the energy sector performing across pipeline and execution?",
    highlight: "Renewables & Powerline end-to-end",
  },
  {
    tag: "CONCENTRATION RISK",
    category: "RISK AUDIT",
    query: "What is our top client and owner concentration risk in pipeline and order book?",
    highlight: "Top 3 accounts dependency ratio",
  },
];

function parseFrame(frame: string): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return null;

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [resyncing, setResyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>("");
  const [dataSource, setDataSource] = useState<DataSourceInfo | null>(null);
  const streamBuffer = useRef<string>("");

  const patchStreamingMessage = useCallback((patch: (msg: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].sender === "assistant" && next[i].streaming) {
          next[i] = patch(next[i]);
          break;
        }
      }
      return next;
    });
  }, []);

  const handleSend = async (queryText?: string) => {
    const q = (queryText || input).trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = { id: `usr_${Date.now()}`, sender: "user", text: q };
    const assistantId = `sys_${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        sender: "assistant",
        text: "",
        traces: [],
        streaming: true,
      },
    ]);
    if (!queryText) setInput("");
    setLoading(true);
    streamBuffer.current = "";

    const history = messages
      .filter((msg) => !msg.streaming && msg.text && !msg.text.startsWith("[SYSTEM FAULT]"))
      .slice(-12)
      .map((msg) => ({ role: msg.sender, content: msg.text }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer.current += decoder.decode(value, { stream: true });
        const frames = streamBuffer.current.split("\n\n");
        streamBuffer.current = frames.pop() ?? "";

        for (const raw of frames) {
          const parsed = parseFrame(raw);
          if (!parsed) continue;

          if (parsed.event === "data-source") {
            const info = parsed.data as DataSourceInfo;
            setDataSource(info);
            if (info.lastSyncedAt) setLastSyncedAt(info.lastSyncedAt);
          } else if (parsed.event === "trace") {
            const step = parsed.data as AgentTraceStep;
            patchStreamingMessage((msg) => ({
              ...msg,
              traces: [...(msg.traces ?? []), step],
            }));
          } else if (parsed.event === "final") {
            const final = parsed.data as {
              answer: string;
              traces: AgentTraceStep[];
              assumptions: string[];
              caveats: string[];
              sourceRowIds: string[];
              clarifyingVerdict?: ClarifierVerdict;
              isDegradedFallback: boolean;
              revisionPasses: number;
            };
            patchStreamingMessage((msg) => ({
              ...msg,
              text: final.answer || "No telemetry returned.",
              traces: final.traces?.length ? final.traces : msg.traces,
              assumptions: final.assumptions,
              caveats: final.caveats,
              sourceRowIds: final.sourceRowIds,
              clarifyingVerdict: final.clarifyingVerdict,
              isDegradedFallback: final.isDegradedFallback,
              revisionPasses: final.revisionPasses,
              streaming: false,
            }));
          } else if (parsed.event === "error") {
            const err = parsed.data as { message: string };
            patchStreamingMessage((msg) => ({
              ...msg,
              text: `[SYSTEM FAULT] Multi-agent execution halted: ${err.message}`,
              streaming: false,
            }));
          }
        }
      }

      patchStreamingMessage((msg) =>
        msg.streaming
          ? { ...msg, streaming: false, text: msg.text || "Stream ended without a final answer." }
          : msg
      );
    } catch (err) {
      patchStreamingMessage((msg) => ({
        ...msg,
        text: `[SYSTEM FAULT] ${err instanceof Error ? err.message : String(err)}`,
        streaming: false,
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const res = await fetch("/api/resync", { method: "POST" });
      const data = await res.json();
      if (data.lastSyncedAt) setLastSyncedAt(data.lastSyncedAt);
      setDataSource((prev) =>
        prev
          ? {
              ...prev,
              source: data.source ?? "live",
              isStale: false,
              warnings: data.warnings ?? [],
              dealsCount: data.dealsCount ?? prev.dealsCount,
              workOrdersCount: data.workOrdersCount ?? prev.workOrdersCount,
            }
          : prev
      );
    } catch (e) {
      console.error(e);
    } finally {
      setResyncing(false);
    }
  };

  const showDegradedBanner = dataSource && (dataSource.isStale || dataSource.warnings.length > 0);

  return (
    <div className="min-h-screen bg-[#07070a] text-[#f0f0f3] flex flex-col font-mono selection:bg-rose-500 selection:text-white">
      {/* Top Floating Glass Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-rose-500 shadow-inner">
            <Crosshair className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs md:text-sm font-sans font-black tracking-wider text-white uppercase">
                SKYLARK // TELEMETRY COMMAND
              </span>
              <span className="hidden sm:inline-block text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 uppercase font-bold">
                6-AGENT CORE
              </span>
              <span className="inline-flex items-center gap-1.5 text-[9px] px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 uppercase font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono tracking-tight mt-0.5 hidden sm:block">
              DETERMINISTIC MATH CORE • ZERO AI ARITHMETIC DRIFT • MONDAY.COM BI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <DataHealthModal lastSyncedAt={lastSyncedAt} />

          <button
            onClick={handleResync}
            disabled={resyncing}
            className="island-button bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white"
            title="Resync Monday.com boards"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resyncing ? "animate-spin text-rose-400" : ""}`} />
            <span className="hidden md:inline text-[10px]">SYNC BOARDS</span>
          </button>

          <Link
            href="/brief"
            className="island-button bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[10px]">EXEC BRIEF</span>
            <div className="island-icon-wrap bg-rose-500/20">
              <ArrowUpRight className="w-3 h-3 text-rose-300" />
            </div>
          </Link>
        </div>
      </header>

      {/* Degradation / Stale Data Banner */}
      {showDegradedBanner && dataSource && (
        <div className="border-b border-amber-500/20 bg-amber-950/30 px-4 md:px-8 py-3 text-xs text-amber-200">
          <div className="max-w-6xl mx-auto space-y-1">
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px] text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span>
                DATA SOURCE NOTICE: {dataSource.source.toUpperCase()} —{" "}
                {dataSource.isStale ? "STALE SNAPSHOT" : "LIVE"}
              </span>
            </div>
            {dataSource.warnings.map((warning, index) => (
              <div key={index} className="pl-6 text-[11px] text-amber-300/80 leading-relaxed">
                • {warning}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <main className="flex-1 px-4 md:px-8 py-6 flex flex-col justify-between max-w-6xl w-full mx-auto">
        <div className="space-y-6 flex-1 mb-8">
          {messages.length === 0 ? (
            <div className="py-4 space-y-8">
              {/* Standby Initialization Hero */}
              <div className="bezel-shell">
                <div className="bezel-inner p-6 md:p-8 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2 text-zinc-400 text-[10px] tracking-widest uppercase font-bold">
                      <Terminal className="w-4 h-4 text-rose-500" />
                      <span>[ SYSTEM ARCHITECTURE : 6-AGENT DELEGATION LADDER ]</span>
                    </div>
                    <span className="text-[9px] text-zinc-500 tracking-widest font-mono uppercase">
                      SYS_ID: SDPL-BI-TELEMETRY
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-xl md:text-3xl font-sans font-black tracking-tight text-white uppercase">
                      MULTI-AGENT COMMERCIAL & OPERATIONAL TELEMETRY
                    </h1>
                    <p className="text-xs md:text-sm text-zinc-400 leading-relaxed max-w-3xl">
                      Six specialised agents collaborate per inquiry: Data Steward audits freshness
                      and schema integrity, Clarifier resolves intent, Planner selects deterministic
                      metric engines, Analyst executes arithmetic, Narrator composes the brief, and
                      Critic verifies every figure. The LLM never computes arithmetic — zero
                      hallucination drift guaranteed.
                    </p>
                  </div>

                  {/* Agent Flow Pills */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {[
                      {
                        role: "DATA STEWARD",
                        desc: "Freshness & DQ Audit",
                        color: "text-emerald-400 border-emerald-500/20 bg-emerald-950/30",
                      },
                      {
                        role: "CLARIFIER",
                        desc: "Intent & Ambiguity",
                        color: "text-amber-400 border-amber-500/20 bg-amber-950/30",
                      },
                      {
                        role: "PLANNER",
                        desc: "Tool Routing",
                        color: "text-indigo-400 border-indigo-500/20 bg-indigo-950/30",
                      },
                      {
                        role: "ANALYST",
                        desc: "Deterministic Execution",
                        color: "text-purple-400 border-purple-500/20 bg-purple-950/30",
                      },
                      {
                        role: "NARRATOR",
                        desc: "Fact-Grounded Synthesis",
                        color: "text-cyan-400 border-cyan-500/20 bg-cyan-950/30",
                      },
                      {
                        role: "CRITIC",
                        desc: "Numeric Invariance Gate",
                        color: "text-rose-400 border-rose-500/20 bg-rose-950/30",
                      },
                    ].map((step, idx) => (
                      <div
                        key={idx}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono flex items-center gap-2 ${step.color}`}
                      >
                        <span className="font-bold">{step.role}</span>
                        <span className="text-zinc-400">({step.desc})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Starter Telemetry Bento Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 uppercase tracking-widest font-bold px-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-rose-500" />
                    <span>PRE-CONFIGURED TELEMETRY TARGETS</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">CLICK TO TRANSMIT QUERY</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {STARTER_TELEMETRY_QUERIES.map((sq, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(sq.query)}
                      className="group text-left bezel-shell hover:border-rose-500/40 transition-all duration-300 active:scale-[0.98]"
                    >
                      <div className="bezel-inner p-4 h-full flex flex-col justify-between space-y-3 group-hover:bg-[#12121c] transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] px-2 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/10 font-bold tracking-wider uppercase">
                            {sq.category}
                          </span>
                          <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-rose-400 group-hover:bg-rose-500/10 transition-colors">
                            <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs md:text-sm font-sans font-bold text-zinc-200 group-hover:text-white leading-snug">
                            {sq.query}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400">{sq.highlight}</div>
                        </div>
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
                className={`flex flex-col gap-1.5 ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div className="text-[9px] text-zinc-500 tracking-widest uppercase font-bold px-2">
                  {msg.sender === "user" ? "[ OPERATOR QUERY ]" : "[ BI TELEMETRY DISPATCH ]"}
                </div>

                {msg.sender === "user" ? (
                  <div className="max-w-2xl px-5 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs md:text-sm leading-relaxed shadow-lg">
                    {msg.text}
                  </div>
                ) : (
                  <div className="w-full max-w-4xl bezel-shell">
                    <div className="bezel-inner p-5 md:p-6 space-y-4">
                      {msg.traces && msg.traces.length > 0 && (
                        <AgentTraceStream traces={msg.traces} streaming={msg.streaming} />
                      )}

                      {/* Clarifier Ambiguity Modal / Chips */}
                      {msg.clarifyingVerdict?.isAmbiguous && msg.clarifyingVerdict.options && (
                        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 space-y-3">
                          <div className="flex items-center gap-2 font-bold text-xs tracking-wider uppercase text-amber-400">
                            <AlertTriangle className="w-4 h-4" />
                            <span>[ AMBIGUITY DETECTED // OPERATOR SELECTION REQUIRED ]</span>
                          </div>
                          <p className="text-xs text-amber-100/90 leading-relaxed">
                            {msg.clarifyingVerdict.question}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {msg.clarifyingVerdict.options.map((opt, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSend(opt.label)}
                                className="island-button bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-mono text-xs"
                              >
                                <span>{opt.label}</span>
                                <ChevronRight className="w-3 h-3 text-amber-400" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Final Answer Text */}
                      {msg.text ? (
                        <div className="font-sans text-xs md:text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap selection:bg-rose-500">
                          {msg.text}
                        </div>
                      ) : msg.streaming ? (
                        <div className="flex items-center gap-2.5 text-zinc-400 text-xs py-2">
                          <Activity className="w-4 h-4 animate-spin text-rose-500" />
                          <span className="uppercase tracking-widest font-mono text-[11px]">
                            Multi-agent pipeline synthesizing metrics…
                          </span>
                        </div>
                      ) : null}

                      {/* Revision Passes Notice */}
                      {!msg.streaming &&
                        msg.revisionPasses !== undefined &&
                        msg.revisionPasses > 0 && (
                          <div className="flex items-center gap-2 text-[10px] text-amber-400 uppercase tracking-widest font-mono">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              Critic validated output after {msg.revisionPasses} revision cycle(s)
                            </span>
                          </div>
                        )}

                      {/* Degraded Mode Notice */}
                      {msg.isDegradedFallback && (
                        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/20 text-amber-300 text-[10px] uppercase tracking-wider font-mono">
                          Served via deterministic degraded router — LLM synthesis bypassed, all
                          figures computed deterministically.
                        </div>
                      )}

                      {/* Source Row Drawer */}
                      {msg.sourceRowIds && msg.sourceRowIds.length > 0 && (
                        <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                          <SourceRowDrawer sourceRowIds={msg.sourceRowIds} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Tactical Query Input Bar */}
        <div className="sticky bottom-4 z-30 pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="bezel-shell focus-within:border-rose-500/50 transition-all duration-300 shadow-2xl"
          >
            <div className="bezel-inner p-1.5 flex items-center gap-2">
              <div className="pl-3 text-rose-500 font-mono font-bold text-xs select-none">
                &gt;&gt;
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="TRANSMIT TELEMETRY INQUIRY (E.G. STALLED PIPELINE, AR RISK, SOFTWARE ATTACH, REVENUE)..."
                className="flex-1 bg-transparent px-2 py-2 text-xs md:text-sm text-white placeholder-zinc-400 focus:outline-none font-mono tracking-tight"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="island-button bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:hover:bg-rose-600 text-white shadow-lg shadow-rose-950/50"
              >
                <span>TRANSMIT</span>
                <div className="island-icon-wrap bg-white/20">
                  <Send className="w-3 h-3 text-white" />
                </div>
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
