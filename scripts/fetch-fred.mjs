// Fetch FRED market series into local raw, normalized, and generated data files.
// UI code reads generated artifacts; it should not call FRED directly.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const START_DATE = "2026-03-02";
const SOURCE_ID = "fred-market";
const RETRIEVED_AT = new Date().toISOString();
const SAFE_RETRIEVED_AT = RETRIEVED_AT.replace(/[:.]/g, "-");

const FRED_SERIES = [
  {
    seriesId: "DCOILBRENTEU",
    target: "brent",
    id: "brent-spot",
    label: "Brent 现货",
    unit: "USD/bbl",
    color: "#f0b84a",
    caveat: "FRED 日频源的本地抽样序列；不是完整逐日图。",
  },
  {
    seriesId: "DCOILWTICO",
    target: "wti",
    id: "wti-spot",
    label: "WTI 现货",
    unit: "USD/bbl",
    color: "#ff8743",
    caveat: "FRED 日频源的本地抽样序列；不是完整逐日图。",
  },
  {
    seriesId: "DTWEXBGS",
    target: "broad_usd",
    id: "broad-usd",
    label: "Broad USD",
    unit: "index",
    color: "#8bd3c7",
    caveat: "FRED 日频源的本地抽样序列；不是完整逐日图。",
  },
  {
    seriesId: "DEXCHUS",
    target: "usd_cny",
    id: "usd-cny",
    label: "USD/CNY",
    unit: "CNY",
    color: "#d4a5ff",
    caveat: "FRED 日频源的本地抽样序列；人民币即期序列存在发布滞后。",
  },
  {
    seriesId: "VIXCLS",
    target: "vix",
    id: "vix",
    label: "VIX",
    unit: "index",
    color: "#ff6b45",
    caveat: "FRED 日频源的本地抽样序列；不是完整逐日图。",
  },
  {
    seriesId: "DGS10",
    target: "us10y",
    id: "us10y",
    label: "美债 10Y（US10Y）",
    unit: "%",
    color: "#9fa8da",
    caveat: "FRED 日频源的本地抽样序列；不是完整逐日图。",
  },
  {
    seriesId: "SP500",
    target: "sp500",
    id: "sp500",
    label: "标普 500（S&P 500）",
    unit: "index",
    color: "#56b9ff",
    caveat: "FRED 日频源的本地抽样序列；不是完整逐日图。",
  },
];

const PENDING_SERIES = [
  {
    id: "gold-pending",
    label: "Gold（pending）",
    unit: "pending",
    color: "#ffd166",
    source: "Gold source pending",
    sourceId: "gold-pending",
    caveat: "LBMA benchmark 数据有 licence 要求；未接入授权或稳定 daily source 前不展示 live 金价。",
    pending: true,
    points: [],
  },
  {
    id: "usd-cnh-pending",
    label: "USD/CNH（pending）",
    unit: "pending",
    color: "#c7f9cc",
    source: "USD/CNH source pending",
    sourceId: "usdcnh-pending",
    caveat: "未接入稳定 daily provider 前只保留 schema，不渲染为 live market evidence。",
    pending: true,
    points: [],
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
      label: config.label,
      unit: config.unit,
      color: config.color,
      source: `FRED ${config.seriesId}`,
      sourceId: SOURCE_ID,
      sourceUrl,
      verifiedAt: latest?.date,
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
