// Snapshot public Hormuz traffic/flow proxy pages and stable table endpoints.
// PortWatch numeric rows remain source observations only; they do not create
// EvidenceClaim objects or forecast updates.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const RETRIEVED_AT = new Date().toISOString();
const SAFE_RETRIEVED_AT = RETRIEVED_AT.replace(/[:.]/g, "-");
const PORTWATCH_SOURCE_URL = "https://portwatch.imf.org/pages/cb5856222a5b4105adc6ee7e880a1730";
const PORTWATCH_DAILY_LAYER_URL =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0";
const PORTWATCH_METADATA_LAYER_URL =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0";
const PORTWATCH_PORT_ID = "chokepoint6";
const IMO_SOURCE_URL =
  "https://www.imo.org/en/mediacentre/hottopics/pages/strait-of-hormuz-middle-east-data.aspx";

const SOURCES = [
  {
    sourceId: "imf-portwatch-hormuz",
    label: "imf-portwatch-hormuz-page",
    metric: "daily_transit_calls",
    sourceUrl: PORTWATCH_SOURCE_URL,
    caveat:
      "AIS-derived PortWatch aggregate; GPS jamming, AIS spoofing, dark vessels, and revisions are material risks.",
  },
  {
    sourceId: "imf-portwatch-hormuz",
    label: "imf-portwatch-download-index",
    metric: "daily_transit_calls",
    sourceUrl: "https://data-download.imf.org/ClimateData/portwatch-monitor.html",
    caveat:
      "PortWatch download page snapshot; parser must verify a stable data endpoint before producing numeric flow observations.",
  },
  {
    sourceId: "imo-hormuz-monthly",
    label: "imo-hormuz-monthly-page",
    metric: "monthly_avg_daily_transits",
    sourceUrl: IMO_SOURCE_URL,
    caveat:
      "IMO monthly transit page snapshot; current parser stores page/image metadata, not extracted chart values.",
  },
];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "Traffic source page";
  return textFromHtml(title);
}

function extractImageLinks(html, baseUrl) {
  const links = [];
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/gi)) {
    const href = match[1];
    if (!/Transit_Hormuz|Hormuz|portwatch|download/i.test(href)) continue;
    try {
      links.push(new URL(href, baseUrl).href);
    } catch {
      // Ignore malformed page-local assets.
    }
  }
  return [...new Set(links)];
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "hormuz-risk-interface traffic snapshot",
    },
  });
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type") ?? "unknown",
    text: await response.text(),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "hormuz-risk-interface traffic snapshot",
    },
  });
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type") ?? "unknown",
    text: await response.text(),
  };
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "hormuz-risk-interface traffic snapshot",
    },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type") ?? "unknown",
    bytes,
  };
}

function relativeRawPath(path) {
  return path.slice(root.length + 1);
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, fields) {
  return [
    fields.join(","),
    ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(",")),
  ].join("\n") + "\n";
}

function parseJsonResponse(result, label) {
  try {
    return JSON.parse(result.text);
  } catch (error) {
    throw new Error(`${label}: expected JSON response, got ${result.contentType}: ${error.message}`);
  }
}

function portWatchQueryUrl(resultRecordCount) {
  const params = new URLSearchParams({
    f: "json",
    where: `portid='${PORTWATCH_PORT_ID}'`,
    outFields:
      "date,portid,portname,n_total,n_tanker,n_cargo,capacity,n_container,n_dry_bulk,n_general_cargo,n_roro",
    returnGeometry: "false",
    orderByFields: "date DESC",
    resultRecordCount: String(resultRecordCount),
  });
  return `${PORTWATCH_DAILY_LAYER_URL}/query?${params.toString()}`;
}

async function snapshotPortWatch(rawDir) {
  const metaResult = await fetchJson(`${PORTWATCH_METADATA_LAYER_URL}/query?f=json&where=portid%3D%27${PORTWATCH_PORT_ID}%27&outFields=*&returnGeometry=false&resultRecordCount=5`);
  const dailyResult = await fetchJson(portWatchQueryUrl(60));
  const metaPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}-portwatch-chokepoint-metadata.json`);
  const dailyPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}-portwatch-daily-chokepoint6.json`);
  await writeFile(metaPath, metaResult.text);
  await writeFile(dailyPath, dailyResult.text);

  const dailyJson = parseJsonResponse(dailyResult, "PortWatch daily chokepoint data");
  const features = dailyJson.features ?? [];
  if (!dailyResult.ok || dailyJson.error || features.length === 0) {
    return {
      rows: [{
        source_id: "imf-portwatch-hormuz",
        metric: "daily_transit_calls",
        date: RETRIEVED_AT.slice(0, 10),
        value: "",
        direction: "both",
        window: "source_snapshot",
        source_url: PORTWATCH_SOURCE_URL,
        retrieved_at: RETRIEVED_AT,
        license_status: "open",
        fetch_status: dailyResult.status,
        content_type: dailyResult.contentType,
        raw_path: relativeRawPath(dailyPath),
        source_hash: `sha256:${sha256(dailyResult.text)}`,
        caveat:
          "PortWatch daily chokepoint query did not return numeric rows; keep as source-health status only.",
      }],
      rawRecords: [
        {
          label: "portwatch_chokepoint_metadata",
          path: relativeRawPath(metaPath),
          hash: `sha256:${sha256(metaResult.text)}`,
          status: metaResult.status,
          contentType: metaResult.contentType,
        },
      ],
    };
  }

  const rows = features
    .map((feature) => feature.attributes)
    .filter((row) => row?.portid === PORTWATCH_PORT_ID && row.date)
    .map((row) => ({
      source_id: "imf-portwatch-hormuz",
      metric: "daily_transit_calls",
      date: row.date,
      value: row.n_total,
      direction: "both",
      window: "daily",
      source_url: PORTWATCH_SOURCE_URL,
      retrieved_at: RETRIEVED_AT,
      license_status: "open",
      fetch_status: dailyResult.status,
      content_type: dailyResult.contentType,
      raw_path: relativeRawPath(dailyPath),
      source_hash: `sha256:${sha256(dailyResult.text)}`,
      caveat:
        `PortWatch ${PORTWATCH_PORT_ID} ${row.portname}; AIS/GNSS caveat applies. ` +
        `n_tanker=${row.n_tanker}; n_cargo=${row.n_cargo}; capacity=${row.capacity}.`,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    rows,
    rawRecords: [
      {
        label: "portwatch_chokepoint_metadata",
        path: relativeRawPath(metaPath),
        hash: `sha256:${sha256(metaResult.text)}`,
        status: metaResult.status,
        contentType: metaResult.contentType,
      },
    ],
  };
}

function imoChartUrls(html, baseUrl) {
  const urls = [];
  for (const match of html.matchAll(/(?:href|src)="([^"]*Transit_Hormuz[^"]+\.png)"/gi)) {
    urls.push(new URL(match[1], baseUrl).href);
  }
  return [...new Set(urls)];
}

async function snapshotImoCharts(html, rawDir) {
  const rows = [];
  for (const [index, url] of imoChartUrls(html, IMO_SOURCE_URL).entries()) {
    const result = await fetchBytes(url);
    const rawPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}-imo-hormuz-chart-${index + 1}.png`);
    await writeFile(rawPath, result.bytes);
    rows.push({
      source_id: "imo-hormuz-monthly",
      metric: "monthly_avg_daily_transits",
      date: RETRIEVED_AT.slice(0, 10),
      value: "",
      direction: "both",
      window: "chart_image_snapshot",
      source_url: url,
      retrieved_at: RETRIEVED_AT,
      license_status: "open",
      fetch_status: result.status,
      content_type: result.contentType,
      raw_path: relativeRawPath(rawPath),
      source_hash: `sha256:${createHash("sha256").update(result.bytes).digest("hex")}`,
      caveat:
        "IMO publishes the current monthly Hormuz transit values as chart images; OCR/manual extraction is required before numeric evidence use.",
    });
  }
  return rows;
}

async function main() {
  const normalizedPath = resolve(root, "data", "normalized", "maritime", "hormuz_transits.csv");
  const fields = [
    "source_id",
    "metric",
    "date",
    "value",
    "direction",
    "window",
    "source_url",
    "retrieved_at",
    "license_status",
    "fetch_status",
    "content_type",
    "raw_path",
    "source_hash",
    "caveat",
  ];
  const rows = [];

  for (const source of SOURCES) {
    const result = await fetchText(source.sourceUrl);
    const rawDir = resolve(root, "data", "raw", "traffic", source.sourceId);
    await mkdir(rawDir, { recursive: true });
    const rawPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}-${source.label}.html`);
    await writeFile(rawPath, result.text);
    const hash = sha256(result.text);
    const imageLinks = extractImageLinks(result.text, source.sourceUrl);

    rows.push({
      source_id: source.sourceId,
      metric: source.metric,
      date: RETRIEVED_AT.slice(0, 10),
      value: "",
      direction: "both",
      window: "source_snapshot",
      source_url: source.sourceUrl,
      retrieved_at: RETRIEVED_AT,
      license_status: "open",
      fetch_status: result.status,
      content_type: result.contentType,
      raw_path: relativeRawPath(rawPath),
      source_hash: `sha256:${hash}`,
      caveat: `${source.caveat} title=${titleFromHtml(result.text)} linked_assets=${imageLinks.slice(0, 5).join(" | ")}`,
    });

    if (source.label === "imf-portwatch-hormuz-page") {
      const snapshot = await snapshotPortWatch(rawDir);
      rows.push(...snapshot.rows);
    }

    if (source.label === "imo-hormuz-monthly-page") {
      rows.push(...await snapshotImoCharts(result.text, rawDir));
    }
  }

  await mkdir(dirname(normalizedPath), { recursive: true });
  await writeFile(normalizedPath, toCsv(rows, fields));

  console.log(`fetch:traffic wrote ${rows.length} traffic source snapshot records.`);
}

await main();
