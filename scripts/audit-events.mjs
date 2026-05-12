// Audits curated event timeline and GDELT candidate linkage for background pages.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const timelineUrl = new URL("../data/events/events_timeline.jsonl", import.meta.url);
const candidatesUrl = new URL("../data/events/events_candidates.jsonl", import.meta.url);

const allowedSeverity = new Set(["routine", "watch", "elevated", "severe", "deescalation"]);
const allowedSourceTypes = new Set(["official", "media", "open-source"]);
const forbiddenDescriptionPattern = /\b(scenario|judgement|probability|agent)\b|概率|支持/i;

function parseJsonl(text, label) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { record: JSON.parse(line), line: index + 1 };
      } catch (error) {
        throw new Error(`${label}:${index + 1}: invalid JSON (${error.message})`);
      }
    });
}

function requireField(record, line, field, label) {
  if (record[field] === undefined || record[field] === null || record[field] === "") {
    throw new Error(`${label}:${line}: missing ${field}`);
  }
}

async function assertSourceHash(record, line) {
  if (!record.source_hash) return;
  if (!/^sha256:[0-9a-f]{64}$/.test(record.source_hash)) {
    throw new Error(`events_timeline.jsonl:${line}: invalid source_hash ${record.source_hash}`);
  }
  if (!record.raw_path) {
    throw new Error(`events_timeline.jsonl:${line}: source_hash present without raw_path`);
  }
  const rawBytes = await readFile(resolve(root, record.raw_path));
  const actual = `sha256:${createHash("sha256").update(rawBytes).digest("hex")}`;
  if (actual !== record.source_hash) {
    throw new Error(`events_timeline.jsonl:${line}: source_hash does not match ${record.raw_path}`);
  }
}

const timelineRows = parseJsonl(await readFile(timelineUrl, "utf8"), "events_timeline.jsonl");
const candidateRows = parseJsonl(await readFile(candidatesUrl, "utf8"), "events_candidates.jsonl");

const eventsById = new Map();
const relatedCandidateIds = new Set();

for (const { record, line } of timelineRows) {
  for (const field of ["event_id", "event_at", "source_url", "retrieved_at", "severity_hint"]) {
    requireField(record, line, field, "events_timeline.jsonl");
  }
  if (!allowedSeverity.has(record.severity_hint)) {
    throw new Error(`events_timeline.jsonl:${line}: invalid severity_hint ${record.severity_hint}`);
  }
  if (!allowedSourceTypes.has(record.source_type)) {
    throw new Error(`events_timeline.jsonl:${line}: invalid source_type ${record.source_type}`);
  }
  if (eventsById.has(record.event_id)) {
    throw new Error(`events_timeline.jsonl:${line}: duplicate event_id ${record.event_id}`);
  }
  if (forbiddenDescriptionPattern.test(record.description ?? "")) {
    throw new Error(
      `events_timeline.jsonl:${line}: description contains forecast interpretation keyword for ${record.event_id}`,
    );
  }
  for (const candidateId of record.related_candidate_ids ?? []) {
    relatedCandidateIds.add(candidateId);
  }
  await assertSourceHash(record, line);
  eventsById.set(record.event_id, { record, line });
}

const candidatesById = new Map();
for (const { record, line } of candidateRows) {
  requireField(record, line, "candidate_id", "events_candidates.jsonl");
  requireField(record, line, "url", "events_candidates.jsonl");
  requireField(record, line, "retrieved_at", "events_candidates.jsonl");
  requireField(record, line, "status", "events_candidates.jsonl");
  if (candidatesById.has(record.candidate_id)) {
    throw new Error(`events_candidates.jsonl:${line}: duplicate candidate_id ${record.candidate_id}`);
  }
  if (!["candidate", "promoted", "rejected"].includes(record.status)) {
    throw new Error(`events_candidates.jsonl:${line}: invalid status ${record.status}`);
  }
  if (record.status === "promoted") {
    requireField(record, line, "promoted_event_id", "events_candidates.jsonl");
    const event = eventsById.get(record.promoted_event_id);
    if (!event) {
      throw new Error(
        `events_candidates.jsonl:${line}: promoted candidate ${record.candidate_id} references missing event ${record.promoted_event_id}`,
      );
    }
    const linkedIds = event.record.related_candidate_ids ?? [];
    if (linkedIds.length > 0 && !linkedIds.includes(record.candidate_id)) {
      throw new Error(
        `events_candidates.jsonl:${line}: promoted candidate ${record.candidate_id} not linked back by ${record.promoted_event_id}`,
      );
    }
  }
  candidatesById.set(record.candidate_id, record);
}

for (const candidateId of relatedCandidateIds) {
  const candidate = candidatesById.get(candidateId);
  if (!candidate) {
    throw new Error(`events_timeline.jsonl: related_candidate_ids references unknown ${candidateId}`);
  }
  if (candidate.status !== "promoted") {
    throw new Error(`events_timeline.jsonl: related candidate ${candidateId} is not promoted`);
  }
}

console.log(
  `audit:events passed: ${timelineRows.length} timeline events and ${candidateRows.length} GDELT candidates have valid fields and promote linkage.`,
);
