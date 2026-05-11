// Event stream model for evidence-driven forecast revisions.
import type { ForecastHorizon, ForecastTarget, ScenarioKey } from "./forecast";
import type { SourceStatus } from "../types";

export type EvidencePolarity = "support" | "counter" | "uncertain";

export type MechanismTag =
  | "transit_risk_up"
  | "insurance_cost_up"
  | "naval_presence_up"
  | "mine_or_swarm_risk_up"
  | "energy_supply_risk_up"
  | "diplomatic_deescalation"
  | "oil_flow_resilient"
  | "market_not_pricing_closure"
  | "market_pricing_risk_premium";

export type EvidenceAffects = "scenario" | "market" | "war_trend" | "watchlist";

export type AgentRunEvent =
  | {
      type: "run_started";
      runId: string;
      at: string;
      title: string;
      summary: string;
    }
  | {
      type: "source_read";
      runId: string;
      at: string;
      sourceIds: string[];
      status: SourceStatus;
      title: string;
      summary: string;
    }
  | {
      type: "evidence_added";
      runId: string;
      at: string;
      evidenceId: string;
      title: string;
      summary: string;
      sourceIds: string[];
      polarity: EvidencePolarity;
      mechanismTags: MechanismTag[];
      affects: EvidenceAffects[];
    }
  | {
      type: "judgement_updated";
      runId: string;
      at: string;
      title: string;
      reason: string;
      previousScenario: Record<ScenarioKey, number>;
      currentScenario: Record<ScenarioKey, number>;
      scenarioDelta: Record<ScenarioKey, number>;
      targetDeltas: Array<{
        target: ForecastTarget;
        horizon: ForecastHorizon;
        previous: string | number;
        current: string | number;
        deltaLabel: string;
      }>;
    }
  | {
      type: "checkpoint_written";
      runId: string;
      at: string;
      checkpointId: string;
      title: string;
      summary: string;
      nextWatch: string[];
      revisionReason: string;
    }
  | {
      type: "run_completed";
      runId: string;
      at: string;
      title: string;
      summary: string;
    };
