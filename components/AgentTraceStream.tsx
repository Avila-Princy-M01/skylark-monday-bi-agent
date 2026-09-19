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
}

export function AgentTraceStream({ traces }: AgentTraceStreamProps) {
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!traces || traces.length === 0) return null;

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "supervisor":
        return <Cpu className="w-3.5 h-3.5 text-[#5C9DFF]" />;
      case "data_steward":
        return <Database className="w-3.5 h-3.5 text-[#4AF626]" />;
      case "clarifier":
        return <HelpCircle className="w-3.5 h-3.5 text-[#FFB020]" />;
      case "analyst":
        return <Calculator className="w-3.5 h-3.5 text-[#D47FFF]" />;
      case "critic":
        return <ShieldCheck className="w-3.5 h-3.5 text-[#FF2A2A]" />;
      case "narrator":
        return <FileText className="w-3.5 h-3.5 text-[#00E5FF]" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-[#888]" />;
    }
  };

  const getRoleBadge = (role: string) => {
    return role.toUpperCase().replace("_", " ");
  };

  return (
    <div className="my-2 border border-[#262626] bg-[#0A0A0A] text-xs font-mono">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-[#121212] hover:bg-[#181818] transition text-[#CCC] border-b border-[#222]"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#888]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#888]" />
          )}
          <span className="font-bold text-white uppercase text-[10px] tracking-wider">
            [ MULTI_AGENT_EXECUTION_TRACE ]
          </span>
          <span className="px-1.5 py-0.2 bg-[#1C1C1C] text-[#888] border border-[#2E2E2E] text-[9px] font-bold">
            {traces.length} OPS
          </span>
        </div>
        <span className="text-[10px] text-[#666] uppercase tracking-widest">
          {expanded ? "[- COLLAPSE]" : "[+ EXPAND]"}
        </span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2 max-h-80 overflow-y-auto divide-y divide-[#1C1C1C]">
          {traces.map((trace) => (
            <div key={trace.id} className="pt-2 first:pt-0 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 font-bold text-[#D0D0D0]">
                  {getRoleIcon(trace.role)}
                  <span className="text-[#888] px-1 py-0.2 bg-[#161616] border border-[#262626] uppercase">
                    {getRoleBadge(trace.role)}
                  </span>
                  <span className="text-white tracking-tight">{trace.title}</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] font-bold uppercase">
                  {trace.status === "completed" && (
                    <span className="text-[#4AF626] flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> PASS
                    </span>
                  )}
                  {trace.status === "warn" && (
                    <span className="text-[#FFB020] flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" /> WARN
                    </span>
                  )}
                </div>
              </div>

              {trace.content && (
                <p className="text-[#888] text-[11px] pl-5 leading-relaxed font-mono">
                  {trace.content}
                </p>
              )}

              {trace.toolCall && (
                <div className="pl-5 mt-1">
                  <div className="p-2 bg-[#0E0E0E] border border-[#1F1F1F] text-[9px] text-[#AAA] space-y-0.5">
                    <div className="text-[#FF2A2A] font-bold uppercase tracking-wider">
                      TOOL_INVOCATION: {trace.toolCall.toolName}
                    </div>
                    {trace.toolCall.rowsScanned !== undefined && (
                      <div className="text-[#777]">
                        RECORDS_SCANNED: {trace.toolCall.rowsScanned}
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
