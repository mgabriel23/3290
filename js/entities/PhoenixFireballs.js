/**
 * PhoenixFireballs.js
 * Phoenix boss's phase-1 attack (see PhoenixBoss.js) — a single fireball
 * fired from the beak straight at the player's position at the instant of
 * firing, no lead prediction, same "aim once, no homing" idiom as
 * NovaSeedBullets' phase-1 seed. Structurally identical to every other
 * boss's straight-line bullet pool (TetraBullets/ZigzagBullets/
 * SpiralBullets/NovaBullets) — the shared spawn/advance/cull/collide/render
 * mechanics live in BossBulletPool.js (see that file's doc) — the only
 * difference is `fire` takes a target POINT instead of a raw angle,
 * converting to one before handing off to the shared pool.
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.boss.phoenix.fireball.poolSize;

export class PhoenixFireballs {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.phoenix.fireball;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
  }

  /**
   * Spawn one fireball from `(ox, oy)` straight at `(tx, ty)` — the
   * player's position at fire time, no re-aiming after launch.
   * @param {number} ox @param {number} oy  origin (boss's beak)
   * @param {number} tx @param {number} ty  player position at fire time
   */
  fire(ox, oy, tx, ty) {
    const { speed } = Config.boss.phoenix.fireball;
    const angle = Math.atan2(ty - oy, tx - ox);
    fireBossBullet(this, ox, oy, angle, speed);
  }

  /** @param {number} dt */
  update(dt) {
    updateBossBullets(this, dt);
  }

  /** True while any fireball is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight fireball — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active fireball is within `radius` virtual px of `(px, py)`.
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
    renderBossBullets(renderer, this, Config.boss.phoenix.fireball.halfLen);
  }
}
