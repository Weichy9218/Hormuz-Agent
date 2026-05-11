// Shared frontend types mirroring the forecast checkpoint contract.
export type SourceStatus = "fresh" | "lagging" | "missing";

export interface SignalSource {
  id: string;
  name: string;
  status: SourceStatus;
  detail: string;
}

export type SourceGroup =
  | "official"
  | "map"
  | "flow"
  | "market"
  | "news"
  | "agent"
  | "conflict"
  | "evaluation";
export type SourceReliability =
  | "source-of-truth"
  | "proxy"
  | "placeholder"
  | "reference";
export type SourceUseBoundary =
  | "structural_baseline"
  | "live_operational"
  | "market_benchmark"
  | "historical_backtest"
  | "pending";
export type ScenarioId =
  | "normal"
  | "controlled_disruption"
  | "severe_disruption"
  | "closure";

export interface SourceRegistryEntry {
  id: string;
  name: string;
  group: SourceGroup;
  status: SourceStatus;
  reliability: SourceReliability;
  boundary: SourceUseBoundary;
  refreshCadence: string;
  usage: string;
  caveat: string;
  url?: string;
  crossChecks?: string[];
}

export type EventSeverity = "stable" | "watch" | "elevated";

export interface EventItem {
  id: string;
  time: string;
  title: string;
  category: "news" | "diplomacy" | "maritime" | "flow" | "market";
  severity: EventSeverity;
  summary: string;
  effect: string;
}

export interface CoordinatePoint {
  lon: number;
  lat: number;
}

export interface MapCountry {
  name: string;
  rings: CoordinatePoint[][];
}

export interface ShippingLane {
  id: string;
  label: string;
  laneClass: "major" | "bypass";
  source: string;
  coordinates: CoordinatePoint[];
}

export interface MarketPoint {
  date: string;
  value: number;
}

export interface MarketSeries {
  id: string;
  label: string;
  unit: string;
  color: string;
  source: string;
  sourceUrl?: string;
  verifiedAt?: string;
  caveat?: string;
  points: MarketPoint[];
}

export interface DetailPage {
  id: "overview" | "map" | "market" | "forecast";
  label: string;
}

export interface Scenario {
  id: ScenarioId;
  label: string;
  color: string;
  posture: string;
}

export interface ScenarioProbabilities {
  normal: number;
  controlled_disruption: number;
  severe_disruption: number;
  closure: number;
}

export interface Checkpoint {
  id: string;
  label: string;
  time: string;
  forecast: ScenarioId;
  confidence: "low" | "med" | "high";
  probabilities: ScenarioProbabilities;
  revision: string;
  keyEvidence: string[];
  counterevidence: string[];
  unresolvedConcerns: string[];
}

export interface FlowMetric {
  id: string;
  label: string;
  value: string;
  unit: string;
  detail: string;
  tone: "info" | "warning" | "critical";
}

export interface DailyBrief {
  id: string;
  date: string;
  headline: string;
  riskLevel: "normal" | "elevated" | "critical";
  anomalies: string[];
  analystNote: string;
}
