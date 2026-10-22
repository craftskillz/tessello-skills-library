import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addSkill, linkOf, newestFirst, NOTES_TEMPLATE, readSettings, readSkills, type Skill } from "../src/lib/skills.ts";

const skill = (id: string, addedAt: string, rest: Partial<Skill> = {}): Skill => ({
  id,
  name: `Skill ${id}`,
  description: "",
  quadrant: 0,
  ring: "watch",
  score: 3,
  notes: "",
  addedAt,
  updatedAt: addedAt,
  archived: false,
  ...rest,
});

describe("adding a skill by hand", () => {
  const now = new Date("2026-10-22T10:00:00Z");

  test("a new skill is to watch, scored 3, in the first quadrant, with the template as its notes", () => {
    const result = addSkill([], { name: "  TDD  ", description: " red, green " , url: " https://example.com/tdd "}, now, "id-1");
    assert.deepEqual(result?.skills, [
      {
        id: "id-1",
        name: "TDD",
        sourceUrl: "https://example.com/tdd",
        description: "red, green",
        quadrant: 0,
        ring: "watch",
        score: 3,
        notes: NOTES_TEMPLATE,
        addedAt: "2026-10-22T10:00:00.000Z",
        updatedAt: "2026-10-22T10:00:00.000Z",
        archived: false,
      },
    ]);
    assert.equal(result?.skill, result?.skills[0]);
  });

  test("the template is the one of the spec, in French because the notes are published as they are", () => {
    assert.equal(NOTES_TEMPLATE, "#### À quoi ça sert\n\n#### Pourquoi\n\n#### Comment\n");
  });

  test("a blank url is no url, and a missing description is an empty one", () => {
    const result = addSkill([], { name: "TDD", url: "   " }, now, "id-1")!;
    assert.equal("sourceUrl" in result.skill, false);
    assert.equal(result.skill.description, "");
  });

  test("a blank name adds nothing", () => {
    assert.equal(addSkill([], { name: "   " }, now, "id-1"), null);
  });

  test("the new skill comes first, and the others are untouched", () => {
    const existing = [skill("a", "2026-10-01T00:00:00.000Z")];
    const result = addSkill(existing, { name: "New" }, now, "b")!;
    assert.deepEqual(result.skills.map((item) => item.id), ["b", "a"]);
    assert.equal(result.skills[1], existing[0]);
  });
});

describe("the list as the View shows it", () => {
  test("the most recently added first, those added together in the order they were", () => {
    const list = [skill("a", "2026-10-01T00:00:00.000Z"), skill("b", "2026-10-20T00:00:00.000Z"), skill("c", "2026-10-01T00:00:00.000Z")];
    assert.deepEqual(newestFirst(list).map((item) => item.id), ["b", "a", "c"]);
  });
});

describe("reading the skills the storage holds", () => {
  test("nothing stored, or something that is not a list, is no skill", () => {
    assert.deepEqual(readSkills(null), []);
    assert.deepEqual(readSkills({ id: "a", name: "A" }), []);
  });

  test("a skill is read back as it was written", () => {
    const full = skill("a", "2026-10-01T00:00:00.000Z", {
      sourceUrl: "https://example.com",
      description: "d",
      quadrant: 2,
      ring: "recommended",
      score: 5,
      notes: "n",
      updatedAt: "2026-10-02T00:00:00.000Z",
      archived: true,
      moveReason: "proved itself",
    });
    assert.deepEqual(readSkills([full]), [full]);
  });

  test("what has no id or name is skipped, and a duplicate id is dropped", () => {
    assert.deepEqual(
      readSkills([{ name: "A" }, "junk", { id: "a" }, { id: "", name: "A" }, { id: "a", name: "first" }, { id: "a", name: "second" }]).map((item) => item.name),
      ["first"],
    );
  });

  test("a value out of range or of the wrong kind takes its default", () => {
    const [read] = readSkills([{ id: "a", name: "A", ring: "adopt", score: 9, quadrant: 4, addedAt: "never", updatedAt: 3, archived: "yes", notes: 1, description: null }]);
    assert.deepEqual(read, skill("a", new Date(0).toISOString(), { name: "A" }));
    assert.equal(readSkills([{ id: "a", name: "A", score: 2.5, quadrant: -1 }])[0].score, 3);
    assert.equal(readSkills([{ id: "a", name: "A", score: 2.5, quadrant: -1 }])[0].quadrant, 0);
    assert.equal(readSkills([{ id: "a", name: "A", score: 0 }])[0].score, 3);
  });
});

describe("the link of a skill", () => {
  const link = (sourceUrl?: string) => linkOf(skill("a", "2026-10-01T00:00:00.000Z", { sourceUrl }));

  test("is its url when it is an http or https one", () => {
    assert.equal(link("https://example.com/a?b=1"), "https://example.com/a?b=1");
    assert.equal(link("http://example.com"), "http://example.com");
  });

  test("is none for another kind of url, or for no url", () => {
    assert.equal(link("javascript:alert(1)"), null);
    assert.equal(link("data:text/html,x"), null);
    assert.equal(link("not a url"), null);
    assert.equal(link(undefined), null);
  });
});

describe("reading the settings", () => {
  const names = ["Design & planning", "Code & tests", "Writing & docs", "Tooling & workflow"];

  test("what cannot be read takes its default", () => {
    assert.deepEqual(readSettings(null), { quadrants: names, tab: "library", filters: {} });
    assert.deepEqual(readSettings({ quadrants: "x", tab: "nowhere", filters: [] }), { quadrants: names, tab: "library", filters: {} });
  });

  test("the tab and the filters are kept", () => {
    assert.deepEqual(readSettings({ tab: "radar", filters: { ring: "try" } }), { quadrants: names, tab: "radar", filters: { ring: "try" } });
  });

  test("a quadrant is named without the spaces around it; a blank or too long name takes its default", () => {
    const settings = readSettings({ quadrants: ["  Mine ", "   ", "x".repeat(41), 3] });
    assert.deepEqual(settings.quadrants, ["Mine", names[1], names[2], names[3]]);
    assert.equal(readSettings({ quadrants: ["x".repeat(40)] }).quadrants[0], "x".repeat(40));
  });
});
