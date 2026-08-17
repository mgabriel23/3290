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
 * A filled "+" cross badge centered at (cx, cy), spanning ±d — the
 * universal health-restore glyph. Used by PowerUps.js's health pickup.
 */
export function crossPath(cx, cy, d) {
  const t = d * 0.35; // half-thickness of each arm
  return {
    points: [
      [cx - t, cy - d], [cx + t, cy - d], [cx + t, cy - t],
      [cx + d, cy - t], [cx + d, cy + t], [cx + t, cy + t],
      [cx + t, cy + d], [cx - t, cy + d], [cx - t, cy + t],
      [cx - d, cy + t], [cx - d, cy - t], [cx - t, cy - t],
    ],
  };
}

/**
 * A filled lightning-bolt badge centered at (cx, cy), spanning roughly ±d,
 * top to bottom. Used by PowerUps.js's fireBoost pickup.
 */
export function boltPath(cx, cy, d) {
  return {
    points: [
      [cx + d * 0.15, cy - d], [cx - d * 0.55, cy + d * 0.05], [cx - d * 0.05, cy + d * 0.05],
      [cx - d * 0.15, cy + d], [cx + d * 0.55, cy - d * 0.05], [cx + d * 0.05, cy - d * 0.05],
    ],
  };
}

/**
 * A small hexagon ring centered at (cx, cy) with radius `d` — six points
 * evenly spaced around the center. Used by PowerUps.js's invincible pickup.
 */
export function hexPath(cx, cy, d) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    points.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  return { points, closed: true };
}

/**
 * A five-pointed star centered at (cx, cy), alternating `outerR`/`innerR`
 * radii per vertex — a stamped-emblem glyph that reads as "valuable" at a
 * glance. Used as the gold coin's engraved face (see GoldPickups.render).
 */
export function starPath(cx, cy, outerR, innerR) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return { points };
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
