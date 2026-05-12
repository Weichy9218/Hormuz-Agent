// Audit pending/candidate source boundaries.
//
// Pending market targets and candidate providers may be visible as caveats, but
// they must not create active generated values or canonical EvidenceClaim input.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const snapshotPath = resolve(here, ".snapshot.json");

const refresh = spawnSync("node", [resolve(here, "build-canonical-snapshot.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (refresh.status !== 0) {
  console.error("audit:pending-sources FAILED: could not build canonical snapshot.");
  process.exit(1);
}

const marketSeries = JSON.parse(
  await readFile(resolve(root, "data/generated/market_series.json"), "utf8"),
);
const providers = JSON.parse(
  await readFile(resolve(root, "data/registry/market_providers.json"), "utf8"),
);
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

const providerById = new Map(providers.map((provider) => [provider.provider_id, provider]));
const candidateProviderIds = new Set(
  providers
    .filter((provider) => provider.provider_status !== "active")
    .map((provider) => provider.provider_id),
);
const observationById = new Map(
  snapshot.canonicalSourceObservations.map((observation) => [
    observation.observationId,
    observation,
  ]),
);
const sourceById = new Map(
  snapshot.sourceRegistry.map((source) => [source.id, source]),
);

const violations = [];

for (const series of marketSeries) {
  const status = series.status ?? (series.pending ? "pending_source" : "active");
  const isPending = status === "pending_source" || series.pending === true;
  const isCandidate = status === "candidate";

  if (isPending) {
    if (series.value !== null) {
      violations.push(`${series.id}: pending target cannot have non-null value`);
    }
    if (Array.isArray(series.points) && series.points.length > 0) {
      violations.push(`${series.id}: pending target cannot have generated points`);
    }
  }

  if (isPending || isCandidate) {
    if (series.evidenceEligible === true) {
      violations.push(`${series.id}: pending/candidate row cannot be evidenceEligible`);
    }
    if (series.status === "active") {
      violations.push(`${series.id}: pending/candidate row cannot be status=active`);
    }
  }

  if (series.provider_id) {
    const provider = providerById.get(series.provider_id);
    if (!provider) continue;
    if (provider.provider_status !== "active" && series.evidenceEligible === true) {
      violations.push(`${series.id}: candidate provider cannot produce evidenceEligible row`);
    }
  }

  if (series.id.includes("usd-cnh") || series.target === "usd_cnh") {
    if (/DEXCHUS|FRED/i.test(`${series.source ?? ""} ${series.sourceUrl ?? ""}`)) {
      violations.push(`${series.id}: USD/CNH cannot be populated from FRED DEXCHUS`);
    }
  }
}

for (const claim of snapshot.canonicalEvidenceClaims) {
  for (const observationId of claim.sourceObservationIds ?? []) {
    const observation = observationById.get(observationId);
    if (!observation) continue;
    const source = sourceById.get(observation.sourceId);
    if (source?.pending || observation.freshness === "pending") {
      violations.push(`${claim.evidenceId}: pending source ${observation.sourceId} consumed by EvidenceClaim`);
    }
    if (candidateProviderIds.has(observation.sourceId)) {
      violations.push(`${claim.evidenceId}: candidate provider ${observation.sourceId} consumed by EvidenceClaim`);
    }
  }
}

const evidenceIds = new Set(snapshot.canonicalEvidenceClaims.map((claim) => claim.evidenceId));
for (const evidenceId of snapshot.canonicalMarketRead.evidenceIds ?? []) {
  if (!evidenceIds.has(evidenceId)) {
    violations.push(`marketRead: unknown evidence id ${evidenceId}`);
  }
}

if (violations.length > 0) {
  console.error("audit:pending-sources FAILED");
  for (const violation of violations) console.error("  -", violation);
  process.exit(1);
}

console.log(
  `audit:pending-sources passed: ${marketSeries.length} market rows and ${snapshot.canonicalEvidenceClaims.length} evidence claims validated.`,
);
