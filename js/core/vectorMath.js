/**
 * vectorMath.js
 * Tiny 2D vector helpers shared by systems that don't otherwise have
 * anything else in common — kept separate from animation.js/shapes.js
 * since this is spatial math, not curves or static decoration.
 */

/**
 * Unit vector from (ox, oy) toward (tx, ty), scaled to `speed` — the
 * direction+launch math shared by every straight-line projectile pool
 * (EnemyBullet, SniperBullets, DrifterProjectiles). Falls back to a
 * zero-length guard (`|| 1`) so firing from and toward the same point
 * doesn't divide by zero.
 * @returns {[number, number]} [vx, vy]
 */
export function directionalVelocity(ox, oy, tx, ty, speed) {
  const dx  = tx - ox;
  const dy  = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return [(dx / len) * speed, (dy / len) * speed];
}

/**
 * Rotate point (tx, ty) by `angle` radians around pivot (ox, oy) — used to
 * fan a simultaneous salvo of projectiles out from a single aimed point
 * (see BossEnemy.js's missile-swarm phase) without hand-deriving the
 * rotation matrix at each call site.
 * @returns {[number, number]}
 */
export function rotateAround(ox, oy, tx, ty, angle) {
  const dx  = tx - ox;
  const dy  = ty - oy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos];
}

/**
 * Shortest distance from point (px, py) to the line SEGMENT (x1,y1)-(x2,y2)
 * — used by TetraBoss's phase-2 laser beams (continuous rotating segments,
 * unlike every other attack in the game which is a discrete pooled
 * projectile with its own circle-vs-circle hit test) to test the player's
 * position against a beam. Projects the point onto the segment's line and
 * clamps the projection factor `t` to [0, 1] so points beyond either
 * endpoint measure against that endpoint rather than the infinite line.
 * @returns {number}
 */
export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq)) : 0;
  const ex = px - (x1 + t * dx);
  const ey = py - (y1 + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}
