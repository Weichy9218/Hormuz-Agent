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
const PORTWATCH_MIN_DAILY_ROWS = 2_000;
const PORTWATCH_PAGE_SIZE = 1_000;
const PORTWATCH_OUT_FIELDS =
  "date,portid,portname,n_total,n_tanker,n_cargo,capacity,n_container,n_dry_bulk,n_general_cargo,n_roro";
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

function portWatchQueryUrl(extraParams = {}) {
  const params = new URLSearchParams({
    f: "json",
    where: `portid='${PORTWATCH_PORT_ID}'`,
    returnGeometry: "false",
    ...extraParams,
  });
  return `${PORTWATCH_DAILY_LAYER_URL}/query?${params.toString()}`;
}

function portWatchRowsUrl(resultOffset) {
  return portWatchQueryUrl({
    outFields: PORTWATCH_OUT_FIELDS,
    orderByFields: "date ASC",
    resultOffset: String(resultOffset),
    resultRecordCount: String(PORTWATCH_PAGE_SIZE),
  });
}

function portWatchCountUrl() {
  return portWatchQueryUrl({
    returnCountOnly: "true",
  });
}

function portWatchStatsUrl() {
  return portWatchQueryUrl({
    outStatistics: JSON.stringify([
      { statisticType: "count", onStatisticField: "date", outStatisticFieldName: "row_count" },
      { statisticType: "min", onStatisticField: "date", outStatisticFieldName: "min_date" },
      { statisticType: "max", onStatisticField: "date", outStatisticFieldName: "max_date" },
    ]),
  });
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateOnly(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return new Date(value).toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function statsAttributes(statsJson) {
  const attributes = statsJson.features?.[0]?.attributes ?? {};
  return {
    row_count: finiteNumber(attributes.row_count),
    min_date: dateOnly(attributes.min_date),
    max_date: dateOnly(attributes.max_date),
  };
}

function metricRowsForDailyAttributes(row, rawInfo, coverage) {
  const portname = row.portname || "Strait of Hormuz";
  const date = dateOnly(row.date);
  if (!date) return [];

  const nCargo = finiteNumber(row.n_cargo);
  const nContainer = finiteNumber(row.n_container);
  const nDryBulk = finiteNumber(row.n_dry_bulk);
  const nGeneralCargo = finiteNumber(row.n_general_cargo);
  const nRoro = finiteNumber(row.n_roro);
  const other =
    nCargo == null || nContainer == null || nDryBulk == null || nGeneralCargo == null || nRoro == null
      ? null
      : nCargo - nContainer - nDryBulk - nGeneralCargo - nRoro;

  const metrics = [
    ["all", row.n_total],
    ["tanker", row.n_tanker],
    ["container", row.n_container],
    ["dry_bulk", row.n_dry_bulk],
    ["other", other != null && other >= 0 ? other : null],
  ];

  return metrics
    .map(([vesselType, rawValue]) => {
      const value = finiteNumber(rawValue);
      if (value == null) return null;
      return {
        source_id: "imf-portwatch-hormuz",
        metric: "daily_transit_calls",
        vessel_type: vesselType,
        date,
        value,
        direction: "both",
        window: "daily",
        source_url: PORTWATCH_SOURCE_URL,
        retrieved_at: RETRIEVED_AT,
        license_status: "open",
        fetch_status: rawInfo.status,
        content_type: rawInfo.contentType,
        raw_path: rawInfo.rawPath,
        source_hash: rawInfo.sourceHash,
        caveat:
          `PortWatch ${PORTWATCH_PORT_ID} ${portname} daily ${vesselType} transit calls; ` +
          `AIS/GNSS caveat applies. coverage=${coverage.min_date ?? "unknown"}-${coverage.max_date ?? "unknown"}; ` +
          `n_total=${row.n_total}; n_tanker=${row.n_tanker}; n_cargo=${row.n_cargo}; capacity=${row.capacity}.`,
      };
    })
    .filter(Boolean);
}

async function snapshotPortWatch(rawDir) {
  const metaResult = await fetchJson(`${PORTWATCH_METADATA_LAYER_URL}/query?f=json&where=portid%3D%27${PORTWATCH_PORT_ID}%27&outFields=*&returnGeometry=false&resultRecordCount=5`);
  const countResult = await fetchJson(portWatchCountUrl());
  const statsResult = await fetchJson(portWatchStatsUrl());
  const metaPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}-portwatch-chokepoint-metadata.json`);
  const countPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}-portwatch-daily-chokepoint6-count.json`);
  const statsPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}-portwatch-daily-chokepoint6-stats.json`);
  await writeFile(metaPath, metaResult.text);
  await writeFile(countPath, countResult.text);
  await writeFile(statsPath, statsResult.text);

  const countJson = parseJsonResponse(countResult, "PortWatch daily chokepoint row count");
  const statsJson = parseJsonResponse(statsResult, "PortWatch daily chokepoint coverage stats");
  if (!countResult.ok || countJson.error) {
    throw new Error(`PortWatch daily count query failed: ${countJson.error?.message ?? countResult.status}`);
  }
  if (!statsResult.ok || statsJson.error) {
    throw new Error(`PortWatch daily stats query failed: ${statsJson.error?.message ?? statsResult.status}`);
  }

  const expectedCount = finiteNumber(countJson.count) ?? 0;
  const coverage = statsAttributes(statsJson);
  const features = [];
  const pageRecords = [];
  let resultOffset = 0;
  let lastPageStatus = countResult.status;
  let lastPageContentType = countResult.contentType;

  while (expectedCount === 0 || features.length < expectedCount) {
    const pageResult = await fetchJson(portWatchRowsUrl(resultOffset));
    lastPageStatus = pageResult.status;
    lastPageContentType = pageResult.contentType;
    const pageJson = parseJsonResponse(pageResult, `PortWatch daily chokepoint page offset=${resultOffset}`);
    const pageFeatures = pageJson.features ?? [];
    const pagePath = resolve(
      rawDir,
      `${SAFE_RETRIEVED_AT}-portwatch-daily-chokepoint6-page-${pageRecords.length + 1}.json`,
    );
    await writeFile(pagePath, pageResult.text);
    pageRecords.push({
      label: `portwatch_daily_page_${pageRecords.length + 1}`,
      path: relativeRawPath(pagePath),
      hash: `sha256:${sha256(pageResult.text)}`,
      status: pageResult.status,
      contentType: pageResult.contentType,
      resultOffset,
      featureCount: pageFeatures.length,
      exceededTransferLimit: Boolean(pageJson.exceededTransferLimit),
    });

    if (!pageResult.ok || pageJson.error || pageFeatures.length === 0) {
      throw new Error(`PortWatch daily page offset=${resultOffset} returned no usable features.`);
    }

    features.push(...pageFeatures);
    resultOffset += pageFeatures.length;
    if (!pageJson.exceededTransferLimit && features.length >= expectedCount) break;
    if (!pageJson.exceededTransferLimit && pageFeatures.length < PORTWATCH_PAGE_SIZE) break;
  }

  const byDate = new Map();
  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const date = dateOnly(attributes.date);
    if (attributes.portid === PORTWATCH_PORT_ID && date) {
      byDate.set(date, { ...attributes, date });
    }
  }
  const dailyAttributes = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const mergedPayload = {
    source_id: "imf-portwatch-hormuz",
    layer_url: PORTWATCH_DAILY_LAYER_URL,
    port_id: PORTWATCH_PORT_ID,
    source_url: PORTWATCH_SOURCE_URL,
    retrieved_at: RETRIEVED_AT,
    expected_count: expectedCount,
    fetched_feature_count: features.length,
    normalized_daily_count: dailyAttributes.length,
    stats: coverage,
    pages: pageRecords,
    features: dailyAttributes,
  };
  const mergedText = `${JSON.stringify(mergedPayload, null, 2)}\n`;
  const dailyPath = resolve(rawDir, `${SAFE_RETRIEVED_AT}-portwatch-daily-chokepoint6-merged.json`);
  await writeFile(dailyPath, mergedText);
  const mergedHash = `sha256:${sha256(mergedText)}`;

  if (dailyAttributes.length === 0) {
    return {
      rows: [{
        source_id: "imf-portwatch-hormuz",
        metric: "daily_transit_calls",
        vessel_type: "all",
        date: RETRIEVED_AT.slice(0, 10),
        value: "",
        direction: "both",
        window: "source_snapshot",
        source_url: PORTWATCH_SOURCE_URL,
        retrieved_at: RETRIEVED_AT,
        license_status: "open",
        fetch_status: lastPageStatus,
        content_type: lastPageContentType,
        raw_path: relativeRawPath(dailyPath),
        source_hash: mergedHash,
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
        {
          label: "portwatch_daily_count",
          path: relativeRawPath(countPath),
          hash: `sha256:${sha256(countResult.text)}`,
          status: countResult.status,
          contentType: countResult.contentType,
        },
        {
          label: "portwatch_daily_stats",
          path: relativeRawPath(statsPath),
          hash: `sha256:${sha256(statsResult.text)}`,
          status: statsResult.status,
          contentType: statsResult.contentType,
        },
        ...pageRecords,
      ],
    };
  }

  if (expectedCount > 0 && dailyAttributes.length < expectedCount) {
    throw new Error(
      `PortWatch daily pagination normalized ${dailyAttributes.length} rows but upstream count is ${expectedCount}.`,
    );
  }

  if (dailyAttributes.length < PORTWATCH_MIN_DAILY_ROWS) {
    throw new Error(
      `PortWatch daily chokepoint query returned ${dailyAttributes.length} rows; need at least ${PORTWATCH_MIN_DAILY_ROWS} for historical event windows.`,
    );
  }

  const rawInfo = {
    status: lastPageStatus,
    contentType: "application/json",
    rawPath: relativeRawPath(dailyPath),
    sourceHash: mergedHash,
  };
  const rows = dailyAttributes.flatMap((row) => metricRowsForDailyAttributes(row, rawInfo, coverage));

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
      {
        label: "portwatch_daily_count",
        path: relativeRawPath(countPath),
        hash: `sha256:${sha256(countResult.text)}`,
        status: countResult.status,
        contentType: countResult.contentType,
      },
      {
        label: "portwatch_daily_stats",
        path: relativeRawPath(statsPath),
        hash: `sha256:${sha256(statsResult.text)}`,
        status: statsResult.status,
        contentType: statsResult.contentType,
      },
      {
        label: "portwatch_daily_merged",
        path: relativeRawPath(dailyPath),
        hash: mergedHash,
        status: lastPageStatus,
        contentType: "application/json",
      },
      ...pageRecords,
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
      vessel_type: "all",
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
    "vessel_type",
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
      vessel_type: "all",
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
