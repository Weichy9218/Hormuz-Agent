// Canonical Hormuz case state.
//
// All UI consumes data through projections defined below; no page is allowed
// to read raw mock objects directly. The deterministic forecast updater
// (src/lib/forecast/applyForecastUpdate.ts) is the only path that produces
// a current scenario distribution or target forecast set.
//
// Data layers:
//   sourceRegistry             -> imported from src/data/sourceRegistry.ts
//   canonicalSourceObservations -> append-only observations bound to sources
//   canonicalEvidenceClaims    -> normalized evidence with quality + target hints
//   canonicalMarketRead        -> pricingPattern-only market read
//   canonicalScenarioDefinitions
//   canonicalCalibrationConfig
//   canonicalAgentRunEvents    -> deterministic event stream for the current run
//   canonicalForecastCheckpoints
//   canonicalPredictionRecords
import { applyForecastUpdate } from "../lib/forecast/applyForecastUpdate";
import { buildPredictionRecords } from "../lib/forecast/buildPredictionRecords";
import localCanonicalInputs from "../../data/generated/canonical_inputs.json";
import type { AgentRunEvent } from "../types/agentEvents";
import type {
  CalibrationConfig,
  EvidenceClaim,
  ForecastCheckpoint,
  ForecastState,
  ForecastTarget,
  MarketRead,
  PredictionRecord,
  ScenarioDefinition,
  ScenarioId,
  SourceObservation,
  TargetForecast,
  LicenseStatus,
} from "../types/forecast";

// --- Static helpers ---------------------------------------------------------

export const scenarioOrder: ScenarioId[] = [
  "normal",
  "controlled",
  "severe",
  "closure",
];

export const scenarioLabel: Record<ScenarioId, string> = {
  normal: "正常通行",
  controlled: "可控扰动",
  severe: "严重扰动",
  closure: "封锁（尾部情景）",
};

export const scenarioEnglishLabel: Record<ScenarioId, string> = {
  normal: "Normal",
  controlled: "Controlled disruption",
  severe: "Severe disruption",
  closure: "Closure",
};

export const scenarioPosture: Record<ScenarioId, string> = {
  normal: "风险缓和趋势，但仍需保持高频监测",
  controlled: "选择性延误 + 保险溢价上行，但无“全面封锁”证据",
  severe: "重复事件或官方限制开始实质影响通行流量",
  closure: "尾部情景：需要强于新闻措辞或口头表态的实证信号",
};

export const scenarioColor: Record<ScenarioId, string> = {
  normal: "#94a3b8",
  controlled: "#0b66f6",
  severe: "#ff9f1c",
  closure: "#ef2b2d",
};

export const forecastTargetOptions: Array<{
  target: ForecastTarget;
  label: string;
  group: "assets" | "risk_targets";
}> = [
  { target: "brent", label: "Brent", group: "assets" },
  { target: "wti", label: "WTI", group: "assets" },
  { target: "gold", label: "Gold", group: "assets" },
  { target: "broad_usd", label: "Broad USD", group: "assets" },
  { target: "usd_cny", label: "USD/CNY", group: "assets" },
  { target: "usd_cnh", label: "USD/CNH pending", group: "assets" },
  { target: "us10y", label: "US10Y", group: "assets" },
  { target: "vix", label: "VIX", group: "assets" },
  { target: "sp500", label: "S&P 500", group: "assets" },
  { target: "regional_escalation_7d", label: "Regional escalation 7d", group: "risk_targets" },
  { target: "transit_disruption_7d", label: "Transit disruption 7d", group: "risk_targets" },
  { target: "state_on_state_strike_14d", label: "State-on-state strike 14d", group: "risk_targets" },
  { target: "deescalation_signal_14d", label: "De-escalation signal 14d", group: "risk_targets" },
];

export const targetLabel: Record<ForecastTarget, string> = Object.fromEntries(
  forecastTargetOptions.map((option) => [option.target, option.label]),
) as Record<ForecastTarget, string>;

function sourceIdsForObservationIds(observationIds: string[]): string[] {
  const sourceIds = new Set<string>();
  for (const observationId of observationIds) {
    const observation = canonicalSourceObservations.find((item) =>
      item.observationId === observationId
    );
    if (observation) sourceIds.add(observation.sourceId);
  }
  return [...sourceIds].sort();
}

function evidenceTitle(claim: EvidenceClaim): string {
  if (claim.evidenceId.includes("market")) return "Market evidence";
  if (claim.evidenceId.includes("advisory")) return "Official advisory evidence";
  if (claim.evidenceId.includes("portwatch")) return "PortWatch metric-boundary evidence";
  return "Evidence added";
}

function evidenceLicenseStatus(claim: EvidenceClaim): LicenseStatus {
  const statuses = claim.sourceObservationIds
    .map((observationId) =>
      canonicalSourceObservations.find((item) => item.observationId === observationId)?.licenseStatus
    )
    .filter(Boolean);
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("restricted")) return "restricted";
  if (statuses.includes("unknown")) return "unknown";
  return "open";
}

// --- Scenario definitions ---------------------------------------------------

export const canonicalScenarioDefinitions: ScenarioDefinition[] = [
  {
    id: "normal",
    label: "Normal",
    oneLineMeaning: "通行和市场都接近常态",
    triggerConditions: ["advisory 降级", "无新增事件", "risk premium 回落"],
    exitConditions: ["新通告", "市场风险溢价上行"],
    observableSignals: ["UKMTO/JMIC neutral", "oil flat/down"],
    marketSignature: ["oil flat/down", "VIX flat", "USD neutral"],
  },
  {
    id: "controlled",
    label: "Controlled disruption",
    oneLineMeaning: "maritime/security risk 上行，但无持续 closure-class traffic stop",
    triggerConditions: ["fresh advisory", "isolated incident", "insurance/rerouting"],
    exitConditions: ["N 天无新事件", "advisory downgraded", "premium fades"],
    observableSignals: ["advisory wording 升级", "保险溢价"],
    marketSignature: ["oil risk premium without broad closure shock"],
  },
  {
    id: "severe",
    label: "Severe disruption",
    oneLineMeaning: "重复事件或官方限制开始实质影响通行",
    triggerConditions: [
      "verified traffic disruption",
      "avoidance wording",
      "insurance/freight 非线性 jump",
    ],
    exitConditions: ["flow recovers", "official wording de-escalates"],
    observableSignals: ["官方 avoidance", "持续保险升级"],
    marketSignature: ["oil up + vol / risk-off broadening"],
    maxReasonableProbabilityWithoutTrafficStop: 0.3,
  },
  {
    id: "closure",
    label: "Closure",
    oneLineMeaning: "sustained closure-class traffic stop",
    triggerConditions: [
      "verified halt/restriction",
      "official closure/avoidance",
      "multi-source confirmation",
    ],
    exitConditions: ["traffic restoration", "official reopening"],
    observableSignals: ["confirmed flow stop", "official closure"],
    marketSignature: ["oil shock + VIX / equity / USD / rates stress"],
    maxReasonableProbabilityWithoutTrafficStop: 0.15,
  },
];

// --- Calibration config (scenario guardrails) -------------------------------

export const canonicalCalibrationConfig: CalibrationConfig = {
  configId: "hormuz-default-2026-05-11",
  scorerVersion: "hormuz-deterministic-2026-05-11",
  scenarioGuardrails: [
    {
      scenarioId: "severe",
      maxProbability: 30,
      appliesWhenMissing: ["verified_traffic_stop"],
      reasonCode: "no_verified_traffic_stop",
    },
    {
      scenarioId: "closure",
      maxProbability: 15,
      appliesWhenMissing: ["verified_traffic_stop"],
      reasonCode: "no_verified_traffic_stop",
    },
  ],
};

// --- Generated local canonical inputs ---------------------------------------

interface LocalCanonicalInputs {
  schemaVersion: "hormuz-local-canonical-inputs/v1";
  generatedAt: string;
  sourceObservations: SourceObservation[];
  evidenceClaims: EvidenceClaim[];
  marketRead: MarketRead;
  notes: string[];
}

const localInputs = localCanonicalInputs as LocalCanonicalInputs;

export const canonicalSourceObservations: SourceObservation[] =
  localInputs.sourceObservations;

export const canonicalEvidenceClaims: EvidenceClaim[] =
  localInputs.evidenceClaims;

// --- Previous state (cp1) ---------------------------------------------------

const previousScenario: Record<ScenarioId, number> = {
  normal: 23,
  controlled: 52,
  severe: 18,
  closure: 7,
};

const previousTargetForecasts: TargetForecast[] = [
  { target: "brent", horizon: "7d", direction: "up", confidence: 0.58, deltaLabel: "+ risk premium", rationale: "上轮判断为可控扰动。", sourceIds: ["fred-market"] },
  { target: "wti", horizon: "7d", direction: "up", confidence: 0.5, deltaLabel: "+ risk premium", rationale: "跟随 Brent 风险溢价。", sourceIds: ["fred-market"] },
  { target: "gold", horizon: "7d", direction: "uncertain", confidence: 0.3, deltaLabel: "pending source", rationale: "Gold source 仍是 pending。", sourceIds: [] },
  { target: "broad_usd", horizon: "7d", direction: "up", confidence: 0.45, deltaLabel: "+ haven", rationale: "温和避险需求。", sourceIds: ["fred-market"] },
  { target: "usd_cny", horizon: "7d", direction: "up", confidence: 0.42, deltaLabel: "+ pressure", rationale: "FX pressure 上行。", sourceIds: ["fred-market"] },
  { target: "usd_cnh", horizon: "7d", direction: "uncertain", confidence: 0.25, deltaLabel: "pending source", rationale: "CNH source 仍是 pending。", sourceIds: [] },
  { target: "us10y", horizon: "7d", direction: "flat", confidence: 0.4, deltaLabel: "mixed", rationale: "通胀、避险与利率渠道方向混合。", sourceIds: ["fred-market"] },
  { target: "vix", horizon: "7d", direction: "up", confidence: 0.55, deltaLabel: "+ headline beta", rationale: "对 headline risk 较敏感。", sourceIds: ["fred-market"] },
  { target: "sp500", horizon: "7d", direction: "down", confidence: 0.48, deltaLabel: "- risk appetite", rationale: "风险偏好受压。", sourceIds: ["fred-market"] },
  { target: "regional_escalation_7d", horizon: "7d", direction: "up", confidence: 0.5, deltaLabel: "+5 pp", rationale: "Advisory 与 maritime risk 推高。", sourceIds: ["official-advisory"] },
  { target: "transit_disruption_7d", horizon: "7d", direction: "up", confidence: 0.55, deltaLabel: "+ transit risk", rationale: "Advisory 与 insurance channel 支撑。", sourceIds: ["official-advisory"] },
  { target: "state_on_state_strike_14d", horizon: "14d", direction: "uncertain", confidence: 0.4, deltaLabel: "needs conflict evidence", rationale: "ACLED 仅作 candidate context。", sourceIds: [] },
  { target: "deescalation_signal_14d", horizon: "14d", direction: "down", confidence: 0.45, deltaLabel: "-4 pp", rationale: "de-escalation 证据有限。", sourceIds: ["official-advisory"] },
];

const previousForecastState: ForecastState = {
  scenarioDistribution: previousScenario,
  targetForecasts: previousTargetForecasts,
};

// --- Run deterministic forecast updater -------------------------------------

const RUN_ID = "demo-hormuz-2026-05-11";
const FORECASTED_AT = "2026-05-11T09:30:00+08:00";

export const canonicalMarketRead: MarketRead = localInputs.marketRead;

const updateOutput = applyForecastUpdate({
  previousState: previousForecastState,
  sourceObservations: canonicalSourceObservations,
  evidenceClaims: canonicalEvidenceClaims,
  marketRead: canonicalMarketRead,
  scenarioDefinitions: canonicalScenarioDefinitions,
  calibrationConfig: canonicalCalibrationConfig,
});

const currentScenario = updateOutput.currentState.scenarioDistribution;
const currentTargetForecasts = updateOutput.currentState.targetForecasts;

const scenarioDelta: Partial<Record<ScenarioId, number>> = {};
for (const id of scenarioOrder) {
  scenarioDelta[id] = currentScenario[id] - previousScenario[id];
}

// --- Checkpoints ------------------------------------------------------------

const previousCheckpoint: ForecastCheckpoint = {
  checkpointId: "cp1",
  runId: "demo-hormuz-2026-05-09",
  writtenAt: "2026-05-09T20:00:00+08:00",
  revisionReason:
    "上轮：maritime advisory 稳定，market risk premium 开始出现。",
  previousScenario: { normal: 30, controlled: 47, severe: 16, closure: 7 },
  currentScenario: previousScenario,
  reusedState: {
    activeEvidenceIds: [],
    staleEvidenceIds: [],
    pendingSourceIds: ["ais-flow-pending", "gold-pending", "usdcnh-pending"],
  },
  deltaAttribution: [],
  nextWatch: [
    "UKMTO / JMIC / MARAD wording escalation",
    "Authorized AIS / tanker / LNG flow turn-down",
    "Insurance / chartering / freight non-linear jump",
  ],
};

const currentCheckpoint: ForecastCheckpoint = {
  checkpointId: "cp2",
  runId: RUN_ID,
  writtenAt: FORECASTED_AT,
  revisionReason: updateOutput.revisionReason,
  previousScenario,
  currentScenario,
  reusedState: {
    activeEvidenceIds: canonicalEvidenceClaims
      .filter((c) => c.quality.freshness === "fresh")
      .map((c) => c.evidenceId)
      .sort(),
    staleEvidenceIds: canonicalEvidenceClaims
      .filter((c) => c.quality.freshness === "stale")
      .map((c) => c.evidenceId)
      .sort(),
    pendingSourceIds: ["ais-flow-pending", "gold-pending", "usdcnh-pending"],
  },
  deltaAttribution: updateOutput.deltaAttribution,
  nextWatch: [
    "UKMTO / JMIC / MARAD avoidance or threat wording escalation",
    "Authorized AIS / tanker / LNG flow turn-down",
    "Insurance / chartering / freight non-linear jump",
  ],
};

export const canonicalForecastCheckpoints: ForecastCheckpoint[] = [
  previousCheckpoint,
  currentCheckpoint,
];

// --- Agent run events (canonical) -------------------------------------------

const runStartedEventId = `${RUN_ID}-evt-run-started`;
const sourceReadEventId = `${RUN_ID}-evt-source-read`;
const judgementEventId = `${RUN_ID}-evt-judgement`;
const checkpointEventId = `${RUN_ID}-evt-checkpoint`;
const runCompletedEventId = `${RUN_ID}-evt-run-completed`;

const evidenceEvents = canonicalEvidenceClaims.map<AgentRunEvent>((claim, index) => ({
  type: "evidence_added",
  eventId: `${RUN_ID}-evt-evidence-${index + 1}-${claim.evidenceId}`,
  runId: RUN_ID,
  at: `T+00:${String(11 + index * 6).padStart(2, "0")}`,
  parentEventIds: [sourceReadEventId],
  evidenceId: claim.evidenceId,
  evidenceIds: [claim.evidenceId],
  sourceObservationIds: claim.sourceObservationIds,
  title: evidenceTitle(claim),
  evidence: claim.claim,
  sourceIds: sourceIdsForObservationIds(claim.sourceObservationIds),
  polarity: claim.polarity,
  mechanismTags: claim.mechanismTags,
  affects: claim.affects,
  confidence: claim.confidence,
  licenseStatus: evidenceLicenseStatus(claim),
}));

const sourceReadSourceIds = [
  ...new Set([
    ...canonicalSourceObservations.map((observation) => observation.sourceId),
    "gold-pending",
    "usdcnh-pending",
    "ais-flow-pending",
  ]),
].sort();

export const canonicalAgentRunEvents: AgentRunEvent[] = [
  {
    type: "run_started",
    eventId: runStartedEventId,
    runId: RUN_ID,
    at: "T+00:00",
    title: "Forecast run 启动",
    summary:
      "本轮 run 回答 Hormuz scenario distribution 与跨资产 targets 是否需要修订。",
  },
  {
    type: "source_read",
    eventId: sourceReadEventId,
    runId: RUN_ID,
    at: "T+00:04",
    parentEventIds: [runStartedEventId],
    sourceObservationIds: canonicalSourceObservations.map((o) => o.observationId),
    sourceIds: sourceReadSourceIds,
    status: "fresh",
    title: "读取固定 source bundle",
    summary:
      "结构性 baseline、official advisory、market benchmark、PortWatch/IMO proxy 与 pending sources 分开登记。",
    licenseStatus: "open",
  },
  ...evidenceEvents,
  {
    type: "judgement_updated",
    eventId: judgementEventId,
    runId: RUN_ID,
    at: "T+00:31",
    parentEventIds: evidenceEvents.map((event) => event.eventId),
    evidenceIds: canonicalEvidenceClaims.map((c) => c.evidenceId),
    sourceObservationIds: canonicalSourceObservations.map((o) => o.observationId),
    title: "情景与 target forecast 修订",
    reason: updateOutput.revisionReason,
    previousScenario,
    currentScenario,
    scenarioDelta,
    targetDeltas: currentTargetForecasts,
    deltaAttribution: updateOutput.deltaAttribution,
    appliedGuardrails: updateOutput.appliedGuardrails,
    sensitivity: updateOutput.sensitivity,
    licenseStatus: "open",
  },
  {
    type: "checkpoint_written",
    eventId: checkpointEventId,
    runId: RUN_ID,
    at: "T+00:38",
    parentEventIds: [judgementEventId],
    checkpointId: currentCheckpoint.checkpointId,
    title: "Checkpoint 已写入",
    summary:
      "Checkpoint 持久化当前 scenario distribution、target forecasts 与 next watch。",
    revisionReason: currentCheckpoint.revisionReason,
    nextWatch: currentCheckpoint.nextWatch,
    reusedState: currentCheckpoint.reusedState,
    deltaAttribution: currentCheckpoint.deltaAttribution,
  },
  {
    type: "run_completed",
    eventId: runCompletedEventId,
    runId: RUN_ID,
    at: "T+00:42",
    parentEventIds: [checkpointEventId],
    title: "Forecast run 完成",
    summary:
      "Event stream、scenario distribution、target forecasts 与 checkpoint 共享同一个 contract。",
  },
];

// --- Prediction records (for galaxy / galaxy-selfevolve batch aggregation) --

export const canonicalPredictionRecords: PredictionRecord[] = buildPredictionRecords({
  runId: RUN_ID,
  checkpoint: currentCheckpoint,
  currentScenario,
  targetForecasts: currentTargetForecasts,
  evidenceClaims: canonicalEvidenceClaims,
  forecastedAt: FORECASTED_AT,
});

// --- Public state snapshot --------------------------------------------------

export interface CanonicalRun {
  runId: string;
  forecastedAt: string;
  previousState: ForecastState;
  currentState: ForecastState;
  scenarioDelta: Partial<Record<ScenarioId, number>>;
  events: AgentRunEvent[];
  checkpoint: ForecastCheckpoint;
  predictionRecords: PredictionRecord[];
}

export const canonicalRun: CanonicalRun = {
  runId: RUN_ID,
  forecastedAt: FORECASTED_AT,
  previousState: previousForecastState,
  currentState: updateOutput.currentState,
  scenarioDelta,
  events: canonicalAgentRunEvents,
  checkpoint: currentCheckpoint,
  predictionRecords: canonicalPredictionRecords,
};
