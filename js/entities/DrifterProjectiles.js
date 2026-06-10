/**
 * DrifterProjectiles.js
 * Pool of slow orbs spat by Drifter clones toward a locked target position.
 * Each orb travels in a straight line at a fixed speed; on arrival it calls
 * `onImpact(x, y)` (WaveManager wires this to a particle burst) and is
 * removed. Shared across every Drifter clone, same pooled-array shape as
 * EnemyBullets/Rockets — zero per-frame heap allocation.
 */
import { Config } from '../core/Config.js';

const MAX = 16;

export class DrifterProjectiles {
  /**
   * @param {{ onImpact: (x: number, y: number) => void }} callbacks
   */
  constructor({ onImpact }) {
    this._onImpact = onImpact;

    this._x  = new Float32Array(MAX);
    this._y  = new Float32Array(MAX);
    this._vx = new Float32Array(MAX);
    this._vy = new Float32Array(MAX);
    this._tx = new Float32Array(MAX);
    this._ty = new Float32Array(MAX);
    this._count = 0;

    const { color, glowBlur } = Config.enemy.drifter;
    this._style = { color, lineWidth: 2.5, glowBlur, glowColor: color };
  }

  /**
   * Launch one orb from `(ox, oy)` toward the locked target `(tx, ty)`.
   */
  fire(ox, oy, tx, ty) {
    if (this._count >= MAX) return;
    const { projectileSpeed } = Config.enemy.drifter;
    const dx  = tx - ox;
    const dy  = ty - oy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const i   = this._count++;
    this._x[i]  = ox;
    this._y[i]  = oy;
    this._vx[i] = (dx / len) * projectileSpeed;
    this._vy[i] = (dy / len) * projectileSpeed;
    this._tx[i] = tx;
    this._ty[i] = ty;
  }

  /** @param {number} dt */
  update(dt) {
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      const px = this._x[i], py = this._y[i];
      const nx = px + this._vx[i] * dt;
      const ny = py + this._vy[i] * dt;

      // Arrived if this step crosses the target (compare signed offset before/after).
      const dxOld = this._tx[i] - px,  dyOld = this._ty[i] - py;
      const dxNew = this._tx[i] - nx,  dyNew = this._ty[i] - ny;
      const arrived = (dxOld * this._vx[i] + dyOld * this._vy[i]) <= 0
                   || (dxNew * this._vx[i] + dyNew * this._vy[i]) <= 0;

      if (arrived) {
        this._onImpact(this._tx[i], this._ty[i]);
        continue;
      }

      this._x[i] = nx;
      this._y[i] = ny;

      if (w !== i) {
        this._x[w]  = this._x[i];  this._y[w]  = this._y[i];
        this._vx[w] = this._vx[i]; this._vy[w] = this._vy[i];
        this._tx[w] = this._tx[i]; this._ty[w] = this._ty[i];
      }
      w++;
    }
    this._count = w;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    const { projectileRadius } = Config.enemy.drifter;
    for (let i = 0; i < this._count; i++) {
      renderer.strokeCircle(this._x[i], this._y[i], projectileRadius, this._style);
    }
  }

  /** True while any orb is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }
}
