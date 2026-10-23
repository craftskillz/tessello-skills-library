// Where the panel of a point goes on the radar: near the point, and never out of the box that holds it.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The room kept between the point and the panel. */
export const GAP = 6;

/** The top left corner of the panel, in the coordinates of the bounds (whose origin is 0, 0): under the point, or above it when it does not fit. */
export function placePanel(point: Box, panel: { width: number; height: number }, bounds: { width: number; height: number }): { left: number; top: number } {
  const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));
  const left = clamp(point.x + point.width / 2 - panel.width / 2, bounds.width - panel.width);
  const under = point.y + point.height + GAP;
  const top = under + panel.height <= bounds.height ? under : point.y - GAP - panel.height;
  return { left, top: clamp(top, bounds.height - panel.height) };
}
