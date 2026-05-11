// Shared frontend types mirroring the forecast checkpoint contract.
export type SourceStatus = "fresh" | "lagging" | "missing" | "pending";

export interface SignalSource {
  id: string;
  name: string;
  status: SourceStatus;
  detail: string;
}

export type SourceGroup =
  | "official"
  | "market"
  | "maritime"
  | "conflict"
  | "news"
  | "pending";
export type SourceReliability = "high" | "medium" | "low";
export type ScenarioId =
  | "normal"
  | "controlled"
  | "severe"
  | "closure";

export interface SourceRegistryEntry {
  id: string;
  name: string;
  category: SourceGroup;
  status: SourceStatus;
  reliability: SourceReliability;
  refreshCadence: string;
  usage: string;
  caveat: string;
  pending: boolean;
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
  sourceId: string;
  sourceUrl?: string;
  verifiedAt?: string;
  caveat?: string;
  pending?: boolean;
  points: MarketPoint[];
}

export interface MarketRead {
  title: string;
  summary: string;
  supportsScenario: ScenarioId | "uncertain";
  evidenceIds: string[];
}

export interface DetailPage {
  id: "overview" | "market" | "forecast";
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
  controlled: number;
  severe: number;
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

export interface DailyBrief {
  id: string;
  date: string;
  headline: string;
  riskLevel: "normal" | "elevated" | "critical";
  anomalies: string[];
  analystNote: string;
}
