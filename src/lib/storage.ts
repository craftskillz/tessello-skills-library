// The skills in the Host storage (CONVENTION.md §6.1): the whole list under `skills`, and the settings of the View under
// `settings`. What is stored is read defensively (skills.ts), and a failed write comes back as a message for the User.

import type { Json, Storage } from "@tessello/sdk";
import { t } from "./i18n.ts";
import { readSettings, readSkills, type Settings, type Skill } from "./skills.ts";

const SKILLS = "skills";
const SETTINGS = "settings";

export interface SkillStorage {
  /** The skills. Throws when the Host cannot read them. */
  read(): Promise<Skill[]>;
  /** Writes the skills. Throws an `Error` whose message tells the User what happened. */
  write(skills: Skill[]): Promise<void>;
  /** The settings. Throws when the Host cannot read them. */
  readSettings(): Promise<Settings>;
  /** Writes the settings. Throws as `write` does. */
  writeSettings(settings: Settings): Promise<void>;
}

export function skillStorage(storage: Storage): SkillStorage {
  return {
    read: async () => readSkills(await storage.get(SKILLS)),
    write: (skills) => set(storage, SKILLS, skills as unknown as Exclude<Json, null>),
    readSettings: async () => readSettings(await storage.get(SETTINGS)),
    writeSettings: (settings) => set(storage, SETTINGS, settings as unknown as Exclude<Json, null>),
  };
}

async function set(storage: Storage, key: string, value: Exclude<Json, null>): Promise<void> {
  try {
    await storage.set(key, value);
  } catch (error) {
    throw new Error(saveErrorMessage(error), { cause: error });
  }
}

/** What a failed request says, for a message: its own message, or the value thrown. */
export const reasonOf = (error: unknown) => (error instanceof Error && error.message ? error.message : String(error));

function saveErrorMessage(error: unknown): string {
  if ((error as { code?: unknown }).code === "quota_exceeded") return t("save_error_quota");
  return t("save_error", { reason: reasonOf(error) });
}
