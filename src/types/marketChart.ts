// Generated bundle schemas consumed by the background Overview, News, and Market pages.

import type { TimelineEvent, TimelineSeverity } from "./timeline";
import type { PolymarketQuestionRef } from "./polymarket";

export type HormuzTransitSourceId =
  | "imf-portwatch-hormuz"
  | "imo-hormuz-monthly";

export type HormuzTransitMetric =
  | "daily_transit_calls"
  | "monthly_avg_daily_transits";

export type HormuzVesselType =
  | "all"
  | "tanker"
  | "lng"
  | "container"
  | "dry_bulk"
  | "other";

export interface HormuzTransitObservation {
  source_id: HormuzTransitSourceId;
  metric: HormuzTransitMetric;
  vessel_type?: HormuzVesselType;
  date: string;
  value: number | null;
  direction?: "eastbound" | "westbound" | "both";
  window?: "daily" | "7d_avg" | "monthly" | "source_snapshot" | "chart_image_snapshot";
  source_url: string;
  retrieved_at: string;
  license_status: "open";
  caveat: string;
}

export interface HormuzBaselineFact {
  fact_id: string;
  value: string;
  unit: string;
  as_of: string;
  source_id: "eia-iea-hormuz";
  source_url: string;
  retrieved_at: string;
  cross_check_source_url?: string;
  caveat: string;
}

export type OverviewSeverity =
  | "quiet"
  | "routine"
  | "watch"
  | "elevated"
  | "severe";

export interface OverviewSnapshot {
  built_at: string;
  data_as_of: string;
  baseline: HormuzBaselineFact[];
  current_severity: OverviewSeverity;
  latest_events: TimelineEvent[];
  traffic_snapshot: {
    latest_date: string;
    latest_value: number | null;
    avg_7d: number | null;
    baseline_1y_same_window: number | null;
    delta_vs_baseline_pct: number | null;
    vessel_type: "all";
    source_id: "imf-portwatch-hormuz";
    retrieved_at: string;
    caveat: string;
  } | null;
  market_snapshot: Array<{
    target: string;
    label: string;
    value: number | null;
    unit: string;
    delta_1d?: number | null;
    delta_7d?: number | null;
    source_id: string;
    provider_id?: string;
    license_status?: "open" | "restricted" | "pending" | "unknown";
    source_url?: string | null;
    retrieved_at: string;
    status: "active" | "pending_source";
    caveat?: string;
  }>;
  polymarket_refs: PolymarketQuestionRef[];
}

export interface NewsTimelineBundle {
  built_at: string;
  data_as_of: string;
  source_event_count?: number;
  rendered_event_count?: number;
  candidate_count?: number;
  render_policy?: "core_events_preferred" | "all_events_fallback";
  candidate_policy?: "held_until_promoted";
  events: TimelineEvent[];
  source_index: Array<{
    source_id: string;
    source_name: string;
    source_type: TimelineEvent["source_type"];
    event_count: number;
  }>;
  topic_index: Array<{
    tag: string;
    event_count: number;
  }>;
  topic_cloud: Array<{
    key: string;
    label: string;
    event_count: number;
    weight: number;
    event_ids: string[];
    source_tags: string[];
  }>;
}

export type MarketChartGroup =
  | "energy"
  | "safe_haven_fx"
  | "risk_rates_vol"
  | "traffic";

export interface MarketChartPoint {
  date: string;
  value: number;
}

export interface MarketChartMissingPoint {
  date: string;
  reason: string;
}

export type MarketChartSurface =
  | "market_chart"
  | "overview_snapshot"
  | "coverage_only"
  | "hidden";

export interface TrafficBaselineMetadata {
  baseline_method: "same_calendar_window";
  baseline_window_days: number;
  baseline_lookback_years: number;
  baseline_n_obs: number;
  baseline_mean: number | null;
  baseline_std: number | null;
  latest_z_score: number | null;
}

export interface MarketRegimeOverlay {
  id: string;
  label: string;
  start_at: string;
  end_at: string | null;
  source_event_id: string;
  source_url: string;
  caveat: string;
}

export interface MarketChartBundle {
  built_at: string;
  data_as_of: string;
  series: Array<{
    id: string;
    target: string;
    label: string;
    group: MarketChartGroup;
    color: string;
    unit: string;
    status: "active" | "pending_source" | "candidate";
    source_id: string;
    provider_id?: string;
    license_status: "open" | "restricted" | "pending" | "unknown";
    source_url?: string | null;
    retrieved_at?: string;
    raw_path?: string | null;
    source_hash?: `sha256:${string}` | null;
    surface: MarketChartSurface;
    coverage_visible: boolean;
    reason_hidden?: string;
    provider_symbol?: string;
    field_used?: string;
    proxy_for?: string;
    not_equivalent_to?: string[];
    points: MarketChartPoint[];
    baseline_points?: MarketChartPoint[];
    baseline_metadata?: TrafficBaselineMetadata;
    missing_points?: MarketChartMissingPoint[];
    caveat: string;
    evidenceEligible: false;
  }>;
  event_overlays: Array<{
    event_id: string;
    event_at: string;
    title: string;
    severity_hint: TimelineSeverity;
    related_market_targets: TimelineEvent["related_market_targets"];
  }>;
  regime_overlays?: MarketRegimeOverlay[];
}
