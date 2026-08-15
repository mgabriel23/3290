/**
 * PulsorBullets.js
 * Shared pulse-orb pool for Pulsor boss's two attacks (see PulsorBoss.js) —
 * phase 1's expanding C-shaped wave and phase 2's rotating full-ring pulses
 * both fire into this same pool, one bullet at a time via `fire(ox, oy,
 * angle, speed)`. Fixed-velocity, bounds-culled, swap-remove-on-hit — the
 * shared spawn/advance/cull/collide/render mechanics live in
 * BossBulletPool.js (see that file's doc), reused by every boss's own
 * straight-line projectile pool (NovaBullets/SpiralBullets/TetraBullets
 * included).
 *
 * The only real difference from those is styling, not mechanics:
 * `Config.boss.pulsor.bullet` is tuned as a short, thick, heavily-glowing
 * capsule (small `halfLen`, large `lineWidth`) so it reads as a round blob
 * of energy — a "pulse" — rather than an elongated streak like an ordinary
 * bullet, per Pulsor's whole design (see PulsorBoss.js's class doc).
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.boss.pulsor.wave.poolSize + Config.boss.pulsor.ring.poolSize;

export class PulsorBullets {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.pulsor.bullet;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
  }

  /**
   * Spawn one pulse from `(ox, oy)` traveling in direction `angle` (radians) at `speed`.
   * @param {number} ox @param {number} oy @param {number} angle @param {number} speed
   */
  fire(ox, oy, angle, speed) {
    fireBossBullet(this, ox, oy, angle, speed);
  }

  /** @param {number} dt */
  update(dt) {
    updateBossBullets(this, dt);
  }

  /** True while any pulse is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight pulse — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active pulse is within `radius` virtual px of `(px, py)`.
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
    renderBossBullets(renderer, this, Config.boss.pulsor.bullet.halfLen);
  }
}
