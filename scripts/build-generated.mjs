// Build UI-ready background-page bundles from audited local data files.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const BUILT_AT = new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
const POLYMARKET_STALE_MS = 48 * 60 * 60 * 1000;

const paths = {
  baseline: resolve(root, "data", "normalized", "baseline", "hormuz_baseline.json"),
  fred: resolve(root, "data", "normalized", "market", "fred_series.csv"),
  transits: resolve(root, "data", "normalized", "maritime", "hormuz_transits.csv"),
  advisories: resolve(root, "data", "normalized", "maritime", "advisories.jsonl"),
  events: resolve(root, "data", "events", "events_timeline.jsonl"),
  polymarket: resolve(root, "data", "external", "polymarket_questions.json"),
  generatedDir: resolve(root, "data", "generated"),
};

const MARKET_META = {
  brent: { id: "brent-spot", label: "Brent spot proxy", group: "energy", color: "#2563eb" },
  wti: { id: "wti-spot", label: "WTI spot proxy", group: "energy", color: "#0ea5e9" },
  vix: { id: "vix", label: "VIX", group: "risk_rates_vol", color: "#ef4444" },
  broad_usd: { id: "broad-usd", label: "Broad USD", group: "safe_haven_fx", color: "#7c3aed" },
  usd_cny: { id: "usd-cny", label: "USD/CNY", group: "safe_haven_fx", color: "#9333ea" },
  us10y: { id: "us10y", label: "US 10Y", group: "risk_rates_vol", color: "#64748b" },
  sp500: { id: "sp500", label: "S&P 500", group: "risk_rates_vol", color: "#16a34a" },
  nasdaq: { id: "nasdaq", label: "NASDAQ", group: "risk_rates_vol", color: "#22c55e" },
  us_cpi: { id: "us-cpi", label: "US CPI", group: "risk_rates_vol", color: "#f97316" },
};

const PENDING_MARKET_SERIES = [
  {
    id: "gold-pending",
    target: "gold",
    label: "Gold",
    group: "safe_haven_fx",
    color: "#f59e0b",
    unit: "USD/oz",
    status: "pending_source",
    source_id: "gold-pending",
    provider_id: "pending",
    license_status: "pending",
    raw_path: null,
    source_hash: null,
    points: [],
    caveat: "Pending stable daily source; no line is drawn until raw lineage is available.",
    evidenceEligible: false,
  },
  {
    id: "usd-cnh-pending",
    target: "usd_cnh",
    label: "USD/CNH",
    group: "safe_haven_fx",
    color: "#a855f7",
    unit: "CNH per USD",
    status: "pending_source",
    source_id: "usdcnh-pending",
    provider_id: "pending",
    license_status: "pending",
    raw_path: null,
    source_hash: null,
    points: [],
    caveat: "Pending offshore CNH source; FRED DEXCHUS is USD/CNY only.",
    evidenceEligible: false,
  },
];

function csvSplitLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

async function readCsv(path) {
  const text = await readFile(path, "utf8");
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = csvSplitLine(headerLine);
  return lines.map((line) => {
    const cells = csvSplitLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
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

function parseDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.valueOf())) return null;
  return value;
}

function daysBetween(later, earlier) {
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
}

function newestIso(values) {
  return values.filter(Boolean).sort().at(-1) ?? BUILT_AT;
}

function numeric(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const number = Number(s);
  return Number.isFinite(number) ? number : null;
}

function safeTimestamp(timestamp) {
  return timestamp.replace(/[:.]/g, "-");
}

async function rawHash(relativePath) {
  if (!relativePath) return null;
  try {
    const text = await readFile(resolve(root, relativePath), "utf8");
    return `sha256:${createHash("sha256").update(text).digest("hex")}`;
  } catch {
    return null;
  }
}

async function fredLineage(row) {
  if (!row?.series_id || !row?.retrieved_at) {
    return { raw_path: null, source_hash: null };
  }
  const raw_path = `data/raw/fred/${row.series_id}/${safeTimestamp(row.retrieved_at)}.csv`;
  return { raw_path, source_hash: await rawHash(raw_path) };
}

function marketUnit(target, fallback) {
  if (target === "brent" || target === "wti") return "USD/bbl";
  if (target === "usd_cny") return "CNY per USD";
  if (target === "us10y") return "%";
  if (target === "vix") return "index";
  return fallback || "index";
}

async function buildFredSeries(rows) {
  const byTarget = new Map();
  for (const row of rows) {
    const value = numeric(row.value);
    if (value == null || !row.target || !row.date) continue;
    if (!byTarget.has(row.target)) byTarget.set(row.target, []);
    byTarget.get(row.target).push({ ...row, value });
  }

  const series = [];
  for (const [target, targetRows] of byTarget.entries()) {
    const meta = MARKET_META[target];
    if (!meta) continue;
    targetRows.sort((a, b) => a.date.localeCompare(b.date));
    const latest = targetRows.at(-1);
    const lineage = await fredLineage(latest);
    series.push({
      id: meta.id,
      target,
      label: meta.label,
      group: meta.group,
      color: meta.color,
      unit: marketUnit(target, latest.unit),
      status: "active",
      source_id: "fred-market",
      provider_id: "fred",
      license_status: "open",
      retrieved_at: latest.retrieved_at,
      raw_path: lineage.raw_path,
      source_hash: lineage.source_hash,
      points: targetRows.map((row) => ({ date: row.date, value: row.value })),
      caveat: `${meta.label} from FRED normalized local history; raw endpoint is not called by the UI.`,
      evidenceEligible: false,
    });
  }
  return series;
}

function latestRowsByTarget(rows) {
  const byTarget = new Map();
  for (const row of rows) {
    const value = numeric(row.value);
    if (!row.target || value == null) continue;
    const previous = byTarget.get(row.target);
    if (!previous || row.date > previous.date) byTarget.set(row.target, { ...row, value });
  }
  return byTarget;
}

function deltaFromRows(rows, target, days) {
  const targetRows = rows
    .filter((row) => row.target === target && numeric(row.value) != null)
    .map((row) => ({ ...row, value: Number(row.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = targetRows.at(-1);
  if (!latest) return null;
  const latestDate = parseDate(latest.date);
  if (!latestDate) return null;
  const previous = [...targetRows].reverse().find((row) => {
    const date = parseDate(row.date);
    return date && daysBetween(latestDate, date) >= days;
  });
  return previous ? latest.value - previous.value : null;
}

async function buildMarketSnapshot(fredRows) {
  const latestByTarget = latestRowsByTarget(fredRows);
  const activeTargets = ["brent", "wti", "vix", "broad_usd"];
  const snapshot = [];
  for (const target of activeTargets) {
    const row = latestByTarget.get(target);
    const meta = MARKET_META[target];
    snapshot.push({
      target,
      label: meta.label,
      value: row?.value ?? null,
      unit: marketUnit(target, row?.unit),
      delta_1d: deltaFromRows(fredRows, target, 1),
      delta_7d: deltaFromRows(fredRows, target, 7),
      source_id: row?.source_id ?? "fred-market",
      retrieved_at: row?.retrieved_at ?? BUILT_AT,
      status: row ? "active" : "pending_source",
      caveat: row ? "FRED normalized local snapshot." : "FRED row missing from normalized history.",
    });
  }

  snapshot.push(
    {
      target: "gold",
      label: "Gold",
      value: null,
      unit: "USD/oz",
      source_id: "gold-pending",
      retrieved_at: BUILT_AT,
      status: "pending_source",
      caveat: "Pending stable daily source.",
    },
    {
      target: "usd_cnh",
      label: "USD/CNH",
      value: null,
      unit: "CNH per USD",
      source_id: "usdcnh-pending",
      retrieved_at: BUILT_AT,
      status: "pending_source",
      caveat: "Pending offshore CNH source.",
    },
  );
  return snapshot;
}

function buildTrafficRows(transitRows) {
  return transitRows
    .filter((row) =>
      row.source_id === "imf-portwatch-hormuz" &&
      row.metric === "daily_transit_calls" &&
      (row.vessel_type || "all") === "all" &&
      row.window === "daily" &&
      numeric(row.value) != null,
    )
    .map((row) => ({ ...row, value: Number(row.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function rollingAverage(rows, index, windowSize) {
  const window = rows.slice(Math.max(0, index - windowSize + 1), index + 1);
  if (window.length === 0) return null;
  return window.reduce((sum, row) => sum + row.value, 0) / window.length;
}

function sameWindowBaseline(rows, row) {
  const currentDate = parseDate(row.date);
  if (!currentDate) return null;
  const past = rows.filter((candidate) => {
    const candidateDate = parseDate(candidate.date);
    if (!candidateDate || candidate.date >= row.date) return false;
    const diffDays = daysBetween(currentDate, candidateDate);
    return diffDays >= 350 && diffDays <= 380;
  });
  if (past.length === 0) return null;
  return past.reduce((sum, candidate) => sum + candidate.value, 0) / past.length;
}

function buildTrafficSeries(transitRows) {
  const rows = buildTrafficRows(transitRows);
  const points = rows.map((row) => ({ date: row.date, value: row.value }));
  const rollingPoints = rows.map((row, index) => ({
    date: row.date,
    value: Number(rollingAverage(rows, index, 7).toFixed(2)),
  }));
  const baselinePoints = rows
    .map((row) => {
      const baseline = sameWindowBaseline(rows, row);
      return baseline == null ? null : { date: row.date, value: Number(baseline.toFixed(2)) };
    })
    .filter(Boolean);
  const latest = rows.at(-1);
  const raw = latest ?? {};
  const common = {
    source_id: "imf-portwatch-hormuz",
    provider_id: "imf-portwatch",
    license_status: "open",
    retrieved_at: raw.retrieved_at,
    raw_path: raw.raw_path || null,
    source_hash: raw.source_hash || null,
    caveat: raw.caveat || "AIS-derived PortWatch aggregate; revisions and AIS/GNSS limitations apply.",
    evidenceEligible: false,
  };

  return {
    dailySeries: {
      id: "portwatch-daily-transit-calls-all",
      target: "portwatch_daily_transit_calls_all",
      label: "PortWatch daily transit calls",
      group: "traffic",
      color: "#0b66f6",
      unit: "daily transit calls",
      status: rows.length > 0 ? "active" : "pending_source",
      points,
      baseline_points: baselinePoints,
      ...common,
    },
    rollingSeries: {
      id: "portwatch-7d-avg-transit-calls-all",
      target: "portwatch_7d_avg_transit_calls_all",
      label: "PortWatch 7d avg",
      group: "traffic",
      color: "#38bdf8",
      unit: "daily transit calls",
      status: rows.length > 0 ? "active" : "pending_source",
      points: rollingPoints,
      ...common,
    },
    rows,
    baselinePoints,
  };
}

function buildTrafficSnapshot(traffic) {
  const latest = traffic.rows.at(-1);
  if (!latest) return null;
  const latestIndex = traffic.rows.length - 1;
  const avg7d = rollingAverage(traffic.rows, latestIndex, 7);
  const baseline = sameWindowBaseline(traffic.rows, latest);
  return {
    latest_date: latest.date,
    latest_value: latest.value,
    avg_7d: avg7d == null ? null : Number(avg7d.toFixed(2)),
    baseline_1y_same_window: baseline == null ? null : Number(baseline.toFixed(2)),
    delta_vs_baseline_pct: baseline ? Number((((latest.value - baseline) / baseline) * 100).toFixed(2)) : null,
    vessel_type: "all",
    source_id: "imf-portwatch-hormuz",
    retrieved_at: latest.retrieved_at,
    caveat: latest.caveat || "AIS-derived PortWatch aggregate; revisions and AIS/GNSS limitations apply.",
  };
}

function currentSeverity(events) {
  const latest = events[0];
  if (!latest) return "quiet";
  const eventDate = new Date(latest.event_at);
  if (Number.isNaN(eventDate.valueOf())) return "quiet";
  if ((Date.now() - eventDate.getTime()) / DAY_MS > 14) return "quiet";
  return latest.severity_hint === "deescalation" ? "routine" : latest.severity_hint;
}

function buildPolymarketRefs(refs) {
  const now = Date.now();
  const selected = refs
    .filter((ref) => ref.selected_for_overview)
    .map((ref) => {
      const retrievedAt = new Date(ref.retrieved_at).getTime();
      const stale = ref.source_hash == null && (Number.isNaN(retrievedAt) || now - retrievedAt > POLYMARKET_STALE_MS);
      return stale ? { ...ref, stale: true } : ref;
    });
  const order = new Map([["hormuz", 0], ["us_iran", 1], ["oil", 2], ["regional", 3], ["iran_domestic", 4]]);
  return selected.sort((a, b) => {
    const aOrder = Math.min(...a.topic_tags.map((tag) => order.get(tag) ?? 99));
    const bOrder = Math.min(...b.topic_tags.map((tag) => order.get(tag) ?? 99));
    return aOrder - bOrder || a.title.localeCompare(b.title);
  });
}

function buildSourceIndex(events) {
  const byKey = new Map();
  for (const event of events) {
    const key = `${event.source_id}:${event.source_name}:${event.source_type}`;
    const previous = byKey.get(key) ?? {
      source_id: event.source_id,
      source_name: event.source_name,
      source_type: event.source_type,
      event_count: 0,
    };
    previous.event_count += 1;
    byKey.set(key, previous);
  }
  return [...byKey.values()].sort((a, b) => b.event_count - a.event_count || a.source_name.localeCompare(b.source_name));
}

function buildTopicIndex(events) {
  const byTag = new Map();
  for (const event of events) {
    for (const tag of event.tags ?? []) {
      byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
    }
  }
  return [...byTag.entries()]
    .map(([tag, event_count]) => ({ tag, event_count }))
    .sort((a, b) => b.event_count - a.event_count || a.tag.localeCompare(b.tag));
}

function buildEventOverlays(events) {
  const oneYearAgo = new Date(Date.now() - 365 * DAY_MS);
  return events
    .filter((event) => {
      const date = new Date(event.event_at);
      return !Number.isNaN(date.valueOf()) && date >= oneYearAgo;
    })
    .map((event) => ({
      event_id: event.event_id,
      event_at: event.event_at,
      title: event.title,
      severity_hint: event.severity_hint,
      related_market_targets: event.related_market_targets ?? [],
    }));
}

async function main() {
  const [baseline, fredRows, transitRows, advisories, eventsRaw, polymarketRaw] = await Promise.all([
    readJson(paths.baseline, []),
    readCsv(paths.fred),
    readCsv(paths.transits),
    readJsonLines(paths.advisories),
    readJsonLines(paths.events),
    readJson(paths.polymarket, []),
  ]);

  const events = eventsRaw.sort((a, b) => String(b.event_at).localeCompare(String(a.event_at)));
  const traffic = buildTrafficSeries(transitRows);
  const fredSeries = await buildFredSeries(fredRows);
  const polymarketRefs = buildPolymarketRefs(polymarketRaw);
  const dataAsOf = newestIso([
    ...baseline.map((fact) => fact.retrieved_at),
    ...fredRows.map((row) => row.retrieved_at),
    ...transitRows.map((row) => row.retrieved_at),
    ...advisories.map((row) => row.retrieved_at),
    ...events.map((event) => event.retrieved_at),
    ...polymarketRaw.map((ref) => ref.retrieved_at),
  ]);

  const overview = {
    built_at: BUILT_AT,
    data_as_of: dataAsOf,
    baseline: baseline.filter((fact) => fact.source_id === "eia-iea-hormuz"),
    current_severity: currentSeverity(events),
    latest_events: events.slice(0, 3),
    traffic_snapshot: buildTrafficSnapshot(traffic),
    market_snapshot: await buildMarketSnapshot(fredRows),
    polymarket_refs: polymarketRefs,
  };

  const news = {
    built_at: BUILT_AT,
    data_as_of: dataAsOf,
    events,
    source_index: buildSourceIndex(events),
    topic_index: buildTopicIndex(events),
  };

  const market = {
    built_at: BUILT_AT,
    data_as_of: dataAsOf,
    series: [
      traffic.dailySeries,
      traffic.rollingSeries,
      ...fredSeries,
      ...PENDING_MARKET_SERIES,
    ],
    event_overlays: buildEventOverlays(events),
  };

  await mkdir(paths.generatedDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(paths.generatedDir, "overview_snapshot.json"), `${JSON.stringify(overview, null, 2)}\n`),
    writeFile(resolve(paths.generatedDir, "news_timeline.json"), `${JSON.stringify(news, null, 2)}\n`),
    writeFile(resolve(paths.generatedDir, "market_chart.json"), `${JSON.stringify(market, null, 2)}\n`),
  ]);

  console.log(
    `build:generated wrote overview_snapshot.json news_timeline.json market_chart.json ` +
      `(events=${events.length}, market_series=${market.series.length}, polymarket_refs=${polymarketRefs.length})`,
  );
}

await main();
