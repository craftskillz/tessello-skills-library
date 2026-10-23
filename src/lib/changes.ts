// What distinguishes the skills from the last edition: the changes the radar marks and the count of those waiting to be
// published.

import { isOnRadar, RINGS, type Ring, type SkillSet } from "./skills.ts";

/** The skills of a set an edition published, as far as the changes are concerned. */
export interface ComparedSkill {
  id: string;
  name: string;
  score?: number;
  notes: string;
}

/** What an edition must say for the changes to be computed: its number and, for each set it published, what can change. */
export interface ComparedEdition {
  number: number;
  entries: readonly { id: string; ring: Ring; notes: string; skills: readonly ComparedSkill[] }[];
}

/** What changed among the skills of a set since the last edition. Notes changes count as an update but are not detailed. */
export interface SkillChanges {
  added: { id: string; name: string }[];
  removed: { id: string; name: string }[];
  /** Score changed; a missing before or after means not evaluated. */
  scores: { id: string; name: string; before?: number; after?: number }[];
}

export type Change =
  | { kind: "new" | "back" | "unchanged" }
  | { kind: "updated"; skills: SkillChanges }
  | { kind: "moved"; previousRing: Ring; towards: "recommended" | "deprecated"; skills: SkillChanges }
  | { kind: "retired"; previousRing: Ring };

/** Whether there is any skill to name in the changes: a skill added or removed, or a score changed. */
export const hasSkillChanges = (skills: SkillChanges) => skills.added.length + skills.removed.length + skills.scores.length > 0;

/** The last edition: the one with the highest number, whatever the order of the list; undefined when there is none. */
export const lastEdition = <T extends { number: number }>(editions: readonly T[]) =>
  editions.reduce<T | undefined>((best, edition) => (!best || edition.number > best.number ? edition : best), undefined);

/**
 * The change of each set since the last edition, by id. A set is on the radar when it is not archived and has a skill: one
 * that is not is retired if the last edition had it, and otherwise unchanged. The topic of a skill is not compared.
 */
export function changesSince(sets: readonly SkillSet[], editions: readonly ComparedEdition[]): Map<string, Change> {
  const last = lastEdition(editions);
  const changes = new Map<string, Change>();
  for (const set of sets) {
    const previous = last?.entries.find((entry) => entry.id === set.id);
    changes.set(set.id, changeOf(set, previous, editions, last));
  }
  return changes;
}

function changeOf(
  set: SkillSet,
  previous: ComparedEdition["entries"][number] | undefined,
  editions: readonly ComparedEdition[],
  last: ComparedEdition | undefined,
): Change {
  // A set with no skill is off the radar, as an archived one is.
  if (!previous) {
    if (!isOnRadar(set)) return { kind: "unchanged" };
    const before = editions.some((edition) => edition !== last && edition.entries.some((entry) => entry.id === set.id));
    return { kind: before ? "back" : "new" };
  }
  if (!isOnRadar(set)) return { kind: "retired", previousRing: previous.ring };
  const { changes: skills, notesChanged } = compareSkills(set, previous);
  if (set.ring !== previous.ring) {
    const towards = RINGS.indexOf(set.ring) < RINGS.indexOf(previous.ring) ? "recommended" : "deprecated";
    return { kind: "moved", previousRing: previous.ring, towards, skills };
  }
  if (set.notes !== previous.notes || notesChanged || hasSkillChanges(skills)) return { kind: "updated", skills };
  return { kind: "unchanged" };
}

/** The skills of a set against the ones published: added, removed and re-scored by id; whether some skill's notes differ. */
function compareSkills(set: SkillSet, previous: ComparedEdition["entries"][number]) {
  const changes: SkillChanges = { added: [], removed: [], scores: [] };
  let notesChanged = false;
  for (const skill of set.skills) {
    const before = previous.skills.find((other) => other.id === skill.id);
    if (!before) {
      changes.added.push({ id: skill.id, name: skill.name });
      continue;
    }
    if (before.score !== skill.score) {
      changes.scores.push({
        id: skill.id,
        name: skill.name,
        ...(before.score !== undefined ? { before: before.score } : {}),
        ...(skill.score !== undefined ? { after: skill.score } : {}),
      });
    }
    if (before.notes !== skill.notes) notesChanged = true;
  }
  for (const before of previous.skills) {
    if (!set.skills.some((skill) => skill.id === before.id)) changes.removed.push({ id: before.id, name: before.name });
  }
  return { changes, notesChanged };
}

/** Whether a change waits to be published: a new, back, moved or retired set, not an updated one. */
export const isPending = (change: Change) => change.kind === "new" || change.kind === "back" || change.kind === "moved" || change.kind === "retired";

/** How many changes wait to be published. */
export function pendingCount(changes: ReadonlyMap<string, Change>): number {
  return [...changes.values()].filter(isPending).length;
}
