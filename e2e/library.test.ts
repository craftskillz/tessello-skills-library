// The Library: the tabs, a set added by hand, its edit panel, the topics, the filters, archiving and deleting.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { addByHand, addSkill, afterNewest, closePanel, openPanel, openView, panelOf, reload, row, rows, section, setField, setSkillTopic, stored, storedSettings, unfold, useBrowser } from "./skills-library.ts";

useBrowser();

test("a set added by hand shows its ring, its count and that it is off the radar, and links to its URL in a new tab", async () => {
  const { page, host } = await openView();
  await page.getByText(/^No sets yet/).waitFor();
  await addByHand(page, "Grill me", "https://raw.githubusercontent.com/acme/skills/main/grill/SKILL.md", "Questions until it is clear");
  const set = row(page, "Grill me");
  await set.getByText("Watch", { exact: true }).waitFor();
  await set.getByText("0 skills", { exact: true }).waitFor();
  await set.getByText("No skill — not on the radar").waitFor();
  const link = set.getByRole("link", { name: "Grill me" });
  assert.equal(await link.getAttribute("href"), "https://raw.githubusercontent.com/acme/skills/main/grill/SKILL.md");
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.match((await link.getAttribute("rel")) ?? "", /noopener/);

  // Kept in the storage of the Host, and read again.
  await stored(host, (sets) => sets.length === 1);
  await reload(page);
  await row(page, "Grill me").waitFor();
});

test("Add is disabled until the set has a name", async () => {
  const { page } = await openView();
  await page.getByRole("button", { name: "New set" }).click();
  const dialog = page.getByRole("dialog", { name: "New set" });
  await dialog.getByLabel("URL").fill("https://example.com/x");
  assert.ok(await dialog.getByRole("button", { name: "Add", exact: true }).isDisabled());
  await dialog.getByLabel("Name").fill("X");
  assert.ok(await dialog.getByRole("button", { name: "Add", exact: true }).isEnabled());
});

test("the View has three tabs, says when the Radar and the Editions are empty, and reopens the tab left open", async () => {
  const { page, host } = await openView();
  const tabs = page.getByRole("tablist");
  assert.deepEqual(await tabs.getByRole("tab").allTextContents(), ["Library", "Radar", "Editions"]);
  await tabs.getByRole("tab", { name: "Library", selected: true }).waitFor();

  await tabs.getByRole("tab", { name: "Radar" }).click();
  await tabs.getByRole("tab", { name: "Radar", selected: true }).waitFor();
  await page.getByRole("tabpanel").getByText(/^Nothing to draw yet/).waitFor();
  await storedSettings(host, (settings) => settings.tab === "radar");
  await reload(page);
  await page.getByRole("tab", { name: "Radar", selected: true }).waitFor();

  await page.getByRole("tab", { name: "Editions" }).click();
  await page.getByRole("tabpanel").getByText("No edition yet. Publish one from the Radar.").waitFor();
});

test("a set added by hand with a URL that is there already says so", async () => {
  const { page, host } = await openView();
  await addByHand(page, "Grill me", "https://github.com/acme/skills/tree/main/grill-me");
  await closePanel(panelOf(page, "Grill me"));
  await addByHand(page, "Another", "https://raw.githubusercontent.com/Acme/skills/main/grill-me/SKILL.md");
  await page.getByText("Already in your Library.").waitFor();
  assert.equal(await rows(page).count(), 1);
  assert.equal((await stored(host, () => true)).length, 1);
});

test("the panel opens on the set just added, Escape closes it, a click on the row opens it again, and each change is written at once", async () => {
  const { page, host } = await openView();
  await addByHand(page, "Grill me");
  await stored(host, (sets) => sets.length === 1);

  await panelOf(page, "Grill me").waitFor();
  await page.keyboard.press("Escape");
  await panelOf(page, "Grill me").waitFor({ state: "hidden" });
  await row(page, "Grill me").getByText("No skill — not on the radar").click();
  const panel = panelOf(page, "Grill me");
  await panel.waitFor();

  await panel.getByLabel("Description").fill("Questions until it is clear");
  await stored(host, ([set]) => set?.description === "Questions until it is clear", "the description to be written");
  await panel.getByRole("radio", { name: "Recommended" }).check();
  await stored(host, ([set]) => set?.ring === "recommended", "the ring to be written");
  await addSkill(page, panel, "Question");
  await setSkillTopic(panel, "Question", "Code & tests");
  await stored(host, ([set]) => set?.skills[0]?.topic === 1, "the topic to be written");
  await panel.getByLabel("Set notes").fill("# Great\n\nUse it **often**.");
  await stored(host, ([set]) => set?.notes === "# Great\n\nUse it **often**.", "the notes to be written");

  // The list shows the changes behind the panel.
  await row(page, "Grill me").getByText("Recommended", { exact: true }).waitFor();
  await row(page, "Grill me").getByText("Code & tests").waitFor();
  await closePanel(panel);
});

test("the score of a skill is set with the arrow keys, and Clear makes it not evaluated again", async () => {
  const { page, host } = await openView();
  await addByHand(page, "Keys");
  const panel = panelOf(page, "Keys");
  await addSkill(page, panel, "Typing");
  await panel.getByText("Not evaluated").first().waitFor();
  await panel.getByRole("radio", { name: "1 out of 5" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert.ok(await panel.getByRole("radio", { name: "3 out of 5" }).isChecked());
  await stored(host, ([set]) => set?.skills[0]?.score === 3);
  await row(page, "Keys").getByText("1 skill", { exact: true }).waitFor();

  await panel.getByRole("button", { name: "Clear", exact: true }).click();
  await panel.getByRole("button", { name: "Clear", exact: true }).waitFor({ state: "detached" });
  await stored(host, ([set]) => set?.skills.length === 1 && set.skills[0].score === undefined);
  await row(page, "Keys").getByText("1 skill (not evaluated)").waitFor();
});

test("a blank name, notes over 8,000 characters and the URL of another set each say why, and what was typed is kept", async () => {
  const { page, host } = await openView();
  await addByHand(page, "Taken", "https://example.com/taken");
  await closePanel(panelOf(page, "Taken"));
  await afterNewest(host);
  await addByHand(page, "Mine");
  await stored(host, (sets) => sets.length === 2);
  const panel = panelOf(page, "Mine");
  await panel.waitFor();

  await setField(panel, "Name").fill("");
  await panel.getByText("A name is required.").waitFor();
  await setField(panel, "Name").fill("Mine, renamed");
  await panel.getByText("A name is required.").waitFor({ state: "hidden" });
  await panelOf(page, "Mine, renamed").waitFor();

  await setField(panel, "Set notes").fill("x".repeat(8001));
  await panel.getByText("Notes are limited to 8,000 characters.").waitFor();
  assert.equal((await setField(panel, "Set notes").inputValue()).length, 8001, "what was typed is kept to be trimmed");
  await setField(panel, "Set notes").fill("x".repeat(8000));
  await panel.getByText("Notes are limited to 8,000 characters.").waitFor({ state: "hidden" });

  await setField(panel, "URL").fill("https://example.com/taken/");
  await setField(panel, "URL").blur();
  await panel.getByText("Another set already has this URL.").waitFor();
  assert.equal(await setField(panel, "URL").inputValue(), "https://example.com/taken/");

  const sets = await stored(host, (list) => list.some((set) => set.name === "Mine, renamed" && set.notes === "x".repeat(8000)));
  assert.equal(sets.find((set) => set.name === "Mine, renamed")!.sourceUrl, undefined, "the refused URL was not written");
});

test("the topics are renamed in their dialog, the chips and the search filter the Library, and all of it is read again after a reload", async () => {
  const { page, host } = await openView();
  await addByHand(page, "Élégant plan");
  const panel = panelOf(page, "Élégant plan");
  await panel.getByRole("radio", { name: "Try" }).check();
  await addSkill(page, panel, "Zebra crossing");
  await setSkillTopic(panel, "Zebra crossing", "Writing & docs");
  await panel.getByRole("radio", { name: "4 out of 5" }).check({ force: true });
  await setField(panel, "Set notes").fill("kept");
  await closePanel(panel);
  await stored(host, ([set]) => set?.notes === "kept" && set.skills[0]?.topic === 2 && set.ring === "try" && set.skills[0]?.score === 4);
  await afterNewest(host);
  await addByHand(page, "Other thing");
  await closePanel(panelOf(page, "Other thing"));

  await page.getByRole("button", { name: "Rename topics" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename topics" });
  await dialog.getByLabel("Topic 3", { exact: true }).fill("");
  await dialog.getByText("A topic name is required.").waitFor();
  await dialog.getByLabel("Topic 3", { exact: true }).fill("Prose");
  await dialog.getByText("A topic name is required.").waitFor({ state: "hidden" });
  await dialog.getByRole("button", { name: "Close" }).click();
  await row(page, "Élégant plan").getByText("Prose").waitFor();

  const chip = (name: string) => page.getByRole("button", { name, exact: true });
  const count = (n: number) => until(async () => (await rows(page).count()) === n, `${n} sets to be listed`);
  await chip("Try").click();
  assert.equal(await chip("Try").getAttribute("aria-pressed"), "true");
  await count(1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  assert.equal(await chip("Try").getAttribute("aria-pressed"), "false");
  await count(2);
  await chip("Prose").click();
  await count(1);
  await page.getByLabel("Search by set or skill name").fill("ELEGANT");
  await count(1);
  await page.getByLabel("Search by set or skill name").fill("nothing like it");
  await page.getByText("No set matches these filters.").waitFor();
  await page.getByLabel("Search by set or skill name").fill("ZEBRA");
  await count(1);
  await page.getByLabel("Search by set or skill name").fill("elegant");
  await count(1);

  const settings = await storedSettings(host, (value) => value.topics[2] === "Prose" && value.filters.query === "elegant");
  assert.deepEqual(settings.filters, { rings: [], topics: [2], query: "elegant", archived: false });

  await reload(page);
  assert.equal(await page.getByLabel("Search by set or skill name").inputValue(), "elegant");
  assert.equal(await chip("Prose").getAttribute("aria-pressed"), "true");
  await count(1);
  const reopened = await openPanel(page, "Élégant plan");
  assert.ok(await reopened.getByRole("radio", { name: "Try" }).isChecked());
  await unfold(reopened, "Zebra crossing");
  assert.ok(await reopened.getByRole("radio", { name: "4 out of 5" }).isChecked());
  assert.equal(await section(reopened, "Zebra crossing").getByLabel("Topic").inputValue(), "2");
  await section(reopened, "Zebra crossing").locator("summary").getByText("Prose").waitFor();
  assert.equal(await setField(reopened, "Set notes").inputValue(), "kept");
});

test("a set added while the filters hide it clears them, so that its row is shown", async () => {
  const { page } = await openView();
  await addByHand(page, "First");
  await closePanel(panelOf(page, "First"));
  await page.getByRole("button", { name: "Try", exact: true }).click();
  await page.getByText("No set matches these filters.").waitFor();

  await addByHand(page, "Hidden by the filter");
  await row(page, "Hidden by the filter").waitFor();
  assert.equal(await page.getByRole("button", { name: "Try", exact: true }).getAttribute("aria-pressed"), "false");
});

test("an archived set leaves the Library, Show archived shows it greyed and is read again after a reload, and Unarchive brings it back", async () => {
  const { page, host } = await openView();
  await addByHand(page, "Keep me");
  await closePanel(panelOf(page, "Keep me"));
  await addByHand(page, "Old idea");
  await panelOf(page, "Old idea").getByRole("button", { name: "Archive", exact: true }).click();
  await panelOf(page, "Old idea").getByRole("button", { name: "Unarchive" }).waitFor();
  await closePanel(panelOf(page, "Old idea"));

  await row(page, "Keep me").waitFor();
  await row(page, "Old idea").waitFor({ state: "detached" });
  await stored(host, (sets) => sets.some((set) => set.name === "Old idea" && set.archived));

  await page.getByLabel("Show archived").check();
  const archived = row(page, "Old idea");
  await archived.getByText("Archived", { exact: true }).waitFor();
  assert.match((await archived.getAttribute("class")) ?? "", /\bsl-archived\b/);
  assert.doesNotMatch((await row(page, "Keep me").getAttribute("class")) ?? "", /\bsl-archived\b/);
  await storedSettings(host, (settings) => settings.filters.archived);

  await reload(page);
  assert.ok(await page.getByLabel("Show archived").isChecked());
  await row(page, "Old idea").waitFor();

  const panel = await openPanel(page, "Old idea");
  await panel.getByRole("button", { name: "Unarchive" }).click();
  await panel.getByRole("button", { name: "Archive", exact: true }).waitFor();
  await stored(host, (sets) => sets.every((set) => !set.archived));
  await closePanel(panel);
  await page.getByLabel("Show archived").uncheck();
  await row(page, "Old idea").waitFor();
  assert.equal(await rows(page).count(), 2);
});

test("when every set is archived, the Library says no set matches, not that it is empty", async () => {
  const { page } = await openView();
  await addByHand(page, "Only one");
  await panelOf(page, "Only one").getByRole("button", { name: "Archive", exact: true }).click();
  await closePanel(panelOf(page, "Only one"));
  await page.getByText("No set matches these filters.").waitFor();
  await page.getByLabel("Show archived").waitFor();
  assert.equal(await page.getByText(/^No sets yet/).count(), 0);
});

test("a set is deleted only once confirmed: Escape closes the confirmation only, Cancel keeps the set", async () => {
  const { page, host } = await openView();
  await addByHand(page, "By mistake");
  const panel = panelOf(page, "By mistake");
  await panel.getByRole("button", { name: "Delete" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete By mistake?" });
  await confirmation.waitFor();

  await page.keyboard.press("Escape");
  await confirmation.waitFor({ state: "hidden" });
  await panel.waitFor();
  await panel.getByRole("button", { name: "Delete" }).click();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await confirmation.waitFor({ state: "hidden" });
  await panel.waitFor();
  assert.equal((await stored(host, (sets) => sets.length === 1)).length, 1);

  await panel.getByRole("button", { name: "Delete" }).click();
  await confirmation.getByRole("button", { name: "Delete" }).click();
  await panel.waitFor({ state: "hidden" });
  await page.getByText(/^No sets yet/).waitFor();
  await stored(host, (sets) => sets.length === 0);
});

test("a URL already in the Library as an archived set shows that set, switching Show archived on", async () => {
  const { page, host } = await openView();
  const url = "https://github.com/acme/skills/tree/main/grill-me";
  await addByHand(page, "Grill me", url);
  await panelOf(page, "Grill me").getByRole("button", { name: "Archive", exact: true }).click();
  await closePanel(panelOf(page, "Grill me"));
  await page.getByText("No set matches these filters.").waitFor();

  await addByHand(page, "Again", url);
  const archived = row(page, "Grill me");
  await archived.waitFor();
  assert.ok(await page.getByLabel("Show archived").isChecked());
  assert.match((await archived.getAttribute("class")) ?? "", /\bsl-highlighted\b/);
  assert.equal((await stored(host, () => true)).length, 1);
});
