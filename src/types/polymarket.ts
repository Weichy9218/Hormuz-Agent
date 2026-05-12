// Schema for curated external prediction-market references.

export type PolymarketTopicTag =
  | "hormuz"
  | "us_iran"
  | "oil"
  | "iran_domestic"
  | "regional";

export interface PolymarketQuestionOutcome {
  outcome_id: string;
  last_price: number | null;
  last_volume?: number | null;
}

export interface PolymarketQuestionRef {
  question_id: string;
  event_slug: string;
  question_url: string;
  title: string;
  description: string;
  resolution_criteria: string;
  market_type: "binary" | "categorical";
  outcomes: PolymarketQuestionOutcome[];
  closes_at?: string | null;
  total_volume_usd?: number | null;
  tags: string[];
  topic_tags: PolymarketTopicTag[];
  source: "polymarket";
  source_endpoint: "gamma-api/events";
  retrieved_at: string;
  raw_path: string;
  source_hash?: `sha256:${string}` | null;
  selected_for_overview: boolean;
  caveat: string;
}
