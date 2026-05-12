// Core forecast contract. Single source of truth for schema, no backward compat.
// Used by the canonical store, forecast updater, projections, and UI.

export type ScenarioId = "normal" | "controlled" | "severe" | "closure";

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

export type MechanismTag =
  | "transit_risk_up"
  | "traffic_flow_down"
  | "insurance_cost_up"
  | "mine_or_swarm_risk_up"
  | "gnss_or_ais_interference"
  | "naval_presence_up"
  | "energy_supply_risk_up"
  | "diplomatic_deescalation"
  | "market_pricing_risk_premium"
  | "market_not_pricing_closure";

export type PricingPattern =
  | "not_pricing_hormuz"
  | "pricing_controlled_disruption"
  | "pricing_severe_disruption"
  | "pricing_closure_shock"
  | "mixed";

export type SourceFreshness =
  | "fresh"
  | "lagging"
  | "stale"
  | "missing"
  | "pending";

export type LicenseStatus = "open" | "restricted" | "pending" | "unknown";

export type EvidencePolarity = "support" | "counter" | "uncertain";
export type EvidenceConfidence = "low" | "medium" | "high";
export type EvidenceAffects = "scenario" | "target" | "market" | "watchlist";

// --- Scenario operational definitions ----------------------------------------

export type GuardrailReasonCode =
  | "no_verified_traffic_stop"
  | "no_official_avoidance"
  | "no_closure_style_market_shock";

export interface ScenarioGuardrail {
  scenarioId: ScenarioId;
  maxProbability: number;
  appliesWhenMissing: Array<
    | "verified_traffic_stop"
    | "official_avoidance"
    | "closure_style_market_shock"
  >;
  reasonCode: GuardrailReasonCode;
}

export interface CalibrationConfig {
  configId: string;
  scorerVersion: string;
  scenarioGuardrails: ScenarioGuardrail[];
}

export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  oneLineMeaning: string;
  triggerConditions: string[];
  exitConditions: string[];
  observableSignals: string[];
  marketSignature: string[];
  maxReasonableProbabilityWithoutTrafficStop?: number;
}

// --- Source / evidence -------------------------------------------------------

export interface SourceObservation {
  observationId: string;
  sourceId: string;
  observedAt?: string;
  publishedAt?: string;
  retrievedAt: string;
  sourceUrl?: string;
  sourceHash?: string;
  title: string;
  summary: string;
  freshness: SourceFreshness;
  licenseStatus: LicenseStatus;
}

export interface EvidenceQuality {
  sourceReliability: "high" | "medium" | "low";
  freshness: "fresh" | "lagging" | "stale";
  corroboration: "single_source" | "multi_source" | "conflicting";
  directness: "direct" | "proxy" | "context";
}

export interface EvidenceClaim {
  evidenceId: string;
  sourceObservationIds: string[];
  claim: string;
  polarity: EvidencePolarity;
  affects: EvidenceAffects[];
  mechanismTags: MechanismTag[];
  confidence: EvidenceConfidence;
  quality: EvidenceQuality;
  // Targets this evidence is structurally allowed to push.
  // Used by the deterministic updater + delta attribution.
  targetHints?: Array<{
    target: "scenario" | ForecastTarget;
    direction: "up" | "down" | "flat";
    weight: number; // 0..1; magnitude before quality weighting
  }>;
}

// --- Market read -------------------------------------------------------------

export interface MarketRead {
  title: string;
  summary: string;
  pricingPattern: PricingPattern;
  evidenceIds: string[];
  caveat: string;
  asOf: string;
}

// --- Target forecast + state -------------------------------------------------

export interface TargetForecast {
  target: ForecastTarget;
  horizon: ForecastHorizon;
  direction: ForecastDirection;
  confidence: number; // 0..1
  deltaLabel: string;
  rationale: string;
  // SourceRegistryEntry ids only; observation ids belong in sourceObservationIds.
  sourceIds: string[];
}

export interface ForecastState {
  scenarioDistribution: Record<ScenarioId, number>;
  targetForecasts: TargetForecast[];
}

// --- Delta attribution + guardrails + sensitivity ----------------------------

export interface DeltaAttribution {
  target: "scenario" | ForecastTarget;
  contributingEvidenceIds: string[];
  contributingMechanismTags: MechanismTag[];
  direction: "up" | "down" | "flat";
  magnitudeLabel?: string;
}

export interface AppliedGuardrail {
  scenarioId: ScenarioId;
  reasonCode: GuardrailReasonCode;
  cappedFrom: number;
  cappedTo: number;
}

export type SensitivityFailureMode =
  | "weaken_update"
  | "reverse_update"
  | "no_material_change";

export interface SensitivityItem {
  sensitivityId: string;
  target: "scenario" | ForecastTarget;
  statement: string;
  supportingEvidenceIds: string[];
  affectedMechanismTags: MechanismTag[];
  expectedFailureMode: SensitivityFailureMode;
}

export interface ForecastDelta {
  target: "scenario" | ForecastTarget;
  scenarioId?: ScenarioId;
  previous: number;
  current: number;
  direction: "up" | "down" | "flat";
}

// --- Forecast updater (pure function boundary) -------------------------------

export interface ForecastUpdateInput {
  previousState: ForecastState;
  sourceObservations: SourceObservation[];
  evidenceClaims: EvidenceClaim[];
  marketRead: MarketRead;
  scenarioDefinitions: ScenarioDefinition[];
  calibrationConfig: CalibrationConfig;
}

export interface ForecastUpdateOutput {
  currentState: ForecastState;
  deltas: ForecastDelta[];
  deltaAttribution: DeltaAttribution[];
  appliedGuardrails: AppliedGuardrail[];
  clampedTargets: Array<"scenario" | ForecastTarget>;
  sensitivity: SensitivityItem[];
  revisionReason: string;
}

// --- Checkpoint --------------------------------------------------------------

export interface ForecastCheckpoint {
  checkpointId: string;
  runId: string;
  writtenAt: string;
  revisionReason: string;
  previousScenario: Record<ScenarioId, number>;
  currentScenario: Record<ScenarioId, number>;
  reusedState: {
    activeEvidenceIds: string[];
    staleEvidenceIds: string[];
    pendingSourceIds: string[];
  };
  deltaAttribution: DeltaAttribution[];
  nextWatch: string[];
}

// --- Prediction record (point record emitted to galaxy / galaxy-selfevolve) --

export interface PredictionRecordScenarioDistribution {
  kind: "scenario_distribution";
  predictionId: string;
  caseId: "hormuz";
  runId: string;
  checkpointId: string;
  forecastedAt: string;
  horizon: ForecastHorizon;
  scenarioDistribution: Record<ScenarioId, number>;
  evidenceIds: string[];
  sourceObservationIds: string[];
  mechanismTags: MechanismTag[];
  status: "unresolved" | "resolved";
  resolvedAt?: string;
  resolvedOutcome?: ScenarioId;
  scorerVersion: string;
}

export interface PredictionRecordTargetProbability {
  kind: "target_probability";
  predictionId: string;
  caseId: "hormuz";
  runId: string;
  checkpointId: string;
  target: ForecastTarget;
  forecastedAt: string;
  horizon: ForecastHorizon;
  probability: number;
  evidenceIds: string[];
  sourceObservationIds: string[];
  mechanismTags: MechanismTag[];
  status: "unresolved" | "resolved";
  resolvedAt?: string;
  resolvedOutcome?: boolean;
  scorerVersion: string;
}

export interface PredictionRecordTargetDirection {
  kind: "target_direction";
  predictionId: string;
  caseId: "hormuz";
  runId: string;
  checkpointId: string;
  target: ForecastTarget;
  forecastedAt: string;
  horizon: ForecastHorizon;
  direction: ForecastDirection;
  confidence: number;
  evidenceIds: string[];
  sourceObservationIds: string[];
  mechanismTags: MechanismTag[];
  status: "unresolved" | "resolved";
  resolvedAt?: string;
  resolvedOutcome?: "up" | "down" | "flat";
  scorerVersion: string;
}

export type PredictionRecord =
  | PredictionRecordScenarioDistribution
  | PredictionRecordTargetProbability
  | PredictionRecordTargetDirection;
