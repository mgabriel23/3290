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
