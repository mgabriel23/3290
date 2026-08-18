/**
 * SpitterBullets.js
 * The shrapnel fan a Spitter glob bursts into (see SpitterSeedBullets.js and
 * Config.enemy.spitter's own doc) — WaveManager's `onScatter` callback fires
 * `Config.enemy.spitter.fragment.count` times in a row, each at its own
 * angle across `fragment.spreadAngle`, centered on the glob's heading at the
 * instant it burst.
 *
 * Fixed-velocity, bounds-culled, swap-remove-on-hit pool — the shared spawn/
 * advance/cull/collide/render mechanics live in BossBulletPool.js (see that
 * file's doc), the same plain-functions-over-a-pool-instance shape reused by
 * every boss's own straight-line projectile pool (NovaBullets, PulsorBullets,
 * SpiralBullets, TetraBullets, ZigzagBullets) — Spitter isn't a boss, but the
 * underlying mechanics (fixed angle+speed, bounds cull, swap-remove-on-hit)
 * are identical, so there's nothing boss-specific to reimplement here.
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.enemy.spitter.fragment.poolSize;

export class SpitterBullets {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.enemy.spitter.fragment;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
  }

  /**
   * Spawn one shrapnel piece from `(ox, oy)` traveling in direction `angle`
   * (radians) at `Config.enemy.spitter.fragment.speed`.
   * @param {number} ox @param {number} oy @param {number} angle
   */
  fire(ox, oy, angle) {
    fireBossBullet(this, ox, oy, angle, Config.enemy.spitter.fragment.speed);
  }

  /** @param {number} dt */
  update(dt) {
    updateBossBullets(this, dt);
  }

  /** True while any shrapnel piece is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight shrapnel piece — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active shrapnel piece is within `radius` virtual px of
   * `(px, py)`. If one is found, remove it (compact swap) and return `true`
   * — same swap-remove-on-hit shape as EnemyBullets.checkHit.
   * @param {number} px @param {number} py @param {number} radius
   * @returns {boolean}
   */
  checkHit(px, py, radius) {
    return checkBossBulletHit(this, px, py, radius);
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    renderBossBullets(renderer, this, Config.enemy.spitter.fragment.halfLen);
  }
}
