"use client";

import React, { useState } from "react";
import { AgentTraceStep } from "@/lib/agents/types";
import {
  ChevronDown,
  ChevronRight,
  Bot,
  Database,
  HelpCircle,
  Calculator,
  ShieldCheck,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface AgentTraceStreamProps {
  traces: AgentTraceStep[];
}

export function AgentTraceStream({ traces }: AgentTraceStreamProps) {
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!traces || traces.length === 0) return null;

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "supervisor":
        return <Bot className="w-3.5 h-3.5 text-blue-400" />;
      case "data_steward":
        return <Database className="w-3.5 h-3.5 text-emerald-400" />;
      case "clarifier":
        return <HelpCircle className="w-3.5 h-3.5 text-amber-400" />;
      case "analyst":
        return <Calculator className="w-3.5 h-3.5 text-purple-400" />;
      case "critic":
        return <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />;
      case "narrator":
        return <FileText className="w-3.5 h-3.5 text-teal-400" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const getRoleBadge = (role: string) => {
    return role.toUpperCase().replace("_", " ");
  };

  return (
    <div className="my-2 border border-zinc-800 rounded bg-[#101318] text-xs font-mono overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-zinc-900/60 hover:bg-zinc-900 transition text-zinc-300 border-b border-zinc-800/80"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
          )}
          <span className="font-semibold text-zinc-200">🤖 Multi-Agent Activity Stream</span>
          <span className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded">
            {traces.length} steps
          </span>
        </div>
        <span className="text-[11px] text-zinc-500">
          {expanded ? "Collapse trace" : "View reasoning trace"}
        </span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2.5 max-h-80 overflow-y-auto divide-y divide-zinc-800/60">
          {traces.map((trace) => (
            <div key={trace.id} className="pt-2 first:pt-0 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                  {getRoleIcon(trace.role)}
                  <span className="text-zinc-400 text-[10px] px-1 py-0.2 bg-zinc-800/80 rounded">
                    {getRoleBadge(trace.role)}
                  </span>
                  <span>{trace.title}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                  {trace.status === "completed" && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  )}
                  {trace.status === "warn" && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                  <span>{trace.status}</span>
                </div>
              </div>

              {trace.content && (
                <p className="text-zinc-400 text-[11px] pl-5 leading-relaxed">{trace.content}</p>
              )}

              {trace.toolCall && (
                <div className="pl-5 mt-1">
                  <div className="p-2 rounded bg-zinc-950/70 border border-zinc-800/60 text-[10px] text-zinc-300 space-y-1">
                    <div className="text-emerald-400 font-semibold">
                      Tool: {trace.toolCall.toolName}
                    </div>
                    {trace.toolCall.rowsScanned !== undefined && (
                      <div className="text-zinc-400">
                        Rows scanned: {trace.toolCall.rowsScanned} records
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
