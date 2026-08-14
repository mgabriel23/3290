/**
 * EnemyBullet.js
 * Pool of directed projectiles fired by enemies toward the player.
 *
 * Each bullet stores a pre-normalised velocity (vx, vy) so it travels
 * in a fixed direction at constant speed after being fired — no homing.
 * The pool is shared across every enemy in a wave (WaveManager owns one
 * instance), keeping draw-call count flat regardless of enemy count.
 * Rendering follows the same bake-on-spawn, mutate-in-place pattern as
 * Bullets.js: pool objects are pre-allocated and their geometry is
 * written each frame, so render() produces zero heap allocations.
 */
import { Config } from '../core/Config.js';
import { directionalVelocity } from '../core/vectorMath.js';

const MAX = 64;

export class EnemyBullets {
  constructor() {
    this._x  = new Float32Array(MAX); // world x
    this._y  = new Float32Array(MAX); // world y
    this._vx = new Float32Array(MAX); // velocity x (px/sec)
    this._vy = new Float32Array(MAX); // velocity y (px/sec)
    this._count = 0;

    this._pool = Array.from({ length: MAX }, () => ({
      points: [[0, 0], [0, 0]],
      closed: false,
    }));

    const { color, lineWidth, glowBlur } = Config.enemyBullet;
    this._style = { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true };
  }

  /**
   * Spawn one bullet aimed from `(ox, oy)` toward `(tx, ty)`.
   * @param {number} ox @param {number} oy  origin (enemy centre)
   * @param {number} tx @param {number} ty  target (player centre)
   */
  fire(ox, oy, tx, ty) {
    if (this._count >= MAX) return;
    const { speed } = Config.enemyBullet;
    const [vx, vy] = directionalVelocity(ox, oy, tx, ty, speed);
    const i = this._count++;
    this._x[i]  = ox;
    this._y[i]  = oy;
    this._vx[i] = vx;
    this._vy[i] = vy;
  }

  /** @param {number} dt */
  update(dt) {
    const { width: vW, height: vH } = Config.virtual;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;
      // Keep alive while inside a generous screen margin
      if (this._x[i] > -30 && this._x[i] < vW + 30 &&
          this._y[i] > -30 && this._y[i] < vH + 30) {
        if (w !== i) {
          this._x[w]  = this._x[i];  this._y[w]  = this._y[i];
          this._vx[w] = this._vx[i]; this._vy[w] = this._vy[i];
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
   * swap-remove-on-hit shape as Bullets.checkHit, mirrored here for the
   * player-vs-enemy-bullet direction (used by WaveManager.checkPlayerHit).
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
        }
        return true;
      }
    }
    return false;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const hLen = Config.enemyBullet.halfLen;
    for (let i = 0; i < this._count; i++) {
      // Orient the capsule along the bullet's travel direction
      const vx = this._vx[i], vy = this._vy[i];
      const spd = Math.sqrt(vx * vx + vy * vy) || 1;
      const nx  = (vx / spd) * hLen;
      const ny  = (vy / spd) * hLen;
      const p   = this._pool[i];
      p.points[0][0] = this._x[i] - nx;
      p.points[0][1] = this._y[i] - ny;
      p.points[1][0] = this._x[i] + nx;
      p.points[1][1] = this._y[i] + ny;
    }
    renderer.strokePaths(this._pool, this._style, this._count);
  }
}
