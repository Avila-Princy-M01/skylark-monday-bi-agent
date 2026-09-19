"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Bot, Send, RefreshCw, FileText, AlertCircle, Sparkles } from "lucide-react";
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

const STARTER_QUESTIONS = [
  "What is our open pipeline and how much is stalled?",
  "Show me contracted vs billed vs collected revenue for FY25-26",
  "What is our collection efficiency and top AR-risk accounts?",
  "Where is the money stuck across won deals and work orders?",
  "What is the software attach rate (Spectra/DMO/Dock vs pure service)?",
  "How is the energy sector performing across pipeline and execution?",
  "What is our top client concentration risk in pipeline and order book?",
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
      id: `user_${Date.now()}`,
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
        id: `bot_${Date.now()}`,
        sender: "assistant",
        text: data.answer || data.error || "No response received.",
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
        text: `⚠️ Error executing multi-agent loop: ${err instanceof Error ? err.message : String(err)}`,
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
    <div className="min-h-screen bg-[#0a0c10] text-zinc-100 flex flex-col font-mono selection:bg-emerald-500 selection:text-black">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-800 bg-[#0d1015]/90 backdrop-blur sticky top-0 z-40 px-4 md:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
            🦅
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>SKYLARK BI AGENT</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
                PROD v2.0
              </span>
            </h1>
            <p className="text-[10px] text-zinc-500">
              Deterministic Math Engine • Live Monday.com Integration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DataHealthModal lastSyncedAt={lastSyncedAt} />

          <button
            onClick={handleResync}
            disabled={resyncing}
            className="p-1.5 border border-zinc-700 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition text-xs flex items-center gap-1"
            title="Resync Monday.com boards"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${resyncing ? "animate-spin text-emerald-400" : ""}`}
            />
            <span className="hidden md:inline text-xs">Resync</span>
          </button>

          <Link
            href="/brief"
            className="px-3 py-1 text-xs border border-emerald-500/40 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition flex items-center gap-1.5 font-medium"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Exec Brief</span>
          </Link>
        </div>
      </header>

      {/* Main Chat Workspace */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 flex flex-col justify-between">
        {/* Messages List */}
        <div className="space-y-6 flex-1 mb-6">
          {messages.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-6">
              <div className="inline-flex items-center justify-center p-3 rounded-full bg-zinc-900 border border-zinc-800 text-emerald-400 mb-2">
                <Bot className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-lg mx-auto">
                <h2 className="text-lg font-bold text-white tracking-tight">Welcome, Founder</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Ask real-world commercial and operational questions. Every figure is computed
                  deterministically in pure TypeScript over normalized live records with zero LLM
                  math.
                </p>
              </div>

              {/* Starter Question Chips */}
              <div className="max-w-2xl mx-auto pt-4">
                <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold mb-3 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>Suggested Commercial Inquiries</span>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTER_QUESTIONS.map((sq, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(sq)}
                      className="px-3 py-1.5 text-xs text-left bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded transition leading-normal font-mono"
                    >
                      {sq}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.sender === "assistant" && (
                  <div className="w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs shrink-0 mt-1">
                    🦅
                  </div>
                )}

                <div
                  className={`max-w-3xl rounded-lg p-4 font-mono text-xs md:text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-emerald-600/20 border border-emerald-500/30 text-emerald-100"
                      : "bg-[#11141a] border border-zinc-800 text-zinc-200 shadow-xl"
                  }`}
                >
                  {/* Assistant Message Trace */}
                  {msg.traces && msg.traces.length > 0 && <AgentTraceStream traces={msg.traces} />}

                  {/* Clarifying Question Quick Replies */}
                  {msg.clarifyingVerdict?.isAmbiguous && msg.clarifyingVerdict.options && (
                    <div className="my-3 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200 space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Clarification Required:</span>
                      </div>
                      <p className="text-xs">{msg.clarifyingVerdict.question}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {msg.clarifyingVerdict.options.map((opt, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(opt.label)}
                            className="px-2.5 py-1 text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded text-amber-100 transition"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                  {/* Source Rows Drawer */}
                  {msg.sourceRowIds && msg.sourceRowIds.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                      <SourceRowDrawer sourceRowIds={msg.sourceRowIds} />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex gap-3 items-center text-xs text-zinc-400 font-mono p-4 bg-zinc-900/40 rounded border border-zinc-800 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              <span>
                Multi-agent loop executing: Data Steward auditing records → Analyst computing
                deterministic metrics → Critic verifying grounding...
              </span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="sticky bottom-0 bg-[#0a0c10]/90 backdrop-blur pt-2 pb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 p-1.5 rounded-lg border border-zinc-700 bg-zinc-900/90 shadow-2xl focus-within:border-emerald-500 transition"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask any founder-level business question (e.g. stalled pipeline, revenue, AR collection, attach rate)..."
              className="flex-1 bg-transparent px-3 py-2 text-xs md:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs rounded transition flex items-center gap-1.5 shrink-0"
            >
              <span>Query</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
