/**
 * SniperBullets.js
 * Pool of straight-line (non-homing) bullets fired by SniperEnemy once its
 * charge-and-lock cycle completes, aimed at wherever the player was the
 * instant it locked (see SniperEnemy's own doc) — no continuous tracking
 * after launch, unlike Rockets.js.
 *
 * The distinguishing trait is the SPEED curve, not the direction: each
 * bullet crawls at `Config.enemy.sniper.bullet.startSpeed` for `accelDelay`
 * seconds — a real dodge window for a player who reads the telegraph — then
 * rockets up to `maxSpeed` over `accelDuration` seconds via an ease-in curve
 * (core/animation.js's easeInCubic), and holds at that speed until impact or
 * `maxLife` runs out. The drawn bullet stretches from a short dot at
 * `startSpeed` to a long streak at `maxSpeed` (`halfLenMin/Max`), so the
 * crawl-to-jet transition reads visually, not just as a number changing.
 *
 * Pool shape mirrors EnemyBullet.js (straight-line, swap-remove-on-hit) —
 * the only real difference is the per-bullet speed ramp instead of a fixed
 * constant speed, so `update`/`checkHit` follow the exact same structure.
 *
 * `fire`'s optional `speedMult` scales only the RAMPED portion of that curve
 * (the crawl at `startSpeed` stays identical) — see `_speedAt`. This is what
 * lets BossEnemy.js's sniper phase (Config.boss.scout1.sniperPhase.
 * bulletSpeedMult) fire a harder-kicking version of the same shot through
 * this exact same shared pool, without touching Config.enemy.sniper.bullet
 * itself and thereby speeding up every regular SniperEnemy's shot too.
 */
import { Config } from '../core/Config.js';
import { directionalVelocity } from '../core/vectorMath.js';
import { easeInCubic } from '../core/animation.js';

const MAX = Config.enemy.sniper.bullet.poolSize;

export class SniperBullets {
  constructor() {
    this._x    = new Float32Array(MAX); // world x
    this._y    = new Float32Array(MAX); // world y
    this._dirX = new Float32Array(MAX); // unit travel direction, fixed at fire time
    this._dirY = new Float32Array(MAX);
    this._age  = new Float32Array(MAX);
    this._mult = new Float32Array(MAX); // per-bullet speed-boost multiplier — see fire()'s doc
    this._count = 0;

    this._pool = Array.from({ length: MAX }, () => ({
      points: [[0, 0], [0, 0]],
      closed: false,
    }));

    const { color, lineWidth, glowBlur } = Config.enemy.sniper.bullet;
    this._style = { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true };
  }

  /**
   * Fire one bullet from `(ox, oy)` straight toward `(tx, ty)` — the
   * direction is locked in at this instant and never adjusted afterward.
   * @param {number} ox @param {number} oy  origin (Sniper's gun muzzle)
   * @param {number} tx @param {number} ty  target (player's locked position)
   * @param {number} [speedMult]  scales this bullet's boosted top speed — see class doc
   */
  fire(ox, oy, tx, ty, speedMult = 1) {
    if (this._count >= MAX) return;
    const [dx, dy] = directionalVelocity(ox, oy, tx, ty, 1); // unit direction only — speed is handled per-frame below
    const i = this._count++;
    this._x[i]    = ox;
    this._y[i]    = oy;
    this._dirX[i] = dx;
    this._dirY[i] = dy;
    this._age[i]  = 0;
    this._mult[i] = speedMult;
  }

  /**
   * Current travel speed for a bullet of age `age` — flat at `startSpeed`
   * for `accelDelay` seconds, then an ease-in ramp up to `maxSpeed * mult`
   * over `accelDuration` seconds, then flat at that boosted speed forever
   * after. `mult` only scales the ramped portion, never the initial crawl —
   * see class doc.
   * @param {number} age @param {number} mult
   * @returns {number}
   */
  _speedAt(age, mult) {
    const { startSpeed, maxSpeed, accelDelay, accelDuration } = Config.enemy.sniper.bullet;
    if (age <= accelDelay) return startSpeed;
    const t = Math.min((age - accelDelay) / accelDuration, 1);
    return startSpeed + (maxSpeed * mult - startSpeed) * easeInCubic(t);
  }

  /** @param {number} dt */
  update(dt) {
    const { width: vW, height: vH } = Config.virtual;
    const { maxLife } = Config.enemy.sniper.bullet;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._age[i] += dt;
      const speed = this._speedAt(this._age[i], this._mult[i]);
      this._x[i] += this._dirX[i] * speed * dt;
      this._y[i] += this._dirY[i] * speed * dt;

      const alive = this._age[i] < maxLife
        && this._x[i] > -30 && this._x[i] < vW + 30
        && this._y[i] > -30 && this._y[i] < vH + 30;
      if (alive) {
        if (w !== i) {
          this._x[w] = this._x[i]; this._y[w] = this._y[i];
          this._dirX[w] = this._dirX[i]; this._dirY[w] = this._dirY[i];
          this._age[w] = this._age[i]; this._mult[w] = this._mult[i];
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
          this._x[i] = this._x[this._count]; this._y[i] = this._y[this._count];
          this._dirX[i] = this._dirX[this._count]; this._dirY[i] = this._dirY[this._count];
          this._age[i] = this._age[this._count]; this._mult[i] = this._mult[this._count];
        }
        return true;
      }
    }
    return false;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const { startSpeed, maxSpeed, halfLenMin, halfLenMax } = Config.enemy.sniper.bullet;
    const speedRange = maxSpeed - startSpeed || 1;

    for (let i = 0; i < this._count; i++) {
      const speed  = this._speedAt(this._age[i], this._mult[i]);
      // Clamped to 1 — a boosted (mult > 1) bullet reaches the full-length
      // streak sooner and just holds there, rather than overshooting it.
      const speedT = Math.max(0, Math.min(1, (speed - startSpeed) / speedRange));
      const hLen   = halfLenMin + (halfLenMax - halfLenMin) * speedT;
      const nx = this._dirX[i] * hLen;
      const ny = this._dirY[i] * hLen;
      const p  = this._pool[i];
      p.points[0][0] = this._x[i] - nx;
      p.points[0][1] = this._y[i] - ny;
      p.points[1][0] = this._x[i] + nx;
      p.points[1][1] = this._y[i] + ny;
    }
    renderer.strokePaths(this._pool, this._style, this._count);
  }
}
