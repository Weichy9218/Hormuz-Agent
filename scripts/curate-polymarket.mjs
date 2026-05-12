// Curate Polymarket external references. This writes local raw gamma-api
// snapshots and never feeds odds into EvidenceClaim, canonical_inputs, or
// forecast state.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const RETRIEVED_AT = new Date().toISOString();
const SAFE_RETRIEVED_AT = RETRIEVED_AT.replace(/[:.]/g, "-");
const ENDPOINT = "https://gamma-api.polymarket.com/events?limit=200&closed=false&order=volume24hr&ascending=false";
const TOPIC_ORDER = ["hormuz", "us_iran", "oil", "regional", "iran_domestic"];
const HUMAN_FIELDS = ["selected_for_overview", "caveat"];
const EXTERNAL_CAVEAT = "External market, not our forecast";
const TOPIC_RULES = {
  hormuz: ["hormuz", "strait of hormuz", "persian gulf", "gulf of oman", "bandar abbas"],
  us_iran: ["iran", "irgc", "revolutionary guard", "khamenei", "tehran", "iran-us", "us-iran", "iran sanctions", "jcpoa", "nuclear deal"],
  oil: ["brent", "wti", "opec", "crude oil", "oil price"],
  regional: ["israel", "houthi", "red sea", "saudi", "yemen"],
};

const paths = {
  external: resolve(root, "data", "external", "polymarket_questions.json"),
  rawDir: resolve(root, "data", "raw", "polymarket", "events"),
};

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function relativeRawPath(path) {
  return path.slice(root.length + 1);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fetchRawSnapshot() {
  await mkdir(paths.rawDir, { recursive: true });
  const rawPath = resolve(paths.rawDir, `${SAFE_RETRIEVED_AT}.json`);
  let response;
  let text = "";
  try {
    response = await fetch(ENDPOINT, {
      headers: { "user-agent": "hormuz-risk-interface polymarket curation" },
    });
    text = await response.text();
  } catch (error) {
    await writeFile(rawPath, JSON.stringify({ ok: false, fetch_error: error.message }, null, 2));
    throw new Error(`Polymarket fetch failed: ${error.message}`);
  }

  if (!response.ok) {
    await writeFile(rawPath, JSON.stringify({ ok: false, status: response.status, body: text }, null, 2));
    throw new Error(`Polymarket HTTP ${response.status}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    await writeFile(rawPath, JSON.stringify({ ok: false, parse_error: error.message, body: text }, null, 2));
    throw new Error(`Polymarket JSON parse failed: ${error.message}`);
  }

  await writeFile(rawPath, text);
  return {
    rawPath,
    rawHash: `sha256:${sha256(text)}`,
    events: Array.isArray(json) ? json : json.events ?? [],
  };
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseMaybeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function tagLabels(event) {
  return (event.tags ?? [])
    .map((tag) => tag.label ?? tag.name ?? tag.slug ?? tag)
    .filter(Boolean)
    .map(String);
}

function searchableText(event) {
  return [
    event.title,
    event.description,
    event.slug,
    ...tagLabels(event),
    ...(event.markets ?? []).flatMap((market) => [market.question, market.description, market.slug]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function topicTags(event) {
  const text = searchableText(event);
  return Object.entries(TOPIC_RULES)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([topic]) => topic);
}

function eventVolume24h(event) {
  const eventVolume = asNumber(event.volume24hr ?? event.volume_24hr ?? event.volume24h);
  if (eventVolume != null) return eventVolume;
  return (event.markets ?? []).reduce((sum, market) => sum + (asNumber(market.volume24hr ?? market.volume24h) ?? 0), 0);
}

function totalVolume(event) {
  const value = asNumber(event.volume ?? event.totalVolume ?? event.total_volume);
  if (value != null) return value;
  return (event.markets ?? []).reduce((sum, market) => sum + (asNumber(market.volume ?? market.totalVolume) ?? 0), 0);
}

function outcomesFromEvent(event) {
  const markets = Array.isArray(event.markets) ? event.markets : [];
  const flattened = [];
  for (const market of markets) {
    const names = parseMaybeArray(market.outcomes);
    const prices = parseMaybeArray(market.outcomePrices);
    const volumes = parseMaybeArray(market.outcomeVolumes ?? market.outcomeVolume);
    for (const [index, name] of names.entries()) {
      flattened.push({
        outcome_id: `${market.id ?? market.slug ?? "market"}:${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        last_price: asNumber(prices[index]),
        last_volume: asNumber(volumes[index] ?? market.volume),
      });
    }
  }
  if (flattened.length > 0) return flattened;
  return [
    { outcome_id: "yes", last_price: null, last_volume: null },
    { outcome_id: "no", last_price: null, last_volume: null },
  ];
}

function refFromEvent(event, topic_tags, rawPath, rawHash) {
  const markets = Array.isArray(event.markets) ? event.markets : [];
  const firstMarket = markets[0] ?? {};
  const description = event.description || firstMarket.description || "";
  const outcomes = outcomesFromEvent(event);
  return {
    question_id: event.slug,
    event_slug: event.slug,
    question_url: `https://polymarket.com/event/${event.slug}`,
    title: event.title || firstMarket.question || event.slug,
    description,
    resolution_criteria: description || firstMarket.resolutionSource || "See Polymarket event page for resolution criteria.",
    market_type: markets.length <= 1 && outcomes.length <= 2 ? "binary" : "categorical",
    outcomes,
    closes_at: event.endDate ?? firstMarket.endDate ?? null,
    total_volume_usd: totalVolume(event),
    tags: tagLabels(event),
    topic_tags,
    source: "polymarket",
    source_endpoint: "gamma-api/events",
    retrieved_at: RETRIEVED_AT,
    raw_path: relativeRawPath(rawPath),
    source_hash: rawHash,
    selected_for_overview: false,
    caveat: `${EXTERNAL_CAVEAT}; odds are external reference values only.`,
    _volume24h: eventVolume24h(event),
  };
}

function withHumanFields(ref, previous) {
  if (!previous) return ref;
  const merged = { ...ref };
  for (const field of HUMAN_FIELDS) {
    if (Object.hasOwn(previous, field)) merged[field] = previous[field];
  }
  if (!String(merged.caveat ?? "").includes(EXTERNAL_CAVEAT)) {
    merged.caveat = `${EXTERNAL_CAVEAT}; ${merged.caveat ?? "external reference only."}`;
  }
  return merged;
}

function preserveSelectedRef(previous, rawPath, rawHash) {
  return {
    ...previous,
    retrieved_at: RETRIEVED_AT,
    raw_path: relativeRawPath(rawPath),
    source_hash: rawHash,
    selected_for_overview: previous.selected_for_overview === true,
    caveat: String(previous.caveat ?? "").includes(EXTERNAL_CAVEAT)
      ? previous.caveat
      : `${EXTERNAL_CAVEAT}; ${previous.caveat ?? "external reference only."}`,
    outcomes: (previous.outcomes ?? []).map((outcome) => ({
      outcome_id: outcome.outcome_id,
      last_price: outcome.last_price ?? null,
      last_volume: outcome.last_volume ?? null,
    })),
    _volume24h: previous.total_volume_usd ?? 0,
  };
}

function sortRefs(refs) {
  return refs.sort((a, b) => {
    const aTopic = Math.min(...a.topic_tags.map((topic) => TOPIC_ORDER.indexOf(topic)).filter((index) => index >= 0));
    const bTopic = Math.min(...b.topic_tags.map((topic) => TOPIC_ORDER.indexOf(topic)).filter((index) => index >= 0));
    return aTopic - bTopic || (b._volume24h ?? 0) - (a._volume24h ?? 0) || a.question_id.localeCompare(b.question_id);
  });
}

async function main() {
  const previousRefs = await readJson(paths.external, []);
  const previousById = new Map(previousRefs.map((ref) => [ref.question_id, ref]));
  const { rawPath, rawHash, events } = await fetchRawSnapshot();

  const matched = events
    .map((event) => ({ event, topic_tags: topicTags(event) }))
    .filter((item) => item.event.slug && item.topic_tags.length > 0);
  if (matched.length < 50) {
    console.error(`curate:polymarket warning: only ${matched.length} events matched topic rules from limit=200; not raising limit automatically.`);
  }

  const selectedById = new Map();
  for (const topic of TOPIC_ORDER) {
    const topicRefs = matched
      .filter((item) => item.topic_tags.includes(topic))
      .sort((a, b) => eventVolume24h(b.event) - eventVolume24h(a.event))
      .slice(0, 5);
    for (const item of topicRefs) {
      if (selectedById.size >= 20) break;
      const ref = refFromEvent(item.event, item.topic_tags, rawPath, rawHash);
      selectedById.set(ref.question_id, withHumanFields(ref, previousById.get(ref.question_id)));
    }
  }

  for (const previous of previousRefs) {
    if (!previous.selected_for_overview || selectedById.has(previous.question_id)) continue;
    selectedById.set(previous.question_id, preserveSelectedRef(previous, rawPath, rawHash));
  }

  const outputRefs = sortRefs([...selectedById.values()])
    .slice(0, 20)
    .map(({ _volume24h, ...ref }) => ref);
  await mkdir(dirname(paths.external), { recursive: true });
  await writeFile(paths.external, `${JSON.stringify(outputRefs, null, 2)}\n`);

  const topics = new Map();
  for (const ref of outputRefs) {
    for (const topic of ref.topic_tags) topics.set(topic, (topics.get(topic) ?? 0) + 1);
  }
  console.log(
    `curate:polymarket raw_path=${relativeRawPath(rawPath)} matched=${matched.length} ` +
      `written=${outputRefs.length} topics=${JSON.stringify(Object.fromEntries(topics))}`,
  );
}

await main();
