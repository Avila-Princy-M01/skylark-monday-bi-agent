"use client";

import React, { useState } from "react";
import { AgentTraceStep } from "@/lib/agents/types";
import {
  ChevronDown,
  ChevronRight,
  Database,
  HelpCircle,
  Calculator,
  ShieldCheck,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Cpu,
} from "lucide-react";

interface AgentTraceStreamProps {
  traces: AgentTraceStep[];
  streaming?: boolean;
}

export function AgentTraceStream({ traces, streaming = false }: AgentTraceStreamProps) {
  const [expanded, setExpanded] = useState<boolean>(true);

  if (!traces || traces.length === 0) return null;

  const getRoleConfig = (role: string) => {
    switch (role) {
      case "supervisor":
        return {
          icon: <Cpu className="w-3.5 h-3.5 text-sky-400" />,
          color: "text-sky-400 border-sky-500/30 bg-sky-950/40",
          badge: "SUPERVISOR",
        };
      case "data_steward":
        return {
          icon: <Database className="w-3.5 h-3.5 text-emerald-400" />,
          color: "text-emerald-400 border-emerald-500/30 bg-emerald-950/40",
          badge: "DATA STEWARD",
        };
      case "clarifier":
        return {
          icon: <HelpCircle className="w-3.5 h-3.5 text-amber-400" />,
          color: "text-amber-400 border-amber-500/30 bg-amber-950/40",
          badge: "CLARIFIER",
        };
      case "analyst":
        return {
          icon: <Calculator className="w-3.5 h-3.5 text-purple-400" />,
          color: "text-purple-400 border-purple-500/30 bg-purple-950/40",
          badge: "ANALYST",
        };
      case "critic":
        return {
          icon: <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />,
          color: "text-rose-400 border-rose-500/30 bg-rose-950/40",
          badge: "CRITIC",
        };
      case "narrator":
        return {
          icon: <FileText className="w-3.5 h-3.5 text-cyan-400" />,
          color: "text-cyan-400 border-cyan-500/30 bg-cyan-950/40",
          badge: "NARRATOR",
        };
      default:
        return {
          icon: <Clock className="w-3.5 h-3.5 text-zinc-400" />,
          color: "text-zinc-400 border-zinc-700/50 bg-zinc-900/40",
          badge: role.toUpperCase(),
        };
    }
  };

  return (
    <div className="my-3 bezel-shell">
      <div className="bezel-inner overflow-hidden">
        {/* Header Accordion */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between bg-[#111118]/80 hover:bg-[#161622] transition text-[#CCC] border-b border-white/5"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-zinc-400">
              {expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </div>
            <span className="font-sans font-bold text-white uppercase text-[11px] tracking-wider">
              MULTI-AGENT DELEGATION TRACE
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 text-[9px] font-mono font-bold">
              {traces.length} OPS
            </span>
            {streaming && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE
              </span>
            )}
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
            {expanded ? "COLLAPSE" : "EXPAND"}
          </span>
        </button>

        {/* Step Items */}
        {expanded && (
          <div className="p-3.5 space-y-2.5 max-h-96 overflow-y-auto divide-y divide-white/5 font-mono">
            {traces.map((trace) => {
              const conf = getRoleConfig(trace.role);
              return (
                <div key={trace.id} className="pt-2.5 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 font-medium text-zinc-200">
                      {conf.icon}
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-wider ${conf.color}`}
                      >
                        {conf.badge}
                      </span>
                      <span className="text-white font-sans font-semibold tracking-tight">
                        {trace.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
                      {trace.status === "completed" && (
                        <span className="text-emerald-400 flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> PASS
                        </span>
                      )}
                      {trace.status === "warn" && (
                        <span className="text-amber-400 flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" /> WARN
                        </span>
                      )}
                    </div>
                  </div>

                  {trace.content && (
                    <p className="text-zinc-400 text-[11px] pl-6 leading-relaxed">
                      {trace.content}
                    </p>
                  )}

                  {trace.toolCall && (
                    <div className="pl-6 mt-1.5">
                      <div className="p-2.5 rounded-lg bg-[#08080d] border border-white/5 text-[10px] text-zinc-300 space-y-1">
                        <div className="text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <span className="text-zinc-500">&gt;&gt;</span>
                          TOOL_INVOCATION: {trace.toolCall.toolName}
                        </div>
                        {trace.toolCall.rowsScanned !== undefined && (
                          <div className="text-zinc-400 pl-3">
                            RECORDS_SCANNED:{" "}
                            <span className="text-white font-bold">
                              {trace.toolCall.rowsScanned}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
