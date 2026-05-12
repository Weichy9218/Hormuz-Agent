// Builds forecast-contract artifacts from local normalized data.
//
// Inputs live under data/normalized and data/generated. Outputs are:
//   - data/observations/source_observations.jsonl
//   - data/evidence/evidence_claims.jsonl
//   - data/generated/canonical_inputs.json
//
// This script deliberately keeps PortWatch daily_transit_calls separate from
// the 60 7d avg transit-calls baseline until the metric definition is verified.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const paths = {
  generatedMarket: resolve(root, "data/generated/market_series.json"),
  normalizedFred: resolve(root, "data/normalized/market/fred_series.csv"),
  baseline: resolve(root, "data/normalized/baseline/hormuz_baseline.json"),
  advisories: resolve(root, "data/normalized/maritime/advisories.jsonl"),
  transits: resolve(root, "data/normalized/maritime/hormuz_transits.csv"),
  observations: resolve(root, "data/observations/source_observations.jsonl"),
  evidence: resolve(root, "data/evidence/evidence_claims.jsonl"),
  canonicalInputs: resolve(root, "data/generated/canonical_inputs.json"),
};

const fredSeriesOrder = [
  "DCOILBRENTEU",
  "DCOILWTICO",
  "DTWEXBGS",
  "DEXCHUS",
  "DGS10",
  "SP500",
  "VIXCLS",
];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
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

function jsonl(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function toObservedAt(date) {
  if (!date) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00Z`;
  return date;
}

function stableIdPart(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validHash(value) {
  return /^sha256:[0-9a-f]{64}$/.test(value ?? "") ? value : undefined;
}

function latestDate(rows) {
  return rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function latestRetrievedAt(records) {
  return records
    .map((record) => record.retrievedAt ?? record.retrieved_at)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function byLatestDateDesc(a, b) {
  return String(b.date ?? "").localeCompare(String(a.date ?? ""));
}

function buildMarketObservations(generatedMarketSeries, normalizedFredRows) {
  const rowBySeriesDate = new Map(
    normalizedFredRows.map((row) => [`${row.series_id}:${row.date}`, row]),
  );
  const observations = [];

  for (const seriesId of fredSeriesOrder) {
    const series = generatedMarketSeries.find((item) => item.source === `FRED ${seriesId}`);
    const latest = series?.points?.at(-1);
    if (!series || !latest) continue;
    const normalized = rowBySeriesDate.get(`${seriesId}:${latest.date}`);
    if (!normalized) {
      throw new Error(`${seriesId}: latest generated point ${latest.date} missing from normalized FRED rows.`);
    }
    observations.push({
      observationId: `obs-local-fred-${stableIdPart(series.id)}-${latest.date}`,
      sourceId: "fred-market",
      observedAt: toObservedAt(latest.date),
      retrievedAt: normalized.retrieved_at,
      sourceUrl: normalized.source_url,
      title: `${series.label} local FRED observation`,
      summary: `${series.label}=${latest.value} ${series.unit} on ${latest.date}; generated from local FRED raw/normalized artifacts.`,
      freshness: "fresh",
      licenseStatus: "open",
    });
  }

  return observations;
}

function buildBaselineObservations(baselineFacts) {
  const factsById = new Map(baselineFacts.map((fact) => [fact.fact_id, fact]));
  const oilFlow = factsById.get("oil-flow");
  const bypass = factsById.get("bypass-capacity");
  const threshold = factsById.get("portwatch-threshold");
  if (!oilFlow || !bypass || !threshold) {
    throw new Error("baseline facts must include oil-flow, bypass-capacity, and portwatch-threshold.");
  }

  return [
    {
      observationId: "obs-local-baseline-hormuz-2025",
      sourceId: "eia-iea-hormuz",
      retrievedAt: oilFlow.retrieved_at,
      sourceUrl: oilFlow.source_url,
      title: "Hormuz structural baseline",
      summary: `Structural baseline: petroleum liquids flow ${oilFlow.value} ${oilFlow.unit}; bypass capacity ${bypass.value} ${bypass.unit}. This is not current-day throughput.`,
      freshness: "lagging",
      licenseStatus: oilFlow.license_status,
    },
    {
      observationId: "obs-local-portwatch-threshold-2026",
      sourceId: "imf-portwatch-hormuz",
      retrievedAt: threshold.retrieved_at,
      sourceUrl: threshold.source_url,
      title: "PortWatch traffic-normal threshold context",
      summary: `Traffic-normal context stores ${threshold.value} ${threshold.unit}; it is not directly comparable to daily_transit_calls until metric definitions are verified.`,
      freshness: "lagging",
      licenseStatus: threshold.license_status,
    },
  ];
}

function advisorySortKey(record) {
  const year = record.advisory_id?.match(/20\d{2}/)?.[0] ?? "0000";
  const text = `${record.advisory_id ?? ""} ${record.title ?? ""}`.toLowerCase();
  const specificity =
    (text.includes("hormuz") ? 100 : 0) +
    (text.includes("persian gulf") || text.includes("arabian gulf") ? 20 : 0) +
    (text.includes("gulf of oman") ? 20 : 0);
  return `${String(specificity).padStart(3, "0")}:${year}:${record.advisory_id ?? record.title}`;
}

function buildAdvisoryObservations(records) {
  const ukmto = records.find((record) => record.source_name === "UKMTO");
  const imo = records.find((record) => record.source_name === "IMO");
  const marad = records
    .filter((record) => record.source_name === "MARAD" && record.event_type === "maritime_advisory")
    .filter((record) => /hormuz|persian gulf|arabian gulf|gulf of oman/i.test(record.title))
    .sort((a, b) => advisorySortKey(b).localeCompare(advisorySortKey(a)))
    .slice(0, 2);

  return [ukmto, ...marad, imo]
    .filter(Boolean)
    .map((record) => ({
      observationId: `obs-local-advisory-${stableIdPart(record.advisory_id)}`,
      sourceId: "official-advisory",
      publishedAt: record.published_at || undefined,
      retrievedAt: record.retrieved_at,
      sourceUrl: record.source_url,
      sourceHash: validHash(record.source_hash),
      title: record.title,
      summary: `${record.source_name} ${record.event_type} snapshot/candidate for ${record.geography?.join(", ") || "Hormuz region"}; evidence use remains bounded by cross-verification gates.`,
      freshness: record.event_type === "source_snapshot" ? "lagging" : "fresh",
      licenseStatus: record.license_status,
    }));
}

function buildTrafficObservations(rows) {
  const daily = rows
    .filter((row) => row.source_id === "imf-portwatch-hormuz" && row.metric === "daily_transit_calls" && row.window === "daily")
    .sort(byLatestDateDesc);
  const latestDaily = daily[0];
  if (!latestDaily) throw new Error("PortWatch daily_transit_calls rows are required.");

  const imoChart = rows.find((row) =>
    row.source_id === "imo-hormuz-monthly" && row.window === "chart_image_snapshot"
  );

  const observations = [
    {
      observationId: `obs-local-portwatch-daily-${latestDaily.date}`,
      sourceId: "imf-portwatch-hormuz",
      observedAt: toObservedAt(latestDaily.date),
      retrievedAt: latestDaily.retrieved_at,
      sourceUrl: latestDaily.source_url,
      sourceHash: validHash(latestDaily.source_hash),
      title: `PortWatch daily_transit_calls ${latestDaily.date}`,
      summary: `PortWatch chokepoint6 daily_transit_calls=${latestDaily.value} on ${latestDaily.date}. This daily metric is stored with AIS/GNSS caveat and is not mixed with the 60 7d avg transit-calls threshold.`,
      freshness: "lagging",
      licenseStatus: latestDaily.license_status,
    },
  ];

  if (imoChart) {
    observations.push({
      observationId: `obs-local-imo-chart-${stableIdPart(imoChart.raw_path)}`,
      sourceId: "imo-hormuz-monthly",
      observedAt: toObservedAt(imoChart.date),
      retrievedAt: imoChart.retrieved_at,
      sourceUrl: imoChart.source_url,
      sourceHash: validHash(imoChart.source_hash),
      title: "IMO Hormuz monthly transit chart snapshot",
      summary: "IMO monthly transit chart image is saved locally; numeric extraction is pending OCR/manual review before evidence use.",
      freshness: "lagging",
      licenseStatus: imoChart.license_status,
    });
  }

  return observations;
}

function findObservation(observations, matcher, label) {
  const observation = observations.find(matcher);
  if (!observation) throw new Error(`Missing observation: ${label}`);
  return observation;
}

function findLatestMarketPoint(generatedMarketSeries, source) {
  const series = generatedMarketSeries.find((item) => item.source === source);
  const point = series?.points?.at(-1);
  if (!series || !point) throw new Error(`${source}: generated market point missing.`);
  if (series.status !== "active" || series.evidenceEligible !== true) {
    throw new Error(`${source}: market evidence can only consume active evidenceEligible series.`);
  }
  return { series, point };
}

function buildEvidenceClaims({ observations, generatedMarketSeries, transitRows }) {
  const brent = findLatestMarketPoint(generatedMarketSeries, "FRED DCOILBRENTEU");
  const wti = findLatestMarketPoint(generatedMarketSeries, "FRED DCOILWTICO");
  const vix = findLatestMarketPoint(generatedMarketSeries, "FRED VIXCLS");
  const sp500 = findLatestMarketPoint(generatedMarketSeries, "FRED SP500");

  const marketObservationIds = observations
    .filter((observation) => observation.sourceId === "fred-market")
    .map((observation) => observation.observationId)
    .sort();
  const advisoryObservationIds = observations
    .filter((observation) => observation.sourceId === "official-advisory")
    .map((observation) => observation.observationId)
    .sort();
  const portwatchDaily = findObservation(
    observations,
    (observation) => observation.observationId.startsWith("obs-local-portwatch-daily-"),
    "latest PortWatch daily observation",
  );
  const portwatchThreshold = findObservation(
    observations,
    (observation) => observation.observationId === "obs-local-portwatch-threshold-2026",
    "PortWatch threshold context",
  );
  const trafficObservationIds = observations
    .filter((observation) => ["imf-portwatch-hormuz", "imo-hormuz-monthly"].includes(observation.sourceId))
    .map((observation) => observation.observationId)
    .sort();

  const latestDailyRow = transitRows
    .filter((row) => row.source_id === "imf-portwatch-hormuz" && row.metric === "daily_transit_calls" && row.window === "daily")
    .sort(byLatestDateDesc)[0];

  return [
    {
      evidenceId: "ev-local-market-risk-premium",
      sourceObservationIds: marketObservationIds,
      claim: `Local FRED bundle shows Brent ${brent.point.value} on ${brent.point.date} and WTI ${wti.point.value} on ${wti.point.date}, while VIX ${vix.point.value} and S&P 500 ${sp500.point.value} do not form a closure-style cross-asset shock.`,
      polarity: "support",
      affects: ["market", "scenario", "target"],
      mechanismTags: ["market_pricing_risk_premium", "market_not_pricing_closure"],
      confidence: "medium",
      quality: {
        sourceReliability: "high",
        freshness: "fresh",
        corroboration: "multi_source",
        directness: "direct",
      },
      targetHints: [
        { target: "brent", direction: "up", weight: 0.75 },
        { target: "wti", direction: "up", weight: 0.65 },
        { target: "vix", direction: "down", weight: 0.35 },
        { target: "sp500", direction: "up", weight: 0.35 },
      ],
    },
    {
      evidenceId: "ev-local-official-advisory",
      sourceObservationIds: advisoryObservationIds,
      claim: "Official advisory snapshots preserve elevated maritime/security context around Hormuz, but the current local parser has not extracted verified avoidance or closure wording; confidence remains capped at medium.",
      polarity: "support",
      affects: ["scenario", "target", "watchlist"],
      mechanismTags: ["transit_risk_up", "insurance_cost_up"],
      confidence: "medium",
      quality: {
        sourceReliability: "high",
        freshness: "fresh",
        corroboration: "single_source",
        directness: "direct",
      },
      targetHints: [
        { target: "transit_disruption_7d", direction: "up", weight: 0.75 },
        { target: "regional_escalation_7d", direction: "up", weight: 0.55 },
      ],
    },
    {
      evidenceId: "ev-local-portwatch-metric-caveat",
      sourceObservationIds: [
        portwatchDaily.observationId,
        portwatchThreshold.observationId,
        ...trafficObservationIds.filter((id) => id !== portwatchDaily.observationId && id !== portwatchThreshold.observationId),
      ],
      claim: `PortWatch latest daily_transit_calls=${latestDailyRow.value} on ${latestDailyRow.date}; the 60 7d avg transit-calls baseline is stored separately and is not directly comparable until metric definitions are verified. This supports keeping traffic_flow_down out of severe/closure evidence.`,
      polarity: "support",
      affects: ["scenario", "watchlist"],
      mechanismTags: ["market_not_pricing_closure"],
      confidence: "low",
      quality: {
        sourceReliability: "medium",
        freshness: "lagging",
        corroboration: "single_source",
        directness: "proxy",
      },
    },
  ];
}

function buildMarketRead(generatedMarketSeries) {
  const brent = findLatestMarketPoint(generatedMarketSeries, "FRED DCOILBRENTEU");
  const wti = findLatestMarketPoint(generatedMarketSeries, "FRED DCOILWTICO");
  const vix = findLatestMarketPoint(generatedMarketSeries, "FRED VIXCLS");
  const sp500 = findLatestMarketPoint(generatedMarketSeries, "FRED SP500");
  const asOf = latestDate([
    brent.point,
    wti.point,
    vix.point,
    sp500.point,
  ]);

  return {
    title: "市场信号混合：油价保留风险溢价，但未形成 closure-style shock",
    summary: `Brent ${brent.point.value} (${brent.point.date}), WTI ${wti.point.value} (${wti.point.date}), VIX ${vix.point.value} (${vix.point.date}), S&P 500 ${sp500.point.value} (${sp500.point.date}); cross-asset pattern supports controlled risk premium, not closure pricing.`,
    pricingPattern: "mixed",
    evidenceIds: ["ev-local-market-risk-premium"],
    caveat: "Market data is evidence input only; it must not act as a second forecast engine or independently raise closure probability.",
    asOf,
  };
}

function assertBuilderContract({ observations, evidenceClaims, canonicalInputs }) {
  const observationIds = new Set(observations.map((observation) => observation.observationId));
  const duplicateObservationIds = observations
    .map((observation) => observation.observationId)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateObservationIds.length > 0) {
    throw new Error(`Duplicate observation ids: ${duplicateObservationIds.join(", ")}`);
  }

  for (const claim of evidenceClaims) {
    if (!claim.sourceObservationIds?.length) {
      throw new Error(`${claim.evidenceId}: missing sourceObservationIds.`);
    }
    for (const observationId of claim.sourceObservationIds) {
      if (!observationIds.has(observationId)) {
        throw new Error(`${claim.evidenceId}: references unknown observation ${observationId}.`);
      }
    }
    const sourceIds = claim.sourceObservationIds.map((id) =>
      observations.find((observation) => observation.observationId === id)?.sourceId
    );
    if (sourceIds.includes("imf-portwatch-hormuz")) {
      if (claim.polarity === "support" && claim.mechanismTags.includes("traffic_flow_down")) {
        throw new Error(`${claim.evidenceId}: PortWatch daily rows cannot support traffic_flow_down before metric verification.`);
      }
      if (!/daily_transit_calls/.test(claim.claim) || !/60 7d avg/.test(claim.claim)) {
        throw new Error(`${claim.evidenceId}: PortWatch claim must preserve daily vs 7d avg metric boundary.`);
      }
    }
  }

  for (const evidenceId of canonicalInputs.marketRead.evidenceIds) {
    if (!evidenceClaims.some((claim) => claim.evidenceId === evidenceId)) {
      throw new Error(`marketRead references unknown evidence ${evidenceId}.`);
    }
  }
}

const generatedMarketSeries = JSON.parse(await readFile(paths.generatedMarket, "utf8"));
const normalizedFredRows = parseCsv(await readFile(paths.normalizedFred, "utf8"));
const baselineFacts = JSON.parse(await readFile(paths.baseline, "utf8"));
const advisoryRecords = parseJsonl(await readFile(paths.advisories, "utf8"));
const transitRows = parseCsv(await readFile(paths.transits, "utf8"));

const observations = [
  ...buildBaselineObservations(baselineFacts),
  ...buildMarketObservations(generatedMarketSeries, normalizedFredRows),
  ...buildAdvisoryObservations(advisoryRecords),
  ...buildTrafficObservations(transitRows),
].sort((a, b) => a.observationId.localeCompare(b.observationId));

const evidenceClaims = buildEvidenceClaims({
  observations,
  generatedMarketSeries,
  transitRows,
});

const generatedAt = latestRetrievedAt([
  ...observations,
  ...normalizedFredRows,
  ...advisoryRecords,
  ...transitRows,
]);

const canonicalInputs = {
  schemaVersion: "hormuz-local-canonical-inputs/v1",
  generatedAt,
  sourceObservations: observations,
  evidenceClaims,
  marketRead: buildMarketRead(generatedMarketSeries),
  notes: [
    "Generated from local normalized artifacts; no live remote endpoint is read by canonicalStore.",
    "PortWatch daily_transit_calls is not mixed with the 60 7d avg transit-calls threshold until metric definitions are verified.",
  ],
};

assertBuilderContract({ observations, evidenceClaims, canonicalInputs });

await mkdir(dirname(paths.observations), { recursive: true });
await mkdir(dirname(paths.evidence), { recursive: true });
await mkdir(dirname(paths.canonicalInputs), { recursive: true });
await writeFile(paths.observations, jsonl(observations));
await writeFile(paths.evidence, jsonl(evidenceClaims));
await writeFile(paths.canonicalInputs, `${JSON.stringify(canonicalInputs, null, 2)}\n`);

console.log(
  `build:local-evidence wrote ${observations.length} observations, ${evidenceClaims.length} evidence claims, and data/generated/canonical_inputs.json`,
);
