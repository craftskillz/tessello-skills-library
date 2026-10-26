// What the browser tests of Skills Library share: its built package served from dist/, its View and Widget opened in
// Chromium against the Test Host of the SDK, GitHub faked by Playwright, and the gestures of the Library, the Radar and
// the Editions. Every wait goes through `until`, which reads again until a deadline (E2E_CPU_SLOWDOWN multiplies it),
// or through Playwright's own wait for an element, never through a fixed time.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before } from "node:test";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import { createTestHost, type FolderServer, serveFolder, slowDownCpu, type TestHost, type TestHostOptions, type TestSurface, until, WIDGET_SIZES } from "@tessello/sdk/testing";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const manifest = JSON.parse(await readFile(`${DIST}manifest.json`, "utf8").catch(() => {
  throw new Error("No dist/: run `npm run build` before the browser tests.");
}));
const module = { id: manifest.id as string, version: manifest.version as string };

export const TOPICS = ["Design & planning", "Code & tests", "Writing & docs", "Tooling & workflow", "Learning & upskilling"];

let browser: Browser;
let server: FolderServer;

/** Serves dist/ and starts Chromium for the tests of the file that calls it. */
export function useBrowser(): void {
  before(async () => {
    server = await serveFolder(DIST);
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await server?.close();
  });
}

/** A page in a new browser context, slowed down by E2E_CPU_SLOWDOWN. */
async function newPage(viewport?: { width: number; height: number }): Promise<Page> {
  const page = await (await browser.newContext({ ...(viewport ? { viewport } : {}), acceptDownloads: true })).newPage();
  await slowDownCpu(page);
  return page;
}

export interface Opened {
  page: Page;
  host: TestHost;
  surface: TestSurface;
}

/** A Test Host for Skills Library, under the Identifier of its Manifest. */
export const libraryHost = (options: Omit<TestHostOptions, "module"> = {}) => createTestHost({ module, ...options });

interface OpenOptions {
  host?: TestHost;
  storage?: TestHostOptions["storage"];
  /** The size of the page; Playwright's 1280 × 720 by default. */
  viewport?: { width: number; height: number };
  /** Called with the page before it loads the View, such as to fake GitHub. */
  prepare?: (page: Page) => Promise<unknown>;
}

/** Opens the View, in English, on a Test Host of its own unless one is given, and waits until it has read its sets. */
export async function openView(options: OpenOptions = {}): Promise<Opened> {
  const host = options.host ?? libraryHost({ storage: options.storage });
  const page = await newPage(options.viewport);
  await options.prepare?.(page);
  const surface = await host.attach(page, { surface: "view" });
  await page.goto(`${server.url}/${manifest.view.entry}`);
  await loaded(page);
  return { page, host, surface };
}

/** Opens the Widget, at the size its Manifest declares, on a Test Host of its own unless one is given. */
export async function openWidget(options: Pick<OpenOptions, "host"> = {}): Promise<Opened> {
  const host = options.host ?? libraryHost();
  const page = await newPage(WIDGET_SIZES[manifest.widget.size as keyof typeof WIDGET_SIZES]);
  const surface = await host.attach(page, { surface: "widget" });
  await page.goto(`${server.url}/${manifest.widget.entry}`);
  return { page, host, surface };
}

/** Waits until the View has read its sets: its tabs show. */
const loaded = (page: Page) => page.getByRole("tablist").waitFor();

/** Reloads the View, and waits until it has read its sets again. */
export async function reload(page: Page) {
  await page.reload();
  await loaded(page);
}

// The storage, as the Test Host holds it.

export interface StoredSkill {
  id: string;
  name: string;
  sourceUrl?: string;
  description: string;
  topic: number;
  score?: number;
  notes: string;
  addedAt: string;
  goneUpstream?: boolean;
}

export interface StoredSet {
  id: string;
  name: string;
  sourceUrl?: string;
  description: string;
  ring: string;
  notes: string;
  skills: StoredSkill[];
  addedAt: string;
  updatedAt: string;
  archived: boolean;
  moveReason?: string;
}

export interface StoredSettings {
  topics: string[];
  tab: string;
  filters: { rings: string[]; topics: number[]; query: string; archived: boolean };
}

export const storedSets = async (host: TestHost) => ((await host.storage.get("sets")) ?? []) as unknown as StoredSet[];

/** Waits until the sets stored pass `written`, so that a reload cannot cut a write short, and returns them. */
export const stored = (host: TestHost, written: (sets: StoredSet[]) => boolean, what = "the sets to be written") =>
  until(async () => {
    const sets = await storedSets(host);
    return written(sets) && sets;
  }, what);

/** Waits until the settings stored pass `written`, and returns them. */
export const storedSettings = (host: TestHost, written: (settings: StoredSettings) => boolean) =>
  until(async () => {
    const settings = (await host.storage.get("settings")) as unknown as StoredSettings | null;
    return settings !== null && written(settings) && settings;
  }, "the settings to be written");

/** Waits until the clock is past the date the newest set was added at, so that the next set added is newer. */
export async function afterNewest(host: TestHost) {
  const newest = Math.max(...(await storedSets(host)).map((set) => Date.parse(set.addedAt)));
  await until(() => Date.now() > newest, "the clock to pass the newest set");
}

// The Library.

export const rows = (page: Page) => page.getByRole("listitem");
export const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
export const panelOf = (page: Page, name: string) => page.getByRole("dialog", { name });

/**
 * Adds a set by hand through the dialog, and returns the panel of the set, which then opens. A URL that is there already
 * adds nothing, and opens no panel: the panel is then not waited for.
 */
export async function addByHand(page: Page, name: string, url = "", description = "") {
  await page.getByRole("button", { name: "New set" }).click();
  const dialog = page.getByRole("dialog", { name: "New set" });
  await dialog.getByLabel("Name").fill(name);
  if (url) await dialog.getByLabel("URL").fill(url);
  if (description) await dialog.getByLabel("Description").fill(description);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  return panelOf(page, name);
}

/** Opens the panel of a set with the pencil of its row. */
export async function openPanel(page: Page, name: string) {
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  const panel = panelOf(page, name);
  await panel.waitFor();
  return panel;
}

/** Closes the panel, and waits until it is gone. */
export async function closePanel(panel: Locator) {
  await panel.getByRole("button", { name: "Close" }).click();
  await panel.waitFor({ state: "hidden" });
}

/** The field of the set in its panel, not the one of a skill: the fields of the set are the direct children of the body. */
export const setField = (panel: Locator, label: string) => panel.locator(".sl-panel-body > label").filter({ hasText: new RegExp(`^${label}`) }).locator("input, textarea, select");

/** The unfolding section of a skill in the panel of its set. */
export const section = (panel: Locator, name: string) => panel.locator("details", { hasText: name });

/** Unfolds the section of a skill, unless it is open. */
export async function unfold(panel: Locator, name: string) {
  const skill = section(panel, name);
  if (!(await skill.evaluate((details) => (details as HTMLDetailsElement).open))) await skill.locator("summary").click();
  return skill;
}

/** Adds a skill to the set whose panel is open, through the dialog; its section then unfolds. */
export async function addSkill(page: Page, panel: Locator, name: string, url = "", description = "") {
  await panel.getByRole("button", { name: "Add skill" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a skill" });
  await dialog.getByLabel("Name").fill(name);
  if (url) await dialog.getByLabel("URL").fill(url);
  if (description) await dialog.getByLabel("Description").fill(description);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}

/** Moves a skill of the set whose panel is open into a topic, through its unfolding section. */
export async function setSkillTopic(panel: Locator, skill: string, topic: string) {
  await (await unfold(panel, skill)).getByLabel("Topic").selectOption({ label: topic });
}

/** Adds a set with one skill, puts it in a ring and the skill in a topic, through its panel, and closes it. */
export async function addJudged({ page, host }: Opened, name: string, ring: string, topic: string) {
  const panel = await addByHand(page, name);
  await panel.getByRole("radio", { name: ring }).check();
  await addSkill(page, panel, `${name} skill`);
  await setSkillTopic(panel, `${name} skill`, topic);
  await stored(host, (sets) => sets.some((set) => set.name === name && set.ring === ring.toLowerCase() && set.skills[0]?.topic === TOPICS.indexOf(topic)));
  await closePanel(panel);
}

/** A set in a ring and a topic, with a skill scored 4 and a skill not evaluated. */
export async function addBundle({ page, host }: Opened, name: string, ring: string, topic: string) {
  const panel = await addByHand(page, name);
  await panel.getByRole("radio", { name: ring }).check();
  await addSkill(page, panel, `${name} first`);
  await addSkill(page, panel, `${name} second`);
  await setSkillTopic(panel, `${name} first`, topic);
  await setSkillTopic(panel, `${name} second`, topic);
  await (await unfold(panel, `${name} first`)).getByRole("radio", { name: "4 out of 5" }).check({ force: true });
  const index = TOPICS.indexOf(topic);
  await stored(host, (sets) => sets.some((set) => set.name === name && set.skills.length === 2 && set.skills.every((skill) => skill.topic === index) && set.skills[0].score === 4));
  await closePanel(panel);
}

// The field that imports from GitHub.

export const pasteField = (page: Page) => page.getByLabel("Paste a GitHub URL");
export const previewOf = (page: Page) => page.getByRole("dialog", { name: "Import a set" });
export const notice = (page: Page) => page.getByRole("status").first();

/** Enters a URL in the field; the preview opens when skills are found. */
export async function enter(page: Page, url: string) {
  await pasteField(page).fill(url);
  await pasteField(page).press("Enter");
}

/** Pastes text in the field as the User does: a real paste event carrying the text. */
export const paste = (page: Page, text: string) =>
  pasteField(page).evaluate((input, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", value);
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, text);

/** Imports what the preview shows, under its name. */
export async function importPreview(page: Page) {
  const preview = previewOf(page);
  await preview.getByRole("button", { name: "Import", exact: true }).click();
  await preview.waitFor({ state: "hidden" });
}

// GitHub, faked.

export const SKILL_MD = `---
name: grill-me
description: >
  Interviews you relentlessly
  about a plan.
---

# Grill me
`;

/** The SKILL.md of a skill named `name`. */
export const skillMd = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

/** What the fake answers, by URL: a status number alone, or the JSON of an answer of the API, or the text of a file of raw. */
export interface GitHubAnswers {
  /** `api.github.com` answers, JSON arrays of `{ name, type }` for a folder; anything else is a 404. */
  api?: Record<string, number | unknown[]>;
  /** `raw.githubusercontent.com` files, besides `acme/skills/main/grill-me/SKILL.md`; anything else is a 404. */
  raw?: Record<string, string>;
}

export interface FakeGitHub {
  /** The URLs requested, in order. */
  requests: string[];
  /** False: the network is down. */
  online: boolean;
  /** Read at each request, so that a test can change what the fake answers. */
  answers: GitHubAnswers;
}

/** Fakes raw.githubusercontent.com and api.github.com for the page; call it before the View loads (`prepare`). */
export async function fakeGitHub(page: Page, fake: FakeGitHub) {
  // The View is served from another origin than GitHub's, which the answer must allow.
  const headers = { "Access-Control-Allow-Origin": "*" };
  await page.route("https://raw.githubusercontent.com/**", (route) => {
    const url = route.request().url();
    fake.requests.push(url);
    if (!fake.online) return route.abort("internetdisconnected");
    const files: Record<string, string> = { "https://raw.githubusercontent.com/acme/skills/main/grill-me/SKILL.md": SKILL_MD, ...fake.answers.raw };
    if (url in files) return route.fulfill({ headers, contentType: "text/plain", body: files[url] });
    return route.fulfill({ headers, status: 404, contentType: "text/plain", body: "404: Not Found" });
  });
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url();
    fake.requests.push(url);
    if (!fake.online) return route.abort("internetdisconnected");
    const answer = fake.answers.api?.[url] ?? 404;
    if (typeof answer === "number") return route.fulfill({ headers, status: answer, contentType: "application/json", body: "{}" });
    return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(answer) });
  });
}

/** Opens the View with GitHub faked by `answers`, and returns the fake, to change it or to read its requests. */
export async function openWithGitHub(answers: GitHubAnswers = {}, online = true): Promise<Opened & { github: FakeGitHub }> {
  const github: FakeGitHub = { requests: [], online, answers };
  const opened = await openView({ prepare: (page) => fakeGitHub(page, github) });
  return { ...opened, github };
}

/** The listing of a folder on the API, and the raw files of the skills of some of its folders. */
export const PACK_API = "https://api.github.com/repos/acme/pack/contents/skills?ref=main";
export const PACK_RAW = (name: string) => `https://raw.githubusercontent.com/acme/pack/main/skills/${name}/SKILL.md`;
export const pack = (): GitHubAnswers => ({
  api: { [PACK_API]: ["alpha", "beta", "gamma", "delta", "docs"].map((name) => ({ name, type: "dir" })).concat([{ name: "README.md", type: "file" }]) },
  raw: Object.fromEntries(["alpha", "beta", "gamma", "delta"].map((name) => [PACK_RAW(name), skillMd(name, `The ${name} skill.`)])),
});

// The Radar and the Editions.

export const radarTab = (page: Page) => page.getByRole("tab", { name: "Radar" }).click();
export const libraryTab = (page: Page) => page.getByRole("tab", { name: "Library" }).click();
export const editionsTab = (page: Page) => page.getByRole("tab", { name: "Editions" }).click();
export const dots = (page: Page) => page.locator("svg [data-set-id]");
export const radarPanel = (page: Page) => page.locator(".sl-radar-panel");
export const publishButton = (page: Page) => page.getByRole("button", { name: /^Publish edition/ });

/** Where a point is drawn, in the coordinates of the drawing. */
export async function pointAt(point: Locator) {
  const transform = await point.getAttribute("transform");
  const [x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform ?? "")!.slice(1).map(Number);
  return { x, y };
}

/** Publishes the next edition from the Radar tab, through the dialog. */
export async function publishEdition({ page, host }: Opened, number: number, intro = "Hello **world**") {
  await radarTab(page);
  await page.getByRole("button", { name: `Publish edition ${number}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Publish edition ${number}`, exact: true });
  await dialog.getByLabel("Introduction").fill(intro);
  await dialog.getByRole("button", { name: "Next" }).click();
  await page.getByRole("dialog", { name: `Publish edition ${number}?`, exact: true }).getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  // The edition, then the index, then the sets without their explanations: a reload after it loses nothing.
  await until(async () => ((await host.storage.get("editions")) as unknown as { number: number }[] | null)?.some((edition) => edition.number === number), `edition ${number} to be written`);
  await stored(host, (sets) => sets.every((set) => !("moveReason" in set)), "the explanations to be cleared");
}

/** The file the View hands the User when `start` runs: its name and its bytes. */
export async function downloaded(page: Page, start: () => Promise<void>): Promise<{ name: string; bytes: Buffer }> {
  const [file] = await Promise.all([page.waitForEvent("download"), start()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}
