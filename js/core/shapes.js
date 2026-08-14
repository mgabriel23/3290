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

/**
 * A small heartbeat/ECG pulse trace centered at (cx, cy), spanning roughly
 * ±d — reads as "life restored," distinct from every other HUD/PowerUps
 * icon glyph. Used by GameplayScene's REVIVE button medallion.
 */
export function heartbeatPath(cx, cy, d) {
  return {
    points: [
      [cx - d, cy],
      [cx - d * 0.45, cy],
      [cx - d * 0.2, cy - d * 0.85],
      [cx + d * 0.05, cy + d * 0.85],
      [cx + d * 0.3, cy - d * 0.35],
      [cx + d, cy],
    ],
    closed: false,
  };
}
