// Audit market provider registry boundaries.
//
// Provider candidates are allowed to be visible in UI caveats, but only active
// production providers may generate evidence-eligible market rows.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const providers = JSON.parse(
  await readFile(resolve(root, "data/registry/market_providers.json"), "utf8"),
);
const marketSeries = JSON.parse(
  await readFile(resolve(root, "data/generated/market_series.json"), "utf8"),
);

const providerStatuses = new Set([
  "active",
  "candidate_smoke_test",
  "dev_crosscheck_only",
  "licensed_pending",
  "rejected",
]);
const licenseStatuses = new Set([
  "open",
  "token_required",
  "public_terms_unclear",
  "personal_research_only",
  "licensed_required",
  "licensed",
  "unknown",
]);
const allowedUses = new Set([
  "production_active",
  "candidate_smoke_test",
  "dev_crosscheck_only",
]);

const violations = [];
const byId = new Map();

for (const provider of providers) {
  const label = provider.provider_id ?? "market provider";
  if (!provider.provider_id) violations.push(`${label}: missing provider_id`);
  if (byId.has(provider.provider_id)) {
    violations.push(`${label}: duplicate provider_id`);
  }
  byId.set(provider.provider_id, provider);

  if (!providerStatuses.has(provider.provider_status)) {
    violations.push(`${label}: invalid provider_status ${provider.provider_status}`);
  }
  if (!licenseStatuses.has(provider.license_status)) {
    violations.push(`${label}: invalid license_status ${provider.license_status}`);
  }
  if (!allowedUses.has(provider.allowed_use)) {
    violations.push(`${label}: invalid allowed_use ${provider.allowed_use}`);
  }
  if (!Array.isArray(provider.target_ids) || provider.target_ids.length === 0) {
    violations.push(`${label}: missing target_ids`);
  }
  if (!Array.isArray(provider.promotion_gate) || provider.promotion_gate.length === 0) {
    violations.push(`${label}: missing promotion_gate`);
  }
  if (!provider.caveat) {
    violations.push(`${label}: missing caveat`);
  }

  if (provider.provider_status === "active") {
    if (provider.allowed_use !== "production_active") {
      violations.push(`${label}: active provider must have allowed_use=production_active`);
    }
    if (!["open", "licensed"].includes(provider.license_status)) {
      violations.push(`${label}: active provider must have open/licensed license_status`);
    }
  }
}

for (const providerId of ["akshare", "yfinance"]) {
  const provider = byId.get(providerId);
  if (!provider) {
    violations.push(`${providerId}: required dev/cross-check provider entry missing`);
    continue;
  }
  if (
    provider.provider_status === "active" ||
    provider.allowed_use === "production_active"
  ) {
    violations.push(`${providerId}: cannot be active production`);
  }
}

const fred = byId.get("fred");
if (!fred || fred.provider_status !== "active") {
  violations.push("fred: active provider entry is required for current FRED market rows");
}
if (fred?.target_ids?.includes("usd_cnh")) {
  violations.push("fred: must not list usd_cnh; DEXCHUS is USD/CNY only");
}
if (fred && !fred.target_ids?.includes("usd_cny")) {
  violations.push("fred: must list usd_cny for FRED DEXCHUS cross-check");
}

for (const series of marketSeries) {
  if (series.provider_id && !byId.has(series.provider_id)) {
    violations.push(`${series.id}: provider_id ${series.provider_id} missing from registry`);
  }
  for (const providerId of series.candidate_provider_ids ?? []) {
    if (!byId.has(providerId)) {
      violations.push(`${series.id}: candidate provider ${providerId} missing from registry`);
    }
  }

  if (series.status === "active") {
    const provider = byId.get(series.provider_id);
    if (!provider) continue;
    if (provider.provider_status !== "active") {
      violations.push(`${series.id}: active row uses non-active provider ${provider.provider_id}`);
    }
    if (provider.allowed_use !== "production_active") {
      violations.push(`${series.id}: active row uses provider not approved for production`);
    }
  }
}

if (violations.length > 0) {
  console.error("audit:market-providers FAILED");
  for (const violation of violations) console.error("  -", violation);
  process.exit(1);
}

console.log(`audit:market-providers passed: ${providers.length} provider entries validated.`);
