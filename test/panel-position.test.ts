import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { placePanel } from "../src/lib/panel-position.ts";

const bounds = { width: 300, height: 400 };
const panel = { width: 200, height: 100 };
const point = (x: number, y: number) => ({ x: x - 10, y: y - 10, width: 20, height: 20 });

describe("placePanel", () => {
  test("goes under the point, centred on it", () => {
    assert.deepEqual(placePanel(point(150, 100), panel, bounds), { left: 50, top: 116 });
  });

  test("goes above the point when there is no room under it", () => {
    assert.deepEqual(placePanel(point(150, 380), panel, bounds), { left: 50, top: 264 });
  });

  test("stays inside the bounds on the left and on the right", () => {
    assert.equal(placePanel(point(5, 100), panel, bounds).left, 0);
    assert.equal(placePanel(point(295, 100), panel, bounds).left, 100);
  });

  test("a panel wider or taller than the bounds sits at the origin", () => {
    assert.deepEqual(placePanel(point(150, 200), { width: 400, height: 500 }, bounds), { left: 0, top: 0 });
  });
});
