import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { missingReasons, publishedRing, publishEdition, readEdition, readEditionIndex, summaryOf, type Edition } from "../src/lib/editions.ts";
import { DEFAULT_QUADRANTS, type Skill } from "../src/lib/skills.ts";

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

const edition = (number: number, ...entries: Partial<Edition["entries"][number]>[]): Edition => ({
  number,
  publishedAt: "2026-10-10T00:00:00.000Z",
  intro: "Hello",
  quadrants: ["A", "B", "C", "D"],
  entries: entries.map((entry) => ({ id: "a", name: "Skill a", quadrant: 0, ring: "watch", change: "new", description: "", score: 3, notes: "", ...entry })),
  retired: [],
});

const now = new Date("2026-10-25T08:00:00Z");
const quadrants: Edition["quadrants"] = ["Q1", "Q2", "Q3", "Q4"];

describe("the published ring", () => {
  test("is the ring in the edition with the highest number, whatever the order", () => {
    const editions = [edition(2, { id: "a", ring: "try" }), edition(1, { id: "a", ring: "watch" })];
    assert.equal(publishedRing("a", editions), "try");
  });

  test("is undefined when the skill is not in the last edition or there is none", () => {
    assert.equal(publishedRing("a", []), undefined);
    assert.equal(publishedRing("a", [edition(1, { id: "a" }), edition(2, { id: "b" })]), undefined);
  });
});

describe("the moves that miss an explanation", () => {
  const editions = [edition(1, { id: "a" }, { id: "b" }, { id: "c" }, { id: "d" })];

  test("lists the moved skills with no reason, in list order, not the archived ones", () => {
    const skills = [
      skill("d", { ring: "try" }),
      skill("b", { ring: "try", moveReason: "Proven" }),
      skill("a", { ring: "recommended" }),
      skill("c", { ring: "try", archived: true }),
    ];
    assert.deepEqual(missingReasons(skills, editions).map((item) => item.id), ["d", "a"]);
  });

  test("lists nothing when no skill moved", () => {
    assert.deepEqual(missingReasons([skill("a"), skill("z")], editions), []);
  });
});

describe("publishing an edition", () => {
  test("the first edition is number 1, dated, with the trimmed intro and the quadrants of the moment", () => {
    const result = publishEdition([skill("a")], quadrants, [], "  Hello **world**\n", now);
    assert.ok("edition" in result);
    assert.equal(result.edition.number, 1);
    assert.equal(result.edition.publishedAt, "2026-10-25T08:00:00.000Z");
    assert.equal(result.edition.intro, "Hello **world**");
    assert.deepEqual(result.edition.quadrants, quadrants);
  });

  test("a blank intro is refused", () => {
    assert.deepEqual(publishEdition([skill("a")], quadrants, [], "  \n", now), { error: "intro_required" });
  });

  test("an entry freezes a skill that is not archived, with its change", () => {
    const result = publishEdition(
      [skill("a", { name: "TDD", sourceUrl: "https://x.test/a", description: "d", quadrant: 2, ring: "try", score: 4, notes: "n" })],
      quadrants,
      [],
      "Intro",
      now,
    );
    assert.ok("edition" in result);
    assert.deepEqual(result.edition.entries, [
      { id: "a", name: "TDD", sourceUrl: "https://x.test/a", description: "d", quadrant: 2, ring: "try", score: 4, notes: "n", change: "new" },
    ]);
  });

  test("the number follows the highest one", () => {
    const result = publishEdition([skill("a")], quadrants, [edition(3, { id: "a" }), edition(2, { id: "a" })], "Intro", now);
    assert.ok("edition" in result);
    assert.equal(result.edition.number, 4);
    assert.equal(result.edition.entries[0].change, "unchanged");
  });

  test("a moved skill keeps its previous ring and its trimmed reason", () => {
    const result = publishEdition([skill("a", { ring: "recommended", moveReason: " Proven " })], quadrants, [edition(1, { id: "a" })], "Intro", now);
    assert.ok("edition" in result);
    assert.deepEqual(result.edition.entries[0], {
      id: "a", name: "Skill a", description: "", quadrant: 0, ring: "recommended", score: 3, notes: "", change: "moved", previousRing: "watch", moveReason: "Proven",
    });
  });

  test("a moved skill with no reason stops the publication, naming the skills", () => {
    const skills = [skill("a", { ring: "try" }), skill("b")];
    const result = publishEdition(skills, quadrants, [edition(1, { id: "a" }, { id: "b" })], "Intro", now);
    assert.ok("error" in result && result.error === "reasons_missing");
    assert.deepEqual(result.missing, [skills[0]]);
  });

  test("a skill archived since the last edition is retired, and one archived before is in neither list", () => {
    const skills = [skill("a", { archived: true, ring: "try" }), skill("b", { archived: true }), skill("c")];
    const result = publishEdition(skills, quadrants, [edition(1, { id: "a", ring: "recommended" })], "Intro", now);
    assert.ok("edition" in result);
    assert.deepEqual(result.edition.retired, [{ id: "a", name: "Skill a", previousRing: "recommended" }]);
    assert.deepEqual(result.edition.entries.map((entry) => entry.id), ["c"]);
  });

  test("the reasons are cleared from all the skills, the others being the same objects, and the summary counts the rings", () => {
    const skills = [skill("a", { ring: "try", moveReason: "Why" }), skill("b"), skill("c", { ring: "try" })];
    const result = publishEdition(skills, quadrants, [edition(1, { id: "a" }, { id: "b" }, { id: "c", ring: "try" })], "Intro", now);
    assert.ok("edition" in result);
    assert.equal("moveReason" in result.skills[0], false);
    assert.equal(result.skills[0].ring, "try");
    assert.equal(result.skills[1], skills[1]);
    assert.equal(result.skills[2], skills[2]);
    assert.deepEqual(result.summary, { number: 2, publishedAt: "2026-10-25T08:00:00.000Z", counts: { recommended: 0, try: 2, watch: 1, deprecated: 0 } });
  });
});

describe("summing up an edition", () => {
  test("counts the entries per ring, every ring present", () => {
    const summary = summaryOf(edition(5, { id: "a", ring: "try" }, { id: "b", ring: "try" }, { id: "c", ring: "deprecated" }));
    assert.deepEqual(summary, { number: 5, publishedAt: "2026-10-10T00:00:00.000Z", counts: { recommended: 0, try: 2, watch: 0, deprecated: 1 } });
  });
});

describe("reading a stored edition", () => {
  test("what is not an edition is null", () => {
    for (const stored of [null, "x", 3, {}, { number: 1 }, { publishedAt: "2026-10-10T00:00:00Z" }, { number: 0, publishedAt: "2026-10-10" }]) {
      assert.equal(readEdition(stored), null);
    }
  });

  test("a well formed edition is read as it is", () => {
    const stored = edition(2, { id: "a", ring: "try", change: "moved", previousRing: "watch", moveReason: "Why", sourceUrl: "https://x.test" });
    stored.retired = [{ id: "z", name: "Old", previousRing: "watch" }];
    assert.deepEqual(readEdition(JSON.parse(JSON.stringify(stored))), stored);
  });

  test("unreadable entries are skipped and the others take their fallbacks", () => {
    const read = readEdition({
      number: 1,
      publishedAt: "2026-10-10T00:00:00Z",
      entries: [null, { id: "a" }, { id: "b", name: "B", ring: "adopt", score: 9, quadrant: 7, change: "weird", previousRing: "nope" }, { id: "b", name: "Dup" }],
      retired: [{ id: "r" }, { id: "r", name: "R", previousRing: "try" }, { id: "s", name: "S", previousRing: "nope" }],
    });
    assert.ok(read);
    assert.equal(read.intro, "");
    assert.deepEqual(read.quadrants, DEFAULT_QUADRANTS);
    assert.deepEqual(read.entries, [{ id: "b", name: "B", description: "", quadrant: 0, ring: "watch", score: 3, notes: "", change: "unchanged" }]);
    assert.deepEqual(read.retired, [{ id: "r", name: "R", previousRing: "try" }]);
  });

  test("the names of the quadrants are read, each falling back to its default", () => {
    const read = readEdition({ number: 1, publishedAt: "2026-10-10T00:00:00Z", quadrants: ["One", 2, "  ", "Four"] });
    assert.deepEqual(read?.quadrants, ["One", DEFAULT_QUADRANTS[1], DEFAULT_QUADRANTS[2], "Four"]);
  });
});

describe("reading the index of the editions", () => {
  const counts = { recommended: 1, try: 2, watch: 3, deprecated: 4 };

  test("anything but a list is none", () => {
    for (const stored of [null, {}, "x"]) assert.deepEqual(readEditionIndex(stored), []);
  });

  test("lists the most recent first, drops the unreadable and the duplicates, and completes the counts", () => {
    const read = readEditionIndex([
      { number: 1, publishedAt: "2026-10-01T00:00:00Z", counts },
      { number: 2, publishedAt: "2026-10-02T00:00:00Z", counts: { try: 5, watch: "x" } },
      { number: 1, publishedAt: "2026-10-09T00:00:00Z", counts: {} },
      { number: 3 },
      null,
    ]);
    assert.deepEqual(read, [
      { number: 2, publishedAt: "2026-10-02T00:00:00Z", counts: { recommended: 0, try: 5, watch: 0, deprecated: 0 } },
      { number: 1, publishedAt: "2026-10-01T00:00:00Z", counts },
    ]);
  });
});
