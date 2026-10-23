import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Edition } from "../src/lib/editions.ts";
import type { SkillSet } from "../src/lib/skills.ts";
import { widgetSummary } from "../src/lib/widget.ts";

const skill = (id: string, rest: Partial<SkillSet> = {}): SkillSet => ({
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

/** An edition that published the given sets as they are. */
const edition = (number: number, publishedAt: string, ...published: SkillSet[]): Edition => ({
  number,
  publishedAt,
  intro: "Intro",
  topics: ["A", "B", "C", "D", "E"],
  entries: published.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    quadrant: s.quadrant,
    ring: s.ring,
    notes: s.notes,
    skills: s.skills.map((k) => ({ id: k.id, name: k.name, description: k.description, ...(k.score !== undefined ? { score: k.score } : {}), notes: k.notes })),
    change: "unchanged",
  })),
  retired: [],
});

describe("the sets per ring", () => {
  test("counts the sets not archived of each ring, zeros included", () => {
    const skills = [skill("a", { ring: "try" }), skill("b", { ring: "try" }), skill("c"), skill("d", { ring: "try", archived: true })];
    assert.deepEqual(widgetSummary(skills, []).counts, { recommended: 0, try: 2, watch: 1, deprecated: 0 });
  });

  test("all zeros when there is no set", () => {
    assert.deepEqual(widgetSummary([], []).counts, { recommended: 0, try: 0, watch: 0, deprecated: 0 });
  });
});

describe("the date of the last edition", () => {
  test("is undefined when no edition was published", () => {
    assert.equal(widgetSummary([skill("a")], []).lastPublishedAt, undefined);
  });

  test("is the date of the edition with the highest number, whatever the order of the list", () => {
    const editions = [edition(2, "2026-10-15T09:00:00.000Z"), edition(1, "2026-10-02T09:00:00.000Z"), edition(3, "2026-10-20T09:00:00.000Z")];
    assert.equal(widgetSummary([], editions).lastPublishedAt, "2026-10-20T09:00:00.000Z");
  });
});

describe("the changes that wait", () => {
  test("with no edition, every skill not archived waits", () => {
    assert.equal(widgetSummary([skill("a"), skill("b"), skill("c", { archived: true })], []).pending, 2);
  });

  test("nothing waits right after an edition that matches the skills", () => {
    const skills = [skill("a"), skill("b", { ring: "try" })];
    assert.equal(widgetSummary(skills, [edition(1, "2026-10-02T09:00:00.000Z", ...skills)]).pending, 0);
  });

  test("a skill moved to another ring since the edition makes one change wait", () => {
    const published = skill("a");
    const editions = [edition(1, "2026-10-02T09:00:00.000Z", published)];
    assert.equal(widgetSummary([{ ...published, ring: "try" }], editions).pending, 1);
  });

  test("a set whose notes changed or that got a skill does not wait", () => {
    const published = skill("a");
    const editions = [edition(1, "2026-10-02T09:00:00.000Z", published)];
    const skills = [{ id: "s", name: "S", description: "", notes: "", addedAt: "2026-10-01T00:00:00.000Z", score: 5 }];
    assert.equal(widgetSummary([{ ...published, notes: "more", skills }], editions).pending, 0);
  });
});
