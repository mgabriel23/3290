/**
 * NovaSeedBullets.js
 * The "seed" half of Nova boss's attack (see NovaBoss.js) — a slow bullet
 * that detonates into a spiral burst of fragments (NovaBullets.js) once
 * it's been alive for `seed.spreadDelay` seconds. Two launch modes share
 * this one pool (and its detonation/render/collision behavior is identical
 * either way — a phase-2 seed is not a different projectile, just a
 * differently-AIMED instance of the same one):
 *   `fire(ox, oy, tx, ty)`     — phase 1: straight at the player's position
 *                                at fire time (no homing, no lead prediction).
 *   `fireAngle(ox, oy, angle)` — phase 2: a fixed direction, one per hull
 *                                side (see NovaBoss._fireVolley) — the
 *                                player's position is irrelevant to a
 *                                radial volley.
 * Detonation is purely TIME-based, not "on arrival" — unlike
 * DrifterProjectiles' orb (which impacts a locked target point), a seed
 * that's still in flight when its timer runs out just bursts wherever it
 * currently is, which may be nowhere near the player if they've moved.
 *
 * Structurally a straight-line pooled bullet like EnemyBullet/SpiralBullets/
 * TetraBullets (fixed velocity, bounds-culled, swap-remove-on-hit via
 * `checkHit`), plus one extra per-bullet `age` timer for the detonation
 * clock — closest in spirit to Rockets.js's timeout-detonation branch, just
 * without the homing/proximity half of that class (a seed never steers).
 * `onDetonate(x, y)` is a fire-and-forget callback WaveManager wires in
 * `_buildProjectilePools` to fan the fragment pool out into a spiral (see
 * that method's own doc) — this class only reports WHEN a burst happens,
 * never what it looks like, same separation Rockets.js already keeps
 * between "detonate" and "what WaveManager does about it."
 *
 * Rendered individually (strokeCircle per bullet, like DrifterProjectiles),
 * not batched — at most a handful are ever in flight at once (see
 * Config.boss.nova.seed.poolSize's own doc) — with a growing radius as
 * `age` approaches `spreadDelay`, telegraphing the incoming burst instead of
 * letting it pop with zero warning.
 */
import { Config } from '../core/Config.js';
import { directionalVelocity } from '../core/vectorMath.js';

const MAX = Config.boss.nova.seed.poolSize;

export class NovaSeedBullets {
  /** @param {{ onDetonate: (x: number, y: number) => void }} callbacks */
  constructor({ onDetonate }) {
    this._onDetonate = onDetonate;

    this._x   = new Float32Array(MAX);
    this._y   = new Float32Array(MAX);
    this._vx  = new Float32Array(MAX);
    this._vy  = new Float32Array(MAX);
    this._age = new Float32Array(MAX);
    this._count = 0;

    const { color, lineWidth, glowBlur } = Config.boss.nova.seed;
    // Mutable style — radius/alpha rewritten per-bullet each render() call.
    this._style = { color, lineWidth, glowBlur, glowColor: color };
  }

  /**
   * Launch one seed from `(ox, oy)` straight at the player's position at
   * this instant — no lead prediction, no re-aiming after launch. Phase 1.
   * @param {number} ox @param {number} oy  origin (boss centre)
   * @param {number} tx @param {number} ty  player position at fire time
   */
  fire(ox, oy, tx, ty) {
    const { speed } = Config.boss.nova.seed;
    const [vx, vy] = directionalVelocity(ox, oy, tx, ty, speed);
    this._spawn(ox, oy, vx, vy);
  }

  /**
   * Launch one seed from `(ox, oy)` in a fixed `angle` (radians) — phase 2's
   * radial volley, one per hull side, independent of where the player is.
   * @param {number} ox @param {number} oy @param {number} angle
   */
  fireAngle(ox, oy, angle) {
    const { speed } = Config.boss.nova.seed;
    this._spawn(ox, oy, Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  _spawn(ox, oy, vx, vy) {
    if (this._count >= MAX) return;
    const i = this._count++;
    this._x[i]   = ox;
    this._y[i]   = oy;
    this._vx[i]  = vx;
    this._vy[i]  = vy;
    this._age[i] = 0;
  }

  /** @param {number} dt */
  update(dt) {
    const { spreadDelay } = Config.boss.nova.seed;
    const { width: vW, height: vH } = Config.virtual;

    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;
      this._age[i] += dt;

      if (this._age[i] >= spreadDelay) {
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
    const { spreadDelay, radius, growthMult } = Config.boss.nova.seed;
    for (let i = 0; i < this._count; i++) {
      const t = Math.min(1, this._age[i] / spreadDelay);
      const r = radius * (1 + (growthMult - 1) * t);
      renderer.strokeCircle(this._x[i], this._y[i], r, this._style);
    }
  }
}
