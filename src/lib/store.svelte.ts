// The skills and the settings of the View, as Svelte state shared by its parts, kept in the Host storage
// (lib/storage.ts). Each change is written at once, since the Host may unload the View without warning
// (CONVENTION.md §4). Skills that could not be read cannot be changed, so that an empty list never overwrites them.

import type { ConnectedModule } from "@tessello/sdk";
import type { ComparedEdition } from "./changes.ts";
import { addUnlessDuplicate, editUnlessDuplicate } from "./github.ts";
import { t } from "./i18n.ts";
import { DEFAULT_QUADRANTS, deleteSkill, type Draft, type Filters, renameQuadrant as renamed, type Settings, type Skill, type SkillEdit, type Tab } from "./skills.ts";
import { reasonOf, type SkillStorage, skillStorage } from "./storage.ts";

export const skills = $state<{ list: Skill[] }>({ list: [] });

export const settings = $state<Settings>({ quadrants: [...DEFAULT_QUADRANTS], tab: "library", filters: { rings: [], quadrants: [], query: "", archived: false } });

/** The published editions, which decide what changed since the last one, and what can be deleted: a skill that is in one is kept. */
export const editions = $state<{ published: ComparedEdition[] }>({ published: [] });

export const status = $state({
  /** False until the skills are read, and again while they cannot be read. */
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

/** Reads the skills. A list whose last change could not be saved stays as it is on screen. */
export async function load(): Promise<void> {
  try {
    const [stored, storedSettings] = await Promise.all([storage.read(), storage.readSettings()]);
    if (!status.saveError) {
      skills.list = stored;
      Object.assign(settings, storedSettings);
    }
    status.loadError = "";
    status.loaded = true;
  } catch (error) {
    status.loaded = false;
    status.loadError = t("load_error", { reason: reasonOf(error) });
  }
}

/** Writes the list now. A failure is shown to the User; the change stays on screen. */
function save(): Promise<void> {
  const list = $state.snapshot(skills.list);
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
 * Adds a skill and saves it. When a skill, archived or not, comes from the same url, nothing is added and that skill is
 * returned. Null, with nothing changed, while the skills cannot be read or when the name is blank.
 */
export function add(draft: Draft): { added: Skill } | { duplicate: Skill } | null {
  if (!status.loaded) return null;
  const result = addUnlessDuplicate(skills.list, draft, new Date(), crypto.randomUUID());
  if (!result) return null;
  if ("duplicate" in result) return result;
  skills.list = result.skills;
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
 * Saves a change to a skill. The answer is `editUnlessDuplicate`'s, so that the View can tell the User why a change was
 * refused; null, with nothing changed, while the skills cannot be read or when there is no such skill.
 */
export function edit(id: string, change: SkillEdit): ReturnType<typeof editUnlessDuplicate> {
  if (!status.loaded) return null;
  const result = editUnlessDuplicate(skills.list, id, change, new Date());
  if (result && "skill" in result) {
    skills.list = result.skills;
    void save();
  }
  return result;
}

/** Deletes a skill and saves it; false, with nothing changed, while the skills cannot be read or when the skill cannot be deleted. */
export function remove(id: string): boolean {
  if (!status.loaded) return false;
  const kept = deleteSkill(skills.list, id, editions.published);
  if (!kept) return false;
  skills.list = kept;
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
