/**
 * PowerUps.js
 * Pool of collectible pickups left behind by a percentage of enemy kills
 * (see WaveManager.handleBulletHit/_maybeDropPowerUp) — small falling orbs
 * the player flies through to restore health, either their own or the
 * barrier's. Only two kinds exist, distinguished by color and an inner icon:
 * a "+" cross for a player-health pickup, the same diamond emblem Barrier.js
 * draws at its own peak for a shield pickup (see Config.powerUps).
 *
 * Same pre-allocated-typed-array pooling shape as EnemyBullet.js: swap-
 * remove on cull (falls off the bottom of the screen or outlives `maxLife`)
 * or on pickup. WaveManager discards this whole pool on every level
 * transition (a fresh WaveManager is constructed per level), so an
 * uncollected pickup is simply lost, not carried over — no special handling
 * needed here for that.
 *
 * A third kind, 'fireBoost', and a fourth, 'invincible', are temporary
 * buffs rather than an instant restore — this pool only spawns/falls/gets
 * collected like the other two; PowerUps.js itself has no notion of
 * "temporary," it's PowerUps-agnostic about what collecting one actually
 * does. fireBoost's icon is a small lightning-bolt zigzag; invincible's is
 * a small hexagon ring, echoing the bubble shape it actually draws around
 * the player (see Player._renderInvincibleBubble) — both distinct from
 * health's cross and shield's diamond.
 */
import { Config } from '../core/Config.js';
import { diamondPath } from '../core/shapes.js';

const MAX = Config.powerUps.poolSize;

export class PowerUps {
  constructor() {
    this._x     = new Float32Array(MAX);
    this._y     = new Float32Array(MAX);
    this._age   = new Float32Array(MAX);
    this._type  = new Array(MAX).fill('health'); // 'health' | 'shield' | 'fireBoost' | 'invincible'
    this._count = 0;

    // Local-space icon paths, centered on the origin — repositioned onto
    // each pickup at render time via strokePaths' own {x, y} transform.
    const d = Config.powerUps.radius * 0.45;
    this._crossPaths = [
      { points: [[-d, 0], [d, 0]], closed: false },
      { points: [[0, -d], [0, d]], closed: false },
    ];
    this._diamondPath = diamondPath(0, 0, Config.powerUps.radius * 0.5);
    // A small lightning-bolt zigzag, top to bottom.
    this._boltPath = [{
      points: [[-d * 0.3, -d], [d * 0.35, -d * 0.1], [-d * 0.1, d * 0.15], [d * 0.3, d]],
      closed: false,
    }];
    // A small hexagon ring — six points evenly spaced around the origin.
    const hexPts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      hexPts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    this._hexPath = { points: hexPts, closed: true };
  }

  /**
   * @param {number} x @param {number} y
   * @param {'health'|'shield'|'fireBoost'|'invincible'} type
   */
  spawn(x, y, type) {
    if (this._count >= MAX) return;
    const i = this._count++;
    this._x[i]    = x;
    this._y[i]    = y;
    this._age[i]  = 0;
    this._type[i] = type;
  }

  /** @param {number} dt */
  update(dt) {
    const { fallSpeed, maxLife } = Config.powerUps;
    const { height: vH } = Config.virtual;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._y[i]   += fallSpeed * dt;
      this._age[i] += dt;
      if (this._age[i] < maxLife && this._y[i] < vH + 30) {
        if (w !== i) {
          this._x[w] = this._x[i]; this._y[w] = this._y[i];
          this._age[w] = this._age[i]; this._type[w] = this._type[i];
        }
        w++;
      }
    }
    this._count = w;
  }

  /** True while any pickup is still active. */
  get active() { return this._count > 0; }

  /**
   * Test every active pickup against a circle at `(px, py)` with radius
   * `radius`; removes and returns the FIRST one found (swap-remove-on-hit,
   * same shape as EnemyBullets.checkHit), or `null` if none overlap.
   * Callers loop this to collect several pickups overlapping the same frame
   * — see WaveManager.checkPowerUpPickup.
   * @param {number} px @param {number} py @param {number} radius
   * @returns {'health'|'shield'|'fireBoost'|'invincible'|null}
   */
  checkPickup(px, py, radius) {
    const r = Config.powerUps.hitRadius + radius;
    const r2 = r * r;
    for (let i = 0; i < this._count; i++) {
      const dx = this._x[i] - px;
      const dy = this._y[i] - py;
      if (dx * dx + dy * dy <= r2) {
        const type = this._type[i];
        this._count--;
        if (i < this._count) {
          this._x[i] = this._x[this._count]; this._y[i] = this._y[this._count];
          this._age[i] = this._age[this._count]; this._type[i] = this._type[this._count];
        }
        return type;
      }
    }
    return null;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const { radius, lineWidth, glowBlur, pulseSpeed, pulseDepth, health, shield, fireBoost, invincible } = Config.powerUps;
    for (let i = 0; i < this._count; i++) {
      const type  = this._type[i];
      const cfg   = type === 'shield' ? shield : type === 'fireBoost' ? fireBoost : type === 'invincible' ? invincible : health;
      const x = this._x[i], y = this._y[i];
      const alpha = 1 - pulseDepth * (0.5 + 0.5 * Math.sin(this._age[i] * pulseSpeed));

      renderer.fillEllipse(0, 0, radius, radius, { x, y, fillColor: cfg.fillColor, alpha });
      renderer.strokeCircle(x, y, radius, { color: cfg.color, lineWidth, glowBlur, alpha });

      if (type === 'shield') {
        renderer.strokePaths([this._diamondPath], { x, y, color: cfg.color, lineWidth, alpha });
      } else if (type === 'fireBoost') {
        renderer.strokePaths(this._boltPath, { x, y, color: cfg.color, lineWidth, alpha, lineCap: 'round' });
      } else if (type === 'invincible') {
        renderer.strokePaths([this._hexPath], { x, y, color: cfg.color, lineWidth, alpha });
      } else {
        renderer.strokePaths(this._crossPaths, { x, y, color: cfg.color, lineWidth, alpha });
      }
    }
  }
}
