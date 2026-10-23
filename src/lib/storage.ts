// The sets in the Host storage (CONVENTION.md §6.1): the whole list under `sets` (the old `skills` are migrated once, never touched; so is a `quadrant` of a set, which goes to its skills), and the settings of the View under
// `settings`. What is stored is read defensively (skills.ts), and a failed write comes back as a message for the User.

import type { Json, Storage } from "@tessello/sdk";
import { readEdition, readEditionIndex, type Edition, type EditionSummary } from "./editions.ts";
import { t } from "./i18n.ts";
import { migrateLegacySkills } from "./migration.ts";
import { readSets, readSettings, record, type Settings, type SkillSet } from "./skills.ts";

const SETS = "sets";
const LEGACY_SKILLS = "skills";
const SETTINGS = "settings";
const EDITIONS = "editions";
const editionKey = (number: number) => `edition:${number}`;

export interface SkillStorage {
  /**
   * The sets. When `sets` was never written and the old `skills` hold a list, migrates it, writes `sets` and returns it
   * (`skills` is left alone, and ignored from then on). When a stored set still has a `quadrant`, it is given to its skills as
   * their topic and the converted sets are written back, once. Throws when the Host cannot read them.
   */
  read(): Promise<SkillSet[]>;
  /** Writes the sets. Throws an `Error` whose message tells the User what happened. */
  write(sets: SkillSet[]): Promise<void>;
  /** The settings. Throws when the Host cannot read them. */
  readSettings(): Promise<Settings>;
  /** Writes the settings. Throws as `write` does. */
  writeSettings(settings: Settings): Promise<void>;
  /** The editions in full, newest first; an edition the index lists but that cannot be read is skipped. Throws when the Host cannot read. */
  readEditions(): Promise<Edition[]>;
  /**
   * Publishes an edition: writes it under its own key, then the index. Throws as `write` does; when the index cannot be
   * written, the edition is taken back off, so nothing is published.
   */
  writeEdition(edition: Edition, index: EditionSummary[]): Promise<void>;
}

export function skillStorage(storage: Storage): SkillStorage {
  return {
    read: async () => {
      const stored = await storage.get(SETS);
      if (stored !== null) {
        const sets = readSets(stored);
        // The quadrant went from the set to its skills: the converted list is written once, then no set has a quadrant.
        if (Array.isArray(stored) && stored.some((item) => "quadrant" in record(item))) await set(storage, SETS, sets as unknown as Exclude<Json, null>);
        return sets;
      }
      const legacy = await storage.get(LEGACY_SKILLS);
      if (!Array.isArray(legacy)) return [];
      const migrated = migrateLegacySkills(legacy);
      await set(storage, SETS, migrated as unknown as Exclude<Json, null>);
      return migrated;
    },
    write: (sets) => set(storage, SETS, sets as unknown as Exclude<Json, null>),
    readSettings: async () => readSettings(await storage.get(SETTINGS)),
    writeSettings: (settings) => set(storage, SETTINGS, settings as unknown as Exclude<Json, null>),
    readEditions: async () => {
      const index = readEditionIndex(await storage.get(EDITIONS));
      const editions = await Promise.all(index.map(async ({ number }) => readEdition(await storage.get(editionKey(number)))));
      return editions.filter((edition): edition is Edition => edition !== null);
    },
    writeEdition: async (edition, index) => {
      const key = editionKey(edition.number);
      await set(storage, key, edition as unknown as Exclude<Json, null>);
      try {
        await set(storage, EDITIONS, index as unknown as Exclude<Json, null>);
      } catch (error) {
        await storage.delete(key).catch(() => {});
        throw error;
      }
    },
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
