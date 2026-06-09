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

const MAX = 64;

export class EnemyBullets {
  constructor() {
    this._ex  = new Float32Array(MAX); // world x
    this._ey  = new Float32Array(MAX); // world y
    this._evx = new Float32Array(MAX); // velocity x (px/sec)
    this._evy = new Float32Array(MAX); // velocity y (px/sec)
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
    const dx  = tx - ox;
    const dy  = ty - oy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const i   = this._count++;
    this._ex[i]  = ox;
    this._ey[i]  = oy;
    this._evx[i] = (dx / len) * speed;
    this._evy[i] = (dy / len) * speed;
  }

  /** @param {number} dt */
  update(dt) {
    const { width: vW, height: vH } = Config.virtual;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._ex[i] += this._evx[i] * dt;
      this._ey[i] += this._evy[i] * dt;
      // Keep alive while inside a generous screen margin
      if (this._ex[i] > -30 && this._ex[i] < vW + 30 &&
          this._ey[i] > -30 && this._ey[i] < vH + 30) {
        if (w !== i) {
          this._ex[w]  = this._ex[i];  this._ey[w]  = this._ey[i];
          this._evx[w] = this._evx[i]; this._evy[w] = this._evy[i];
        }
        w++;
      }
    }
    this._count = w;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const hLen = Config.enemyBullet.halfLen;
    for (let i = 0; i < this._count; i++) {
      // Orient the capsule along the bullet's travel direction
      const vx = this._evx[i], vy = this._evy[i];
      const spd = Math.sqrt(vx * vx + vy * vy) || 1;
      const nx  = (vx / spd) * hLen;
      const ny  = (vy / spd) * hLen;
      const p   = this._pool[i];
      p.points[0][0] = this._ex[i] - nx;
      p.points[0][1] = this._ey[i] - ny;
      p.points[1][0] = this._ex[i] + nx;
      p.points[1][1] = this._ey[i] + ny;
    }
    renderer.strokePaths(this._pool, this._style, this._count);
  }
}
