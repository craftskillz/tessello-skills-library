import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { changesSince, hasSkillChanges, pendingCount, type ComparedEdition } from "../src/lib/changes.ts";
import type { Skill, SkillSet } from "../src/lib/skills.ts";

const member = (id: string, rest: Partial<Skill> = {}): Skill => ({
  id,
  name: `Skill ${id}`,
  description: "",
  notes: "",
  addedAt: "2026-10-01T00:00:00.000Z",
  ...rest,
});

const set = (id: string, rest: Partial<SkillSet> = {}): SkillSet => ({
  id,
  name: `Set ${id}`,
  description: "",
  quadrant: 0,
  ring: "watch",
  notes: "",
  skills: [],
  addedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  archived: false,
  ...rest,
});

/** An edition that published the sets as they are, unless told otherwise. */
const edition = (number: number, ...entries: Partial<ComparedEdition["entries"][number]>[]): ComparedEdition => ({
  number,
  entries: entries.map((entry) => ({ id: "a", ring: "watch", notes: "", skills: [], ...entry })),
});

const noSkillChanges = { added: [], removed: [], scores: [] };

describe("the changes with no edition", () => {
  test("every skill that is not archived is new, and an archived one is unchanged", () => {
    const changes = changesSince([set("a"), set("b", { archived: true })], []);
    assert.deepEqual(changes.get("a"), { kind: "new" });
    assert.deepEqual(changes.get("b"), { kind: "unchanged" });
  });
});

describe("the changes since the last edition", () => {
  test("a skill that is as it was published is unchanged", () => {
    assert.deepEqual(changesSince([set("a")], [edition(1, { id: "a" })]).get("a"), { kind: "unchanged" });
  });

  test("a skill that is not in the last edition is new", () => {
    assert.deepEqual(changesSince([set("b")], [edition(1, { id: "a" })]).get("b"), { kind: "new" });
  });

  test("a skill that is in an older edition but not in the last one is back", () => {
    const editions = [edition(1, { id: "b" }), edition(2, { id: "a" })];
    assert.deepEqual(changesSince([set("b")], editions).get("b"), { kind: "back" });
  });

  test("a skill that is in no edition at all is new, whatever the number of editions", () => {
    const editions = [edition(1, { id: "a" }), edition(2, { id: "a" })];
    assert.deepEqual(changesSince([set("b")], editions).get("b"), { kind: "new" });
  });

  test("a set in another ring is moved towards recommended when the ring is nearer the centre", () => {
    const changes = changesSince([set("a", { ring: "try" })], [edition(1, { id: "a", ring: "watch" })]);
    assert.deepEqual(changes.get("a"), { kind: "moved", previousRing: "watch", towards: "recommended", skills: noSkillChanges });
  });

  test("a set in another ring is moved towards deprecated when the ring is further out", () => {
    const changes = changesSince([set("a", { ring: "deprecated" })], [edition(1, { id: "a", ring: "try" })]);
    assert.deepEqual(changes.get("a"), { kind: "moved", previousRing: "try", towards: "deprecated", skills: noSkillChanges });
  });

  test("a set with other notes in the same ring is updated, with no skill detail", () => {
    const editions = [edition(1, { id: "a" })];
    assert.deepEqual(changesSince([set("a", { notes: "more" })], editions).get("a"), { kind: "updated", skills: noSkillChanges });
  });

  test("a move wins over an update", () => {
    const changes = changesSince([set("a", { ring: "try", notes: "more" })], [edition(1, { id: "a" })]);
    assert.equal(changes.get("a")?.kind, "moved");
  });

  test("an archived set that was in the last edition is retired, whatever else changed", () => {
    const archived = set("a", { archived: true, ring: "try", notes: "more" });
    assert.deepEqual(changesSince([archived], [edition(1, { id: "a" })]).get("a"), { kind: "retired", previousRing: "watch" });
  });

  test("an archived set that is not in the last edition is unchanged, even if an older one had it", () => {
    const editions = [edition(1, { id: "b" }), edition(2, { id: "a" })];
    assert.deepEqual(changesSince([set("b", { archived: true })], editions).get("b"), { kind: "unchanged" });
  });

  test("a change of quadrant or of name is no change", () => {
    const renamed = set("a", { quadrant: 2, name: "Another name", description: "d", sourceUrl: "https://x.test" });
    assert.deepEqual(changesSince([renamed], [edition(1, { id: "a" })]).get("a"), { kind: "unchanged" });
  });

  test("the last edition is the one with the highest number, whatever the order of the list", () => {
    const editions = [edition(2, { id: "a", ring: "try" }), edition(1, { id: "a", ring: "watch" })];
    assert.deepEqual(changesSince([set("a", { ring: "try" })], editions).get("a"), { kind: "unchanged" });
  });

  test("every set gets an entry", () => {
    const changes = changesSince([set("a"), set("b"), set("c", { archived: true })], [edition(1, { id: "a" })]);
    assert.deepEqual([...changes.keys()].sort(), ["a", "b", "c"]);
  });
});

describe("the changes of the skills of a set", () => {
  const published = (...skills: Partial<ComparedEdition["entries"][number]["skills"][number]>[]) => [
    edition(1, { id: "a", skills: skills.map((skill) => ({ id: "s1", name: "Skill s1", notes: "", ...skill })) }),
  ];

  test("a skill added to the set makes it updated, naming the skill", () => {
    const changes = changesSince([set("a", { skills: [member("s1"), member("s2", { name: "New one" })] })], published({}));
    assert.deepEqual(changes.get("a"), { kind: "updated", skills: { ...noSkillChanges, added: [{ id: "s2", name: "New one" }] } });
  });

  test("a skill removed from the set makes it updated, naming the skill as it was published", () => {
    const changes = changesSince([set("a", { skills: [] })], published({ name: "Old name" }));
    assert.deepEqual(changes.get("a"), { kind: "updated", skills: { ...noSkillChanges, removed: [{ id: "s1", name: "Old name" }] } });
  });

  test("a skill whose score changed makes the set updated, with the score before and after", () => {
    const changes = changesSince([set("a", { skills: [member("s1", { score: 4 })] })], published({ score: 2 }));
    assert.deepEqual(changes.get("a"), { kind: "updated", skills: { ...noSkillChanges, scores: [{ id: "s1", name: "Skill s1", before: 2, after: 4 }] } });
  });

  test("a skill that was evaluated and is not any more is a score change with no score after", () => {
    const changes = changesSince([set("a", { skills: [member("s1")] })], published({ score: 2 }));
    assert.deepEqual(changes.get("a"), { kind: "updated", skills: { ...noSkillChanges, scores: [{ id: "s1", name: "Skill s1", before: 2 }] } });
  });

  test("a skill that gets its first score is a score change with no score before", () => {
    const changes = changesSince([set("a", { skills: [member("s1", { score: 3 })] })], published({}));
    assert.deepEqual(changes.get("a"), { kind: "updated", skills: { ...noSkillChanges, scores: [{ id: "s1", name: "Skill s1", after: 3 }] } });
  });

  test("a skill with other notes makes the set updated, with nothing to detail", () => {
    const changes = changesSince([set("a", { skills: [member("s1", { notes: "more" })] })], published({}));
    assert.deepEqual(changes.get("a"), { kind: "updated", skills: noSkillChanges });
  });

  test("a skill renamed, redescribed, re-linked or gone upstream is no change", () => {
    const skill = member("s1", { name: "Renamed", description: "d", sourceUrl: "https://x.test", goneUpstream: true });
    assert.deepEqual(changesSince([set("a", { skills: [skill] })], published({})).get("a"), { kind: "unchanged" });
  });

  test("a moved set carries the changes of its skills", () => {
    const changes = changesSince([set("a", { ring: "try", skills: [member("s1", { score: 5 })] })], published({}));
    assert.deepEqual(changes.get("a"), {
      kind: "moved",
      previousRing: "watch",
      towards: "recommended",
      skills: { ...noSkillChanges, scores: [{ id: "s1", name: "Skill s1", after: 5 }] },
    });
  });

  test("a set back after some editions is compared to nothing, so it carries no skill detail", () => {
    const editions = [edition(1, { id: "b" }), edition(2, { id: "a" })];
    assert.deepEqual(changesSince([set("b", { skills: [member("s1")] })], editions).get("b"), { kind: "back" });
  });

  test("says whether there is anything to detail", () => {
    assert.equal(hasSkillChanges(noSkillChanges), false);
    assert.equal(hasSkillChanges({ ...noSkillChanges, added: [{ id: "x", name: "X" }] }), true);
    assert.equal(hasSkillChanges({ ...noSkillChanges, removed: [{ id: "x", name: "X" }] }), true);
    assert.equal(hasSkillChanges({ ...noSkillChanges, scores: [{ id: "x", name: "X" }] }), true);
  });
});

describe("the changes that wait to be published", () => {
  test("new, back, moved and retired ones count, updated and unchanged ones do not", () => {
    const editions = [edition(1, { id: "back" }), edition(2, { id: "same" }, { id: "moved" }, { id: "upd" }, { id: "gone" })];
    const sets = [
      set("new"),
      set("back"),
      set("moved", { ring: "try" }),
      set("gone", { archived: true }),
      set("upd", { notes: "more" }),
      set("same"),
    ];
    const changes = changesSince(sets, editions);
    assert.equal(changes.get("upd")?.kind, "updated");
    assert.equal(pendingCount(changes), 4);
  });

  test("nothing waits when nothing changed", () => {
    assert.equal(pendingCount(changesSince([set("a")], [edition(1, { id: "a" })])), 0);
  });
});

describe("the changes after a refresh from GitHub", () => {
  const published = edition(1, { id: "a", skills: [{ id: "s1", name: "Skill s1", notes: "" }] });
  const before = set("a", { skills: [member("s1", { sourceUrl: "https://github.com/o/r/tree/main/s1" })] });

  test("a skill added makes the set updated, with the skill in added", () => {
    const after = { ...before, skills: [...before.skills, member("s2")] };
    assert.deepEqual(changesSince([after], [published]).get("a"), {
      kind: "updated",
      skills: { added: [{ id: "s2", name: "Skill s2" }], removed: [], scores: [] },
    });
  });

  test("a skill gone upstream alone is unchanged", () => {
    const after = { ...before, skills: [{ ...before.skills[0], goneUpstream: true }] };
    assert.deepEqual(changesSince([after], [published]).get("a"), { kind: "unchanged" });
  });
});
