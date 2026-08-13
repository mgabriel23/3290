/**
 * NovaBullets.js
 * The fragment pool spawned when a Nova seed bullet detonates (see
 * NovaSeedBullets.js and NovaBoss.js's class doc for the golden-angle/
 * speed-step spiral technique) — one burst calls `fire` up to
 * `Config.boss.nova.fragment.count` times in a row, each with its own
 * angle and speed, from WaveManager's `_buildProjectilePools` (the seed
 * pool's `onDetonate` callback).
 *
 * Structurally identical to SpiralBullets.js/TetraBullets.js (fixed
 * velocity, bounds-culled, swap-remove-on-hit) except `fire` takes an
 * explicit per-shot `speed` instead of reading one shared Config constant —
 * every fragment in a burst launches at a DIFFERENT speed on purpose (see
 * NovaBoss's class doc), so there's no single shared value to read.
 */
import { Config } from '../core/Config.js';

const MAX = Config.boss.nova.fragment.poolSize;

export class NovaBullets {
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

    const { color, lineWidth, glowBlur } = Config.boss.nova.fragment;
    this._style = { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true };
  }

  /**
   * Spawn one fragment from `(ox, oy)` traveling in direction `angle`
   * (radians) at `speed` (vp/sec) — see NovaBoss's class doc for why speed
   * is per-shot rather than a shared constant.
   * @param {number} ox @param {number} oy @param {number} angle @param {number} speed
   */
  fire(ox, oy, angle, speed) {
    if (this._count >= MAX) return;
    const i = this._count++;
    this._x[i]  = ox;
    this._y[i]  = oy;
    this._vx[i] = Math.cos(angle) * speed;
    this._vy[i] = Math.sin(angle) * speed;
  }

  /** @param {number} dt */
  update(dt) {
    const { width: vW, height: vH } = Config.virtual;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;
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

  /** True while any fragment is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /**
   * Test whether any active fragment is within `radius` virtual px of
   * `(px, py)`. If one is found, remove it (compact swap) and return
   * `true` — same swap-remove-on-hit shape as EnemyBullets.checkHit.
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
    const hLen = Config.boss.nova.fragment.halfLen;
    for (let i = 0; i < this._count; i++) {
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
