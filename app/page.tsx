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
  ChevronRight,
  Activity,
} from "lucide-react";
import { AgentTraceStream } from "@/components/AgentTraceStream";
import { DataHealthModal } from "@/components/DataHealthModal";
import { SourceRowDrawer } from "@/components/SourceRowDrawer";
import { VisualTelemetryCard } from "@/components/VisualTelemetryCard";
import { AgentTraceStep, ClarifierVerdict } from "@/lib/agents/types";
import { MetricFactSheet } from "@/lib/data/types";

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
  factSheets?: MetricFactSheet[];
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
    label: "PIPELINE_STALL_SCAN",
    query: "What is our open pipeline and how much is stalled past the as-of date?",
  },
  {
    label: "REVENUE_RECOGNITION",
    query: "Show me contracted vs billed vs collected revenue for FY25-26",
  },
  {
    label: "AR_AGING_EXPOSURE",
    query: "What is our collection efficiency and top AR-risk accounts?",
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

/** Parses one SSE frame ("event: x\ndata: {...}") into its parts. */
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

  /** Applies an update to the in-flight assistant message. */
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

    // Conversation context: everything before this turn, oldest first. Lets the
    // server resolve follow-ups like "and for mining?" or a clarifier-chip
    // answer against the question that prompted them.
    const history = messages
      .filter(
        (msg) =>
          !msg.streaming &&
          (msg.text || msg.clarifyingVerdict?.isAmbiguous) &&
          !msg.text?.startsWith("[SYSTEM FAULT]")
      )
      .slice(-12)
      .map((msg) => ({
        role: msg.sender,
        content:
          msg.text ||
          (msg.clarifyingVerdict?.question
            ? `[Clarification requested: ${msg.clarifyingVerdict.question}]`
            : ""),
      }));

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
              factSheets?: MetricFactSheet[];
              assumptions: string[];
              caveats: string[];
              sourceRowIds: string[];
              clarifyingVerdict?: ClarifierVerdict;
              isDegradedFallback: boolean;
              revisionPasses: number;
            };
            patchStreamingMessage((msg) => ({
              ...msg,
              text: final.clarifyingVerdict?.isAmbiguous
                ? ""
                : final.answer || "No telemetry returned.",
              traces: final.traces?.length ? final.traces : msg.traces,
              factSheets: final.factSheets,
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

      // Defensive: never leave a message stuck in the streaming state.
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
                REV 3.0
              </span>
              <span className="text-[9px] px-1.5 py-0.5 bg-[#193319] text-[#4AF626] border border-[#295229] uppercase font-bold">
                ONLINE
              </span>
            </div>
            <p className="text-[10px] text-[#777] uppercase tracking-wider">
              DETERMINISTIC MATH ENGINE • ZERO ARITHMETIC DRIFT • MONDAY GRAPHQL / MCP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DataHealthModal lastSyncedAt={lastSyncedAt} />

          <button
            onClick={handleResync}
            disabled={resyncing}
            className="px-2.5 py-1.5 border border-[#333] bg-[#141414] hover:bg-[#1E1E1E] hover:border-[#555] text-[#BBB] transition text-xs flex items-center gap-1.5 font-bold uppercase tracking-wider"
            title="Resync Monday.com boards"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${resyncing ? "animate-spin text-[#FF2A2A]" : ""}`}
            />
            <span className="hidden sm:inline text-[10px]">SYNC BOARDS</span>
          </button>

          <Link
            href="/brief"
            id="exec-brief-button"
            className="group relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-xs tracking-wider uppercase shadow-[0_0_18px_rgba(6,182,212,0.45)] hover:shadow-[0_0_25px_rgba(6,182,212,0.7)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 border border-cyan-300 ring-2 ring-cyan-500/20"
            title="Open one-click Executive Leadership Brief"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-black" />
            </span>
            <FileText className="w-3.5 h-3.5 text-black transition-transform group-hover:rotate-6 group-hover:scale-110" />
            <span className="text-xs font-black tracking-wider text-black">EXEC BRIEF</span>
            <span className="hidden sm:inline-block text-[9px] bg-black/15 text-black px-1.5 py-0.5 rounded font-mono font-black border border-black/10">
              1-CLICK
            </span>
          </Link>
        </div>
      </header>

      {/* Data source / degradation banner */}
      {showDegradedBanner && dataSource && (
        <div className="border-b border-[#523E15] bg-[#1F1708] px-4 py-2.5 text-[11px] text-[#FFD666] space-y-1">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] text-[#E5A800]">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              [ DATA SOURCE: {dataSource.source.toUpperCase()} —{" "}
              {dataSource.isStale ? "STALE" : "OK"} ]
            </span>
          </div>
          {dataSource.warnings.map((warning, index) => (
            <div key={index} className="pl-5 leading-relaxed">
              • {warning}
            </div>
          ))}
        </div>
      )}

      {/* Main Workspace Area */}
      <main className="flex-1 p-4 md:p-6 flex flex-col justify-between max-w-6xl w-full mx-auto">
        <div className="space-y-4 flex-1 mb-6">
          {messages.length === 0 ? (
            <div className="py-8 space-y-6">
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
                  MULTI-AGENT COMMERCIAL & OPERATIONAL TELEMETRY
                </h2>
                <p className="text-xs text-[#999] leading-relaxed max-w-3xl">
                  Six specialised agents collaborate per question: the Data Steward audits freshness
                  and data quality, the Clarifier resolves ambiguity, the Planner selects
                  deterministic metrics, the Analyst executes them, the Narrator writes the answer,
                  and the Critic verifies every figure — sending work back when a number is
                  ungrounded or the question was only partly answered. The LLM never performs
                  arithmetic.
                </p>
              </div>

              {/* Executive Brief Quick-Launch Banner */}
              <Link
                href="/brief"
                className="group relative block border border-cyan-500/40 hover:border-cyan-400 bg-gradient-to-r from-[#06181F] via-[#091418] to-[#0D0D0D] p-4 transition-all duration-200 shadow-[0_0_25px_rgba(6,182,212,0.12)] hover:shadow-[0_0_35px_rgba(6,182,212,0.25)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="p-2.5 bg-cyan-400 text-black rounded font-black shadow-[0_0_15px_rgba(6,182,212,0.5)] group-hover:scale-105 transition-transform">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black tracking-widest text-cyan-400 uppercase">
                          EXECUTIVE LEADERSHIP DOSSIER
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 font-bold uppercase rounded">
                          1-CLICK BOARD BRIEF
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold uppercase rounded">
                          VERIFIED
                        </span>
                      </div>
                      <p className="text-[11px] text-[#AAA] mt-1 leading-snug">
                        Instant comprehensive executive overview across Pipeline Health, Cash & AR
                        Realization, Concentration Risks, and Operations SLAs.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-black text-cyan-400 uppercase tracking-wider group-hover:text-cyan-300 whitespace-nowrap self-end sm:self-center">
                    <span>LAUNCH BRIEF</span>
                    <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>

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
                  {msg.traces && msg.traces.length > 0 && (
                    <AgentTraceStream traces={msg.traces} streaming={msg.streaming} />
                  )}

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

                  {msg.text ? (
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                  ) : msg.streaming ? (
                    <div className="flex items-center gap-2 text-[#888] text-[11px] py-2">
                      <Activity className="w-3.5 h-3.5 animate-pulse text-[#FF2A2A]" />
                      <span className="uppercase tracking-widest">Agents working…</span>
                    </div>
                  ) : null}

                  {msg.factSheets && msg.factSheets.length > 0 && (
                    <VisualTelemetryCard factSheets={msg.factSheets} />
                  )}

                  {msg.streaming && msg.traces && msg.traces.length === 0 && (
                    <div className="mt-2 text-[10px] text-[#666] uppercase tracking-widest">
                      Awaiting first agent step…
                    </div>
                  )}

                  {!msg.streaming && msg.revisionPasses !== undefined && msg.revisionPasses > 0 && (
                    <div className="mt-3 text-[10px] text-[#E5A800] uppercase tracking-widest">
                      Critic sent work back for {msg.revisionPasses} revision pass(es)
                    </div>
                  )}

                  {msg.isDegradedFallback && (
                    <div className="mt-3 p-2 bg-[#1F1708] border border-[#523E15] text-[#FFD666] text-[10px] uppercase tracking-wider">
                      Served via deterministic degraded mode — LLM inference unavailable, figures
                      still computed deterministically.
                    </div>
                  )}

                  {msg.sourceRowIds && msg.sourceRowIds.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[#1F1F1F] flex items-center justify-between">
                      <SourceRowDrawer sourceRowIds={msg.sourceRowIds} />
                    </div>
                  )}
                </div>
              </div>
            ))
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
