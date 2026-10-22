// The blog post of an edition: the Markdown of a post of the craftskillz blog, with its frontmatter, its radar and its cards.
// It is a pure function of the frozen edition, which already carries the change of each skill, so it is always the same.

import type { Edition, EditionEntry } from "./editions.ts";
import { numberEntries, renderRadar, type RadarLabels } from "./radar.ts";
import { RINGS, type Ring } from "./skills.ts";

/** The words of the post, which is written in French; the cover speaks the same. */
const FRENCH_RINGS: Record<Ring, string> = { recommended: "Recommandé", try: "À essayer", watch: "À surveiller", deprecated: "Déconseillé" };
export const POST_RADAR_LABELS: RadarLabels = {
  title: "Radar des skills",
  rings: FRENCH_RINGS,
  unchanged: "Inchangée ou mise à jour",
  new: "Nouvelle ou de retour",
  up: "Rapprochée du centre",
  down: "Éloignée du centre",
};
const FOOTNOTE = "Inspiré du Technology Radar de Thoughtworks.";
const AUTHOR_PICTURE = "/assets/blog/authors/yma_logo.png";
/** The level of the highest heading of the notes: one under the skill's own. */
const NOTES_LEVEL = 4;
const STARS = 5;

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

  const sections = [edition.intro.trim(), renderRadar(edition.entries, edition.quadrants, { labels: POST_RADAR_LABELS })];
  if (entries.length > 0) sections.push(entries.map((entry) => `${entry.number}. ${markdownText(entry.name)} — ${FRENCH_RINGS[entry.ring]}`).join("\n"));
  if (moved.length > 0) sections.push("## Ce qui bouge", ...byRing(moved, card));
  if (rest.length > 0) sections.push("## Le reste du radar", ...byRing(rest, compactList));
  if (edition.retired.length > 0) {
    sections.push("## Retirées du radar", edition.retired.map((skill) => `- ${markdownText(skill.name)} — ${FRENCH_RINGS[skill.previousRing]}`).join("\n"));
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

/** The full card of each skill: its heading, its badge, why it moved, what it is, where it comes from and its notes. */
function card(entries: Numbered[]): string {
  return entries
    .map((entry) => {
      const parts = [`### ${entry.number}. ${markdownText(entry.name)} ${stars(entry.score)}`, `*${badge(entry)}*`];
      if (entry.moveReason) parts.push(entry.moveReason);
      if (entry.description.trim()) parts.push(entry.description.trim());
      if (entry.sourceUrl) parts.push(`[${markdownText(entry.sourceUrl)}](${destination(entry.sourceUrl)})`);
      if (entry.notes.trim()) parts.push(shiftNoteHeadings(entry.notes.trim()));
      return parts.join("\n\n");
    })
    .join("\n\n");
}

/** A line per skill: its number, its name, linked when it has a source, its stars, and whether it was updated. */
function compactList(entries: Numbered[]): string {
  return entries
    .map((entry) => {
      const name = markdownText(entry.name);
      const title = entry.sourceUrl ? `[${name}](${destination(entry.sourceUrl)})` : name;
      return `- **${entry.number}.** ${title} ${stars(entry.score)}${entry.change === "updated" ? " — *mise à jour*" : ""}`;
    })
    .join("\n");
}

/** What changed, as the card shows it. */
function badge(entry: Numbered): string {
  if (entry.change === "new") return "Nouveau";
  if (entry.change === "back") return "De retour";
  return `Déplacé : ${entry.previousRing ? FRENCH_RINGS[entry.previousRing] : "?"} → ${FRENCH_RINGS[entry.ring]}`;
}

/** The score as five stars, filled then empty. */
const stars = (score: number) => {
  const filled = Math.min(STARS, Math.max(0, Math.round(score)));
  return "★".repeat(filled) + "☆".repeat(STARS - filled);
};

/**
 * The notes with their headings (ATX, outside the fenced code) lowered, or raised, so that the highest is `####`; none goes
 * under `######`. The rest of the notes is left as it is.
 */
function shiftNoteHeadings(notes: string): string {
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
    const heading = /^ {0,3}(#{1,6})([ \t].*)?$/.exec(line);
    if (heading) headings.set(index, { level: heading[1].length, rest: heading[2] ?? "" });
  });
  if (headings.size === 0) return notes;
  const shift = NOTES_LEVEL - Math.min(...[...headings.values()].map((heading) => heading.level));
  for (const [index, { level, rest }] of headings) lines[index] = `${"#".repeat(Math.min(6, level + shift))}${rest}`;
  return lines.join("\n");
}

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

/** The destination of a link, without what would end it early. */
const destination = (url: string) => url.trim().replace(/[\s()<>]/g, (char) => encodeURIComponent(char).replace(/[()]/g, (paren) => (paren === "(" ? "%28" : "%29")));
