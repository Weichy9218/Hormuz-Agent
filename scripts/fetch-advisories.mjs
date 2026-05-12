// Snapshot official maritime advisory pages into local raw files and a normalized JSONL index.
// This script records fetch status and parsed page-level advisory candidates; it does not
// create EvidenceClaim objects or forecast updates.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const RETRIEVED_AT = new Date().toISOString();
const SAFE_RETRIEVED_AT = RETRIEVED_AT.replace(/[:.]/g, "-");

const SOURCES = [
  {
    sourceName: "UKMTO",
    url: "https://www.ukmto.org/recent-incidents",
    kind: "recent-incidents",
  },
  {
    sourceName: "MARAD",
    url: "https://www.maritime.dot.gov/msci-alerts",
    kind: "alerts",
  },
  {
    sourceName: "MARAD",
    url: "https://www.maritime.dot.gov/msci-advisories",
    kind: "advisories",
  },
  {
    sourceName: "IMO",
    url: "https://www.imo.org/en/mediacentre/hottopics/pages/strait-of-hormuz-middle-east-data.aspx",
    kind: "hormuz-hub",
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
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return textFromHtml(h1 ?? title ?? "Untitled advisory page");
}

function absoluteUrl(href, baseUrl) {
  return new URL(href, baseUrl).href;
}

function extractMaradCandidates(html, baseUrl) {
  const candidates = [];
  const seen = new Set();
  const linkPattern = /href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const href = match[1];
    const title = textFromHtml(match[2]);
    const combined = `${href} ${title}`;
    if (!/hormuz|persian gulf|gulf of oman|arabian sea|red sea|gulf of aden/i.test(combined)) {
      continue;
    }
    if (!/\/msci\//.test(href)) continue;
    const url = absoluteUrl(href, baseUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({ title, url });
  }
  return candidates;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "hormuz-risk-interface data snapshot",
    },
  });
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type") ?? "unknown",
    text: await response.text(),
  };
}

async function writeRaw(sourceName, kind, label, text) {
  const dir = resolve(root, "data", "raw", "advisories", sourceName.toLowerCase(), kind);
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `${SAFE_RETRIEVED_AT}-${label}.html`);
  await writeFile(path, text);
  return path;
}

function relativeRawPath(path) {
  return path.slice(root.length + 1);
}

function advisoryId(sourceName, url) {
  const slug = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "page";
  return `${sourceName.toLowerCase()}-${slug}`;
}

async function main() {
  const normalizedPath = resolve(root, "data", "normalized", "maritime", "advisories.jsonl");
  await mkdir(dirname(normalizedPath), { recursive: true });
  const records = [];

  for (const source of SOURCES) {
    const result = await fetchText(source.url);
    const rawPath = await writeRaw(source.sourceName, source.kind, "index", result.text);
    const rawHash = sha256(result.text);

    records.push({
      source_id: "official-advisory",
      advisory_id: advisoryId(source.sourceName, source.url),
      source_name: source.sourceName,
      title: titleFromHtml(result.text),
      geography: ["Strait of Hormuz", "Persian Gulf", "Gulf of Oman", "Arabian Sea"],
      event_type: "source_snapshot",
      severity_hint: result.ok ? "routine" : "watch",
      source_url: source.url,
      retrieved_at: RETRIEVED_AT,
      license_status: source.sourceName === "UKMTO" ? "unknown" : "open",
      fetch_status: result.status,
      content_type: result.contentType,
      raw_path: relativeRawPath(rawPath),
      source_hash: `sha256:${rawHash}`,
      caveat: result.ok
        ? "Page snapshot only; parser output is candidate advisory metadata, not forecast evidence."
        : "Fetch did not return a usable official page; keep as source health status only.",
    });

    if (source.sourceName !== "MARAD" || !result.ok) continue;
    for (const candidate of extractMaradCandidates(result.text, source.url).slice(0, 12)) {
      const detail = await fetchText(candidate.url);
      const detailRawPath = await writeRaw(source.sourceName, source.kind, advisoryId(source.sourceName, candidate.url), detail.text);
      records.push({
        source_id: "official-advisory",
        advisory_id: advisoryId(source.sourceName, candidate.url),
        source_name: "MARAD",
        title: candidate.title || titleFromHtml(detail.text),
        geography: ["Strait of Hormuz", "Persian Gulf", "Gulf of Oman", "Arabian Sea"],
        event_type: "maritime_advisory",
        severity_hint: "elevated",
        source_url: candidate.url,
        retrieved_at: RETRIEVED_AT,
        license_status: "open",
        fetch_status: detail.status,
        content_type: detail.contentType,
        raw_path: relativeRawPath(detailRawPath),
        source_hash: `sha256:${sha256(detail.text)}`,
        caveat: "MARAD page-level candidate; evidence use still requires source review and cross-verification gates.",
      });
    }
  }

  await writeFile(normalizedPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  console.log(`fetch:advisories wrote ${records.length} advisory snapshot records.`);
}

await main();
