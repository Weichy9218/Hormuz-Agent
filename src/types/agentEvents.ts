// Event stream model for evidence-driven forecast revisions.
import type { ScenarioId, TargetForecast } from "./forecast";
import type { SourceStatus } from "../types";

export type EvidencePolarity = "support" | "counter" | "uncertain";
export type EvidenceConfidence = "low" | "medium" | "high";

export type MechanismTag =
  | "transit_risk_up"
  | "traffic_flow_down"
  | "insurance_cost_up"
  | "naval_presence_up"
  | "mine_or_swarm_risk_up"
  | "gnss_or_ais_interference"
  | "energy_supply_risk_up"
  | "diplomatic_deescalation"
  | "market_not_pricing_closure"
  | "market_pricing_risk_premium";

export type EvidenceAffects = "scenario" | "target" | "market" | "watchlist";

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
      evidence: string;
      sourceIds: string[];
      polarity: EvidencePolarity;
      mechanismTags: MechanismTag[];
      affects: EvidenceAffects[];
      confidence: EvidenceConfidence;
    }
  | {
      type: "judgement_updated";
      runId: string;
      at: string;
      title: string;
      reason: string;
      previousScenario: Record<ScenarioId, number>;
      currentScenario: Record<ScenarioId, number>;
      scenarioDelta: Partial<Record<ScenarioId, number>>;
      targetDeltas: TargetForecast[];
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
