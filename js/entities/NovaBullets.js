/**
 * NovaBullets.js
 * The fragment pool spawned when a Nova seed bullet detonates (see
 * NovaSeedBullets.js and NovaBoss.js's class doc for the golden-angle/
 * speed-step spiral technique) — one burst calls `fire` up to
 * `Config.boss.nova.fragment.count` times in a row, each with its own
 * angle and speed, from WaveManager's `_buildProjectilePools` (the seed
 * pool's `onDetonate` callback).
 *
 * Fixed-velocity, bounds-culled, swap-remove-on-hit pool — the shared
 * spawn/advance/cull/collide/render mechanics live in BossBulletPool.js
 * (see that file's doc), reused by every boss's own straight-line
 * projectile pool. `fire` takes an explicit per-shot `speed` instead of
 * reading one shared Config constant — every fragment in a burst launches
 * at a DIFFERENT speed on purpose (see NovaBoss's class doc), so there's no
 * single shared value to read.
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.boss.nova.fragment.poolSize;

export class NovaBullets {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.nova.fragment;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
  }

  /**
   * Spawn one fragment from `(ox, oy)` traveling in direction `angle`
   * (radians) at `speed` (vp/sec) — see NovaBoss's class doc for why speed
   * is per-shot rather than a shared constant.
   * @param {number} ox @param {number} oy @param {number} angle @param {number} speed
   */
  fire(ox, oy, angle, speed) {
    fireBossBullet(this, ox, oy, angle, speed);
  }

  /** @param {number} dt */
  update(dt) {
    updateBossBullets(this, dt);
  }

  /** True while any fragment is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight fragment — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active fragment is within `radius` virtual px of
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
    renderBossBullets(renderer, this, Config.boss.nova.fragment.halfLen);
  }
}
