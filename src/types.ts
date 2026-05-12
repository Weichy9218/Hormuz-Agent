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
  | "external_prediction"
  | "events"
  | "pending";
export type SourceReliability = "high" | "medium" | "low";
export type MarketProviderStatus =
  | "active"
  | "candidate_smoke_test"
  | "dev_crosscheck_only"
  | "licensed_pending"
  | "rejected";
export type MarketProviderLicenseStatus =
  | "open"
  | "token_required"
  | "public_terms_unclear"
  | "personal_research_only"
  | "licensed_required"
  | "licensed"
  | "restricted"
  | "pending"
  | "unknown";
export type MarketSeriesStatus = "active" | "pending_source" | "candidate";

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

export interface MarketProviderCandidate {
  provider_id: string;
  display_name: string;
  provider_status: MarketProviderStatus;
  license_status: MarketProviderLicenseStatus;
  target_ids: string[];
  allowed_use: "production_active" | "candidate_smoke_test" | "dev_crosscheck_only";
  promotion_gate: string[];
  caveat: string;
  url?: string;
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
  target?: string;
  label: string;
  unit: string;
  color: string;
  source: string;
  sourceId: string;
  sourceUrl?: string;
  verifiedAt?: string;
  retrieved_at?: string;
  raw_path?: string | null;
  source_hash?: string | null;
  provider_id?: string | null;
  provider_status?: MarketProviderStatus;
  license_status?: MarketProviderLicenseStatus;
  status?: MarketSeriesStatus;
  value?: number | null;
  evidenceEligible?: boolean;
  caveat?: string;
  pending?: boolean;
  candidate_provider_ids?: string[];
  contract_meta?: {
    target: string;
    vendor_symbol: string;
    contract_type: "spot" | "single_contract" | "continuous" | "main_continuous";
    roll_method: string;
    adjustment_method: "none" | "back_adjusted" | "ratio_adjusted" | "vendor";
    underlying_contract: string;
    mapping_source: string;
  };
  points: MarketPoint[];
}

export interface DetailPage {
  id: "overview" | "market" | "news" | "forecast";
  label: string;
}
