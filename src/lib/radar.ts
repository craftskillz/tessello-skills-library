// The radar of the skills, drawn as a standalone SVG from the model. The View shows it as it is, and the blog post and the
// cover use the same drawing. Where a dot sits comes from its id alone, so that it stays put from one edition to the next.

import { RINGS, type Ring } from "./skills.ts";

/** A skill on the radar. Its change decides its marker; an edition's entry has this shape, so it can be drawn as it is. */
export interface RadarEntry {
  id: string;
  name: string;
  /** 0 to 3. */
  quadrant: number;
  ring: Ring;
  change: "new" | "back" | "moved" | "updated" | "unchanged";
  /** The ring it left, for a moved skill: the marker points towards where it went. */
  previousRing?: Ring;
  /** The skills of the set, in order; each with its score from 1 to 5 when it was evaluated. */
  skills?: readonly { name: string; score?: number }[];
}

/** The words the radar writes, in the language of where it is shown. */
export interface RadarLabels {
  /** What the drawing is called, for its title and its label. */
  title: string;
  rings: Record<Ring, string>;
  /** The legend of the markers: a circle. */
  unchanged: string;
  /** A diamond. */
  new: string;
  /** A triangle up. */
  up: string;
  /** A triangle down. */
  down: string;
  /** What a skill without a score is said to be, in words: the radar puts them in parentheses. */
  notEvaluated: string;
}

export interface RadarOptions {
  labels: RadarLabels;
  /** A solid colour behind the radar, as the cover needs; none by default, so that the page shows through. */
  background?: string;
}

const WIDTH = 520;
const HEIGHT = 580;
const RADIUS = 230;
const CX = WIDTH / 2;
const CY = 40 + RADIUS;
/** Where each ring ends, as a share of the radius, from the centre: a wide centre, since many skills are recommended. */
const RING_ENDS = [0.38, 0.58, 0.8, 1] as const;
const DOT = 8;
/** The room a dot keeps from the axes and the ring boundaries, and from another dot. */
const EDGE = DOT + 2;
const APART = 2 * DOT + 2;
const ATTEMPTS = 100;
const FONT = `system-ui, -apple-system, "Segoe UI", sans-serif`;
/** One mid-tone per quadrant, readable under a white number and as text on a white page and on a near-black one. */
const COLOURS = ["#3b78e7", "#d9730d", "#1f9d55", "#9150e0"] as const;
/** A grey with about 4:1 of contrast on white and on near-black alike. */
const GREY = "#7a7a7a";
/** The stars of the highest score. */
const STARS = 5;

/** The entries in the order of their numbers: by quadrant, by ring from the centre, then by name; each with its number from 1. */
export function numberEntries<T extends RadarEntry>(entries: readonly T[]): (T & { number: number })[] {
  return [...entries]
    .sort(
      (a, b) =>
        a.quadrant - b.quadrant ||
        RINGS.indexOf(a.ring) - RINGS.indexOf(b.ring) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((entry, index) => ({ ...entry, number: index + 1 }));
}

/** The radar as a standalone SVG on one line. */
export function renderRadar(
  entries: readonly RadarEntry[],
  quadrants: readonly [string, string, string, string] | readonly string[],
  options: RadarOptions,
): string {
  const { labels, background } = options;
  const numbered = numberEntries(entries);
  const points = place(numbered);
  const parts: string[] = [];
  if (background) parts.push(`<rect width="100%" height="100%" fill="${escape(background)}"/>`);

  // The rings, outermost first, so that the fills add up towards the centre.
  for (let i = RING_ENDS.length - 1; i >= 0; i--) {
    parts.push(`<circle cx="${CX}" cy="${CY}" r="${round(RING_ENDS[i] * RADIUS)}" fill="${GREY}" fill-opacity="0.07" stroke="${GREY}" stroke-width="1"/>`);
  }
  // Three half-axes: the right one is left out, so that the names of the rings are not crossed by a line.
  parts.push(`<path d="M${CX} ${CY - RADIUS}V${CY + RADIUS}M${CX - RADIUS} ${CY}H${CX}" fill="none" stroke="${GREY}" stroke-width="1"/>`);
  RINGS.forEach((ring, i) => {
    const start = i === 0 ? 0 : RING_ENDS[i - 1];
    const middle = ((start + RING_ENDS[i]) / 2) * RADIUS;
    parts.push(`<text x="${round(CX + middle)}" y="${CY - 3}" font-size="9" text-anchor="middle" fill="${GREY}" font-family='${FONT}'>${escape(labels.rings[ring])}</text>`);
  });

  // The names of the quadrants at the corners: the top ones above the circle, the bottom ones below it.
  for (let q = 0; q < 4; q++) {
    const right = q % 2 === 1;
    const x = right ? WIDTH - 10 : 10;
    const y = q < 2 ? 24 : CY + RADIUS + 24;
    parts.push(fitted(String(quadrants[q] ?? ""), { x, y, size: 14, room: WIDTH / 2 - 18, anchor: right ? "end" : "start", fill: COLOURS[q], bold: true }));
  }

  for (const entry of numbered) {
    const { x, y } = points.get(entry.id)!;
    const colour = COLOURS[entry.quadrant] ?? COLOURS[0];
    const title = escape(tooltip(entry, entry.number, labels));
    parts.push(
      `<g data-set-id="${escape(entry.id)}" data-number="${entry.number}" transform="translate(${round(x)} ${round(y)})">` +
        marker(entry, colour) +
        `<text y="0.35em" font-size="10" font-weight="bold" text-anchor="middle" fill="#ffffff" font-family='${FONT}'>${entry.number}</text>` +
        `<title>${title}</title></g>`,
    );
  }

  parts.push(legend(labels));
  const label = escape(`${labels.title}: ${quadrants.join(", ")}`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">` +
    `<title>${label}</title>${parts.join("")}</svg>`
  );
}

/** What a dot says when hovered: its number, its name and its ring, then a line per skill with its stars. */
function tooltip(entry: RadarEntry, number: number, labels: RadarLabels): string {
  const lines = [`${number}. ${entry.name} — ${labels.rings[entry.ring]}`];
  for (const skill of entry.skills ?? []) lines.push(`${skill.name} ${skill.score === undefined ? `(${labels.notEvaluated})` : stars(skill.score)}`);
  return lines.join("\n");
}

/** The score as five stars, filled then empty. */
export function stars(score: number): string {
  const filled = Math.min(STARS, Math.max(0, Math.round(score)));
  return "★".repeat(filled) + "☆".repeat(STARS - filled);
}

function marker(entry: RadarEntry, colour: string): string {
  const fill = `fill="${colour}"`;
  if (entry.change === "new" || entry.change === "back") return `<polygon data-marker="diamond" points="${diamond(DOT * 1.2)}" ${fill}/>`;
  if (entry.change === "moved" && entry.previousRing) {
    const up = RINGS.indexOf(entry.ring) < RINGS.indexOf(entry.previousRing);
    return `<polygon data-marker="${up ? "up" : "down"}" points="${triangle(DOT * 1.25, up)}" ${fill}/>`;
  }
  return `<circle r="${DOT}" ${fill}/>`;
}

const diamond = (r: number) => `0,${-r} ${r},0 0,${r} ${-r},0`;
const triangle = (r: number, up: boolean) => {
  const tip = up ? -r : r;
  const base = up ? r * 0.7 : -r * 0.7;
  return `0,${round(tip)} ${round(r)},${round(base)} ${round(-r)},${round(base)}`;
};

/** The legend of the markers, in a row under the radar. */
function legend(labels: RadarLabels): string {
  const size = 10;
  const items = [
    { text: labels.unchanged, shape: `<circle r="5" fill="${GREY}"/>` },
    { text: labels.new, shape: `<polygon points="${diamond(6)}" fill="${GREY}"/>` },
    { text: labels.up, shape: `<polygon points="${triangle(6, true)}" fill="${GREY}"/>` },
    { text: labels.down, shape: `<polygon points="${triangle(6, false)}" fill="${GREY}"/>` },
  ];
  const y = CY + RADIUS + 58;
  const slot = (WIDTH - 20) / items.length;
  return items
    .map(
      (item, i) =>
        `<g transform="translate(${round(10 + i * slot + 6)} ${y})">${item.shape}` +
        fitted(item.text, { x: 14, y: 3.5, size, room: slot - 24, anchor: "start", fill: GREY, bold: false }) +
        `</g>`,
    )
    .join("");
}

interface TextSpec {
  x: number;
  y: number;
  size: number;
  /** The width the text may take. */
  room: number;
  anchor: "start" | "end";
  fill: string;
  bold: boolean;
}

/** A text that is squeezed to its room when its estimated width (characters × 0.6 × size) is more than that. */
function fitted(text: string, spec: TextSpec): string {
  const wide = text.length * 0.6 * spec.size > spec.room;
  const squeeze = wide ? ` textLength="${round(spec.room)}" lengthAdjust="spacingAndGlyphs"` : "";
  const weight = spec.bold ? ` font-weight="bold"` : "";
  return `<text x="${round(spec.x)}" y="${spec.y}" font-size="${spec.size}"${weight} text-anchor="${spec.anchor}" fill="${spec.fill}" font-family='${FONT}'${squeeze}>${escape(text)}</text>`;
}

interface Point {
  x: number;
  y: number;
}

/**
 * The centre of each dot by id. A dot draws its candidates from a stream seeded by its id, inside its quadrant and ring;
 * the first one clear of the axes and the ring boundaries is its own place. The dots are placed in the order of their
 * numbers: when a place is too close to a dot already placed it takes the next candidate, and when none is free it takes
 * the one farthest from the others. So an id keeps its place whatever the other cells hold.
 */
function place(entries: readonly RadarEntry[]): Map<string, Point> {
  const placed = new Map<string, Point>();
  const taken: Point[] = [];
  for (const entry of entries) {
    const candidates = candidatesOf(entry);
    // A crowded cell comes down to dots that merely touch (2 × DOT) before a dot is laid on another.
    const clear = (apart: number) => (candidate: Point) => taken.every((other) => distance(candidate, other) >= apart);
    const cell = scan(entry);
    const best = candidates.find(clear(APART)) ?? cell.find(clear(APART)) ?? cell.find(clear(2 * DOT)) ?? farthest(candidates, taken);
    placed.set(entry.id, best);
    taken.push(best);
  }
  return placed;
}

/** The bounds of the cell of an entry: the radii a dot may sit between, and the angle where its quadrant starts. */
function cellOf(entry: RadarEntry) {
  const ring = Math.max(0, RINGS.indexOf(entry.ring));
  const inner = ring === 0 ? 0 : RING_ENDS[ring - 1] * RADIUS + EDGE;
  const outer = RING_ENDS[ring] * RADIUS - EDGE;
  const quadrant = Math.min(3, Math.max(0, Math.trunc(entry.quadrant) || 0));
  // The angle where the quadrant starts, going clockwise on screen (y down).
  const start = [Math.PI, Math.PI * 1.5, Math.PI * 0.5, 0][quadrant];
  return { inner, outer, start };
}

const clearOfAxes = (point: Point) => Math.abs(point.x - CX) >= EDGE && Math.abs(point.y - CY) >= EDGE;

/** Every place of the cell on a fine grid, from the outside in: the last resort of a crowded cell, still deterministic. */
function scan(entry: RadarEntry): Point[] {
  const { inner, outer, start } = cellOf(entry);
  const found: Point[] = [];
  for (let radius = outer; radius >= inner && radius > 0; radius -= 3) {
    const steps = Math.ceil((radius * (Math.PI / 2)) / 3);
    for (let i = 0; i <= steps; i++) {
      const angle = start + (i / steps) * (Math.PI / 2);
      const point = { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
      if (clearOfAxes(point)) found.push(point);
    }
  }
  return found;
}

/** The valid candidates of a dot, in the order of its stream. */
function candidatesOf(entry: RadarEntry): Point[] {
  const random = mulberry32(fnv1a(entry.id));
  const { inner, outer, start } = cellOf(entry);
  const found: Point[] = [];
  for (let attempt = 0; attempt < ATTEMPTS * 10 && found.length < ATTEMPTS; attempt++) {
    const angle = start + random() * (Math.PI / 2);
    const radius = Math.sqrt(inner * inner + random() * (outer * outer - inner * inner));
    const point = { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
    if (clearOfAxes(point)) found.push(point);
  }
  // A cell too thin for any dot still gets one, in the middle of its band, rather than none.
  if (found.length === 0) {
    const radius = (inner + outer) / 2;
    const angle = start + Math.PI / 4;
    found.push({ x: CX + Math.abs(radius) * Math.cos(angle), y: CY + Math.abs(radius) * Math.sin(angle) });
  }
  return found;
}

function farthest(candidates: readonly Point[], taken: readonly Point[]): Point {
  let best = candidates[0];
  let room = -1;
  for (const candidate of candidates) {
    const nearest = Math.min(Infinity, ...taken.map((other) => distance(candidate, other)));
    if (nearest > room) {
      room = nearest;
      best = candidate;
    }
  }
  return best;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (value: number) => Math.round(value * 10) / 10;

/** FNV-1a, 32 bits. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** A small seeded generator of numbers from 0 up to 1. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A text of the User for XML, on one line. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r\n|\r|\n/g, "&#10;");
}
