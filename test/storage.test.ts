import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Json, Storage } from "@tessello/sdk";
import type { Edition, EditionSummary } from "../src/lib/editions.ts";
import { t } from "../src/lib/i18n.ts";
import { skillStorage } from "../src/lib/storage.ts";

/** A Host storage in memory, that fails the keys it is told to with a quota error, and records its calls. */
function fakeStorage(failing: string[] = []) {
  const values = new Map<string, Json>();
  const sets: string[] = [];
  const storage: Storage = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      sets.push(key);
      if (failing.includes(key)) throw Object.assign(new Error("full"), { code: "quota_exceeded" });
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
    keys: async () => [...values.keys()],
  };
  return { storage, values, sets, failing };
}

const edition = (number: number): Edition => ({
  number,
  publishedAt: `2026-10-0${number}T00:00:00.000Z`,
  intro: `Edition ${number}`,
  quadrants: ["A", "B", "C", "D"],
  entries: [],
  retired: [],
});

const summary = (number: number): EditionSummary => ({
  number,
  publishedAt: `2026-10-0${number}T00:00:00.000Z`,
  counts: { recommended: 0, try: 0, watch: number, deprecated: 0 },
});

describe("the editions in the storage", () => {
  test("an edition written is read back", async () => {
    const { storage } = fakeStorage();
    const skills = skillStorage(storage);
    await skills.writeEdition(edition(1), [summary(1)]);
    assert.deepEqual(await skills.readEditions(), [edition(1)]);
  });

  test("the editions come back newest first, as the index lists them", async () => {
    const { storage } = fakeStorage();
    const skills = skillStorage(storage);
    await skills.writeEdition(edition(1), [summary(1)]);
    await skills.writeEdition(edition(2), [summary(2), summary(1)]);
    assert.deepEqual(
      (await skills.readEditions()).map((e) => e.number),
      [2, 1],
    );
  });

  test("the edition is written before the index", async () => {
    const { storage, sets } = fakeStorage();
    await skillStorage(storage).writeEdition(edition(1), [summary(1)]);
    assert.deepEqual(sets, ["edition:1", "editions"]);
  });

  test("a full storage on the edition says so, and the index is not written", async () => {
    const { storage, sets, values } = fakeStorage(["edition:1"]);
    await assert.rejects(skillStorage(storage).writeEdition(edition(1), [summary(1)]), { message: t("save_error_quota") });
    assert.deepEqual(sets, ["edition:1"]);
    assert.equal(values.has("editions"), false);
  });

  test("a failure on the index takes the edition back off, and throws", async () => {
    const { storage, values } = fakeStorage(["editions"]);
    await assert.rejects(skillStorage(storage).writeEdition(edition(1), [summary(1)]), { message: t("save_error_quota") });
    assert.equal(values.has("edition:1"), false);
  });

  test("an index that lists a missing edition skips it", async () => {
    const { storage } = fakeStorage();
    const skills = skillStorage(storage);
    await skills.writeEdition(edition(1), [summary(1)]);
    await skills.writeEdition(edition(2), [summary(2), summary(1)]);
    await storage.delete("edition:2");
    assert.deepEqual(await skills.readEditions(), [edition(1)]);
  });
});
