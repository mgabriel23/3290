/**
 * PhoenixSparks.js
 * Third and final generation of Phoenix boss's cascading fireball attack
 * (see PhoenixBoss.js's class doc and PhoenixFireballs.js/PhoenixEmbers.js
 * for the first two generations) — the cluster of small round sparks an
 * ember scatters into once IT detonates (`Config.boss.phoenix.spark.count`
 * per burst, fanned across `spark.spreadAngle` by WaveManager's `onScatter`
 * callback — see PhoenixEmbers.js's own doc for why the fan-out formula
 * lives in WaveManager, not here). A spark never splits again — it's a
 * plain straight-line bullet from here on, so the shared spawn/advance/
 * cull/collide mechanics in BossBulletPool.js (reused by every OTHER boss's
 * own bullet pool) apply directly; only the render differs (a small glowing
 * dot via strokeCircle, matching the round "ember" family look the whole
 * 3-generation cascade shares, rather than BossBulletPool's own capsule
 * renderer).
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit } from './BossBulletPool.js';

const MAX = Config.boss.phoenix.spark.poolSize;

export class PhoenixSparks {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.phoenix.spark;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, glowColor: color });
  }

  /**
   * Spawn one spark from `(ox, oy)` traveling in direction `angle` (radians)
   * at `Config.boss.phoenix.spark.speed` — always launched by an ember's own
   * scatter fan-out (WaveManager's `onScatter`), never aimed directly.
   * @param {number} ox @param {number} oy @param {number} angle
   */
  fire(ox, oy, angle) {
    fireBossBullet(this, ox, oy, angle, Config.boss.phoenix.spark.speed);
  }

  /** @param {number} dt */
  update(dt) {
    updateBossBullets(this, dt);
  }

  /** True while any spark is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight spark — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active spark is within `radius` virtual px of `(px, py)`.
   * If one is found, remove it (compact swap) and return `true`.
   * @param {number} px @param {number} py @param {number} radius
   * @returns {boolean}
   */
  checkHit(px, py, radius) {
    return checkBossBulletHit(this, px, py, radius);
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const { radius } = Config.boss.phoenix.spark;
    for (let i = 0; i < this._count; i++) {
      renderer.strokeCircle(this._x[i], this._y[i], radius, this._style);
    }
  }
}
