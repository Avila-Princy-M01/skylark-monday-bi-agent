import { MetricFactSheet } from "../data/types";

export type AgentRole =
  "supervisor" | "data_steward" | "clarifier" | "analyst" | "critic" | "narrator";

export interface AgentTraceStep {
  id: string;
  role: AgentRole;
  title: string;
  timestamp: string;
  content?: string;
  toolCall?: {
    toolName: string;
    args: Record<string, unknown>;
    output?: unknown;
    rowsScanned?: number;
    sourceRowIds?: string[];
  };
  status: "pending" | "running" | "completed" | "warn" | "error";
  metadata?: Record<string, unknown>;
}

export interface ClarifyingOption {
  label: string;
  value: string;
  explanation?: string;
}

export interface ClarifierVerdict {
  isAmbiguous: boolean;
  question?: string;
  options?: ClarifyingOption[];
  assumptions: string[];
}

export interface CriticReview {
  approved: boolean;
  score: number; // 0-10
  feedback?: string;
  missingAngles?: string[];
  groundingFailures?: string[];
}

export interface MultiAgentExecutionResult {
  answer: string;
  traces: AgentTraceStep[];
  factSheets: MetricFactSheet[];
  assumptions: string[];
  caveats: string[];
  sourceRowIds: string[];
  dataQualityIssuesCount: number;
  isDegradedFallback?: boolean;
  clarifyingVerdict?: ClarifierVerdict;
}
