/**
 * vectorMath.js
 * Tiny 2D vector helpers shared by systems that don't otherwise have
 * anything else in common — kept separate from animation.js/shapes.js
 * since this is spatial math, not curves or static decoration.
 */

/**
 * Unit vector from (ox, oy) toward (tx, ty), scaled to `speed` — the
 * direction+launch math shared by every straight-line projectile pool
 * (EnemyBullet, DrifterProjectiles). Falls back to a zero-length guard
 * (`|| 1`) so firing from and toward the same point doesn't divide by zero.
 * @returns {[number, number]} [vx, vy]
 */
export function directionalVelocity(ox, oy, tx, ty, speed) {
  const dx  = tx - ox;
  const dy  = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return [(dx / len) * speed, (dy / len) * speed];
}

/**
 * Squared distance from point (px, py) to the segment (x1,y1)-(x2,y2) —
 * used to test the player's hitbox against SniperEnemy's laser beam.
 * Squared (not sqrt'd) since every caller only compares against a radius²
 * threshold.
 * @returns {number}
 */
export function distanceToSegmentSquared(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}
