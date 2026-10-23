import assert from "node:assert/strict";
import { describe, test } from "node:test";
import matter from "gray-matter";
import { POST_RADAR_LABELS, postSlug, renderPost } from "../src/lib/post.ts";
import { readEdition, type Edition, type EditionEntry, type EditionSkill } from "../src/lib/editions.ts";

const skill = (id: string, rest: Partial<EditionSkill> = {}): EditionSkill => ({ id, name: `Skill ${id}`, description: "", notes: "", ...rest });

const entry = (id: string, rest: Partial<EditionEntry> = {}): EditionEntry => ({
  id,
  name: `Set ${id}`,
  quadrant: 0,
  ring: "watch",
  change: "new",
  description: "",
  notes: "",
  skills: [],
  ...rest,
});

const edition = (rest: Partial<Edition> = {}, ...entries: EditionEntry[]): Edition => ({
  number: 2,
  publishedAt: "2026-10-10T00:00:00.000Z",
  intro: "Hello",
  quadrants: ["Design", "Code", "Writing", "Tooling"],
  entries,
  retired: [],
  ...rest,
});

const bodyOf = (published: Edition) => matter(renderPost(published)).content.trimStart();

describe("the slug", () => {
  test("is the name of the post and of its files", () => {
    assert.equal(postSlug(7), "skills-radar-edition-7");
  });
});

describe("the frontmatter", () => {
  test("is read back by gray-matter with the title, the images, the date and the author", () => {
    const { data } = matter(renderPost(edition({ number: 3 })));
    assert.deepEqual(data, {
      title: "Skills Radar — Édition 3",
      excerpt: "Hello",
      coverImage: "/assets/blog/skills-radar-edition-3/cover.png",
      date: "2026-10-10T00:00:00.000Z",
      author: { picture: "/assets/blog/authors/yma_logo.png" },
      ogImage: { url: "/assets/blog/skills-radar-edition-3/cover.png" },
    });
  });

  test("keeps the first paragraph of the introduction only, as plain text, whatever it holds", () => {
    const intro = 'Say "hi" to a \\ backslash,\nand *a* [link](https://x.y) with `code`.\n\n# Second paragraph\n\nNever in the excerpt.';
    const { data } = matter(renderPost(edition({ intro })));
    assert.equal(data.excerpt, 'Say "hi" to a \\ backslash, and a link with code.');
  });

  test("leaves the HTML tags of the introduction out of the excerpt", () => {
    const { data } = matter(renderPost(edition({ intro: "A <b>bold</b> start." })));
    assert.equal(data.excerpt, "A bold start.");
  });

  test("escapes the control characters of the excerpt", () => {
    const { data } = matter(renderPost(edition({ intro: "Tab\there \u0001 and line" })));
    assert.equal(data.excerpt, "Tab\there \u0001 and line");
  });

  test("leaves the introduction as it is in the body", () => {
    const intro = "# Title\n\nFirst *one*.\n\nSecond.";
    assert.ok(bodyOf(edition({ intro })).startsWith(intro));
  });
});

describe("the radar", () => {
  test("is the SVG of the edition on one line, followed by the numbered legend in French", () => {
    const body = bodyOf(edition({}, entry("a", { name: "Beta", ring: "try", skills: [skill("1")] }), entry("b", { name: "Alpha", ring: "recommended", skills: [skill("2"), skill("3")] })));
    const line = body.split("\n").find((l) => l.includes("<svg"));
    assert.ok(line);
    assert.ok(line.includes("</svg>"));
    assert.ok(line.includes("Radar des skills: Design, Code, Writing, Tooling"));
    assert.ok(line.includes("Recommandé") && line.includes("À surveiller"));
    assert.ok(body.includes("1. Alpha — Recommandé (2 skills)"));
    assert.ok(body.includes("2. Beta — À essayer (1 skill)"));
  });

  test("lists the skills of each set in the title of the radar, with their stars or that they are not rated yet, and keeps the SVG on one line", () => {
    const body = bodyOf(edition({}, entry("a", { name: "Alpha", skills: [skill("1", { name: "Rated", score: 3 }), skill("2", { name: "Fresh" })] })));
    const svg = body.split("\n").find((l) => l.includes("<svg"));
    assert.ok(svg);
    assert.ok(svg.includes("</svg>"));
    assert.ok(svg.includes("Rated ★★★☆☆") && svg.includes("Fresh (pas encore évaluée)"));
  });

  test("words its legend in the masculine, as a set is", () => {
    const { unchanged, new: added, up, down } = POST_RADAR_LABELS;
    assert.deepEqual([unchanged, added, up, down], ["Inchangé ou mis à jour", "Nouveau ou de retour", "Rapproché du centre", "Éloigné du centre"]);
  });

  test("does not break the legend with the characters of a name", () => {
    const body = bodyOf(edition({}, entry("a", { name: "<b>[x]</b> *y*" })));
    assert.ok(body.includes("1. &lt;b&gt;\\[x\\]&lt;/b&gt; \\*y\\* — À surveiller (0 skills)"));
  });
});

describe("what moves", () => {
  test("gives every set of the first edition its full card, with a badge and no stars", () => {
    const body = bodyOf(
      edition({ number: 1 }, entry("a", { name: "Alpha", ring: "recommended", description: "About alpha.", sourceUrl: "https://a.dev" }), entry("b", { name: "Beta", ring: "try" })),
    );
    const moves = body.slice(body.indexOf("## Ce qui bouge"));
    assert.ok(moves.includes("\n### 1. Alpha\n"));
    assert.ok(moves.includes("\n### 2. Beta\n"));
    assert.ok(moves.includes("*Nouveau*"));
    assert.ok(moves.includes("About alpha."));
    assert.ok(moves.includes("[https://a.dev](https://a.dev)"));
    assert.ok(!body.includes("## Le reste du radar"));
  });

  test("puts the skills of a set in a table, linked when they have a source, with their stars and their description", () => {
    const body = bodyOf(
      edition({}, entry("a", { skills: [skill("s1", { name: "Linked", sourceUrl: "https://s.dev", score: 4, description: "Does it." }), skill("s2", { name: "Plain" })] })),
    );
    assert.ok(
      body.includes("| Skill | Note | Description |\n| --- | --- | --- |\n| [Linked](https://s.dev) | ★★★★☆ | Does it. |\n| Plain | *Pas encore évaluée* | |"),
    );
  });

  test("keeps the cells of the table on their line, whatever the skills hold", () => {
    const body = bodyOf(edition({}, entry("a", { skills: [skill("s1", { name: "A|B", description: "one | two\nthree" })] })));
    assert.ok(body.includes("| A\\|B | *Pas encore évaluée* | one \\| two three |"));
  });

  test("leaves the table out when the set has no skills", () => {
    assert.ok(!bodyOf(edition({}, entry("a"))).includes("| Skill |"));
  });

  test("gives each skill with notes its own part under the table, with the headings of its notes lowered to #####, but not those of a code fence", () => {
    const notes = "# Why\n\ntext\n\n## How\n\n```md\n# not a heading\n```";
    const body = bodyOf(edition({}, entry("a", { skills: [skill("s1", { name: "Documented", notes }), skill("s2", { name: "Bare" })] })));
    assert.ok(body.includes("\n#### Documented\n\n##### Why\n\ntext\n\n###### How\n"));
    assert.ok(body.includes("\n# not a heading\n"));
    assert.ok(!body.includes("#### Bare"));
  });

  test("leaves out the notes of a skill that are empty or reduced to the template", () => {
    const template = "#### What it's for\n\n#### Why\n\n#### How\n\n#### Suggestions for improvement\n";
    const body = bodyOf(
      edition({}, entry("a", { skills: [skill("s1", { name: "Empty" }), skill("s2", { name: "Spaces", notes: " \n\n" }), skill("s3", { name: "Template", notes: template }), skill("s4", { name: "Variant", notes: "# One\n   \n\n## Two\n" })] })),
    );
    assert.ok(!body.includes("#### Empty") && !body.includes("#### Spaces") && !body.includes("#### Template") && !body.includes("#### Variant"));
  });

  test("keeps the notes of a skill that hold more than headings, even a heading in a code fence", () => {
    const body = bodyOf(edition({}, entry("a", { skills: [skill("s1", { name: "Filled", notes: "#### Pourquoi\n\nBecause.\n" }), skill("s2", { name: "Fenced", notes: "```\n# code\n```" })] })));
    assert.ok(body.includes("\n#### Filled\n\n##### Pourquoi\n\nBecause."));
    assert.ok(body.includes("\n#### Fenced\n"));
  });

  test("details what changed among the skills of a moved set, between its notes and its table, each line only when there is something to say", () => {
    const skillChanges = {
      added: [{ id: "1", name: "A" }, { id: "2", name: "B" }],
      removed: [{ id: "3", name: "C" }],
      scores: [{ id: "4", name: "X", before: 2, after: 4 }, { id: "5", name: "Y", after: 3 }, { id: "6", name: "Z", before: 5 }],
    };
    const body = bodyOf(
      edition({}, entry("a", { change: "moved", previousRing: "try", ring: "recommended", notes: "Set notes.", skillChanges, skills: [skill("4", { name: "X", score: 4 })] })),
    );
    assert.ok(
      body.includes(
        "Set notes.\n\n- Ajoutées : A, B\n- Retirées : C\n- Notes : X ★★☆☆☆ → ★★★★☆, Y *Pas encore évaluée* → ★★★☆☆, Z ★★★★★ → *Pas encore évaluée*\n\n| Skill |",
      ),
    );
    const only = bodyOf(edition({}, entry("a", { change: "moved", previousRing: "try", skillChanges: { added: [], removed: [{ id: "3", name: "C" }], scores: [] } })));
    assert.ok(only.includes("- Retirées : C") && !only.includes("Ajoutées") && !only.includes("- Notes"));
  });

  test("gives a new set no detail of its skills", () => {
    assert.ok(!bodyOf(edition({}, entry("a", { skillChanges: { added: [{ id: "1", name: "A" }], removed: [], scores: [] } }))).includes("Ajoutées"));
  });

  test("gives a set of an edition kept in the old form a table row with its stars and its notes under its name", () => {
    const stored = {
      number: 1,
      publishedAt: "2026-01-01T00:00:00.000Z",
      intro: "Hello",
      entries: [{ id: "old", name: "Old skill", quadrant: 1, ring: "try", change: "new", description: "Was one skill.", score: 4, notes: "# Why\n\nBecause." }],
    };
    const published = readEdition(stored);
    assert.ok(published);
    const body = bodyOf(published);
    assert.ok(body.includes("| Old skill | ★★★★☆ | Was one skill. |"));
    assert.ok(body.includes("\n#### Old skill\n\n##### Why\n\nBecause."));
  });

  test("groups the cards by ring, from the centre outwards", () => {
    const body = bodyOf(edition({}, entry("w", { name: "W", ring: "watch" }), entry("r", { name: "R", ring: "recommended" })));
    assert.ok(body.indexOf("### 1. R") < body.indexOf("### 2. W"));
    assert.ok(body.indexOf("**Recommandé**") < body.indexOf("### 1. R"));
  });

  test("tells where a moved skill comes from and why, and a returning one is back", () => {
    const body = bodyOf(
      edition({}, entry("a", { name: "A", ring: "recommended", change: "moved", previousRing: "try", moveReason: "It proved itself." }), entry("b", { name: "B", change: "back" })),
    );
    assert.ok(body.includes("*Déplacé : À essayer → Recommandé*"));
    assert.ok(body.includes("It proved itself."));
    assert.ok(body.includes("*De retour*"));
  });

  test("lowers the headings of the notes so that the highest is ####, but not those of a code fence", () => {
    const notes = "# A\n\ntext\n\n## B\n\n```md\n# not a heading\n```\n\n####### seven";
    const body = bodyOf(edition({}, entry("a", { notes })));
    assert.ok(body.includes("\n#### A\n"));
    assert.ok(body.includes("\n##### B\n"));
    assert.ok(body.includes("\n# not a heading\n"));
    assert.ok(body.includes("\n####### seven\n"));
  });

  test("keeps #### as it is when it is the highest heading, and caps the others at ######", () => {
    const body = bodyOf(edition({}, entry("a", { notes: "#### C\n\n###### D" })));
    assert.ok(body.includes("\n#### C\n"));
    assert.ok(body.includes("\n###### D\n"));
    const deep = bodyOf(edition({}, entry("a", { notes: "# A\n\n###### F" })));
    assert.ok(deep.includes("\n###### F\n"));
  });
});

describe("the rest of the radar", () => {
  test("lists the unchanged and updated sets compactly, by ring, with their number of skills", () => {
    const body = bodyOf(
      edition(
        {},
        entry("a", { name: "Alpha", ring: "recommended", change: "unchanged", sourceUrl: "https://a.dev", skills: [skill("1"), skill("2")] }),
        entry("b", { name: "Beta", ring: "recommended", change: "updated", skills: [skill("3")] }),
      ),
    );
    const rest = body.slice(body.indexOf("## Le reste du radar"));
    assert.ok(rest.includes("- **1.** [Alpha](https://a.dev) (2 skills)"));
    assert.ok(rest.includes("- **2.** Beta (1 skill) — *mis à jour*"));
    assert.ok(!body.includes("## Ce qui bouge"));
  });
});

describe("the rest of the radar, updated", () => {
  test("names what changed among the skills of an updated set on its line", () => {
    const skillChanges = { added: [{ id: "1", name: "A" }], removed: [{ id: "3", name: "C" }], scores: [{ id: "4", name: "X", before: 2, after: 4 }] };
    const body = bodyOf(edition({}, entry("a", { name: "Alpha", change: "updated", skillChanges, skills: [skill("1")] }), entry("b", { name: "Beta", change: "updated", skills: [skill("2")] })));
    assert.ok(body.includes("- **1.** Alpha (1 skill) — *mis à jour* : Ajoutées : A ; Retirées : C ; Notes : X ★★☆☆☆ → ★★★★☆\n"));
    assert.ok(body.includes("- **2.** Beta (1 skill) — *mis à jour*\n"));
  });
});

describe("the retired sets and the footnote", () => {
  test("lists the retired sets with the ring they left, only when there are some", () => {
    assert.ok(!bodyOf(edition()).includes("## Retirés du radar"));
    const body = bodyOf(edition({ retired: [{ id: "x", name: "Old", previousRing: "deprecated" }] }));
    assert.ok(body.includes("## Retirés du radar"));
    assert.ok(body.includes("- Old — Déconseillé"));
  });

  test("ends with the footnote", () => {
    assert.ok(bodyOf(edition()).trimEnd().endsWith("*Inspiré du Technology Radar de Thoughtworks.*"));
  });
});
