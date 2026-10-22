// The editions: numbered, dated and frozen snapshots of the Library, published with an introduction. An edition is never
// changed once published; the changes of the skills are computed against the last one (changes.ts).

import { changesSince, lastEdition, type Change, type ComparedEdition } from "./changes.ts";
import type { RadarEntry } from "./radar.ts";
import { DEFAULT_QUADRANTS, integerBetween, record, RINGS, text, type Ring, type Settings, type Skill } from "./skills.ts";

/** A skill as an edition froze it. Its shape extends the radar's, so that the radar of an edition draws its entries as they are. */
export interface EditionEntry extends RadarEntry {
  sourceUrl?: string;
  description: string;
  score: number;
  notes: string;
  /** Why it moved, for a moved skill. */
  moveReason?: string;
}

/** A skill the edition took off the radar, since it was archived after the edition before. */
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
  /** The names of the quadrants when it was published. */
  quadrants: Settings["quadrants"];
  /** A skill per skill not archived. */
  entries: EditionEntry[];
  retired: RetiredEntry[];
}

/** What the index of the editions keeps of each: enough to list them. */
export interface EditionSummary {
  number: number;
  publishedAt: string;
  /** How many skills it published in each ring. */
  counts: Record<Ring, number>;
}

export { REASON_MAX } from "./skills.ts";

/** The ring the skill `id` was published in by the last edition (the one with the highest number); undefined when it is in none. */
export function publishedRing(id: string, editions: readonly ComparedEdition[]): Ring | undefined {
  return lastEdition(editions)?.entries.find((entry) => entry.id === id)?.ring;
}

/** The skills, not archived, that moved since the last edition and have no explanation yet; in their order. */
export function missingReasons(skills: readonly Skill[], editions: readonly ComparedEdition[]): Skill[] {
  const changes = changesSince(skills, editions);
  return skills.filter((skill) => !skill.archived && changes.get(skill.id)?.kind === "moved" && !skill.moveReason?.trim());
}

/**
 * Publishes the next edition of the skills at the date `now`, with the names of the quadrants and the introduction (which
 * is trimmed and required). It is refused, with nothing published, while a moved skill has no explanation. The skills it
 * answers are the ones given without any explanation of a move, the others being the same objects.
 */
export function publishEdition(
  skills: readonly Skill[],
  quadrants: Settings["quadrants"],
  editions: readonly Edition[],
  intro: string,
  now: Date,
): { edition: Edition; summary: EditionSummary; skills: Skill[] } | { error: "intro_required" } | { error: "reasons_missing"; missing: Skill[] } {
  const trimmed = intro.trim();
  if (!trimmed) return { error: "intro_required" };
  const missing = missingReasons(skills, editions);
  if (missing.length > 0) return { error: "reasons_missing", missing };
  const changes = changesSince(skills, editions);
  const entries: EditionEntry[] = [];
  const retired: RetiredEntry[] = [];
  for (const skill of skills) {
    const change = changes.get(skill.id);
    if (change?.kind === "retired") retired.push({ id: skill.id, name: skill.name, previousRing: change.previousRing });
    if (skill.archived || !change || change.kind === "retired") continue;
    entries.push(entryOf(skill, change));
  }
  const edition: Edition = {
    number: nextNumber(editions),
    publishedAt: now.toISOString(),
    intro: trimmed,
    quadrants: [...quadrants],
    entries,
    retired,
  };
  return { edition, summary: summaryOf(edition), skills: withoutReasons(skills) };
}

/** The number the next edition will have: 1 when there is none. */
export const nextNumber = (editions: readonly { number: number }[]) => (lastEdition(editions)?.number ?? 0) + 1;

/** The skills without any explanation of a move, which a publication answers; the others are the same objects. */
export function withoutReasons(skills: readonly Skill[]): Skill[] {
  return skills.map((skill) => {
    if (skill.moveReason === undefined) return skill;
    const { moveReason: _published, ...rest } = skill;
    return rest;
  });
}

function entryOf(skill: Skill, change: Change): EditionEntry {
  const moved = change.kind === "moved";
  const reason = skill.moveReason?.trim();
  return {
    id: skill.id,
    name: skill.name,
    ...(skill.sourceUrl ? { sourceUrl: skill.sourceUrl } : {}),
    description: skill.description,
    quadrant: skill.quadrant,
    ring: skill.ring,
    score: skill.score,
    notes: skill.notes,
    change: change.kind === "retired" ? "unchanged" : change.kind,
    ...(moved ? { previousRing: change.previousRing } : {}),
    ...(moved && reason ? { moveReason: reason } : {}),
  };
}

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
  const names = Array.isArray(value.quadrants) ? value.quadrants : [];
  const quadrants = DEFAULT_QUADRANTS.map((fallback, index) => text(names[index])?.trim() || fallback) as Settings["quadrants"];
  return {
    number,
    publishedAt,
    intro: text(value.intro) ?? "",
    quadrants,
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
  return {
    id,
    name,
    ...(sourceUrl ? { sourceUrl } : {}),
    description: text(value.description) ?? "",
    quadrant: integerBetween(value.quadrant, 0, 3) ?? 0,
    ring: RINGS.find((ring) => ring === value.ring) ?? "watch",
    score: integerBetween(value.score, 1, 5) ?? 3,
    notes: text(value.notes) ?? "",
    change: CHANGES.find((change) => change === value.change) ?? "unchanged",
    ...(previousRing ? { previousRing } : {}),
    ...(moveReason ? { moveReason } : {}),
  };
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

const emptyCounts = (): Record<Ring, number> => ({ recommended: 0, try: 0, watch: 0, deprecated: 0 });
/** A date as it was stored, when it can be read: an edition is kept as it was published. */
const readableDate = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined);
