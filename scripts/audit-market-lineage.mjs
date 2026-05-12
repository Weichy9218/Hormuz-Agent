// Audit generated market series against normalized rows and raw lineage.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const marketSeries = JSON.parse(
  await readFile(resolve(root, "data/generated/market_series.json"), "utf8"),
);
const normalizedFredRows = parseCsv(
  await readFile(resolve(root, "data/normalized/market/fred_series.csv"), "utf8"),
);

const fredTargetBySeries = new Map([
  ["DCOILBRENTEU", "brent"],
  ["DCOILWTICO", "wti"],
  ["VIXCLS", "vix"],
  ["DTWEXBGS", "broad_usd"],
  ["DEXCHUS", "usd_cny"],
  ["DGS10", "us10y"],
  ["SP500", "sp500"],
  ["NASDAQCOM", "nasdaq"],
  ["CPIAUCSL", "us_cpi"],
]);

const normalizedBySeriesDate = new Map(
  normalizedFredRows.map((row) => [`${row.series_id}:${row.date}`, row]),
);
const violations = [];

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

function almostEqual(actual, expected) {
  return Math.abs(Number(actual) - Number(expected)) <= 0.005;
}

async function assertRawHash(series) {
  if (!series.raw_path) {
    violations.push(`${series.id}: active row missing raw_path`);
    return;
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(series.source_hash ?? "")) {
    violations.push(`${series.id}: invalid source_hash ${series.source_hash}`);
    return;
  }
  try {
    const rawBytes = await readFile(resolve(root, series.raw_path));
    const actual = `sha256:${createHash("sha256").update(rawBytes).digest("hex")}`;
    if (actual !== series.source_hash) {
      violations.push(`${series.id}: source_hash does not match ${series.raw_path}`);
    }
  } catch (error) {
    violations.push(`${series.id}: raw_path ${series.raw_path} cannot be read (${error.message})`);
  }
}

for (const row of normalizedFredRows) {
  const expectedTarget = fredTargetBySeries.get(row.series_id);
  if (!expectedTarget) continue;
  if (row.series_id === "DEXCHUS" && row.target !== "usd_cny") {
    violations.push(`DEXCHUS ${row.date}: FRED DEXCHUS must map only to usd_cny`);
  }
  if (row.target === "usd_cnh") {
    violations.push(`${row.series_id} ${row.date}: normalized FRED row cannot target usd_cnh`);
  }
  if (row.target !== expectedTarget) {
    violations.push(`${row.series_id} ${row.date}: target ${row.target} does not match ${expectedTarget}`);
  }
}

for (const series of marketSeries) {
  const status = series.status ?? (series.pending ? "pending_source" : "active");

  if (status === "active") {
    for (const field of [
      "sourceUrl",
      "retrieved_at",
      "raw_path",
      "source_hash",
      "provider_id",
      "license_status",
    ]) {
      if (!series[field]) violations.push(`${series.id}: active row missing ${field}`);
    }
    if (series.value == null) violations.push(`${series.id}: active row missing value`);
    if (series.evidenceEligible !== true && series.evidenceEligible !== false) {
      violations.push(`${series.id}: active row must declare evidenceEligible`);
    }
    await assertRawHash(series);

    const fredMatch = String(series.source ?? "").match(/^FRED (.+)$/);
    if (fredMatch) {
      const seriesId = fredMatch[1];
      const expectedTarget = fredTargetBySeries.get(seriesId);
      if (expectedTarget && series.target !== expectedTarget) {
        violations.push(`${series.id}: target ${series.target} does not match ${expectedTarget}`);
      }
      if (seriesId === "DEXCHUS" && series.target !== "usd_cny") {
        violations.push(`${series.id}: FRED DEXCHUS cannot populate ${series.target}`);
      }
      for (const point of series.points ?? []) {
        const normalized = normalizedBySeriesDate.get(`${seriesId}:${point.date}`);
        if (!normalized) {
          violations.push(`${series.id}: generated point ${point.date} missing from normalized FRED rows`);
          continue;
        }
        if (!almostEqual(normalized.value, point.value)) {
          violations.push(`${series.id}: generated point ${point.date}=${point.value} differs from normalized ${normalized.value}`);
        }
      }
      const latestPoint = series.points?.at(-1);
      if (latestPoint && !almostEqual(series.value, latestPoint.value)) {
        violations.push(`${series.id}: value must match latest generated point`);
      }
    }
  }

  if (
    status === "active" &&
    /continuous|main_continuous|futures/i.test(`${series.target ?? ""} ${series.id}`) &&
    !series.contract_meta
  ) {
    violations.push(`${series.id}: active futures continuous row missing contract_meta`);
  }

  if (series.contract_meta) {
    const meta = series.contract_meta;
    if (!meta.roll_method || !meta.contract_type) {
      violations.push(`${series.id}: futures contract_meta missing roll_method or contract_type`);
    }
  }
}

if (violations.length > 0) {
  console.error("audit:market-lineage FAILED");
  for (const violation of violations) console.error("  -", violation);
  process.exit(1);
}

console.log(
  `audit:market-lineage passed: ${marketSeries.length} generated market rows and ${normalizedFredRows.length} normalized FRED rows validated.`,
);
