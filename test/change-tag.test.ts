import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Skill, SkillSet } from "../src/lib/skills.ts";
import { changeTag, ringName, skillCountLabel } from "../src/view/change-tag.ts";

const member = (id: string, rest: Partial<Skill> = {}): Skill => ({
  id,
  name: `Skill ${id}`,
  description: "",
  notes: "",
  addedAt: "2026-10-01T00:00:00.000Z",
  topic: 0,
  ...rest,
});

const set = (rest: Partial<SkillSet> = {}): SkillSet => ({
  id: "a",
  name: "Set a",
  description: "",
  ring: "watch",
  notes: "",
  skills: [member("m")],
  addedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  archived: false,
  ...rest,
});

const noSkillChanges = { added: [], removed: [], scores: [] };

describe("the tag of a change", () => {
  test("is New, Back or Updated", () => {
    assert.equal(changeTag(set(), { kind: "new" }), "New");
    assert.equal(changeTag(set(), { kind: "back" }), "Back");
    assert.equal(changeTag(set(), { kind: "updated", skills: noSkillChanges }), "Updated");
  });

  test("names the ring a moved set comes from and the one it is in", () => {
    const moved = { kind: "moved", previousRing: "try", towards: "recommended", skills: noSkillChanges } as const;
    assert.equal(changeTag(set({ ring: "recommended" }), moved), "Moved: Try → Recommended");
  });

  test("names the ring a retired set left, not the one it is in now", () => {
    assert.equal(changeTag(set({ archived: true, ring: "try" }), { kind: "retired", previousRing: "watch" }), "Retired (was Watch)");
  });

  test("is empty for a set unchanged, or with no change", () => {
    assert.equal(changeTag(set(), { kind: "unchanged" }), "");
    assert.equal(changeTag(set(), undefined), "");
  });
});

describe("the name of a ring", () => {
  test("is the one the View shows", () => {
    assert.deepEqual((["recommended", "try", "watch", "deprecated"] as const).map(ringName), ["Recommended", "Try", "Watch", "Deprecated"]);
  });
});

describe("the count of the skills of a set", () => {
  test("says how many are not evaluated", () => {
    assert.equal(skillCountLabel(set()), "1 skill (not evaluated)");
    assert.equal(skillCountLabel(set({ skills: [member("a"), member("b"), member("c")] })), "3 skills (3 not evaluated)");
    assert.equal(skillCountLabel(set({ skills: [member("a", { score: 5 }), member("b")] })), "2 skills (1 not evaluated)");
  });

  test("says only how many there are when all are evaluated", () => {
    assert.equal(skillCountLabel(set({ skills: [member("a", { score: 3 })] })), "1 skill");
    assert.equal(skillCountLabel(set({ skills: [member("a", { score: 3 }), member("b", { score: 1 })] })), "2 skills");
    assert.equal(skillCountLabel(set({ skills: [] })), "0 skills");
  });
});
