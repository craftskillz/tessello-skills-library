// The Widget: what it shows at its size, reading the sets again when shown, and its way into the View. What it counts is a
// unit test (widget).

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { libraryHost, openWidget, stored, useBrowser } from "./skills-library.ts";

/** A set as the View writes it, with one skill of its own. */
const set = (id: string, ring: string) => ({
  id,
  name: `Set ${id}`,
  description: "",
  ring,
  notes: "",
  skills: [{ id: `${id}-skill`, name: `Skill ${id}`, description: "", notes: "", addedAt: "2026-10-01T00:00:00.000Z", topic: 0 }],
  addedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  archived: false,
});

useBrowser();

test("the Widget does not scroll at its size, reads the sets again when shown, and Open asks for the View", async () => {
  const host = libraryHost();
  const { page, surface } = await openWidget({ host });
  const ring = (name: string) => page.getByRole("listitem").filter({ hasText: name });
  await page.getByText("No edition yet").waitFor();
  await ring("Recommended").getByText("0", { exact: true }).waitFor();

  // The View, meanwhile, writes two sets; the Widget, hidden behind it, reads them when shown again.
  surface.setVisible(false);
  await host.storage.set("sets", [set("a", "try"), set("b", "watch")]);
  await stored(host, (sets) => sets.length === 2);
  surface.setVisible(true);
  await ring("Try").getByText("1", { exact: true }).waitFor();
  await ring("Watch").getByText("1", { exact: true }).waitFor();
  await page.getByText("2 changes waiting").waitFor();
  assert.ok(
    await page.locator("body").evaluate((body) => body.scrollHeight <= innerHeight && body.scrollWidth <= innerWidth),
    "the Widget does not scroll",
  );

  await page.getByRole("button", { name: /Open/ }).click();
  await until(() => host.openedViews.length === 1, "the Widget to open the View");
  assert.deepEqual(host.openedViews, [{}]);
});
