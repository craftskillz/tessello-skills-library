// The Editions: publishing from the Radar, the explanation of a move, the Editions tab, the .zip of an edition, and the
// skills of a set after a publication. What an edition holds and what its post says are unit tests (editions, post).

import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync } from "fflate";
import {
  addByHand,
  addJudged,
  addSkill,
  closePanel,
  downloaded,
  editionsTab,
  libraryTab,
  openPanel,
  openView,
  panelOf,
  publishEdition,
  radarTab,
  reload,
  row,
  section,
  stored,
  useBrowser,
} from "./skills-library.ts";

useBrowser();

test("Next needs an introduction; a move not explained sends the User to the panel of its set; the editions are listed after a reload", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await addJudged(opened, "Alpha", "Try", "Design & planning");
  await addJudged(opened, "Bravo", "Watch", "Code & tests");
  await radarTab(page);

  await page.getByRole("button", { name: "Publish edition 1", exact: true }).click();
  const first = page.getByRole("dialog", { name: "Publish edition 1", exact: true });
  assert.ok(await first.getByRole("button", { name: "Next" }).isDisabled());
  await first.getByLabel("Introduction").fill("   ");
  assert.ok(await first.getByRole("button", { name: "Next" }).isDisabled());
  await first.getByRole("button", { name: "Cancel" }).click();
  await first.waitFor({ state: "hidden" });

  await publishEdition(opened, 1, "First edition");
  await page.getByText("No change waiting").waitFor();
  await page.getByRole("button", { name: "Publish edition 2", exact: true }).waitFor();

  // Alpha moves, and Bravo is archived.
  await libraryTab(page);
  const alpha = await openPanel(page, "Alpha");
  await alpha.getByRole("radio", { name: "Recommended" }).check();
  await closePanel(alpha);
  const bravo = await openPanel(page, "Bravo");
  await bravo.getByRole("button", { name: "Archive", exact: true }).click();
  await closePanel(bravo);
  await radarTab(page);
  await page.getByText("2 changes waiting").waitFor();
  await page.getByText("Moved: Try → Recommended").waitFor();
  await page.getByText("Retired (was Watch)").waitFor();

  await page.getByRole("button", { name: "Publish edition 2", exact: true }).click();
  const refused = page.getByRole("dialog", { name: "Publish edition 2", exact: true });
  await refused.getByRole("button", { name: "Alpha" }).waitFor();
  assert.equal(await refused.getByLabel("Introduction").count(), 0);
  assert.equal(await refused.getByRole("button", { name: "Publish", exact: true }).count(), 0);
  await refused.getByRole("button", { name: "Alpha" }).click();
  await refused.waitFor({ state: "hidden" });
  const panel = panelOf(page, "Alpha");
  await panel.getByLabel("Why did it move?").fill("Used it for a month");
  await stored(host, (sets) => sets.some((set) => set.moveReason === "Used it for a month"));
  await closePanel(panel);

  await publishEdition(opened, 2, "Second edition");
  await page.getByText("No change waiting").waitFor();

  await reload(page);
  await editionsTab(page);
  const headings = page.getByRole("heading", { name: /^Edition \d+$/ });
  await headings.nth(1).waitFor();
  assert.deepEqual(await headings.allTextContents(), ["Edition 2", "Edition 1"]);
  // Edition 2 has Alpha (Recommended) only, since Bravo was archived; Edition 1 had one Try and one Watch.
  await page.getByText("1 Recommended", { exact: true }).waitFor();
  await page.getByText("1 Try · 1 Watch", { exact: true }).waitFor();
});

test("the button of an edition hands a skills-radar-edition-<n>.zip, whose cover is a PNG of 1200 × 630", async () => {
  const opened = await openView();
  const { page } = opened;
  await addJudged(opened, "Alpha", "Try", "Design & planning");
  await publishEdition(opened, 1, "First edition");
  await editionsTab(page);

  const file = await downloaded(page, () => page.getByRole("button", { name: "Download edition 1 as .zip" }).click());
  assert.equal(file.name, "skills-radar-edition-1.zip");
  const files = unzipSync(new Uint8Array(file.bytes));
  assert.deepEqual(Object.keys(files).sort(), ["_posts/skills-radar-edition-1.md", "public/assets/blog/skills-radar-edition-1/cover.png"]);
  const cover = Buffer.from(files["public/assets/blog/skills-radar-edition-1/cover.png"]);
  assert.deepEqual([...cover.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "the cover is a PNG");
  assert.deepEqual([cover.readUInt32BE(16), cover.readUInt32BE(20)], [1200, 630]);
});

test("a published set offers Archive only, and its panel asks why it moved only while its ring differs from the published one", async () => {
  const opened = await openView();
  const { page } = opened;
  await addJudged(opened, "Alpha", "Try", "Design & planning");
  const before = await openPanel(page, "Alpha");
  assert.equal(await before.getByRole("button", { name: "Delete" }).count(), 1);
  await closePanel(before);
  await publishEdition(opened, 1);
  await libraryTab(page);

  const panel = await openPanel(page, "Alpha");
  await panel.getByRole("button", { name: "Archive", exact: true }).waitFor();
  assert.equal(await panel.getByRole("button", { name: "Delete" }).count(), 0);
  assert.equal(await panel.getByLabel("Why did it move?").count(), 0);

  await panel.getByRole("radio", { name: "Recommended" }).check();
  await panel.getByLabel("Why did it move?").fill("Typed");
  await panel.getByRole("radio", { name: "Try" }).check();
  await panel.getByLabel("Why did it move?").waitFor({ state: "detached" });
  await panel.getByRole("radio", { name: "Watch" }).check();
  assert.equal(await panel.getByLabel("Why did it move?").inputValue(), "", "what was typed is cleared");
});

test("the explanation of a move takes 280 characters at most, without an alert", async () => {
  const opened = await openView();
  const { page } = opened;
  await addJudged(opened, "Alpha", "Try", "Design & planning");
  await publishEdition(opened, 1);
  await libraryTab(page);
  const panel = await openPanel(page, "Alpha");
  await panel.getByRole("radio", { name: "Recommended" }).check();
  const field = panel.getByLabel("Why did it move?");
  assert.equal(await field.getAttribute("maxlength"), "280");
  await field.fill("x".repeat(300));
  assert.equal((await field.inputValue()).length, 280);
  assert.equal(await panel.getByRole("alert").count(), 0);
});

test("the publish dialog fits a 360 px wide screen", async () => {
  const opened = await openView({ viewport: { width: 360, height: 800 } });
  const { page } = opened;
  await addJudged(opened, "Alpha", "Try", "Design & planning");
  await radarTab(page);
  await page.getByRole("button", { name: "Publish edition 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish edition 1", exact: true });
  await dialog.getByLabel("Introduction").fill("Hi");
  const box = await dialog.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 360, `the dialog is at ${box?.x}, ${box?.width} px wide`);
  const overflow = await page.locator("html").evaluate((html) => html.scrollWidth - html.clientWidth);
  assert.ok(overflow <= 0, `the page overflows by ${overflow} px`);
});

test("Add a skill refuses a URL of the same set with a message; a skill is removed after a publication behind a confirmation", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await addByHand(page, "Bundle");
  const panel = panelOf(page, "Bundle");
  await addSkill(page, panel, "Alpha skill", "https://example.com/alpha", "The first");
  await addSkill(page, panel, "Beta skill");
  await panel.getByRole("button", { name: "Add skill" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a skill" });
  await dialog.getByLabel("Name").fill("Again");
  await dialog.getByLabel("URL").fill("https://example.com/alpha");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.getByText("Another skill of this set already has this URL.").waitFor();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "hidden" });
  await stored(host, ([set]) => set?.skills.length === 2);
  await closePanel(panel);
  await publishEdition(opened, 1, "A set");
  await libraryTab(page);

  await openPanel(page, "Bundle");
  const beta = section(panel, "Beta skill");
  await beta.locator("summary").click();
  await beta.getByRole("button", { name: "Remove from set" }).click();
  const confirmation = page.getByRole("dialog", { name: "Remove Beta skill from the set?" });
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await confirmation.waitFor({ state: "hidden" });
  assert.equal((await stored(host, () => true))[0].skills.length, 2);
  await beta.getByRole("button", { name: "Remove from set" }).click();
  await confirmation.getByRole("button", { name: "Remove from set" }).click();
  await stored(host, ([set]) => set?.skills.length === 1);
  await closePanel(panel);
  await row(page, "Bundle").getByText("Updated", { exact: true }).waitFor();
  // An update is not a change the next edition waits for.
  await radarTab(page);
  await page.getByText("No change waiting").waitFor();
});
