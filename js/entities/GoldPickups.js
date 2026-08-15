/**
 * GoldPickups.js
 * Pool of falling gold coins left behind by a large fraction of enemy kills
 * (see WaveManager.handleBulletHit/_maybeDropGold) — the player flies
 * through one to collect the gold reward that used to be credited to the
 * HUD wallet instantly on every kill. Each coin carries its own `value`,
 * the same per-enemy-type amount Config.enemy.*.gold (or a boss/variant's
 * own `gold` field) always specified — see WaveManager._rewardFor — so this
 * only changes HOW gold is delivered, not how much any given enemy is worth.
 *
 * Each coin launches from its spawn point at a random angle/speed that
 * decays via drag before settling into the shared straight-down `fallSpeed`
 * drift — same burst-then-settle motion as PowerUps.js, see its class doc
 * and Config.gold.burstSpeedMin/Max/burstDrag.
 *
 * Magnet pull: while a coin sits within the player's `magnetRadius` (see
 * Player.magnetRadius/magnetPullAccel and Config.player.magnet), `update`
 * steers it toward the player by adding acceleration into the SAME vx/vy
 * used for the spawn burst above — it decays via the same `burstDrag`, so
 * the pull speed naturally settles at `pullAccel / burstDrag` rather than
 * needing its own separate cap. Same shape in PowerUps.js.
 *
 * Same pre-allocated-typed-array pooling shape as PowerUps.js: swap-remove
 * on cull (falls off the bottom of the screen or outlives `maxLife`) or on
 * pickup. A deliberately separate pool and drop roll from PowerUps — see
 * Config.gold's own class doc for why gold isn't just a fifth PowerUp type.
 * Owned by GameplayScene rather than WaveManager, same cross-level-survival
 * reasoning as PowerUps.js's own class doc.
 */
import { Config } from '../core/Config.js';
import { starPath } from '../core/shapes.js';

const MAX = Config.gold.poolSize;

export class GoldPickups {
  constructor() {
    this._x     = new Float32Array(MAX);
    this._y     = new Float32Array(MAX);
    this._vx    = new Float32Array(MAX); // burst velocity — decays to 0 via drag, see update()
    this._vy    = new Float32Array(MAX);
    this._age   = new Float32Array(MAX);
    this._value = new Float32Array(MAX);
    this._count = 0;

    // Stamped star emblem, local-space, centered on the origin — repositioned
    // onto each coin at render time via fillStrokePaths' own {x, y} transform.
    this._starPath = starPath(0, 0, Config.gold.radius * 0.48, Config.gold.radius * 0.2);
    // Wrapper array reused every coin, every frame by render() instead of
    // allocating a fresh single-element array each call.
    this._starPathArr = [this._starPath];
  }

  /**
   * @param {number} x @param {number} y
   * @param {number} value  gold amount this coin is worth
   */
  spawn(x, y, value) {
    if (this._count >= MAX || value <= 0) return;
    const { burstSpeedMin, burstSpeedMax } = Config.gold;
    const i = this._count++;
    const angle = Math.random() * Math.PI * 2;
    const speed = burstSpeedMin + Math.random() * (burstSpeedMax - burstSpeedMin);
    this._x[i]     = x;
    this._y[i]     = y;
    this._vx[i]    = Math.cos(angle) * speed;
    this._vy[i]    = Math.sin(angle) * speed;
    this._age[i]   = 0;
    this._value[i] = value;
  }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY  magnet pull target — see class doc
   * @param {number} magnetRadius  vp — coins within this distance of the player accelerate toward it
   * @param {number} magnetPullAccel  vp/sec^2 applied toward the player while inside magnetRadius
   */
  update(dt, playerX, playerY, magnetRadius, magnetPullAccel) {
    const { fallSpeed, maxLife, burstDrag } = Config.gold;
    const { height: vH } = Config.virtual;
    const drag = 1 - dt * burstDrag;
    const magnetR2 = magnetRadius * magnetRadius;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      const dx = playerX - this._x[i];
      const dy = playerY - this._y[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < magnetR2 && distSq > 1) {
        const dist = Math.sqrt(distSq);
        const pull = magnetPullAccel * dt;
        this._vx[i] += (dx / dist) * pull;
        this._vy[i] += (dy / dist) * pull;
      }
      this._x[i]   += this._vx[i] * dt;
      this._y[i]   += (fallSpeed + this._vy[i]) * dt;
      this._vx[i]  *= drag;
      this._vy[i]  *= drag;
      this._age[i] += dt;
      if (this._age[i] < maxLife && this._y[i] < vH + 30) {
        if (w !== i) {
          this._x[w] = this._x[i]; this._y[w] = this._y[i];
          this._vx[w] = this._vx[i]; this._vy[w] = this._vy[i];
          this._age[w] = this._age[i]; this._value[w] = this._value[i];
        }
        w++;
      }
    }
    this._count = w;
  }

  /** True while any coin is still active. */
  get active() { return this._count > 0; }

  /**
   * Test every active coin against a circle at `(px, py)` with radius
   * `radius`; removes and returns the FIRST one found's gold value
   * (swap-remove-on-hit, same shape as PowerUps.checkPickup), or `0` if
   * none overlap. Callers loop this to collect several coins overlapping
   * the same frame — see WaveManager.checkGoldPickup.
   * @param {number} px @param {number} py @param {number} radius
   * @returns {number}
   */
  checkPickup(px, py, radius) {
    const r = Config.gold.hitRadius + radius;
    const r2 = r * r;
    for (let i = 0; i < this._count; i++) {
      const dx = this._x[i] - px;
      const dy = this._y[i] - py;
      if (dx * dx + dy * dy <= r2) {
        const value = this._value[i];
        this._count--;
        if (i < this._count) {
          this._x[i] = this._x[this._count]; this._y[i] = this._y[this._count];
          this._vx[i] = this._vx[this._count]; this._vy[i] = this._vy[this._count];
          this._age[i] = this._age[this._count]; this._value[i] = this._value[this._count];
        }
        return value;
      }
    }
    return 0;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const {
      radius, lineWidth, glowBlur, pulseSpeed, pulseDepth, maxLife, expireFadeDuration,
      color, fillColor, highlightColor, shadeColor,
    } = Config.gold;
    for (let i = 0; i < this._count; i++) {
      const x = this._x[i], y = this._y[i];
      const age = this._age[i];
      // Fades to fully transparent over the last `expireFadeDuration` seconds
      // before despawn — a visible "about to vanish" cue instead of an
      // abrupt pop once `update` culls it at maxLife.
      const timeLeft = maxLife - age;
      const expireAlpha = timeLeft < expireFadeDuration ? Math.max(0, timeLeft / expireFadeDuration) : 1;
      // Only the rim glints/pulses (see Config.gold.pulseSpeed's own comment)
      // — the coin body itself stays solid so it reads as a physical object,
      // not a breathing magic orb like PowerUps.
      const rimAlpha = expireAlpha * (1 - pulseDepth * (0.5 + 0.5 * Math.sin(age * pulseSpeed)));

      // Solid metallic body.
      renderer.fillEllipse(0, 0, radius, radius, { x, y, fillColor, alpha: expireAlpha });
      // Stamped star emblem — dark antique-gold engraving, unmistakably
      // "coin" rather than the plain concentric ring this used to be.
      renderer.fillStrokePaths(this._starPathArr, {
        x, y, fillColor: shadeColor, strokeColor: shadeColor, lineWidth: 1, alpha: expireAlpha,
      });
      // Glossy specular highlight, slowly drifting across the face — like
      // light catching a softly tumbling coin.
      const hlAngle = age * pulseSpeed * 0.4;
      renderer.fillEllipse(
        Math.cos(hlAngle) * radius * 0.32, Math.sin(hlAngle) * radius * 0.32,
        radius * 0.3, radius * 0.2,
        { x, y, fillColor: highlightColor, alpha: expireAlpha * 0.5 },
      );
      // Bright glinting rim + glow — the "pick me up" silhouette against a busy starfield.
      renderer.strokeCircle(x, y, radius, { color, lineWidth, glowBlur, alpha: rimAlpha });
    }
  }
}
