// Audits externally sourced demo data without exposing cross-check details in the UI.
// Verifies displayed FRED points against the public FRED CSV, plus structural
// invariants in the canonical store (Hormuz baseline, pending sources, scenario contract).
import { readFile } from "node:fs/promises";

const dataUrl = new URL("../src/data.ts", import.meta.url);
const sourceRegistryUrl = new URL("../src/data/sourceRegistry.ts", import.meta.url);
const canonicalStoreUrl = new URL("../src/state/canonicalStore.ts", import.meta.url);

const fredSeries = {
  DCOILBRENTEU: { label: "Brent spot" },
  DCOILWTICO: { label: "WTI spot" },
  VIXCLS: { label: "VIX" },
  DTWEXBGS: { label: "Broad USD" },
  DEXCHUS: { label: "USD/CNY" },
  DGS10: { label: "US10Y" },
  SP500: { label: "S&P 500" },
};

const structuralChecks = [
  {
    label: "IEA source registry entry",
    pattern: /id:\s*"eia-iea-hormuz"[\s\S]*?reliability:\s*"high"[\s\S]*?pending:\s*false/,
    rationale: "The structural Hormuz baseline needs its own high-reliability registered source.",
  },
  {
    label: "Hormuz oil flow baseline uses rounded IEA public claim",
    pattern: /id:\s*"oil-flow"[\s\S]*?value:\s*"≈20"[\s\S]*?IEA 2025 petroleum liquids baseline/,
    rationale: "Product copy should use the public rounded baseline unless a precise raw table is bound.",
  },
  {
    label: "Bypass capacity baseline",
    pattern: /value:\s*"3\.5–5\.5"[\s\S]*?IEA 替代出口路线能力区间/,
    rationale: "IEA supports the 3.5-5.5 mb/d alternative export route range.",
  },
  {
    label: "AIS vessel count is not promoted",
    pattern: /id:\s*"vessels"[\s\S]*?value:\s*"待接入"[\s\S]*?unit:\s*"授权数据"/,
    rationale: "Real vessel counts need licensed AIS or a stable public snapshot.",
  },
  {
    label: "Gold remains pending",
    pattern: /id:\s*"gold-pending"[\s\S]*?pending:\s*true/,
    rationale: "Gold should not be presented as sourced until a stable daily provider is wired.",
  },
  {
    label: "USD/CNH remains pending",
    pattern: /id:\s*"usdcnh-pending"[\s\S]*?pending:\s*true/,
    rationale: "USD/CNH should not be presented as live without a stable daily provider.",
  },
  {
    label: "Risk targets are forecast targets, not WarTrend enum",
    pattern: /regional_escalation_7d[\s\S]*?transit_disruption_7d[\s\S]*?state_on_state_strike_14d/,
    rationale: "War trend should be modeled as forecast targets.",
  },
  {
    label: "Canonical MarketRead uses pricingPattern",
    pattern: /pricingPattern:\s*"(not_pricing_hormuz|pricing_controlled_disruption|pricing_severe_disruption|pricing_closure_shock|mixed)"/,
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

async function fetchFredCsv(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${seriesId}: FRED request failed with ${response.status}`);
  }
  const rows = (await response.text()).trim().split("\n").slice(1);
  return new Map(
    rows
      .map((line) => line.split(","))
      .filter(([date, value]) => date && value && value !== "."),
  );
}

function extractDisplayedFredPoints(dataFile) {
  const displayedPoints = new Map();
  const seriesPattern = /source:\s*"FRED ([A-Z0-9]+)"[\s\S]*?sourceId:\s*"fred-market"[\s\S]*?points:\s*\[([\s\S]*?)\],/g;
  for (const match of dataFile.matchAll(seriesPattern)) {
    const [, seriesId, pointsBlock] = match;
    const points = [];
    for (const pointMatch of pointsBlock.matchAll(/\{\s*date:\s*"([^"]+)",\s*value:\s*([0-9.]+)\s*\}/g)) {
      points.push({ date: pointMatch[1], value: Number(pointMatch[2]) });
    }
    displayedPoints.set(seriesId, points);
  }
  return displayedPoints;
}

function extractSourceIds(file) {
  return [...file.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractReferencedSourceIds(file) {
  const ids = new Set();
  for (const match of file.matchAll(/sourceIds:\s*\[([^\]]*)\]/g)) {
    for (const idMatch of match[1].matchAll(/"([^"]+)"/g)) ids.add(idMatch[1]);
  }
  for (const match of file.matchAll(/sourceId:\s*"([^"]+)"/g)) ids.add(match[1]);
  return ids;
}

async function auditFred(dataFile) {
  const displayedPoints = extractDisplayedFredPoints(dataFile);
  for (const [seriesId, config] of Object.entries(fredSeries)) {
    const checks = displayedPoints.get(seriesId);
    if (!checks?.length) {
      throw new Error(`${seriesId}: no displayed points found in src/data.ts`);
    }
    const values = await fetchFredCsv(seriesId);
    for (const { date, value: expected } of checks) {
      const actual = values.get(date);
      if (!actual) throw new Error(`${seriesId}: missing ${date}`);
      assertAlmostEqual(actual, expected, `${config.label} ${date}`);
    }
  }
}

function auditLocalData(dataFile, sourceRegistryFile, canonicalStoreFile) {
  const combinedFiles = `${dataFile}\n${sourceRegistryFile}\n${canonicalStoreFile}`;
  for (const check of structuralChecks) {
    if (!check.pattern.test(combinedFiles)) {
      throw new Error(`${check.label}: local data check failed. ${check.rationale}`);
    }
  }
  for (const check of forbiddenPatterns) {
    if (check.pattern.test(combinedFiles)) {
      throw new Error(`${check.label}: forbidden legacy contract text found.`);
    }
  }

  const registeredSourceIds = new Set(extractSourceIds(sourceRegistryFile));
  const referencedSourceIds = extractReferencedSourceIds(`${dataFile}\n${canonicalStoreFile}`);
  for (const sourceId of referencedSourceIds) {
    if (registeredSourceIds.has(sourceId)) continue;
    // Heuristic: only fail for ids that look like registered source identifiers.
    if (/(market|advisory|conflict|news|pending|baseagent|natural-earth|shipping|hormuz|ged|ucdp)/.test(sourceId)) {
      throw new Error(`${sourceId}: referenced source id is missing from sourceRegistry.ts`);
    }
  }

  const liveSeriesWithPendingSource = /sourceId:\s*"(?:gold-pending|usdcnh-pending)"[\s\S]{0,260}?pending:\s*true/g;
  const pendingSeriesMatches = combinedFiles.match(liveSeriesWithPendingSource) ?? [];
  if (pendingSeriesMatches.length < 2) {
    throw new Error("Gold and USD/CNH pending market rows must be explicitly marked pending.");
  }
}

const dataFile = await readFile(dataUrl, "utf8");
const sourceRegistryFile = await readFile(sourceRegistryUrl, "utf8");
const canonicalStoreFile = await readFile(canonicalStoreUrl, "utf8");
await auditFred(dataFile);
auditLocalData(dataFile, sourceRegistryFile, canonicalStoreFile);

console.log("audit:data passed: FRED points, source ids, pending data, and event contract are consistent.");
