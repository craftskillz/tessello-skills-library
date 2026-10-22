// The move from the old model, where every skill was a point on the radar, to the sets: each old skill becomes a set of
// one skill. The old key `skills` is only read, never written.

import { date, integerBetween, record, RINGS, text, type Ring, type SkillSet } from "./skills.ts";

/** A skill as the old model kept it: a point on the radar, with its score and its notes. */
export interface LegacySkill {
  id: string;
  name: string;
  sourceUrl?: string;
  description: string;
  quadrant: number;
  ring: Ring;
  score: number;
  notes: string;
  addedAt: string;
  updatedAt: string;
  archived: boolean;
  moveReason?: string;
}

/** The old skills under the key `skills`; null, or anything but a list, is none; what cannot be read is skipped. */
export function readLegacySkills(stored: unknown): LegacySkill[] {
  if (!Array.isArray(stored)) return [];
  const skills: LegacySkill[] = [];
  for (const item of stored) {
    const skill = readLegacySkill(item);
    if (skill && !skills.some((other) => other.id === skill.id)) skills.push(skill);
  }
  return skills;
}

function readLegacySkill(stored: unknown): LegacySkill | null {
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

/**
 * The id of the only skill of a set that was migrated from an old skill. It is deterministic on purpose: an old edition
 * converted when it is read gives the same skill id as the migrated Library, so nothing shows as changed.
 */
export function legacySkillId(setId: string): string {
  return `${setId}-skill`;
}

/** The sets the old skills under the key `skills` become: each one a set of one skill, which takes its score and its notes. */
export function migrateLegacySkills(stored: unknown): SkillSet[] {
  return readLegacySkills(stored).map((old) => {
    const { score, notes, quadrant, ring, updatedAt, archived, moveReason, ...shared } = old;
    return {
      ...shared,
      quadrant,
      ring,
      notes: "",
      skills: [{ ...shared, id: legacySkillId(old.id), score, notes }],
      updatedAt,
      archived,
      ...(moveReason ? { moveReason } : {}),
    };
  });
}
