// What distinguishes the skills from the last edition: the changes the radar marks and the count of those waiting to be
// published.

import { RINGS, type Ring, type Skill } from "./skills.ts";

/** What an edition must say for the changes to be computed: its number and, for each skill it published, what can change. */
export interface ComparedEdition {
  number: number;
  entries: readonly { id: string; ring: Ring; score: number; notes: string }[];
}

export type Change =
  | { kind: "new" | "back" | "updated" | "unchanged" }
  | { kind: "moved"; previousRing: Ring; towards: "recommended" | "deprecated" }
  | { kind: "retired"; previousRing: Ring };

/** The change of each skill since the last edition (the one with the highest number, whatever the order of the list), by id. */
export function changesSince(skills: readonly Skill[], editions: readonly ComparedEdition[]): Map<string, Change> {
  const last = editions.reduce<ComparedEdition | undefined>((best, edition) => (!best || edition.number > best.number ? edition : best), undefined);
  const changes = new Map<string, Change>();
  for (const skill of skills) {
    const previous = last?.entries.find((entry) => entry.id === skill.id);
    changes.set(skill.id, changeOf(skill, previous, editions, last));
  }
  return changes;
}

function changeOf(
  skill: Skill,
  previous: ComparedEdition["entries"][number] | undefined,
  editions: readonly ComparedEdition[],
  last: ComparedEdition | undefined,
): Change {
  if (!previous) {
    if (skill.archived) return { kind: "unchanged" };
    const before = editions.some((edition) => edition !== last && edition.entries.some((entry) => entry.id === skill.id));
    return { kind: before ? "back" : "new" };
  }
  if (skill.archived) return { kind: "retired", previousRing: previous.ring };
  if (skill.ring !== previous.ring) {
    const towards = RINGS.indexOf(skill.ring) < RINGS.indexOf(previous.ring) ? "recommended" : "deprecated";
    return { kind: "moved", previousRing: previous.ring, towards };
  }
  if (skill.notes !== previous.notes || skill.score !== previous.score) return { kind: "updated" };
  return { kind: "unchanged" };
}

/** Whether a change waits to be published: a new, back, moved or retired skill, not an updated one. */
export const isPending = (change: Change) => change.kind === "new" || change.kind === "back" || change.kind === "moved" || change.kind === "retired";

/** How many changes wait to be published. */
export function pendingCount(changes: ReadonlyMap<string, Change>): number {
  return [...changes.values()].filter(isPending).length;
}
