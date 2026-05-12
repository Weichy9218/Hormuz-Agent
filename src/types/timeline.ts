// Schema for the background News timeline and GDELT candidate pool.

export type TimelineSeverity =
  | "routine"
  | "watch"
  | "elevated"
  | "severe"
  | "deescalation";

export type TimelineSourceType = "official" | "media" | "open-source";

export type TimelineMarketTarget =
  | "brent"
  | "wti"
  | "vix"
  | "broad_usd"
  | "usd_cny"
  | "us10y"
  | "sp500"
  | "nasdaq"
  | "traffic";

export interface TimelineEvent {
  event_id: string;
  event_at: string;
  title: string;
  description: string;
  source_type: TimelineSourceType;
  source_id: string;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  raw_path?: string | null;
  source_hash?: `sha256:${string}` | null;
  severity_hint: TimelineSeverity;
  geography?: string[];
  cross_check_source_urls?: string[];
  related_advisory_ids?: string[];
  related_candidate_ids?: string[];
  related_market_targets?: TimelineMarketTarget[];
  tags?: string[];
  curated_by?: string;
  curated_at?: string;
}

export type EventCandidateStatus = "candidate" | "promoted" | "rejected";

export interface EventCandidate {
  candidate_id: string;
  source_query: string;
  url: string;
  domain: string;
  title: string;
  seendate: string;
  language?: string;
  sourcecountry?: string;
  tone?: number;
  retrieved_at: string;
  status: EventCandidateStatus;
  promoted_event_id?: string;
  rejected_reason?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}
