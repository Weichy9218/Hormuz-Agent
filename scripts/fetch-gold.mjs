// Fetch source-bound Stooq XAU/USD daily OHLC history for the Market Gold row.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const SOURCE_ID = "stooq-market";
const PROVIDER_ID = "stooq";
const SYMBOL = "xauusd";
const DISPLAY_SYMBOL = "XAU/USD";
const SOURCE_URL = `https://stooq.com/q/d/?s=${SYMBOL}`;
const RETRIEVED_AT = new Date().toISOString();
const SAFE_RETRIEVED_AT = RETRIEVED_AT.replace(/[:.]/g, "-");
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 12;

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function numeric(value) {
  const s = String(value ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  const number = Number(s);
  return Number.isFinite(number) ? number : null;
}

function parseStooqDate(value) {
  const match = String(value).trim().match(/^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/);
  if (!match) return null;
  const months = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const month = months[match[2]];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function parseHistoryRows(html) {
  const rows = [];
  const rowPattern =
    /<tr><td[^>]*>\d+<\/td><td[^>]*>(\d{1,2} [A-Z][a-z]{2} \d{4})<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td>/g;
  for (const match of html.matchAll(rowPattern)) {
    const date = parseStooqDate(match[1]);
    const open = numeric(match[2]);
    const high = numeric(match[3]);
    const low = numeric(match[4]);
    const close = numeric(match[5]);
    if (!date || open == null || high == null || low == null || close == null) continue;
    rows.push({ date, open, high, low, close });
  }
  return rows;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,text/csv;q=0.9,*/*;q=0.8",
      "user-agent": "hormuz-risk-interface/0.1 data snapshot",
    },
  });
  if (!response.ok) {
    throw new Error(`stooq: request failed with ${response.status} for ${url}`);
  }
  return response.text();
}

async function main() {
  const endDate = process.env.GOLD_END_DATE
    ? new Date(`${process.env.GOLD_END_DATE}T00:00:00Z`)
    : new Date(`${ymd(new Date())}T00:00:00Z`);
  if (Number.isNaN(endDate.valueOf())) {
    throw new Error(`GOLD_END_DATE must be YYYY-MM-DD, got ${process.env.GOLD_END_DATE}`);
  }
  const startDate = new Date(endDate.getTime() - 365 * DAY_MS);
  const start = ymd(startDate);
  const end = ymd(endDate);

  const pages = [];
  const byDate = new Map();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${SOURCE_URL}&i=d&l=${page}`;
    const html = await fetchText(url);
    const rows = parseHistoryRows(html);
    pages.push({ page, url, html, row_count: rows.length });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (row.date >= start && row.date <= end) byDate.set(row.date, row);
    }

    const oldest = rows.at(-1)?.date;
    if (oldest && oldest < start) break;
  }

  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 200) {
    throw new Error(`stooq: expected at least 200 daily XAU/USD rows, got ${points.length}`);
  }
  const latest = points.at(-1);

  const rawSnapshot = {
    source_id: SOURCE_ID,
    provider_id: PROVIDER_ID,
    symbol: SYMBOL,
    source_url: SOURCE_URL,
    retrieved_at: RETRIEVED_AT,
    requested_start: start,
    requested_end: end,
    pages,
  };
  const rawPayload = `${JSON.stringify(rawSnapshot, null, 2)}\n`;
  const hash = `sha256:${createHash("sha256").update(rawPayload).digest("hex")}`;

  const rawDir = resolve(root, "data", "raw", "stooq", "xauusd");
  await mkdir(rawDir, { recursive: true });
  const rawPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}.json`);
  await writeFile(rawPath, rawPayload);

  const normalizedPath = resolve(root, "data", "normalized", "market", "gold_xauusd_history.json");
  await mkdir(dirname(normalizedPath), { recursive: true });
  await writeFile(
    normalizedPath,
    `${JSON.stringify(
      {
        source_id: SOURCE_ID,
        provider_id: PROVIDER_ID,
        target: "gold",
        symbol: DISPLAY_SYMBOL,
        quote_currency: "USD",
        value_field: "close",
        unit: "USD/oz",
        source_url: SOURCE_URL,
        retrieved_at: RETRIEVED_AT,
        start_date: points[0].date,
        end_date: latest.date,
        requested_start: start,
        requested_end: end,
        latest_close: latest.close,
        license_status: "open",
        raw_path: rawPath.slice(root.length + 1),
        source_hash: hash,
        points,
        caveat:
          "Stooq XAU/USD daily OHLC history; Market chart uses Close as spot proxy, not an LBMA benchmark or futures continuous contract.",
        evidenceEligible: false,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `fetch:gold wrote ${points.length} Stooq XAU/USD daily rows from ${points[0].date} to ${latest.date} ` +
      `(latest close ${latest.close} USD/oz, ${hash}).`,
  );
}

await main();
