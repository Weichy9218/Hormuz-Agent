// Galaxy integration types for the Hormuz daily forecast adapter.
// These types describe checked artifacts emitted by scripts/run-galaxy-hormuz.mjs.
import type {
  EvidenceClaim,
  ForecastState,
  MarketRead,
  SourceObservation,
} from "./forecast";

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
  questionPath: string;
  command?: string[];
  finalPrediction?: string;
  confidence?: "low" | "med" | "medium" | "high";
  durationSeconds?: number;
  terminalReason?: string;
  metrics?: Record<string, unknown>;
  artifactPaths?: Record<string, string>;
  error?: string;
}

export interface GalaxyHormuzRunArtifact {
  schemaVersion: "hormuz-galaxy-run/v1";
  question: GalaxyQuestionRow;
  runMeta: GalaxyRunMeta;
  previousState?: ForecastState;
  sourceObservations: SourceObservation[];
  evidenceClaims: EvidenceClaim[];
  marketRead: MarketRead;
  nextWatch: string[];
}
