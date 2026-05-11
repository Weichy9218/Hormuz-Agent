// Core forecast contract shared by the agent API seam, store, and UI.
import type { AgentRunEvent } from "./agentEvents";

export type ScenarioId =
  | "normal"
  | "controlled"
  | "severe"
  | "closure";

export type ScenarioKey = ScenarioId;

export type AssetForecastTarget =
  | "brent"
  | "wti"
  | "gold"
  | "broad_usd"
  | "usd_cny"
  | "usd_cnh"
  | "us10y"
  | "vix"
  | "sp500";

export type RiskForecastTarget =
  | "regional_escalation_7d"
  | "transit_disruption_7d"
  | "state_on_state_strike_14d"
  | "deescalation_signal_14d";

export type ForecastTarget = AssetForecastTarget | RiskForecastTarget;

export type ForecastHorizon = "24h" | "7d" | "14d" | "30d";

export type ForecastDirection = "up" | "down" | "flat" | "uncertain";

export interface TargetForecast {
  target: ForecastTarget;
  horizon: ForecastHorizon;
  direction: ForecastDirection;
  confidence: number;
  deltaLabel: string;
  rationale: string;
  sourceIds: string[];
}

export interface ForecastCheckpoint {
  checkpointId: string;
  revisionReason: string;
  nextWatch: string[];
}

export interface ForecastRunResponse {
  runId: string;
  generatedAt: string;
  scenarioDistribution: Record<ScenarioId, number>;
  targetForecasts: TargetForecast[];
  events: AgentRunEvent[];
  checkpoint: ForecastCheckpoint;
}
