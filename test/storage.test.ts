import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Json, Storage } from "@tessello/sdk";
import type { Edition, EditionSummary } from "../src/lib/editions.ts";
import { t } from "../src/lib/i18n.ts";
import { migrateLegacySkills } from "../src/lib/migration.ts";
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
  topics: ["A", "B", "C", "D", "E"],
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

describe("the library in the storage", () => {
  const legacy = [
    { id: "a", name: "Alpha", description: "d", quadrant: 1, ring: "try", score: 4, notes: "n", addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", archived: false },
  ];

  test("a library written is read back from the key sets", async () => {
    const { storage, values } = fakeStorage();
    const skills = skillStorage(storage);
    const [set] = migrateLegacySkills(legacy);
    await skills.write([set]);
    assert.ok(values.has("sets"));
    assert.deepEqual(await skills.read(), [set]);
  });

  test("with no sets, the old skills are migrated into sets of one skill, and sets is written", async () => {
    const { storage, values } = fakeStorage();
    await storage.set("skills", legacy as unknown as Exclude<Json, null>);
    const read = await skillStorage(storage).read();
    assert.equal(read.length, 1);
    assert.equal(read[0].id, "a");
    assert.equal(read[0].skills[0].score, 4);
    assert.deepEqual(values.get("sets"), read as unknown as Json);
  });

  test("the old skills are never written nor deleted", async () => {
    const { storage, values, sets } = fakeStorage();
    await storage.set("skills", legacy as unknown as Exclude<Json, null>);
    sets.length = 0;
    await skillStorage(storage).read();
    assert.deepEqual(sets, ["sets"]);
    assert.deepEqual(values.get("skills"), legacy as unknown as Json);
  });

  test("once sets exists, the old skills are ignored", async () => {
    const { storage } = fakeStorage();
    await storage.set("skills", legacy as unknown as Exclude<Json, null>);
    const skills = skillStorage(storage);
    await skills.read();
    await skills.write([]);
    assert.deepEqual(await skills.read(), []);
  });

  test("with nothing stored, the library is empty and nothing is written", async () => {
    const { storage, sets } = fakeStorage();
    assert.deepEqual(await skillStorage(storage).read(), []);
    assert.deepEqual(sets, []);
  });

  describe("the quadrants of the sets", () => {
    const withQuadrant = [
      { id: "a", name: "Alpha", quadrant: 3, skills: [{ id: "s1", name: "S1" }, { id: "s2", name: "S2", topic: 1 }] },
      { id: "b", name: "Beta", skills: [{ id: "s3", name: "S3", topic: 2 }] },
    ];

    test("a set that still has a quadrant gives it to its skills, and the converted list is written", async () => {
      const { storage, values, sets } = fakeStorage();
      await storage.set("sets", withQuadrant as unknown as Exclude<Json, null>);
      sets.length = 0;
      const read = await skillStorage(storage).read();
      assert.deepEqual(read.flatMap((set) => set.skills.map((skill) => skill.topic)), [3, 1, 2]);
      assert.equal(read.some((set) => "quadrant" in set), false);
      assert.deepEqual(sets, ["sets"]);
      assert.equal(JSON.stringify(values.get("sets")).includes("quadrant"), false);
    });

    test("the migration is written once: the next read finds no quadrant and writes nothing", async () => {
      const { storage, sets } = fakeStorage();
      await storage.set("sets", withQuadrant as unknown as Exclude<Json, null>);
      const skills = skillStorage(storage);
      const first = await skills.read();
      sets.length = 0;
      assert.deepEqual(await skills.read(), first);
      assert.deepEqual(sets, []);
    });

    test("a skill that already has a topic keeps it", async () => {
      const { storage } = fakeStorage();
      await storage.set("sets", withQuadrant as unknown as Exclude<Json, null>);
      const [alpha] = await skillStorage(storage).read();
      assert.equal(alpha.skills[1].topic, 1);
    });

    test("a library with no quadrant is not written when read", async () => {
      const { storage, sets } = fakeStorage();
      const skills = skillStorage(storage);
      await skills.write([]);
      sets.length = 0;
      await skills.read();
      assert.deepEqual(sets, []);
    });

    test("the old model gives its quadrant to the only skill of each set, and nothing is migrated again", async () => {
      const { storage, sets } = fakeStorage();
      await storage.set("skills", legacy as unknown as Exclude<Json, null>);
      const skills = skillStorage(storage);
      const first = await skills.read();
      assert.equal(first[0].skills[0].topic, 1);
      sets.length = 0;
      await skills.read();
      assert.deepEqual(sets, []);
    });
  });
});
