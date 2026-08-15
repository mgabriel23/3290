/**
 * TetraBullets.js
 * Dedicated slow-bullet pool for Tetra boss's phase-1 attack (see
 * TetraBoss.js) — its own pool rather than the shared EnemyBullets one,
 * same reasoning as SpiralBullets.js: a slow bullet lingers on screen far
 * longer than a normal Scout's fast, quickly-culled shot, so more
 * accumulate before the oldest ones leave the screen.
 *
 * Fixed-velocity, bounds-culled, swap-remove-on-hit — the shared spawn/
 * advance/cull/collide/render mechanics live in BossBulletPool.js (see that
 * file's doc), reused by every boss's own straight-line projectile pool.
 * The only real difference from SpiralBullets.js is where its tuning comes
 * from (Config.boss.tetra.bullet instead of Config.boss.spiral.bullet).
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.boss.tetra.bullet.poolSize;

export class TetraBullets {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.tetra.bullet;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
  }

  /**
   * Spawn one bullet from `(ox, oy)` traveling in direction `angle` (radians).
   * @param {number} ox @param {number} oy  origin
   * @param {number} angle  travel direction, radians
   */
  fire(ox, oy, angle) {
    const { speed } = Config.boss.tetra.bullet;
    fireBossBullet(this, ox, oy, angle, speed);
  }

  /** @param {number} dt */
  update(dt) {
    updateBossBullets(this, dt);
  }

  /** True while any bullet is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight bullet — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active bullet is within `radius` virtual px of `(px, py)`.
   * If one is found, remove it (compact swap) and return `true` — same
   * swap-remove-on-hit shape as EnemyBullets.checkHit.
   * @param {number} px @param {number} py @param {number} radius
   * @returns {boolean}
   */
  checkHit(px, py, radius) {
    return checkBossBulletHit(this, px, py, radius);
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    renderBossBullets(renderer, this, Config.boss.tetra.bullet.halfLen);
  }
}
