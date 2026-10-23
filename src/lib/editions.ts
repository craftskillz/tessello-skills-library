// The editions: numbered, dated and frozen snapshots of the Library, published with an introduction. An edition is never
// changed once published; the changes of the skills are computed against the last one (changes.ts).

import { changesSince, hasSkillChanges, lastEdition, type Change, type ComparedEdition, type SkillChanges } from "./changes.ts";
import type { RadarEntry } from "./radar.ts";
import { legacySkillId } from "./migration.ts";
import { DEFAULT_TOPICS, integerBetween, record, RINGS, text, type Ring, type SkillSet, type Topics } from "./skills.ts";

/** A skill of a set as an edition froze it. */
export interface EditionSkill {
  id: string;
  name: string;
  sourceUrl?: string;
  description: string;
  /** 1 to 5; absent when the skill was not evaluated. */
  score?: number;
  notes: string;
}

/** A set as an edition froze it. Its shape extends the radar's, so that the radar of an edition draws its entries as they are. */
export interface EditionEntry extends RadarEntry {
  sourceUrl?: string;
  description: string;
  notes: string;
  /** Why it moved, for a moved set. */
  moveReason?: string;
  /** Its skills, in order. */
  skills: EditionSkill[];
  /** What changed among its skills, for a moved or updated set when something can be named. */
  skillChanges?: SkillChanges;
}

/** A set the edition took off the radar, since it was archived after the edition before. */
export interface RetiredEntry {
  id: string;
  name: string;
  previousRing: Ring;
}

export interface Edition {
  /** From 1. */
  number: number;
  /** ISO date. */
  publishedAt: string;
  /** Markdown. */
  intro: string;
  /** The names of the topics when it was published: five, or four for an edition published before there were five. */
  topics: string[];
  /** A set per set not archived. */
  entries: EditionEntry[];
  retired: RetiredEntry[];
}

/** What the index of the editions keeps of each: enough to list them. */
export interface EditionSummary {
  number: number;
  publishedAt: string;
  /** How many sets it published in each ring. */
  counts: Record<Ring, number>;
}

export { REASON_MAX } from "./skills.ts";

/** The ring the set `id` was published in by the last edition (the one with the highest number); undefined when it is in none. */
export function publishedRing(id: string, editions: readonly ComparedEdition[]): Ring | undefined {
  return lastEdition(editions)?.entries.find((entry) => entry.id === id)?.ring;
}

/** The sets, not archived, that moved since the last edition and have no explanation yet; in their order. */
export function missingReasons(sets: readonly SkillSet[], editions: readonly ComparedEdition[]): SkillSet[] {
  const changes = changesSince(sets, editions);
  return sets.filter((set) => !set.archived && changes.get(set.id)?.kind === "moved" && !set.moveReason?.trim());
}

/**
 * Publishes the next edition of the sets at the date `now`, with the names of the topics and the introduction (which
 * is trimmed and required). It is refused, with nothing published, while a moved set has no explanation. The sets it
 * answers are the ones given without any explanation of a move, the others being the same objects.
 */
export function publishEdition(
  sets: readonly SkillSet[],
  topics: Topics,
  editions: readonly Edition[],
  intro: string,
  now: Date,
): { edition: Edition; summary: EditionSummary; sets: SkillSet[] } | { error: "intro_required" } | { error: "reasons_missing"; missing: SkillSet[] } {
  const trimmed = intro.trim();
  if (!trimmed) return { error: "intro_required" };
  const missing = missingReasons(sets, editions);
  if (missing.length > 0) return { error: "reasons_missing", missing };
  const changes = changesSince(sets, editions);
  const entries: EditionEntry[] = [];
  const retired: RetiredEntry[] = [];
  for (const set of sets) {
    const change = changes.get(set.id);
    if (change?.kind === "retired") retired.push({ id: set.id, name: set.name, previousRing: change.previousRing });
    if (set.archived || !change || change.kind === "retired") continue;
    entries.push(entryOf(set, change));
  }
  const edition: Edition = {
    number: nextNumber(editions),
    publishedAt: now.toISOString(),
    intro: trimmed,
    topics: [...topics],
    entries,
    retired,
  };
  return { edition, summary: summaryOf(edition), sets: withoutReasons(sets) };
}

/** The number the next edition will have: 1 when there is none. */
export const nextNumber = (editions: readonly { number: number }[]) => (lastEdition(editions)?.number ?? 0) + 1;

/** The sets without any explanation of a move, which a publication answers; the others are the same objects. */
export function withoutReasons(sets: readonly SkillSet[]): SkillSet[] {
  return sets.map((set) => {
    if (set.moveReason === undefined) return set;
    const { moveReason: _published, ...rest } = set;
    return rest;
  });
}

function entryOf(set: SkillSet, change: Change): EditionEntry {
  const moved = change.kind === "moved";
  const reason = set.moveReason?.trim();
  const skillChanges = change.kind === "moved" || change.kind === "updated" ? change.skills : undefined;
  return {
    id: set.id,
    name: set.name,
    ...(set.sourceUrl ? { sourceUrl: set.sourceUrl } : {}),
    description: set.description,
    quadrant: set.quadrant,
    ring: set.ring,
    notes: set.notes,
    skills: set.skills.map(frozenSkill),
    change: change.kind === "retired" ? "unchanged" : change.kind,
    ...(moved ? { previousRing: change.previousRing } : {}),
    ...(moved && reason ? { moveReason: reason } : {}),
    ...(skillChanges && hasSkillChanges(skillChanges) ? { skillChanges } : {}),
  };
}

const frozenSkill = (skill: SkillSet["skills"][number]): EditionSkill => ({
  id: skill.id,
  name: skill.name,
  ...(skill.sourceUrl ? { sourceUrl: skill.sourceUrl } : {}),
  description: skill.description,
  ...(skill.score !== undefined ? { score: skill.score } : {}),
  notes: skill.notes,
});

/** What the index keeps of an edition: its number, its date and how many skills it published in each ring. */
export function summaryOf(edition: Edition): EditionSummary {
  const counts = emptyCounts();
  for (const entry of edition.entries) counts[entry.ring] += 1;
  return { number: edition.number, publishedAt: edition.publishedAt, counts };
}

/** The edition under the key `edition:<n>`; null when it has no number or no date, and its unreadable entries are skipped. */
export function readEdition(stored: unknown): Edition | null {
  const value = record(stored);
  const number = integerBetween(value.number, 1, Number.MAX_SAFE_INTEGER);
  const publishedAt = readableDate(value.publishedAt);
  if (number === undefined || !publishedAt) return null;
  // An edition published with four quadrants keeps its four sectors: only a new one has five topics.
  const old = !Array.isArray(value.topics);
  const names = Array.isArray(value.topics) ? value.topics : Array.isArray(value.quadrants) ? value.quadrants : [];
  const topics = DEFAULT_TOPICS.slice(0, old ? 4 : 5).map((fallback, index) => text(names[index])?.trim() || fallback);
  return {
    number,
    publishedAt,
    intro: text(value.intro) ?? "",
    topics,
    entries: readAll(value.entries, readEntry),
    retired: readAll(value.retired, readRetired),
  };
}

/** The index of the editions under the key `editions`, the most recent first; the unreadable ones and the repeated numbers are dropped. */
export function readEditionIndex(stored: unknown): EditionSummary[] {
  if (!Array.isArray(stored)) return [];
  const summaries: EditionSummary[] = [];
  for (const item of stored) {
    const value = record(item);
    const number = integerBetween(value.number, 1, Number.MAX_SAFE_INTEGER);
    const publishedAt = readableDate(value.publishedAt);
    if (number === undefined || !publishedAt || summaries.some((other) => other.number === number)) continue;
    const stock = record(value.counts);
    const counts = emptyCounts();
    for (const ring of RINGS) counts[ring] = integerBetween(stock[ring], 0, Number.MAX_SAFE_INTEGER) ?? 0;
    summaries.push({ number, publishedAt, counts });
  }
  return summaries.sort((a, b) => b.number - a.number);
}

const CHANGES = ["new", "back", "moved", "updated", "unchanged"] as const;

function readEntry(stored: unknown): EditionEntry | null {
  const value = record(stored);
  const id = text(value.id);
  const name = text(value.name);
  if (!id || !name) return null;
  const sourceUrl = text(value.sourceUrl);
  const previousRing = RINGS.find((ring) => ring === value.previousRing);
  const moveReason = text(value.moveReason);
  const skillChanges = readSkillChanges(value.skillChanges);
  // The old form (an entry was one skill) has no list of skills: it becomes a set of one skill with the id the migrated Library gives.
  const old = !Array.isArray(value.skills);
  const description = text(value.description) ?? "";
  return {
    id,
    name,
    ...(sourceUrl ? { sourceUrl } : {}),
    description,
    quadrant: integerBetween(value.quadrant, 0, 4) ?? 0,
    ring: RINGS.find((ring) => ring === value.ring) ?? "watch",
    notes: old ? "" : (text(value.notes) ?? ""),
    skills: old
      ? [{ id: legacySkillId(id), name, ...(sourceUrl ? { sourceUrl } : {}), description, score: integerBetween(value.score, 1, 5) ?? 3, notes: text(value.notes) ?? "" }]
      : readAll(value.skills, readSkill),
    change: CHANGES.find((change) => change === value.change) ?? "unchanged",
    ...(previousRing ? { previousRing } : {}),
    ...(moveReason ? { moveReason } : {}),
    ...(skillChanges && hasSkillChanges(skillChanges) ? { skillChanges } : {}),
  };
}

function readSkill(stored: unknown): EditionSkill | null {
  const value = record(stored);
  const id = text(value.id);
  const name = text(value.name);
  if (!id || !name) return null;
  const sourceUrl = text(value.sourceUrl);
  const score = integerBetween(value.score, 1, 5);
  return {
    id,
    name,
    ...(sourceUrl ? { sourceUrl } : {}),
    description: text(value.description) ?? "",
    ...(score !== undefined ? { score } : {}),
    notes: text(value.notes) ?? "",
  };
}

/** The changes among the skills of a stored entry; undefined when there are none stored. */
function readSkillChanges(stored: unknown): SkillChanges | undefined {
  if (stored === undefined || stored === null) return undefined;
  const value = record(stored);
  const named = (list: unknown) => {
    const items: { id: string; name: string }[] = [];
    for (const item of Array.isArray(list) ? list : []) {
      const entry = record(item);
      const id = text(entry.id);
      const name = text(entry.name);
      if (id && name) items.push({ id, name });
    }
    return items;
  };
  const scores: SkillChanges["scores"] = [];
  for (const item of Array.isArray(value.scores) ? value.scores : []) {
    const entry = record(item);
    const id = text(entry.id);
    const name = text(entry.name);
    if (!id || !name) continue;
    const before = integerBetween(entry.before, 1, 5);
    const after = integerBetween(entry.after, 1, 5);
    scores.push({ id, name, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) });
  }
  return { added: named(value.added), removed: named(value.removed), scores };
}

function readRetired(stored: unknown): RetiredEntry | null {
  const value = record(stored);
  const id = text(value.id);
  const name = text(value.name);
  const previousRing = RINGS.find((ring) => ring === value.previousRing);
  return id && name && previousRing ? { id, name, previousRing } : null;
}

/** The readable items of a stored list, the first of each id only. */
function readAll<T extends { id: string }>(stored: unknown, read: (item: unknown) => T | null): T[] {
  const items: T[] = [];
  if (!Array.isArray(stored)) return items;
  for (const item of stored) {
    const parsed = read(item);
    if (parsed && !items.some((other) => other.id === parsed.id)) items.push(parsed);
  }
  return items;
}

/** A count of zero for each ring. */
export const emptyCounts = (): Record<Ring, number> => ({ recommended: 0, try: 0, watch: 0, deprecated: 0 });
/** A date as it was stored, when it can be read: an edition is kept as it was published. */
const readableDate = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined);
