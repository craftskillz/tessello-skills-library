// The cover of a post: the radar of the edition alone, as a PNG. The radar is an SVG, drawn on a canvas through an image
// (an image does not need the stylesheets of the page, since the SVG carries its own styles), on a solid background.

import type { Edition } from "../lib/editions.ts";
import { POST_RADAR_LABELS } from "../lib/post.ts";
import { renderRadar } from "../lib/radar.ts";

/** The size of the cover in pixels, which the blog shows as the image of the post. */
const WIDTH = 1200;
const HEIGHT = 630;
/** The space kept around the radar. */
const MARGIN = 20;
/** A white background: the colours of the radar are chosen to read on white as on near-black. */
const BACKGROUND = "#ffffff";

/** The PNG cover of the edition: its radar, centred and as large as the margin allows. */
export async function renderCover(edition: Edition): Promise<Blob> {
  const svg = renderRadar(edition.entries, edition.topics, { labels: POST_RADAR_LABELS, background: BACKGROUND });
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  // The SVG has a size of its own: it is scaled to fit.
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const scale = Math.min((WIDTH - MARGIN * 2) / width, (HEIGHT - MARGIN * 2) / height);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d")!;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(image, (WIDTH - width * scale) / 2, (HEIGHT - height * scale) / 2, width * scale, height * scale);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the image could not be made"))), "image/png"));
}
