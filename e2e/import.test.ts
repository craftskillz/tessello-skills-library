// Importing from GitHub: the field that takes a URL, its preview, what it says when GitHub gives nothing, and the
// refresh of a set from its panel. GitHub is faked by Playwright; the rules of the URLs and of the answers are unit tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addByHand,
  closePanel,
  enter,
  importPreview,
  notice,
  openPanel,
  openWithGitHub,
  pack,
  PACK_API,
  PACK_RAW,
  panelOf,
  paste,
  pasteField,
  previewOf,
  radarTab,
  row,
  rows,
  skillMd,
  stored,
  useBrowser,
} from "./skills-library.ts";

useBrowser();

test("the preview of a skill folder is named after the skill, nothing is added before Import, and the field is emptied after it", async () => {
  const { page, host } = await openWithGitHub();
  await enter(page, "https://github.com/acme/skills/tree/main/grill-me");
  const preview = previewOf(page);
  await preview.getByLabel("Set name").waitFor();
  assert.equal(await preview.getByLabel("Set name").inputValue(), "grill-me");
  await preview.getByText("Interviews you relentlessly about a plan.").waitFor();
  assert.equal(await rows(page).count(), 0, "nothing is added before Import");
  assert.equal(await host.storage.get("sets"), null, "nothing is written before Import");
  await importPreview(page);
  await row(page, "grill-me").getByText("1 skill (not evaluated)").waitFor();
  assert.equal(await pasteField(page).inputValue(), "", "the field is emptied for the next URL");
  await stored(host, (sets) => sets.length === 1 && sets[0].name === "grill-me");
});

test("a URL pasted in the field opens the preview at once, without Enter", async () => {
  const { page, host } = await openWithGitHub();
  await pasteField(page).focus();
  await paste(page, "github.com/acme/skills/blob/main/grill-me/SKILL.md");
  await importPreview(page);
  await row(page, "grill-me").waitFor();
  const [set] = await stored(host, (sets) => sets.length === 1);
  assert.equal(set.sourceUrl, "https://github.com/acme/skills/tree/main/grill-me");
});

test("a skill, or a set, entered again says it is there, with no preview and nothing read from GitHub", async () => {
  const { page, host, github } = await openWithGitHub(pack());
  await enter(page, "https://github.com/acme/skills/tree/main/grill-me");
  await importPreview(page);
  await closePanel(panelOf(page, "grill-me"));
  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  await importPreview(page);
  await closePanel(panelOf(page, "pack"));
  await stored(host, (sets) => sets.length === 2);
  const read = github.requests.length;

  // Its file, with another case for the owner.
  await enter(page, "https://github.com/ACME/skills/blob/main/grill-me/SKILL.md");
  await notice(page).getByText("Already in your Library.").waitFor();
  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  await notice(page).getByText("Already in your Library.").waitFor();
  assert.equal(await previewOf(page).count(), 0, "no preview opens");
  assert.equal(await rows(page).count(), 2);
  assert.equal(github.requests.length, read, "nothing more was read");
});

test("a URL where nothing is found says so, and Continue manually opens New set with the URL, which is kept", async () => {
  const { page, host } = await openWithGitHub();
  await enter(page, "https://github.com/acme/skills/tree/main/unknown");
  await notice(page).getByText("Nothing was found at this URL (is the repository public?).").waitFor();
  await notice(page).getByRole("button", { name: "Continue manually" }).click();
  const dialog = page.getByRole("dialog", { name: "New set" });
  assert.equal(await dialog.getByLabel("URL").inputValue(), "https://github.com/acme/skills/tree/main/unknown");
  await dialog.getByLabel("Name").fill("Unknown");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await row(page, "Unknown").waitFor();
  const [set] = await stored(host, (sets) => sets.length === 1);
  assert.equal(set.sourceUrl, "https://github.com/acme/skills/tree/main/unknown");
});

test("a URL that is not a skill on GitHub says so, reads nothing, and Continue manually keeps what was typed", async () => {
  const { page, github } = await openWithGitHub();
  await enter(page, "https://example.com/x");
  await notice(page).getByText("This is not the GitHub URL of a skill.").waitFor();
  await notice(page).getByRole("button", { name: "Continue manually" }).click();
  assert.equal(await page.getByRole("dialog", { name: "New set" }).getByLabel("URL").inputValue(), "https://example.com/x");
  assert.deepEqual(github.requests, []);
});

test("a network failure says so, adds nothing, and the message goes at the next input", async () => {
  const { page } = await openWithGitHub({}, false);
  await enter(page, "https://github.com/acme/skills/tree/main/grill-me");
  const message = notice(page).getByText("GitHub could not be read (check your connection).");
  await message.waitFor();
  assert.equal(await rows(page).count(), 0);
  await pasteField(page).fill("https://github.com/acme/skills/tree/main/grill-m");
  await message.waitFor({ state: "hidden" });
});

test("the preview of a set checks every skill found; Import needs a name and a skill; the set is renamed and one skill unchecked", async () => {
  const { page, host } = await openWithGitHub(pack());
  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  const preview = previewOf(page);
  await preview.getByLabel("Set name").waitFor();
  assert.equal(await preview.getByLabel("Set name").inputValue(), "pack", "named after the repository");
  const boxes = preview.getByRole("checkbox");
  assert.equal(await boxes.count(), 4);
  for (const name of ["alpha", "beta", "gamma", "delta"]) await preview.getByText(`The ${name} skill.`).waitFor();
  assert.deepEqual(await boxes.evaluateAll((all) => all.map((box) => (box as HTMLInputElement).checked)), [true, true, true, true]);

  const importButton = preview.getByRole("button", { name: "Import", exact: true });
  for (const name of [/alpha/, /beta/, /gamma/, /delta/]) await preview.getByRole("checkbox", { name }).uncheck();
  assert.ok(await importButton.isDisabled(), "at least one skill is needed");
  for (const name of [/alpha/, /beta/, /gamma/, /delta/]) await preview.getByRole("checkbox", { name }).check();
  await preview.getByRole("checkbox", { name: /beta/ }).uncheck();
  await preview.getByLabel("Set name").fill("");
  assert.ok(await importButton.isDisabled(), "a name is needed");
  await preview.getByLabel("Set name").fill("Pack of three");
  await importPreview(page);

  await row(page, "Pack of three").getByText("3 skills (3 not evaluated)").waitFor();
  assert.equal(await pasteField(page).inputValue(), "");
  const [set] = await stored(host, (sets) => sets.length === 1);
  assert.equal(set.name, "Pack of three");
  assert.deepEqual(set.skills.map((skill) => skill.name), ["alpha", "gamma", "delta"]);
});

test("the preview offers the five topics, the first one chosen; the row and the radar show the topics of the skills, and the chips filter by them", async () => {
  const { page, host } = await openWithGitHub(pack());
  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  const topic = previewOf(page).getByLabel("Topic");
  await topic.waitFor();
  assert.deepEqual(await topic.locator("option").allTextContents(), ["Design & planning", "Code & tests", "Writing & docs", "Tooling & workflow", "Learning & upskilling"]);
  assert.equal(await topic.inputValue(), "0", "the first topic is chosen");
  await topic.selectOption({ label: "Code & tests" });
  await importPreview(page);
  const [imported] = await stored(host, (sets) => sets.length === 1);
  assert.deepEqual(imported.skills.map((skill) => skill.topic), [1, 1, 1, 1]);
  await row(page, "pack").getByText("Code & tests", { exact: true }).waitFor();

  const panel = panelOf(page, "pack");
  await panel.waitFor();
  const gamma = panel.locator("details", { hasText: "gamma" });
  await gamma.locator("summary").click();
  await gamma.getByLabel("Topic").selectOption({ label: "Writing & docs" });
  await stored(host, ([set]) => set?.skills.some((skill) => skill.name === "gamma" && skill.topic === 2));
  await closePanel(panel);
  await row(page, "pack").getByText("Code & tests, Writing & docs", { exact: true }).waitFor();

  await radarTab(page);
  const points = page.locator(`svg [data-set-id="${imported.id}"]`);
  await points.nth(1).waitFor();
  assert.equal(await points.count(), 2);
  assert.deepEqual(await points.evaluateAll((all) => all.map((point) => point.getAttribute("data-topic"))), ["1", "2"]);
  assert.deepEqual(await points.evaluateAll((all) => all.map((point) => point.getAttribute("data-number"))), ["1", "1"]);
  assert.equal(await page.getByRole("button", { name: /^\d+\. / }).count(), 1, "one line in the legend for the set");

  await page.getByRole("tab", { name: "Library" }).click();
  await page.getByRole("button", { name: "Writing & docs", exact: true }).click();
  await row(page, "pack").waitFor();
  await page.getByRole("button", { name: "Learning & upskilling", exact: true }).click();
  await page.getByRole("button", { name: "Writing & docs", exact: true }).click();
  await page.getByText("No set matches these filters.").waitFor();
});

test("Cancel closes the preview and adds nothing", async () => {
  const { page, host } = await openWithGitHub(pack());
  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  await previewOf(page).getByRole("button", { name: "Cancel" }).click();
  await previewOf(page).waitFor({ state: "hidden" });
  assert.equal(await rows(page).count(), 0);
  assert.equal(await host.storage.get("sets"), null);
});

test("a folder with no skill directly under it says so, with no preview, and Continue manually opens New set with the URL", async () => {
  const root = "https://api.github.com/repos/acme/pack/contents";
  const { page } = await openWithGitHub({ api: { [root]: [{ name: "skills", type: "dir" }, { name: "README.md", type: "file" }] } });
  await enter(page, "https://github.com/acme/pack");
  await notice(page).getByText("No skill folder found directly under this URL. Point to the folder that contains them, e.g. …/tree/main/skills.").waitFor();
  assert.equal(await previewOf(page).count(), 0);
  await notice(page).getByRole("button", { name: "Continue manually" }).click();
  assert.equal(await page.getByRole("dialog", { name: "New set" }).getByLabel("URL").inputValue(), "https://github.com/acme/pack");
});

test("the rate limit of the API says so, with no preview, and offers Continue manually", async () => {
  const { page } = await openWithGitHub({ api: { [PACK_API]: 403 } });
  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  await notice(page).getByText("GitHub rate limit reached, try again later.").waitFor();
  await notice(page).getByRole("button", { name: "Continue manually" }).waitFor();
  assert.equal(await previewOf(page).count(), 0);
});

test("Refresh from GitHub is offered for a set from GitHub only; it says what it added and what is gone, and the mark goes when the skill is back", async () => {
  const { page, host, github } = await openWithGitHub(pack());
  await addByHand(page, "By hand");
  await panelOf(page, "By hand").waitFor();
  assert.equal(await page.getByRole("button", { name: "Refresh from GitHub" }).count(), 0, "no GitHub url, no button");
  await closePanel(panelOf(page, "By hand"));

  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  await importPreview(page);
  await closePanel(panelOf(page, "pack"));
  await row(page, "pack").getByText("4 skills (4 not evaluated)").waitFor();

  // One skill more upstream, one less.
  github.answers.api![PACK_API] = ["alpha", "beta", "gamma", "epsilon", "docs"].map((name) => ({ name, type: "dir" }));
  github.answers.raw![PACK_RAW("epsilon")] = skillMd("epsilon", "The epsilon skill.");
  const panel = await openPanel(page, "pack");
  await panel.getByRole("button", { name: "Refresh from GitHub" }).click();
  await panel.getByRole("status").getByText("1 skill added, 1 removed upstream").waitFor();
  await panel.locator("[data-skill-section]").filter({ hasText: "delta" }).getByText("Removed upstream").waitFor();
  await panel.locator("[data-skill-section]").filter({ hasText: "epsilon" }).getByText("Not evaluated").first().waitFor();
  assert.equal(await panel.getByText("Removed upstream", { exact: true }).count(), 1);
  const [set] = await stored(host, (sets) => sets.some((one) => one.skills.some((skill) => skill.name === "epsilon")));
  assert.deepEqual(set.skills.map((skill) => skill.name), ["alpha", "beta", "gamma", "delta", "epsilon"]);
  assert.deepEqual(set.skills.filter((skill) => skill.goneUpstream).map((skill) => skill.name), ["delta"]);

  await panel.getByRole("button", { name: "Refresh from GitHub" }).click();
  await panel.getByRole("status").getByText("Already up to date").waitFor();

  // The skill is back: it loses its mark.
  github.answers.api![PACK_API] = ["alpha", "beta", "gamma", "delta", "epsilon", "docs"].map((name) => ({ name, type: "dir" }));
  await panel.getByRole("button", { name: "Refresh from GitHub" }).click();
  await panel.getByText("Removed upstream", { exact: true }).waitFor({ state: "detached" });
  await panel.getByRole("status").getByText("Already up to date").waitFor();
  await stored(host, ([one]) => one?.skills.every((skill) => !skill.goneUpstream));
});

test("a refresh that cannot read GitHub says so in the panel and changes nothing", async () => {
  const { page, host, github } = await openWithGitHub(pack());
  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  await importPreview(page);
  await closePanel(panelOf(page, "pack"));
  await row(page, "pack").getByText("4 skills (4 not evaluated)").waitFor();
  const before = await stored(host, (sets) => sets.length === 1);

  github.answers.api![PACK_API] = 403;
  const panel = await openPanel(page, "pack");
  await panel.getByRole("button", { name: "Refresh from GitHub" }).click();
  await panel.getByRole("status").getByText("GitHub rate limit reached, try again later.").waitFor();
  assert.equal(await panel.getByText("Removed upstream", { exact: true }).count(), 0);
  assert.deepEqual(await stored(host, () => true), before);
});

test("a refresh that finds no skill any more says so and marks none removed upstream", async () => {
  const { page, host, github } = await openWithGitHub(pack());
  await enter(page, "https://github.com/acme/pack/tree/main/skills");
  await importPreview(page);
  await closePanel(panelOf(page, "pack"));
  await row(page, "pack").getByText("4 skills (4 not evaluated)").waitFor();
  const before = await stored(host, (sets) => sets.length === 1);

  github.answers.api![PACK_API] = [];
  const panel = await openPanel(page, "pack");
  await panel.getByRole("button", { name: "Refresh from GitHub" }).click();
  await panel.getByRole("status").getByText("No skill found at this URL any more. Nothing was changed.").waitFor();
  assert.equal(await panel.getByText("Removed upstream", { exact: true }).count(), 0);
  assert.deepEqual(await stored(host, () => true), before);
});
