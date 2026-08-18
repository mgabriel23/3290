/**
 * SpitterSeedBullets.js
 * The round glob fired by Spitter enemies (see Config.enemy.spitter — the
 * green Scout/Rocketeer-family variant, Enemy.js's onFire callback for type
 * 'spitter' — WaveManager._buildFireCallbacks). One glob launches straight
 * at the player's lead-predicted position at fire time (no homing after
 * that, same as EnemyBullet.js), then — once it's been alive for
 * `bullet.spreadDelay` seconds — bursts into a fan of SpitterBullets.js
 * shrapnel (WaveManager's `onScatter`, which reads the glob's current
 * heading so the fan continues roughly the direction it was already
 * traveling, not a blind radial burst).
 *
 * Structurally identical to PhoenixFireballs.js/NovaSeedBullets.js (fixed
 * velocity, bounds-culled, swap-remove-on-hit, TIME-based detonation rather
 * than "on arrival") — the one thing this class doesn't need is a second
 * launch mode (`fireAngle`), since a glob is always aimed at the player,
 * never fired in a fixed direction like a boss's radial volley.
 *
 * Rendered as a growing glowing circle (strokeCircle), not the straight-line
 * capsule every ship-family bullet uses — reads as an unstable glob about to
 * burst rather than a fired shell, and the growth as `age` approaches
 * `spreadDelay` telegraphs the incoming scatter instead of it popping with
 * zero warning.
 */
import { Config } from '../core/Config.js';
import { directionalVelocity } from '../core/vectorMath.js';

const MAX = Config.enemy.spitter.bullet.poolSize;

export class SpitterSeedBullets {
  /** @param {{ onScatter: (x: number, y: number, angle: number) => void }} callbacks */
  constructor({ onScatter }) {
    this._onScatter = onScatter;

    this._x   = new Float32Array(MAX);
    this._y   = new Float32Array(MAX);
    this._vx  = new Float32Array(MAX);
    this._vy  = new Float32Array(MAX);
    this._age = new Float32Array(MAX);
    this._count = 0;

    const { color, lineWidth, glowBlur } = Config.enemy.spitter.bullet;
    this._style = { color, lineWidth, glowBlur, glowColor: color };
  }

  /**
   * Spawn one glob from `(ox, oy)` straight at `(tx, ty)` — the player's
   * lead-predicted position at fire time, no re-aiming after launch.
   * @param {number} ox @param {number} oy  origin (Spitter centre)
   * @param {number} tx @param {number} ty  lead-predicted target at fire time
   */
  fire(ox, oy, tx, ty) {
    if (this._count >= MAX) return;
    const { speed } = Config.enemy.spitter.bullet;
    const [vx, vy] = directionalVelocity(ox, oy, tx, ty, speed);
    const i = this._count++;
    this._x[i]   = ox;
    this._y[i]   = oy;
    this._vx[i]  = vx;
    this._vy[i]  = vy;
    this._age[i] = 0;
  }

  /** @param {number} dt */
  update(dt) {
    const { spreadDelay, maxLife } = Config.enemy.spitter.bullet;
    const { width: vW, height: vH } = Config.virtual;

    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;
      this._age[i] += dt;

      if (this._age[i] >= spreadDelay) {
        this._onScatter(this._x[i], this._y[i], Math.atan2(this._vy[i], this._vx[i]));
        continue; // consumed by the scatter — drop, no keep-alive compaction
      }
      // maxLife is a safety net (same convention as EnemyBullet/Rockets) —
      // spreadDelay should always fire first in practice.
      if (this._age[i] >= maxLife ||
          this._x[i] < -30 || this._x[i] > vW + 30 || this._y[i] < -30 || this._y[i] > vH + 30) {
        continue; // drifted off-screen (or timed out) before it ever burst — silently culled, like any other bullet
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

  /** True while any glob is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight glob — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active glob is within `radius` virtual px of `(px, py)`
   * — a direct hit consumes it (no scatter) — same swap-remove-on-hit shape
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
    const { spreadDelay, radius, growthMult } = Config.enemy.spitter.bullet;
    for (let i = 0; i < this._count; i++) {
      const t = Math.min(1, this._age[i] / spreadDelay);
      const r = radius * (1 + (growthMult - 1) * t);
      renderer.strokeCircle(this._x[i], this._y[i], r, this._style);
    }
  }
}
