import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addUnlessDuplicate, discoverSkills, editUnlessDuplicate, defaultName, duplicateKey, fetchSkill, findDuplicate, importSet, parseSkillUrl, readSkillFrontmatter, refreshSet } from "../src/lib/github.ts";
import { NOTES_TEMPLATE, type SkillSet } from "../src/lib/skills.ts";

const tdd = {
  owner: "acme",
  repo: "skills",
  ref: "main",
  path: "tdd",
  rawUrl: "https://raw.githubusercontent.com/acme/skills/main/tdd/SKILL.md",
  sourceUrl: "https://github.com/acme/skills/tree/main/tdd",
};

describe("recognizing a skill on GitHub in what the User pastes", () => {
  test("every form of the file or the folder, with or without https:// and www.", () => {
    for (const url of [
      "https://github.com/acme/skills/blob/main/tdd/SKILL.md",
      "github.com/acme/skills/blob/main/tdd/SKILL.md",
      "www.github.com/acme/skills/blob/main/tdd/SKILL.md",
      "http://github.com/acme/skills/blob/main/tdd/SKILL.md",
      "https://github.com/acme/skills/tree/main/tdd",
      "https://github.com/acme/skills/tree/main/tdd/",
      "https://raw.githubusercontent.com/acme/skills/main/tdd/SKILL.md",
      "raw.githubusercontent.com/acme/skills/main/tdd/SKILL.md",
    ]) {
      assert.deepEqual(parseSkillUrl(url), tdd, url);
    }
  });

  test("ignores the spaces around, the query string and the fragment", () => {
    assert.deepEqual(parseSkillUrl("  https://github.com/acme/skills/blob/main/tdd/SKILL.md?plain=1#L10 \n"), tdd);
  });

  test("a nested path is kept without its slashes at the ends", () => {
    assert.deepEqual(parseSkillUrl("https://github.com/acme/skills/tree/main/a/b/c/"), {
      owner: "acme",
      repo: "skills",
      ref: "main",
      path: "a/b/c",
      rawUrl: "https://raw.githubusercontent.com/acme/skills/main/a/b/c/SKILL.md",
      sourceUrl: "https://github.com/acme/skills/tree/main/a/b/c",
    });
  });

  test("the root of a repo is at HEAD with no path, and its source is the repo", () => {
    const root = {
      owner: "acme",
      repo: "skills",
      ref: "HEAD",
      path: "",
      rawUrl: "https://raw.githubusercontent.com/acme/skills/HEAD/SKILL.md",
      sourceUrl: "https://github.com/acme/skills",
    };
    for (const url of ["https://github.com/acme/skills", "github.com/acme/skills/", "https://github.com/acme/skills.git"]) {
      assert.deepEqual(parseSkillUrl(url), root, url);
    }
  });

  test("a file or a folder at the root of a ref has no path, and its source is that ref", () => {
    const atMain = {
      owner: "acme",
      repo: "skills",
      ref: "main",
      path: "",
      rawUrl: "https://raw.githubusercontent.com/acme/skills/main/SKILL.md",
      sourceUrl: "https://github.com/acme/skills/tree/main",
    };
    for (const url of [
      "https://github.com/acme/skills/blob/main/SKILL.md",
      "https://github.com/acme/skills/tree/main",
      "https://raw.githubusercontent.com/acme/skills/main/SKILL.md",
    ]) {
      assert.deepEqual(parseSkillUrl(url), atMain, url);
    }
  });

  test("rejects what is not a skill on GitHub", () => {
    for (const text of [
      "",
      "hello",
      "https://example.com/acme/skills",
      "https://github.com.evil.com/acme/skills",
      "https://github.com/acme/skills/blob/main/README.md",
      "https://github.com/acme/skills/blob/main/tdd/skill.md",
      "https://raw.githubusercontent.com/acme/skills/main/x/README.md",
      "https://raw.githubusercontent.com/acme/skills/main",
      "https://github.com/acme/skills/issues",
      "https://github.com/acme/skills/blob/main",
      "https://github.com/acme",
      "https://github.com/",
      "ftp://github.com/acme/skills",
    ]) {
      assert.equal(parseSkillUrl(text), null, text);
    }
  });
});

describe("reading the frontmatter of a SKILL.md", () => {
  test("one-line values, bare or quoted", () => {
    assert.deepEqual(readSkillFrontmatter("---\nname: tdd\ndescription: Red, green: repeat\n---\n# Body"), { name: "tdd", description: "Red, green: repeat" });
    assert.deepEqual(readSkillFrontmatter("---\nname: \"My \\\"tdd\\\" \\\\ skill\"\ndescription: 'It''s fine'\n---\n"), { name: 'My "tdd" \\ skill', description: "It's fine" });
  });

  test("a folded block joins its lines with spaces, and a blank line makes a new line", () => {
    assert.deepEqual(readSkillFrontmatter("---\nname: a\ndescription: >\n  one\n  two\n\n  three\n---\n"), { name: "a", description: "one two\nthree" });
    assert.deepEqual(readSkillFrontmatter("---\ndescription: >-\n  one\n  two\n---\n"), { description: "one two" });
    assert.deepEqual(readSkillFrontmatter("---\ndescription: >+\n  one\n---\n"), { description: "one" });
  });

  test("a bare value that goes on over indented lines is folded as a block is", () => {
    assert.deepEqual(readSkillFrontmatter("---\ndescription: one\n  two\n\n  three\nname: a\n---\n"), { name: "a", description: "one two\nthree" });
  });

  test("a literal block keeps its lines", () => {
    assert.deepEqual(readSkillFrontmatter("---\ndescription: |\n  one\n  two\n---\n"), { description: "one\ntwo" });
    assert.deepEqual(readSkillFrontmatter("---\ndescription: |-\n  one\n---\n"), { description: "one" });
  });

  test("the other keys and the nested ones are ignored", () => {
    const markdown = "---\nlicense: MIT\nmetadata:\n  name: nested\n  description: nested too\nname: top\n---\n";
    assert.deepEqual(readSkillFrontmatter(markdown), { name: "top" });
  });

  test("reads CRLF files, and omits the empty values", () => {
    assert.deepEqual(readSkillFrontmatter("---\r\nname: tdd\r\ndescription: >\r\n  a\r\n  b\r\n---\r\n"), { name: "tdd", description: "a b" });
    assert.deepEqual(readSkillFrontmatter("---\nname:\ndescription: \"\"\n---\n"), {});
  });

  test("no frontmatter, or one that never closes, is none", () => {
    assert.deepEqual(readSkillFrontmatter("# Title\nname: x"), {});
    assert.deepEqual(readSkillFrontmatter("\n---\nname: x\n---\n"), {});
    assert.deepEqual(readSkillFrontmatter("---\nname: x\n"), {});
    assert.deepEqual(readSkillFrontmatter(""), {});
  });
});

describe("the name a skill takes when its SKILL.md gives none", () => {
  const name = (url: string) => defaultName(parseSkillUrl(url)!);

  test("is the last segment of its path", () => {
    assert.equal(name("https://github.com/acme/skills/tree/main/a/b/tdd"), "tdd");
  });

  test("is the name of the repo when the path is empty", () => {
    assert.equal(name("https://github.com/acme/skills"), "skills");
    assert.equal(name("https://github.com/acme/skills/blob/main/SKILL.md"), "skills");
  });
});

const set = (id: string, sourceUrl?: string, rest: Partial<SkillSet> = {}): SkillSet => ({
  id,
  name: `Set ${id}`,
  ...(sourceUrl ? { sourceUrl } : {}),
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

describe("telling a set is already in the Library", () => {
  const FOLDER = "https://github.com/acme/skills/tree/main/tdd";

  test("the file, the folder and the raw URL of a set share one key, whatever the case of the owner and the repo", () => {
    for (const url of [
      FOLDER,
      `${FOLDER}/`,
      "github.com/Acme/Skills/blob/main/tdd/SKILL.md",
      "https://www.github.com/ACME/skills/tree/main/tdd",
      "https://raw.githubusercontent.com/acme/SKILLS/main/tdd/SKILL.md",
    ]) {
      assert.equal(duplicateKey(url), FOLDER, url);
    }
  });

  test("the path and the ref keep their case", () => {
    assert.notEqual(duplicateKey("https://github.com/acme/skills/tree/main/TDD"), duplicateKey(FOLDER));
    assert.notEqual(duplicateKey("https://github.com/acme/skills/tree/dev/tdd"), duplicateKey(FOLDER));
  });

  test("another url is its own key, without the spaces around and the slashes at the end", () => {
    assert.equal(duplicateKey("  https://example.com/tdd// "), "https://example.com/tdd");
  });

  test("no url has no key", () => {
    assert.equal(duplicateKey(undefined), null);
    assert.equal(duplicateKey("   "), null);
  });

  test("the duplicate is the set with the same key, archived or not", () => {
    const archived = set("b", "https://github.com/Acme/Skills/blob/main/tdd/SKILL.md", { archived: true });
    const list = [set("a", "https://example.com"), archived, set("c")];
    assert.equal(findDuplicate(list, "https://raw.githubusercontent.com/acme/skills/main/tdd/SKILL.md"), archived);
    assert.equal(findDuplicate(list, "https://example.com/"), list[0]);
  });

  test("a set added by hand without a url is never a duplicate", () => {
    const list = [set("a"), set("b", "https://example.com")];
    assert.equal(findDuplicate(list, undefined), undefined);
    assert.equal(findDuplicate(list, ""), undefined);
    assert.equal(findDuplicate(list, "https://example.com/other"), undefined);
  });
});

describe("adding a set that may be there already", () => {
  const now = new Date("2026-10-22T10:00:00Z");

  test("a new url is added first", () => {
    const list = [set("a", "https://example.com")];
    const result = addUnlessDuplicate(list, { name: "TDD", url: "https://github.com/acme/skills/tree/main/tdd" }, now, "b");
    assert.ok(result && "set" in result);
    assert.deepEqual(result.sets.map((item) => item.id), ["b", "a"]);
  });

  test("a url that is there already, archived or not, adds nothing and gives the set that has it", () => {
    const archived = set("a", "https://github.com/Acme/Skills/blob/main/tdd/SKILL.md", { archived: true });
    const result = addUnlessDuplicate([archived], { name: "Again", url: "https://github.com/acme/skills/tree/main/tdd" }, now, "b");
    assert.deepEqual(result, { duplicate: archived });
  });

  test("a blank name adds nothing and is no duplicate", () => {
    assert.equal(addUnlessDuplicate([], { name: " " }, now, "b"), null);
  });
});

describe("editing a set that may take the url of another", () => {
  const now = new Date("2026-10-23T09:00:00Z");
  const other = set("b", "https://github.com/acme/skills/tree/main/tdd", { archived: true });
  const list = [set("a", "https://example.com"), other, set("c")];

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

describe("fetching a skill from GitHub", () => {
  const parsed = parseSkillUrl("https://github.com/acme/skills/tree/main/tdd")!;
  const answering = (status: number, body = "") => {
    const asked: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      asked.push(String(input));
      return new Response(body, { status });
    }) as typeof fetch;
    return { asked, fetchFn };
  };

  test("reads the name and the description from the SKILL.md at its raw URL", async () => {
    const { asked, fetchFn } = answering(200, "---\nname: TDD\ndescription: Red, green\n---\n# Body");
    assert.deepEqual(await fetchSkill(parsed, fetchFn), { ok: true, name: "TDD", description: "Red, green" });
    assert.deepEqual(asked, [parsed.rawUrl]);
  });

  test("a SKILL.md without frontmatter takes the default name and no description", async () => {
    const { fetchFn } = answering(200, "# Just a title");
    assert.deepEqual(await fetchSkill(parsed, fetchFn), { ok: true, name: "tdd", description: "" });
  });

  test("a missing file is not found", async () => {
    assert.deepEqual(await fetchSkill(parsed, answering(404).fetchFn), { ok: false, reason: "not_found" });
  });

  test("any other failure, or no answer at all, is the network", async () => {
    assert.deepEqual(await fetchSkill(parsed, answering(500).fetchFn), { ok: false, reason: "network" });
    assert.deepEqual(await fetchSkill(parsed, answering(403).fetchFn), { ok: false, reason: "network" });
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    assert.deepEqual(await fetchSkill(parsed, offline), { ok: false, reason: "network" });
  });
});

describe("discovering the skills under a GitHub URL", () => {
  const RAW = "https://raw.githubusercontent.com/obra/superpowers/main/skills";
  const API = "https://api.github.com/repos/obra/superpowers/contents/skills?ref=main";
  const skillMd = (name: string) => `---\nname: ${name}\ndescription: About ${name}\n---\n# ${name}`;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  /** A fake GitHub: `routes` maps a URL to a response (or a function making it); any other URL is a 404. */
  const github = (routes: Record<string, () => Response | Promise<Response>>) => {
    const asked: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      const url = String(input);
      asked.push(url);
      return routes[url]?.() ?? new Response("", { status: 404 });
    }) as typeof fetch;
    return { asked, fetchFn };
  };
  const dir = (name: string) => ({ name, type: "dir" });
  const parsedSet = parseSkillUrl("https://github.com/obra/superpowers/tree/main/skills")!;

  test("a folder that is itself a skill is a single skill, and its subfolders are not looked at", async () => {
    const parsed = parseSkillUrl("https://github.com/obra/superpowers/tree/main/skills/tdd")!;
    const { asked, fetchFn } = github({ [`${RAW}/tdd/SKILL.md`]: () => new Response(skillMd("TDD")) });
    assert.deepEqual(await discoverSkills(parsed, fetchFn), {
      kind: "single",
      skill: { name: "TDD", description: "About TDD", sourceUrl: "https://github.com/obra/superpowers/tree/main/skills/tdd" },
    });
    assert.deepEqual(asked, [`${RAW}/tdd/SKILL.md`]);
  });

  test("the URL of the SKILL.md itself is a single skill", async () => {
    const parsed = parseSkillUrl("https://github.com/obra/superpowers/blob/main/skills/tdd/SKILL.md")!;
    const { fetchFn } = github({ [`${RAW}/tdd/SKILL.md`]: () => new Response("# no frontmatter") });
    assert.deepEqual(await discoverSkills(parsed, fetchFn), {
      kind: "single",
      skill: { name: "tdd", description: "", sourceUrl: "https://github.com/obra/superpowers/tree/main/skills/tdd" },
    });
  });

  test("a folder of skill folders is a set, in the order of the folders; files and folders with no SKILL.md are ignored", async () => {
    const { fetchFn } = github({
      [`${RAW}/SKILL.md`]: () => new Response("", { status: 404 }),
      [API]: () => json([dir("brainstorming"), { name: "README.md", type: "file" }, dir("docs"), dir("tdd")]),
      [`${RAW}/brainstorming/SKILL.md`]: () => new Response(skillMd("Brainstorming")),
      [`${RAW}/tdd/SKILL.md`]: () => new Response(skillMd("TDD")),
    });
    assert.deepEqual(await discoverSkills(parsedSet, fetchFn), {
      kind: "set",
      skills: [
        { name: "Brainstorming", description: "About Brainstorming", sourceUrl: "https://github.com/obra/superpowers/tree/main/skills/brainstorming" },
        { name: "TDD", description: "About TDD", sourceUrl: "https://github.com/obra/superpowers/tree/main/skills/tdd" },
      ],
    });
  });

  test("only one level is read: the folders of the skill folders are never requested", async () => {
    const { asked, fetchFn } = github({
      [API]: () => json([dir("tdd")]),
      [`${RAW}/tdd/SKILL.md`]: () => new Response(skillMd("TDD")),
    });
    await discoverSkills(parsedSet, fetchFn);
    assert.deepEqual(asked, [`${RAW}/SKILL.md`, API, `${RAW}/tdd/SKILL.md`]);
  });

  test("a repo root with no skill directly in it and no skill folder is empty", async () => {
    const parsed = parseSkillUrl("https://github.com/obra/superpowers")!;
    const { asked, fetchFn } = github({
      "https://api.github.com/repos/obra/superpowers/contents": () => json([dir("docs"), { name: "README.md", type: "file" }]),
    });
    assert.deepEqual(await discoverSkills(parsed, fetchFn), { kind: "empty" });
    // The ref HEAD is left out of the query, and there is no trailing slash at the root.
    assert.deepEqual(asked, [
      "https://raw.githubusercontent.com/obra/superpowers/HEAD/SKILL.md",
      "https://api.github.com/repos/obra/superpowers/contents",
      "https://raw.githubusercontent.com/obra/superpowers/HEAD/docs/SKILL.md",
    ]);
  });

  test("the folder of a ref other than HEAD is listed with ?ref=", async () => {
    const parsed = parseSkillUrl("https://github.com/obra/superpowers/tree/v2/skills")!;
    const { asked, fetchFn } = github({});
    await discoverSkills(parsed, fetchFn);
    assert.equal(asked[1], "https://api.github.com/repos/obra/superpowers/contents/skills?ref=v2");
  });

  test("a folder that lists nothing useful is empty", async () => {
    const { fetchFn } = github({ [API]: () => json([]) });
    assert.deepEqual(await discoverSkills(parsedSet, fetchFn), { kind: "empty" });
  });

  test("the API answering 404 is not found; 403 and 429 are rate limited; other failures are the network", async () => {
    const reasonOf = async (status: number) => discoverSkills(parsedSet, github({ [API]: () => json({}, status) }).fetchFn);
    assert.deepEqual(await reasonOf(404), { kind: "error", reason: "not_found" });
    assert.deepEqual(await reasonOf(403), { kind: "error", reason: "rate_limited" });
    assert.deepEqual(await reasonOf(429), { kind: "error", reason: "rate_limited" });
    assert.deepEqual(await reasonOf(500), { kind: "error", reason: "network" });
  });

  test("a listing that is not a list is the network", async () => {
    const { fetchFn } = github({ [API]: () => json({ message: "a file" }) });
    assert.deepEqual(await discoverSkills(parsedSet, fetchFn), { kind: "error", reason: "network" });
  });

  test("no answer at all is the network, for the SKILL.md, the listing and a skill folder", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    assert.deepEqual(await discoverSkills(parsedSet, offline), { kind: "error", reason: "network" });
    const listingDown = github({ [API]: () => Promise.reject(new TypeError("down")) });
    assert.deepEqual(await discoverSkills(parsedSet, listingDown.fetchFn), { kind: "error", reason: "network" });
    const childDown = github({ [API]: () => json([dir("tdd")]), [`${RAW}/tdd/SKILL.md`]: () => new Response("", { status: 500 }) });
    assert.deepEqual(await discoverSkills(parsedSet, childDown.fetchFn), { kind: "error", reason: "network" });
  });

  test("at most 6 SKILL.md are requested at once, and the order is kept whatever the order of the answers", async () => {
    const names = Array.from({ length: 15 }, (_, index) => `skill-${String(index).padStart(2, "0")}`);
    let inFlight = 0;
    let peak = 0;
    const fetchFn = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === API) return json(names.map(dir));
      if (url === `${RAW}/SKILL.md`) return new Response("", { status: 404 });
      inFlight++;
      peak = Math.max(peak, inFlight);
      // The later folders answer first.
      const index = names.findIndex((name) => url === `${RAW}/${name}/SKILL.md`);
      await new Promise((resolve) => setTimeout(resolve, (names.length - index) * 2));
      inFlight--;
      return new Response(skillMd(names[index]));
    }) as typeof fetch;
    const found = await discoverSkills(parsedSet, fetchFn);
    assert.equal(found.kind, "set");
    assert.deepEqual(found.kind === "set" && found.skills.map((skill) => skill.name), names);
    assert.equal(peak, 6);
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

  test("adds a set to watch, in the first quadrant, with the skills in their order, not evaluated, with the template as notes", () => {
    const result = importSet([], draft, found, now, ids());
    assert.ok(result && "set" in result);
    const { set, sets } = result;
    assert.deepEqual(sets, [set]);
    assert.equal(set.id, "id-1");
    assert.equal(set.name, "Superpowers");
    assert.equal(set.sourceUrl, draft.url);
    assert.deepEqual([set.ring, set.quadrant, set.notes, set.description, set.archived], ["watch", 0, "", "", false]);
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
        { id: "hand", name: "By hand", description: "", notes: "", addedAt: imported.toISOString() },
        { id: "far", name: "Elsewhere", sourceUrl: "https://github.com/other/repo/tree/main/x", description: "", notes: "", addedAt: imported.toISOString() },
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
