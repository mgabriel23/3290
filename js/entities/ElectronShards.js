/**
 * ElectronShards.js
 * The shrapnel pool spawned when an ElectronSeeds seed detonates (see
 * ElectronSeeds.js and ElectronBoss.js's class doc) — one burst calls `fire`
 * `Config.boss.electron.shard.count` times in a row, evenly spaced around a
 * full ring, from WaveManager's `_buildProjectilePools` (the seed pool's
 * `onDetonate` callback). Same underlying mechanic and "plain evenly-spaced
 * ring" shape as TetraBullets.js.
 *
 * Fixed-velocity, bounds-culled, swap-remove-on-hit pool — the shared
 * spawn/advance/cull/collide/render mechanics live in BossBulletPool.js (see
 * that file's doc), reused by every boss's own straight-line projectile pool.
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.boss.electron.shard.poolSize;

export class ElectronShards {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.electron.shard;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
  }

  /**
   * Spawn one shrapnel piece from `(ox, oy)` traveling in direction `angle`
   * (radians) at `Config.boss.electron.shard.speed`.
   * @param {number} ox @param {number} oy @param {number} angle
   */
  fire(ox, oy, angle) {
    const { speed } = Config.boss.electron.shard;
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
    renderBossBullets(renderer, this, Config.boss.electron.shard.halfLen);
  }
}
