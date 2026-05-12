// Graph-native contract emitted by the local Hormuz forecast-agent runtime.
// The UI consumes this instead of reverse-engineering raw model logs.

import type { GalaxyActionTraceItem } from "./galaxy";

export type ForecastAgentRunStatus = "running" | "completed" | "failed";

export type ForecastAgentLane =
  | "question"
  | "source"
  | "search"
  | "read"
  | "evidence"
  | "mechanism"
  | "judgement"
  | "forecast"
  | "checkpoint";

export type ForecastAgentEventType =
  | "run_started"
  | "question_loaded"
  | "agent_turn"
  | "source_selected"
  | "tool_call"
  | "tool_result"
  | "evidence_added"
  | "mechanism_mapped"
  | "judgement_updated"
  | "final_forecast"
  | "checkpoint_written"
  | "run_completed"
  | "run_failed";

export interface ForecastAgentFinalPayload {
  prediction: string;
  scenario?: string;
  confidence?: "low" | "medium" | "med" | "high";
  rationale?: string;
  keyEvidenceItems?: string[];
  counterEvidenceItems?: string[];
  openConcerns?: string[];
  temporalNotes?: string[];
}

export interface ForecastAgentCheckpoint {
  checkpointId: string;
  revisionReason: string;
  finalPrediction?: string;
  reusedState: {
    activeEvidenceIds: string[];
    staleEvidenceIds: string[];
    pendingSourceIds: string[];
  };
  nextWatch: string[];
}

export interface ForecastAgentEvent {
  eventId: string;
  sequence: number;
  type: ForecastAgentEventType;
  lane: ForecastAgentLane;
  graphRole: string;
  title: string;
  summary: string;
  parentIds: string[];
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt: string;
  completedAt?: string;
  current?: boolean;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  sourceIds?: string[];
  sourceObservationIds?: string[];
  evidenceIds?: string[];
  mechanismTags?: string[];
  forecastPayload?: ForecastAgentFinalPayload;
  checkpoint?: ForecastAgentCheckpoint;
}

export interface ForecastAgentGraphNode {
  id: string;
  type: "forecastAgentAction";
  lane: ForecastAgentLane;
  data: {
    eventType: ForecastAgentEventType;
    graphRole: string;
    title: string;
    summary: string;
    status: string;
    toolName?: string;
    current?: boolean;
    criticalPath?: boolean;
    criticalReason?: string;
  };
}

export interface ForecastAgentGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  criticalPath?: boolean;
}

export interface ForecastAgentTrace {
  traceId: string;
  runDir: string;
  generatedAt: string;
  actions: GalaxyActionTraceItem[];
  events: ForecastAgentEvent[];
  graph: {
    nodes: ForecastAgentGraphNode[];
    edges: ForecastAgentGraphEdge[];
  };
}

export interface ForecastAgentRunMeta {
  runId: string;
  taskId: string;
  status: ForecastAgentRunStatus;
  runner: "hormuz-local-forecast-agent";
  schemaVersion: "hormuz-forecast-agent-run/v1";
  startedAt: string;
  completedAt?: string;
  lastUpdatedAt: string;
  runDir: string;
  questionPath: string;
  sourceArtifacts: string[];
  finalPrediction?: string;
  confidence?: string;
}

export interface ForecastAgentRunArtifact {
  schemaVersion: "hormuz-forecast-agent-run/v1";
  runMeta: ForecastAgentRunMeta;
  trace: ForecastAgentTrace;
  finalForecast: ForecastAgentFinalPayload | null;
  checkpoint: ForecastAgentCheckpoint | null;
}
