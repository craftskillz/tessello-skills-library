// The model of the sets of skills the User keeps. What the Host storage holds is read defensively, since an older version, an
// import or a hand-edited file may have written it: what cannot be read is skipped, and a missing value takes its
// creation value.

import { type DiscoveredSkill, duplicateKey } from "./github.ts";

/** The rings of the radar, from the centre outwards. */
export const RINGS = ["recommended", "try", "watch", "deprecated"] as const;
export type Ring = (typeof RINGS)[number];

/** A skill inside a set: what the User evaluates and takes notes on. */
export interface Skill {
  /** The key of a skill: random, stable, and never two with the same in the Library. */
  id: string;
  name: string;
  /** Where the skill comes from, when the User knows it. */
  sourceUrl?: string;
  description: string;
  /** 1 to 5; none when the skill is not evaluated yet. */
  score?: number;
  /** Markdown. */
  notes: string;
  /** ISO date. */
  addedAt: string;
  /** Whether the skill is gone from the repo it was imported from. */
  goneUpstream?: boolean;
}

/** A set ("Ensemble"): what has a ring and a topic, a dot on the radar, and holds an ordered list of skills. */
export interface SkillSet {
  /** The key of a set: random, stable, and never two with the same. */
  id: string;
  name: string;
  /** Where the set comes from, when the User knows it. */
  sourceUrl?: string;
  description: string;
  /** The index of its topic, 0 to 4: renaming a topic does not change it. */
  quadrant: number;
  ring: Ring;
  /** Markdown. */
  notes: string;
  skills: Skill[];
  /** ISO date. */
  addedAt: string;
  /** ISO date. */
  updatedAt: string;
  archived: boolean;
  /** The sentence that explains a move to another ring that is still to be published. */
  moveReason?: string;
}

/** The notes of a new skill. They are published as they are, so the post shows these headings when they are filled. */
export const NOTES_TEMPLATE = "#### What it's for\n\n#### Why\n\n#### How\n\n#### Suggestions for improvement\n";

/** The longest name and description the View accepts. */
export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 500;

/** What the User fills in to add a set or a skill by hand. */
export interface Draft {
  name: string;
  url?: string;
  description?: string;
}

/**
 * Adds a set at the date `now`, with the id `id`, first in the list; null when its name is blank. It is to watch, in the
 * first topic, with no notes and no skill. A blank url is no url. The name and the description are clipped to what the
 * View accepts, since a `SKILL.md` may give longer ones.
 */
export function addSet(sets: readonly SkillSet[], draft: Draft, now: Date, id: string): { sets: SkillSet[]; set: SkillSet } | null {
  const fields = fieldsOf(draft);
  if (!fields) return null;
  const set: SkillSet = {
    id,
    ...fields,
    quadrant: 0,
    ring: "watch",
    notes: "",
    skills: [],
    addedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    archived: false,
  };
  return { sets: [set, ...sets], set };
}

function fieldsOf(draft: Draft): { name: string; sourceUrl?: string; description: string } | null {
  const name = draft.name.trim().slice(0, NAME_MAX).trimEnd();
  if (!name) return null;
  const sourceUrl = draft.url?.trim();
  return { name, ...(sourceUrl ? { sourceUrl } : {}), description: (draft.description?.trim() ?? "").slice(0, DESCRIPTION_MAX).trimEnd() };
}

/**
 * Adds a skill at the end of the set `setId`, with the id `skillId`, at the date `now`; null when there is no such set or
 * the name is blank. It has no score and the template as its notes. Refused, with the skill that has it, when another
 * skill of that set comes from the same place as the url of the draft: the skills of the other sets never conflict.
 */
export function addSkillToSet(
  sets: readonly SkillSet[],
  setId: string,
  draft: Draft,
  now: Date,
  skillId: string,
): { sets: SkillSet[]; set: SkillSet; skill: Skill } | { error: "url_taken"; duplicate: Skill } | null {
  const current = sets.find((set) => set.id === setId);
  const fields = fieldsOf(draft);
  if (!current || !fields) return null;
  const duplicate = skillWithUrl(current.skills, fields.sourceUrl);
  if (duplicate) return { error: "url_taken", duplicate };
  const skill: Skill = { id: skillId, ...fields, notes: NOTES_TEMPLATE, addedAt: now.toISOString() };
  const set: SkillSet = { ...current, skills: [...current.skills, skill], updatedAt: now.toISOString() };
  return { sets: replace(sets, current, set), set, skill };
}

const skillWithUrl = (skills: readonly Skill[], url: string | undefined, except?: string) => {
  const key = duplicateKey(url);
  return key === null ? undefined : skills.find((skill) => skill.id !== except && duplicateKey(skill.sourceUrl) === key);
};
const replace = (sets: readonly SkillSet[], current: SkillSet, set: SkillSet) => sets.map((item) => (item === current ? set : item));

/** The longest notes the View accepts, for a set and for a skill. */
export const NOTES_MAX = 8000;

/** The longest explanation of a move. */
export const REASON_MAX = 280;

/** What the User changes in a set; what is not given stays as it is. */
export type SetEdit = Partial<Pick<SkillSet, "name" | "sourceUrl" | "description" | "quadrant" | "ring" | "notes" | "archived" | "moveReason">>;

/**
 * Saves a change to the set `id` at the date `now`; null when there is no such set. The name, the description and the
 * notes are kept as typed, since the User is still typing: the name and the description are only clipped, and a blank
 * name or notes that are too long are refused with nothing saved. A blank url removes the url. A topic or a ring that
 * does not exist is ignored, and so is an archived that is not a boolean. The reason of a move is kept as typed
 * (a blank one removes it, one that is too long is refused), but only while `publishedRing`, the ring of the set in the
 * last edition, is known and differs from its ring: back in that ring, or in no edition, it has no reason. The date
 * changes only when a value does, and the other sets are the same objects, in the same order.
 */
export function editSet(
  sets: readonly SkillSet[],
  id: string,
  edit: SetEdit,
  now: Date,
  publishedRing?: Ring,
): { sets: SkillSet[]; set: SkillSet } | { error: "name_required" | "notes_too_long" | "reason_too_long" } | null {
  const current = sets.find((set) => set.id === id);
  if (!current) return null;
  if (edit.name !== undefined && !edit.name.trim()) return { error: "name_required" };
  if (edit.notes !== undefined && edit.notes.length > NOTES_MAX) return { error: "notes_too_long" };
  if (edit.moveReason !== undefined && edit.moveReason.length > REASON_MAX) return { error: "reason_too_long" };
  const changes: Partial<SkillSet> = {};
  if (edit.name !== undefined) changes.name = edit.name.slice(0, NAME_MAX);
  if (edit.description !== undefined) changes.description = edit.description.slice(0, DESCRIPTION_MAX);
  if (edit.notes !== undefined) changes.notes = edit.notes;
  if (edit.quadrant !== undefined && integerBetween(edit.quadrant, 0, 4) !== undefined) changes.quadrant = edit.quadrant;
  if (edit.ring !== undefined && RINGS.includes(edit.ring)) changes.ring = edit.ring;
  if (typeof edit.archived === "boolean") changes.archived = edit.archived;
  const ring = changes.ring ?? current.ring;
  const typed = edit.moveReason !== undefined ? edit.moveReason.trim() && edit.moveReason : current.moveReason;
  const moveReason = publishedRing !== undefined && publishedRing !== ring ? typed || undefined : undefined;
  const changed = moveReason !== current.moveReason || (Object.keys(changes) as (keyof SkillSet)[]).some((key) => changes[key] !== current[key]);
  const url = edit.sourceUrl?.trim();
  const urlChanged = edit.sourceUrl !== undefined && (url || undefined) !== current.sourceUrl;
  if (!changed && !urlChanged) return { sets: sets as SkillSet[], set: current };
  const { sourceUrl: _old, moveReason: _oldReason, ...rest } = current;
  const nextUrl = edit.sourceUrl !== undefined ? url : current.sourceUrl;
  const set: SkillSet = { ...rest, ...changes, ...(nextUrl ? { sourceUrl: nextUrl } : {}), ...(moveReason ? { moveReason } : {}), updatedAt: now.toISOString() };
  return { sets: replace(sets, current, set), set };
}

/** What the User changes in a skill; what is not given stays as it is. A score of null clears it: the skill is not evaluated. */
export interface SkillEdit {
  name?: string;
  sourceUrl?: string;
  description?: string;
  score?: number | null;
  notes?: string;
}

/**
 * Saves a change to the skill `skillId` of the set `setId` at the date `now`; null when there is no such set or skill.
 * Like `editSet`, the name, the description and the notes are kept as typed, only clipped, a blank name and notes that are
 * too long are refused, and a blank url removes the url; a score outside 1 to 5 is ignored and null clears it. A url that
 * another skill of the set has is refused with that skill; a skill is never a duplicate of itself. The date of the set
 * changes only when a value does, otherwise the same objects come back.
 */
export function editSkillInSet(
  sets: readonly SkillSet[],
  setId: string,
  skillId: string,
  edit: SkillEdit,
  now: Date,
): { sets: SkillSet[]; set: SkillSet; skill: Skill } | { error: "name_required" | "notes_too_long" } | { error: "url_taken"; duplicate: Skill } | null {
  const set = sets.find((item) => item.id === setId);
  const current = set?.skills.find((skill) => skill.id === skillId);
  if (!set || !current) return null;
  if (edit.name !== undefined && !edit.name.trim()) return { error: "name_required" };
  if (edit.notes !== undefined && edit.notes.length > NOTES_MAX) return { error: "notes_too_long" };
  const url = edit.sourceUrl?.trim();
  if (edit.sourceUrl !== undefined) {
    const duplicate = skillWithUrl(set.skills, url, skillId);
    if (duplicate) return { error: "url_taken", duplicate };
  }
  const changes: Partial<Skill> = {};
  if (edit.name !== undefined) changes.name = edit.name.slice(0, NAME_MAX);
  if (edit.description !== undefined) changes.description = edit.description.slice(0, DESCRIPTION_MAX);
  if (edit.notes !== undefined) changes.notes = edit.notes;
  if (edit.score !== undefined && edit.score !== null && integerBetween(edit.score, 1, 5) !== undefined) changes.score = edit.score;
  const clearScore = edit.score === null && current.score !== undefined;
  const changed = clearScore || (Object.keys(changes) as (keyof Skill)[]).some((key) => changes[key] !== current[key]);
  const urlChanged = edit.sourceUrl !== undefined && (url || undefined) !== current.sourceUrl;
  if (!changed && !urlChanged) return { sets: sets as SkillSet[], set, skill: current };
  const { sourceUrl: _old, score: _oldScore, ...rest } = current;
  const nextUrl = edit.sourceUrl !== undefined ? url : current.sourceUrl;
  const nextScore = clearScore ? undefined : (changes.score ?? current.score);
  const skill: Skill = { ...rest, ...changes, ...(nextUrl ? { sourceUrl: nextUrl } : {}), ...(nextScore !== undefined ? { score: nextScore } : {}) };
  const next: SkillSet = { ...set, skills: set.skills.map((item) => (item === current ? skill : item)), updatedAt: now.toISOString() };
  return { sets: replace(sets, set, next), set: next, skill };
}

/** The set `setId` without the skill `skillId`, at the date `now`, even after a publication; null when there is no such set or skill. */
export function removeSkillFromSet(sets: readonly SkillSet[], setId: string, skillId: string, now: Date): { sets: SkillSet[]; set: SkillSet } | null {
  const set = sets.find((item) => item.id === setId);
  if (!set || !set.skills.some((skill) => skill.id === skillId)) return null;
  const next: SkillSet = { ...set, skills: set.skills.filter((skill) => skill.id !== skillId), updatedAt: now.toISOString() };
  return { sets: replace(sets, set, next), set: next };
}

/** The most recently added first; items added at the same date stay in the order they were. */
export function newestFirst<T extends { addedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

/** The sets under the key `sets`; null, or anything but a list, is none. */
export function readSets(stored: unknown): SkillSet[] {
  if (!Array.isArray(stored)) return [];
  const sets: SkillSet[] = [];
  const skillIds = new Set<string>();
  for (const item of stored) {
    const set = readSet(item, skillIds);
    if (set && !sets.some((other) => other.id === set.id)) sets.push(set);
  }
  return sets;
}

function readSet(stored: unknown, skillIds: Set<string>): SkillSet | null {
  const value = record(stored);
  const id = text(value.id);
  const name = text(value.name);
  if (!id || !name) return null;
  const sourceUrl = text(value.sourceUrl);
  const moveReason = text(value.moveReason);
  const addedAt = date(value.addedAt) ?? new Date(0).toISOString();
  const skills: Skill[] = [];
  for (const item of Array.isArray(value.skills) ? value.skills : []) {
    const skill = readSkill(item);
    if (skill && !skillIds.has(skill.id)) {
      skillIds.add(skill.id);
      skills.push(skill);
    }
  }
  return {
    id,
    name,
    ...(sourceUrl ? { sourceUrl } : {}),
    description: text(value.description) ?? "",
    quadrant: integerBetween(value.quadrant, 0, 4) ?? 0,
    ring: RINGS.find((ring) => ring === value.ring) ?? "watch",
    notes: text(value.notes) ?? "",
    skills,
    addedAt,
    updatedAt: date(value.updatedAt) ?? addedAt,
    archived: value.archived === true,
    ...(moveReason ? { moveReason } : {}),
  };
}

function readSkill(stored: unknown): Skill | null {
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
    addedAt: date(value.addedAt) ?? new Date(0).toISOString(),
    ...(value.goneUpstream === true ? { goneUpstream: true } : {}),
  };
}

/** What deleting needs to know of an edition: the sets it published. */
export interface PublishedEdition {
  entries: readonly { id: string }[];
}

/** Whether the set `id` is in no edition, since an edition is kept as it was published. */
export function canDelete(id: string, editions: readonly PublishedEdition[]): boolean {
  return !editions.some((edition) => edition.entries.some((entry) => entry.id === id));
}

/** The sets without the set `id`, the others the same objects in the same order; null when there is no such set or it was published. */
export function deleteSet(sets: readonly SkillSet[], id: string, editions: readonly PublishedEdition[]): SkillSet[] | null {
  if (!sets.some((set) => set.id === id) || !canDelete(id, editions)) return null;
  return sets.filter((set) => set.id !== id);
}

/** The tabs of the View, in their order. */
export const TABS = ["library", "radar", "editions"] as const;
export type Tab = (typeof TABS)[number];

/** The names of the five topics a new Library starts with. */
export const DEFAULT_TOPICS = ["Design & planning", "Code & tests", "Writing & docs", "Tooling & workflow", "Learning & upskilling"] as const;

/** The length a name of a topic must have. */
export const TOPIC_NAME_MAX = 40;

/** The names of the five topics, by their index. */
export type Topics = [string, string, string, string, string];

export interface Settings {
  /** The names of the five topics, by their index. */
  topics: Topics;
  /** The tab the View was left on. */
  tab: Tab;
  /** What the Library is filtered by. */
  filters: Filters;
}

/** What the Library is filtered by: none selected in a list is no filtering on that axis. */
export interface Filters {
  rings: Ring[];
  /** The indexes of the topics, 0 to 4. */
  topics: number[];
  /** A part of the name. */
  query: string;
  /** Whether the archived sets are shown, greyed. */
  archived: boolean;
}

/** The filters under the key `filters` of the settings; what cannot be read is no filtering. The old `quadrants` are the topics at the same index. */
export function readFilters(stored: unknown): Filters {
  const value = record(stored);
  const rings = Array.isArray(value.rings) ? value.rings : [];
  const topics = Array.isArray(value.topics) ? value.topics : Array.isArray(value.quadrants) ? value.quadrants : [];
  return {
    rings: RINGS.filter((ring) => rings.includes(ring)),
    topics: [...new Set(topics.filter((topic) => integerBetween(topic, 0, 4) !== undefined))],
    query: text(value.query) ?? "",
    archived: value.archived === true,
  };
}

/** The sets that have one of the rings and one of the topics selected, and a name, or a skill with a name, with the query in it, the archived ones only when asked; in their order. */
export function filterSets(sets: readonly SkillSet[], filters: Filters): SkillSet[] {
  const query = plain(filters.query.trim());
  return sets.filter(
    (set) =>
      (filters.archived || !set.archived) &&
      (filters.rings.length === 0 || filters.rings.includes(set.ring)) &&
      (filters.topics.length === 0 || filters.topics.includes(set.quadrant)) &&
      (plain(set.name).includes(query) || set.skills.some((skill) => plain(skill.name).includes(query))),
  );
}

/** The names of the topics with the one at `index` renamed; null when the name is blank or too long, or there is no such topic. */
export function renameTopic(topics: Topics, index: number, name: string): Topics | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > TOPIC_NAME_MAX || integerBetween(index, 0, 4) === undefined) return null;
  const renamed = [...topics] as Topics;
  renamed[index] = trimmed;
  return renamed;
}

/** The settings under the key `settings`; what cannot be read takes its default. The four old `quadrants` keep their index as topics. */
export function readSettings(stored: unknown): Settings {
  const value = record(stored);
  const names = Array.isArray(value.topics) ? value.topics : Array.isArray(value.quadrants) ? value.quadrants : [];
  const topics = DEFAULT_TOPICS.map((fallback, index) => {
    const name = text(names[index])?.trim();
    return name && name.length <= TOPIC_NAME_MAX ? name : fallback;
  }) as Topics;
  return { topics, tab: TABS.find((tab) => tab === value.tab) ?? "library", filters: readFilters(value.filters) };
}

/** The url of a set or a skill when it is an http or https one, which the View opens in a new tab; null otherwise. */
export function linkOf(item: { sourceUrl?: string }): string | null {
  if (!item.sourceUrl) return null;
  try {
    const { protocol } = new URL(item.sourceUrl);
    return protocol === "http:" || protocol === "https:" ? item.sourceUrl : null;
  } catch {
    return null;
  }
}

/** A text in lowercase with no accents, to compare names the way the User types them. */
const plain = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
export const text = (value: unknown) => (typeof value === "string" ? value : undefined);
export const date = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined);
export const integerBetween = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;

// The sets that come from the same place as another, and the sets imported from GitHub or refreshed from it.

/** The set, archived or not, that comes from the same place as `url`; none when `url` has no key. */
export function findDuplicate(sets: readonly SkillSet[], url: string | undefined): SkillSet | undefined {
  const key = duplicateKey(url);
  return key === null ? undefined : sets.find((set) => duplicateKey(set.sourceUrl) === key);
}

/**
 * `addSet`, but nothing is added when a set, archived or not, comes from the same place as the url of the draft: the
 * answer is then that set.
 */
export function addUnlessDuplicate(
  sets: readonly SkillSet[],
  draft: Draft,
  now: Date,
  id: string,
): { sets: SkillSet[]; set: SkillSet } | { duplicate: SkillSet } | null {
  if (!draft.name.trim()) return null;
  const duplicate = findDuplicate(sets, draft.url);
  return duplicate ? { duplicate } : addSet(sets, draft, now, id);
}

/**
 * `editSet`, but nothing is saved when the edit gives a url that another set, archived or not, already has: the answer
 * is then that set. A set is never a duplicate of itself.
 */
export function editUnlessDuplicate(
  sets: readonly SkillSet[],
  id: string,
  edit: SetEdit,
  now: Date,
  publishedRing?: Ring,
): ReturnType<typeof editSet> | { duplicate: SkillSet } {
  if (!sets.some((set) => set.id === id)) return null;
  const duplicate = edit.sourceUrl === undefined ? undefined : findDuplicate(sets.filter((set) => set.id !== id), edit.sourceUrl);
  return duplicate ? { duplicate } : editSet(sets, id, edit, now, publishedRing);
}

/**
 * Adds a set named `draft.name`, whose url is `draft.url`, holding `skills` in their order; each is added as
 * `addSkillToSet` does (not evaluated, the template as its notes, its folder as its url), and a skill whose url an earlier
 * one has is left out. Null when the name is blank or there is no skill; the set, archived or not, that has the same url
 * is the answer when there is one, and nothing is added then.
 */
export function importSet(
  sets: readonly SkillSet[],
  draft: Draft,
  skills: readonly DiscoveredSkill[],
  now: Date,
  newId: () => string,
): { sets: SkillSet[]; set: SkillSet } | { duplicate: SkillSet } | null {
  if (skills.length === 0) return null;
  const added = addUnlessDuplicate(sets, draft, now, newId());
  if (!added || "duplicate" in added) return added;
  const { sets: withSkills, set } = addFoundSkills(added.sets, added.set, skills, now, newId);
  return { sets: withSkills, set };
}

/**
 * Adds each skill found at the end of `set`, in their order, as `addSkillToSet` does: not evaluated, the template as its
 * notes, its folder as its url. A skill whose url the set has already is left out, and `added` counts the others.
 */
function addFoundSkills(
  sets: SkillSet[],
  set: SkillSet,
  found: readonly DiscoveredSkill[],
  now: Date,
  newId: () => string,
): { sets: SkillSet[]; set: SkillSet; added: number } {
  let result = { sets, set };
  let added = 0;
  for (const skill of found) {
    // Not offered to `addSkillToSet` when the set has it, so that no id is spent on it.
    if (skillWithUrl(result.set.skills, skill.sourceUrl)) continue;
    const withSkill = addSkillToSet(result.sets, set.id, { name: skill.name, url: skill.sourceUrl, description: skill.description }, now, newId());
    if (withSkill && !("error" in withSkill)) {
      result = withSkill;
      added++;
    }
  }
  return { ...result, added };
}

/**
 * The set `setId` against the skills found again under its url. A skill found that no skill of the set has (by url) is
 * added at the end as `addSkillToSet` does. A skill of the set whose url is in the folder of the set and is not found any
 * more is marked `goneUpstream` and kept as it is; one found again loses the mark. A skill with no url, or from outside
 * the folder of the set, is never marked, and the names, descriptions, scores and notes are never touched. `added` counts
 * the skills added, `gone` those newly marked (not the ones that already were). Nothing to change gives the same sets back.
 * Null when there is no such set.
 */
export function refreshSet(
  sets: readonly SkillSet[],
  setId: string,
  found: readonly DiscoveredSkill[],
  now: Date,
  newId: () => string,
): { sets: SkillSet[]; set: SkillSet; added: number; gone: number } | null {
  const current = sets.find((set) => set.id === setId);
  if (!current) return null;
  const foundKeys = new Set(found.map((skill) => duplicateKey(skill.sourceUrl)));
  const folder = duplicateKey(current.sourceUrl);
  let gone = 0;
  const skills = current.skills.map((skill) => {
    const key = duplicateKey(skill.sourceUrl);
    if (key === null || folder === null || !key.startsWith(`${folder}/`)) return skill;
    const missing = !foundKeys.has(key);
    if (missing === (skill.goneUpstream === true)) return skill;
    if (missing) gone++;
    const { goneUpstream: _, ...rest } = skill;
    return missing ? { ...rest, goneUpstream: true } : rest;
  });
  const marksChanged = skills.some((skill, index) => skill !== current.skills[index]);
  const set = marksChanged ? { ...current, skills, updatedAt: now.toISOString() } : current;
  const marked = marksChanged ? sets.map((item) => (item === current ? set : item)) : (sets as SkillSet[]);
  return { ...addFoundSkills(marked, set, found, now, newId), gone };
}
