// The model of the skills the User keeps. What the Host storage holds is read defensively, since an older version, an
// import or a hand-edited file may have written it: what cannot be read is skipped, and a missing value takes its
// creation value.

/** The rings of the radar, from the centre outwards. */
export const RINGS = ["recommended", "try", "watch", "deprecated"] as const;
export type Ring = (typeof RINGS)[number];

export interface Skill {
  /** The key of a skill: random, stable, and never two with the same. */
  id: string;
  name: string;
  /** Where the skill comes from, when the User knows it. */
  sourceUrl?: string;
  description: string;
  /** The index of its quadrant, 0 to 3: renaming a quadrant does not change it. */
  quadrant: number;
  ring: Ring;
  /** 1 to 5. */
  score: number;
  /** Markdown. */
  notes: string;
  /** ISO date. */
  addedAt: string;
  /** ISO date. */
  updatedAt: string;
  archived: boolean;
  /** The sentence that explains a move to another ring that is still to be published. */
  moveReason?: string;
}

/** The notes of a new skill. In French on purpose: the notes are published as they are. */
export const NOTES_TEMPLATE = "#### À quoi ça sert\n\n#### Pourquoi\n\n#### Comment\n";

/** The longest name and description the View accepts. */
export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 500;

/** What the User fills in to add a skill by hand. */
export interface Draft {
  name: string;
  url?: string;
  description?: string;
}

/**
 * Adds a skill at the date `now`, with the id `id`, first in the list; null when its name is blank. It is to watch,
 * scored 3, in the first quadrant, with the template as its notes. A blank url is no url. The name and the description
 * are clipped to what the View accepts, since a `SKILL.md` may give longer ones.
 */
export function addSkill(skills: readonly Skill[], draft: Draft, now: Date, id: string): { skills: Skill[]; skill: Skill } | null {
  const name = draft.name.trim().slice(0, NAME_MAX).trimEnd();
  if (!name) return null;
  const sourceUrl = draft.url?.trim();
  const skill: Skill = {
    id,
    name,
    ...(sourceUrl ? { sourceUrl } : {}),
    description: (draft.description?.trim() ?? "").slice(0, DESCRIPTION_MAX).trimEnd(),
    quadrant: 0,
    ring: "watch",
    score: 3,
    notes: NOTES_TEMPLATE,
    addedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    archived: false,
  };
  return { skills: [skill, ...skills], skill };
}

/** The most recently added first; skills added at the same date stay in the order they were. */
export function newestFirst(skills: readonly Skill[]): Skill[] {
  return [...skills].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

/** The skills under the key `skills`; null, or anything but a list, is none. */
export function readSkills(stored: unknown): Skill[] {
  if (!Array.isArray(stored)) return [];
  const skills: Skill[] = [];
  for (const item of stored) {
    const skill = readSkill(item);
    if (skill && !skills.some((other) => other.id === skill.id)) skills.push(skill);
  }
  return skills;
}

function readSkill(stored: unknown): Skill | null {
  const value = record(stored);
  const id = text(value.id);
  const name = text(value.name);
  if (!id || !name) return null;
  const sourceUrl = text(value.sourceUrl);
  const moveReason = text(value.moveReason);
  const addedAt = date(value.addedAt) ?? new Date(0).toISOString();
  return {
    id,
    name,
    ...(sourceUrl ? { sourceUrl } : {}),
    description: text(value.description) ?? "",
    quadrant: integerBetween(value.quadrant, 0, 3) ?? 0,
    ring: RINGS.find((ring) => ring === value.ring) ?? "watch",
    score: integerBetween(value.score, 1, 5) ?? 3,
    notes: text(value.notes) ?? "",
    addedAt,
    updatedAt: date(value.updatedAt) ?? addedAt,
    archived: value.archived === true,
    ...(moveReason ? { moveReason } : {}),
  };
}

/** The tabs of the View, in their order. */
export const TABS = ["library", "radar", "editions"] as const;
export type Tab = (typeof TABS)[number];

/** The names of the quadrants a new Library starts with. */
export const DEFAULT_QUADRANTS = ["Design & planning", "Code & tests", "Writing & docs", "Tooling & workflow"] as const;

/** The length a name of a quadrant must have. */
export const QUADRANT_NAME_MAX = 40;

export interface Settings {
  /** The names of the four quadrants, by their index. */
  quadrants: [string, string, string, string];
  /** The tab the View was left on. */
  tab: Tab;
  /** What the Library is filtered by, by filter. */
  filters: Record<string, unknown>;
}

/** The settings under the key `settings`; what cannot be read takes its default. */
export function readSettings(stored: unknown): Settings {
  const value = record(stored);
  const names = Array.isArray(value.quadrants) ? value.quadrants : [];
  const quadrants = DEFAULT_QUADRANTS.map((fallback, index) => {
    const name = text(names[index])?.trim();
    return name && name.length <= QUADRANT_NAME_MAX ? name : fallback;
  }) as Settings["quadrants"];
  const filters = value.filters && typeof value.filters === "object" && !Array.isArray(value.filters) ? (value.filters as Record<string, unknown>) : {};
  return { quadrants, tab: TABS.find((tab) => tab === value.tab) ?? "library", filters };
}

/** The url of a skill when it is an http or https one, which the View opens in a new tab; null otherwise. */
export function linkOf(skill: Skill): string | null {
  if (!skill.sourceUrl) return null;
  try {
    const { protocol } = new URL(skill.sourceUrl);
    return protocol === "http:" || protocol === "https:" ? skill.sourceUrl : null;
  } catch {
    return null;
  }
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const date = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined);
const integerBetween = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
