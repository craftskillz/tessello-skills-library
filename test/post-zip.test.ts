import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { zipFileName, zipPost } from "../src/lib/post-zip.ts";

test("the zip holds the post and its cover at the paths of the blog, and nothing else", () => {
  const cover = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 7]);
  const files = unzipSync(zipPost(3, "---\ntitle: \"Édition\"\n---\n\nBonjour ★\n", cover));
  assert.deepEqual(Object.keys(files).sort(), ["_posts/skills-radar-edition-3.md", "public/assets/blog/skills-radar-edition-3/cover.png"]);
  assert.equal(strFromU8(files["_posts/skills-radar-edition-3.md"]), "---\ntitle: \"Édition\"\n---\n\nBonjour ★\n");
  assert.deepEqual([...files["public/assets/blog/skills-radar-edition-3/cover.png"]], [...cover]);
});

test("the zip is named after the post", () => {
  assert.equal(zipFileName(3), "skills-radar-edition-3.zip");
});
