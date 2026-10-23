import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addSet,
  addSkillToSet,
  addUnlessDuplicate,
  canDelete,
  defaultTopic,
  deleteSet,
  editSet,
  editSkillInSet,
  editUnlessDuplicate,
  filterSets,
  findDuplicate,
  importSet,
  linkOf,
  newestFirst,
  NOTES_MAX,
  NOTES_TEMPLATE,
  readFilters,
  readSettings,
  type Topics,
  readSets,
  refreshSet,
  removeSkillFromSet,
  renameTopic,
  setTopics,
  type Skill,
  type SkillSet,
} from "../src/lib/skills.ts";

const set = (id: string, addedAt: string, rest: Partial<SkillSet> = {}): SkillSet => ({
  id,
  name: `Set ${id}`,
  description: "",
  ring: "watch",
  notes: "",
  skills: [],
  addedAt,
  updatedAt: addedAt,
  archived: false,
  ...rest,
});

const skillOf = (id: string, rest: Partial<Skill> = {}): Skill => ({ id, name: `Skill ${id}`, description: "", notes: "", addedAt: "2026-10-01T00:00:00.000Z", topic: 0, ...rest });

describe("adding a set by hand", () => {
  const now = new Date("2026-10-22T10:00:00Z");

  test("a new set is to watch, with no notes, no skill and no topic of its own", () => {
    const result = addSet([], { name: "  TDD  ", description: " red, green " , url: " https://example.com/tdd "}, now, "id-1");
    assert.deepEqual(result?.sets, [
      {
        id: "id-1",
        name: "TDD",
        sourceUrl: "https://example.com/tdd",
        description: "red, green",
        ring: "watch",
        notes: "",
        skills: [],
        addedAt: "2026-10-22T10:00:00.000Z",
        updatedAt: "2026-10-22T10:00:00.000Z",
        archived: false,
      },
    ]);
    assert.equal(result?.set, result?.sets[0]);
  });

  test("the template of a new skill is the one of the spec, in English like the Module", () => {
    assert.equal(NOTES_TEMPLATE, "#### What it's for\n\n#### Why\n\n#### How\n\n#### Suggestions for improvement\n");
  });

  test("a blank url is no url, and a missing description is an empty one", () => {
    const result = addSet([], { name: "TDD", url: "   " }, now, "id-1")!;
    assert.equal("sourceUrl" in result.set, false);
    assert.equal(result.set.description, "");
  });

  test("a name and a description longer than the View accepts are clipped, as when a SKILL.md gives them", () => {
    const result = addSet([], { name: "n".repeat(300), description: "d".repeat(2000) }, now, "id-1")!;
    assert.equal(result.set.name, "n".repeat(100));
    assert.equal(result.set.description, "d".repeat(500));
  });

  test("a blank name adds nothing", () => {
    assert.equal(addSet([], { name: "   " }, now, "id-1"), null);
  });

  test("the new set comes first, and the others are untouched", () => {
    const existing = [set("a", "2026-10-01T00:00:00.000Z")];
    const result = addSet(existing, { name: "New" }, now, "b")!;
    assert.deepEqual(result.sets.map((item) => item.id), ["b", "a"]);
    assert.equal(result.sets[1], existing[0]);
  });
});

describe("the list as the View shows it", () => {
  test("the most recently added first, those added together in the order they were", () => {
    const list = [set("a", "2026-10-01T00:00:00.000Z"), set("b", "2026-10-20T00:00:00.000Z"), set("c", "2026-10-01T00:00:00.000Z")];
    assert.deepEqual(newestFirst(list).map((item) => item.id), ["b", "a", "c"]);
  });
});

describe("reading the sets the storage holds", () => {
  test("nothing stored, or something that is not a list, is no set", () => {
    assert.deepEqual(readSets(null), []);
    assert.deepEqual(readSets({ id: "a", name: "A" }), []);
  });

  test("a set is read back as it was written", () => {
    const full = set("a", "2026-10-01T00:00:00.000Z", {
      sourceUrl: "https://example.com",
      description: "d",
      ring: "recommended",
      notes: "n",
      skills: [skillOf("s1", { topic: 3, score: 4, notes: "sn", sourceUrl: "https://example.com/s", description: "sd", goneUpstream: true })],
      updatedAt: "2026-10-02T00:00:00.000Z",
      archived: true,
      moveReason: "proved itself",
    });
    assert.deepEqual(readSets([full]), [full]);
  });

  test("what has no id or name is skipped, and a duplicate id is dropped", () => {
    assert.deepEqual(
      readSets([{ name: "A" }, "junk", { id: "a" }, { id: "", name: "A" }, { id: "a", name: "first" }, { id: "a", name: "second" }]).map((item) => item.name),
      ["first"],
    );
  });

  test("a value out of range or of the wrong kind takes its default", () => {
    const [read] = readSets([{ id: "a", name: "A", ring: "adopt", addedAt: "never", updatedAt: 3, archived: "yes", notes: 1, description: null }]);
    assert.deepEqual(read, set("a", new Date(0).toISOString(), { name: "A" }));
  });
});

describe("the link of a set or a skill", () => {
  const link = (sourceUrl?: string) => linkOf({ sourceUrl });

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
  const names = ["Design & planning", "Code & tests", "Writing & docs", "Tooling & workflow", "Learning & upskilling"];

  const none = { rings: [], topics: [], query: "", archived: false };

  test("what cannot be read takes its default", () => {
    assert.deepEqual(readSettings(null), { topics: names, tab: "library", filters: none });
    assert.deepEqual(readSettings({ topics: "x", tab: "nowhere", filters: [] }), { topics: names, tab: "library", filters: none });
  });

  test("the tab and the filters are kept", () => {
    const filters = { rings: ["try"], topics: [2], query: "tdd", archived: true };
    assert.deepEqual(readSettings({ tab: "radar", filters }), { topics: names, tab: "radar", filters });
  });

  test("a topic is named without the spaces around it; a blank or too long name takes its default", () => {
    const settings = readSettings({ topics: ["  Mine ", "   ", "x".repeat(41), 3] });
    assert.deepEqual(settings.topics, ["Mine", names[1], names[2], names[3], names[4]]);
    assert.equal(readSettings({ topics: ["x".repeat(40)] }).topics[0], "x".repeat(40));
  });

  test("the fifth topic is read with its name", () => {
    assert.equal(readSettings({ topics: ["A", "B", "C", "D", " Fifth "] }).topics[4], "Fifth");
  });

  test("the four quadrants of an older Library keep their index and the fifth topic takes its default", () => {
    const settings = readSettings({ quadrants: ["One", "Two", "Three", "Four"] });
    assert.deepEqual(settings.topics, ["One", "Two", "Three", "Four", names[4]]);
  });

  test("the topics win over the old quadrants when both are stored", () => {
    assert.equal(readSettings({ topics: ["New"], quadrants: ["Old"] }).topics[0], "New");
  });

  test("the old filters on quadrants become filters on the topics at the same index", () => {
    const filters = { rings: [], quadrants: [3, 1], query: "", archived: false };
    assert.deepEqual(readSettings({ filters }).filters.topics, [3, 1]);
    assert.deepEqual(readFilters({ quadrants: [0, 4, 5] }).topics, [0, 4]);
  });
});

describe("editing a set", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const list = [set("a", "2026-10-01T00:00:00.000Z"), set("b", "2026-10-02T00:00:00.000Z")];

  test("a changed value is saved, with the date of the change, and the others are untouched", () => {
    const result = editSet(list, "b", { ring: "try" }, now);
    assert.ok(result && "set" in result);
    assert.equal(result.set.ring, "try");
    assert.equal(result.set.updatedAt, "2026-10-23T09:00:00.000Z");
    assert.equal(result.set.addedAt, "2026-10-02T00:00:00.000Z");
    assert.deepEqual(result.sets.map((item) => item.id), ["a", "b"]);
    assert.equal(result.sets[0], list[0]);
    assert.equal(result.sets[1], result.set);
  });

  test("an unknown id edits nothing", () => {
    assert.equal(editSet(list, "zzz", { ring: "try" }, now), null);
  });

  test("a change to what the set already has changes nothing, not even its date", () => {
    const result = editSet(list, "a", { ring: "watch", name: "Set a", description: "" }, now);
    assert.ok(result && "set" in result);
    assert.equal(result.set, list[0]);
    assert.equal(result.sets, list);
    assert.equal(editSet(list, "a", {}, now) && (editSet(list, "a", {}, now) as { set: SkillSet }).set, list[0]);
  });

  test("a ring that does not exist is ignored", () => {
    const result = editSet(list, "a", { ring: "adopt" as never }, now);
    assert.ok(result && "set" in result);
    assert.equal(result.set, list[0]);
  });

  test("the name, the description and the notes are kept as typed, only clipped", () => {
    const result = editSet(list, "a", { name: " Écrire ", description: "d ".repeat(400), notes: "line \n" }, now) as { set: SkillSet };
    assert.equal(result.set.name, " Écrire ");
    assert.equal(result.set.description, ("d ".repeat(400)).slice(0, 500));
    assert.equal(result.set.notes, "line \n");
    assert.equal((editSet(list, "a", { name: "n".repeat(300) }, now) as { set: SkillSet }).set.name, "n".repeat(100));
  });

  test("a blank name is refused and nothing is saved", () => {
    assert.deepEqual(editSet(list, "a", { name: "   " }, now), { error: "name_required" });
    assert.deepEqual(editSet(list, "a", { name: "", ring: "try" }, now), { error: "name_required" });
  });

  test("notes longer than the View accepts are refused, those of exactly that length are not", () => {
    assert.deepEqual(editSet(list, "a", { notes: "n".repeat(NOTES_MAX + 1) }, now), { error: "notes_too_long" });
    assert.equal(NOTES_MAX, 8000);
    const result = editSet(list, "a", { notes: "n".repeat(NOTES_MAX) }, now) as { set: SkillSet };
    assert.equal(result.set.notes.length, 8000);
  });

  test("a url is saved without the spaces around it, and a blank one removes it", () => {
    const set = editSet(list, "a", { sourceUrl: "  https://example.com/x " }, now) as { set: SkillSet; sets: SkillSet[] };
    assert.equal(set.set.sourceUrl, "https://example.com/x");
    const removed = editSet(set.sets, "a", { sourceUrl: "  " }, now) as { set: SkillSet };
    assert.equal("sourceUrl" in removed.set, false);
    assert.equal(removed.set.updatedAt, "2026-10-23T09:00:00.000Z");
    assert.equal((editSet(list, "a", { sourceUrl: "" }, now) as { set: SkillSet }).set, list[0]);
  });

  test("a set is archived and unarchived, and the date changes only when that does", () => {
    const archived = editSet(list, "a", { archived: true }, now) as { set: SkillSet; sets: SkillSet[] };
    assert.equal(archived.set.archived, true);
    assert.equal(archived.set.updatedAt, "2026-10-23T09:00:00.000Z");
    const again = editSet(archived.sets, "a", { archived: true }, new Date("2026-11-01T00:00:00Z")) as { set: SkillSet };
    assert.equal(again.set, archived.set);
    const back = editSet(archived.sets, "a", { archived: false }, now) as { set: SkillSet };
    assert.equal(back.set.archived, false);
  });

  test("an archived value that is not a boolean is ignored", () => {
    const result = editSet(list, "a", { archived: "yes" as unknown as boolean }, now) as { set: SkillSet };
    assert.equal(result.set, list[0]);
  });
});

describe("reading the filters", () => {
  test("archived sets are shown only when the stored value is exactly true", () => {
    assert.equal(readFilters({ archived: true }).archived, true);
    for (const archived of [false, "true", 1, null, undefined]) assert.equal(readFilters({ archived }).archived, false);
  });

  test("nothing, or something that is not an object, is no filtering", () => {
    for (const stored of [null, undefined, "x", 3, []]) assert.deepEqual(readFilters(stored), { rings: [], topics: [], query: "", archived: false });
  });

  test("an unknown ring, a topic out of range and a duplicate are dropped", () => {
    assert.deepEqual(readFilters({ rings: ["try", "adopt", "try", 3, "watch"], topics: [1, 5, 1, -1, 2.5, "0", 4], query: "tdd" }), {
      rings: ["try", "watch"],
      topics: [1, 4],
      query: "tdd",
      archived: false,
    });
  });

  test("a value of the wrong kind takes its default", () => {
    assert.deepEqual(readFilters({ rings: "try", topics: 1, query: 3 }), { rings: [], topics: [], query: "", archived: false });
  });
});

describe("filtering the library", () => {
  const at = "2026-10-01T00:00:00.000Z";
  const list = [
    set("a", at, { name: "Écrire un ADR", ring: "try", skills: [skillOf("sa", { topic: 2 })] }),
    set("b", at, { name: "tdd-loop", ring: "recommended", skills: [skillOf("sb", { topic: 1 })] }),
    set("c", at, { name: "Plan", ring: "try", skills: [skillOf("sc", { topic: 0 })] }),
    set("d", at, { name: "Old plan", ring: "try", archived: true, skills: [skillOf("sd", { topic: 0 })] }),
  ];
  const by = (filters: Partial<Parameters<typeof filterSets>[1]>) =>
    filterSets(list, { rings: [], topics: [], query: "", archived: false, ...filters }).map((item) => item.id);

  test("no filter keeps every set that is not archived, in its order", () => {
    assert.deepEqual(by({}), ["a", "b", "c"]);
  });

  test("the archived sets are kept too when asked, still subject to the other filters", () => {
    assert.deepEqual(by({ archived: true }), ["a", "b", "c", "d"]);
    assert.deepEqual(by({ archived: true, query: "plan" }), ["c", "d"]);
    assert.deepEqual(by({ archived: false, query: "plan" }), ["c"]);
  });

  test("several rings keep the sets of any of them", () => {
    assert.deepEqual(by({ rings: ["try"] }), ["a", "c"]);
    assert.deepEqual(by({ rings: ["try", "recommended"] }), ["a", "b", "c"]);
    assert.deepEqual(by({ rings: ["deprecated"] }), []);
  });

  test("several topics keep the sets of any of them", () => {
    assert.deepEqual(by({ topics: [0, 2] }), ["a", "c"]);
  });

  test("the fifth topic keeps its sets", () => {
    const fifth = [...list, set("e", at, { name: "Learn", skills: [skillOf("se", { topic: 4 })] })];
    assert.deepEqual(filterSets(fifth, { rings: [], topics: [4], query: "", archived: false }).map((item) => item.id), ["e"]);
  });

  test("a set with skills in several topics is kept by any of them, and one with no skill by none", () => {
    const mixed = [set("m", at, { skills: [skillOf("m1", { topic: 1 }), skillOf("m2", { topic: 3 })] }), set("n", at)];
    const keep = (topics: number[]) => filterSets(mixed, { rings: [], topics, query: "", archived: false }).map((item) => item.id);
    assert.deepEqual(keep([3]), ["m"]);
    assert.deepEqual(keep([1, 4]), ["m"]);
    assert.deepEqual(keep([0, 2, 4]), []);
    assert.deepEqual(keep([]), ["m", "n"]);
  });

  test("the rings and the topics together keep the sets that match both", () => {
    assert.deepEqual(by({ rings: ["try"], topics: [2] }), ["a"]);
  });

  test("the search finds a part of the name, ignoring case and accents", () => {
    assert.deepEqual(by({ query: "ecrire" }), ["a"]);
    assert.deepEqual(by({ query: "ÉCRIRE" }), ["a"]);
    assert.deepEqual(by({ query: "TDD" }), ["b"]);
    assert.deepEqual(by({ query: "  loop " }), ["b"]);
    assert.deepEqual(by({ query: "   " }), ["a", "b", "c"]);
    assert.deepEqual(by({ query: "nothing" }), []);
  });

  test("the search and the filters together keep the sets that match all", () => {
    assert.deepEqual(by({ query: "a", rings: ["recommended"] }), []);
    assert.deepEqual(by({ query: "plan", rings: ["try"] }), ["c"]);
  });
});

describe("deleting a set", () => {
  const at = "2026-10-01T00:00:00.000Z";
  const list = [set("a", at), set("b", at), set("c", at)];
  const editions = [{ entries: [{ id: "b" }] }, { entries: [{ id: "x" }, { id: "y" }] }];

  test("a set that is in no edition can be deleted", () => {
    assert.equal(canDelete("a", editions), true);
    assert.equal(canDelete("a", []), true);
  });

  test("a set that is in an edition cannot", () => {
    assert.equal(canDelete("b", editions), false);
    assert.equal(canDelete("y", editions), false);
  });

  test("deleting gives the list without the set, the others the same objects in the same order", () => {
    const result = deleteSet(list, "b", []);
    assert.equal(result?.length, 2);
    assert.equal(result?.[0], list[0]);
    assert.equal(result?.[1], list[2]);
    assert.equal(list.length, 3);
  });

  test("a set that was published, or that does not exist, is not deleted", () => {
    assert.equal(deleteSet(list, "b", editions), null);
    assert.equal(deleteSet(list, "nope", editions), null);
  });
});

describe("renaming a topic", () => {
  const names: Topics = ["A", "B", "C", "D", "E"];

  test("gives the names with the new one in place, trimmed, and leaves the old ones as they were", () => {
    assert.deepEqual(renameTopic(names, 2, "  Mine "), ["A", "B", "Mine", "D", "E"]);
    assert.deepEqual(names, ["A", "B", "C", "D", "E"]);
    assert.deepEqual(renameTopic(names, 0, "x".repeat(40)), ["x".repeat(40), "B", "C", "D", "E"]);
  });

  test("a blank name, or one longer than 40 characters, is refused", () => {
    assert.equal(renameTopic(names, 1, "   "), null);
    assert.equal(renameTopic(names, 1, "x".repeat(41)), null);
  });

  test("the fifth topic can be renamed", () => {
    assert.deepEqual(renameTopic(names, 4, "Mine"), ["A", "B", "C", "D", "Mine"]);
  });

  test("a topic that does not exist is refused", () => {
    for (const index of [-1, 5, 1.5]) assert.equal(renameTopic(names, index, "Mine"), null);
  });
});

describe("the reason of a move", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const list = [set("a", "2026-10-01T00:00:00.000Z", { ring: "try" }), set("b", "2026-10-02T00:00:00.000Z", { ring: "try", moveReason: "Proven" })];
  const edit = (id: string, change: Parameters<typeof editSet>[2], published?: Parameters<typeof editSet>[4]) =>
    editSet(list, id, change, now, published) as { set: SkillSet };

  test("a reason is kept while the ring differs from the published one", () => {
    const result = edit("a", { moveReason: "Worked well" }, "watch");
    assert.equal(result.set.moveReason, "Worked well");
    assert.equal(result.set.updatedAt, "2026-10-23T09:00:00.000Z");
  });

  test("a reason is dropped when the set is in no edition", () => {
    assert.equal(edit("a", { moveReason: "Worked well" }).set.moveReason, undefined);
  });

  test("returning to the published ring clears the reason", () => {
    const result = edit("b", { ring: "watch" }, "watch");
    assert.equal(result.set.ring, "watch");
    assert.equal("moveReason" in result.set, false);
  });

  test("the reason stays through an edit that leaves the ring moved", () => {
    const result = edit("b", { notes: "n" }, "watch");
    assert.equal(result.set.moveReason, "Proven");
  });

  test("a blank reason removes it", () => {
    assert.equal("moveReason" in edit("b", { moveReason: "   " }, "watch").set, false);
  });

  test("a reason is kept as typed", () => {
    assert.equal(edit("a", { moveReason: " Why " }, "watch").set.moveReason, " Why ");
  });

  test("a reason that is too long is refused and nothing is saved", () => {
    assert.deepEqual(editSet(list, "a", { moveReason: "x".repeat(281) }, now, "watch"), { error: "reason_too_long" });
    assert.equal(edit("a", { moveReason: "x".repeat(280) }, "watch").set.moveReason, "x".repeat(280));
  });

  test("the same reason changes nothing, not even the date", () => {
    const result = editSet(list, "b", { moveReason: "Proven" }, now, "watch") as { set: SkillSet };
    assert.equal(result.set, list[1]);
  });
});

describe("adding a skill to a set", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  const first = skillOf("s1", { sourceUrl: "https://github.com/acme/skills/tree/main/tdd" });
  const target = set("a", "2026-10-01T00:00:00.000Z", { skills: [first] });
  const other = set("b", "2026-10-02T00:00:00.000Z", { skills: [skillOf("s9", { sourceUrl: "https://example.com/x" })] });
  const sets = [target, other];

  test("a new skill goes at the end of the set, not evaluated, with the template as its notes, and the set is dated", () => {
    const result = addSkillToSet(sets, "a", { name: "  ADR ", description: " why ", url: " https://example.com/adr " }, now, "s2");
    assert.ok(result && "skill" in result);
    assert.deepEqual(result.skill, {
      id: "s2",
      name: "ADR",
      sourceUrl: "https://example.com/adr",
      description: "why",
      notes: NOTES_TEMPLATE,
      addedAt: "2026-10-22T10:00:00.000Z",
      topic: 0,
    });
    assert.deepEqual(result.set.skills.map((item) => item.id), ["s1", "s2"]);
    assert.equal(result.set.skills[0], first);
    assert.equal(result.set.updatedAt, "2026-10-22T10:00:00.000Z");
    assert.equal(result.sets[0], result.set);
    assert.equal(result.sets[1], other);
  });

  test("the name and the description are clipped and a blank url is no url", () => {
    const result = addSkillToSet(sets, "a", { name: "n".repeat(300), description: "d".repeat(2000), url: " " }, now, "s2");
    assert.ok(result && "skill" in result);
    assert.equal(result.skill.name, "n".repeat(100));
    assert.equal(result.skill.description, "d".repeat(500));
    assert.equal("sourceUrl" in result.skill, false);
  });

  test("a blank name or an unknown set adds nothing", () => {
    assert.equal(addSkillToSet(sets, "a", { name: "  " }, now, "s2"), null);
    assert.equal(addSkillToSet(sets, "zzz", { name: "ADR" }, now, "s2"), null);
  });

  test("a url that another skill of the set has is refused with that skill", () => {
    assert.deepEqual(addSkillToSet(sets, "a", { name: "Again", url: "github.com/Acme/Skills/blob/main/tdd/SKILL.md" }, now, "s2"), { error: "url_taken", duplicate: first });
  });

  test("a url that a skill of another set has is no conflict", () => {
    const result = addSkillToSet(sets, "a", { name: "Same", url: "https://example.com/x" }, now, "s2");
    assert.ok(result && "skill" in result);
  });
});

describe("editing a skill of a set", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const a = skillOf("s1", { sourceUrl: "https://example.com/a", score: 4 });
  const b = skillOf("s2", { sourceUrl: "https://example.com/b" });
  const target = set("a", "2026-10-01T00:00:00.000Z", { skills: [a, b] });
  const other = set("b", "2026-10-02T00:00:00.000Z");
  const sets = [target, other];
  const edit = (change: Parameters<typeof editSkillInSet>[3], skillId = "s1") => editSkillInSet(sets, "a", skillId, change, now) as { sets: SkillSet[]; set: SkillSet; skill: Skill };

  test("a changed value is saved, the set is dated, and the other skills and sets are untouched", () => {
    const result = edit({ name: " Écrire ", description: "d", notes: "n\n", score: 5 });
    assert.deepEqual(result.skill, { ...a, name: " Écrire ", description: "d", notes: "n\n", score: 5 });
    assert.equal(result.set.updatedAt, "2026-10-23T09:00:00.000Z");
    assert.deepEqual(result.set.skills.map((item) => item.id), ["s1", "s2"]);
    assert.equal(result.set.skills[0], result.skill);
    assert.equal(result.set.skills[1], b);
    assert.equal(result.sets[0], result.set);
    assert.equal(result.sets[1], other);
  });

  test("an unknown set or skill edits nothing", () => {
    assert.equal(editSkillInSet(sets, "zzz", "s1", { notes: "x" }, now), null);
    assert.equal(editSkillInSet(sets, "a", "zzz", { notes: "x" }, now), null);
    assert.equal(editSkillInSet(sets, "b", "s1", { notes: "x" }, now), null);
  });

  test("a change to what the skill already has changes nothing, not even the date", () => {
    const result = edit({ name: "Skill s1", score: 4, sourceUrl: "https://example.com/a", description: "" });
    assert.equal(result.skill, a);
    assert.equal(result.set, target);
    assert.equal(result.sets, sets);
    assert.equal(edit({}).sets, sets);
  });

  test("the name and the description are clipped, a blank name is refused, and notes are limited", () => {
    assert.equal(edit({ name: "n".repeat(300), description: "d".repeat(600) }).skill.name, "n".repeat(100));
    assert.equal(edit({ description: "d".repeat(600) }).skill.description, "d".repeat(500));
    assert.deepEqual(edit({ name: "  " }), { error: "name_required" });
    assert.deepEqual(edit({ notes: "n".repeat(NOTES_MAX + 1) }), { error: "notes_too_long" });
    assert.equal(edit({ notes: "n".repeat(NOTES_MAX) }).skill.notes.length, NOTES_MAX);
  });

  test("a score outside 1 to 5 is ignored and null clears it", () => {
    for (const score of [0, 6, 2.5, Number.NaN]) assert.equal(edit({ score }).skill, a);
    const cleared = edit({ score: null });
    assert.equal("score" in cleared.skill, false);
    assert.equal(cleared.set.updatedAt, "2026-10-23T09:00:00.000Z");
    assert.equal(edit({ score: null }, "s2").skill, b);
    assert.equal(edit({ score: 1 }, "s2").skill.score, 1);
  });

  test("a url is saved without the spaces around it, and a blank one removes it", () => {
    assert.equal(edit({ sourceUrl: "  https://example.com/new " }).skill.sourceUrl, "https://example.com/new");
    const removed = edit({ sourceUrl: "  " });
    assert.equal("sourceUrl" in removed.skill, false);
    assert.equal(removed.set.updatedAt, "2026-10-23T09:00:00.000Z");
  });

  test("a url that another skill of the set has is refused with that skill, but not the url of the skill itself", () => {
    assert.deepEqual(edit({ sourceUrl: "https://example.com/b/", name: "x" }), { error: "url_taken", duplicate: b });
    assert.equal(edit({ sourceUrl: "https://example.com/a/", name: "x" }).skill.name, "x");
  });
});

describe("removing a skill from a set", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const a = skillOf("s1");
  const b = skillOf("s2");
  const target = set("a", "2026-10-01T00:00:00.000Z", { skills: [a, b] });
  const other = set("b", "2026-10-02T00:00:00.000Z");

  test("gives the set without the skill, dated, the others the same objects", () => {
    const result = removeSkillFromSet([target, other], "a", "s1", now)!;
    assert.equal(result.set.skills.length, 1);
    assert.equal(result.set.skills[0], b);
    assert.equal(result.set.updatedAt, "2026-10-23T09:00:00.000Z");
    assert.equal(result.sets[0], result.set);
    assert.equal(result.sets[1], other);
  });

  test("is allowed even when the set was published, and refused for an unknown set or skill", () => {
    assert.ok(removeSkillFromSet([target], "a", "s2", now));
    assert.equal(removeSkillFromSet([target], "zzz", "s1", now), null);
    assert.equal(removeSkillFromSet([target], "a", "zzz", now), null);
  });
});

describe("reading the skills of a set", () => {
  const read = (skills: unknown[]) => readSets([{ id: "a", name: "A", skills }])[0].skills;

  test("a set with no list of skills has none", () => {
    assert.deepEqual(readSets([{ id: "a", name: "A" }])[0].skills, []);
    assert.deepEqual(readSets([{ id: "a", name: "A", skills: "x" }])[0].skills, []);
  });

  test("what has no id or name is skipped, and an id repeated in the Library is dropped, in the same set or another", () => {
    assert.deepEqual(read([{ name: "x" }, "junk", { id: "s" }, { id: "s1", name: "first" }, { id: "s1", name: "second" }]).map((item) => item.name), ["first"]);
    const sets = readSets([
      { id: "a", name: "A", skills: [{ id: "s1", name: "one" }] },
      { id: "b", name: "B", skills: [{ id: "s1", name: "again" }, { id: "s2", name: "two" }] },
    ]);
    assert.deepEqual(sets.map((item) => item.skills.map((skill) => skill.name)), [["one"], ["two"]]);
  });

  test("a score is kept only when it is an integer from 1 to 5", () => {
    for (const score of [0, 6, 2.5, "3", null]) assert.equal("score" in read([{ id: "s", name: "S", score }])[0], false);
    assert.equal(read([{ id: "s", name: "S", score: 5 }])[0].score, 5);
  });

  test("goneUpstream is kept only when it is true", () => {
    assert.equal(read([{ id: "s", name: "S", goneUpstream: true }])[0].goneUpstream, true);
    for (const goneUpstream of [false, "true", 1]) assert.equal("goneUpstream" in read([{ id: "s", name: "S", goneUpstream }])[0], false);
  });

  test("a value of the wrong kind takes its default", () => {
    assert.deepEqual(read([{ id: "s", name: "S", description: null, notes: 1, addedAt: "never", sourceUrl: 3 }]), [skillOf("s", { name: "S", addedAt: new Date(0).toISOString() })]);
  });
});

describe("filtering the library by the skills of its sets", () => {
  const at = "2026-10-01T00:00:00.000Z";
  const list = [set("a", at, { name: "Planning", skills: [skillOf("s1", { name: "Écrire un ADR" })] }), set("b", at, { name: "Tests" })];
  const by = (query: string) => filterSets(list, { rings: [], topics: [], query, archived: false }).map((item) => item.id);

  test("the search finds a set by the name of one of its skills, ignoring case and accents", () => {
    assert.deepEqual(by("ecrire"), ["a"]);
    assert.deepEqual(by("planning"), ["a"]);
    assert.deepEqual(by("tests"), ["b"]);
    assert.deepEqual(by("nothing"), []);
  });
});

const setFrom = (id: string, sourceUrl?: string, rest: Partial<SkillSet> = {}): SkillSet => ({
  id,
  name: `Set ${id}`,
  ...(sourceUrl ? { sourceUrl } : {}),
  description: "",
  ring: "watch",
  notes: "",
  skills: [],
  addedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  archived: false,
  ...rest,
});

describe("telling a set is already in the Library", () => {
  test("the duplicate is the set with the same key, archived or not", () => {
    const archived = setFrom("b", "https://github.com/Acme/Skills/blob/main/tdd/SKILL.md", { archived: true });
    const list = [setFrom("a", "https://example.com"), archived, setFrom("c")];
    assert.equal(findDuplicate(list, "https://raw.githubusercontent.com/acme/skills/main/tdd/SKILL.md"), archived);
    assert.equal(findDuplicate(list, "https://example.com/"), list[0]);
  });

  test("a set added by hand without a url is never a duplicate", () => {
    const list = [setFrom("a"), setFrom("b", "https://example.com")];
    assert.equal(findDuplicate(list, undefined), undefined);
    assert.equal(findDuplicate(list, ""), undefined);
    assert.equal(findDuplicate(list, "https://example.com/other"), undefined);
  });
});

describe("adding a set that may be there already", () => {
  const now = new Date("2026-10-22T10:00:00Z");

  test("a new url is added first", () => {
    const list = [setFrom("a", "https://example.com")];
    const result = addUnlessDuplicate(list, { name: "TDD", url: "https://github.com/acme/skills/tree/main/tdd" }, now, "b");
    assert.ok(result && "set" in result);
    assert.deepEqual(result.sets.map((item) => item.id), ["b", "a"]);
  });

  test("a url that is there already, archived or not, adds nothing and gives the set that has it", () => {
    const archived = setFrom("a", "https://github.com/Acme/Skills/blob/main/tdd/SKILL.md", { archived: true });
    const result = addUnlessDuplicate([archived], { name: "Again", url: "https://github.com/acme/skills/tree/main/tdd" }, now, "b");
    assert.deepEqual(result, { duplicate: archived });
  });

  test("a blank name adds nothing and is no duplicate", () => {
    assert.equal(addUnlessDuplicate([], { name: " " }, now, "b"), null);
  });
});

describe("editing a set that may take the url of another", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const other = setFrom("b", "https://github.com/acme/skills/tree/main/tdd", { archived: true });
  const list = [setFrom("a", "https://example.com"), other, setFrom("c")];

  test("a url that another set has, archived or not, saves nothing and gives that skill", () => {
    assert.deepEqual(editUnlessDuplicate(list, "a", { sourceUrl: "github.com/Acme/Skills/blob/main/tdd/SKILL.md", ring: "try" }, now), { duplicate: other });
  });

  test("a new url is saved", () => {
    const result = editUnlessDuplicate(list, "a", { sourceUrl: "https://example.com/new" }, now);
    assert.ok(result && "set" in result);
    assert.equal(result.set.sourceUrl, "https://example.com/new");
  });

  test("a set is never a duplicate of itself", () => {
    const result = editUnlessDuplicate(list, "b", { sourceUrl: "https://raw.githubusercontent.com/acme/skills/main/tdd/SKILL.md", ring: "try" }, now);
    assert.ok(result && "set" in result);
    assert.equal(result.set.ring, "try");
  });

  test("a blank url has no key, so it is no duplicate of the sets without a url", () => {
    const result = editUnlessDuplicate(list, "a", { sourceUrl: "  " }, now);
    assert.ok(result && "set" in result);
    assert.equal("sourceUrl" in result.set, false);
  });

  test("an edit without a url, an unknown id and the errors of the edit come through as they are", () => {
    assert.equal(editUnlessDuplicate(list, "zzz", { sourceUrl: "https://example.com" }, now), null);
    assert.deepEqual(editUnlessDuplicate(list, "a", { name: " " }, now), { error: "name_required" });
    const result = editUnlessDuplicate(list, "a", { notes: "n" }, now);
    assert.ok(result && "set" in result);
    assert.equal(result.set.notes, "n");
  });
});

describe("importing a set of the skills found", () => {
  const found = [
    { name: "Brainstorming", description: "Think first", sourceUrl: "https://github.com/obra/superpowers/tree/main/skills/brainstorming" },
    { name: "TDD", description: "Red, green", sourceUrl: "https://github.com/obra/superpowers/tree/main/skills/tdd" },
  ];
  const draft = { name: "Superpowers", url: "https://github.com/obra/superpowers/tree/main/skills" };
  const now = new Date("2026-05-01T10:00:00Z");
  const ids = () => {
    let next = 0;
    return () => `id-${++next}`;
  };

  test("adds a set to watch, with the skills in their order, not evaluated, with the template as notes", () => {
    const result = importSet([], draft, found, now, ids());
    assert.ok(result && "set" in result);
    const { set, sets } = result;
    assert.deepEqual(sets, [set]);
    assert.equal(set.id, "id-1");
    assert.equal(set.name, "Superpowers");
    assert.equal(set.sourceUrl, draft.url);
    assert.deepEqual([set.ring, set.notes, set.description, set.archived], ["watch", "", "", false]);
    assert.deepEqual(
      set.skills.map(({ id, name, description, sourceUrl, notes, addedAt, score }) => ({ id, name, description, sourceUrl, notes, addedAt, score })),
      found.map((skill, index) => ({ id: `id-${index + 2}`, ...skill, notes: NOTES_TEMPLATE, addedAt: now.toISOString(), score: undefined })),
    );
  });

  test("goes first in the list of sets", () => {
    const existing = importSet([], { name: "Old", url: "https://example.com/old" }, found, now, ids())!;
    assert.ok("set" in existing);
    const result = importSet(existing.sets, draft, found, now, () => crypto.randomUUID());
    assert.ok(result && "set" in result);
    assert.deepEqual(result.sets.map((set) => set.name), ["Superpowers", "Old"]);
  });

  test("a blank name or no skill imports nothing", () => {
    assert.equal(importSet([], { ...draft, name: "  " }, found, now, ids()), null);
    assert.equal(importSet([], draft, [], now, ids()), null);
  });

  test("a set, archived or not, from the same url is the duplicate and nothing is added", () => {
    const first = importSet([], draft, found, now, ids())!;
    assert.ok("set" in first);
    const archived = first.sets.map((set) => ({ ...set, archived: true }));
    const result = importSet(archived, { ...draft, url: "https://github.com/OBRA/superpowers/tree/main/skills/" }, found, now, ids());
    assert.deepEqual(result, { duplicate: archived[0] });
  });

  test("two skills with the same url keep the first", () => {
    const result = importSet([], draft, [found[0], { ...found[1], sourceUrl: found[0].sourceUrl }, found[1]], now, ids());
    assert.ok(result && "set" in result);
    assert.deepEqual(result.set.skills.map((skill) => skill.name), ["Brainstorming", "TDD"]);
  });
});

describe("refreshing a set with the skills found again", () => {
  const base = "https://github.com/obra/superpowers/tree/main/skills";
  const found = (...names: string[]) => names.map((name) => ({ name, description: `About ${name}`, sourceUrl: `${base}/${name}` }));
  const imported = new Date("2026-05-01T10:00:00Z");
  const now = new Date("2026-06-01T10:00:00Z");
  const ids = () => {
    let next = 100;
    return () => `new-${++next}`;
  };
  const start = (names: string[]) => {
    const result = importSet([], { name: "Superpowers", url: base }, found(...names), imported, ids());
    assert.ok(result && "set" in result);
    return result;
  };
  const gone = (set: SkillSet) => set.skills.filter((skill) => skill.goneUpstream).map((skill) => skill.name);

  test("a skill found that no skill of the set has is added at the end, not evaluated, with the template as notes", () => {
    const { sets, set } = start(["tdd"]);
    const result = refreshSet(sets, set.id, found("tdd", "debugging"), now, ids());
    assert.ok(result);
    assert.deepEqual([result.added, result.gone], [1, 0]);
    assert.deepEqual(result.set.skills.map((skill) => skill.name), ["tdd", "debugging"]);
    const added = result.set.skills[1];
    assert.deepEqual([added.id, added.score, added.notes, added.sourceUrl, added.description, added.addedAt], ["new-101", undefined, NOTES_TEMPLATE, `${base}/debugging`, "About debugging", now.toISOString()]);
    assert.equal(result.set.updatedAt, now.toISOString());
    assert.deepEqual(result.sets, [result.set]);
  });

  test("a url spelled another way is the same skill", () => {
    const { sets, set } = start(["tdd"]);
    const result = refreshSet(sets, set.id, [{ name: "TDD", description: "", sourceUrl: "https://github.com/OBRA/Superpowers/tree/main/skills/tdd/" }], now, ids());
    assert.ok(result);
    assert.deepEqual([result.added, result.gone, result.set.skills.length], [0, 0, 1]);
  });

  test("a skill no longer found is kept, marked gone, with its name, score and notes", () => {
    const { sets, set } = start(["tdd", "debugging"]);
    const rated = { ...set, skills: set.skills.map((skill) => (skill.name === "tdd" ? { ...skill, score: 4, notes: "mine" } : skill)) };
    const result = refreshSet([rated], set.id, found("debugging"), now, ids());
    assert.ok(result);
    assert.deepEqual([result.added, result.gone], [0, 1]);
    assert.deepEqual(gone(result.set), ["tdd"]);
    assert.deepEqual([result.set.skills[0].score, result.set.skills[0].notes, result.set.skills[0].name], [4, "mine", "tdd"]);
  });

  test("a skill found again loses the mark and is not counted", () => {
    const { sets, set } = start(["tdd", "debugging"]);
    const first = refreshSet(sets, set.id, found("debugging"), now, ids())!;
    const again = refreshSet(first.sets, set.id, found("tdd", "debugging"), now, ids())!;
    assert.deepEqual([again.added, again.gone, gone(again.set)], [0, 0, []]);
    assert.ok(!again.set.skills.some((skill) => "goneUpstream" in skill));
  });

  test("a skill already gone and still gone is not counted again", () => {
    const { sets, set } = start(["tdd", "debugging"]);
    const first = refreshSet(sets, set.id, found("debugging"), now, ids())!;
    const again = refreshSet(first.sets, set.id, found("debugging"), now, ids())!;
    assert.deepEqual([again.added, again.gone, gone(again.set)], [0, 0, ["tdd"]]);
  });

  test("a skill without url, or with a url outside the folder of the set, is never marked", () => {
    const { sets, set } = start(["tdd"]);
    const withHand = {
      ...set,
      skills: [
        ...set.skills,
        { id: "hand", name: "By hand", description: "", notes: "", addedAt: imported.toISOString(), topic: 0 },
        { id: "far", name: "Elsewhere", sourceUrl: "https://github.com/other/repo/tree/main/x", description: "", notes: "", addedAt: imported.toISOString(), topic: 0 },
      ],
    };
    const result = refreshSet([withHand], set.id, found("tdd"), now, ids())!;
    assert.deepEqual([result.added, result.gone, gone(result.set)], [0, 0, []]);
  });

  test("nothing new gives the same objects back and the same date", () => {
    const { sets, set } = start(["tdd", "debugging"]);
    const result = refreshSet(sets, set.id, found("debugging", "tdd"), now, ids())!;
    assert.deepEqual([result.added, result.gone], [0, 0]);
    assert.equal(result.sets, sets);
    assert.equal(result.set, set);
    assert.equal(result.set.updatedAt, imported.toISOString());
  });

  test("a mix of added, gone and unchanged skills; the other sets are untouched", () => {
    const { sets, set } = start(["a", "b", "c"]);
    const other = start(["z"]).set;
    const result = refreshSet([...sets, other], set.id, found("b", "d", "e"), now, ids())!;
    assert.deepEqual([result.added, result.gone], [2, 2]);
    assert.deepEqual(result.set.skills.map((skill) => skill.name), ["a", "b", "c", "d", "e"]);
    assert.deepEqual(gone(result.set), ["a", "c"]);
    assert.equal(result.sets[1], other);
  });

  test("nothing found marks every skill that has a url", () => {
    const { sets, set } = start(["a", "b"]);
    const result = refreshSet(sets, set.id, [], now, ids())!;
    assert.deepEqual([result.added, result.gone, gone(result.set)], [0, 2, ["a", "b"]]);
  });

  test("no such set is null", () => {
    assert.equal(refreshSet([], "nope", [], now, ids()), null);
  });
});

describe("the topics of a set", () => {
  const withTopics = (...topics: number[]) => ({ skills: topics.map((topic) => ({ topic })) });

  test("a set covers the topics of its skills, once each, in increasing order", () => {
    assert.deepEqual(setTopics(withTopics(3, 1, 3, 0)), [0, 1, 3]);
    assert.deepEqual(setTopics(withTopics()), []);
  });

  test("the default topic is the most frequent one", () => {
    assert.equal(defaultTopic(withTopics(2, 1, 2, 4)), 2);
  });

  test("on a tie the default topic is the smallest index", () => {
    assert.equal(defaultTopic(withTopics(3, 1, 3, 1, 4)), 1);
  });

  test("a set with no skill has 0 as default topic", () => {
    assert.equal(defaultTopic(withTopics()), 0);
  });
});

describe("the topic of a skill read from the storage", () => {
  const readSkills = (value: unknown) => readSets([value])[0].skills;
  const stored = (extra: object, skills: object[]) => ({ id: "a", name: "A", ...extra, skills });

  test("a skill keeps its topic when it is an integer from 0 to 4, and else takes 0", () => {
    const skills = readSkills(stored({}, [{ id: "s1", name: "S1", topic: 4 }, { id: "s2", name: "S2", topic: 5 }, { id: "s3", name: "S3", topic: "1" }, { id: "s4", name: "S4" }]));
    assert.deepEqual(skills.map((skill) => skill.topic), [4, 0, 0, 0]);
  });

  test("a set that still has a quadrant gives it as topic to each skill that has none, and loses it", () => {
    const [read] = readSets([stored({ quadrant: 3 }, [{ id: "s1", name: "S1" }, { id: "s2", name: "S2" }])]);
    assert.deepEqual(read.skills.map((skill) => skill.topic), [3, 3]);
    assert.equal("quadrant" in read, false);
  });

  test("a skill that already has a topic is not touched by the quadrant of its set", () => {
    const skills = readSkills(stored({ quadrant: 3 }, [{ id: "s1", name: "S1", topic: 1 }, { id: "s2", name: "S2" }]));
    assert.deepEqual(skills.map((skill) => skill.topic), [1, 3]);
  });

  test("a quadrant out of range gives nothing", () => {
    assert.equal(readSkills(stored({ quadrant: 9 }, [{ id: "s1", name: "S1" }]))[0].topic, 0);
  });
});

describe("the topic of the skills added to a set", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  const target = set("a", "2026-10-01T00:00:00.000Z", { skills: [skillOf("s1", { topic: 2 }), skillOf("s2", { topic: 2 }), skillOf("s3", { topic: 1 })] });

  test("a skill added by hand takes the topic of the draft when it is valid", () => {
    const result = addSkillToSet([target], "a", { name: "X", topic: 4 }, now, "s4");
    assert.ok(result && "skill" in result);
    assert.equal(result.skill.topic, 4);
    const first = addSkillToSet([target], "a", { name: "X", topic: 0 }, now, "s4");
    assert.ok(first && "skill" in first);
    assert.equal(first.skill.topic, 0);
  });

  test("without a valid topic in the draft it takes the default topic of the set", () => {
    for (const topic of [undefined, 5, -1, 1.5]) {
      const result = addSkillToSet([target], "a", { name: "X", ...(topic === undefined ? {} : { topic }) }, now, "s4");
      assert.ok(result && "skill" in result);
      assert.equal(result.skill.topic, 2);
    }
  });

  test("the first skill of an empty set takes topic 0", () => {
    const result = addSkillToSet([set("e", "2026-10-01T00:00:00.000Z")], "e", { name: "X" }, now, "s1");
    assert.ok(result && "skill" in result);
    assert.equal(result.skill.topic, 0);
  });

  test("an imported set gives its topic to every skill", () => {
    const found = [
      { name: "a", description: "", sourceUrl: "https://github.com/o/r/tree/main/a" },
      { name: "b", description: "", sourceUrl: "https://github.com/o/r/tree/main/b" },
    ];
    let next = 0;
    const result = importSet([], { name: "Set", url: "https://github.com/o/r/tree/main", topic: 3 }, found, now, () => `i${++next}`);
    assert.ok(result && "set" in result);
    assert.deepEqual(result.set.skills.map((skill) => skill.topic), [3, 3]);
    next = 0;
    const invalid = importSet([], { name: "Set", url: "https://github.com/o/r/tree/main", topic: 7 }, found, now, () => `i${++next}`);
    assert.ok(invalid && "set" in invalid);
    assert.deepEqual(invalid.set.skills.map((skill) => skill.topic), [0, 0]);
  });

  test("a refresh gives the skills it adds the default topic of the set, computed before the additions", () => {
    const base = "https://github.com/o/r/tree/main/s";
    const kept = set("r", "2026-10-01T00:00:00.000Z", { sourceUrl: base, skills: [skillOf("k1", { topic: 3, sourceUrl: `${base}/k1` }), skillOf("k2", { topic: 3, sourceUrl: `${base}/k2` }), skillOf("k3", { topic: 1, sourceUrl: `${base}/k3` })] });
    let next = 0;
    const found = ["k1", "k2", "k3", "n1", "n2", "n3"].map((name) => ({ name, description: "", sourceUrl: `${base}/${name}` }));
    const result = refreshSet([kept], "r", found, now, () => `n${++next}`);
    assert.ok(result);
    assert.deepEqual(result.set.skills.slice(3).map((skill) => skill.topic), [3, 3, 3]);
  });
});

describe("changing the topic of a skill", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const target = set("a", "2026-10-01T00:00:00.000Z", { skills: [skillOf("s1", { topic: 1 })] });
  const edit = (topic: number) => editSkillInSet([target], "a", "s1", { topic }, now) as { sets: SkillSet[]; set: SkillSet; skill: Skill };

  test("a topic from 0 to 4 is saved, and it dates the set", () => {
    const result = edit(4);
    assert.equal(result.skill.topic, 4);
    assert.equal(result.set.updatedAt, now.toISOString());
    assert.equal(edit(0).skill.topic, 0);
  });

  test("a topic outside 0 to 4, or the same one, changes nothing", () => {
    for (const topic of [5, -1, 1.5, 1]) {
      const result = edit(topic);
      assert.equal(result.set, target);
      assert.equal(result.skill, target.skills[0]);
    }
  });
});
