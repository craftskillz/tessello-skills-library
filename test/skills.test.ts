import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addSkill, canDelete, deleteSkill, editSkill, filterSkills, linkOf, newestFirst, NOTES_MAX, NOTES_TEMPLATE, readFilters, readSettings, renameQuadrant, readSkills, type Skill } from "../src/lib/skills.ts";

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

  test("a name and a description longer than the View accepts are clipped, as when a SKILL.md gives them", () => {
    const result = addSkill([], { name: "n".repeat(300), description: "d".repeat(2000) }, now, "id-1")!;
    assert.equal(result.skill.name, "n".repeat(100));
    assert.equal(result.skill.description, "d".repeat(500));
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

  const none = { rings: [], quadrants: [], query: "", archived: false };

  test("what cannot be read takes its default", () => {
    assert.deepEqual(readSettings(null), { quadrants: names, tab: "library", filters: none });
    assert.deepEqual(readSettings({ quadrants: "x", tab: "nowhere", filters: [] }), { quadrants: names, tab: "library", filters: none });
  });

  test("the tab and the filters are kept", () => {
    const filters = { rings: ["try"], quadrants: [2], query: "tdd", archived: true };
    assert.deepEqual(readSettings({ tab: "radar", filters }), { quadrants: names, tab: "radar", filters });
  });

  test("a quadrant is named without the spaces around it; a blank or too long name takes its default", () => {
    const settings = readSettings({ quadrants: ["  Mine ", "   ", "x".repeat(41), 3] });
    assert.deepEqual(settings.quadrants, ["Mine", names[1], names[2], names[3]]);
    assert.equal(readSettings({ quadrants: ["x".repeat(40)] }).quadrants[0], "x".repeat(40));
  });
});

describe("editing a skill", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const list = [skill("a", "2026-10-01T00:00:00.000Z"), skill("b", "2026-10-02T00:00:00.000Z")];

  test("a changed value is saved, with the date of the change, and the others are untouched", () => {
    const result = editSkill(list, "b", { ring: "try" }, now);
    assert.ok(result && "skill" in result);
    assert.equal(result.skill.ring, "try");
    assert.equal(result.skill.updatedAt, "2026-10-23T09:00:00.000Z");
    assert.equal(result.skill.addedAt, "2026-10-02T00:00:00.000Z");
    assert.deepEqual(result.skills.map((item) => item.id), ["a", "b"]);
    assert.equal(result.skills[0], list[0]);
    assert.equal(result.skills[1], result.skill);
  });

  test("an unknown id edits nothing", () => {
    assert.equal(editSkill(list, "zzz", { ring: "try" }, now), null);
  });

  test("a change to what the skill already has changes nothing, not even its date", () => {
    const result = editSkill(list, "a", { ring: "watch", score: 3, name: "Skill a", description: "" }, now);
    assert.ok(result && "skill" in result);
    assert.equal(result.skill, list[0]);
    assert.equal(result.skills, list);
    assert.equal(editSkill(list, "a", {}, now) && (editSkill(list, "a", {}, now) as { skill: Skill }).skill, list[0]);
  });

  test("a quadrant, a ring or a score that does not exist is ignored", () => {
    const result = editSkill(list, "a", { quadrant: 4, ring: "adopt" as never, score: 6 }, now);
    assert.ok(result && "skill" in result);
    assert.equal(result.skill, list[0]);
    for (const score of [0, 2.5, Number.NaN]) assert.equal((editSkill(list, "a", { score }, now) as { skill: Skill }).skill, list[0]);
    assert.equal((editSkill(list, "a", { quadrant: -1 }, now) as { skill: Skill }).skill, list[0]);
    assert.equal((editSkill(list, "a", { quadrant: 3, score: 5 }, now) as { skill: Skill }).skill.quadrant, 3);
  });

  test("the name, the description and the notes are kept as typed, only clipped", () => {
    const result = editSkill(list, "a", { name: " Écrire ", description: "d ".repeat(400), notes: "line \n" }, now) as { skill: Skill };
    assert.equal(result.skill.name, " Écrire ");
    assert.equal(result.skill.description, ("d ".repeat(400)).slice(0, 500));
    assert.equal(result.skill.notes, "line \n");
    assert.equal((editSkill(list, "a", { name: "n".repeat(300) }, now) as { skill: Skill }).skill.name, "n".repeat(100));
  });

  test("a blank name is refused and nothing is saved", () => {
    assert.deepEqual(editSkill(list, "a", { name: "   " }, now), { error: "name_required" });
    assert.deepEqual(editSkill(list, "a", { name: "", ring: "try" }, now), { error: "name_required" });
  });

  test("notes longer than the View accepts are refused, those of exactly that length are not", () => {
    assert.deepEqual(editSkill(list, "a", { notes: "n".repeat(NOTES_MAX + 1) }, now), { error: "notes_too_long" });
    assert.equal(NOTES_MAX, 8000);
    const result = editSkill(list, "a", { notes: "n".repeat(NOTES_MAX) }, now) as { skill: Skill };
    assert.equal(result.skill.notes.length, 8000);
  });

  test("a url is saved without the spaces around it, and a blank one removes it", () => {
    const set = editSkill(list, "a", { sourceUrl: "  https://example.com/x " }, now) as { skill: Skill; skills: Skill[] };
    assert.equal(set.skill.sourceUrl, "https://example.com/x");
    const removed = editSkill(set.skills, "a", { sourceUrl: "  " }, now) as { skill: Skill };
    assert.equal("sourceUrl" in removed.skill, false);
    assert.equal(removed.skill.updatedAt, "2026-10-23T09:00:00.000Z");
    assert.equal((editSkill(list, "a", { sourceUrl: "" }, now) as { skill: Skill }).skill, list[0]);
  });

  test("a skill is archived and unarchived, and the date changes only when that does", () => {
    const archived = editSkill(list, "a", { archived: true }, now) as { skill: Skill; skills: Skill[] };
    assert.equal(archived.skill.archived, true);
    assert.equal(archived.skill.updatedAt, "2026-10-23T09:00:00.000Z");
    const again = editSkill(archived.skills, "a", { archived: true }, new Date("2026-11-01T00:00:00Z")) as { skill: Skill };
    assert.equal(again.skill, archived.skill);
    const back = editSkill(archived.skills, "a", { archived: false }, now) as { skill: Skill };
    assert.equal(back.skill.archived, false);
  });

  test("an archived value that is not a boolean is ignored", () => {
    const result = editSkill(list, "a", { archived: "yes" as unknown as boolean }, now) as { skill: Skill };
    assert.equal(result.skill, list[0]);
  });
});

describe("reading the filters", () => {
  test("archived skills are shown only when the stored value is exactly true", () => {
    assert.equal(readFilters({ archived: true }).archived, true);
    for (const archived of [false, "true", 1, null, undefined]) assert.equal(readFilters({ archived }).archived, false);
  });

  test("nothing, or something that is not an object, is no filtering", () => {
    for (const stored of [null, undefined, "x", 3, []]) assert.deepEqual(readFilters(stored), { rings: [], quadrants: [], query: "", archived: false });
  });

  test("an unknown ring, a quadrant out of range and a duplicate are dropped", () => {
    assert.deepEqual(readFilters({ rings: ["try", "adopt", "try", 3, "watch"], quadrants: [1, 4, 1, -1, 2.5, "0", 3], query: "tdd" }), {
      rings: ["try", "watch"],
      quadrants: [1, 3],
      query: "tdd",
      archived: false,
    });
  });

  test("a value of the wrong kind takes its default", () => {
    assert.deepEqual(readFilters({ rings: "try", quadrants: 1, query: 3 }), { rings: [], quadrants: [], query: "", archived: false });
  });
});

describe("filtering the library", () => {
  const at = "2026-10-01T00:00:00.000Z";
  const list = [
    skill("a", at, { name: "Écrire un ADR", ring: "try", quadrant: 2 }),
    skill("b", at, { name: "tdd-loop", ring: "recommended", quadrant: 1 }),
    skill("c", at, { name: "Plan", ring: "try", quadrant: 0 }),
    skill("d", at, { name: "Old plan", ring: "try", quadrant: 0, archived: true }),
  ];
  const by = (filters: Partial<Parameters<typeof filterSkills>[1]>) =>
    filterSkills(list, { rings: [], quadrants: [], query: "", archived: false, ...filters }).map((item) => item.id);

  test("no filter keeps every skill that is not archived, in its order", () => {
    assert.deepEqual(by({}), ["a", "b", "c"]);
  });

  test("the archived skills are kept too when asked, still subject to the other filters", () => {
    assert.deepEqual(by({ archived: true }), ["a", "b", "c", "d"]);
    assert.deepEqual(by({ archived: true, query: "plan" }), ["c", "d"]);
    assert.deepEqual(by({ archived: false, query: "plan" }), ["c"]);
  });

  test("several rings keep the skills of any of them", () => {
    assert.deepEqual(by({ rings: ["try"] }), ["a", "c"]);
    assert.deepEqual(by({ rings: ["try", "recommended"] }), ["a", "b", "c"]);
    assert.deepEqual(by({ rings: ["deprecated"] }), []);
  });

  test("several quadrants keep the skills of any of them", () => {
    assert.deepEqual(by({ quadrants: [0, 2] }), ["a", "c"]);
  });

  test("the rings and the quadrants together keep the skills that match both", () => {
    assert.deepEqual(by({ rings: ["try"], quadrants: [2] }), ["a"]);
  });

  test("the search finds a part of the name, ignoring case and accents", () => {
    assert.deepEqual(by({ query: "ecrire" }), ["a"]);
    assert.deepEqual(by({ query: "ÉCRIRE" }), ["a"]);
    assert.deepEqual(by({ query: "TDD" }), ["b"]);
    assert.deepEqual(by({ query: "  loop " }), ["b"]);
    assert.deepEqual(by({ query: "   " }), ["a", "b", "c"]);
    assert.deepEqual(by({ query: "nothing" }), []);
  });

  test("the search and the filters together keep the skills that match all", () => {
    assert.deepEqual(by({ query: "a", rings: ["recommended"] }), []);
    assert.deepEqual(by({ query: "plan", rings: ["try"] }), ["c"]);
  });
});

describe("deleting a skill", () => {
  const at = "2026-10-01T00:00:00.000Z";
  const list = [skill("a", at), skill("b", at), skill("c", at)];
  const editions = [{ entries: [{ id: "b" }] }, { entries: [{ id: "x" }, { id: "y" }] }];

  test("a skill that is in no edition can be deleted", () => {
    assert.equal(canDelete("a", editions), true);
    assert.equal(canDelete("a", []), true);
  });

  test("a skill that is in an edition cannot", () => {
    assert.equal(canDelete("b", editions), false);
    assert.equal(canDelete("y", editions), false);
  });

  test("deleting gives the list without the skill, the others the same objects in the same order", () => {
    const result = deleteSkill(list, "b", []);
    assert.equal(result?.length, 2);
    assert.equal(result?.[0], list[0]);
    assert.equal(result?.[1], list[2]);
    assert.equal(list.length, 3);
  });

  test("a skill that was published, or that does not exist, is not deleted", () => {
    assert.equal(deleteSkill(list, "b", editions), null);
    assert.equal(deleteSkill(list, "nope", editions), null);
  });
});

describe("renaming a quadrant", () => {
  const names: [string, string, string, string] = ["A", "B", "C", "D"];

  test("gives the names with the new one in place, trimmed, and leaves the old ones as they were", () => {
    assert.deepEqual(renameQuadrant(names, 2, "  Mine "), ["A", "B", "Mine", "D"]);
    assert.deepEqual(names, ["A", "B", "C", "D"]);
    assert.deepEqual(renameQuadrant(names, 0, "x".repeat(40)), ["x".repeat(40), "B", "C", "D"]);
  });

  test("a blank name, or one longer than 40 characters, is refused", () => {
    assert.equal(renameQuadrant(names, 1, "   "), null);
    assert.equal(renameQuadrant(names, 1, "x".repeat(41)), null);
  });

  test("a quadrant that does not exist is refused", () => {
    for (const index of [-1, 4, 1.5]) assert.equal(renameQuadrant(names, index, "Mine"), null);
  });
});

describe("the reason of a move", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const list = [skill("a", "2026-10-01T00:00:00.000Z", { ring: "try" }), skill("b", "2026-10-02T00:00:00.000Z", { ring: "try", moveReason: "Proven" })];
  const edit = (id: string, change: Parameters<typeof editSkill>[2], published?: Parameters<typeof editSkill>[4]) =>
    editSkill(list, id, change, now, published) as { skill: Skill };

  test("a reason is kept while the ring differs from the published one", () => {
    const result = edit("a", { moveReason: "Worked well" }, "watch");
    assert.equal(result.skill.moveReason, "Worked well");
    assert.equal(result.skill.updatedAt, "2026-10-23T09:00:00.000Z");
  });

  test("a reason is dropped when the skill is in no edition", () => {
    assert.equal(edit("a", { moveReason: "Worked well" }).skill.moveReason, undefined);
  });

  test("returning to the published ring clears the reason", () => {
    const result = edit("b", { ring: "watch" }, "watch");
    assert.equal(result.skill.ring, "watch");
    assert.equal("moveReason" in result.skill, false);
  });

  test("the reason stays through an edit that leaves the ring moved", () => {
    const result = edit("b", { score: 4 }, "watch");
    assert.equal(result.skill.moveReason, "Proven");
  });

  test("a blank reason removes it", () => {
    assert.equal("moveReason" in edit("b", { moveReason: "   " }, "watch").skill, false);
  });

  test("a reason is kept as typed", () => {
    assert.equal(edit("a", { moveReason: " Why " }, "watch").skill.moveReason, " Why ");
  });

  test("a reason that is too long is refused and nothing is saved", () => {
    assert.deepEqual(editSkill(list, "a", { moveReason: "x".repeat(281) }, now, "watch"), { error: "reason_too_long" });
    assert.equal(edit("a", { moveReason: "x".repeat(280) }, "watch").skill.moveReason, "x".repeat(280));
  });

  test("the same reason changes nothing, not even the date", () => {
    const result = editSkill(list, "b", { moveReason: "Proven" }, now, "watch") as { skill: Skill };
    assert.equal(result.skill, list[1]);
  });
});
