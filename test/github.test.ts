import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addUnlessDuplicate, editUnlessDuplicate, defaultName, duplicateKey, fetchSkill, findDuplicate, parseSkillUrl, readSkillFrontmatter } from "../src/lib/github.ts";
import type { SkillSet } from "../src/lib/skills.ts";

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
