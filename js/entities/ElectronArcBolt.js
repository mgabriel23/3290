/**
 * ElectronArcBolt.js
 * Electron boss's phase-1 BACK-tip attack (see ElectronBoss.js) — a bolt
 * fired straight at the player's position at the instant of firing (no lead
 * prediction, same idiom as the front tip's own ElectronBolts), except it
 * reflects off the LEFT/RIGHT screen edges (not top/bottom) up to
 * `arc.maxBounces` times — tracked per-bullet in `_bounces` — before it's
 * allowed to fly past that edge and get culled like any other bullet. A
 * bounce only flips the horizontal velocity component; vertical velocity is
 * untouched, same "sends the bullet on toward a different spot ahead rather
 * than back the way it came" mechanic ZigzagBullets.js uses — this class is
 * that same mechanic, just launched player-aimed (`fire(ox,oy,tx,ty)`)
 * instead of ZigzagBoss's fixed turret angles (`fire(ox,oy,angle)`).
 *
 * That extra per-bullet `_bounces` field is why this class writes its own
 * `update`/`checkHit` instead of reusing BossBulletPool's generic versions
 * (which only know about x/y/vx/vy) — it still reuses `initBossBulletPool`
 * and `renderBossBullets` for everything that doesn't need the extra field.
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.boss.electron.arc.poolSize;

export class ElectronArcBolt {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.electron.arc;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
    this._bounces = new Uint8Array(MAX); // side-wall bounces used so far, per bullet
  }

  /**
   * Spawn one bolt from `(ox, oy)` straight at `(tx, ty)` — the player's
   * position at fire time, no re-aiming after launch.
   * @param {number} ox @param {number} oy  origin (the hull's back spike tip)
   * @param {number} tx @param {number} ty  player position at fire time
   */
  fire(ox, oy, tx, ty) {
    const { speed } = Config.boss.electron.arc;
    const angle = Math.atan2(ty - oy, tx - ox);
    const i = fireBossBullet(this, ox, oy, angle, speed);
    if (i !== undefined) this._bounces[i] = 0;
  }

  /** @param {number} dt */
  update(dt) {
    const { width: vW, height: vH } = Config.virtual;
    const { maxBounces } = Config.boss.electron.arc;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;

      // Reflect off the left/right screen edges only, and only until the
      // bounce budget runs out — see class doc.
      if (this._bounces[i] < maxBounces) {
        if (this._x[i] < 0) { this._x[i] = 0; this._vx[i] = Math.abs(this._vx[i]); this._bounces[i]++; }
        else if (this._x[i] > vW) { this._x[i] = vW; this._vx[i] = -Math.abs(this._vx[i]); this._bounces[i]++; }
      }

      if (this._x[i] > -30 && this._x[i] < vW + 30 &&
          this._y[i] > -30 && this._y[i] < vH + 30) {
        if (w !== i) {
          this._x[w]  = this._x[i];  this._y[w]  = this._y[i];
          this._vx[w] = this._vx[i]; this._vy[w] = this._vy[i];
          this._bounces[w] = this._bounces[i];
        }
        w++;
      }
    }
    this._count = w;
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
    const r2 = radius * radius;
    for (let i = 0; i < this._count; i++) {
      const dx = this._x[i] - px;
      const dy = this._y[i] - py;
      if (dx * dx + dy * dy <= r2) {
        this._count--;
        if (i < this._count) {
          this._x[i]  = this._x[this._count];  this._y[i]  = this._y[this._count];
          this._vx[i] = this._vx[this._count]; this._vy[i] = this._vy[this._count];
          this._bounces[i] = this._bounces[this._count];
        }
        return true;
      }
    }
    return false;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    renderBossBullets(renderer, this, Config.boss.electron.arc.halfLen);
  }
}
