// Build PredictionRecord[] from a checkpoint + judgement_updated event.
// These records are the stable, schema-clean output emitted to
// galaxy / galaxy-selfevolve for batch aggregation and calibration.
import type {
  EvidenceClaim,
  ForecastCheckpoint,
  ForecastHorizon,
  MechanismTag,
  PredictionRecord,
  ScenarioId,
  TargetForecast,
} from "../../types/forecast";

const SCORER_VERSION = "hormuz-deterministic-2026-05-11";
const CASE_ID = "hormuz" as const;

function uniqSorted<T>(values: T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

export interface BuildPredictionRecordsInput {
  runId: string;
  checkpoint: ForecastCheckpoint;
  currentScenario: Record<ScenarioId, number>;
  targetForecasts: TargetForecast[];
  evidenceClaims: EvidenceClaim[];
  forecastedAt: string;
  scenarioHorizon?: ForecastHorizon;
}

export function buildPredictionRecords(
  input: BuildPredictionRecordsInput,
): PredictionRecord[] {
  const {
    runId,
    checkpoint,
    currentScenario,
    targetForecasts,
    evidenceClaims,
    forecastedAt,
    scenarioHorizon = "7d",
  } = input;

  const evidenceIds = uniqSorted(evidenceClaims.map((c) => c.evidenceId));
  const sourceObservationIds = uniqSorted(
    evidenceClaims.flatMap((c) => c.sourceObservationIds),
  );
  const allMechanismTags = uniqSorted(
    evidenceClaims.flatMap((c) => c.mechanismTags),
  ) as MechanismTag[];

  const records: PredictionRecord[] = [];

  records.push({
    kind: "scenario_distribution",
    predictionId: `pred-${runId}-scenario`,
    caseId: CASE_ID,
    runId,
    checkpointId: checkpoint.checkpointId,
    forecastedAt,
    horizon: scenarioHorizon,
    scenarioDistribution: { ...currentScenario },
    evidenceIds,
    sourceObservationIds,
    mechanismTags: allMechanismTags,
    status: "unresolved",
    scorerVersion: SCORER_VERSION,
  });

  for (const forecast of targetForecasts) {
    // Per-target evidence / observation / mechanism set derived from claims
    // that hint at this target. Falls back to global set if no specific hints.
    const claimsForTarget = evidenceClaims.filter((c) =>
      c.targetHints?.some((h) => h.target === forecast.target),
    );
    const evIds = uniqSorted(
      (claimsForTarget.length ? claimsForTarget : evidenceClaims).map((c) => c.evidenceId),
    );
    const obsIds = uniqSorted(
      (claimsForTarget.length ? claimsForTarget : evidenceClaims).flatMap(
        (c) => c.sourceObservationIds,
      ),
    );
    const mechTags = uniqSorted(
      (claimsForTarget.length ? claimsForTarget : evidenceClaims).flatMap(
        (c) => c.mechanismTags,
      ),
    ) as MechanismTag[];

    records.push({
      kind: "target_direction",
      predictionId: `pred-${runId}-direction-${forecast.target}`,
      caseId: CASE_ID,
      runId,
      checkpointId: checkpoint.checkpointId,
      target: forecast.target,
      forecastedAt,
      horizon: forecast.horizon,
      direction: forecast.direction,
      confidence: forecast.confidence,
      evidenceIds: evIds,
      sourceObservationIds: obsIds,
      mechanismTags: mechTags,
      status: "unresolved",
      scorerVersion: SCORER_VERSION,
    });

    if (forecast.direction !== "uncertain" && forecast.confidence > 0) {
      records.push({
        kind: "target_probability",
        predictionId: `pred-${runId}-prob-${forecast.target}`,
        caseId: CASE_ID,
        runId,
        checkpointId: checkpoint.checkpointId,
        target: forecast.target,
        forecastedAt,
        horizon: forecast.horizon,
        probability: forecast.confidence,
        evidenceIds: evIds,
        sourceObservationIds: obsIds,
        mechanismTags: mechTags,
        status: "unresolved",
        scorerVersion: SCORER_VERSION,
      });
    }
  }

  return records;
}
