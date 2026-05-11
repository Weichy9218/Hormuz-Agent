// Core forecast contract shared by the agent API seam, store, and UI.
import type { AgentRunEvent } from "./agentEvents";

export type ScenarioKey =
  | "normal"
  | "controlled_disruption"
  | "severe_disruption"
  | "closure";

export type AssetForecastTarget =
  | "brent"
  | "wti"
  | "gold"
  | "usd_broad"
  | "usdcny"
  | "us10y"
  | "vix"
  | "sp500";

export type WarTrendForecastTarget =
  | "escalation_7d"
  | "transit_disruption_7d"
  | "spillover_30d"
  | "deescalation_14d";

export type ForecastTarget = AssetForecastTarget | WarTrendForecastTarget;

export type ForecastHorizon = "24h" | "7d" | "14d" | "30d";

export type ForecastSignal = "up" | "down" | "flat" | "uncertain";

export interface TargetForecast {
  target: ForecastTarget;
  horizon: ForecastHorizon;
  signal: ForecastSignal;
  confidence: number;
  rationale: string;
}

export interface ForecastCheckpoint {
  checkpointId: string;
  revisionReason: string;
  nextWatch: string[];
}

export interface ForecastRunResponse {
  runId: string;
  generatedAt: string;
  scenarioDistribution: Record<ScenarioKey, number>;
  targetForecasts: TargetForecast[];
  events: AgentRunEvent[];
  checkpoint: ForecastCheckpoint;
}
