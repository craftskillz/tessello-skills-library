// What the Module knows of GitHub: which URLs are those of a skill (a folder with a `SKILL.md`), the URLs it builds from
// them, and the reading of the name and the description a `SKILL.md` holds in its frontmatter.

import { addSet, addSkillToSet, editSet, type Draft, type Ring, type SetEdit, type SkillSet } from "./skills.ts";

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

/** The set, archived or not, that comes from the same place as `url`; none when `url` has no key. */
export function findDuplicate(sets: readonly SkillSet[], url: string | undefined): SkillSet | undefined {
  const key = duplicateKey(url);
  return key === null ? undefined : sets.find((set) => duplicateKey(set.sourceUrl) === key);
}

/**
 * `addSet`, but nothing is added when a set, archived or not, comes from the same place as the url of the draft: the
 * answer is then that set.
 */
export function addUnlessDuplicate(
  sets: readonly SkillSet[],
  draft: Draft,
  now: Date,
  id: string,
): { sets: SkillSet[]; set: SkillSet } | { duplicate: SkillSet } | null {
  if (!draft.name.trim()) return null;
  const duplicate = findDuplicate(sets, draft.url);
  return duplicate ? { duplicate } : addSet(sets, draft, now, id);
}

/**
 * `editSet`, but nothing is saved when the edit gives a url that another set, archived or not, already has: the answer
 * is then that set. A set is never a duplicate of itself.
 */
export function editUnlessDuplicate(
  sets: readonly SkillSet[],
  id: string,
  edit: SetEdit,
  now: Date,
  publishedRing?: Ring,
): ReturnType<typeof editSet> | { duplicate: SkillSet } {
  if (!sets.some((set) => set.id === id)) return null;
  const duplicate = edit.sourceUrl === undefined ? undefined : findDuplicate(sets.filter((set) => set.id !== id), edit.sourceUrl);
  return duplicate ? { duplicate } : editSet(sets, id, edit, now, publishedRing);
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

/** A skill found under a GitHub URL: what its SKILL.md says, and the folder it is in on github.com. */
export interface DiscoveredSkill {
  name: string;
  description: string;
  sourceUrl: string;
}

export type Discovery =
  | { kind: "set"; skills: DiscoveredSkill[] }
  | { kind: "single"; skill: DiscoveredSkill }
  | { kind: "empty" }
  | { kind: "error"; reason: "not_found" | "rate_limited" | "network" };

/** How many `SKILL.md` are requested at once when the folders of a set are read. */
const MAX_IN_FLIGHT = 6;

/**
 * What a GitHub URL holds. A folder with a `SKILL.md` is a single skill and its subfolders are not looked at. Otherwise
 * the folder is listed and each of its subfolders with a `SKILL.md` is a skill of a set, in the order of the listing, one
 * level only; the subfolders with none are ignored, and no skill at all is empty. A listing that is not found, that the
 * rate limit refuses, or any failure on the way is an error and nothing is kept.
 */
export async function discoverSkills(parsed: ParsedSkillUrl, fetchFn: typeof fetch = fetch): Promise<Discovery> {
  const own = await fetchSkill(parsed, fetchFn);
  if (own.ok) return { kind: "single", skill: { name: own.name, description: own.description, sourceUrl: parsed.sourceUrl } };
  if (own.reason === "network") return { kind: "error", reason: "network" };

  const listing = await listFolders(parsed, fetchFn);
  if ("reason" in listing) return { kind: "error", reason: listing.reason };

  const children = listing.folders.map((folder) => build(parsed.owner, parsed.repo, parsed.ref, [...(parsed.path ? parsed.path.split("/") : []), folder]));
  const fetched = await mapLimited(children, MAX_IN_FLIGHT, (child) => fetchSkill(child, fetchFn));
  const skills: DiscoveredSkill[] = [];
  for (const [index, result] of fetched.entries()) {
    if (result.ok) skills.push({ name: result.name, description: result.description, sourceUrl: children[index].sourceUrl });
    else if (result.reason === "network") return { kind: "error", reason: "network" };
  }
  return skills.length > 0 ? { kind: "set", skills } : { kind: "empty" };
}

/** The names of the subfolders of the folder, in the order GitHub lists them; why not, when it cannot be listed. */
async function listFolders(parsed: ParsedSkillUrl, fetchFn: typeof fetch): Promise<{ folders: string[] } | { reason: "not_found" | "rate_limited" | "network" }> {
  const query = parsed.ref === "HEAD" ? "" : `?ref=${encodeURIComponent(parsed.ref)}`;
  const folder = parsed.path ? `/${parsed.path}` : "";
  try {
    const response = await fetchFn(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents${folder}${query}`);
    if (response.status === 404) return { reason: "not_found" };
    if (response.status === 403 || response.status === 429) return { reason: "rate_limited" };
    if (!response.ok) return { reason: "network" };
    const entries: unknown = await response.json();
    if (!Array.isArray(entries)) return { reason: "network" };
    const folders = entries.flatMap((entry) => (entry?.type === "dir" && typeof entry.name === "string" ? [entry.name as string] : []));
    return { folders };
  } catch {
    return { reason: "network" };
  }
}

/** `map` with at most `limit` calls running at once; the results are in the order of the items. */
async function mapLimited<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Adds a set named `draft.name`, whose url is `draft.url`, holding `skills` in their order; each is added as
 * `addSkillToSet` does (not evaluated, the template as its notes, its folder as its url), and a skill whose url an earlier
 * one has is left out. Null when the name is blank or there is no skill; the set, archived or not, that has the same url
 * is the answer when there is one, and nothing is added then.
 */
export function importSet(
  sets: readonly SkillSet[],
  draft: { name: string; url: string },
  skills: readonly DiscoveredSkill[],
  now: Date,
  newId: () => string,
): { sets: SkillSet[]; set: SkillSet } | { duplicate: SkillSet } | null {
  if (skills.length === 0) return null;
  const added = addUnlessDuplicate(sets, draft, now, newId());
  if (!added || "duplicate" in added) return added;
  let result = added;
  for (const skill of skills) {
    const withSkill = addSkillToSet(result.sets, result.set.id, { name: skill.name, url: skill.sourceUrl, description: skill.description }, now, newId());
    if (withSkill && !("error" in withSkill)) result = withSkill;
  }
  return result;
}

/**
 * The set `setId` against the skills found again under its url. A skill found that no skill of the set has (by url) is
 * added at the end as `addSkillToSet` does. A skill of the set whose url is in the folder of the set and is not found any
 * more is marked `goneUpstream` and kept as it is; one found again loses the mark. A skill with no url, or from outside
 * the folder of the set, is never marked, and the names, descriptions, scores and notes are never touched. `added` counts
 * the skills added, `gone` those newly marked (not the ones that already were). Nothing to change gives the same sets back.
 * Null when there is no such set.
 */
export function refreshSet(
  sets: readonly SkillSet[],
  setId: string,
  found: readonly DiscoveredSkill[],
  now: Date,
  newId: () => string,
): { sets: SkillSet[]; set: SkillSet; added: number; gone: number } | null {
  const current = sets.find((set) => set.id === setId);
  if (!current) return null;
  const foundKeys = new Set(found.map((skill) => duplicateKey(skill.sourceUrl)));
  const folder = duplicateKey(current.sourceUrl);
  let gone = 0;
  const skills = current.skills.map((skill) => {
    const key = duplicateKey(skill.sourceUrl);
    if (key === null || folder === null || !key.startsWith(`${folder}/`)) return skill;
    const missing = !foundKeys.has(key);
    if (missing === (skill.goneUpstream === true)) return skill;
    if (missing) gone++;
    const { goneUpstream: _, ...rest } = skill;
    return missing ? { ...rest, goneUpstream: true } : rest;
  });
  const marked = gone > 0 || skills.some((skill, index) => skill !== current.skills[index]);
  const set = marked ? { ...current, skills, updatedAt: now.toISOString() } : current;
  let result = { sets: marked ? sets.map((item) => (item === current ? set : item)) : (sets as SkillSet[]), set };
  let added = 0;
  const have = new Set(current.skills.map((skill) => duplicateKey(skill.sourceUrl)));
  for (const skill of found) {
    // Not offered to `addSkillToSet` when the set has it, so that no id is spent on it.
    if (have.has(duplicateKey(skill.sourceUrl))) continue;
    const withSkill = addSkillToSet(result.sets, setId, { name: skill.name, url: skill.sourceUrl, description: skill.description }, now, newId());
    if (withSkill && !("error" in withSkill)) {
      result = withSkill;
      added++;
    }
  }
  return { ...result, added, gone };
}
