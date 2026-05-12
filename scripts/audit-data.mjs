// Audits local data artifacts and spot-checks externally sourced FRED data.
// UI must read generated local data rather than remote APIs or scattered TS fixtures.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const dataUrl = new URL("../src/data.ts", import.meta.url);
const sourceRegistryUrl = new URL("../src/data/sourceRegistry.ts", import.meta.url);
const canonicalStoreUrl = new URL("../src/state/canonicalStore.ts", import.meta.url);
const normalizedFredUrl = new URL("../data/normalized/market/fred_series.csv", import.meta.url);
const generatedMarketUrl = new URL("../data/generated/market_series.json", import.meta.url);
const generatedMarketChartUrl = new URL("../data/generated/market_chart.json", import.meta.url);
const baselineUrl = new URL("../data/normalized/baseline/hormuz_baseline.json", import.meta.url);
const sourceRegistryJsonUrl = new URL("../data/registry/sources.json", import.meta.url);
const advisoriesUrl = new URL("../data/normalized/maritime/advisories.jsonl", import.meta.url);
const transitsUrl = new URL("../data/normalized/maritime/hormuz_transits.csv", import.meta.url);
const sourceObservationsUrl = new URL("../data/observations/source_observations.jsonl", import.meta.url);
const evidenceClaimsUrl = new URL("../data/evidence/evidence_claims.jsonl", import.meta.url);
const canonicalInputsUrl = new URL("../data/generated/canonical_inputs.json", import.meta.url);
const rawFredDir = resolve(root, "data/raw/fred");

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
  const rawBytes = await readFile(resolve(root, record.raw_path));
  const actual = `sha256:${createHash("sha256").update(rawBytes).digest("hex")}`;
  if (actual !== record.source_hash) {
    throw new Error(`${label}: source_hash does not match ${record.raw_path}`);
  }
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
  for (const sourceId of ["official-advisory", "imf-portwatch-hormuz", "imo-hormuz-monthly", "fred-market"]) {
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

async function auditGeneratedMarketChart(bundle) {
  if (!bundle || !Array.isArray(bundle.series)) {
    throw new Error("market_chart.json must expose a series array.");
  }

  for (const series of bundle.series) {
    if (series.evidenceEligible !== false) {
      throw new Error(`${series.id ?? series.target}: market_chart series evidenceEligible must be false.`);
    }
    if (
      series.status === "pending_source" &&
      ((series.points?.length ?? 0) > 0 || (series.value !== undefined && series.value !== null))
    ) {
      throw new Error(`${series.id ?? series.target}: pending market_chart series must not contain values or points.`);
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
    }
  }
}

const dataFile = await readFile(dataUrl, "utf8");
const sourceRegistryFile = await readFile(sourceRegistryUrl, "utf8");
const canonicalStoreFile = await readFile(canonicalStoreUrl, "utf8");
const normalizedRows = parseCsv(await readFile(normalizedFredUrl, "utf8"));
const generatedMarketSeries = JSON.parse(await readFile(generatedMarketUrl, "utf8"));
const generatedMarketChart = JSON.parse(await readFile(generatedMarketChartUrl, "utf8"));
const baselineFacts = JSON.parse(await readFile(baselineUrl, "utf8"));
const sourceRegistry = JSON.parse(await readFile(sourceRegistryJsonUrl, "utf8"));
const advisoryRecords = parseJsonl(await readFile(advisoriesUrl, "utf8"));
const transitRows = parseCsv(await readFile(transitsUrl, "utf8"));
const sourceObservations = parseJsonl(await readFile(sourceObservationsUrl, "utf8"));
const evidenceClaims = parseJsonl(await readFile(evidenceClaimsUrl, "utf8"));
const canonicalInputs = JSON.parse(await readFile(canonicalInputsUrl, "utf8"));

await auditFredArtifacts(normalizedRows, generatedMarketSeries);
auditBaseline(baselineFacts);
auditSourceRegistry(sourceRegistry);
await auditAdvisories(advisoryRecords);
await auditTraffic(transitRows);
await auditGeneratedMarketChart(generatedMarketChart);
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
