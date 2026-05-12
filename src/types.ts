// UI-presentational types and source-registry types. Forecast business types
// live in src/types/forecast.ts and src/types/agentEvents.ts.
import type {
  LicenseStatus,
  SourceFreshness,
} from "./types/forecast";

export type { ScenarioId } from "./types/forecast";
export type SourceStatus = SourceFreshness;

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

export interface SourceRegistryEntry {
  id: string;
  name: string;
  category: SourceGroup;
  status: SourceStatus;
  reliability: SourceReliability;
  refreshCadence: string;
  expectedLatency: string;
  licenseStatus: LicenseStatus;
  usage: string;
  caveat: string;
  pending: boolean;
  url?: string;
  crossChecks?: string[];
}

export type EventSeverity = "stable" | "watch" | "elevated";

export interface NarrativeEvent {
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

export interface DetailPage {
  id: "overview" | "market" | "news" | "forecast";
  label: string;
}
