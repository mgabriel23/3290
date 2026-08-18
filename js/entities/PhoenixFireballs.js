/**
 * PhoenixFireballs.js
 * Phoenix boss's phase-1 attack (see PhoenixBoss.js) — first generation of a
 * 3-stage cascade. One round fireball fires from the beak straight at the
 * player's position at the instant of firing (no lead prediction, no
 * homing), then — once it's been alive for `fireball.spreadDelay` seconds —
 * spreads into a fan of PhoenixEmbers.js (2nd gen), which each later scatter
 * into a wider burst of PhoenixSparks.js (3rd gen) — see PhoenixEmbers.js's
 * own doc for why the fan-out formula between stages lives in WaveManager
 * (`onSpread`/`onScatter`), not any of the three bullet-pool files.
 * Deliberately slower than a typical straight-shot boss bullet
 * (`fireball.speed`) so the cascade has room to actually unfold on screen
 * before the fireball would otherwise have reached the player.
 *
 * Structurally the same "pooled bullet with an age-based detonation clock"
 * shape NovaSeedBullets uses (fixed velocity, bounds-culled, swap-remove-on-
 * hit, TIME-based detonation rather than "on arrival") — the one
 * NovaSeedBullets feature this DOESN'T need is a second launch mode
 * (`fireAngle`), since a fireball is always aimed at the player, never fired
 * in a fixed direction.
 *
 * Rendered as a growing glowing circle (strokeCircle), not the straight-line
 * capsule every OTHER boss bullet in the game uses (BossBulletPool.js's
 * shared renderer) — a round "fireball" reads more like an ember than a
 * fired shell, and the growth as `age` approaches `spreadDelay` telegraphs
 * the incoming spread the same way Nova's own seed telegraphs its burst.
 */
import { Config } from '../core/Config.js';
import { directionalVelocity } from '../core/vectorMath.js';

const MAX = Config.boss.phoenix.fireball.poolSize;

export class PhoenixFireballs {
  /** @param {{ onSpread: (x: number, y: number, angle: number) => void }} callbacks */
  constructor({ onSpread }) {
    this._onSpread = onSpread;

    this._x   = new Float32Array(MAX);
    this._y   = new Float32Array(MAX);
    this._vx  = new Float32Array(MAX);
    this._vy  = new Float32Array(MAX);
    this._age = new Float32Array(MAX);
    this._count = 0;

    const { color, lineWidth, glowBlur } = Config.boss.phoenix.fireball;
    this._style = { color, lineWidth, glowBlur, glowColor: color };
  }

  /**
   * Spawn one fireball from `(ox, oy)` straight at `(tx, ty)` — the
   * player's position at fire time, no re-aiming after launch.
   * @param {number} ox @param {number} oy  origin (boss's beak)
   * @param {number} tx @param {number} ty  player position at fire time
   */
  fire(ox, oy, tx, ty) {
    if (this._count >= MAX) return;
    const { speed } = Config.boss.phoenix.fireball;
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
    const { spreadDelay } = Config.boss.phoenix.fireball;
    const { width: vW, height: vH } = Config.virtual;

    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;
      this._age[i] += dt;

      if (this._age[i] >= spreadDelay) {
        this._onSpread(this._x[i], this._y[i], Math.atan2(this._vy[i], this._vx[i]));
        continue; // consumed by the spread — drop, no keep-alive compaction
      }
      if (this._x[i] < -30 || this._x[i] > vW + 30 || this._y[i] < -30 || this._y[i] > vH + 30) {
        continue; // drifted off-screen before it ever spread — silently culled, like any other bullet
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

  /** True while any fireball is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight fireball — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * Test whether any active fireball is within `radius` virtual px of `(px, py)`.
   * If one is found, remove it (compact swap) and return `true` — a direct
   * hit consumes it (no spread) — same swap-remove-on-hit shape as every
   * other bullet pool's `checkHit`.
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
    const { spreadDelay, radius, growthMult } = Config.boss.phoenix.fireball;
    for (let i = 0; i < this._count; i++) {
      const t = Math.min(1, this._age[i] / spreadDelay);
      const r = radius * (1 + (growthMult - 1) * t);
      renderer.strokeCircle(this._x[i], this._y[i], r, this._style);
    }
  }
}
