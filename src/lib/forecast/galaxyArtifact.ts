// Converts a Galaxy/Hormuz run artifact into the canonical forecast contract.
// The adapter keeps galaxy execution metadata separate from forecast state.
import { applyForecastUpdate } from "./applyForecastUpdate";
import { buildPredictionRecords } from "./buildPredictionRecords";
import type { AgentRunEvent } from "../../types/agentEvents";
import type {
  EvidenceClaim,
  CalibrationConfig,
  ForecastCheckpoint,
  ForecastState,
  PredictionRecord,
  ScenarioDefinition,
  ScenarioId,
} from "../../types/forecast";
import type {
  GalaxyHormuzRunArtifact,
  GalaxyRunMeta,
} from "../../types/galaxy";

interface BuildRunFromArtifactInput {
  artifact: GalaxyHormuzRunArtifact;
  fallbackPreviousState: ForecastState;
  scenarioDefinitions: ScenarioDefinition[];
  calibrationConfig: CalibrationConfig;
  previousCheckpoint?: ForecastCheckpoint;
}

export interface GalaxyAdaptedRun {
  runId: string;
  forecastedAt: string;
  previousState: ForecastState;
  currentState: ForecastState;
  scenarioDelta: Partial<Record<ScenarioId, number>>;
  events: AgentRunEvent[];
  checkpoint: ForecastCheckpoint;
  predictionRecords: PredictionRecord[];
  sourceObservations: GalaxyHormuzRunArtifact["sourceObservations"];
  evidenceClaims: EvidenceClaim[];
  marketRead: GalaxyHormuzRunArtifact["marketRead"];
  runMeta: GalaxyRunMeta;
  question: GalaxyHormuzRunArtifact["question"];
}

function scenarioDelta(
  previous: Record<ScenarioId, number>,
  current: Record<ScenarioId, number>,
): Partial<Record<ScenarioId, number>> {
  return {
    normal: current.normal - previous.normal,
    controlled: current.controlled - previous.controlled,
    severe: current.severe - previous.severe,
    closure: current.closure - previous.closure,
  };
}

function eventAt(index: number) {
  return `T+00:${String(index).padStart(2, "0")}`;
}

function statusTitle(status: GalaxyRunMeta["status"]) {
  if (status === "success") return "Galaxy run 已完成";
  if (status === "failed") return "Galaxy run 失败";
  if (status === "running") return "Galaxy run 运行中";
  if (status === "adapter_only") return "Galaxy artifact adapter preview";
  return "Galaxy question 已生成，等待执行";
}

function buildEvidenceEventTitle(claim: EvidenceClaim) {
  if (claim.evidenceId.includes("prediction")) return "Galaxy final prediction normalized";
  if (claim.polarity === "counter") return "Counter evidence retained";
  if (claim.affects.includes("market")) return "Market evidence mapped";
  return "Evidence claim added";
}

export function buildRunFromGalaxyArtifact(
  input: BuildRunFromArtifactInput,
): GalaxyAdaptedRun {
  const {
    artifact,
    fallbackPreviousState,
    scenarioDefinitions,
    calibrationConfig,
  } = input;
  const previousState = artifact.previousState ?? fallbackPreviousState;
  const runMeta = artifact.runMeta;
  const runId = runMeta.runId;
  const forecastedAt = runMeta.forecastedAt;

  const updateOutput = applyForecastUpdate({
    previousState,
    sourceObservations: artifact.sourceObservations,
    evidenceClaims: artifact.evidenceClaims,
    marketRead: artifact.marketRead,
    scenarioDefinitions,
    calibrationConfig,
  });
  const currentScenario = updateOutput.currentState.scenarioDistribution;
  const deltas = scenarioDelta(previousState.scenarioDistribution, currentScenario);
  const activeEvidenceIds = artifact.evidenceClaims
    .filter((claim) => claim.quality.freshness === "fresh" || claim.quality.freshness === "lagging")
    .map((claim) => claim.evidenceId)
    .sort();
  const staleEvidenceIds = artifact.evidenceClaims
    .filter((claim) => claim.quality.freshness === "stale")
    .map((claim) => claim.evidenceId)
    .sort();
  const pendingSourceIds = artifact.sourceObservations
    .filter((observation) => observation.freshness === "pending")
    .map((observation) => observation.sourceId)
    .sort();

  const checkpoint: ForecastCheckpoint = {
    checkpointId: `cp-${runMeta.questionDate.replaceAll("-", "")}`,
    runId,
    writtenAt: forecastedAt,
    revisionReason: updateOutput.revisionReason,
    previousScenario: previousState.scenarioDistribution,
    currentScenario,
    reusedState: {
      activeEvidenceIds,
      staleEvidenceIds,
      pendingSourceIds,
    },
    deltaAttribution: updateOutput.deltaAttribution,
    nextWatch: artifact.nextWatch,
  };

  const runStartedEventId = `${runId}-evt-run-started`;
  const sourceReadEventId = `${runId}-evt-source-read`;
  const evidenceEvents = artifact.evidenceClaims.map((claim, index) => ({
    claim,
    eventId: `${runId}-evt-evidence-${index + 1}-${claim.evidenceId}`,
  }));
  const judgementEventId = `${runId}-evt-judgement`;
  const checkpointEventId = `${runId}-evt-checkpoint`;
  const runCompletedEventId = `${runId}-evt-run-completed`;

  const events: AgentRunEvent[] = [
    {
      type: "run_started",
      eventId: runStartedEventId,
      runId,
      at: eventAt(0),
      title: statusTitle(runMeta.status),
      summary:
        `task=${runMeta.taskId} · question_date=${runMeta.questionDate} · output=${runMeta.outputDir}`,
    },
    {
      type: "source_read",
      eventId: sourceReadEventId,
      runId,
      at: eventAt(4),
      parentEventIds: [runStartedEventId],
      sourceObservationIds: artifact.sourceObservations.map((observation) => observation.observationId),
      sourceIds: [...new Set(artifact.sourceObservations.map((observation) => observation.sourceId))].sort(),
      status: pendingSourceIds.length === artifact.sourceObservations.length ? "pending" : "fresh",
      title: "读取 Galaxy/Hormuz source bundle",
      summary:
        "Daily question、galaxy run artifact、local source observations 与 pending caveats 已归一化。",
      licenseStatus: "open",
      retrievedAt: forecastedAt,
    },
    ...evidenceEvents.map(({ claim, eventId }, index): AgentRunEvent => ({
      type: "evidence_added",
      eventId,
      runId,
      at: eventAt(11 + index * 6),
      parentEventIds: [sourceReadEventId],
      evidenceId: claim.evidenceId,
      evidenceIds: [claim.evidenceId],
      sourceObservationIds: claim.sourceObservationIds,
      title: buildEvidenceEventTitle(claim),
      evidence: claim.claim,
      sourceIds: artifact.sourceObservations
        .filter((observation) => claim.sourceObservationIds.includes(observation.observationId))
        .map((observation) => observation.sourceId)
        .filter((value, idx, arr) => arr.indexOf(value) === idx)
        .sort(),
      polarity: claim.polarity,
      mechanismTags: claim.mechanismTags,
      affects: claim.affects,
      confidence: claim.confidence,
      licenseStatus: claim.confidence === "high" ? "restricted" : "open",
    })),
    {
      type: "judgement_updated",
      eventId: judgementEventId,
      runId,
      at: eventAt(31),
      parentEventIds: evidenceEvents.map((event) => event.eventId),
      evidenceIds: artifact.evidenceClaims.map((claim) => claim.evidenceId),
      sourceObservationIds: artifact.sourceObservations.map((observation) => observation.observationId),
      title: "Galaxy evidence -> deterministic judgement update",
      reason: updateOutput.revisionReason,
      previousScenario: previousState.scenarioDistribution,
      currentScenario,
      scenarioDelta: deltas,
      targetDeltas: updateOutput.currentState.targetForecasts,
      deltaAttribution: updateOutput.deltaAttribution,
      appliedGuardrails: updateOutput.appliedGuardrails,
      sensitivity: updateOutput.sensitivity,
      licenseStatus: "open",
    },
    {
      type: "checkpoint_written",
      eventId: checkpointEventId,
      runId,
      at: eventAt(38),
      parentEventIds: [judgementEventId],
      checkpointId: checkpoint.checkpointId,
      title: "Checkpoint 已写入",
      summary:
        "Daily galaxy artifact 已持久化为 ForecastCheckpoint，可用于 replay 与 PredictionRecord handoff。",
      revisionReason: checkpoint.revisionReason,
      nextWatch: checkpoint.nextWatch,
      reusedState: checkpoint.reusedState,
      deltaAttribution: checkpoint.deltaAttribution,
    },
    {
      type: "run_completed",
      eventId: runCompletedEventId,
      runId,
      at: eventAt(42),
      parentEventIds: [checkpointEventId],
      title: "Forecast run 完成",
      summary:
        runMeta.finalPrediction
          ? `Galaxy final_prediction=${runMeta.finalPrediction}; canonical state 由 judgement_updated 写入。`
          : "Galaxy output 尚未给出 final prediction；canonical state 使用可审计 artifact 预览。",
    },
  ];

  const predictionRecords = buildPredictionRecords({
    runId,
    checkpoint,
    currentScenario,
    targetForecasts: updateOutput.currentState.targetForecasts,
    evidenceClaims: artifact.evidenceClaims,
    forecastedAt,
  });

  return {
    runId,
    forecastedAt,
    previousState,
    currentState: updateOutput.currentState,
    scenarioDelta: deltas,
    events,
    checkpoint,
    predictionRecords,
    sourceObservations: artifact.sourceObservations,
    evidenceClaims: artifact.evidenceClaims,
    marketRead: artifact.marketRead,
    runMeta,
    question: artifact.question,
  };
}

export function isGalaxyArtifact(value: unknown): value is GalaxyHormuzRunArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GalaxyHormuzRunArtifact>;
  return (
    candidate.schemaVersion === "hormuz-galaxy-run/v1" &&
    !!candidate.question &&
    !!candidate.runMeta &&
    Array.isArray(candidate.sourceObservations) &&
    Array.isArray(candidate.evidenceClaims) &&
    !!candidate.marketRead
  );
}
