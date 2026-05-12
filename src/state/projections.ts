// Page-facing projections. Pages must only consume from these functions;
// they are not allowed to read canonical store data structures directly
// or to derive business semantics on their own.
import type { AgentRunEvent } from "../types/agentEvents";
import type {
  AppliedGuardrail,
  EvidenceClaim,
  ForecastCheckpoint,
  ForecastTarget,
  MarketRead,
  ScenarioId,
  SensitivityItem,
  SourceObservation,
  TargetForecast,
} from "../types/forecast";
import type { SourceRegistryEntry } from "../types";
import {
  buildForecastGraph,
  type ForecastGraph,
} from "../lib/forecast/buildForecastGraph";
import {
  selectStoryPath,
  type StoryPath,
} from "../lib/forecast/selectStoryPath";
import {
  canonicalAgentRunEvents,
  canonicalCalibrationConfig,
  canonicalEvidenceClaims,
  canonicalForecastCheckpoints,
  canonicalMarketRead,
  canonicalPredictionRecords,
  canonicalRun,
  canonicalScenarioDefinitions,
  canonicalSourceObservations,
  scenarioOrder,
} from "./canonicalStore";

// --- Overview ---------------------------------------------------------------

export interface OverviewProjection {
  baseCaseScenarioId: ScenarioId;
  scenarioDistribution: Record<ScenarioId, number>;
  updateBrief: {
    previousBaseCaseScenarioId: ScenarioId;
    currentBaseCaseScenarioId: ScenarioId;
    previousProbability: number;
    currentProbability: number;
    largestScenarioDelta: {
      scenarioId: ScenarioId;
      delta: number;
    };
    leadEvidence: EvidenceClaim[];
  };
  scenarioDelta: Partial<Record<ScenarioId, number>>;
  whyNotClosure: {
    appliedGuardrails: AppliedGuardrail[];
    counterEvidence: EvidenceClaim[];
  };
  baselineFacts: Array<{ label: string; value: string; unit: string; sourceId: string; detail: string }>;
  nextWatch: string[];
  currentCheckpoint: ForecastCheckpoint;
  pendingSourceIds: string[];
  marketRead: MarketRead;
}

function dominantScenario(distribution: Record<ScenarioId, number>): ScenarioId {
  let best: ScenarioId = "controlled";
  for (const id of scenarioOrder) {
    if (distribution[id] > distribution[best]) best = id;
  }
  return best;
}

export function projectOverviewState(
  baselineFacts: OverviewProjection["baselineFacts"],
): OverviewProjection {
  const judgement = canonicalAgentRunEvents.find(
    (e): e is Extract<AgentRunEvent, { type: "judgement_updated" }> =>
      e.type === "judgement_updated",
  );
  const appliedGuardrails = judgement?.appliedGuardrails ?? [];
  const counterEvidence = canonicalEvidenceClaims.filter(
    (c) => c.polarity === "counter",
  );
  const pendingSourceIds = canonicalRun.checkpoint.reusedState.pendingSourceIds;
  const previousBaseCaseScenarioId = dominantScenario(
    canonicalRun.previousState.scenarioDistribution,
  );
  const currentBaseCaseScenarioId = dominantScenario(
    canonicalRun.currentState.scenarioDistribution,
  );
  const largestScenarioDelta = scenarioOrder
    .map((scenarioId) => ({
      scenarioId,
      delta: canonicalRun.scenarioDelta[scenarioId] ?? 0,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const primaryAttribution = judgement?.deltaAttribution.find((item) =>
    item.target === "scenario" &&
    item.magnitudeLabel?.includes(`scenario:${largestScenarioDelta.scenarioId}`),
  );
  const leadEvidenceIds = new Set(primaryAttribution?.contributingEvidenceIds ?? []);
  const leadEvidence = canonicalEvidenceClaims.filter((claim) =>
    leadEvidenceIds.has(claim.evidenceId),
  );

  return {
    baseCaseScenarioId: dominantScenario(canonicalRun.currentState.scenarioDistribution),
    scenarioDistribution: canonicalRun.currentState.scenarioDistribution,
    scenarioDelta: canonicalRun.scenarioDelta,
    updateBrief: {
      previousBaseCaseScenarioId,
      currentBaseCaseScenarioId,
      previousProbability:
        canonicalRun.previousState.scenarioDistribution[previousBaseCaseScenarioId],
      currentProbability:
        canonicalRun.currentState.scenarioDistribution[currentBaseCaseScenarioId],
      largestScenarioDelta,
      leadEvidence,
    },
    whyNotClosure: { appliedGuardrails, counterEvidence },
    baselineFacts,
    nextWatch: canonicalRun.checkpoint.nextWatch,
    currentCheckpoint: canonicalRun.checkpoint,
    pendingSourceIds,
    marketRead: canonicalMarketRead,
  };
}

// --- Market -----------------------------------------------------------------

export interface MarketProjection {
  marketRead: MarketRead;
  evidence: EvidenceClaim[];
  observations: SourceObservation[];
  pendingSourceIds: string[];
}

export function projectMarketState(
  sourceRegistry: SourceRegistryEntry[],
): MarketProjection {
  const referencedEvidence = canonicalEvidenceClaims.filter((c) =>
    canonicalMarketRead.evidenceIds.includes(c.evidenceId),
  );
  const referencedObsIds = new Set(
    referencedEvidence.flatMap((c) => c.sourceObservationIds),
  );
  const observations = canonicalSourceObservations.filter((o) =>
    referencedObsIds.has(o.observationId),
  );
  const pendingSourceIds = sourceRegistry
    .filter((s) => s.pending)
    .map((s) => s.id);

  return {
    marketRead: canonicalMarketRead,
    evidence: referencedEvidence,
    observations,
    pendingSourceIds,
  };
}

// --- Forecast ---------------------------------------------------------------

export interface ForecastProjection {
  runId: string;
  forecastedAt: string;
  previousScenario: Record<ScenarioId, number>;
  currentScenario: Record<ScenarioId, number>;
  scenarioDelta: Partial<Record<ScenarioId, number>>;
  previousTargetForecasts: TargetForecast[];
  currentTargetForecasts: TargetForecast[];
  events: AgentRunEvent[];
  evidenceClaims: EvidenceClaim[];
  observations: SourceObservation[];
  checkpoint: ForecastCheckpoint;
  storyPath: StoryPath;
  storyGraph: ForecastGraph;
  auditGraph: ForecastGraph;
  appliedGuardrails: AppliedGuardrail[];
  sensitivity: SensitivityItem[];
  primaryTarget: "scenario" | ForecastTarget;
}

export function projectForecastState(): ForecastProjection {
  const judgement = canonicalAgentRunEvents.find(
    (e): e is Extract<AgentRunEvent, { type: "judgement_updated" }> =>
      e.type === "judgement_updated",
  );
  const storyPath = selectStoryPath({
    events: canonicalAgentRunEvents,
    evidenceClaims: canonicalEvidenceClaims,
    deltaAttribution: judgement?.deltaAttribution ?? [],
  });

  const storyGraph = buildForecastGraph({
    events: canonicalAgentRunEvents,
    evidenceClaims: canonicalEvidenceClaims,
    sourceObservations: canonicalSourceObservations,
    storyPath,
    mode: "story",
  });
  const auditGraph = buildForecastGraph({
    events: canonicalAgentRunEvents,
    evidenceClaims: canonicalEvidenceClaims,
    sourceObservations: canonicalSourceObservations,
    storyPath,
    mode: "audit",
  });

  return {
    runId: canonicalRun.runId,
    forecastedAt: canonicalRun.forecastedAt,
    previousScenario: canonicalRun.previousState.scenarioDistribution,
    currentScenario: canonicalRun.currentState.scenarioDistribution,
    scenarioDelta: canonicalRun.scenarioDelta,
    previousTargetForecasts: canonicalRun.previousState.targetForecasts,
    currentTargetForecasts: canonicalRun.currentState.targetForecasts,
    events: canonicalAgentRunEvents,
    evidenceClaims: canonicalEvidenceClaims,
    observations: canonicalSourceObservations,
    checkpoint: canonicalRun.checkpoint,
    storyPath,
    storyGraph,
    auditGraph,
    appliedGuardrails: judgement?.appliedGuardrails ?? [],
    sensitivity: judgement?.sensitivity ?? [],
    primaryTarget: storyPath.primaryTarget,
  };
}

// --- Shared exports ---------------------------------------------------------

export {
  canonicalScenarioDefinitions,
  canonicalCalibrationConfig,
  canonicalForecastCheckpoints,
  canonicalPredictionRecords,
};
