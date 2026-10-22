import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { changesSince, pendingCount, type ComparedEdition } from "../src/lib/changes.ts";
import type { Skill } from "../src/lib/skills.ts";

const skill = (id: string, rest: Partial<Skill> = {}): Skill => ({
  id,
  name: `Skill ${id}`,
  description: "",
  quadrant: 0,
  ring: "watch",
  score: 3,
  notes: "",
  addedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  archived: false,
  ...rest,
});

/** An edition that published the skills as they are, unless told otherwise. */
const edition = (number: number, ...entries: Partial<ComparedEdition["entries"][number]>[]): ComparedEdition => ({
  number,
  entries: entries.map((entry) => ({ id: "a", ring: "watch", score: 3, notes: "", ...entry })),
});

describe("the changes with no edition", () => {
  test("every skill that is not archived is new, and an archived one is unchanged", () => {
    const changes = changesSince([skill("a"), skill("b", { archived: true })], []);
    assert.deepEqual(changes.get("a"), { kind: "new" });
    assert.deepEqual(changes.get("b"), { kind: "unchanged" });
  });
});

describe("the changes since the last edition", () => {
  test("a skill that is as it was published is unchanged", () => {
    assert.deepEqual(changesSince([skill("a")], [edition(1, { id: "a" })]).get("a"), { kind: "unchanged" });
  });

  test("a skill that is not in the last edition is new", () => {
    assert.deepEqual(changesSince([skill("b")], [edition(1, { id: "a" })]).get("b"), { kind: "new" });
  });

  test("a skill that is in an older edition but not in the last one is back", () => {
    const editions = [edition(1, { id: "b" }), edition(2, { id: "a" })];
    assert.deepEqual(changesSince([skill("b")], editions).get("b"), { kind: "back" });
  });

  test("a skill that is in no edition at all is new, whatever the number of editions", () => {
    const editions = [edition(1, { id: "a" }), edition(2, { id: "a" })];
    assert.deepEqual(changesSince([skill("b")], editions).get("b"), { kind: "new" });
  });

  test("a skill in another ring is moved towards recommended when the ring is nearer the centre", () => {
    const changes = changesSince([skill("a", { ring: "try" })], [edition(1, { id: "a", ring: "watch" })]);
    assert.deepEqual(changes.get("a"), { kind: "moved", previousRing: "watch", towards: "recommended" });
  });

  test("a skill in another ring is moved towards deprecated when the ring is further out", () => {
    const changes = changesSince([skill("a", { ring: "deprecated" })], [edition(1, { id: "a", ring: "try" })]);
    assert.deepEqual(changes.get("a"), { kind: "moved", previousRing: "try", towards: "deprecated" });
  });

  test("a skill with other notes or another score in the same ring is updated", () => {
    const editions = [edition(1, { id: "a" })];
    assert.deepEqual(changesSince([skill("a", { notes: "more" })], editions).get("a"), { kind: "updated" });
    assert.deepEqual(changesSince([skill("a", { score: 5 })], editions).get("a"), { kind: "updated" });
  });

  test("a move wins over an update", () => {
    const changes = changesSince([skill("a", { ring: "try", notes: "more" })], [edition(1, { id: "a" })]);
    assert.equal(changes.get("a")?.kind, "moved");
  });

  test("an archived skill that was in the last edition is retired, whatever else changed", () => {
    const archived = skill("a", { archived: true, ring: "try", notes: "more" });
    assert.deepEqual(changesSince([archived], [edition(1, { id: "a" })]).get("a"), { kind: "retired", previousRing: "watch" });
  });

  test("an archived skill that is not in the last edition is unchanged, even if an older one had it", () => {
    const editions = [edition(1, { id: "b" }), edition(2, { id: "a" })];
    assert.deepEqual(changesSince([skill("b", { archived: true })], editions).get("b"), { kind: "unchanged" });
  });

  test("a change of quadrant or of name is no change", () => {
    const renamed = skill("a", { quadrant: 2, name: "Another name" });
    assert.deepEqual(changesSince([renamed], [edition(1, { id: "a" })]).get("a"), { kind: "unchanged" });
  });

  test("the last edition is the one with the highest number, whatever the order of the list", () => {
    const editions = [edition(2, { id: "a", ring: "try" }), edition(1, { id: "a", ring: "watch" })];
    assert.deepEqual(changesSince([skill("a", { ring: "try" })], editions).get("a"), { kind: "unchanged" });
  });

  test("every skill gets an entry", () => {
    const changes = changesSince([skill("a"), skill("b"), skill("c", { archived: true })], [edition(1, { id: "a" })]);
    assert.deepEqual([...changes.keys()].sort(), ["a", "b", "c"]);
  });
});

describe("the changes that wait to be published", () => {
  test("new, back, moved and retired ones count, updated and unchanged ones do not", () => {
    const editions = [edition(1, { id: "back" }), edition(2, { id: "same" }, { id: "moved" }, { id: "upd" }, { id: "gone" })];
    const skills = [
      skill("new"),
      skill("back"),
      skill("moved", { ring: "try" }),
      skill("gone", { archived: true }),
      skill("upd", { notes: "more" }),
      skill("same"),
    ];
    const changes = changesSince(skills, editions);
    assert.equal(changes.get("upd")?.kind, "updated");
    assert.equal(pendingCount(changes), 4);
  });

  test("nothing waits when nothing changed", () => {
    assert.equal(pendingCount(changesSince([skill("a")], [edition(1, { id: "a" })])), 0);
  });
});
