import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { failureMessage } from "../src/view/github-failure.ts";

describe("the message of a failure to read GitHub", () => {
  test("says when nothing is at the URL", () => {
    assert.equal(failureMessage("not_found"), "Nothing was found at this URL (is the repository public?).");
  });

  test("says when the rate limit of the API is reached", () => {
    assert.equal(failureMessage("rate_limited"), "GitHub rate limit reached, try again later.");
  });

  test("says when GitHub cannot be reached", () => {
    assert.equal(failureMessage("network"), "GitHub could not be read (check your connection).");
  });
});
