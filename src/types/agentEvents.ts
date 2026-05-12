// AgentRunEvent stream. The only data the Forecast UI graph/stream/inspector
// is allowed to read. New schema includes stable eventId / parentEventIds /
// evidenceIds / sourceObservationIds / provenance / license.
import type {
  AppliedGuardrail,
  DeltaAttribution,
  EvidenceAffects,
  EvidenceConfidence,
  EvidencePolarity,
  LicenseStatus,
  MechanismTag,
  ScenarioId,
  SensitivityItem,
  SourceFreshness,
  TargetForecast,
} from "./forecast";

export interface AgentRunEventBase {
  eventId: string;
  runId: string;
  at: string;
  parentEventIds?: string[];
  evidenceIds?: string[];
  sourceObservationIds?: string[];
  retrievedAt?: string;
  sourceUrl?: string;
  sourceHash?: string;
  licenseStatus?: LicenseStatus;
}

export type AgentRunEvent =
  | (AgentRunEventBase & {
      type: "run_started";
      title: string;
      summary: string;
    })
  | (AgentRunEventBase & {
      type: "source_read";
      title: string;
      summary: string;
      sourceIds: string[];
      status: SourceFreshness;
    })
  | (AgentRunEventBase & {
      type: "evidence_added";
      title: string;
      evidence: string;
      evidenceId: string;
      sourceIds: string[];
      polarity: EvidencePolarity;
      mechanismTags: MechanismTag[];
      affects: EvidenceAffects[];
      confidence: EvidenceConfidence;
    })
  | (AgentRunEventBase & {
      type: "judgement_updated";
      title: string;
      reason: string;
      previousScenario: Record<ScenarioId, number>;
      currentScenario: Record<ScenarioId, number>;
      scenarioDelta: Partial<Record<ScenarioId, number>>;
      targetDeltas: TargetForecast[];
      deltaAttribution: DeltaAttribution[];
      appliedGuardrails: AppliedGuardrail[];
      sensitivity: SensitivityItem[];
    })
  | (AgentRunEventBase & {
      type: "checkpoint_written";
      checkpointId: string;
      title: string;
      summary: string;
      revisionReason: string;
      nextWatch: string[];
      reusedState: {
        activeEvidenceIds: string[];
        staleEvidenceIds: string[];
        pendingSourceIds: string[];
      };
      deltaAttribution: DeltaAttribution[];
    })
  | (AgentRunEventBase & {
      type: "run_completed";
      title: string;
      summary: string;
    });

export type AgentRunEventType = AgentRunEvent["type"];
