/**
 * ElectronSeeds.js
 * Electron boss's phase-1 LEFT/RIGHT-tip attack (see ElectronBoss.js) — a
 * slow seed bolt launched outward along the tip's own side direction (NOT
 * aimed at the player — same "launched by angle" idiom TetraSeedBullets.js
 * uses for Tetra's own hull-side seeds), that detonates into a full ring of
 * shrapnel (ElectronShards.js) once it's been alive for `seed.scatterDelay`
 * seconds.
 *
 * Detonation is purely TIME-based, not "on arrival" — same reasoning as
 * TetraSeedBullets/NovaSeedBullets: a seed still in flight when its timer
 * runs out just bursts wherever it currently is.
 *
 * Structurally identical to TetraSeedBullets.js: a straight-line pooled
 * bullet (fixed velocity, bounds-culled, swap-remove-on-hit) plus one extra
 * per-bullet `age` timer for the detonation clock. `onDetonate(x, y)` is a
 * fire-and-forget callback WaveManager wires in `_buildProjectilePools` to
 * fan the shrapnel pool out into an even ring (see that method's own doc) —
 * this class only reports WHEN a burst happens, never what it looks like.
 *
 * Rendered individually (strokeCircle per bullet, like TetraSeedBullets),
 * with a growing radius as `age` approaches `scatterDelay`, telegraphing the
 * incoming burst instead of letting it pop with zero warning.
 */
import { Config } from '../core/Config.js';

const MAX = Config.boss.electron.seed.poolSize;

export class ElectronSeeds {
  /** @param {{ onDetonate: (x: number, y: number) => void }} callbacks */
  constructor({ onDetonate }) {
    this._onDetonate = onDetonate;

    this._x   = new Float32Array(MAX);
    this._y   = new Float32Array(MAX);
    this._vx  = new Float32Array(MAX);
    this._vy  = new Float32Array(MAX);
    this._age = new Float32Array(MAX);
    this._count = 0;

    const { color, lineWidth, glowBlur } = Config.boss.electron.seed;
    this._style = { color, lineWidth, glowBlur, glowColor: color };
  }

  /**
   * Launch one seed from `(ox, oy)` in a fixed `angle` (radians) — the
   * hull's own left/right tip direction at fire time, independent of where
   * the player is.
   * @param {number} ox @param {number} oy @param {number} angle
   */
  fireAngle(ox, oy, angle) {
    const { speed } = Config.boss.electron.seed;
    if (this._count >= MAX) return;
    const i = this._count++;
    this._x[i]   = ox;
    this._y[i]   = oy;
    this._vx[i]  = Math.cos(angle) * speed;
    this._vy[i]  = Math.sin(angle) * speed;
    this._age[i] = 0;
  }

  /** @param {number} dt */
  update(dt) {
    const { scatterDelay } = Config.boss.electron.seed;
    const { width: vW, height: vH } = Config.virtual;

    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;
      this._age[i] += dt;

      if (this._age[i] >= scatterDelay) {
        this._onDetonate(this._x[i], this._y[i]);
        continue; // consumed by the burst — drop, no keep-alive compaction
      }
      if (this._x[i] < -30 || this._x[i] > vW + 30 || this._y[i] < -30 || this._y[i] > vH + 30) {
        continue; // drifted off-screen before it ever got to burst — silently culled, like any other bullet
      }

      if (w !== i) {
        this._x[w]  = this._x[i];  this._y[w]  = this._y[i];
        this._vx[w] = this._vx[i]; this._vy[w] = this._vy[i];
        this._age[w] = this._age[i];
      }
      w++;
    }
    this._count = w;
  }

  /** True while any seed is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight seed — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active seed is within `radius` virtual px of `(px, py)`
   * — a direct hit consumes it (no burst) — same swap-remove-on-hit shape
   * as every other bullet pool's `checkHit`.
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
          this._age[i] = this._age[this._count];
        }
        return true;
      }
    }
    return false;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const { scatterDelay, radius, growthMult } = Config.boss.electron.seed;
    for (let i = 0; i < this._count; i++) {
      const t = Math.min(1, this._age[i] / scatterDelay);
      const r = radius * (1 + (growthMult - 1) * t);
      renderer.strokeCircle(this._x[i], this._y[i], r, this._style);
    }
  }
}
