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
import type { MarketSeries } from "../types";
import generatedMarketSeries from "../../data/generated/market_series.json";
import fredSeriesCsv from "../../data/normalized/market/fred_series.csv?raw";
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
import { marketProviders } from "../data/sourceRegistry";
import latestGalaxyRun from "../../data/galaxy/latest-run.json";
import {
  buildRunFromGalaxyArtifact,
  isGalaxyArtifact,
  type GalaxyAdaptedRun,
} from "../lib/forecast/galaxyArtifact";

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
  series: MarketSeries[];
  stableSeries: MarketSeries[];
  pendingSeries: MarketSeries[];
  sourceCoverage: Array<{
    sourceId: string;
    name: string;
    pending: boolean;
    status: string;
    caveat: string;
  }>;
  providerCoverage: Array<{
    providerId: string;
    name: string;
    providerStatus: string;
    licenseStatus: string;
    targetIds: string[];
    caveat: string;
  }>;
}

export function projectMarketState(
  sourceRegistry: SourceRegistryEntry[],
): MarketProjection {
  const series = generatedMarketSeries as MarketSeries[];
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
  const sourceIdsInSeries = new Set(series.map((item) => item.sourceId));
  const sourceCoverage = sourceRegistry
    .filter((source) => sourceIdsInSeries.has(source.id))
    .map((source) => ({
      sourceId: source.id,
      name: source.name,
      pending: source.pending,
      status: source.status,
      caveat: source.caveat,
    }));
  const providerIdsInSeries = new Set(
    series.flatMap((item) => [
      item.provider_id,
      ...(item.candidate_provider_ids ?? []),
    ]).filter(Boolean),
  );
  const providerCoverage = marketProviders
    .filter((provider) => providerIdsInSeries.has(provider.provider_id))
    .map((provider) => ({
      providerId: provider.provider_id,
      name: provider.display_name,
      providerStatus: provider.provider_status,
      licenseStatus: provider.license_status,
      targetIds: provider.target_ids,
      caveat: provider.caveat,
    }));

  return {
    marketRead: canonicalMarketRead,
    evidence: referencedEvidence,
    observations,
    pendingSourceIds,
    series,
    stableSeries: series.filter((item) => !item.pending),
    pendingSeries: series.filter((item) => item.pending),
    sourceCoverage,
    providerCoverage,
  };
}

// --- Forecast ---------------------------------------------------------------

export interface BrentDailyPoint {
  date: string;
  value: number;
}

export interface BrentDailySeriesProjection {
  seriesId: "DCOILBRENTEU";
  target: "brent";
  label: string;
  unit: "USD/bbl";
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  points: BrentDailyPoint[];
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"" && line[index + 1] === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseFredBrentDailySeries(): BrentDailySeriesProjection {
  const rows = fredSeriesCsv
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCsvLine);
  const header = rows.shift() ?? [];
  const column = (name: string) => header.indexOf(name);
  const seriesIndex = column("series_id");
  const targetIndex = column("target");
  const dateIndex = column("date");
  const valueIndex = column("value");
  const unitIndex = column("unit");
  const sourceUrlIndex = column("source_url");
  const retrievedAtIndex = column("retrieved_at");

  let sourceUrl = "https://fred.stlouisfed.org/series/DCOILBRENTEU";
  let retrievedAt = "";
  const points: BrentDailyPoint[] = [];

  for (const row of rows) {
    if (row[seriesIndex] !== "DCOILBRENTEU" || row[targetIndex] !== "brent") continue;
    const value = Number.parseFloat(row[valueIndex] ?? "");
    if (!Number.isFinite(value)) continue;
    if ((row[unitIndex] ?? "USD/bbl") !== "USD/bbl") continue;
    sourceUrl = row[sourceUrlIndex] || sourceUrl;
    retrievedAt = row[retrievedAtIndex] || retrievedAt;
    points.push({ date: row[dateIndex], value });
  }

  return {
    seriesId: "DCOILBRENTEU",
    target: "brent",
    label: "Brent crude oil spot price",
    unit: "USD/bbl",
    source: "FRED DCOILBRENTEU",
    sourceUrl,
    retrievedAt,
    points: points.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function projectBrentDailySeries(window = 30): BrentDailySeriesProjection {
  const series = parseFredBrentDailySeries();
  return {
    ...series,
    points: series.points.slice(-window),
  };
}

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
  galaxyRun: GalaxyAdaptedRun | null;
}

export function projectForecastState(galaxyArtifact?: unknown): ForecastProjection {
  const artifactSource = galaxyArtifact === null ? null : galaxyArtifact ?? latestGalaxyRun;
  const galaxyRun = isGalaxyArtifact(artifactSource)
    ? buildRunFromGalaxyArtifact({
        artifact: artifactSource,
        fallbackPreviousState: canonicalRun.previousState,
        scenarioDefinitions: canonicalScenarioDefinitions,
        calibrationConfig: canonicalCalibrationConfig,
        previousCheckpoint: canonicalForecastCheckpoints.at(-1),
      })
    : null;
  const runId = galaxyRun?.runId ?? canonicalRun.runId;
  const forecastedAt = galaxyRun?.forecastedAt ?? canonicalRun.forecastedAt;
  const previousScenario =
    galaxyRun?.previousState.scenarioDistribution ??
    canonicalRun.previousState.scenarioDistribution;
  const currentScenario =
    galaxyRun?.currentState.scenarioDistribution ??
    canonicalRun.currentState.scenarioDistribution;
  const scenarioDeltaValue = galaxyRun?.scenarioDelta ?? canonicalRun.scenarioDelta;
  const previousTargetForecasts =
    galaxyRun?.previousState.targetForecasts ??
    canonicalRun.previousState.targetForecasts;
  const currentTargetForecasts =
    galaxyRun?.currentState.targetForecasts ??
    canonicalRun.currentState.targetForecasts;
  const events = galaxyRun?.events ?? canonicalAgentRunEvents;
  const evidenceClaims = galaxyRun?.evidenceClaims ?? canonicalEvidenceClaims;
  const observations = galaxyRun?.sourceObservations ?? canonicalSourceObservations;
  const checkpoint = galaxyRun?.checkpoint ?? canonicalRun.checkpoint;

  const judgement = events.find(
    (e): e is Extract<AgentRunEvent, { type: "judgement_updated" }> =>
      e.type === "judgement_updated",
  );
  const storyPath = selectStoryPath({
    events,
    evidenceClaims,
    deltaAttribution: judgement?.deltaAttribution ?? [],
  });

  const storyGraph = buildForecastGraph({
    events,
    evidenceClaims,
    sourceObservations: observations,
    storyPath,
    mode: "story",
  });
  const auditGraph = buildForecastGraph({
    events,
    evidenceClaims,
    sourceObservations: observations,
    storyPath,
    mode: "audit",
  });

  return {
    runId,
    forecastedAt,
    previousScenario,
    currentScenario,
    scenarioDelta: scenarioDeltaValue,
    previousTargetForecasts,
    currentTargetForecasts,
    events,
    evidenceClaims,
    observations,
    checkpoint,
    storyPath,
    storyGraph,
    auditGraph,
    appliedGuardrails: judgement?.appliedGuardrails ?? [],
    sensitivity: judgement?.sensitivity ?? [],
    primaryTarget: storyPath.primaryTarget,
    galaxyRun,
  };
}

// --- Shared exports ---------------------------------------------------------

export {
  canonicalScenarioDefinitions,
  canonicalCalibrationConfig,
  canonicalForecastCheckpoints,
  canonicalPredictionRecords,
};
