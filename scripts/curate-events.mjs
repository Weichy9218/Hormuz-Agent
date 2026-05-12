// Curate Hormuz background events from official advisories and GDELT candidates.
// Failure semantics: each GDELT query is attempted independently; successful
// queries still update raw/candidate files. If any query fails, stderr lists the
// failed queries, registry gdelt-news.status becomes lagging (or missing if no
// query succeeded), and the process exits non-zero. Only all 8 successful queries
// flip gdelt-news.status to fresh.
import { createHash } from "node:crypto";
import https from "node:https";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const RETRIEVED_AT = new Date().toISOString();
const SAFE_RETRIEVED_AT = RETRIEVED_AT.replace(/[:.]/g, "-");
const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_MAX_RECORDS = "75";
const GDELT_TIMESPAN = "14d";
const GDELT_FETCH_ATTEMPTS = Number(process.env.GDELT_FETCH_ATTEMPTS ?? 3);
const GDELT_RETRY_DELAY_MS = 1500;
const GDELT_REQUEST_TIMEOUT_MS = Number(process.env.GDELT_REQUEST_TIMEOUT_MS ?? 60000);
const GDELT_QUERY_DELAY_MS = 3000;
const GDELT_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const GDELT_QUERIES = [
  { sourceQuery: "\"Strait of Hormuz\"" },
  { sourceQuery: "\"Hormuz\" AND (tanker OR vessel OR ship)" },
  { sourceQuery: "\"Hormuz\" AND (advisory OR incident OR attack)" },
  {
    sourceQuery: "IRGC OR \"Revolutionary Guard\" \"Hormuz\"",
    apiQuery: "(IRGC OR \"Revolutionary Guard\") \"Hormuz\"",
  },
  { sourceQuery: "\"Gulf of Oman\" AND (incident OR attack OR seized)" },
  { sourceQuery: "Iran \"US Navy\" \"Persian Gulf\"" },
  { sourceQuery: "\"Bandar Abbas\" AND (navy OR drill OR missile)" },
  { sourceQuery: "Iran sanctions oil export" },
];
const ALLOWLIST_DOMAINS = new Set([
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "aljazeera.com",
  "wsj.com",
  "ft.com",
  "state.gov",
  "defense.gov",
  "cnn.com",
  "bbc.co.uk",
  "nytimes.com",
]);
const OFFICIAL_DOMAINS = new Set(["state.gov", "defense.gov"]);

const args = new Set(process.argv.slice(2));
const autoPromote = args.has("--auto-promote");
const interactive = args.has("--interactive");
const gdeltOnly = args.has("--gdelt-only");

const paths = {
  advisories: resolve(root, "data", "normalized", "maritime", "advisories.jsonl"),
  candidates: resolve(root, "data", "events", "events_candidates.jsonl"),
  timeline: resolve(root, "data", "events", "events_timeline.jsonl"),
  registry: resolve(root, "data", "registry", "sources.json"),
};

function sha1(text) {
  return createHash("sha1").update(text).digest("hex");
}

function slugify(text, fallback = "item") {
  const slug = text
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function domainFromUrl(url) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length >= 3 && parts.at(-2) === "co" && parts.at(-1) === "uk") {
    return parts.slice(-3).join(".");
  }
  return parts.length >= 2 ? parts.slice(-2).join(".") : host;
}

function parseGdeltSeenDate(value) {
  const text = String(value ?? "").trim();
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/);
  if (compact) {
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = compact;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? RETRIEVED_AT : parsed.toISOString();
}

function truncateTitle(title) {
  return title.length <= 80 ? title : `${title.slice(0, 77)}...`;
}

function eventDatePrefix(isoLike) {
  return parseGdeltSeenDate(isoLike).slice(0, 10).replaceAll("-", "");
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readJsonLines(path) {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonLines(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(path, body ? `${body}\n` : "");
}

async function updateSourceStatus(id, status) {
  const registry = await readJson(paths.registry, []);
  const item = registry.find((source) => source.id === id);
  if (!item) throw new Error(`source registry missing ${id}`);
  if (item.status === status) return;
  item.status = status;
  await writeFile(paths.registry, `${JSON.stringify(registry, null, 2)}\n`);
}

function mirrorEventId(advisory) {
  return `evt-advisory-${slugify(advisory.advisory_id, "advisory")}`;
}

function advisoryEventAt(advisory) {
  return advisory.published_at ?? advisory.effective_from ?? advisory.retrieved_at ?? RETRIEVED_AT;
}

function mirrorAdvisoryToEvent(advisory) {
  const rawPath = advisory.raw_path ?? null;
  return {
    event_id: mirrorEventId(advisory),
    event_at: advisoryEventAt(advisory),
    title: truncateTitle(advisory.title ?? advisory.advisory_id),
    description:
      `${advisory.source_name} advisory snapshot for ${advisory.geography?.join(", ") || "Hormuz region"}. ` +
      "Entry is mirrored from the official advisory index for background timeline context only.",
    source_type: "official",
    source_id: "official-advisory",
    source_name: advisory.source_name,
    source_url: advisory.source_url,
    retrieved_at: advisory.retrieved_at,
    raw_path: rawPath,
    source_hash: rawPath ? (advisory.source_hash ?? null) : null,
    severity_hint: advisory.severity_hint ?? "watch",
    geography: advisory.geography ?? ["Strait of Hormuz"],
    cross_check_source_urls: [],
    related_advisory_ids: [advisory.advisory_id],
    related_market_targets: ["traffic"],
    tags: ["advisory", advisory.source_name?.toLowerCase()].filter(Boolean),
    curated_by: "curate-events.mjs",
    curated_at: RETRIEVED_AT,
  };
}

async function mirrorAdvisories() {
  const advisories = await readJsonLines(paths.advisories);
  const timeline = await readJsonLines(paths.timeline);
  const byAdvisoryId = new Set(
    timeline.flatMap((event) => event.related_advisory_ids ?? []),
  );
  const byEventId = new Set(timeline.map((event) => event.event_id));
  let added = 0;
  for (const advisory of advisories) {
    if (!advisory.advisory_id || byAdvisoryId.has(advisory.advisory_id)) continue;
    const event = mirrorAdvisoryToEvent(advisory);
    if (byEventId.has(event.event_id)) continue;
    timeline.push(event);
    byAdvisoryId.add(advisory.advisory_id);
    byEventId.add(event.event_id);
    added += 1;
  }
  timeline.sort((a, b) => String(b.event_at).localeCompare(String(a.event_at)));
  await writeJsonLines(paths.timeline, timeline);
  return added;
}

function gdeltUrl(query) {
  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    format: "JSON",
    maxrecords: GDELT_MAX_RECORDS,
    timespan: GDELT_TIMESPAN,
    sort: "DateDesc",
  });
  return `${GDELT_ENDPOINT}?${params.toString()}`;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function requestText(url) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = https.get(
      url,
      {
        family: 4,
        headers: { "user-agent": "hormuz-risk-interface event curation" },
        timeout: GDELT_REQUEST_TIMEOUT_MS,
      },
      (response) => {
        response.setEncoding("utf8");
        let text = "";
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolveRequest({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            text,
          });
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error(`request timed out after ${GDELT_REQUEST_TIMEOUT_MS}ms`));
    });
    request.on("error", rejectRequest);
  });
}

async function fetchTextWithRetry(url, label) {
  let lastError;
  let lastResult;
  for (let attempt = 1; attempt <= GDELT_FETCH_ATTEMPTS; attempt += 1) {
    try {
      lastResult = { ...(await requestText(url)), attempt };
      if (!GDELT_RETRY_STATUSES.has(lastResult.status) || attempt === GDELT_FETCH_ATTEMPTS) {
        return lastResult;
      }
      await sleep(GDELT_RETRY_DELAY_MS * attempt);
    } catch (error) {
      lastError = error;
      if (attempt < GDELT_FETCH_ATTEMPTS) {
        await sleep(GDELT_RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw new Error(`${label}: ${lastError?.message ?? "fetch failed"}`);
}

async function fetchGdeltQuery(query) {
  const sourceQuery = query.sourceQuery;
  const apiQuery = query.apiQuery ?? query.sourceQuery;
  const slug = slugify(sourceQuery, "query");
  if (process.env.CURATE_EVENTS_FAIL_QUERY === slug || process.env.CURATE_EVENTS_FAIL_QUERY === sourceQuery) {
    throw new Error(`simulated query failure for ${sourceQuery}`);
  }

  const { ok, status, text, attempt } = await fetchTextWithRetry(gdeltUrl(apiQuery), `GDELT ${sourceQuery}`);
  const rawDir = resolve(root, "data", "raw", "gdelt", slug);
  await mkdir(rawDir, { recursive: true });
  const rawPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}.json`);

  if (!ok) {
    await writeFile(rawPath, JSON.stringify({ ok: false, status, attempt, body: text }, null, 2));
    throw new Error(`GDELT ${sourceQuery}: HTTP ${status}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    await writeFile(rawPath, JSON.stringify({ ok: false, parse_error: error.message, attempt, body: text }, null, 2));
    throw new Error(`GDELT ${sourceQuery}: JSON parse failed: ${error.message}`);
  }

  await writeFile(rawPath, text);
  return { query: sourceQuery, slug, rawPath, json };
}

function candidateFromArticle(article, sourceQuery) {
  const url = article.url;
  if (!url) return null;
  let domain;
  try {
    domain = domainFromUrl(url);
  } catch {
    return null;
  }
  return {
    candidate_id: sha1(url).slice(0, 16),
    source_query: sourceQuery,
    url,
    domain,
    title: article.title ?? url,
    seendate: parseGdeltSeenDate(article.seendate ?? article.seenDate),
    language: article.language,
    sourcecountry: article.sourcecountry ?? article.sourceCountry,
    tone: Number.isFinite(Number(article.tone)) ? Number(article.tone) : undefined,
    retrieved_at: RETRIEVED_AT,
    status: "candidate",
  };
}

async function upsertCandidates(results) {
  const existing = await readJsonLines(paths.candidates);
  const byId = new Map(existing.map((candidate) => [candidate.candidate_id, candidate]));
  let added = 0;
  let updated = 0;

  for (const result of results) {
    const articles = Array.isArray(result.json.articles) ? result.json.articles : [];
    for (const article of articles) {
      const incoming = candidateFromArticle(article, result.query);
      if (!incoming) continue;
      const previous = byId.get(incoming.candidate_id);
      if (previous) {
        byId.set(incoming.candidate_id, {
          ...previous,
          source_query: previous.source_query || incoming.source_query,
          url: incoming.url,
          domain: incoming.domain,
          title: incoming.title,
          seendate: incoming.seendate,
          language: incoming.language,
          sourcecountry: incoming.sourcecountry,
          tone: incoming.tone,
          retrieved_at: incoming.retrieved_at,
          status: previous.status,
          promoted_event_id: previous.promoted_event_id,
          rejected_reason: previous.rejected_reason,
          reviewed_at: previous.reviewed_at,
          reviewed_by: previous.reviewed_by,
        });
        updated += 1;
      } else {
        byId.set(incoming.candidate_id, incoming);
        added += 1;
      }
    }
  }

  const rows = [...byId.values()].sort((a, b) =>
    String(b.seendate).localeCompare(String(a.seendate)) || a.candidate_id.localeCompare(b.candidate_id),
  );
  await writeJsonLines(paths.candidates, rows);
  return { rows, added, updated };
}

function inferSeverity(title) {
  if (/closed|sunk|fatal|missile strike|major attack/i.test(title)) return "severe";
  if (/attack|seized|boarding|missile|drone|mine|explosion/i.test(title)) return "elevated";
  return "watch";
}

function eventFromCandidate(candidate, severity, tags) {
  const words = candidate.title.split(/\s+/).slice(0, 6).join(" ");
  return {
    event_id: `evt-${eventDatePrefix(candidate.seendate)}-${slugify(words, "gdelt")}`,
    event_at: parseGdeltSeenDate(candidate.seendate),
    title: truncateTitle(candidate.title),
    description: `Media report discovered by GDELT for "${candidate.source_query}". Reviewer promotion records it as background timeline context only.`,
    source_type: OFFICIAL_DOMAINS.has(candidate.domain) ? "official" : "media",
    source_id: "gdelt-news",
    source_name: candidate.domain,
    source_url: candidate.url,
    retrieved_at: candidate.retrieved_at,
    raw_path: null,
    source_hash: null,
    severity_hint: severity,
    geography: ["Strait of Hormuz", "Persian Gulf", "Gulf of Oman"],
    cross_check_source_urls: [],
    related_candidate_ids: [candidate.candidate_id],
    related_market_targets: ["traffic"],
    tags,
    curated_by: autoPromote ? "curate-events.mjs:auto-promote" : "curate-events.mjs:interactive",
    curated_at: RETRIEVED_AT,
  };
}

async function promoteCandidates({ candidates, mode }) {
  const timeline = await readJsonLines(paths.timeline);
  const byEventId = new Set(timeline.map((event) => event.event_id));
  const byCandidateId = new Set(timeline.flatMap((event) => event.related_candidate_ids ?? []));
  let promoted = 0;

  for (const candidate of candidates) {
    if (candidate.status !== "candidate" || byCandidateId.has(candidate.candidate_id)) continue;
    const allowed = ALLOWLIST_DOMAINS.has(candidate.domain);
    if (mode === "auto" && !allowed) continue;

    let severity = inferSeverity(candidate.title);
    let tags = ["media", "gdelt", candidate.domain];
    if (mode === "interactive") {
      const rl = readline.createInterface({ input, output });
      const answer = (await rl.question(`Promote ${candidate.candidate_id} ${candidate.domain} "${candidate.title}"? [y/N] `)).trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        rl.close();
        continue;
      }
      const severityAnswer = (await rl.question("severity_hint [watch]: ")).trim();
      const tagsAnswer = (await rl.question("tags comma-separated [media,gdelt]: ")).trim();
      rl.close();
      if (["routine", "watch", "elevated", "severe", "deescalation"].includes(severityAnswer)) {
        severity = severityAnswer;
      }
      if (tagsAnswer) tags = tagsAnswer.split(",").map((tag) => tag.trim()).filter(Boolean);
    }

    const event = eventFromCandidate(candidate, severity, tags);
    if (byEventId.has(event.event_id)) continue;
    timeline.push(event);
    candidate.status = "promoted";
    candidate.promoted_event_id = event.event_id;
    candidate.reviewed_at = RETRIEVED_AT;
    candidate.reviewed_by = mode === "auto" ? "auto-promote" : "interactive";
    byEventId.add(event.event_id);
    byCandidateId.add(candidate.candidate_id);
    promoted += 1;
  }

  timeline.sort((a, b) => String(b.event_at).localeCompare(String(a.event_at)));
  await writeJsonLines(paths.timeline, timeline);
  await writeJsonLines(paths.candidates, candidates);
  return promoted;
}

async function main() {
  let mirrored = 0;
  if (!gdeltOnly) {
    mirrored = await mirrorAdvisories();
  }

  const successes = [];
  const failures = [];
  for (const query of GDELT_QUERIES) {
    if (successes.length + failures.length > 0) await sleep(GDELT_QUERY_DELAY_MS);
    try {
      successes.push(await fetchGdeltQuery(query));
    } catch (error) {
      failures.push({ query, error });
    }
  }

  const { rows: candidates, added, updated } = await upsertCandidates(successes);
  let promoted = 0;
  if (autoPromote) {
    promoted = await promoteCandidates({ candidates, mode: "auto" });
  } else if (interactive) {
    promoted = await promoteCandidates({ candidates, mode: "interactive" });
  }

  const status = failures.length === 0 ? "fresh" : successes.length > 0 ? "lagging" : "missing";
  await updateSourceStatus("gdelt-news", status);

  console.log(
    `curate:events mirrored=${mirrored} gdelt_success=${successes.length}/${GDELT_QUERIES.length} ` +
      `candidate_added=${added} candidate_updated=${updated} promoted=${promoted} gdelt_status=${status}`,
  );

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`curate:events failed query: ${failure.query.sourceQuery}: ${failure.error.message}`);
    }
    process.exitCode = 1;
  }
}

await main();
