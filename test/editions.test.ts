import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { changesSince } from "../src/lib/changes.ts";
import { missingReasons, publishedRing, publishEdition, readEdition, readEditionIndex, summaryOf, type Edition } from "../src/lib/editions.ts";
import { legacySkillId, migrateLegacySkills } from "../src/lib/migration.ts";
import { DEFAULT_TOPICS, type Skill, type Topics, type SkillSet } from "../src/lib/skills.ts";

const member = (id: string, rest: Partial<Skill> = {}): Skill => ({
  id,
  name: `Skill ${id}`,
  description: "",
  notes: "",
  addedAt: "2026-10-01T00:00:00.000Z",
  topic: 0,
  ...rest,
});

const skill = (id: string, rest: Partial<SkillSet> = {}): SkillSet => ({
  id,
  name: `Set ${id}`,
  description: "",
  ring: "watch",
  notes: "",
  skills: [member("m")],
  addedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  archived: false,
  ...rest,
});

const edition = (number: number, ...entries: Partial<Edition["entries"][number]>[]): Edition => ({
  number,
  publishedAt: "2026-10-10T00:00:00.000Z",
  intro: "Hello",
  topics: ["A", "B", "C", "D", "E"],
  entries: entries.map((entry) => ({ id: "a", name: "Set a", ring: "watch", change: "new", description: "", notes: "", skills: [{ id: "m", name: "Skill m", description: "", notes: "", topic: 0 }], ...entry })),
  retired: [],
});

const now = new Date("2026-10-25T08:00:00Z");
const topics: Topics = ["Q1", "Q2", "Q3", "Q4", "Q5"];

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

  test("leaves out a set with no skill, which is not on the radar", () => {
    assert.deepEqual(missingReasons([skill("a", { ring: "try", skills: [] })], editions), []);
  });

  test("lists nothing when no skill moved", () => {
    assert.deepEqual(missingReasons([skill("a"), skill("z")], editions), []);
  });
});

describe("publishing an edition", () => {
  test("the first edition is number 1, dated, with the trimmed intro and the topics of the moment", () => {
    const result = publishEdition([skill("a")], topics, [], "  Hello **world**\n", now);
    assert.ok("edition" in result);
    assert.equal(result.edition.number, 1);
    assert.equal(result.edition.publishedAt, "2026-10-25T08:00:00.000Z");
    assert.equal(result.edition.intro, "Hello **world**");
    assert.deepEqual(result.edition.topics, topics);
  });

  test("a new edition freezes five topics, a copy of the ones given", () => {
    const given: Topics = [...topics];
    const result = publishEdition([skill("a")], given, [], "Intro", now);
    given[0] = "Renamed later";
    assert.ok("edition" in result);
    assert.deepEqual(result.edition.topics, topics);
    assert.equal(result.edition.topics.length, 5);
  });

  test("a blank intro is refused", () => {
    assert.deepEqual(publishEdition([skill("a")], topics, [], "  \n", now), { error: "intro_required" });
  });

  test("an entry freezes a set that is not archived with its skills, and its change", () => {
    const result = publishEdition(
      [
        skill("a", {
          name: "TDD",
          sourceUrl: "https://x.test/a",
          description: "d",
          ring: "try",
          notes: "n",
          skills: [member("s1", { name: "Red", sourceUrl: "https://x.test/s1", description: "sd", score: 4, notes: "sn", topic: 2 }), member("s2", { topic: 4 })],
        }),
      ],
      topics,
      [],
      "Intro",
      now,
    );
    assert.ok("edition" in result);
    assert.deepEqual(result.edition.entries, [
      {
        id: "a",
        name: "TDD",
        sourceUrl: "https://x.test/a",
        description: "d",
        ring: "try",
        notes: "n",
        change: "new",
        skills: [
          { id: "s1", name: "Red", sourceUrl: "https://x.test/s1", description: "sd", score: 4, notes: "sn", topic: 2 },
          { id: "s2", name: "Skill s2", description: "", notes: "", topic: 4 },
        ],
      },
    ]);
  });

  test("the entry has no topic of its own, since the topics are the ones of its skills", () => {
    const result = publishEdition([skill("a", { skills: [member("s1", { topic: 1 })] })], topics, [], "Intro", now);
    assert.ok("edition" in result);
    assert.equal("quadrant" in result.edition.entries[0], false);
    assert.equal("topic" in result.edition.entries[0], false);
  });

  test("a set with no skill is not frozen, and is retired when the last edition had it", () => {
    const sets = [skill("a", { skills: [] }), skill("b", { skills: [] }), skill("c")];
    const result = publishEdition(sets, topics, [edition(1, { id: "a", ring: "try" })], "Intro", now);
    assert.ok("edition" in result);
    assert.deepEqual(result.edition.entries.map((entry) => entry.id), ["c"]);
    assert.deepEqual(result.edition.retired, [{ id: "a", name: "Set a", previousRing: "try" }]);
    assert.deepEqual(result.summary.counts, { recommended: 0, try: 0, watch: 1, deprecated: 0 });
  });

  test("the number follows the highest one", () => {
    const result = publishEdition([skill("a")], topics, [edition(3, { id: "a" }), edition(2, { id: "a" })], "Intro", now);
    assert.ok("edition" in result);
    assert.equal(result.edition.number, 4);
    assert.equal(result.edition.entries[0].change, "unchanged");
    assert.equal("skillChanges" in result.edition.entries[0], false);
  });

  test("a moved skill keeps its previous ring and its trimmed reason", () => {
    const result = publishEdition([skill("a", { ring: "recommended", moveReason: " Proven " })], topics, [edition(1, { id: "a" })], "Intro", now);
    assert.ok("edition" in result);
    assert.deepEqual(result.edition.entries[0], {
      id: "a", name: "Set a", description: "", ring: "recommended", notes: "", skills: [{ id: "m", name: "Skill m", description: "", notes: "", topic: 0 }], change: "moved", previousRing: "watch", moveReason: "Proven",
    });
  });

  test("a moved set carries what changed among its skills, and an updated one too, but not an unchanged one", () => {
    const sets = [
      skill("m", { ring: "try", moveReason: "Why", skills: [member("s1", { score: 5 })] }),
      skill("u", { skills: [member("m"), member("s2")] }),
      skill("n", { notes: "same" }),
    ];
    const published = edition(1, { id: "m", skills: [{ id: "s1", name: "Skill s1", description: "", notes: "", topic: 0 }] }, { id: "u" }, { id: "n", notes: "same" });
    const result = publishEdition(sets, topics, [published], "Intro", now);
    assert.ok("edition" in result);
    const [moved, updated, unchanged] = result.edition.entries;
    assert.deepEqual(moved.skillChanges, { added: [], removed: [], scores: [{ id: "s1", name: "Skill s1", after: 5 }] });
    assert.equal(updated.change, "updated");
    assert.deepEqual(updated.skillChanges, { added: [{ id: "s2", name: "Skill s2" }], removed: [], scores: [] });
    assert.equal("skillChanges" in unchanged, false);
  });

  test("a moved set whose skills did not change has no skill changes", () => {
    const result = publishEdition([skill("a", { ring: "try", moveReason: "Why" })], topics, [edition(1, { id: "a" })], "Intro", now);
    assert.ok("edition" in result);
    assert.equal("skillChanges" in result.edition.entries[0], false);
  });

  test("a moved skill with no reason stops the publication, naming the skills", () => {
    const skills = [skill("a", { ring: "try" }), skill("b")];
    const result = publishEdition(skills, topics, [edition(1, { id: "a" }, { id: "b" })], "Intro", now);
    assert.ok("error" in result && result.error === "reasons_missing");
    assert.deepEqual(result.missing, [skills[0]]);
  });

  test("a skill archived since the last edition is retired, and one archived before is in neither list", () => {
    const skills = [skill("a", { archived: true, ring: "try" }), skill("b", { archived: true }), skill("c")];
    const result = publishEdition(skills, topics, [edition(1, { id: "a", ring: "recommended" })], "Intro", now);
    assert.ok("edition" in result);
    assert.deepEqual(result.edition.retired, [{ id: "a", name: "Set a", previousRing: "recommended" }]);
    assert.deepEqual(result.edition.entries.map((entry) => entry.id), ["c"]);
  });

  test("the reasons are cleared from all the skills, the others being the same objects, and the summary counts the sets per ring", () => {
    const skills = [skill("a", { ring: "try", moveReason: "Why" }), skill("b"), skill("c", { ring: "try" })];
    const result = publishEdition(skills, topics, [edition(1, { id: "a" }, { id: "b" }, { id: "c", ring: "try" })], "Intro", now);
    assert.ok("edition" in result);
    assert.equal("moveReason" in result.sets[0], false);
    assert.equal(result.sets[0].ring, "try");
    assert.equal(result.sets[1], skills[1]);
    assert.equal(result.sets[2], skills[2]);
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
      entries: [null, { id: "a" }, { id: "b", name: "B", ring: "adopt", skills: [null], quadrant: 7, change: "weird", previousRing: "nope" }, { id: "b", name: "Dup" }],
      retired: [{ id: "r" }, { id: "r", name: "R", previousRing: "try" }, { id: "s", name: "S", previousRing: "nope" }],
    });
    assert.ok(read);
    assert.equal(read.intro, "");
    assert.deepEqual(read.topics, DEFAULT_TOPICS.slice(0, 4));
    assert.deepEqual(read.entries, [{ id: "b", name: "B", description: "", ring: "watch", notes: "", change: "unchanged", skills: [] }]);
    assert.deepEqual(read.retired, [{ id: "r", name: "R", previousRing: "try" }]);
  });

  test("the skills of an entry are read, the unreadable ones and the repeated ids skipped, the score kept only from 1 to 5", () => {
    const read = readEdition({
      number: 1,
      publishedAt: "2026-10-10T00:00:00Z",
      entries: [
        {
          id: "a",
          name: "A",
          skills: [null, { id: "s" }, { id: "s1", name: "S1", score: 9, notes: "n" }, { id: "s2", name: "S2", score: 2, sourceUrl: "https://x.test", description: "d" }, { id: "s2", name: "Dup" }],
          skillChanges: { added: [{ id: "s2", name: "S2" }, { id: "x" }], removed: "no", scores: [{ id: "s1", name: "S1", before: 2, after: 9 }, { id: "s2", name: "S2", after: 4 }] },
        },
      ],
    });
    assert.deepEqual(read?.entries[0].skills, [
      { id: "s1", name: "S1", description: "", notes: "n", topic: 0 },
      { id: "s2", name: "S2", sourceUrl: "https://x.test", description: "d", score: 2, notes: "", topic: 0 },
    ]);
    assert.deepEqual(read?.entries[0].skillChanges, { added: [{ id: "s2", name: "S2" }], removed: [], scores: [{ id: "s1", name: "S1", before: 2 }, { id: "s2", name: "S2", after: 4 }] });
  });

  test("an edition in the old form is converted: each entry becomes a set of one skill that takes its score and notes", () => {
    const read = readEdition({
      number: 1,
      publishedAt: "2026-10-10T00:00:00Z",
      entries: [{ id: "old", name: "Old", sourceUrl: "https://x.test", description: "d", quadrant: 1, ring: "try", score: 4, notes: "kept", change: "new" }],
    });
    assert.deepEqual(read?.entries, [
      {
        id: "old",
        name: "Old",
        sourceUrl: "https://x.test",
        description: "d",
        ring: "try",
        notes: "",
        change: "new",
        skills: [{ id: legacySkillId("old"), name: "Old", sourceUrl: "https://x.test", description: "d", score: 4, notes: "kept", topic: 1 }],
      },
    ]);
  });

  test("a migrated Library compared to the converted old edition shows every set unchanged", () => {
    const legacy = [
      { id: "a", name: "A", sourceUrl: "https://x.test/a", description: "d", quadrant: 2, ring: "try", score: 4, notes: "n", addedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", archived: false },
      { id: "b", name: "B", description: "", quadrant: 0, ring: "watch", score: 3, notes: "", addedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", archived: false },
    ];
    const old = readEdition({ number: 1, publishedAt: "2026-10-10T00:00:00Z", entries: legacy.map(({ addedAt: _a, updatedAt: _u, archived: _r, ...entry }) => ({ ...entry, change: "new" })) });
    assert.ok(old);
    const changes = changesSince(migrateLegacySkills(legacy), [old]);
    assert.deepEqual([...changes.values()], [{ kind: "unchanged" }, { kind: "unchanged" }]);
  });

  test("the names of the topics are read, each falling back to its default", () => {
    const read = readEdition({ number: 1, publishedAt: "2026-10-10T00:00:00Z", topics: ["One", 2, "  ", "Four"] });
    assert.deepEqual(read?.topics, ["One", DEFAULT_TOPICS[1], DEFAULT_TOPICS[2], "Four", DEFAULT_TOPICS[4]]);
  });

  test("an edition published with four quadrants is read with its four topics", () => {
    const read = readEdition({ number: 1, publishedAt: "2026-10-10T00:00:00Z", quadrants: ["One", 2, "  ", "Four"] });
    assert.deepEqual(read?.topics, ["One", DEFAULT_TOPICS[1], DEFAULT_TOPICS[2], "Four"]);
  });

  test("an edition published with the quadrant on the entry gives it as topic to each of its skills, and is not rewritten", () => {
    const stored = { number: 1, publishedAt: "2026-10-10T00:00:00Z", entries: [{ id: "a", name: "A", quadrant: 4, skills: [{ id: "s1", name: "S1" }, { id: "s2", name: "S2" }] }] };
    const before = JSON.stringify(stored);
    const read = readEdition(stored);
    assert.deepEqual(read?.entries[0].skills.map((item) => item.topic), [4, 4]);
    assert.equal("quadrant" in (read?.entries[0] ?? {}), false);
    assert.equal(JSON.stringify(stored), before);
  });

  test("a skill that has a topic in its entry keeps it, whatever the quadrant of the entry", () => {
    const read = readEdition({ number: 1, publishedAt: "2026-10-10T00:00:00Z", entries: [{ id: "a", name: "A", quadrant: 2, skills: [{ id: "s1", name: "S1", topic: 4 }, { id: "s2", name: "S2", topic: 9 }, { id: "s3", name: "S3" }] }] });
    assert.deepEqual(read?.entries[0].skills.map((item) => item.topic), [4, 2, 2]);
  });

  test("a skill with no topic nor quadrant anywhere takes 0", () => {
    const read = readEdition({ number: 1, publishedAt: "2026-10-10T00:00:00Z", entries: [{ id: "a", name: "A", quadrant: 8, skills: [{ id: "s1", name: "S1" }] }] });
    assert.equal(read?.entries[0].skills[0].topic, 0);
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
