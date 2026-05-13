// Audits local data artifacts and spot-checks externally sourced FRED data.
// UI must read generated local data rather than remote APIs or scattered TS fixtures.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const dataUrl = new URL("../src/data.ts", import.meta.url);
const sourceRegistryUrl = new URL("../src/data/sourceRegistry.ts", import.meta.url);
const canonicalStoreUrl = new URL("../src/state/canonicalStore.ts", import.meta.url);
const normalizedFredUrl = new URL("../data/normalized/market/fred_series.csv", import.meta.url);
const fredMissingFixtureUrl = new URL("../data/fixtures/fred-missing-values.json", import.meta.url);
const generatedMarketUrl = new URL("../data/generated/market_series.json", import.meta.url);
const generatedMarketChartUrl = new URL("../data/generated/market_chart.json", import.meta.url);
const generatedOverviewUrl = new URL("../data/generated/overview_snapshot.json", import.meta.url);
const generatedNewsTimelineUrl = new URL("../data/generated/news_timeline.json", import.meta.url);
const eventsTimelineRawUrl = new URL("../data/events/events_timeline.jsonl", import.meta.url);
const eventsCandidatesUrl = new URL("../data/events/events_candidates.jsonl", import.meta.url);
const baselineUrl = new URL("../data/normalized/baseline/hormuz_baseline.json", import.meta.url);
const sourceRegistryJsonUrl = new URL("../data/registry/sources.json", import.meta.url);
const advisoriesUrl = new URL("../data/normalized/maritime/advisories.jsonl", import.meta.url);
const transitsUrl = new URL("../data/normalized/maritime/hormuz_transits.csv", import.meta.url);
const sourceObservationsUrl = new URL("../data/observations/source_observations.jsonl", import.meta.url);
const evidenceClaimsUrl = new URL("../data/evidence/evidence_claims.jsonl", import.meta.url);
const canonicalInputsUrl = new URL("../data/generated/canonical_inputs.json", import.meta.url);
const rawFredDir = resolve(root, "data/raw/fred");
const rawHashCache = new Map();
const backgroundSurfaceFiles = [
  resolve(root, "src/pages/OverviewPage.tsx"),
  resolve(root, "src/pages/MarketPage.tsx"),
  resolve(root, "src/pages/NewsPage.tsx"),
  resolve(root, "src/pages/NewsTimelinePage.tsx"),
];

const activeMarketChartRanges = {
  brent: { min: 1, max: 250 },
  wti: { min: 1, max: 250 },
  vix: { min: 1, max: 100 },
  broad_usd: { min: 50, max: 200 },
  us10y: { min: 0.1, max: 20 },
  sp500: { min: 100, max: 20000 },
  nasdaq: { min: 100, max: 50000 },
  us_cpi: { min: 100, max: 1000 },
  gold: { min: 100, max: 10000 },
  portwatch_daily_transit_calls_all: { min: 0, max: 500 },
  portwatch_7d_avg_transit_calls_all: { min: 0, max: 500 },
  portwatch_daily_transit_calls_tanker: { min: 0, max: 500 },
  portwatch_daily_transit_calls_container: { min: 0, max: 500 },
  portwatch_daily_transit_calls_dry_bulk: { min: 0, max: 500 },
  portwatch_daily_transit_calls_other: { min: 0, max: 500 },
};

const fredSeries = {
  DCOILBRENTEU: { label: "Brent spot", target: "brent" },
  DCOILWTICO: { label: "WTI spot", target: "wti" },
  VIXCLS: { label: "VIX", target: "vix" },
  DTWEXBGS: { label: "Broad USD", target: "broad_usd" },
  DEXCHUS: { label: "USD/CNY", target: "usd_cny" },
  DGS10: { label: "US10Y", target: "us10y" },
  SP500: { label: "S&P 500", target: "sp500" },
  NASDAQCOM: { label: "NASDAQ Composite", target: "nasdaq" },
  CPIAUCSL: { label: "US CPI", target: "us_cpi" },
};

const codeStructuralChecks = [
  {
    label: "Risk targets are forecast targets, not WarTrend enum",
    pattern: /regional_escalation_7d[\s\S]*?transit_disruption_7d[\s\S]*?state_on_state_strike_14d/,
    rationale: "War trend should be modeled as forecast targets.",
  },
  {
    label: "Canonical MarketRead uses pricingPattern",
    pattern: /\bcanonicalMarketRead\b[\s\S]*?\bMarketRead\b/,
    rationale: "MarketRead must expose pricingPattern (replaces supportsScenario).",
  },
];

const forbiddenPatterns = [
  { label: "supportsScenario field", pattern: /\bsupportsScenario\b/ },
  { label: "old scenario enum names", pattern: /\b(?<!pricing_)(controlled_disruption|severe_disruption)\b/ },
  { label: "WarTrend active contract", pattern: /WarTrendForecastTarget|war_trend/ },
  { label: "old market target names", pattern: /usd_broad|usdcny/ },
  { label: "legacy ForecastRunResponse", pattern: /\bForecastRunResponse\b/ },
];

function assertAlmostEqual(actual, expected, label) {
  const diff = Math.abs(Number(actual) - expected);
  if (diff > 0.005) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`JSONL line ${index + 1}: ${error.message}`);
    }
  });
}

async function fetchFredCsv(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`FRED request failed with ${response.status}`);
    }
    return parseFredCsvText(await response.text());
  } catch (error) {
    console.warn(`${seriesId}: FRED live check unavailable (${error.message}); using latest local raw snapshot.`);
    return readLatestRawFredCsv(seriesId);
  } finally {
    clearTimeout(timeout);
  }
}

function parseFredCsvText(text) {
  const rows = text.trim().split("\n").slice(1);
  return new Map(
    rows
      .map((line) => line.split(","))
      .filter(([date, value]) => date && value && value !== "."),
  );
}

function parseFredCsvTextPreserveEmpty(text) {
  const [headerLine, ...lines] = text.trimEnd().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}

async function readLatestRawFredCsv(seriesId) {
  const files = (await readdir(resolve(rawFredDir, seriesId)))
    .filter((file) => file.endsWith(".csv"))
    .sort();
  const latest = files.at(-1);
  if (!latest) throw new Error(`${seriesId}: no local raw FRED snapshot available.`);
  return parseFredCsvText(await readFile(resolve(rawFredDir, seriesId, latest), "utf8"));
}

async function hasRawSnapshot(seriesId) {
  try {
    const files = await readdir(resolve(rawFredDir, seriesId));
    return files.some((file) => file.endsWith(".csv"));
  } catch {
    return false;
  }
}

async function assertRawHash(record, label) {
  if (!record.raw_path) throw new Error(`${label}: missing raw_path`);
  if (!/^sha256:[0-9a-f]{64}$/.test(record.source_hash ?? "")) {
    throw new Error(`${label}: invalid source_hash ${record.source_hash}`);
  }
  let actual = rawHashCache.get(record.raw_path);
  if (!actual) {
    const rawBytes = await readFile(resolve(root, record.raw_path));
    actual = `sha256:${createHash("sha256").update(rawBytes).digest("hex")}`;
    rawHashCache.set(record.raw_path, actual);
  }
  if (actual !== record.source_hash) {
    throw new Error(`${label}: source_hash does not match ${record.raw_path}`);
  }
}

async function readTextIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function numericStrict(value) {
  const s = String(value ?? "").trim();
  if (!s || s === "." || s === "-" || /^nan$/i.test(s)) return null;
  const number = Number(s);
  return Number.isFinite(number) ? number : null;
}

function extractSourceIds(file) {
  return [...file.matchAll(/(?:id:|"id":)\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractReferencedSourceIds(file) {
  const ids = new Set();
  for (const match of file.matchAll(/sourceIds:\s*\[([^\]]*)\]/g)) {
    for (const idMatch of match[1].matchAll(/"([^"]+)"/g)) ids.add(idMatch[1]);
  }
  for (const match of file.matchAll(/sourceId:\s*"([^"]+)"/g)) ids.add(match[1]);
  for (const match of file.matchAll(/source_id":\s*"([^"]+)"/g)) ids.add(match[1]);
  return ids;
}

async function auditFredArtifacts(normalizedRows, generatedMarketSeries) {
  const rowsBySeries = new Map();
  for (const row of normalizedRows) {
    const config = fredSeries[row.series_id];
    if (!config) continue;
    if (numericStrict(row.value) == null && row.value !== "") {
      throw new Error(`${row.series_id} ${row.date}: unsupported missing token ${JSON.stringify(row.value)}`);
    }
    if (row.source_id !== "fred-market") {
      throw new Error(`${row.series_id} ${row.date}: source_id must be fred-market`);
    }
    if (row.target !== config.target) {
      throw new Error(`${row.series_id} ${row.date}: target ${row.target} does not match ${config.target}`);
    }
    if (row.license_status !== "open") {
      throw new Error(`${row.series_id} ${row.date}: license_status must be open`);
    }
    if (!row.retrieved_at || !row.source_url || !row.date) {
      throw new Error(`${row.series_id} ${row.date}: missing source_url/retrieved_at/date`);
    }
    if (!rowsBySeries.has(row.series_id)) rowsBySeries.set(row.series_id, []);
    rowsBySeries.get(row.series_id).push(row);
  }

  for (const [seriesId, config] of Object.entries(fredSeries)) {
    const rows = rowsBySeries.get(seriesId) ?? [];
    if (rows.length === 0) {
      throw new Error(`${seriesId}: no normalized rows in data/normalized/market/fred_series.csv`);
    }
    if (!(await hasRawSnapshot(seriesId))) {
      throw new Error(`${seriesId}: no raw CSV snapshot in data/raw/fred/${seriesId}`);
    }

    const retrievedAt = rows.find((row) => row.retrieved_at)?.retrieved_at;
    if (retrievedAt) {
      const rawPath = resolve(rawFredDir, seriesId, `${retrievedAt.replace(/[:.]/g, "-")}.csv`);
      const rawRows = parseFredCsvTextPreserveEmpty(await readFile(rawPath, "utf8"));
      const rawValueKey = seriesId;
      for (const rawRow of rawRows) {
        const rawValue = rawRow[rawValueKey] ?? rawRow.value ?? "";
        const rawDate = rawRow.observation_date ?? rawRow.DATE;
        const normalized = rows.find((row) => row.date === rawDate);
        if (numericStrict(rawValue) == null && normalized && String(normalized.value ?? "").trim() !== "" && Number(normalized.value) === 0) {
          throw new Error(`${seriesId} ${normalized.date}: FRED missing raw value must not normalize to 0.`);
        }
      }
    }

    const generated = generatedMarketSeries.find((series) => series.source === `FRED ${seriesId}`);
    if (!generated?.points?.length) {
      throw new Error(`${seriesId}: generated market_series.json has no display points`);
    }

    const normalizedByDate = new Map(rows.map((row) => [row.date, row.value]));
    for (const point of generated.points) {
      const normalizedValue = normalizedByDate.get(point.date);
      if (normalizedValue == null || normalizedValue === "") {
        throw new Error(`${seriesId}: generated point ${point.date} missing from normalized data`);
      }
      assertAlmostEqual(normalizedValue, point.value, `${config.label} generated ${point.date}`);
    }

    const upstream = await fetchFredCsv(seriesId);
    const latest = generated.points.at(-1);
    const upstreamValue = upstream.get(latest.date);
    if (!upstreamValue) throw new Error(`${seriesId}: upstream missing latest generated date ${latest.date}`);
    assertAlmostEqual(upstreamValue, latest.value, `${config.label} latest ${latest.date}`);
  }

  const cpiRows = rowsBySeries.get("CPIAUCSL") ?? [];
  const cpiMissing = cpiRows.find((row) => row.date === "2025-10-01");
  if (!cpiMissing || cpiMissing.value !== "") {
    throw new Error("CPIAUCSL 2025-10-01 fixture must remain an official empty value in normalized FRED rows.");
  }
}

function auditFredMissingFixture(fixture) {
  if (!Array.isArray(fixture?.missing_tokens) || fixture.missing_tokens.length === 0) {
    throw new Error("fred-missing-values fixture must define missing_tokens.");
  }
  for (const token of fixture.missing_tokens) {
    const value = Object.hasOwn(token, "raw") ? token.raw : undefined;
    if (numericStrict(value) !== null) {
      throw new Error(`fred-missing-values: ${token.label ?? JSON.stringify(value)} must parse as null.`);
    }
  }
  for (const token of fixture.valid_tokens ?? []) {
    const parsed = numericStrict(token.raw);
    if (parsed !== token.expected) {
      throw new Error(`fred-missing-values: ${token.raw} expected ${token.expected}, got ${parsed}.`);
    }
  }
}

function auditBaseline(baselineFacts) {
  const byId = new Map(baselineFacts.map((fact) => [fact.fact_id, fact]));
  const oilFlow = byId.get("oil-flow");
  const bypass = byId.get("bypass-capacity");
  const asiaExposure = byId.get("asia-exposure");
  const lngRelevance = byId.get("lng-relevance");
  const vessels = byId.get("vessels");

  if (oilFlow?.value !== "≈20" || oilFlow.source_id !== "eia-iea-hormuz") {
    throw new Error("oil-flow baseline must use rounded EIA/IEA structural source.");
  }
  if (bypass?.value !== "3.5–5.5" || bypass.source_id !== "eia-iea-hormuz") {
    throw new Error("bypass-capacity baseline must remain tied to eia-iea-hormuz.");
  }
  if (!asiaExposure || asiaExposure.source_id !== "eia-iea-hormuz") {
    throw new Error("asia-exposure baseline anchor must be present and tied to eia-iea-hormuz.");
  }
  if (!lngRelevance || lngRelevance.source_id !== "eia-iea-hormuz") {
    throw new Error("lng-relevance baseline anchor must be present and tied to eia-iea-hormuz.");
  }
  if (vessels?.value !== "待接入" || vessels.license_status !== "pending") {
    throw new Error("AIS vessel count must remain pending.");
  }

  for (const fact of baselineFacts) {
    if (!fact.source_id || !fact.retrieved_at || !fact.license_status || !fact.caveat) {
      throw new Error(`${fact.fact_id}: baseline fact missing source_id/retrieved_at/license_status/caveat`);
    }
  }
}

function auditSourceRegistry(sourceRegistry) {
  const byId = new Map(sourceRegistry.map((source) => [source.id, source]));
  const iea = byId.get("eia-iea-hormuz");
  if (!iea || iea.reliability !== "high" || iea.pending !== false) {
    throw new Error(
      "IEA source registry entry: The structural Hormuz baseline needs its own high-reliability registered source.",
    );
  }
  for (const sourceId of [
    "official-advisory",
    "imf-portwatch-hormuz",
    "imo-hormuz-monthly",
    "fred-market",
    "stooq-market",
  ]) {
    if (!byId.has(sourceId)) {
      throw new Error(`${sourceId}: P0 source missing from data/registry/sources.json`);
    }
  }
}

async function auditAdvisories(records) {
  if (records.length < 4) {
    throw new Error("advisories.jsonl must include UKMTO, MARAD alerts/advisories, and IMO snapshots.");
  }
  const sourceNames = new Set(records.map((record) => record.source_name));
  for (const sourceName of ["UKMTO", "MARAD", "IMO"]) {
    if (!sourceNames.has(sourceName)) {
      throw new Error(`advisories.jsonl missing ${sourceName} snapshot.`);
    }
  }

  const maradCandidates = records.filter(
    (record) => record.source_name === "MARAD" && record.event_type === "maritime_advisory",
  );
  if (maradCandidates.length === 0) {
    throw new Error("advisories.jsonl must include MARAD page-level advisory candidates.");
  }

  for (const record of records) {
    if (record.source_id !== "official-advisory") {
      throw new Error(`${record.advisory_id}: advisory source_id must be official-advisory.`);
    }
    if (!record.advisory_id || !record.title || !record.source_url || !record.retrieved_at) {
      throw new Error(`${record.advisory_id ?? "advisory"}: missing title/source_url/retrieved_at.`);
    }
    if (!["source_snapshot", "maritime_advisory"].includes(record.event_type)) {
      throw new Error(`${record.advisory_id}: advisory event_type must remain snapshot/candidate only.`);
    }
    if (!/candidate|snapshot|not forecast evidence|source health/i.test(record.caveat ?? "")) {
      throw new Error(`${record.advisory_id}: caveat must state snapshot/candidate evidence boundary.`);
    }
    await assertRawHash(record, record.advisory_id);
  }
}

async function auditTraffic(rows) {
  if (rows.length === 0) throw new Error("hormuz_transits.csv must not be empty.");

  const dailyRows = rows.filter((row) =>
    row.source_id === "imf-portwatch-hormuz" &&
    row.metric === "daily_transit_calls" &&
    row.window === "daily",
  );
  if (dailyRows.length < 30) {
    throw new Error("PortWatch normalized traffic must include at least 30 daily chokepoint observations.");
  }

  const dailyAllRows = dailyRows
    .filter((row) => (row.vessel_type || "all") === "all")
    .sort((a, b) => a.date.localeCompare(b.date));
  if (dailyAllRows.length < 2_000) {
    throw new Error(
      `PortWatch all-vessel daily history has only ${dailyAllRows.length} rows; pagination should cover the full ArcGIS layer.`,
    );
  }
  if (dailyAllRows[0]?.date > "2019-01-02") {
    throw new Error(
      `PortWatch all-vessel daily history starts at ${dailyAllRows[0]?.date}; expected coverage from 2019-01-01-ish.`,
    );
  }

  const dailyVesselTypes = new Set(dailyRows.map((row) => row.vessel_type || "all"));
  for (const vesselType of ["all", "tanker", "container", "dry_bulk"]) {
    if (!dailyVesselTypes.has(vesselType)) {
      throw new Error(`PortWatch daily traffic missing vessel_type=${vesselType} split.`);
    }
  }
  for (const row of dailyRows) {
    const vesselText = `${row.vessel_type ?? ""} ${row.metric ?? ""} ${row.caveat ?? ""}`;
    if (/\b(passenger|cruise)\b/i.test(vesselText)) {
      throw new Error(`PortWatch ${row.date}: daily endpoint has no passenger/cruise field; do not infer it.`);
    }
  }

  const manifestRow =
    dailyAllRows.find((row) => row.raw_path?.includes("merged")) ??
    dailyAllRows.find((row) => row.raw_path);
  if (!manifestRow) {
    throw new Error("PortWatch daily history missing merged raw manifest lineage.");
  }
  const manifest = JSON.parse(await readFile(resolve(root, manifestRow.raw_path), "utf8"));
  if ((manifest.expected_count ?? 0) > 0 && dailyAllRows.length < manifest.expected_count) {
    throw new Error(
      `PortWatch normalized all-vessel rows ${dailyAllRows.length} are below upstream count ${manifest.expected_count}.`,
    );
  }
  if ((manifest.expected_count ?? 0) > 1_000 && (!Array.isArray(manifest.pages) || manifest.pages.length < 2)) {
    throw new Error("PortWatch raw manifest shows a multi-page layer but does not record pagination pages.");
  }
  if (manifest.pages?.some((page) => page.exceededTransferLimit) && dailyAllRows.length < (manifest.expected_count ?? 0)) {
    throw new Error("PortWatch daily layer exceeded transfer limit, but normalized rows did not reach expected_count.");
  }
  if (manifest.stats?.min_date && dailyAllRows[0]?.date > manifest.stats.min_date) {
    throw new Error(
      `PortWatch normalized min date ${dailyAllRows[0]?.date} is later than raw stats min_date ${manifest.stats.min_date}.`,
    );
  }
  if (manifest.stats?.max_date && dailyAllRows.at(-1)?.date < manifest.stats.max_date) {
    throw new Error(
      `PortWatch normalized max date ${dailyAllRows.at(-1)?.date} is earlier than raw stats max_date ${manifest.stats.max_date}.`,
    );
  }

  for (const row of dailyRows) {
    if (!Number.isFinite(Number(row.value))) {
      throw new Error(`PortWatch ${row.date}: daily_transit_calls must be numeric.`);
    }
    if (!/chokepoint6|Strait of Hormuz/i.test(row.caveat)) {
      throw new Error(`PortWatch ${row.date}: caveat must identify chokepoint6 / Strait of Hormuz.`);
    }
    if (!/AIS\/GNSS|AIS/i.test(row.caveat)) {
      throw new Error(`PortWatch ${row.date}: caveat must preserve AIS/GNSS limitation.`);
    }
  }

  const sourceSnapshots = rows.filter((row) => row.window === "source_snapshot");
  if (sourceSnapshots.length < 3) {
    throw new Error("traffic CSV must include source_snapshot rows for PortWatch page/download and IMO page.");
  }

  const imoChartRows = rows.filter((row) =>
    row.source_id === "imo-hormuz-monthly" && row.window === "chart_image_snapshot",
  );
  if (imoChartRows.length === 0) {
    throw new Error("traffic CSV must include IMO chart image snapshots.");
  }
  if (imoChartRows.some((row) => row.value !== "")) {
    throw new Error("IMO chart image snapshots must not pretend to be numeric observations.");
  }

  for (const row of rows) {
    if (!row.source_id || !row.metric || !row.source_url || !row.retrieved_at || !row.license_status) {
      throw new Error(`traffic row ${row.date}: missing required source fields.`);
    }
    await assertRawHash(row, `${row.source_id}:${row.metric}:${row.date}:${row.window}`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function auditGeneratedCanonicalArtifacts({ observations, evidenceClaims, canonicalInputs, sourceRegistry }) {
  const sourceIds = new Set(sourceRegistry.map((source) => source.id));
  const observationIds = new Set();
  for (const observation of observations) {
    if (!observation.observationId || !observation.sourceId || !observation.retrievedAt || !observation.title) {
      throw new Error(`${observation.observationId ?? "SourceObservation"}: missing required fields.`);
    }
    if (observationIds.has(observation.observationId)) {
      throw new Error(`${observation.observationId}: duplicate SourceObservation id.`);
    }
    observationIds.add(observation.observationId);
    if (!sourceIds.has(observation.sourceId)) {
      throw new Error(`${observation.observationId}: sourceId ${observation.sourceId} missing from registry.`);
    }
    if (observation.sourceHash && !/^sha256:[0-9a-f]{64}$/.test(observation.sourceHash)) {
      throw new Error(`${observation.observationId}: invalid sourceHash ${observation.sourceHash}.`);
    }
  }

  const evidenceIds = new Set();
  for (const claim of evidenceClaims) {
    if (!claim.evidenceId || !claim.claim || !Array.isArray(claim.sourceObservationIds) || claim.sourceObservationIds.length === 0) {
      throw new Error(`${claim.evidenceId ?? "EvidenceClaim"}: missing claim/sourceObservationIds.`);
    }
    if (evidenceIds.has(claim.evidenceId)) {
      throw new Error(`${claim.evidenceId}: duplicate EvidenceClaim id.`);
    }
    evidenceIds.add(claim.evidenceId);
    for (const observationId of claim.sourceObservationIds) {
      if (!observationIds.has(observationId)) {
        throw new Error(`${claim.evidenceId}: references unknown SourceObservation ${observationId}.`);
      }
    }

    const claimSourceIds = new Set(
      claim.sourceObservationIds
        .map((observationId) => observations.find((observation) => observation.observationId === observationId)?.sourceId)
        .filter(Boolean),
    );
    if (claimSourceIds.has("imf-portwatch-hormuz")) {
      if (claim.polarity === "support" && claim.mechanismTags?.includes("traffic_flow_down")) {
        throw new Error(`${claim.evidenceId}: PortWatch daily rows cannot support traffic_flow_down before metric definition verification.`);
      }
      if (!/daily_transit_calls/.test(claim.claim) || !/60 7d avg/.test(claim.claim)) {
        throw new Error(`${claim.evidenceId}: PortWatch evidence must state daily_transit_calls vs 60 7d avg boundary.`);
      }
    }
  }

  if (canonicalInputs.schemaVersion !== "hormuz-local-canonical-inputs/v1") {
    throw new Error(`canonical_inputs.json: invalid schemaVersion ${canonicalInputs.schemaVersion}.`);
  }
  if (stableJson(canonicalInputs.sourceObservations) !== stableJson(observations)) {
    throw new Error("canonical_inputs.json sourceObservations must match data/observations/source_observations.jsonl.");
  }
  if (stableJson(canonicalInputs.evidenceClaims) !== stableJson(evidenceClaims)) {
    throw new Error("canonical_inputs.json evidenceClaims must match data/evidence/evidence_claims.jsonl.");
  }
  if (!canonicalInputs.marketRead || canonicalInputs.marketRead.pricingPattern !== "mixed") {
    throw new Error("canonical_inputs.json marketRead must expose pricingPattern=mixed for current local bundle.");
  }
  for (const evidenceId of canonicalInputs.marketRead.evidenceIds ?? []) {
    if (!evidenceIds.has(evidenceId)) {
      throw new Error(`canonical_inputs.json marketRead references unknown evidence ${evidenceId}.`);
    }
  }
}

function auditLocalCode(dataFile, sourceRegistryFile, canonicalStoreFile, sourceRegistry, generatedMarketSeries, baselineFacts) {
  const combinedFiles = `${dataFile}\n${sourceRegistryFile}\n${canonicalStoreFile}`;
  for (const check of codeStructuralChecks) {
    if (!check.pattern.test(combinedFiles)) {
      throw new Error(`${check.label}: local data check failed. ${check.rationale}`);
    }
  }
  for (const check of forbiddenPatterns) {
    if (check.pattern.test(combinedFiles)) {
      throw new Error(`${check.label}: forbidden legacy contract text found.`);
    }
  }

  if (!/generatedMarketSeries/.test(dataFile)) {
    throw new Error("src/data.ts must import generated market_series.json instead of hardcoding FRED points.");
  }
  if (!/localCanonicalInputs/.test(canonicalStoreFile)) {
    throw new Error("src/state/canonicalStore.ts must consume data/generated/canonical_inputs.json.");
  }

  const registeredSourceIds = new Set([
    ...sourceRegistry.map((source) => source.id),
    ...extractSourceIds(sourceRegistryFile),
  ]);
  const referencedSourceIds = extractReferencedSourceIds(
    `${dataFile}\n${canonicalStoreFile}\n${JSON.stringify(generatedMarketSeries)}\n${JSON.stringify(baselineFacts)}`,
  );
  for (const sourceId of referencedSourceIds) {
    if (registeredSourceIds.has(sourceId)) continue;
    if (/(market|advisory|conflict|news|pending|baseagent|natural-earth|shipping|hormuz|ged|ucdp|portwatch)/.test(sourceId)) {
      throw new Error(`${sourceId}: referenced source id is missing from sourceRegistry.ts`);
    }
  }

  const expectedPendingSourceIds = [
    "crude-futures-pending",
    "gold-pending",
    "silver-pending",
    "usdcnh-pending",
    "hstech-pending",
    "shanghai-composite-pending",
  ];
  const pendingSeries = generatedMarketSeries.filter((series) => series.pending);
  const pendingSourceIds = new Set(pendingSeries.map((series) => series.sourceId));
  for (const sourceId of expectedPendingSourceIds) {
    if (!pendingSourceIds.has(sourceId)) {
      throw new Error(`${sourceId}: expected pending market row is missing from generated market_series.json.`);
    }
  }
  if (pendingSeries.some((series) => series.points.length > 0 || !series.caveat)) {
    throw new Error("Pending market rows must have no points and must carry caveats.");
  }
}

async function auditGeneratedMarketChart(bundle, timelineBundle) {
  if (!bundle || !Array.isArray(bundle.series)) {
    throw new Error("market_chart.json must expose a series array.");
  }

  const allowedSurfaces = new Set(["market_chart", "overview_snapshot", "coverage_only", "hidden"]);
  const timelineEventsById = new Map((timelineBundle?.events ?? []).map((event) => [event.event_id, event]));
  const seriesByTarget = new Map(bundle.series.map((series) => [series.target, series]));
  const usdCny = seriesByTarget.get("usd_cny");
  if (!usdCny || usdCny.surface !== "hidden" || usdCny.coverage_visible !== false || usdCny.status !== "active") {
    throw new Error("USD/CNY must remain as hidden active lineage, not a visible Market series.");
  }
  const usdCnh = seriesByTarget.get("usd_cnh");
  if (!usdCnh || usdCnh.surface !== "hidden" || usdCnh.coverage_visible !== false || usdCnh.status !== "pending_source") {
    throw new Error("USD/CNH must remain hidden pending lineage until a valid offshore source is connected.");
  }

  for (const series of bundle.series) {
    if (!allowedSurfaces.has(series.surface)) {
      throw new Error(`${series.id ?? series.target}: invalid surface ${series.surface}`);
    }
    if (typeof series.coverage_visible !== "boolean") {
      throw new Error(`${series.id ?? series.target}: coverage_visible must be boolean.`);
    }
    if (series.surface === "hidden" && series.coverage_visible !== false) {
      throw new Error(`${series.id ?? series.target}: hidden series cannot be coverage_visible.`);
    }
    if (series.surface === "hidden" && series.target !== "usd_cny" && ((series.points?.length ?? 0) > 0 || series.status === "active")) {
      throw new Error(`${series.id ?? series.target}: hidden non-lineage series cannot be active or carry points.`);
    }
    if (series.evidenceEligible !== false) {
      throw new Error(`${series.id ?? series.target}: market_chart series evidenceEligible must be false.`);
    }
    if (
      series.status === "pending_source" &&
      ((series.points?.length ?? 0) > 0 || (series.value !== undefined && series.value !== null))
    ) {
      throw new Error(`${series.id ?? series.target}: pending market_chart series must not contain values or points.`);
    }
    if (series.status === "pending_source" && series.coverage_visible === true && series.surface !== "coverage_only") {
      throw new Error(`${series.id ?? series.target}: pending_source coverage visibility must be explicit coverage_only.`);
    }

    if (series.status === "active") {
      for (const field of [
        "source_id",
        "provider_id",
        "license_status",
        "retrieved_at",
        "source_url",
        "raw_path",
        "source_hash",
        "caveat",
      ]) {
        if (!series[field]) throw new Error(`${series.id ?? series.target}: active market_chart row missing ${field}`);
      }
      await assertRawHash(series, `${series.id ?? series.target}:market_chart`);

      const range = activeMarketChartRanges[series.target];
      if (range) {
        for (const point of series.points ?? []) {
          if (!Number.isFinite(Number(point.value))) {
            throw new Error(`${series.id}:${point.date}: point value must be finite.`);
          }
          if (point.value < range.min || point.value > range.max) {
            throw new Error(
              `${series.id}:${point.date}: value ${point.value} outside sanity range ${range.min}..${range.max}.`,
            );
          }
        }
      }
    }

    if (series.baseline_points && series.baseline_points.length > 0) {
      if (series.group !== "traffic" || series.source_id !== "imf-portwatch-hormuz") {
        throw new Error(
          `${series.id ?? series.target}: baseline_points are only allowed on PortWatch traffic series.`,
        );
      }
      if (!/portwatch/i.test(`${series.id ?? ""} ${series.target ?? ""} ${series.label ?? ""}`)) {
        throw new Error(
          `${series.id ?? series.target}: PortWatch baseline_points must stay attached to a PortWatch traffic row.`,
        );
      }
      await assertRawHash(series, `${series.id ?? series.target}:market_chart`);
      const meta = series.baseline_metadata;
      if (!meta || meta.baseline_method !== "same_calendar_window") {
        throw new Error(`${series.id ?? series.target}: traffic baseline_points require same_calendar_window metadata.`);
      }
      for (const field of [
        "baseline_window_days",
        "baseline_lookback_years",
        "baseline_n_obs",
        "baseline_mean",
        "baseline_std",
        "latest_z_score",
      ]) {
        if (meta[field] === undefined) {
          throw new Error(`${series.id ?? series.target}: baseline_metadata missing ${field}.`);
        }
      }
      if (meta.baseline_window_days !== 31 || meta.baseline_lookback_years !== 1) {
        throw new Error(`${series.id ?? series.target}: unexpected traffic baseline window metadata.`);
      }
      if (!Number.isFinite(Number(meta.baseline_n_obs)) || meta.baseline_n_obs <= 0) {
        throw new Error(`${series.id ?? series.target}: baseline_n_obs must be positive.`);
      }
    }

    if (series.target === "us_cpi") {
      const cpiMissing = series.missing_points ?? [];
      if (cpiMissing.length !== 1 || cpiMissing[0].date !== "2025-10-01" || cpiMissing[0].reason !== "official_missing") {
        throw new Error("us-cpi: must expose exactly the official 2025-10-01 missing marker.");
      }
      if ((series.points ?? []).some((point) => point.date === "2025-10-01")) {
        throw new Error("us-cpi: 2025-10-01 official missing value must not appear in points.");
      }
    } else if ((series.missing_points?.length ?? 0) > 0) {
      throw new Error(`${series.id}: missing_points are only expected on sparse FRED CPI for this bundle.`);
    }

    if (series.status === "active" && series.target === "gold") {
      if (series.id !== "gold-spot") {
        throw new Error(`${series.id ?? series.target}: active Gold market_chart series must use id=gold-spot.`);
      }
      if (series.source_id !== "stooq-market" || series.provider_id !== "stooq") {
        throw new Error(`${series.id}: active Gold must use stooq-market / stooq lineage.`);
      }
      if (series.license_status !== "open") {
        throw new Error(`${series.id}: active Gold license_status must be open.`);
      }
      if ((series.points?.length ?? 0) < 200) {
        throw new Error(`${series.id}: Stooq Gold history must expose at least 200 daily points.`);
      }
      if (
        series.provider_symbol !== "xauusd" ||
        series.field_used !== "Close" ||
        series.proxy_for !== "gold_spot_usd_per_oz" ||
        !Array.isArray(series.not_equivalent_to) ||
        !series.not_equivalent_to.includes("LBMA Gold Price") ||
        !series.not_equivalent_to.includes("COMEX futures continuous contract")
      ) {
        throw new Error(`${series.id}: Gold proxy lineage fields are incomplete.`);
      }
      if (!/Stooq XAU\/USD daily OHLC/i.test(series.caveat ?? "") || !/not an LBMA benchmark/i.test(series.caveat ?? "")) {
        throw new Error(`${series.id}: Gold caveat must state Stooq XAU/USD daily OHLC and not an LBMA benchmark.`);
      }
      await assertRawHash(series, `${series.id}:market_chart`);
    }
  }

  for (const overlay of bundle.regime_overlays ?? []) {
    for (const field of ["id", "label", "start_at", "source_event_id", "source_url", "caveat"]) {
      if (!overlay[field]) throw new Error(`regime_overlays: ${overlay.id ?? "overlay"} missing ${field}`);
    }
    const event = timelineEventsById.get(overlay.source_event_id);
    if (!event) {
      throw new Error(`${overlay.id}: regime overlay source_event_id missing from news_timeline events.`);
    }
    if (event.source_url !== overlay.source_url) {
      throw new Error(`${overlay.id}: regime overlay source_url must match its timeline event.`);
    }
    if (!(event.related_market_targets ?? []).includes("traffic")) {
      throw new Error(`${overlay.id}: regime overlay source event must be traffic-related.`);
    }
    if (/forecast|scenario|pricingPattern/i.test(overlay.caveat)) {
      throw new Error(`${overlay.id}: regime overlay caveat must not introduce forecast/scenario interpretation.`);
    }
  }
}

function auditGeneratedOverviewSnapshot(bundle, marketChartBundle) {
  if (!bundle || !Array.isArray(bundle.market_snapshot)) {
    throw new Error("overview_snapshot.json must expose market_snapshot.");
  }
  const goldChart = marketChartBundle.series.find((series) => series.target === "gold" && series.status === "active");
  const goldSnapshot = bundle.market_snapshot.find((item) => item.target === "gold");
  if (!goldSnapshot) {
    throw new Error("overview_snapshot market_snapshot must include gold.");
  }
  for (const item of bundle.market_snapshot) {
    for (const field of ["source_id", "provider_id", "license_status", "retrieved_at", "caveat"]) {
      if (!item[field]) throw new Error(`overview_snapshot ${item.target}: missing ${field}.`);
    }
    if (item.status === "active" && !item.source_url) {
      throw new Error(`overview_snapshot ${item.target}: active market snapshot row missing source_url.`);
    }
  }
  if (goldChart) {
    const latestGold = goldChart.points?.at(-1);
    if (
      goldSnapshot.status !== "active" ||
      goldSnapshot.source_id !== goldChart.source_id ||
      goldSnapshot.provider_id !== goldChart.provider_id ||
      goldSnapshot.value !== latestGold?.value
    ) {
      throw new Error("overview_snapshot gold must mirror the active Stooq Gold proxy from market_chart.");
    }
    if (!/Stooq XAU\/USD/i.test(goldSnapshot.caveat ?? "")) {
      throw new Error("overview_snapshot gold caveat must preserve Stooq XAU/USD proxy lineage.");
    }
  }
  const usdCnh = bundle.market_snapshot.find((item) => item.target === "usd_cnh");
  if (!usdCnh || usdCnh.status !== "pending_source" || usdCnh.source_id !== "usdcnh-pending") {
    throw new Error("overview_snapshot USD/CNH must remain pending_source.");
  }
}

async function auditNoHardcodedBackgroundRegimeDates() {
  const forbidden = /\b(?:2026-02-28|2026-04-18)\b|stressWindowStart|structureStartMs/;
  for (const file of backgroundSurfaceFiles) {
    const text = await readTextIfExists(file);
    if (!text) continue;
    if (forbidden.test(text)) {
      throw new Error(`${relative(root, file)}: background surfaces must not hardcode regime/closure shading dates.`);
    }
  }
}

function auditGeneratedNewsTimeline(bundle, rawTimelineEvents, eventCandidates) {
  if (!bundle || !Array.isArray(bundle.events)) {
    throw new Error("news_timeline.json must expose an events array.");
  }
  if (!Number.isInteger(bundle.source_event_count) || bundle.source_event_count !== rawTimelineEvents.length) {
    throw new Error(
      `news_timeline.json source_event_count must match events_timeline.jsonl (${rawTimelineEvents.length}).`,
    );
  }
  if (!Number.isInteger(bundle.rendered_event_count) || bundle.rendered_event_count !== bundle.events.length) {
    throw new Error("news_timeline.json rendered_event_count must match rendered events length.");
  }
  if (!Number.isInteger(bundle.candidate_count) || bundle.candidate_count !== eventCandidates.length) {
    throw new Error(
      `news_timeline.json candidate_count must match events_candidates.jsonl (${eventCandidates.length}).`,
    );
  }
  if (!["core_events_preferred", "all_events_fallback"].includes(bundle.render_policy)) {
    throw new Error("news_timeline.json render_policy must explain why not all raw timeline rows render.");
  }
  if (bundle.candidate_policy !== "held_until_promoted") {
    throw new Error("news_timeline.json candidate_policy must keep GDELT candidates out of rendered pages.");
  }
  if (!Array.isArray(bundle.topic_cloud) || bundle.topic_cloud.length === 0) {
    throw new Error("news_timeline.json must expose a non-empty topic_cloud.");
  }
  const lowInformationKeys = new Set(["core_event", "hormuz", "iran"]);
  for (const term of bundle.topic_cloud) {
    if (!term.key || !term.label || !Number.isFinite(Number(term.weight))) {
      throw new Error("topic_cloud term missing key/label/weight.");
    }
    if (term.weight < 0 || term.weight > 1) {
      throw new Error(`${term.key}: topic_cloud weight must be normalized to 0..1.`);
    }
    if (!Array.isArray(term.event_ids) || term.event_ids.length === 0) {
      throw new Error(`${term.key}: topic_cloud term must carry event_ids for filtering.`);
    }
    if (!Array.isArray(term.source_tags)) {
      throw new Error(`${term.key}: topic_cloud term must carry folded source_tags.`);
    }
    if (lowInformationKeys.has(term.key)) {
      throw new Error(`${term.key}: topic_cloud must not render low-information global tags.`);
    }
  }

  const topTerm = [...bundle.topic_cloud].sort((a, b) => b.weight - a.weight)[0];
  if (topTerm && lowInformationKeys.has(topTerm.key)) {
    throw new Error(`${topTerm.key}: topic_cloud top term is a low-information global tag.`);
  }
}

const dataFile = await readFile(dataUrl, "utf8");
const sourceRegistryFile = await readFile(sourceRegistryUrl, "utf8");
const canonicalStoreFile = await readFile(canonicalStoreUrl, "utf8");
const normalizedRows = parseCsv(await readFile(normalizedFredUrl, "utf8"));
const fredMissingFixture = JSON.parse(await readFile(fredMissingFixtureUrl, "utf8"));
const generatedMarketSeries = JSON.parse(await readFile(generatedMarketUrl, "utf8"));
const generatedMarketChart = JSON.parse(await readFile(generatedMarketChartUrl, "utf8"));
const generatedOverview = JSON.parse(await readFile(generatedOverviewUrl, "utf8"));
const generatedNewsTimeline = JSON.parse(await readFile(generatedNewsTimelineUrl, "utf8"));
const rawTimelineEvents = parseJsonl(await readFile(eventsTimelineRawUrl, "utf8"));
const eventCandidates = parseJsonl(await readFile(eventsCandidatesUrl, "utf8"));
const baselineFacts = JSON.parse(await readFile(baselineUrl, "utf8"));
const sourceRegistry = JSON.parse(await readFile(sourceRegistryJsonUrl, "utf8"));
const advisoryRecords = parseJsonl(await readFile(advisoriesUrl, "utf8"));
const transitRows = parseCsv(await readFile(transitsUrl, "utf8"));
const sourceObservations = parseJsonl(await readFile(sourceObservationsUrl, "utf8"));
const evidenceClaims = parseJsonl(await readFile(evidenceClaimsUrl, "utf8"));
const canonicalInputs = JSON.parse(await readFile(canonicalInputsUrl, "utf8"));

await auditFredArtifacts(normalizedRows, generatedMarketSeries);
auditFredMissingFixture(fredMissingFixture);
auditBaseline(baselineFacts);
auditSourceRegistry(sourceRegistry);
await auditAdvisories(advisoryRecords);
await auditTraffic(transitRows);
await auditGeneratedMarketChart(generatedMarketChart, generatedNewsTimeline);
auditGeneratedOverviewSnapshot(generatedOverview, generatedMarketChart);
auditGeneratedNewsTimeline(generatedNewsTimeline, rawTimelineEvents, eventCandidates);
await auditNoHardcodedBackgroundRegimeDates();
auditGeneratedCanonicalArtifacts({
  observations: sourceObservations,
  evidenceClaims,
  canonicalInputs,
  sourceRegistry,
});
auditLocalCode(dataFile, sourceRegistryFile, canonicalStoreFile, sourceRegistry, generatedMarketSeries, baselineFacts);

console.log(
  `audit:data passed: ${normalizedRows.length} local FRED rows, ${generatedMarketSeries.length} generated market series, ${generatedMarketChart.series.length} market_chart series, ${baselineFacts.length} baseline facts, ${advisoryRecords.length} advisory snapshots, ${transitRows.length} traffic rows, ${sourceObservations.length} observations, ${evidenceClaims.length} evidence claims, source ids, pending data, and event contract are consistent.`,
);
