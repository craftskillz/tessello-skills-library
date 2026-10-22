import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { numberEntries, renderRadar, type RadarEntry, type RadarOptions } from "../src/lib/radar.ts";
import { RINGS, type Ring } from "../src/lib/skills.ts";

const entry = (id: string, rest: Partial<RadarEntry> = {}): RadarEntry => ({ id, name: `Skill ${id}`, quadrant: 0, ring: "watch", change: "unchanged", ...rest });

const QUADRANTS = ["Design & planning", "Code & tests", "Writing & docs", "Tooling & workflow"] as const;
const OPTIONS: RadarOptions = {
  labels: {
    title: "Skills radar",
    rings: { recommended: "Recommended", try: "Try", watch: "Watch", deprecated: "Deprecated" },
    unchanged: "Unchanged or updated",
    new: "New or back",
    up: "Moved towards recommended",
    down: "Moved towards deprecated",
  },
};

const render = (entries: RadarEntry[], options: RadarOptions = OPTIONS) => renderRadar(entries, QUADRANTS, options);

/** The centre of each dot, read back from the drawing. */
function positions(svg: string): Map<string, { x: number; y: number }> {
  const found = new Map<string, { x: number; y: number }>();
  for (const match of svg.matchAll(/<g data-set-id="([^"]*)" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)) {
    found.set(match[1], { x: Number(match[2]), y: Number(match[3]) });
  }
  return found;
}

/** The drawing of one dot: from its opening tag to its closing one. */
const dotOf = (svg: string, id: string) => svg.match(new RegExp(`<g data-set-id="${id}".*?</g>`))![0];

const CENTRE = { x: 260, y: 270 };
const RADIUS = 230;
const DOT = 8;
/** Where each ring ends, as a share of the radius. */
const RING_ENDS: Record<Ring, [number, number]> = { recommended: [0, 0.38], try: [0.38, 0.58], watch: [0.58, 0.8], deprecated: [0.8, 1] };

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function assertNoOverlap(svg: string) {
  const centres = [...positions(svg).entries()];
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      assert.ok(distance(centres[i][1], centres[j][1]) >= 2 * DOT, `${centres[i][0]} and ${centres[j][0]} overlap`);
    }
  }
}

test("the title and the label of the drawing are written in the language of the labels", () => {
  const svg = render([entry("a")], { labels: { ...OPTIONS.labels, title: "Radar des skills" } });
  assert.ok(svg.includes("<title>Radar des skills: Design &amp; planning, Code &amp; tests"));
  assert.ok(svg.includes('aria-label="Radar des skills: '));
});

describe("numbering the entries", () => {
  test("by quadrant, then by ring from the centre, then by name, each from 1", () => {
    const numbered = numberEntries([
      entry("a", { name: "Zeta", quadrant: 1, ring: "recommended" }),
      entry("b", { name: "Beta", quadrant: 0, ring: "deprecated" }),
      entry("c", { name: "Alpha", quadrant: 0, ring: "watch" }),
      entry("d", { name: "beta", quadrant: 0, ring: "watch" }),
      entry("e", { name: "Gamma", quadrant: 0, ring: "recommended" }),
    ]);
    assert.deepEqual(
      numbered.map((item) => [item.number, item.id]),
      [[1, "e"], [2, "c"], [3, "d"], [4, "b"], [5, "a"]],
    );
  });

  test("names are compared without regard to case or accents, and the id breaks a tie", () => {
    const numbered = numberEntries([entry("z", { name: "Été" }), entry("y", { name: "ete" }), entry("x", { name: "Eta" })]);
    assert.deepEqual(numbered.map((item) => item.id), ["x", "y", "z"]);
  });

  test("the entries given are not changed", () => {
    const entries = [entry("b", { name: "B" }), entry("a", { name: "A" })];
    numberEntries(entries);
    assert.deepEqual(entries.map((item) => item.id), ["b", "a"]);
    assert.equal("number" in entries[0], false);
  });
});

describe("positions of the dots", () => {
  test("the same id in the same quadrant and ring lands at the same place", () => {
    const first = positions(render([entry("skill-1")]));
    const again = positions(render([entry("skill-1")]));
    assert.deepEqual(first.get("skill-1"), again.get("skill-1"));
    assert.ok(first.get("skill-1"));
  });

  test("it stays where it was when skills of other quadrants and rings are added or removed", () => {
    const alone = positions(render([entry("skill-1", { quadrant: 2, ring: "try" })]));
    const crowded = positions(
      render([
        entry("skill-1", { quadrant: 2, ring: "try" }),
        entry("other-1", { quadrant: 2, ring: "recommended" }),
        entry("other-2", { quadrant: 1, ring: "try" }),
        entry("other-3", { quadrant: 3, ring: "deprecated" }),
      ]),
    );
    assert.deepEqual(crowded.get("skill-1"), alone.get("skill-1"));
  });

  test("two ids do not land at the same place", () => {
    const found = positions(render([entry("skill-1"), entry("skill-2")]));
    assert.notDeepEqual(found.get("skill-1"), found.get("skill-2"));
  });

  test("no two dots overlap, with ten skills in one recommended cell and twenty-five in one watch cell", () => {
    const entries = [
      ...Array.from({ length: 10 }, (_, i) => entry(`rec-${i}`, { quadrant: 1, ring: "recommended" })),
      ...Array.from({ length: 25 }, (_, i) => entry(`watch-${i}`, { quadrant: 3, ring: "watch" })),
    ];
    const svg = render(entries);
    assert.equal(positions(svg).size, 35);
    assertNoOverlap(svg);
  });

  test("every dot is inside its quadrant and its ring, clear of the axes and of the ring boundaries", () => {
    const entries: RadarEntry[] = [];
    for (let quadrant = 0; quadrant < 4; quadrant++) {
      for (const ring of RINGS) {
        for (let i = 0; i < 6; i++) entries.push(entry(`${quadrant}-${ring}-${i}`, { quadrant, ring }));
      }
    }
    const svg = render(entries);
    const found = positions(svg);
    assert.equal(found.size, entries.length);
    for (const item of entries) {
      const at = found.get(item.id)!;
      const dx = at.x - CENTRE.x;
      const dy = at.y - CENTRE.y;
      assert.equal(dx < 0 ? (dy < 0 ? 0 : 2) : dy < 0 ? 1 : 3, item.quadrant, `${item.id} quadrant`);
      assert.ok(Math.abs(dx) >= DOT && Math.abs(dy) >= DOT, `${item.id} touches an axis`);
      const [from, to] = RING_ENDS[item.ring];
      const radius = Math.hypot(dx, dy);
      assert.ok(radius <= to * RADIUS - DOT, `${item.id} reaches out of its ring`);
      if (from > 0) assert.ok(radius >= from * RADIUS + DOT, `${item.id} reaches into the ring inside`);
    }
  });
});

describe("markers", () => {
  const shape = (change: RadarEntry["change"], previousRing?: Ring, ring: Ring = "try") =>
    dotOf(render([entry("m", { change, ring, ...(previousRing ? { previousRing } : {}) })]), "m");

  test("a circle for an unchanged or updated skill", () => {
    for (const change of ["unchanged", "updated"] as const) assert.match(shape(change), /<circle /);
  });

  test("a diamond for a new or returned skill", () => {
    for (const change of ["new", "back"] as const) {
      assert.match(shape(change), /<polygon data-marker="diamond"/);
      assert.doesNotMatch(shape(change), /<circle /);
    }
  });

  test("a triangle up for a skill moved towards recommended, down for one moved towards deprecated", () => {
    assert.match(shape("moved", "watch", "try"), /<polygon data-marker="up"/);
    assert.match(shape("moved", "try", "watch"), /<polygon data-marker="down"/);
  });

  test("a moved skill whose previous ring is unknown is drawn as a circle", () => {
    assert.match(shape("moved"), /<circle /);
  });

  test("a dot has its number and a title with its number and name", () => {
    const svg = render([entry("a", { name: "Alpha", quadrant: 0 }), entry("b", { name: "Beta", quadrant: 0 })]);
    assert.match(dotOf(svg, "b"), /<title>2\. Beta<\/title>/);
    assert.match(dotOf(svg, "b"), />2<\/text>/);
  });
});

describe("the drawing", () => {
  test("it is one line, with no newline at all", () => {
    const svg = render([entry("a", { name: "Two\nlines\r\nname" }), entry("b")]);
    assert.equal(svg.includes("\n"), false);
    assert.equal(svg.includes("\r"), false);
    assert.match(svg, /Two&#10;lines&#10;name/);
  });

  test("it is standalone: sized, namespaced, without stylesheet or external reference", () => {
    const svg = render([entry("a")]);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
    assert.match(svg, / role="img"/);
    assert.match(svg, / aria-label="[^"]+"/);
    const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    assert.ok(svg.includes(`width="${width}" height="${height}"`));
    assert.equal(svg.includes("<style"), false);
    assert.equal(/class=|href=|url\(/.test(svg), false);
    assert.ok(svg.endsWith("</svg>"));
  });

  test("the names of the User are escaped", () => {
    const svg = renderRadar([entry("a", { name: `<b>"R&D" it's</b>` })], ["<q0>", "a&b", `"q2"`, "q'3"], OPTIONS);
    assert.match(svg, /&lt;b&gt;&quot;R&amp;D&quot; it&apos;s&lt;\/b&gt;/);
    assert.match(svg, /&lt;q0&gt;/);
    assert.match(svg, /a&amp;b/);
    assert.equal(svg.includes("<b>"), false);
  });

  test("the four quadrant names, the four ring names and the four legend labels are written", () => {
    const svg = render([]);
    for (const name of QUADRANTS) assert.ok(svg.includes(`>${name.replace("&", "&amp;")}</text>`), name);
    for (const label of Object.values(OPTIONS.labels.rings)) assert.ok(svg.includes(`>${label}</text>`), label);
    for (const label of [OPTIONS.labels.unchanged, OPTIONS.labels.new, OPTIONS.labels.up, OPTIONS.labels.down]) {
      assert.ok(svg.includes(`>${label}</text>`), label);
    }
  });

  test("a quadrant name too wide for its half is squeezed to fit", () => {
    const svg = renderRadar([], ["x".repeat(40), "short", "short", "short"], OPTIONS);
    assert.match(svg, /<text [^>]*textLength="[\d.]+" lengthAdjust="spacingAndGlyphs"[^>]*>x{40}<\/text>/);
    assert.doesNotMatch(svg, /lengthAdjust="spacingAndGlyphs"[^>]*>short</);
  });

  test("there is no background unless asked, and then a rect paints it", () => {
    assert.equal(render([]).includes("<rect"), false);
    const svg = render([], { ...OPTIONS, background: "#101418" });
    assert.match(svg, /<rect [^>]*width="100%" height="100%" fill="#101418"/);
  });
});
