/**
 * PhoenixEmbers.js
 * Second generation of Phoenix boss's cascading fireball attack (see
 * PhoenixBoss.js's class doc) — the fan of round embers a Phoenix fireball
 * (PhoenixFireballs.js) spreads into once it's been alive for
 * `Config.boss.phoenix.fireball.spreadDelay` seconds. Structurally the same
 * "pooled bullet with an age-based detonation clock" shape
 * NovaSeedBullets/PhoenixFireballs use (fixed velocity, bounds-culled,
 * swap-remove-on-hit, TIME-based detonation), just launched by an explicit
 * `fire(ox, oy, angle)` instead of aimed at the player — WaveManager's own
 * `onSpread` callback (see _buildProjectilePools) reads the parent
 * fireball's position AND heading when it spreads and fans `ember.count`
 * instances of this class out across `ember.spreadAngle` around it. Each
 * ember then independently repeats the same trick one generation further:
 * once IT has been alive for `ember.scatterDelay` seconds, it scatters into
 * a wider burst of PhoenixSparks.js via WaveManager's `onScatter` callback —
 * same "pool reports WHEN/WHERE/heading, WaveManager decides WHAT" split
 * every other boss's own seed→fragment chain already keeps.
 *
 * Rendered individually (strokeCircle per bullet, like NovaSeedBullets/
 * DrifterProjectiles/PhoenixFireballs) with a growing radius as `age`
 * approaches `scatterDelay` — the same "about to burst" telegraph carried
 * through from the fireball stage, so the player gets visible warning
 * before EACH generation multiplies, not just the first.
 */
import { Config } from '../core/Config.js';

const MAX = Config.boss.phoenix.ember.poolSize;

export class PhoenixEmbers {
  /** @param {{ onScatter: (x: number, y: number, angle: number) => void }} callbacks */
  constructor({ onScatter }) {
    this._onScatter = onScatter;

    this._x   = new Float32Array(MAX);
    this._y   = new Float32Array(MAX);
    this._vx  = new Float32Array(MAX);
    this._vy  = new Float32Array(MAX);
    this._age = new Float32Array(MAX);
    this._count = 0;

    const { color, lineWidth, glowBlur } = Config.boss.phoenix.ember;
    this._style = { color, lineWidth, glowBlur, glowColor: color };
  }

  /**
   * Spawn one ember from `(ox, oy)` in a fixed `angle` (radians) at
   * `Config.boss.phoenix.ember.speed` — always launched by a fireball's own
   * spread fan-out (WaveManager's `onSpread`), never aimed directly.
   * @param {number} ox @param {number} oy @param {number} angle
   */
  fire(ox, oy, angle) {
    if (this._count >= MAX) return;
    const { speed } = Config.boss.phoenix.ember;
    const i = this._count++;
    this._x[i]   = ox;
    this._y[i]   = oy;
    this._vx[i]  = Math.cos(angle) * speed;
    this._vy[i]  = Math.sin(angle) * speed;
    this._age[i] = 0;
  }

  /** @param {number} dt */
  update(dt) {
    const { scatterDelay } = Config.boss.phoenix.ember;
    const { width: vW, height: vH } = Config.virtual;

    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;
      this._age[i] += dt;

      if (this._age[i] >= scatterDelay) {
        this._onScatter(this._x[i], this._y[i], Math.atan2(this._vy[i], this._vx[i]));
        continue; // consumed by the scatter — drop, no keep-alive compaction
      }
      if (this._x[i] < -30 || this._x[i] > vW + 30 || this._y[i] < -30 || this._y[i] > vH + 30) {
        continue; // drifted off-screen before it ever scattered — silently culled, like any other bullet
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

  /** True while any ember is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight ember — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active ember is within `radius` virtual px of `(px, py)`
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
    const { scatterDelay, radius, growthMult } = Config.boss.phoenix.ember;
    for (let i = 0; i < this._count; i++) {
      const t = Math.min(1, this._age[i] / scatterDelay);
      const r = radius * (1 + (growthMult - 1) * t);
      renderer.strokeCircle(this._x[i], this._y[i], r, this._style);
    }
  }
}
