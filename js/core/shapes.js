/**
 * shapes.js
 * Pure point-geometry helpers for small decorative shapes reused across
 * this game's sci-fi chrome (HUD panels, title screen, barrier emblem) —
 * same spirit as an exported hull-point array (e.g. Enemy.js's
 * SCOUT_HULL_PTS), just parameterized instead of static since these shapes
 * get placed at different positions/sizes per caller.
 */

/**
 * A single L-bracket "corner accent" tick: two line segments meeting at
 * (x, y), each `legSize` virtual px long. `dx`/`dy` are ±1 and say which
 * quadrant the bracket opens toward — e.g. dx=1,dy=1 for a top-left corner,
 * whose legs extend right and down into the framed area.
 * @returns {{points: number[][], closed: false}}
 */
export function cornerBracketPath(x, y, dx, dy, legSize) {
  return { points: [[x + dx * legSize, y], [x, y], [x, y + dy * legSize]], closed: false };
}

/** A small diamond emblem centered at (cx, cy) with half-size `d`. */
export function diamondPath(cx, cy, d) {
  return { points: [[cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy]] };
}
