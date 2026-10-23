import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { numberEntries, renderRadar, stars, type RadarEntry, type RadarOptions } from "../src/lib/radar.ts";
import { RINGS, type Ring } from "../src/lib/skills.ts";

/** A set with one skill in `topic` (0 by default), unless `skills` says otherwise. */
const entry = (id: string, { topic = 0, ...rest }: Partial<RadarEntry> & { topic?: number } = {}): RadarEntry => ({
  id,
  name: `Skill ${id}`,
  ring: "watch",
  change: "unchanged",
  skills: [{ name: "s", topic }],
  ...rest,
});

const TOPICS = ["Design & planning", "Code & tests", "Writing & docs", "Tooling & workflow", "Data & agents"] as const;
const FOUR = TOPICS.slice(0, 4);
const OPTIONS: RadarOptions = {
  labels: {
    title: "Skills radar",
    rings: { recommended: "Recommended", try: "Try", watch: "Watch", deprecated: "Deprecated" },
    unchanged: "Unchanged or updated",
    new: "New or back",
    up: "Moved towards recommended",
    down: "Moved towards deprecated",
    notEvaluated: "not evaluated",
  },
};

const render = (entries: RadarEntry[], options: RadarOptions = OPTIONS, topics: readonly string[] = TOPICS) => renderRadar(entries, topics, options);

/** The centre of each point, read back from the drawing, by `id#topic`. */
function positions(svg: string): Map<string, { x: number; y: number }> {
  const found = new Map<string, { x: number; y: number }>();
  for (const match of svg.matchAll(/<g data-set-id="([^"]*)" data-number="\d+" data-topic="(\d+)" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)) {
    found.set(`${match[1]}#${match[2]}`, { x: Number(match[3]), y: Number(match[4]) });
  }
  return found;
}

/** The drawing of one dot: from its opening tag to its closing one. */
const dotOf = (svg: string, id: string, topic = 0) => svg.match(new RegExp(`<g data-set-id="${id}" data-number="\\d+" data-topic="${topic}".*?</g>`))![0];

const CENTRE = { x: 380, y: 270 };
const RADIUS = 230;
/** Where the first sector starts, in degrees clockwise from the right (y down), by number of sectors: centred on the right horizontal, where the ring names are, so that no axis is on them. */
const START: Record<number, number> = { 4: -45, 5: -36 };
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
  test("by topic, then by ring from the centre, then by name, each from 1", () => {
    const numbered = numberEntries([
      entry("a", { name: "Zeta", topic: 1, ring: "recommended" }),
      entry("b", { name: "Beta", topic: 0, ring: "deprecated" }),
      entry("c", { name: "Alpha", topic: 0, ring: "watch" }),
      entry("d", { name: "beta", topic: 0, ring: "watch" }),
      entry("e", { name: "Gamma", topic: 0, ring: "recommended" }),
    ]);
    assert.deepEqual(
      numbered.map((item) => [item.number, item.id]),
      [[1, "e"], [2, "c"], [3, "d"], [4, "b"], [5, "a"]],
    );
  });

  test("a set is numbered by its first topic, whatever the order of its skills", () => {
    const numbered = numberEntries([
      entry("late", { name: "Aaa", skills: [{ name: "x", topic: 3 }, { name: "y", topic: 2 }] }),
      entry("early", { name: "Zzz", skills: [{ name: "x", topic: 4 }, { name: "y", topic: 1 }] }),
    ]);
    assert.deepEqual(numbered.map((item) => [item.number, item.id]), [[1, "early"], [2, "late"]]);
  });

  test("a set without skill is left out of the numbering", () => {
    const numbered = numberEntries([entry("a", { skills: [] }), entry("b")]);
    assert.deepEqual(numbered.map((item) => [item.number, item.id]), [[1, "b"]]);
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
  test("the same id in the same topic and ring lands at the same place", () => {
    const first = positions(render([entry("skill-1")]));
    const again = positions(render([entry("skill-1")]));
    assert.deepEqual(first.get("skill-1#0"), again.get("skill-1#0"));
    assert.ok(first.get("skill-1#0"));
  });

  test("it stays where it was when skills of other topics and rings are added or removed", () => {
    const alone = positions(render([entry("skill-1", { topic: 2, ring: "try" })]));
    const crowded = positions(
      render([
        entry("skill-1", { topic: 2, ring: "try" }),
        entry("other-1", { topic: 2, ring: "recommended" }),
        entry("other-2", { topic: 1, ring: "try" }),
        entry("other-3", { topic: 3, ring: "deprecated" }),
      ]),
    );
    assert.deepEqual(crowded.get("skill-1#0"), alone.get("skill-1#0"));
  });

  test("two ids do not land at the same place", () => {
    const found = positions(render([entry("skill-1"), entry("skill-2")]));
    assert.notDeepEqual(found.get("skill-1#0"), found.get("skill-2#0"));
  });

  test("no two dots overlap, with eight skills in one recommended cell and eighteen in one watch cell", () => {
    const entries = [
      ...Array.from({ length: 8 }, (_, i) => entry(`rec-${i}`, { topic: 1, ring: "recommended" })),
      ...Array.from({ length: 18 }, (_, i) => entry(`watch-${i}`, { topic: 3, ring: "watch" })),
    ];
    const svg = render(entries);
    assert.equal(positions(svg).size, 26);
    assertNoOverlap(svg);
  });

  for (const count of [4, 5]) {
    test(`with ${count} topics, every dot is inside its sector and its ring, clear of the axes and of the ring boundaries`, () => {
      const topics = TOPICS.slice(0, count);
      const entries: RadarEntry[] = [];
      for (let topic = 0; topic < count; topic++) {
        for (const ring of RINGS) {
          for (let i = 0; i < 6; i++) entries.push(entry(`${topic}-${ring}-${i}`, { topic, ring }));
        }
      }
      const svg = render(entries, OPTIONS, topics);
      const found = positions(svg);
      assert.equal(found.size, entries.length);
      const width = 360 / count;
      for (const item of entries) {
        const topic = item.skills[0].topic;
        const at = found.get(`${item.id}#${topic}`)!;
        const dx = at.x - CENTRE.x;
        const dy = at.y - CENTRE.y;
        const radius = Math.hypot(dx, dy);
        const from = START[count] + topic * width;
        const angle = (((Math.atan2(dy, dx) * 180) / Math.PI - from) % 360 + 360) % 360;
        assert.ok(angle < width, `${item.id} is in another sector`);
        // The distance to each of the two boundaries of the sector.
        const edge = (degrees: number) => radius * Math.sin((degrees * Math.PI) / 180);
        assert.ok(edge(angle) >= DOT, `${item.id} touches the boundary before it`);
        assert.ok(edge(width - angle) >= DOT, `${item.id} touches the boundary after it`);
        const [ringFrom, ringTo] = RING_ENDS[item.ring];
        assert.ok(radius <= ringTo * RADIUS - DOT, `${item.id} reaches out of its ring`);
        if (ringFrom > 0) assert.ok(radius >= ringFrom * RADIUS + DOT, `${item.id} reaches into the ring inside`);
      }
    });

    test(`with ${count} topics, a dot keeps its place for the same id`, () => {
      const topics = TOPICS.slice(0, count);
      const one = entry("skill-1", { topic: count - 1, ring: "try" });
      const alone = positions(render([one], OPTIONS, topics));
      const crowded = positions(render([one, entry("o-1", { topic: 0, ring: "try" }), entry("o-2", { topic: 1, ring: "watch" })], OPTIONS, topics));
      assert.deepEqual(alone.get("skill-1#0"), crowded.get("skill-1#0"));
    });
  }

  test("a topic index beyond the last sector is drawn in the last one", () => {
    const at = positions(render([entry("a", { topic: 9 })])).get("a#4")!;
    const angle = ((((Math.atan2(at.y - CENTRE.y, at.x - CENTRE.x) * 180) / Math.PI + 36) % 360) + 360) % 360;
    assert.ok(angle >= 288 && angle < 360);
  });
});

describe("a set with skills in several topics", () => {
  const multi = () =>
    entry("m", {
      name: "Multi",
      ring: "try",
      change: "new",
      skills: [
        { name: "Alpha", score: 4, topic: 1 },
        { name: "Beta", topic: 3 },
        { name: "Gamma", score: 2, topic: 1 },
      ],
    });

  test("has one point per topic, with the same number and the same marker", () => {
    const svg = render([multi()]);
    const first = dotOf(svg, "m", 1);
    const second = dotOf(svg, "m", 3);
    assert.match(first, /data-number="1"/);
    assert.match(second, /data-number="1"/);
    assert.match(first, /data-marker="diamond"/);
    assert.match(second, /data-marker="diamond"/);
    assert.equal([...svg.matchAll(/data-set-id="m"/g)].length, 2);
    assert.equal(positions(svg).size, 2);
  });

  test("each point is in the sector of its topic, in the ring of the set, in the colour of its topic", () => {
    const svg = render([multi()]);
    const found = positions(svg);
    for (const topic of [1, 3]) {
      const at = found.get(`m#${topic}`)!;
      const dx = at.x - CENTRE.x;
      const dy = at.y - CENTRE.y;
      const angle = (((Math.atan2(dy, dx) * 180) / Math.PI - (START[5] + topic * 72)) % 360 + 360) % 360;
      assert.ok(angle < 72, `topic ${topic}: wrong sector`);
      const radius = Math.hypot(dx, dy);
      assert.ok(radius >= 0.38 * RADIUS && radius <= 0.58 * RADIUS, `topic ${topic}: wrong ring`);
    }
    const fill = (topic: number) => dotOf(svg, "m", topic).match(/fill="(#\w+)"/)![1];
    assert.notEqual(fill(1), fill(3));
    assert.equal(nameBox(svg, "Code &amp; tests").fill, fill(1));
  });

  test("each point lists only the skills of its topic, under the name of the topic", () => {
    const svg = render([multi()]);
    assert.ok(dotOf(svg, "m", 1).includes("<title>1. Multi — Try · Code &amp; tests&#10;Alpha ★★★★☆&#10;Gamma ★★☆☆☆</title>"));
    assert.ok(dotOf(svg, "m", 3).includes("<title>1. Multi — Try · Tooling &amp; workflow&#10;Beta (not evaluated)</title>"));
  });

  test("the points come in the order of the numbers, then of the topics", () => {
    const svg = render([multi(), entry("z", { name: "Zed", ring: "recommended", topic: 0 })]);
    const order = [...svg.matchAll(/data-set-id="(\w+)" data-number="(\d+)" data-topic="(\d+)"/g)].map((m) => `${m[1]}${m[2]}.${m[3]}`);
    assert.deepEqual(order, ["z1.0", "m2.1", "m2.3"]);
  });

  test("a point keeps its place when other sets are added", () => {
    const alone = positions(render([multi()]));
    const crowded = positions(render([multi(), entry("o-1", { topic: 1, ring: "try" }), entry("o-2", { topic: 3, ring: "try" })]));
    assert.deepEqual(crowded.get("m#1"), alone.get("m#1"));
    assert.deepEqual(crowded.get("m#3"), alone.get("m#3"));
  });

  test("the points of one set in two topics are not at the same place", () => {
    const found = positions(render([entry("s", { skills: [{ name: "a", topic: 0 }, { name: "b", topic: 2 }] })]));
    assert.notDeepEqual(found.get("s#0"), found.get("s#2"));
  });

  test("the topics of an old edition with four names are drawn in their four sectors, and a topic beyond is clamped", () => {
    const svg = render([entry("s", { skills: [{ name: "a", topic: 3 }, { name: "b", topic: 7 }] })], OPTIONS, FOUR);
    assert.equal(positions(svg).size, 1);
    assert.match(dotOf(svg, "s", 3), /<title>1\. Skill s — Watch · Tooling &amp; workflow&#10;a \(not evaluated\)&#10;b \(not evaluated\)<\/title>/);
  });

  test("a set without skill has no point and no number", () => {
    const svg = render([entry("a", { name: "A", skills: [] }), entry("b", { name: "B" })]);
    assert.equal(svg.includes('data-set-id="a"'), false);
    assert.match(dotOf(svg, "b"), /data-number="1"/);
    assert.deepEqual(numberEntries([entry("a", { skills: [] })]), []);
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
    const svg = render([entry("a", { name: "Alpha", topic: 0 }), entry("b", { name: "Beta", topic: 0 })]);
    assert.match(dotOf(svg, "b"), /<title>2\. Beta — Watch · Design &amp; planning&#10;s \(not evaluated\)<\/title>/);
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

  test("the topic names, the four ring names and the four legend labels are written", () => {
    const svg = render([]);
    for (const name of TOPICS) assert.ok(svg.includes(`>${name.replace("&", "&amp;")}</text>`), name);
    for (const label of Object.values(OPTIONS.labels.rings)) assert.ok(svg.includes(`>${label}</text>`), label);
    for (const label of [OPTIONS.labels.unchanged, OPTIONS.labels.new, OPTIONS.labels.up, OPTIONS.labels.down]) {
      assert.ok(svg.includes(`>${label}</text>`), label);
    }
  });

  test("a topic name too wide for its room is squeezed to fit", () => {
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

/** A topic name as drawn: its box as estimated from its anchor, its room and its size (characters × 0.6 × size, squeezed to textLength). */
function nameBox(svg: string, name: string) {
  const text = svg.match(new RegExp(`<text ([^>]*)>${name}</text>`))![1];
  const attr = (key: string) => text.match(new RegExp(`(?:^| )${key}="([^"]*)"`))?.[1];
  const size = Number(attr("font-size"));
  const width = attr("textLength") ? Number(attr("textLength")) : name.length * 0.6 * size;
  const x = Number(attr("x"));
  const anchor = attr("text-anchor");
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  const y = Number(attr("y"));
  return { left, right: left + width, top: y - size, bottom: y + size * 0.2, fill: attr("fill"), bold: attr("font-weight") === "bold" };
}

describe("the topics around the circle", () => {
  for (const count of [4, 5]) {
    const names = ["x".repeat(40), ...TOPICS.slice(1, count).map((name) => name.replace("&", "and"))];
    const svg = renderRadar([], names, OPTIONS);
    const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!.map(Number);
    const boxes = names.map((name) => nameBox(svg, name));

    test(`with ${count} topics, each name is outside the circle, inside the drawing, in bold`, () => {
      boxes.forEach((box, i) => {
        assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height, `name ${i} leaves the drawing`);
        const nearest = Math.hypot(Math.min(Math.max(CENTRE.x, box.left), box.right) - CENTRE.x, Math.min(Math.max(CENTRE.y, box.top), box.bottom) - CENTRE.y);
        assert.ok(nearest >= RADIUS, `name ${i} is on the circle`);
        assert.ok(box.bold);
      });
    });

    test(`with ${count} topics, no two names overlap and none touches the legend`, () => {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `names ${i} and ${j} overlap`);
        }
        assert.ok(boxes[i].bottom < CENTRE.y + RADIUS + 50, `name ${i} reaches the legend`);
      }
    });

    test(`with ${count} topics, each name is in the colour of its sector`, () => {
      assert.equal(new Set(boxes.map((box) => box.fill)).size, count);
    });
  }

  test("the fifth topic has a colour of its own, which its dots take", () => {
    const svg = render([entry("a", { topic: 4 }), entry("b", { topic: 0 }), entry("c", { topic: 3 })]);
    const fill = (id: string, topic: number) => dotOf(svg, id, topic).match(/fill="(#\w+)"/)![1];
    assert.notEqual(fill("a", 4), fill("b", 0));
    assert.notEqual(fill("a", 4), fill("c", 3));
    assert.equal(nameBox(svg, "Data and agents".replace("and", "&amp;")).fill, fill("a", 4));
  });

  for (const count of [4, 5]) {
    test(`with ${count} topics, one axis per boundary, from the centre to the edge, and none crosses the ring names`, () => {
      const svg = render([], OPTIONS, TOPICS.slice(0, count));
      const axes = [...svg.matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/g)].map((m) => m.slice(1).map(Number));
      assert.equal(axes.length, count);
      axes.forEach(([x1, y1, x2, y2], k) => {
        assert.deepEqual([x1, y1], [CENTRE.x, CENTRE.y]);
        assert.ok(Math.abs(Math.hypot(x2 - x1, y2 - y1) - RADIUS) < 0.5);
        const degrees = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        const expected = START[count] + (k * 360) / count;
        assert.ok(Math.abs((((degrees - expected) % 360) + 540) % 360 - 180) < 0.5, `axis ${k}`);
      });
      for (const label of Object.values(OPTIONS.labels.rings)) {
        const match = svg.match(new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*>${label}</text>`))!;
        const [x, y] = [Number(match[1]), Number(match[2])];
        const half = (label.length * 0.6 * 9) / 2;
        for (const [x1, y1, x2, y2] of axes) {
          for (let t = 0; t <= 1; t += 0.005) {
            const px = x1 + t * (x2 - x1);
            const py = y1 + t * (y2 - y1);
            assert.ok(!(px >= x - half && px <= x + half && py >= y - 9 && py <= y + 2), `an axis crosses ${label}`);
          }
        }
      }
    });

    test(`with ${count} topics, no dot covers the ring names, even in a crowded first sector`, () => {
      const entries = RINGS.flatMap((ring) => Array.from({ length: 8 }, (_, i) => entry(`${ring}-${i}`, { ring, topic: 0 })));
      const svg = render(entries, OPTIONS, TOPICS.slice(0, count));
      const dots = [...positions(svg).values()];
      for (const label of Object.values(OPTIONS.labels.rings)) {
        const match = svg.match(new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*>${label}</text>`))!;
        const [x, y] = [Number(match[1]), Number(match[2])];
        const half = (label.length * 0.6 * 9) / 2;
        for (const dot of dots) {
          const nearestX = Math.min(Math.max(dot.x, x - half), x + half);
          const nearestY = Math.min(Math.max(dot.y, y - 9), y);
          assert.ok(distance(dot, { x: nearestX, y: nearestY }) >= DOT, `a dot covers ${label}`);
        }
      }
    });
  }
});

describe("the tooltip of a dot", () => {
  test("names the set with its number and its ring, then a line per skill with its stars, or that it is not evaluated", () => {
    const svg = render([entry("a", { name: "Set A", ring: "try", skills: [{ name: "One", score: 4, topic: 0 }, { name: "Two", topic: 0 }] })]);
    assert.ok(dotOf(svg, "a").includes("<title>1. Set A — Try · Design &amp; planning&#10;One ★★★★☆&#10;Two (not evaluated)</title>"));
  });


  test("escapes the text of the User and stays on one line", () => {
    const svg = render([entry("a", { name: `A & <B> "C"`, skills: [{ name: "it's\nhere", score: 1, topic: 0 }] })]);
    assert.ok(dotOf(svg, "a").includes("<title>1. A &amp; &lt;B&gt; &quot;C&quot; — Watch · Design &amp; planning&#10;it&apos;s&#10;here ★☆☆☆☆</title>"));
    assert.ok(!svg.includes("\n"));
  });

  test("the dot carries the id of its set, its number and its topic", () => {
    const svg = render([entry("a", { name: "B" }), entry("b", { name: "A" })]);
    assert.ok(svg.includes('<g data-set-id="b" data-number="1" data-topic="0" transform='));
    assert.ok(svg.includes('<g data-set-id="a" data-number="2" data-topic="0" transform='));
  });
});

test("stars are filled then empty, rounded and kept between 0 and 5", () => {
  assert.equal(stars(3), "★★★☆☆");
  assert.equal(stars(3.6), "★★★★☆");
  assert.equal(stars(9), "★★★★★");
  assert.equal(stars(-2), "☆☆☆☆☆");
});
