/**
 * ZigzagBullets.js
 * Dedicated bullet pool for Zigzag boss's 'firing' turret fire (see
 * ZigzagBoss.js) — built on the same fixed-velocity, bounds-culled,
 * swap-remove-on-hit mechanics every other boss bullet class uses (see
 * BossBulletPool.js, shared by NovaBullets/PulsorBullets/SpiralBullets/
 * TetraBullets too), with one addition: each bullet reflects off the
 * LEFT/RIGHT screen edges (not top/bottom) up to
 * `Config.boss.zigzag.bullet.maxBounces` times — tracked per-bullet in
 * `_bounces` — before it's allowed to fly past that edge and get culled
 * like any other bullet. A bounce only flips the horizontal velocity
 * component; vertical velocity is untouched, so each bounce sends the
 * bullet on toward a different spot ahead rather than back the way it came.
 *
 * That extra per-bullet `_bounces` field is why this class writes its own
 * `update`/`checkHit` instead of reusing BossBulletPool's generic versions
 * (which only know about x/y/vx/vy) — it still reuses `initBossBulletPool`,
 * `fireBossBullet`, and `renderBossBullets` for everything that doesn't
 * need the extra field.
 */
import { Config } from '../core/Config.js';
import { initBossBulletPool, fireBossBullet, renderBossBullets } from './BossBulletPool.js';

const MAX = Config.boss.zigzag.bullet.poolSize;

export class ZigzagBullets {
  constructor() {
    const { color, lineWidth, glowBlur } = Config.boss.zigzag.bullet;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
    this._bounces = new Uint8Array(MAX); // side-wall bounces used so far, per bullet
  }

  /**
   * Spawn one bullet from `(ox, oy)` traveling in direction `angle` (radians).
   * @param {number} ox @param {number} oy  origin
   * @param {number} angle  travel direction, radians
   */
  fire(ox, oy, angle) {
    const { speed } = Config.boss.zigzag.bullet;
    const i = fireBossBullet(this, ox, oy, angle, speed);
    if (i !== undefined) this._bounces[i] = 0;
  }

  /** @param {number} dt */
  update(dt) {
    const { width: vW, height: vH } = Config.virtual;
    const { maxBounces } = Config.boss.zigzag.bullet;
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
    renderBossBullets(renderer, this, Config.boss.zigzag.bullet.halfLen);
  }
}
