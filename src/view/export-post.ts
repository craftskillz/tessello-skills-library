// "Download .zip" of an edition: the file is handed to the User as a download, which the Host allows a View
// (CONVENTION.md §4). It is made from the frozen edition, so it is the same whenever it is asked for.

import type { Edition } from "../lib/editions.ts";
import { renderPost } from "../lib/post.ts";
import { zipFileName, zipPost } from "../lib/post-zip.ts";
import { renderCover } from "./cover.ts";

/** Hands the User a file to save. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  // The download has started from the URL by then.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads the .zip of the post of the edition, with its cover. */
export async function downloadPost(edition: Edition): Promise<void> {
  const cover = new Uint8Array(await (await renderCover(edition)).arrayBuffer());
  const zip = zipPost(edition.number, renderPost(edition), cover) as Uint8Array<ArrayBuffer>;
  download(new Blob([zip], { type: "application/zip" }), zipFileName(edition.number));
}
