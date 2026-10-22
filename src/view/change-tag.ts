// What a change says of its set, for the Library and for the Radar.

import type { Change } from "../lib/changes.ts";
import { type MessageKey, t } from "../lib/i18n.ts";
import type { Ring, SkillSet } from "../lib/skills.ts";

/** The name of a ring, in the language of the View. */
export const ringName = (ring: Ring) => t(`ring_${ring}` as MessageKey);

/** What a change says of its set: New, Back, Updated, Moved: Try → Recommended, Retired (was Watch); empty when unchanged. */
export function changeTag(set: SkillSet, change: Change | undefined): string {
  if (!change || change.kind === "unchanged") return "";
  if (change.kind === "moved") return t("change_moved", { from: ringName(change.previousRing), to: ringName(set.ring) });
  if (change.kind === "retired") return t("change_retired", { ring: ringName(change.previousRing) });
  return t(`change_${change.kind}` as MessageKey);
}

/** How many skills a set holds, and how many of them are not evaluated yet: "3 skills (1 not evaluated)". */
export function skillCountLabel(set: SkillSet): string {
  const total = set.skills.length;
  const unevaluated = set.skills.filter((skill) => skill.score === undefined).length;
  if (unevaluated > 0) return total === 1 ? t("skill_count_open_one") : t("skill_count_open", { k: total, u: unevaluated });
  return total === 1 ? t("skill_count_one") : t("skill_count", { k: total });
}
