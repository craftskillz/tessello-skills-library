// The .zip of a blog post, to unzip at the root of the blog: the post and its cover, at the paths the blog reads them from.

import { strToU8, zipSync } from "fflate";
import { postSlug } from "./post.ts";

/** The name of the .zip of the post of an edition. */
export const zipFileName = (number: number) => `${postSlug(number)}.zip`;

/** The .zip holding the Markdown of the post and the PNG of its cover. */
export function zipPost(number: number, markdown: string, cover: Uint8Array): Uint8Array {
  const slug = postSlug(number);
  // The cover is a PNG, already compressed.
  return zipSync({ [`_posts/${slug}.md`]: strToU8(markdown), [`public/assets/blog/${slug}/cover.png`]: [cover, { level: 0 }] });
}
