// The blog post of an edition: the Markdown of a post of the craftskillz blog, with its frontmatter, its radar and its cards.
// It is a pure function of the frozen edition, which already carries the change of each skill, so it is always the same.

import type { SkillChanges } from "./changes.ts";
import type { Edition, EditionEntry, EditionSkill } from "./editions.ts";
import { numberEntries, renderRadar, stars, type RadarLabels } from "./radar.ts";
import { RINGS, type Ring } from "./skills.ts";

/** The words of the post, which is written in French; the cover speaks the same. */
const FRENCH_RINGS: Record<Ring, string> = { recommended: "Recommandé", try: "À essayer", watch: "À surveiller", deprecated: "Déconseillé" };
export const POST_RADAR_LABELS: RadarLabels = {
  title: "Radar des skills",
  rings: FRENCH_RINGS,
  unchanged: "Inchangé ou mis à jour",
  new: "Nouveau ou de retour",
  up: "Rapproché du centre",
  down: "Éloigné du centre",
  notEvaluated: "pas encore évaluée",
};
const FOOTNOTE = "Inspiré du Technology Radar de Thoughtworks.";
const AUTHOR_PICTURE = "/assets/blog/authors/yma_logo.png";
/** The level of the highest heading of the notes of a set: one under its own. */
const SET_NOTES_LEVEL = 4;
/** The level of the highest heading of the notes of a skill: one under its own. */
const SKILL_NOTES_LEVEL = 5;

/** A Markdown ATX heading: its marks, then its text with the space before it. */
const ATX_HEADING = /^ {0,3}(#{1,6})([ \t].*)?$/;

/** The name of the post, and of the folder of its images. */
export const postSlug = (number: number) => `skills-radar-edition-${number}`;

type Numbered = EditionEntry & { number: number };

/** The Markdown of the post of the edition, with its frontmatter. */
export function renderPost(edition: Edition): string {
  const slug = postSlug(edition.number);
  const cover = `/assets/blog/${slug}/cover.png`;
  const entries = numberEntries(edition.entries);
  const moved = entries.filter((entry) => entry.change === "new" || entry.change === "back" || entry.change === "moved");
  const rest = entries.filter((entry) => entry.change === "unchanged" || entry.change === "updated");

  const frontmatter = [
    "---",
    `title: ${yamlString(`Skills Radar — Édition ${edition.number}`)}`,
    `excerpt: ${yamlString(plainText(firstParagraph(edition.intro)))}`,
    `coverImage: ${yamlString(cover)}`,
    `date: ${yamlString(edition.publishedAt)}`,
    "author:",
    `  picture: ${yamlString(AUTHOR_PICTURE)}`,
    "ogImage:",
    `  url: ${yamlString(cover)}`,
    "---",
  ].join("\n");

  const sections = [edition.intro.trim(), renderRadar(edition.entries, edition.topics, { labels: POST_RADAR_LABELS })];
  if (entries.length > 0) sections.push(entries.map((entry) => `${entry.number}. ${markdownText(entry.name)} — ${FRENCH_RINGS[entry.ring]}${legendTopics(entry, edition.topics)} (${skillCount(entry)})`).join("\n"));
  if (moved.length > 0) sections.push("## Ce qui bouge", ...byRing(moved, (group) => card(group, edition.topics)));
  if (rest.length > 0) sections.push("## Le reste du radar", ...byRing(rest, compactList));
  if (edition.retired.length > 0) {
    sections.push("## Retirés du radar", edition.retired.map((skill) => `- ${markdownText(skill.name)} — ${FRENCH_RINGS[skill.previousRing]}`).join("\n"));
  }
  sections.push(`*${FOOTNOTE}*`);
  return `${frontmatter}\n\n${sections.join("\n\n")}\n`;
}

/** The entries by ring, from the centre outwards, each group under the name of its ring; rings with no entry are left out. */
function byRing(entries: readonly Numbered[], render: (entries: Numbered[]) => string): string[] {
  return RINGS.flatMap((ring) => {
    const group = entries.filter((entry) => entry.ring === ring);
    return group.length > 0 ? [`**${FRENCH_RINGS[ring]}**`, render(group)] : [];
  });
}

/** The full card of each set: its heading, its badge, why it moved, what it is, where it comes from, its notes and its skills. */
function card(entries: Numbered[], topics: readonly string[]): string {
  return entries
    .map((entry) => {
      const parts = [`### ${entry.number}. ${markdownText(entry.name)}`, `*${badge(entry)}*`];
      if (entry.moveReason) parts.push(entry.moveReason);
      if (entry.description.trim()) parts.push(entry.description.trim());
      if (entry.sourceUrl) parts.push(`[${markdownText(entry.sourceUrl)}](${destination(entry.sourceUrl)})`);
      if (entry.notes.trim()) parts.push(shiftNoteHeadings(entry.notes.trim(), SET_NOTES_LEVEL));
      if (entry.change === "moved" && entry.skillChanges) parts.push(changeParts(entry.skillChanges).map((part) => `- ${part}`).join("\n"));
      if (entry.skills.length > 0) parts.push(skillTable(entry.skills, topics));
      for (const skill of entry.skills) {
        if (hasContent(skill.notes)) parts.push(`#### ${markdownText(skill.name)}`, shiftNoteHeadings(skill.notes.trim(), SKILL_NOTES_LEVEL));
      }
      return parts.join("\n\n");
    })
    .join("\n\n");
}

/** The table of the skills of a set: sorted by topic (stable), their name, linked when they have a source, their topic, their stars or that they are not rated yet, and their description. */
function skillTable(skills: readonly EditionSkill[], topics: readonly string[]): string {
  const rows = [...skills].sort((a, b) => a.topic - b.topic).map((skill) => {
    const name = cell(skill.name);
    const description = cell(skill.description).trim();
    return `| ${skill.sourceUrl ? `[${name}](${destination(skill.sourceUrl)})` : name} | ${cell(topicName(topics, skill.topic))} | ${rating(skill.score)} |${description ? ` ${description} ` : " "}|`;
  });
  return ["| Skill | Thème | Note | Description |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

/** A line per set: its number, its name, linked when it has a source, its number of skills, and whether it was updated. */
function compactList(entries: Numbered[]): string {
  return entries
    .map((entry) => {
      const name = markdownText(entry.name);
      const title = entry.sourceUrl ? `[${name}](${destination(entry.sourceUrl)})` : name;
      return `- **${entry.number}.** ${title} (${skillCount(entry)})${entry.change === "updated" ? ` — *mis à jour*${entry.skillChanges ? ` : ${changeParts(entry.skillChanges).join(" ; ")}` : ""}` : ""}`;
    })
    .join("\n");
}

/** The name of the topic of a skill; the last name when the topic is out of range. */
const topicName = (topics: readonly string[], topic: number) => topics[topic] ?? topics[topics.length - 1] ?? "";

/** The topics of the skills of a set for its legend line: " · " then the distinct names, in the order of the topics; nothing for a set with no skill. */
function legendTopics(entry: EditionEntry, topics: readonly string[]): string {
  const names = [...new Set(entry.skills.map((skill) => skill.topic))].sort((a, b) => a - b).map((topic) => markdownText(topicName(topics, topic)));
  return names.length > 0 ? ` · ${[...new Set(names)].join(", ")}` : "";
}

/** How many skills a set holds, as the post says it. */
const skillCount = (entry: EditionEntry) => `${entry.skills.length} skill${entry.skills.length === 1 ? "" : "s"}`;

/** What changed among the skills of a set, a part per kind of change, none for a kind with nothing in it. */
function changeParts({ added, removed, scores }: SkillChanges): string[] {
  const names = (skills: { name: string }[]) => skills.map((skill) => markdownText(skill.name)).join(", ");
  const parts: string[] = [];
  if (added.length > 0) parts.push(`Ajoutées : ${names(added)}`);
  if (removed.length > 0) parts.push(`Retirées : ${names(removed)}`);
  if (scores.length > 0) parts.push(`Notes : ${scores.map((score) => `${markdownText(score.name)} ${rating(score.before)} → ${rating(score.after)}`).join(", ")}`);
  return parts;
}

/** A score as five stars, or that the skill is not rated yet. */
const rating = (score: number | undefined) => (score === undefined ? "*Pas encore évaluée*" : stars(score));

/** What changed, as the card shows it. */
function badge(entry: Numbered): string {
  if (entry.change === "new") return "Nouveau";
  if (entry.change === "back") return "De retour";
  return `Déplacé : ${entry.previousRing ? FRENCH_RINGS[entry.previousRing] : "?"} → ${FRENCH_RINGS[entry.ring]}`;
}

/**
 * The notes with their headings (ATX, outside the fenced code) lowered, or raised, so that the highest is at `top`; none goes
 * under `######`. The rest of the notes is left as it is.
 */
function shiftNoteHeadings(notes: string, top: number): string {
  const lines = notes.split("\n");
  const headings = new Map<number, { level: number; rest: string }>();
  let fence: { char: string; size: number } | null = null;
  lines.forEach((line, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.size && /^ {0,3}[`~]+\s*$/.test(line)) fence = null;
      return;
    }
    if (marker) {
      fence = { char: marker[0], size: marker.length };
      return;
    }
    const heading = ATX_HEADING.exec(line);
    if (heading) headings.set(index, { level: heading[1].length, rest: heading[2] ?? "" });
  });
  if (headings.size === 0) return notes;
  const shift = top - Math.min(...[...headings.values()].map((heading) => heading.level));
  for (const [index, { level, rest }] of headings) lines[index] = `${"#".repeat(Math.min(6, level + shift))}${rest}`;
  return lines.join("\n");
}

/** Whether notes say something: they hold more than ATX headings and blank lines, which is all the template of a new skill holds. */
const hasContent = (notes: string) => notes.split("\n").some((line) => line.trim() && !ATX_HEADING.test(line));

/** The first paragraph of a Markdown text: up to its first blank line. */
const firstParagraph = (markdown: string) => markdown.trim().split(/\n[ \t]*\n/)[0];

/** The text of a Markdown paragraph without its marks: HTML tags, headings, emphasis, links, images and code; its lines joined by spaces. */
function plainText(paragraph: string): string {
  return paragraph
    .split("\n")
    .map((line) => line.trim().replace(/^#{1,6}\s+/, ""))
    .join(" ")
    .replace(/<[^>]*>/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/\*\*|__|\*|~~/g, "")
    .replace(/\b_+|_+\b/g, "")
    .trim();
}

/** A YAML scalar in double quotes, so that it is read back exactly. */
function yamlString(value: string): string {
  const escaped = value.replace(/[\\"\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (char) => {
    if (char === "\\" || char === '"') return `\\${char}`;
    if (char === "\n") return "\\n";
    if (char === "\r") return "\\r";
    if (char === "\t") return "\\t";
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
  return `"${escaped}"`;
}

/** Text written by the User, safe in a line of Markdown that may hold raw HTML: no tag, no emphasis, no link. */
const markdownText = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_[\]]/g, "\\$&");

/** Text written by the User, safe in a cell of a table: on one line, without the pipe that would end the cell. */
const cell = (value: string) => markdownText(value).replace(/\|/g, "\\|");

/** The destination of a link, without what would end it early. */
const destination = (url: string) => url.trim().replace(/[\s()<>]/g, (char) => encodeURIComponent(char).replace(/[()]/g, (paren) => (paren === "(" ? "%28" : "%29")));
