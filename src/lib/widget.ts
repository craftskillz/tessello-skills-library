// What the Widget shows at a glance: the sets in each ring, the date of the last edition and how many changes wait to be
// published. Computed from the sets and the editions, so the Widget keeps no state of its own.

import { changesSince, lastEdition, pendingCount } from "./changes.ts";
import { emptyCounts, type Edition } from "./editions.ts";
import type { Ring, SkillSet } from "./skills.ts";

export interface WidgetSummary {
  /** How many sets not archived each ring holds. */
  counts: Record<Ring, number>;
  /** The ISO date of the last edition; undefined when none was published. */
  lastPublishedAt?: string;
  /** How many changes wait to be published. */
  pending: number;
}

/** The summary the Widget shows: sets per ring (archived ones left out), last edition date, changes waiting. */
export function widgetSummary(sets: readonly SkillSet[], editions: readonly Edition[]): WidgetSummary {
  const counts = emptyCounts();
  for (const set of sets) if (!set.archived) counts[set.ring] += 1;
  const last = lastEdition(editions);
  return { counts, ...(last ? { lastPublishedAt: last.publishedAt } : {}), pending: pendingCount(changesSince(sets, editions)) };
}
