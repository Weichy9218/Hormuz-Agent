// audit:evidence
//
// Rules enforced on the canonical snapshot:
//   - Every EvidenceClaim has sourceObservationIds (non-empty).
//   - Each referenced SourceObservation exists.
//   - Pending sources cannot produce high-confidence live evidence.
//   - EvidenceQuality fields are complete and use the allowed enum values.
//   - Mechanism tags are drawn from the canonical MechanismTag set.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const snapshotPath = resolve(here, ".snapshot.json");

// Refresh snapshot to make sure we audit the live canonical store.
const refresh = spawnSync("node", [resolve(here, "build-canonical-snapshot.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (refresh.status !== 0) {
  console.error("audit:evidence FAILED: could not build canonical snapshot.");
  process.exit(1);
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

const ALLOWED_MECHANISM_TAGS = new Set([
  "transit_risk_up",
  "traffic_flow_down",
  "insurance_cost_up",
  "mine_or_swarm_risk_up",
  "gnss_or_ais_interference",
  "naval_presence_up",
  "energy_supply_risk_up",
  "diplomatic_deescalation",
  "market_pricing_risk_premium",
  "market_not_pricing_closure",
]);

const QUALITY_VALUES = {
  sourceReliability: new Set(["high", "medium", "low"]),
  freshness: new Set(["fresh", "lagging", "stale"]),
  corroboration: new Set(["single_source", "multi_source", "conflicting"]),
  directness: new Set(["direct", "proxy", "context"]),
};

const violations = [];
const observationById = new Map(
  snapshot.canonicalSourceObservations.map((o) => [o.observationId, o]),
);
const sourceHashPattern = /^sha256:[a-f0-9]{64}$/;

// Pending sourceIds: any observation whose freshness is "pending" OR whose sourceId
// belongs to a pending source (we infer pending status via sourceId suffix and
// known pending ids).
const PENDING_SOURCE_IDS = new Set([
  "ais-flow-pending",
  "gold-pending",
  "usdcnh-pending",
]);

for (const claim of snapshot.canonicalEvidenceClaims) {
  if (!Array.isArray(claim.sourceObservationIds) || claim.sourceObservationIds.length === 0) {
    violations.push(`${claim.evidenceId}: missing sourceObservationIds`);
    continue;
  }
  for (const obsId of claim.sourceObservationIds) {
    const obs = observationById.get(obsId);
    if (!obs) {
      violations.push(`${claim.evidenceId}: references unknown SourceObservation ${obsId}`);
      continue;
    }
    if (
      (obs.freshness === "pending" || PENDING_SOURCE_IDS.has(obs.sourceId)) &&
      claim.confidence === "high"
    ) {
      violations.push(
        `${claim.evidenceId}: pending source ${obs.sourceId} cannot back high-confidence evidence`,
      );
    }
  }

  const q = claim.quality ?? {};
  for (const [field, allowed] of Object.entries(QUALITY_VALUES)) {
    if (!allowed.has(q[field])) {
      violations.push(`${claim.evidenceId}: invalid quality.${field}="${q[field]}"`);
    }
  }

  if (!Array.isArray(claim.mechanismTags) || claim.mechanismTags.length === 0) {
    violations.push(`${claim.evidenceId}: missing mechanismTags`);
  } else {
    for (const tag of claim.mechanismTags) {
      if (!ALLOWED_MECHANISM_TAGS.has(tag)) {
        violations.push(`${claim.evidenceId}: invalid mechanism tag "${tag}"`);
      }
    }
  }

  if (!["support", "counter", "uncertain"].includes(claim.polarity)) {
    violations.push(`${claim.evidenceId}: invalid polarity "${claim.polarity}"`);
  }
}

for (const observation of snapshot.canonicalSourceObservations) {
  if (observation.sourceHash && !sourceHashPattern.test(observation.sourceHash)) {
    violations.push(
      `${observation.observationId}: sourceHash must be a real sha256:<64 hex> digest or omitted`,
    );
  }
}

for (const event of snapshot.canonicalAgentRunEvents) {
  if (event.sourceHash && !sourceHashPattern.test(event.sourceHash)) {
    violations.push(
      `${event.eventId}: sourceHash must be a real sha256:<64 hex> digest or omitted`,
    );
  }
}

if (violations.length > 0) {
  console.error("audit:evidence FAILED");
  for (const v of violations) console.error("  -", v);
  process.exit(1);
}

console.log(
  `audit:evidence passed: ${snapshot.canonicalEvidenceClaims.length} evidence claims, ${snapshot.canonicalSourceObservations.length} observations validated.`,
);
