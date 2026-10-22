// The skills and the settings of the View, as Svelte state shared by its parts, kept in the Host storage
// (lib/storage.ts). Each change is written at once, since the Host may unload the View without warning
// (CONVENTION.md §4). Skills that could not be read cannot be changed, so that an empty list never overwrites them.

import type { ConnectedModule } from "@tessello/sdk";
import { t } from "./i18n.ts";
import { addSkill, DEFAULT_QUADRANTS, type Draft, type Settings, type Skill, type Tab } from "./skills.ts";
import { reasonOf, type SkillStorage, skillStorage } from "./storage.ts";

export const skills = $state<{ list: Skill[] }>({ list: [] });

export const settings = $state<Settings>({ quadrants: [...DEFAULT_QUADRANTS], tab: "library", filters: {} });

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

/** Adds a skill made by hand and saves it. Returns false, and changes nothing, while the skills cannot be read or when the name is blank. */
export function add(draft: Draft): boolean {
  if (!status.loaded) return false;
  const added = addSkill(skills.list, draft, new Date(), crypto.randomUUID());
  if (!added) return false;
  skills.list = added.skills;
  void save();
  return true;
}

/** Opens a tab, which the View remembers. */
export function setTab(tab: Tab): void {
  if (!status.loaded) return;
  settings.tab = tab;
  void saveSettings();
}
