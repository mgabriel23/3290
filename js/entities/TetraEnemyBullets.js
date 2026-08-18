/**
 * TetraEnemyBullets.js
 * The shrapnel pool spawned when a normal Tetra enemy's seed bullet scatters
 * (see TetraEnemySeedBullets.js and TetraEnemy.js's class doc) — one burst
 * calls `fire` `Config.enemy.tetra.fragment.count` times in a row, evenly
 * spaced around a full ring, from WaveManager's `_buildProjectilePools` (the
 * seed pool's `onDetonate` callback). A separate pool from the boss's own
 * TetraBullets.js, at this type's own (weaker) Config.enemy.tetra.fragment
 * tuning — several Tetra clones can be alive at once sharing this ONE pool.
 *
 * Fixed-velocity, bounds-culled, swap-remove-on-hit pool — the shared
 * spawn/advance/cull/collide/render mechanics live in BossBulletPool.js (see
 * that file's doc), reused here the same way every boss's own straight-line
 * projectile pool does.
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.enemy.tetra.fragment.poolSize;

export class TetraEnemyBullets {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.enemy.tetra.fragment;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
  }

  /**
   * Spawn one shrapnel piece from `(ox, oy)` traveling in direction `angle`
   * (radians) at `Config.enemy.tetra.fragment.speed`.
   * @param {number} ox @param {number} oy @param {number} angle
   */
  fire(ox, oy, angle) {
    const { speed } = Config.enemy.tetra.fragment;
    fireBossBullet(this, ox, oy, angle, speed);
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
   * `(px, py)`. If one is found, remove it (compact swap) and return
   * `true` — same swap-remove-on-hit shape as EnemyBullets.checkHit.
   * @param {number} px @param {number} py @param {number} radius
   * @returns {boolean}
   */
  checkHit(px, py, radius) {
    return checkBossBulletHit(this, px, py, radius);
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    renderBossBullets(renderer, this, Config.enemy.tetra.fragment.halfLen);
  }
}
