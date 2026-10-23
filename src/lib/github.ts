// What the Module knows of GitHub: which URLs are those of a skill or a folder of skills, the key that tells two of them
// are the same place, the name and the description a `SKILL.md` holds in its frontmatter, and the discovery of the
// skills under a URL (raw.githubusercontent.com for the files, api.github.com to list a folder). Merging what is found
// into the sets is the work of skills.ts.

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
  /** Whether the URL names the `SKILL.md` itself rather than a folder: then it can only be that one skill. */
  namesFile: boolean;
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
    if (segments.length === 2) return build(owner, repo, "HEAD", [], false);
    if (!ref) return null;
    if (kind === "tree") return build(owner, repo, ref, rest, false);
    if (kind === "blob" && rest.at(-1) === FILE) return build(owner, repo, ref, rest.slice(0, -1), true);
    return null;
  }
  if (url.hostname === RAW_HOST) {
    // Here the third segment is the ref, so the rest starts one segment earlier.
    const [, , branch, ...path] = segments;
    if (!branch || path.at(-1) !== FILE) return null;
    return build(owner, repo, branch, path.slice(0, -1), true);
  }
  return null;
}

function build(owner: string, repo: string, ref: string, segments: string[], namesFile: boolean): ParsedSkillUrl {
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
    namesFile,
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

/** Why GitHub gave nothing: the place is not there, the API refuses for a while, or anything else on the way. */
export type GitHubFailure = "not_found" | "rate_limited" | "network";

export type FetchedSkill = { ok: true; name: string; description: string } | { ok: false; reason: Exclude<GitHubFailure, "rate_limited"> };

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
  | { kind: "error"; reason: GitHubFailure };

/** The skills a discovery found, in their order; none when it is empty or failed. */
export function skillsOf(discovery: Discovery): DiscoveredSkill[] {
  if (discovery.kind === "set") return discovery.skills;
  return discovery.kind === "single" ? [discovery.skill] : [];
}

/** How many `SKILL.md` are requested at once when the folders of a set are read. */
const MAX_IN_FLIGHT = 6;

/**
 * What a GitHub URL holds. A folder with a `SKILL.md` is a single skill and its subfolders are not looked at; the URL of a
 * `SKILL.md` that is not there is not found, and its folder is not listed. Otherwise
 * the folder is listed and each of its subfolders with a `SKILL.md` is a skill of a set, in the order of the listing, one
 * level only; the subfolders with none are ignored, and no skill at all is empty. A listing that is not found, that the
 * rate limit refuses, or any failure on the way is an error and nothing is kept.
 */
export async function discoverSkills(parsed: ParsedSkillUrl, fetchFn: typeof fetch = fetch): Promise<Discovery> {
  const own = await fetchSkill(parsed, fetchFn);
  if (own.ok) return { kind: "single", skill: { name: own.name, description: own.description, sourceUrl: parsed.sourceUrl } };
  if (own.reason === "network" || parsed.namesFile) return { kind: "error", reason: own.reason };

  const listing = await listFolders(parsed, fetchFn);
  if ("reason" in listing) return { kind: "error", reason: listing.reason };

  const children = listing.folders.map((folder) => build(parsed.owner, parsed.repo, parsed.ref, [...(parsed.path ? parsed.path.split("/") : []), folder], false));
  const fetched = await mapLimited(children, MAX_IN_FLIGHT, (child) => fetchSkill(child, fetchFn));
  const skills: DiscoveredSkill[] = [];
  for (const [index, result] of fetched.entries()) {
    if (result.ok) skills.push({ name: result.name, description: result.description, sourceUrl: children[index].sourceUrl });
    else if (result.reason === "network") return { kind: "error", reason: "network" };
  }
  return skills.length > 0 ? { kind: "set", skills } : { kind: "empty" };
}

/** The names of the subfolders of the folder, in the order GitHub lists them; why not, when it cannot be listed. */
async function listFolders(parsed: ParsedSkillUrl, fetchFn: typeof fetch): Promise<{ folders: string[] } | { reason: GitHubFailure }> {
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
