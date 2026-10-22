// What the Module knows of GitHub: which URLs are those of a skill (a folder with a `SKILL.md`), the URLs it builds from
// them, and the reading of the name and the description a `SKILL.md` holds in its frontmatter.

import { addSkill, type Draft, type Skill } from "./skills.ts";

export interface ParsedSkillUrl {
  owner: string;
  repo: string;
  /** The branch, tag or commit; `HEAD` for the root of a repo. A branch with a `/` in its name is not supported. */
  ref: string;
  /** The folder of the skill in the repo, with no slash at its ends; empty at the root. */
  path: string;
  /** Where the `SKILL.md` can be read from. */
  rawUrl: string;
  /** The folder of the skill on github.com. */
  sourceUrl: string;
}

const FILE = "SKILL.md";
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const RAW_HOST = "raw.githubusercontent.com";

/** The skill of a GitHub URL, with or without `https://` and `www.`; null for anything else. */
export function parseSkillUrl(text: string): ParsedSkillUrl | null {
  const trimmed = text.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const [owner, rawRepo, kind, ref, ...rest] = segments;
  if (!owner || !rawRepo) return null;
  const repo = rawRepo.replace(/\.git$/, "");
  if (!repo) return null;
  if (GITHUB_HOSTS.has(url.hostname)) {
    if (segments.length === 2) return build(owner, repo, "HEAD", []);
    if (!ref) return null;
    if (kind === "tree") return build(owner, repo, ref, rest);
    if (kind === "blob" && rest.at(-1) === FILE) return build(owner, repo, ref, rest.slice(0, -1));
    return null;
  }
  if (url.hostname === RAW_HOST) {
    // Here the third segment is the ref, so the rest starts one segment earlier.
    const [, , branch, ...path] = segments;
    if (!branch || path.at(-1) !== FILE) return null;
    return build(owner, repo, branch, path.slice(0, -1));
  }
  return null;
}

function build(owner: string, repo: string, ref: string, segments: string[]): ParsedSkillUrl {
  const path = segments.join("/");
  const folder = path ? `/${path}` : "";
  const repoUrl = `https://github.com/${owner}/${repo}`;
  return {
    owner,
    repo,
    ref,
    path,
    rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}${folder}/${FILE}`,
    sourceUrl: !path && ref === "HEAD" ? repoUrl : `${repoUrl}/tree/${ref}${folder}`,
  };
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
}

/**
 * The name and the description in the `---` block at the top of a `SKILL.md`. Values can be on one line, bare or quoted,
 * or in a folded `>` or literal `|` block. There is no YAML library behind it: the other keys and the nested ones are
 * ignored, and a block that is missing or never closes gives none.
 */
export function readSkillFrontmatter(markdown: string): SkillFrontmatter {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trimEnd() !== "---") return {};
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (end < 0) return {};
  const found: SkillFrontmatter = {};
  for (let index = 1; index < end; index++) {
    const key = /^(name|description):[ \t]*(.*)$/.exec(lines[index]);
    if (!key) continue;
    // The indented and blank lines that follow belong to this key.
    let next = index + 1;
    while (next < end && (lines[next].trim() === "" || /^\s/.test(lines[next]))) next++;
    const value = valueOf(key[2].trimEnd(), lines.slice(index + 1, next)).trim();
    if (value) found[key[1] as keyof SkillFrontmatter] = value;
    index = next - 1;
  }
  return found;
}

function valueOf(inline: string, following: string[]): string {
  const block = /^([>|])[+-]?$/.exec(inline);
  if (block) {
    const indent = Math.min(...following.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)![0].length));
    const content = following.map((line) => line.slice(indent).trimEnd());
    return block[1] === "|" ? content.join("\n") : fold(content);
  }
  if (inline.length >= 2 && inline.startsWith('"') && inline.endsWith('"')) return inline.slice(1, -1).replace(/\\(["\\])/g, "$1");
  if (inline.length >= 2 && inline.startsWith("'") && inline.endsWith("'")) return inline.slice(1, -1).replaceAll("''", "'");
  // A bare value may go on over the indented lines that follow it.
  return fold([inline, ...following.map((line) => line.trim())]);
}

/** Lines joined with spaces, and a blank line as a new line, as a folded block reads. */
const fold = (lines: string[]) =>
  lines
    .join("\n")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split("\n").join(" "))
    .join("\n");

/** The name of a skill whose `SKILL.md` gives none: the last segment of its path, or the repo at the root. */
export function defaultName({ path, repo }: ParsedSkillUrl): string {
  return path.split("/").at(-1) || repo;
}

/**
 * What tells two urls are those of the same skill: the folder on github.com with the owner and the repo in lowercase, so
 * its file, its folder and its raw URL agree. Any other url is its own key; no url has none.
 */
export function duplicateKey(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const parsed = parseSkillUrl(trimmed);
  if (!parsed) return trimmed.replace(/\/+$/, "");
  const { owner, repo } = parsed;
  return parsed.sourceUrl.replace(`/${owner}/${repo}`, `/${owner.toLowerCase()}/${repo.toLowerCase()}`);
}

/** The skill, archived or not, that comes from the same place as `url`; none when `url` has no key. */
export function findDuplicate(skills: readonly Skill[], url: string | undefined): Skill | undefined {
  const key = duplicateKey(url);
  return key === null ? undefined : skills.find((skill) => duplicateKey(skill.sourceUrl) === key);
}

/**
 * `addSkill`, but nothing is added when a skill, archived or not, comes from the same place as the url of the draft: the
 * answer is then that skill.
 */
export function addUnlessDuplicate(
  skills: readonly Skill[],
  draft: Draft,
  now: Date,
  id: string,
): { skills: Skill[]; skill: Skill } | { duplicate: Skill } | null {
  if (!draft.name.trim()) return null;
  const duplicate = findDuplicate(skills, draft.url);
  return duplicate ? { duplicate } : addSkill(skills, draft, now, id);
}

export type FetchedSkill = { ok: true; name: string; description: string } | { ok: false; reason: "not_found" | "network" };

/** The name and the description of the skill, read from its `SKILL.md`; why not, when it cannot be read. */
export async function fetchSkill(parsed: ParsedSkillUrl, fetchFn: typeof fetch = fetch): Promise<FetchedSkill> {
  let markdown: string;
  try {
    const response = await fetchFn(parsed.rawUrl);
    if (response.status === 404) return { ok: false, reason: "not_found" };
    if (!response.ok) return { ok: false, reason: "network" };
    markdown = await response.text();
  } catch {
    return { ok: false, reason: "network" };
  }
  const { name, description } = readSkillFrontmatter(markdown);
  return { ok: true, name: name ?? defaultName(parsed), description: description ?? "" };
}
