import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { legacySkillId, migrateLegacySkills, readLegacySkills } from "../src/lib/migration.ts";

const old = {
  id: "a",
  name: "TDD",
  sourceUrl: "https://example.com/tdd",
  description: "red, green",
  quadrant: 2,
  ring: "recommended",
  score: 5,
  notes: "my notes",
  addedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  archived: true,
  moveReason: "proved itself",
};

describe("reading the old skills", () => {
  test("nothing stored, or something that is not a list, is no skill", () => {
    assert.deepEqual(readLegacySkills(null), []);
    assert.deepEqual(readLegacySkills({ id: "a", name: "A" }), []);
  });

  test("an old skill is read back as it was written", () => {
    assert.deepEqual(readLegacySkills([old]), [old]);
  });

  test("what has no id or name is skipped, and a duplicate id is dropped", () => {
    assert.deepEqual(readLegacySkills([{ name: "A" }, "junk", { id: "a" }, { id: "a", name: "first" }, { id: "a", name: "second" }]).map((item) => item.name), ["first"]);
  });

  test("a value out of range or of the wrong kind takes its default", () => {
    const [read] = readLegacySkills([{ id: "a", name: "A", ring: "adopt", score: 9, quadrant: 4, addedAt: "never", updatedAt: 3, archived: "yes", notes: 1, description: null }]);
    assert.deepEqual(read, { id: "a", name: "A", description: "", quadrant: 0, ring: "watch", score: 3, notes: "", addedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), archived: false });
  });
});

describe("the id of the skill of a migrated set", () => {
  test("is deterministic, made of the id of the set", () => {
    assert.equal(legacySkillId("a"), "a-skill");
    assert.equal(legacySkillId("a"), legacySkillId("a"));
  });
});

describe("migrating the old library to sets", () => {
  test("nothing stored, or something that is not a list, is no set", () => {
    assert.deepEqual(migrateLegacySkills(null), []);
    assert.deepEqual(migrateLegacySkills("x"), []);
  });

  test("each old skill becomes a set of one skill, in the same order, the set having the id of the old skill", () => {
    const sets = migrateLegacySkills([old, { ...old, id: "b", name: "ADR" }]);
    assert.deepEqual(sets.map((set) => set.id), ["a", "b"]);
    assert.deepEqual(sets.map((set) => set.skills.length), [1, 1]);
  });

  test("the set takes what placed the old skill on the radar, and has no notes", () => {
    const [set] = migrateLegacySkills([old]);
    assert.deepEqual({ ...set, skills: [] }, {
      id: "a",
      name: "TDD",
      sourceUrl: "https://example.com/tdd",
      description: "red, green",
      quadrant: 2,
      ring: "recommended",
      notes: "",
      skills: [],
      addedAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
      archived: true,
      moveReason: "proved itself",
    });
  });

  test("its only skill takes the score and the notes, and gets the id legacySkillId(set id)", () => {
    const [set] = migrateLegacySkills([old]);
    assert.deepEqual(set.skills, [
      { id: legacySkillId("a"), name: "TDD", sourceUrl: "https://example.com/tdd", description: "red, green", score: 5, notes: "my notes", addedAt: "2026-10-01T00:00:00.000Z" },
    ]);
  });

  test("an old skill with no url or reason gives a set and a skill with none", () => {
    const { sourceUrl: _url, moveReason: _reason, ...bare } = old;
    const [set] = migrateLegacySkills([bare]);
    assert.equal("sourceUrl" in set, false);
    assert.equal("moveReason" in set, false);
    assert.equal("sourceUrl" in set.skills[0], false);
  });
});
