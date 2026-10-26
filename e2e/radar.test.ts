// The Radar tab: its points and legend, the changes waiting, a click that opens a set, the panel of a point by mouse, keyboard
// and touch, and its layout on a narrow screen. Where a point goes and what its panel says are unit tests (radar, panel-position).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addBundle,
  addJudged,
  addByHand,
  addSkill,
  afterNewest,
  closePanel,
  dots,
  libraryTab,
  openPanel,
  openView,
  panelOf,
  pointAt,
  publishButton,
  radarPanel,
  radarTab,
  row,
  setSkillTopic,
  stored,
  useBrowser,
} from "./skills-library.ts";

useBrowser();

const NARROW = { width: 360, height: 800 };

/** The point of the set named `name` (its first one). */
const dotOf = (page: Parameters<typeof dots>[0], name: string) => dots(page).filter({ has: page.locator("title", { hasText: name }) }).first();

test("the radar draws a point per set, numbered in its legend, lists the sets as new changes waiting, and drops an archived set", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await addJudged(opened, "Alpha", "Recommended", "Design & planning");
  await afterNewest(host);
  await addJudged(opened, "Bravo", "Try", "Code & tests");
  await afterNewest(host);
  await addJudged(opened, "Charlie", "Deprecated", "Tooling & workflow");

  await radarTab(page);
  await dots(page).nth(2).waitFor();
  assert.equal(await dots(page).count(), 3);
  assert.deepEqual(await page.getByRole("button", { name: /^\d+\. / }).allTextContents(), ["1. Alpha — Recommended", "2. Bravo — Try", "3. Charlie — Deprecated"]);
  await page.getByText("3 changes waiting").waitFor();
  assert.equal(await page.getByRole("list", { name: "Changes waiting" }).getByText("New", { exact: true }).count(), 3);

  await libraryTab(page);
  const panel = await openPanel(page, "Bravo");
  await panel.getByRole("button", { name: "Archive", exact: true }).click();
  await closePanel(panel);
  await radarTab(page);
  await page.getByText("2 changes waiting").waitFor();
  assert.equal(await dots(page).count(), 2);
});

test("a renamed fifth topic names its sector, and the point of a set in it is drawn in that sector", async () => {
  const { page, host } = await openView();
  await page.getByRole("button", { name: "Rename topics" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename topics" });
  assert.equal(await dialog.getByLabel(/^Topic \d$/).count(), 5);
  await dialog.getByLabel("Topic 5", { exact: true }).fill("Agents");
  await dialog.getByRole("button", { name: "Close" }).click();
  await addByHand(page, "Helper");
  const panel = panelOf(page, "Helper");
  await addSkill(page, panel, "Helper skill");
  await setSkillTopic(panel, "Helper skill", "Agents");
  await stored(host, ([set]) => set?.skills[0]?.topic === 4);
  await closePanel(panel);
  await row(page, "Helper").getByText("Agents").waitFor();

  await radarTab(page);
  await dots(page).first().waitFor();
  await page.locator("svg text", { hasText: "Agents" }).first().waitFor();
  const { x, y } = await pointAt(dots(page).first());
  // The centre is (380, 270); the sectors start at -36 degrees and are 72 degrees wide, clockwise on the screen: the fifth runs from 252 to 324 degrees.
  const angle = ((Math.atan2(y - 270, x - 380) * 180) / Math.PI + 360) % 360;
  assert.ok(angle > 252 && angle < 324, `the point is at ${angle} degrees`);
});

test("a click on a point, or on a line of the legend, opens the set in the Library", async () => {
  const opened = await openView();
  const { page } = opened;
  await addJudged(opened, "Alpha", "Try", "Design & planning");
  await addJudged(opened, "Bravo", "Watch", "Code & tests");
  await radarTab(page);
  await dots(page).nth(1).waitFor();

  await dotOf(page, "Bravo").click();
  await panelOf(page, "Bravo").waitFor();
  await page.getByRole("tab", { name: "Library", selected: true }).waitFor();
  await closePanel(panelOf(page, "Bravo"));

  await radarTab(page);
  await page.getByRole("button", { name: /^1\. Alpha/ }).click();
  await panelOf(page, "Alpha").waitFor();
  await page.getByRole("tab", { name: "Library", selected: true }).waitFor();
});

test("the radar fits a 360 px wide screen, without a horizontal scroll", async () => {
  const opened = await openView({ viewport: NARROW });
  const { page } = opened;
  await addJudged(opened, "Alpha", "Try", "Design & planning");
  await radarTab(page);
  await dots(page).first().waitFor();

  const svg = await page.locator(".sl-radar svg").boundingBox();
  assert.ok(svg && svg.width > 200 && svg.width <= 360, `the radar is ${svg?.width} px wide`);
  const overflow = await page.locator("html").evaluate((html) => html.scrollWidth - html.clientWidth);
  assert.ok(overflow <= 0, `the page overflows by ${overflow} px`);
});

test("hovering a point opens its panel, with its set, its ring, its topic and its skills with their stars; leaving it closes the panel", async () => {
  const opened = await openView();
  const { page } = opened;
  await addBundle(opened, "Bundle", "Try", "Code & tests");
  await radarTab(page);
  await dots(page).first().waitFor();

  assert.equal(await radarPanel(page).count(), 0);
  await dots(page).first().hover();
  const panel = radarPanel(page);
  await panel.waitFor();
  assert.equal(await panel.getByRole("button", { name: "Bundle" }).count(), 1);
  assert.match(await panel.innerText(), /Ring\s*Try/i);
  assert.match(await panel.innerText(), /Topic\s*Code & tests/i);
  const lines = panel.getByRole("listitem");
  assert.equal(await lines.count(), 2);
  assert.match(await lines.nth(0).innerText(), /Bundle first/);
  assert.equal(await lines.nth(0).getByRole("img", { name: "4 out of 5" }).innerText(), "★★★★☆");
  assert.match(await lines.nth(1).innerText(), /Bundle second\s*Not evaluated/);

  await publishButton(page).hover();
  await panel.waitFor({ state: "hidden" });
});

test("the pointer can go from a point into its panel, which stays open, and click the name, which opens the set in the Library", async () => {
  // The panel closes a moment after the pointer leaves its point, unless the pointer reaches the panel: the clock of the
  // page is run past that moment.
  const opened = await openView({ prepare: (page) => page.clock.install() });
  const { page } = opened;
  await addBundle(opened, "Bundle", "Try", "Code & tests");
  await radarTab(page);
  await dots(page).first().hover();
  const name = radarPanel(page).getByRole("button", { name: "Bundle" });
  await name.hover();
  await page.clock.runFor(1000);
  assert.ok(await radarPanel(page).isVisible(), "the panel stays open while the pointer is in it");
  await name.click();
  await panelOf(page, "Bundle").waitFor();
  await page.getByRole("tab", { name: "Library", selected: true }).waitFor();
});

test("the two points of a set in two topics each open their own panel, by mouse and by keyboard", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await addBundle(opened, "Bundle", "Try", "Code & tests");
  const edit = await openPanel(page, "Bundle");
  await setSkillTopic(edit, "Bundle second", "Design & planning");
  await stored(host, (sets) => sets.some((set) => set.name === "Bundle" && set.skills.some((skill) => skill.topic === 0)));
  await closePanel(edit);
  await radarTab(page);
  await dots(page).nth(1).waitFor();
  assert.equal(await dots(page).count(), 2);
  assert.deepEqual(await dots(page).evaluateAll((points) => points.map((point) => point.getAttribute("data-number"))), ["1", "1"], "one number for the set");

  // The points follow the order of the topics: Design & planning, then Code & tests.
  const panel = radarPanel(page);
  await dots(page).nth(0).hover();
  await panel.locator("dd", { hasText: "Design & planning" }).waitFor();
  assert.equal(await panel.getByRole("listitem").count(), 1);
  assert.match(await panel.innerText(), /Bundle second\s*Not evaluated/);

  // The panel of the first point may cover the second: the pointer leaves it, then reaches the second point.
  await publishButton(page).hover();
  await panel.waitFor({ state: "hidden" });
  await dots(page).nth(1).hover();
  await panel.locator("dd", { hasText: "Code & tests" }).waitFor();
  assert.equal(await panel.getByRole("listitem").count(), 1);
  assert.match(await panel.innerText(), /Bundle first/);

  // The keyboard goes from one point to the other, and the panel follows.
  await publishButton(page).focus();
  await page.keyboard.press("Tab");
  await panel.locator("dd", { hasText: "Design & planning" }).waitFor();
  assert.match(await panel.innerText(), /Bundle second/);
  await page.keyboard.press("Tab");
  await panel.locator("dd", { hasText: "Code & tests" }).waitFor();
  assert.match(await panel.innerText(), /Bundle first/);
  assert.doesNotMatch(await panel.innerText(), /Bundle second/);
});

test("Tab walks the points in the order of their numbers; focus opens the panel, Escape closes it and Enter opens it again", async () => {
  const opened = await openView();
  const { page } = opened;
  await addBundle(opened, "Zulu", "Try", "Design & planning");
  await addBundle(opened, "Alpha", "Try", "Design & planning");
  await addBundle(opened, "Mike", "Watch", "Code & tests");
  await radarTab(page);
  await dots(page).nth(2).waitFor();

  await publishButton(page).focus();
  const focused = page.locator("svg [data-set-id]:focus");
  const names = [] as string[];
  for (let number = 1; number <= 3; number++) {
    await page.keyboard.press("Tab");
    assert.equal(await focused.getAttribute("data-number"), String(number));
    await radarPanel(page).waitFor();
    names.push(await radarPanel(page).getByRole("button").first().innerText());
  }
  assert.deepEqual(names, ["Alpha", "Zulu", "Mike"]);

  await page.keyboard.press("Escape");
  await radarPanel(page).waitFor({ state: "hidden" });
  await page.keyboard.press("Enter");
  await radarPanel(page).waitFor();
  assert.equal(await radarPanel(page).getByRole("button").first().innerText(), "Mike");
});

test("a tap on a point opens its panel instead of the set, and a tap elsewhere closes it", async () => {
  const opened = await openView();
  const { page } = opened;
  await addBundle(opened, "Bundle", "Try", "Code & tests");
  await radarTab(page);
  const dot = dots(page).first();
  await dot.waitFor();

  await dot.dispatchEvent("pointerdown", { pointerType: "touch", bubbles: true });
  await dot.dispatchEvent("click");
  await radarPanel(page).waitFor();
  await page.getByRole("tab", { name: "Radar", selected: true }).waitFor();

  await page.locator(".sl-legend-heading").first().dispatchEvent("pointerdown", { pointerType: "touch", bubbles: true });
  await radarPanel(page).waitFor({ state: "hidden" });
});

test("the panel of every point stays inside a 360 px wide screen", async () => {
  const opened = await openView({ viewport: NARROW });
  const { page } = opened;
  await addBundle(opened, "Alpha", "Recommended", "Design & planning");
  await addBundle(opened, "Bravo", "Deprecated", "Code & tests");
  await addBundle(opened, "Charlie", "Watch", "Tooling & workflow");
  await radarTab(page);
  await dots(page).nth(2).waitFor();

  for (let index = 0; index < 3; index++) {
    // By focus, as a hover could land on the panel of the point before.
    await dots(page).nth(index).focus();
    await radarPanel(page).waitFor();
    const box = await radarPanel(page).evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right, width: window.innerWidth };
    });
    assert.ok(box.left >= 0 && box.right <= box.width, `the panel of point ${index + 1} spans ${box.left} to ${box.right} of ${box.width} px`);
    await page.keyboard.press("Escape");
    await radarPanel(page).waitFor({ state: "hidden" });
  }
});
