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

// --- Source observations (append-only) --------------------------------------

export const canonicalSourceObservations: SourceObservation[] = [
  {
    observationId: "obs-fred-brent-2026-05-10",
    sourceId: "fred-market",
    publishedAt: "2026-05-10T22:00:00Z",
    retrievedAt: "2026-05-11T01:30:00Z",
    sourceUrl: "https://fred.stlouisfed.org/series/DCOILBRENTEU",
    title: "Brent FRED 快照",
    summary: "Brent risk premium 相比 3 月抬升，但还不是 closure-level shock。",
    freshness: "fresh",
    licenseStatus: "open",
  },
  {
    observationId: "obs-fred-vix-2026-05-10",
    sourceId: "fred-market",
    publishedAt: "2026-05-10T22:00:00Z",
    retrievedAt: "2026-05-11T01:30:00Z",
    sourceUrl: "https://fred.stlouisfed.org/series/VIXCLS",
    title: "VIX FRED 快照",
    summary: "VIX 仍处温和区间，不像 closure-style stress。",
    freshness: "fresh",
    licenseStatus: "open",
  },
  {
    observationId: "obs-ukmto-2026-05-10",
    sourceId: "official-advisory",
    publishedAt: "2026-05-10T14:00:00Z",
    retrievedAt: "2026-05-10T14:25:00Z",
    title: "UKMTO advisory：区域风险偏高",
    summary: "Advisory 仍使用 elevated risk wording，但没有 avoidance instruction。",
    freshness: "fresh",
    licenseStatus: "open",
  },
  {
    observationId: "obs-ais-pending",
    sourceId: "ais-flow-pending",
    retrievedAt: "2026-05-11T01:30:00Z",
    title: "AIS flow proxy 待接入",
    summary: "尚未接入授权 AIS provider。",
    freshness: "pending",
    licenseStatus: "pending",
  },
];

// --- Evidence claims --------------------------------------------------------

export const canonicalEvidenceClaims: EvidenceClaim[] = [
  {
    evidenceId: "ev-market-risk-premium",
    sourceObservationIds: ["obs-fred-brent-2026-05-10", "obs-fred-vix-2026-05-10"],
    claim:
      "油价 risk premium 支持可控扰动；VIX、Broad USD 与权益组合尚未定价 closure。",
    polarity: "support",
    affects: ["market", "scenario", "target"],
    mechanismTags: ["market_pricing_risk_premium", "market_not_pricing_closure"],
    confidence: "medium",
    quality: {
      sourceReliability: "high",
      freshness: "fresh",
      corroboration: "multi_source",
      directness: "direct",
    },
    targetHints: [
      { target: "brent", direction: "up", weight: 0.8 },
      { target: "wti", direction: "up", weight: 0.6 },
      { target: "vix", direction: "up", weight: 0.4 },
      { target: "sp500", direction: "down", weight: 0.4 },
    ],
  },
  {
    evidenceId: "ev-official-advisory",
    sourceObservationIds: ["obs-ukmto-2026-05-10"],
    claim:
      "海事 advisory 仍处 elevated，但没有 avoidance wording；支撑 transit risk premium，但不足以触发 closure。",
    polarity: "support",
    affects: ["scenario", "target", "watchlist"],
    mechanismTags: ["transit_risk_up", "insurance_cost_up"],
    confidence: "medium",
    quality: {
      sourceReliability: "high",
      freshness: "fresh",
      corroboration: "single_source",
      directness: "direct",
    },
    targetHints: [
      { target: "transit_disruption_7d", direction: "up", weight: 0.8 },
      { target: "regional_escalation_7d", direction: "up", weight: 0.6 },
    ],
  },
  {
    evidenceId: "ev-flow-not-verified",
    sourceObservationIds: ["obs-ais-pending"],
    claim:
      "flow layer 仍是 pending，不能作为 traffic stop 的 live evidence；这削弱 closure 成为主情景的依据。",
    polarity: "counter",
    affects: ["scenario", "watchlist"],
    mechanismTags: ["market_not_pricing_closure"],
    confidence: "low",
    quality: {
      sourceReliability: "low",
      freshness: "stale",
      corroboration: "single_source",
      directness: "context",
    },
    targetHints: [
      { target: "deescalation_signal_14d", direction: "down", weight: 0.3 },
    ],
  },
];

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

export const canonicalMarketRead: MarketRead = {
  title: "市场信号混合：油价保留风险溢价，但事件窗口压力回落",
  summary:
    "Brent / WTI 相比 3 月低点仍处高位，说明 risk premium 未消失；但 2026-04-07 之后 VIX 回落、S&P 500 上行，cross-asset 组合不支持 closure-style shock。",
  pricingPattern: "mixed",
  evidenceIds: ["ev-market-risk-premium"],
  caveat:
    "市场信号只是 evidence input；mixed pattern 不能直接更新 forecast state，也不能单独推高 closure。",
  asOf: "2026-05-10",
};

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
const evidenceMarketEventId = `${RUN_ID}-evt-evidence-market`;
const evidenceAdvisoryEventId = `${RUN_ID}-evt-evidence-advisory`;
const evidenceFlowEventId = `${RUN_ID}-evt-evidence-flow`;
const judgementEventId = `${RUN_ID}-evt-judgement`;
const checkpointEventId = `${RUN_ID}-evt-checkpoint`;
const runCompletedEventId = `${RUN_ID}-evt-run-completed`;

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
    sourceIds: [
      "eia-iea-hormuz",
      "official-advisory",
      "fred-market",
      "ais-flow-pending",
      "gold-pending",
      "usdcnh-pending",
      "acled-conflict",
      "ucdp-ged",
    ],
    status: "fresh",
    title: "读取固定 source bundle",
    summary:
      "结构性 baseline、operational source、market benchmark、pending 与 historical sources 分开登记。",
    licenseStatus: "open",
  },
  {
    type: "evidence_added",
    eventId: evidenceMarketEventId,
    runId: RUN_ID,
    at: "T+00:11",
    parentEventIds: [sourceReadEventId],
    evidenceId: "ev-market-risk-premium",
    evidenceIds: ["ev-market-risk-premium"],
    sourceObservationIds: [
      "obs-fred-brent-2026-05-10",
      "obs-fred-vix-2026-05-10",
    ],
    title: "市场 evidence 支持 risk premium",
    evidence:
      "油价 risk premium 上行，但 VIX / Broad USD / US10Y / SPX 组合尚未定价 closure。",
    sourceIds: ["fred-market"],
    polarity: "support",
    mechanismTags: ["market_pricing_risk_premium", "market_not_pricing_closure"],
    affects: ["market", "scenario", "target"],
    confidence: "medium",
    licenseStatus: "open",
  },
  {
    type: "evidence_added",
    eventId: evidenceAdvisoryEventId,
    runId: RUN_ID,
    at: "T+00:18",
    parentEventIds: [sourceReadEventId],
    evidenceId: "ev-official-advisory",
    evidenceIds: ["ev-official-advisory"],
    sourceObservationIds: ["obs-ukmto-2026-05-10"],
    title: "Maritime advisory：偏高但没有 avoidance",
    evidence:
      "UKMTO advisory 保持 elevated risk wording；没有 avoidance instruction。它支撑 transit risk，但不足以触发 closure。",
    sourceIds: ["official-advisory"],
    polarity: "support",
    mechanismTags: ["transit_risk_up", "insurance_cost_up"],
    affects: ["scenario", "target", "watchlist"],
    confidence: "medium",
    licenseStatus: "open",
  },
  {
    type: "evidence_added",
    eventId: evidenceFlowEventId,
    runId: RUN_ID,
    at: "T+00:23",
    parentEventIds: [sourceReadEventId],
    evidenceId: "ev-flow-not-verified",
    evidenceIds: ["ev-flow-not-verified"],
    sourceObservationIds: ["obs-ais-pending"],
    title: "Flow layer 仍是 pending",
    evidence:
      "AIS flow source 仍是 pending；不能作为 traffic stop 的 live evidence。因此削弱 closure 作为主情景。",
    sourceIds: ["ais-flow-pending"],
    polarity: "counter",
    mechanismTags: ["market_not_pricing_closure"],
    affects: ["scenario", "watchlist"],
    confidence: "low",
    licenseStatus: "pending",
  },
  {
    type: "judgement_updated",
    eventId: judgementEventId,
    runId: RUN_ID,
    at: "T+00:31",
    parentEventIds: [
      evidenceMarketEventId,
      evidenceAdvisoryEventId,
      evidenceFlowEventId,
    ],
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
