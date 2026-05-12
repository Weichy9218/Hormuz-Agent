// Galaxy integration types for the Hormuz daily forecast adapter.
// These types describe checked artifacts emitted by scripts/run-galaxy-hormuz.mjs.
import type {
  EvidenceClaim,
  ForecastState,
  MarketRead,
  SourceObservation,
} from "./forecast";
import type { ForecastAgentTrace } from "./forecastAgent";

export interface GalaxyQuestionRow {
  task_id: string;
  task_question: string;
  task_description: string;
  metadata?: {
    case_id?: "hormuz";
    generated_for_date?: string;
    timezone?: string;
    horizon?: "7d";
    scenario_options?: Record<string, string>;
    source_boundary?: string[];
  };
}

export interface GalaxyRunMeta {
  runId: string;
  taskId: string;
  status: "pending_execution" | "running" | "success" | "failed" | "adapter_only";
  generatedAt: string;
  forecastedAt: string;
  questionDate: string;
  runner: "galaxy-selfevolve";
  galaxyRepo: string;
  venvPath?: string;
  pythonPath?: string;
  outputDir: string;
  runDir?: string;
  questionPath: string;
  startedAt?: string;
  completedAt?: string;
  command?: string[];
  finalPrediction?: string;
  confidence?: "low" | "med" | "medium" | "high";
  durationSeconds?: number;
  terminalReason?: string;
  metrics?: Record<string, unknown>;
  artifactPaths?: Record<string, string>;
  error?: string;
}

export type GalaxyActionKind =
  | "question"
  | "assistant_note"
  | "tool_call"
  | "tool_result"
  | "artifact_read"
  | "evidence_synthesis"
  | "final_forecast"
  | "checkpoint"
  | "supervisor";

export type GalaxyActionStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface GalaxyActionTraceItem {
  actionId: string;
  index: number;
  kind: GalaxyActionKind;
  title: string;
  summary: string;
  at: string;
  status: GalaxyActionStatus;
  toolName?: string;
  toolCallId?: string;
  parentActionIds?: string[];
  artifactPath?: string;
  sourceUrl?: string;
  query?: string;
  argsSummary?: string;
  lane?:
    | "question"
    | "agent_turn"
    | "search_batch"
    | "read_artifacts"
    | "evidence_synthesis"
    | "forecast"
    | "checkpoint";
  forecastPayload?: {
    prediction?: string;
    confidence?: "low" | "medium" | "high";
    rationale?: string;
    keyEvidenceItems?: string[];
    counterEvidenceItems?: string[];
    openConcerns?: string[];
    temporalNotes?: string[];
  };
  evidenceRole?: "question_audit" | "source_search" | "source_read" | "evidence_extract" | "forecast_record";
  rawRole?: "user" | "assistant" | "tool" | "system";
  rawPreview?: {
    kind: "question" | "user" | "assistant" | "tool_call" | "tool_result" | "record_forecast" | "checkpoint";
    title: string;
    text: string;
    isTruncated: boolean;
    fullLength: number;
    rawFilePath?: string;
    rawLine?: number;
    toolName?: string;
    boxedAnswer?: string;
    toolCalls?: {
      id?: string;
      name: string;
      arguments: string;
    }[];
  };
}

export interface GalaxyActionTrace {
  traceId: string;
  runDir: string;
  generatedAt: string;
  actions: GalaxyActionTraceItem[];
  stats?: Record<string, unknown>;
  events?: ForecastAgentTrace["events"];
  graph?: ForecastAgentTrace["graph"];
  isDelta?: boolean;
  afterIndex?: number;
  totalActions?: number;
}

export interface GalaxyHormuzRunArtifact {
  schemaVersion: "hormuz-galaxy-run/v1";
  question: GalaxyQuestionRow;
  runMeta: GalaxyRunMeta;
  actionTrace?: GalaxyActionTrace;
  previousState?: ForecastState;
  sourceObservations: SourceObservation[];
  evidenceClaims: EvidenceClaim[];
  marketRead: MarketRead;
  nextWatch: string[];
}
