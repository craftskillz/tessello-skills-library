// The sets and the settings of the View, as Svelte state shared by its parts, kept in the Host storage
// (lib/storage.ts). Each change is written at once, since the Host may unload the View without warning
// (CONVENTION.md §4). Sets that could not be read cannot be changed, so that an empty list never overwrites them.

import type { ConnectedModule } from "@tessello/sdk";
import { type Edition, publishEdition, publishedRing, summaryOf, withoutReasons } from "./editions.ts";
import { addUnlessDuplicate, type DiscoveredSkill, discoverSkills, editUnlessDuplicate, importSet as importSetOf, parseSkillUrl, refreshSet as refreshSetOf } from "./github.ts";
import { t } from "./i18n.ts";
import {
  addSkillToSet,
  DEFAULT_QUADRANTS,
  deleteSet,
  type Draft,
  editSkillInSet,
  type Filters,
  removeSkillFromSet,
  renameQuadrant as renamed,
  type Settings,
  type Skill,
  type SkillEdit,
  type SetEdit,
  type SkillSet,
  type Tab,
} from "./skills.ts";
import { reasonOf, type SkillStorage, skillStorage } from "./storage.ts";

export const sets = $state<{ list: SkillSet[] }>({ list: [] });

export const settings = $state<Settings>({ quadrants: [...DEFAULT_QUADRANTS], tab: "library", filters: { rings: [], quadrants: [], query: "", archived: false } });

/**
 * The published editions, newest first, which decide what changed since the last one, and what can be deleted: a set
 * that is in one is kept.
 */
export const editions = $state<{ published: Edition[] }>({ published: [] });

export const status = $state({
  /** False until the sets are read, and again while they cannot be read. */
  loaded: false,
  loadError: "",
  /** Set when the last write failed: what is on screen is not saved. */
  saveError: "",
});

let storage: SkillStorage;
/** Writes go one after the other, so that an older list never lands after a newer one. */
let writes = Promise.resolve();

export function connectStore(host: ConnectedModule): void {
  storage = skillStorage(host.storage);
}

/** Reads the sets. A list whose last change could not be saved stays as it is on screen. */
export async function load(): Promise<void> {
  try {
    const [stored, storedSettings, published] = await Promise.all([storage.read(), storage.readSettings(), storage.readEditions()]);
    if (!status.saveError) {
      sets.list = stored;
      Object.assign(settings, storedSettings);
    }
    editions.published = published;
    status.loadError = "";
    status.loaded = true;
  } catch (error) {
    status.loaded = false;
    status.loadError = t("load_error", { reason: reasonOf(error) });
  }
}

/** Writes the list now. A failure is shown to the User; the change stays on screen. */
function save(): Promise<void> {
  const list = $state.snapshot(sets.list);
  return queue(() => storage.write(list));
}

function saveSettings(): Promise<void> {
  const value = $state.snapshot(settings);
  return queue(() => storage.writeSettings(value));
}

function queue(write: () => Promise<void>): Promise<void> {
  writes = writes.then(async () => {
    try {
      await write();
      status.saveError = "";
    } catch (error) {
      status.saveError = (error as Error).message;
    }
  });
  return writes;
}

/**
 * Adds a set and saves it. When a set, archived or not, comes from the same url, nothing is added and that set is
 * returned. Null, with nothing changed, while the sets cannot be read or when the name is blank.
 */
export function addSet(draft: Draft): { added: SkillSet } | { duplicate: SkillSet } | null {
  if (!status.loaded) return null;
  const result = addUnlessDuplicate(sets.list, draft, new Date(), crypto.randomUUID());
  if (!result) return null;
  if ("duplicate" in result) return result;
  sets.list = result.sets;
  void save();
  return { added: result.set };
}

/** Imports a set of the skills found under a GitHub URL and saves it; the answers are `importSet`'s, null too while the sets cannot be read. */
export function importSet(draft: { name: string; url: string }, skills: readonly DiscoveredSkill[]): { added: SkillSet } | { duplicate: SkillSet } | null {
  if (!status.loaded) return null;
  const result = importSetOf(sets.list, draft, skills, new Date(), () => crypto.randomUUID());
  if (!result) return null;
  if ("duplicate" in result) return result;
  sets.list = result.sets;
  void save();
  return { added: result.set };
}

/**
 * Looks again for the skills under the url of the set and merges them into it, as `refreshSet` does, then saves it. The
 * merge is made on the sets as they are when the answer comes, since the User may have changed one meanwhile. Why not, when
 * the set has no GitHub url, GitHub could not be read or no skill is found there any more (a folder that moved, more likely
 * than a set whose every skill was removed): nothing is changed then. Null while the sets cannot be read or
 * when there is no such set.
 */
export async function refreshSet(id: string): Promise<{ added: number; gone: number } | { error: "not_a_skill_url" | "not_found" | "rate_limited" | "network" | "empty" } | null> {
  if (!status.loaded) return null;
  const parsed = parseSkillUrl(sets.list.find((set) => set.id === id)?.sourceUrl ?? "");
  if (!parsed) return sets.list.some((set) => set.id === id) ? { error: "not_a_skill_url" } : null;
  const found = await discoverSkills(parsed);
  if (found.kind === "error") return { error: found.reason };
  if (found.kind === "empty") return { error: "empty" };
  const skills = found.kind === "set" ? found.skills : [found.skill];
  const result = refreshSetOf(sets.list, id, skills, new Date(), () => crypto.randomUUID());
  if (!result) return null;
  if (result.sets !== sets.list) {
    sets.list = result.sets;
    void save();
  }
  return { added: result.added, gone: result.gone };
}

/** Adds a skill at the end of a set and saves it; the answer is `addSkillToSet`'s, null too while the sets cannot be read. */
export function addSkill(setId: string, draft: Draft): { added: Skill } | { error: "url_taken"; duplicate: Skill } | null {
  if (!status.loaded) return null;
  const result = addSkillToSet(sets.list, setId, draft, new Date(), crypto.randomUUID());
  if (!result) return null;
  if ("error" in result) return result;
  sets.list = result.sets;
  void save();
  return { added: result.skill };
}

/** Opens a tab, which the View remembers. */
export function setTab(tab: Tab): void {
  if (!status.loaded) return;
  settings.tab = tab;
  void saveSettings();
}

/**
 * Saves a change to a set. The answer is `editUnlessDuplicate`'s, so that the View can tell the User why a change was
 * refused; null, with nothing changed, while the sets cannot be read or when there is no such set.
 */
export function editSet(id: string, change: SetEdit): ReturnType<typeof editUnlessDuplicate> {
  if (!status.loaded) return null;
  const result = editUnlessDuplicate(sets.list, id, change, new Date(), publishedRing(id, editions.published));
  if (result && "set" in result) {
    sets.list = result.sets;
    void save();
  }
  return result;
}

/** Saves a change to a skill of a set; the answer is `editSkillInSet`'s, null too while the sets cannot be read. */
export function editSkill(setId: string, skillId: string, change: SkillEdit): ReturnType<typeof editSkillInSet> {
  if (!status.loaded) return null;
  const result = editSkillInSet(sets.list, setId, skillId, change, new Date());
  if (result && "set" in result) {
    sets.list = result.sets;
    void save();
  }
  return result;
}

/** Takes a skill out of its set, even after a publication, and saves it; false, with nothing changed, when there is no such skill. */
export function removeSkill(setId: string, skillId: string): boolean {
  if (!status.loaded) return false;
  const result = removeSkillFromSet(sets.list, setId, skillId, new Date());
  if (!result) return false;
  sets.list = result.sets;
  void save();
  return true;
}

/** Deletes a set and saves it; false, with nothing changed, while the sets cannot be read or when the set cannot be deleted. */
export function remove(id: string): boolean {
  if (!status.loaded) return false;
  const kept = deleteSet(sets.list, id, editions.published);
  if (!kept) return false;
  sets.list = kept;
  void save();
  return true;
}

/** Renames a quadrant and saves it; false, with nothing changed, when the name is blank or too long. */
export function renameQuadrant(index: number, name: string): boolean {
  if (!status.loaded) return false;
  const quadrants = renamed(settings.quadrants, index, name);
  if (!quadrants) return false;
  settings.quadrants = quadrants;
  void saveSettings();
  return true;
}

/** Filters the Library, which the View remembers. */
export function setFilters(filters: Filters): void {
  if (!status.loaded) return;
  settings.filters = filters;
  void saveSettings();
}

/**
 * Publishes the next edition with the introduction `intro`: the edition is written, then the index, then the sets
 * without their explanations of a move. Nothing is published when the introduction is blank, when a moved set is not
 * explained (they are returned), or when the edition cannot be written (why, for the User, is returned).
 */
export async function publish(intro: string): Promise<{ published: Edition } | { error: "intro_required" } | { missing: SkillSet[] } | { failed: string } | null> {
  if (!status.loaded) return null;
  const result = publishEdition(sets.list, settings.quadrants, editions.published, intro, new Date());
  if ("error" in result) return result.error === "reasons_missing" ? { missing: result.missing } : { error: result.error };
  const index = [result.summary, ...editions.published.map(summaryOf)];
  try {
    await storage.writeEdition(result.edition, index);
  } catch (error) {
    // What the Host said, not the message of a failed save, which speaks of a change kept on screen.
    const cause = (error as Error).cause ?? error;
    const quota = (cause as { code?: unknown }).code === "quota_exceeded";
    return { failed: quota ? t("publish_failed_quota") : t("publish_failed", { reason: reasonOf(cause) }) };
  }
  editions.published = [result.edition, ...editions.published];
  // The sets as they are now, since the User may have changed one while the edition was written.
  sets.list = withoutReasons(sets.list);
  void save();
  return { published: result.edition };
}
