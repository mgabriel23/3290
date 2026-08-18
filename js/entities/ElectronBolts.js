/**
 * ElectronBolts.js
 * Electron boss's phase-1 FRONT-tip attack (see ElectronBoss.js) — a single
 * slow-ish bolt fired straight at the player's position at the instant of
 * firing, no lead prediction, same "aim once, no homing" idiom as
 * NovaSeedBullets'/PhoenixFireballs' own phase-1 shots. Reuses
 * BossBulletPool.js's shared spawn/advance/cull/collide mechanics (the only
 * difference is `fire` takes a target POINT instead of a raw angle,
 * converting to one before handing off to the shared pool), but renders as a
 * growing-glow circle (strokeCircle) instead of BossBulletPool's own
 * straight-line capsule — reads more like a spark than a fired shell, same
 * reasoning as PhoenixFireballs' own round fireball.
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets, checkBossBulletHit } from './BossBulletPool.js';

const MAX = Config.boss.electron.bolt.poolSize;

export class ElectronBolts {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.electron.bolt;
    // Still uses initBossBulletPool for its typed-array position/velocity
    // storage and generic advance/cull/collide (fireBossBullet/
    // updateBossBullets/checkBossBulletHit) — only the capsule-path pool/
    // style it also allocates goes unused here, since render() below draws
    // circles directly instead of calling BossBulletPool's renderBossBullets.
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
  }

  /**
   * Spawn one bolt from `(ox, oy)` straight at `(tx, ty)` — the player's
   * position at fire time, no re-aiming after launch.
   * @param {number} ox @param {number} oy  origin (the hull's front spike tip)
   * @param {number} tx @param {number} ty  player position at fire time
   */
  fire(ox, oy, tx, ty) {
    const { speed } = Config.boss.electron.bolt;
    const angle = Math.atan2(ty - oy, tx - ox);
    fireBossBullet(this, ox, oy, angle, speed);
  }

  /** @param {number} dt */
  update(dt) {
    updateBossBullets(this, dt);
  }

  /** True while any bolt is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight bolt — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active bolt is within `radius` virtual px of `(px, py)`.
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
    if (this._count === 0) return;
    const { color, lineWidth, glowBlur, radius } = Config.boss.electron.bolt;
    const style = { color, lineWidth, glowBlur, glowColor: color };
    for (let i = 0; i < this._count; i++) {
      renderer.strokeCircle(this._x[i], this._y[i], radius, style);
    }
  }
}
