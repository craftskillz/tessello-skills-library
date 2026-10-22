// What the Widget shows at a glance: the skills in each ring, the date of the last edition and how many changes wait to be
// published. Computed from the skills and the editions, so the Widget keeps no state of its own.

import { changesSince, lastEdition, pendingCount } from "./changes.ts";
import { emptyCounts, type Edition } from "./editions.ts";
import type { Ring, Skill } from "./skills.ts";

export interface WidgetSummary {
  /** How many skills not archived each ring holds. */
  counts: Record<Ring, number>;
  /** The ISO date of the last edition; undefined when none was published. */
  lastPublishedAt?: string;
  /** How many changes wait to be published. */
  pending: number;
}

/** The summary the Widget shows: skills per ring (archived ones left out), last edition date, changes waiting. */
export function widgetSummary(skills: readonly Skill[], editions: readonly Edition[]): WidgetSummary {
  const counts = emptyCounts();
  for (const skill of skills) if (!skill.archived) counts[skill.ring] += 1;
  const last = lastEdition(editions);
  return { counts, ...(last ? { lastPublishedAt: last.publishedAt } : {}), pending: pendingCount(changesSince(skills, editions)) };
}
