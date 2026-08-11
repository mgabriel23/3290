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
