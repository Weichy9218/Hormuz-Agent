// Fetch FRED market series into local raw, normalized, and generated data files.
// UI code reads generated artifacts; it should not call FRED directly.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const SOURCE_ID = "fred-market";
const PROVIDER_ID = "fred";
const RETRIEVED_AT = new Date().toISOString();
const SAFE_RETRIEVED_AT = RETRIEVED_AT.replace(/[:.]/g, "-");
const LOOKBACK_DAYS = 365;
const START_DATE = dateDaysBefore(RETRIEVED_AT.slice(0, 10), LOOKBACK_DAYS);

const FRED_SERIES = [
  {
    seriesId: "DCOILBRENTEU",
    target: "brent",
    id: "brent-spot",
    label: "Brent spot proxy",
    unit: "USD/bbl",
    color: "#2563eb",
    evidenceEligible: true,
    caveat: "FRED Brent spot daily series; used as a source-bound proxy until a licensed continuous futures source is wired.",
  },
  {
    seriesId: "DCOILWTICO",
    target: "wti",
    id: "wti-spot",
    label: "WTI spot proxy",
    unit: "USD/bbl",
    color: "#0f766e",
    evidenceEligible: true,
    caveat: "FRED WTI spot daily series; used as a source-bound proxy until a licensed continuous futures source is wired.",
  },
  {
    seriesId: "DTWEXBGS",
    target: "broad_usd",
    id: "broad-usd",
    label: "Broad USD",
    unit: "index",
    color: "#64748b",
    evidenceEligible: true,
    caveat: "FRED broad dollar index daily series; publication lag is possible.",
  },
  {
    seriesId: "DEXCHUS",
    target: "usd_cny",
    id: "usd-cny",
    label: "USD/CNY",
    unit: "CNY",
    color: "#7c3aed",
    evidenceEligible: false,
    caveat: "FRED USD/CNY daily series; RMB spot publications can lag and do not cover offshore CNH.",
  },
  {
    seriesId: "VIXCLS",
    target: "vix",
    id: "vix",
    label: "VIX",
    unit: "index",
    color: "#dc2626",
    evidenceEligible: true,
    caveat: "FRED VIX daily close; used to test whether oil stress is broadening into volatility.",
  },
  {
    seriesId: "DGS10",
    target: "us10y",
    id: "us10y",
    label: "US10Y",
    unit: "%",
    color: "#0891b2",
    evidenceEligible: false,
    caveat: "FRED 10-year Treasury yield; rate moves mix inflation and haven channels.",
  },
  {
    seriesId: "SP500",
    target: "sp500",
    id: "sp500",
    label: "S&P 500",
    unit: "index",
    color: "#16a34a",
    evidenceEligible: true,
    caveat: "FRED S&P 500 daily close; risk appetite check, not forecast-state input by itself.",
  },
  {
    seriesId: "NASDAQCOM",
    target: "nasdaq",
    id: "nasdaq-composite",
    label: "NASDAQ Composite",
    unit: "index",
    color: "#0284c7",
    evidenceEligible: false,
    caveat: "FRED NASDAQ Composite daily close; included for market-background context, not a forecast target.",
  },
  {
    seriesId: "CPIAUCSL",
    target: "us_cpi",
    id: "us-cpi",
    label: "美国 CPI 指数",
    unit: "index",
    color: "#b45309",
    evidenceEligible: false,
    caveat:
      "FRED CPIAUCSL is a monthly, seasonally adjusted CPI index (1982-1984=100), not a year-over-year inflation percent.",
  },
];

const PENDING_SERIES = [
  {
    id: "brent-futures-pending",
    target: "brent_futures_continuous",
    label: "Brent futures continuous（pending）",
    unit: "pending",
    color: "#93c5fd",
    source: "Brent futures source pending",
    sourceId: "crude-futures-pending",
    provider_id: null,
    provider_status: "licensed_pending",
    license_status: "licensed_required",
    status: "pending_source",
    value: null,
    evidenceEligible: false,
    caveat: "未接入可审计 continuous futures provider 前，不把 Brent futures 主连写成 live 数据。",
    pending: true,
    points: [],
    candidate_provider_ids: ["databento", "ice"],
  },
  {
    id: "wti-futures-pending",
    target: "wti_futures_continuous",
    label: "WTI futures continuous（pending）",
    unit: "pending",
    color: "#99f6e4",
    source: "WTI futures source pending",
    sourceId: "crude-futures-pending",
    provider_id: null,
    provider_status: "licensed_pending",
    license_status: "licensed_required",
    status: "pending_source",
    value: null,
    evidenceEligible: false,
    caveat: "未接入可审计 continuous futures provider 前，不把 WTI futures 主连写成 live 数据。",
    pending: true,
    points: [],
    candidate_provider_ids: ["databento", "cme-datamine"],
  },
  {
    id: "gold-pending",
    target: "gold_lbma_benchmark",
    label: "Gold（pending）",
    unit: "pending",
    color: "#ca8a04",
    source: "Gold source pending",
    sourceId: "gold-pending",
    provider_id: null,
    provider_status: "licensed_pending",
    license_status: "licensed_required",
    status: "pending_source",
    value: null,
    evidenceEligible: false,
    caveat: "LBMA benchmark 数据有 licence 要求；未接入授权或稳定 daily source 前不展示 live 金价。",
    pending: true,
    points: [],
    candidate_provider_ids: ["databento", "cme-datamine"],
  },
  {
    id: "silver-pending",
    target: "silver_lbma_benchmark",
    label: "Silver（pending）",
    unit: "pending",
    color: "#94a3b8",
    source: "Silver source pending",
    sourceId: "silver-pending",
    provider_id: null,
    provider_status: "licensed_pending",
    license_status: "licensed_required",
    status: "pending_source",
    value: null,
    evidenceEligible: false,
    caveat: "未接入授权或稳定 daily source 前不展示 live 白银价格。",
    pending: true,
    points: [],
    candidate_provider_ids: ["databento", "cme-datamine"],
  },
  {
    id: "usd-cnh-pending",
    target: "usd_cnh",
    label: "USD/CNH（pending）",
    unit: "pending",
    color: "#a78bfa",
    source: "USD/CNH source pending",
    sourceId: "usdcnh-pending",
    provider_id: null,
    provider_status: "candidate_smoke_test",
    license_status: "token_required",
    status: "pending_source",
    value: null,
    evidenceEligible: false,
    caveat: "未接入稳定 daily provider 前只保留 schema，不渲染为 live market evidence。",
    pending: true,
    points: [],
    candidate_provider_ids: ["alpha-vantage", "twelve-data"],
  },
  {
    id: "hstech-pending",
    target: "hstech",
    label: "Hang Seng Tech（pending）",
    unit: "pending",
    color: "#38bdf8",
    source: "Hang Seng Tech source pending",
    sourceId: "hstech-pending",
    provider_id: null,
    provider_status: "licensed_pending",
    license_status: "licensed_required",
    status: "pending_source",
    value: null,
    evidenceEligible: false,
    caveat: "未接入稳定指数 provider 和 licence boundary 前，只显示 pending，不展示死数据。",
    pending: true,
    points: [],
    candidate_provider_ids: ["hang-seng-licensed-vendor", "akshare", "yfinance"],
  },
  {
    id: "shanghai-composite-pending",
    target: "shanghai_composite",
    label: "Shanghai Composite（pending）",
    unit: "pending",
    color: "#22c55e",
    source: "Shanghai Composite source pending",
    sourceId: "shanghai-composite-pending",
    provider_id: null,
    provider_status: "candidate_smoke_test",
    license_status: "token_required",
    status: "pending_source",
    value: null,
    evidenceEligible: false,
    caveat: "未接入稳定指数 provider 和 licence boundary 前，只显示 pending，不展示死数据。",
    pending: true,
    points: [],
    candidate_provider_ids: ["tushare", "akshare", "baostock"],
  },
];

function fredGraphUrl(seriesId) {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}&cosd=${START_DATE}`;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  const fields = [
    "source_id",
    "series_id",
    "target",
    "date",
    "value",
    "unit",
    "source_url",
    "retrieved_at",
    "license_status",
  ];
  return [
    fields.join(","),
    ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(",")),
  ].join("\n") + "\n";
}

function parseFredCsv(csv, seriesId) {
  const rows = csv.trim().split(/\r?\n/);
  const dataRows = rows.slice(1);
  return dataRows
    .map((line) => {
      const [date, rawValue] = line.split(",");
      const value = rawValue === "." || rawValue == null || rawValue === ""
        ? null
        : Number(rawValue);
      return { date, value };
    })
    .filter((row) => {
      if (!row.date || row.date < START_DATE) return false;
      if (row.value == null) return true;
      if (!Number.isFinite(row.value)) {
        throw new Error(`${seriesId} ${row.date}: invalid value ${row.value}`);
      }
      return true;
    });
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateDaysBefore(date, days) {
  return addDays(date, -days);
}

function selectDisplayPoints(rows) {
  const validRows = rows
    .filter((row) => row.value != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (validRows.length === 0) return [];

  const selected = [];
  const seenDates = new Set();
  const latest = validRows.at(-1);
  let cursor = START_DATE;

  while (cursor <= latest.date) {
    const match = validRows.find((row) => row.date >= cursor);
    if (match && !seenDates.has(match.date)) {
      selected.push({ date: match.date, value: match.value });
      seenDates.add(match.date);
    }
    cursor = addDays(cursor, 7);
  }

  if (latest && !seenDates.has(latest.date)) {
    selected.push({ date: latest.date, value: latest.value });
  }

  return selected;
}

async function readExistingNormalized(path) {
  try {
    const text = await readFile(path, "utf8");
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0]?.split(",") ?? [];
    return lines.slice(1).map((line) => {
      const values = line.split(",");
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function fetchSeries(config) {
  const url = fredGraphUrl(config.seriesId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${config.seriesId}: FRED request failed with ${response.status}`);
  }

  const csv = await response.text();
  const rawDir = resolve(root, "data", "raw", "fred", config.seriesId);
  await mkdir(rawDir, { recursive: true });
  const rawPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}.csv`);
  await writeFile(rawPath, csv);
  const hash = createHash("sha256").update(csv).digest("hex");

  const points = parseFredCsv(csv, config.seriesId);
  const sourceUrl = `https://fred.stlouisfed.org/series/${config.seriesId}`;
  const normalizedRows = points.map((point) => ({
    source_id: SOURCE_ID,
    series_id: config.seriesId,
    target: config.target,
    date: point.date,
    value: point.value == null ? "" : String(point.value),
    unit: config.unit,
    source_url: sourceUrl,
    retrieved_at: RETRIEVED_AT,
    license_status: "open",
  }));

  const displayPoints = selectDisplayPoints(points);
  const latest = displayPoints.at(-1);
  return {
    normalizedRows,
    generatedSeries: {
      id: config.id,
      target: config.target,
      label: config.label,
      unit: config.unit,
      color: config.color,
      source: `FRED ${config.seriesId}`,
      sourceId: SOURCE_ID,
      sourceUrl,
      verifiedAt: latest?.date,
      retrieved_at: RETRIEVED_AT,
      raw_path: rawPath.slice(root.length + 1),
      source_hash: `sha256:${hash}`,
      provider_id: PROVIDER_ID,
      provider_status: "active",
      license_status: "open",
      status: "active",
      value: latest?.value ?? null,
      evidenceEligible: config.evidenceEligible,
      caveat: `${config.caveat} raw sha256:${hash}`,
      points: displayPoints,
    },
  };
}

async function main() {
  const normalizedPath = resolve(root, "data", "normalized", "market", "fred_series.csv");
  const generatedPath = resolve(root, "data", "generated", "market_series.json");
  await mkdir(dirname(normalizedPath), { recursive: true });
  await mkdir(dirname(generatedPath), { recursive: true });
  await mkdir(resolve(root, "data", "registry"), { recursive: true });
  await mkdir(resolve(root, "data", "observations"), { recursive: true });
  await mkdir(resolve(root, "data", "evidence"), { recursive: true });
  await mkdir(resolve(root, "data", "checkpoints"), { recursive: true });

  const existing = await readExistingNormalized(normalizedPath);
  const byKey = new Map(existing.map((row) => [`${row.series_id}:${row.date}`, row]));
  const generated = [];

  for (const config of FRED_SERIES) {
    const result = await fetchSeries(config);
    for (const row of result.normalizedRows) {
      byKey.set(`${row.series_id}:${row.date}`, row);
    }
    generated.push(result.generatedSeries);
  }

  const normalizedRows = [...byKey.values()].sort(
    (a, b) => a.series_id.localeCompare(b.series_id) || a.date.localeCompare(b.date),
  );
  await writeFile(normalizedPath, toCsv(normalizedRows));
  await writeFile(
    generatedPath,
    JSON.stringify([...generated, ...PENDING_SERIES], null, 2) + "\n",
  );

  console.log(
    `fetch:fred wrote ${normalizedRows.length} normalized rows and ${generated.length} generated FRED series.`,
  );
}

await main();
