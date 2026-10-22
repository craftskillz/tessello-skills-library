import assert from "node:assert/strict";
import { describe, test } from "node:test";
import matter from "gray-matter";
import { postSlug, renderPost } from "../src/lib/post.ts";
import type { Edition, EditionEntry } from "../src/lib/editions.ts";

const entry = (id: string, rest: Partial<EditionEntry> = {}): EditionEntry => ({
  id,
  name: `Skill ${id}`,
  quadrant: 0,
  ring: "watch",
  change: "new",
  description: "",
  score: 3,
  notes: "",
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
    const body = bodyOf(edition({}, entry("a", { name: "Beta", ring: "try" }), entry("b", { name: "Alpha", ring: "recommended" })));
    const line = body.split("\n").find((l) => l.includes("<svg"));
    assert.ok(line);
    assert.ok(line.includes("</svg>"));
    assert.ok(line.includes("Radar des skills: Design, Code, Writing, Tooling"));
    assert.ok(line.includes("Recommandé") && line.includes("À surveiller"));
    assert.ok(body.includes("1. Alpha — Recommandé"));
    assert.ok(body.includes("2. Beta — À essayer"));
  });

  test("does not break the legend with the characters of a name", () => {
    const body = bodyOf(edition({}, entry("a", { name: "<b>[x]</b> *y*" })));
    assert.ok(body.includes("1. &lt;b&gt;\\[x\\]&lt;/b&gt; \\*y\\* — À surveiller"));
  });
});

describe("what moves", () => {
  test("gives every skill of the first edition its full card, with stars and a badge", () => {
    const body = bodyOf(
      edition({ number: 1 }, entry("a", { name: "Alpha", ring: "recommended", score: 3, description: "About alpha.", sourceUrl: "https://a.dev" }), entry("b", { name: "Beta", ring: "try", score: 5 })),
    );
    const moves = body.slice(body.indexOf("## Ce qui bouge"));
    assert.ok(moves.includes("### 1. Alpha ★★★☆☆"));
    assert.ok(moves.includes("### 2. Beta ★★★★★"));
    assert.ok(moves.includes("*Nouveau*"));
    assert.ok(moves.includes("About alpha."));
    assert.ok(moves.includes("[https://a.dev](https://a.dev)"));
    assert.ok(!body.includes("## Le reste du radar"));
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
  test("lists the unchanged and updated skills compactly, by ring", () => {
    const body = bodyOf(
      edition(
        {},
        entry("a", { name: "Alpha", ring: "recommended", change: "unchanged", score: 4, sourceUrl: "https://a.dev" }),
        entry("b", { name: "Beta", ring: "recommended", change: "updated", score: 2 }),
      ),
    );
    const rest = body.slice(body.indexOf("## Le reste du radar"));
    assert.ok(rest.includes("- **1.** [Alpha](https://a.dev) ★★★★☆"));
    assert.ok(rest.includes("- **2.** Beta ★★☆☆☆ — *mise à jour*"));
    assert.ok(!body.includes("## Ce qui bouge"));
  });
});

describe("the retired skills and the footnote", () => {
  test("lists the retired skills with the ring they left, only when there are some", () => {
    assert.ok(!bodyOf(edition()).includes("## Retirées du radar"));
    const body = bodyOf(edition({ retired: [{ id: "x", name: "Old", previousRing: "deprecated" }] }));
    assert.ok(body.includes("## Retirées du radar"));
    assert.ok(body.includes("- Old — Déconseillé"));
  });

  test("ends with the footnote", () => {
    assert.ok(bodyOf(edition()).trimEnd().endsWith("*Inspiré du Technology Radar de Thoughtworks.*"));
  });
});
