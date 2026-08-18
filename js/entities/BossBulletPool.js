/**
 * BossBulletPool.js
 * Shared fixed-velocity, bounds-culled, swap-remove-on-hit bullet-pool
 * mechanics reused by every boss's own straight-line projectile pool
 * (NovaBullets, PulsorBullets, SpiralBullets, TetraBullets, ZigzagBullets),
 * plus SpitterBullets.js — a regular (non-boss) enemy's shrapnel fan whose
 * mechanics are identical, despite the "boss" in this file's name.
 * Each boss fires a visually distinct capsule (its own Config-driven
 * color/lineWidth/glowBlur/halfLen and pool size, sometimes a per-shot speed
 * instead of one shared constant), but the underlying spawn/advance/cull/
 * collide/render mechanics are identical — these are plain functions taking
 * the pool instance as their first argument, the same "small shared
 * function" shape EnemyCombat.js/BouncerEnemy.js's stepBouncePhysics
 * already use, rather than a base class. Each boss-bullet file still owns
 * its own `Config` path and MAX pool size; ZigzagBullets.js additionally
 * layers a side-wall bounce feature on top by writing its own update()/
 * checkHit() rather than these shared ones, since bouncing needs an extra
 * per-bullet field these generic versions don't carry.
 */
import { Config } from '../core/Config.js';

/**
 * Allocate a pool's typed arrays, capsule-path pool, and render style onto
 * `pool` (a boss-bullet-pool instance) — called once from its constructor.
 * @param {object} pool
 * @param {number} max  pool size
 * @param {{color:string, lineWidth:number, glowBlur:number, lineCap:string, singleStroke:boolean}} style
 */
export function initBossBulletPool(pool, max, style) {
  pool._max = max;
  pool._x  = new Float32Array(max); // world x
  pool._y  = new Float32Array(max); // world y
  pool._vx = new Float32Array(max); // velocity x (px/sec)
  pool._vy = new Float32Array(max); // velocity y (px/sec)
  pool._count = 0;

  pool._pool = Array.from({ length: max }, () => ({
    points: [[0, 0], [0, 0]],
    closed: false,
  }));

  pool._style = style;
}

/**
 * Spawn one bullet from `(ox, oy)` traveling in direction `angle` (radians)
 * at `speed` (vp/sec). Returns the new bullet's index (so a caller like
 * ZigzagBullets can initialize its own extra per-bullet fields at that same
 * slot), or `undefined` if the pool is full and nothing was spawned.
 * @param {object} pool @param {number} ox @param {number} oy
 * @param {number} angle @param {number} speed
 * @returns {number|undefined}
 */
export function fireBossBullet(pool, ox, oy, angle, speed) {
  if (pool._count >= pool._max) return undefined;
  const i = pool._count++;
  pool._x[i]  = ox;
  pool._y[i]  = oy;
  pool._vx[i] = Math.cos(angle) * speed;
  pool._vy[i] = Math.sin(angle) * speed;
  return i;
}

/** Advance every bullet by `dt` and cull ones that have drifted off-screen (swap-compact). */
export function updateBossBullets(pool, dt) {
  const { width: vW, height: vH } = Config.virtual;
  let w = 0;
  for (let i = 0; i < pool._count; i++) {
    pool._x[i] += pool._vx[i] * dt;
    pool._y[i] += pool._vy[i] * dt;
    if (pool._x[i] > -30 && pool._x[i] < vW + 30 &&
        pool._y[i] > -30 && pool._y[i] < vH + 30) {
      if (w !== i) {
        pool._x[w]  = pool._x[i];  pool._y[w]  = pool._y[i];
        pool._vx[w] = pool._vx[i]; pool._vy[w] = pool._vy[i];
      }
      w++;
    }
  }
  pool._count = w;
}

/**
 * Test whether any active bullet is within `radius` virtual px of `(px, py)`.
 * If one is found, remove it (compact swap) and return `true` — same
 * swap-remove-on-hit shape as EnemyBullets.checkHit.
 * @returns {boolean}
 */
export function checkBossBulletHit(pool, px, py, radius) {
  const r2 = radius * radius;
  for (let i = 0; i < pool._count; i++) {
    const dx = pool._x[i] - px;
    const dy = pool._y[i] - py;
    if (dx * dx + dy * dy <= r2) {
      pool._count--;
      if (i < pool._count) {
        pool._x[i]  = pool._x[pool._count];  pool._y[i]  = pool._y[pool._count];
        pool._vx[i] = pool._vx[pool._count]; pool._vy[i] = pool._vy[pool._count];
      }
      return true;
    }
  }
  return false;
}

/**
 * Re-derive each bullet's capsule endpoints from its current position/
 * velocity (aligned with travel direction) and batch-stroke the whole pool
 * in one call — one shadow-blur GPU pass regardless of bullet count.
 * @param {import('../core/Renderer.js').Renderer} renderer
 * @param {object} pool @param {number} halfLen  capsule half-length, vp
 */
export function renderBossBullets(renderer, pool, halfLen) {
  if (pool._count === 0) return;
  for (let i = 0; i < pool._count; i++) {
    const vx = pool._vx[i], vy = pool._vy[i];
    const spd = Math.sqrt(vx * vx + vy * vy) || 1;
    const nx  = (vx / spd) * halfLen;
    const ny  = (vy / spd) * halfLen;
    const p   = pool._pool[i];
    p.points[0][0] = pool._x[i] - nx;
    p.points[0][1] = pool._y[i] - ny;
    p.points[1][0] = pool._x[i] + nx;
    p.points[1][1] = pool._y[i] + ny;
  }
  renderer.strokePaths(pool._pool, pool._style, pool._count);
}
