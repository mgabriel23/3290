/**
 * BouncerEnemy.js
 * A wireframe-only hexagon that drops in from the top of the screen and
 * bounces indefinitely — off the side walls, the top edge, and the
 * Barrier's dome at the bottom — accelerating downward under a constant
 * "gravity" between bounces. Unlike Drifters, it never exits the screen on
 * its own: the only way it leaves is by being destroyed. Each bounce off
 * the barrier deals damage to it (see WaveManager's onBarrierHit wiring).
 *
 * Geometry is a single regular hexagon, recomputed in world space each
 * frame (rendered individually — formation sizes are small enough that
 * batching into a shared hull pool isn't worth the complexity here).
 *
 * Variants:
 *   1 ('normal', default) — base size/health from Config.enemy.bouncer.
 *   2 ('splitter')         — larger/tankier (Config...bouncer.splitter);
 *                             on death, spawnFragments() returns small
 *                             'fragment' clones to add to the wave.
 *   3 ('shielded')          — normal-size core wrapped in an outer shield
 *                             ring that spins in lockstep with the core.
 *                             The shield absorbs hits (and sets the bounce/
 *                             collision radius) until depleted, after which
 *                             it behaves like a normal Bouncer.
 *   'fragment'              — small low-health clone spawned by a
 *                             splitter's death; otherwise behaves identically.
 */
import { Config } from '../core/Config.js';

/** Per-variant radius/health — everything else (gravity, spin, etc.) is shared. */
function _variantStats(variant) {
  const cfg = Config.enemy.bouncer;
  if (variant === 2)          return { radius: cfg.splitter.radius,         health: cfg.splitter.health };
  if (variant === 'fragment') return { radius: cfg.splitter.fragmentRadius, health: cfg.splitter.fragmentHealth };
  return { radius: cfg.radius, health: cfg.health };
}

export class BouncerEnemy {
  /**
   * @param {object} [opts]
   * @param {number|'fragment'} [opts.variant=1]  1 = normal, 2 = splitter, 'fragment' = small splitter shard
   * @param {number} [opts.x]   spawn x — defaults to a random position along the top edge
   * @param {number} [opts.y]   spawn y — defaults to just above the top edge
   * @param {number} [opts.vx]  initial horizontal velocity — defaults to a random value
   * @param {number} [opts.vy]  initial vertical velocity — defaults to 0
   */
  constructor(opts = {}) {
    const cfg     = Config.enemy.bouncer;
    const { width: vW } = Config.virtual;
    const variant = opts.variant ?? 1;
    const stats   = _variantStats(variant);

    this._type    = 'bouncer';
    this._variant = variant;
    this._radius  = stats.radius;

    this.x  = opts.x ?? (this._radius + Math.random() * (vW - this._radius * 2));
    this.y  = opts.y ?? -this._radius;
    this.vx = opts.vx ?? (cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin)) * (Math.random() < 0.5 ? -1 : 1);
    this.vy = opts.vy ?? 0;
    this._angle = Math.random() * Math.PI * 2;

    this._health   = stats.health;
    this._hitFlash = 0;
    this._dying    = false;
    this.alive     = true;

    // Variant 3 ('shielded') only: hits absorbed before the core takes
    // damage, and the shield's own hit-flash timer.
    this._shieldHits  = variant === 3 ? cfg.shielded.shieldHits : 0;
    this._shieldFlash = 0;

    // Pre-allocated world-space hulls — mutated in place each render, never reallocated.
    this._hull = { points: Array.from({ length: cfg.sides }, () => [0, 0]), closed: true };
    if (variant === 3) {
      this._shieldHull = { points: Array.from({ length: cfg.sides }, () => [0, 0]), closed: true };
    }
  }

  get type() { return this._type; }

  /** Collision radius — the shield ring's radius while it's still up, otherwise the core's. */
  get hitRadius() { return this._activeRadius(); }

  /** Bounce/collision radius — the shield ring's while up (variant 3), otherwise the core's. */
  _activeRadius() {
    if (this._variant === 3 && this._shieldHits > 0) return Config.enemy.bouncer.shielded.shieldRadius;
    return this._radius;
  }

  /**
   * Called after a splitter (variant 2) is destroyed — returns the small
   * 'fragment' clones to add to the wave, fanning out horizontally and
   * launching upward.
   *
   * Under this elastic bounce model, vy^2 - 2*gravity*y is conserved, so a
   * clone's apex height (its highest point, repeated forever) is fixed by
   * its spawn y and vy alone — `apex = y0 - vy0^2 / (2*gravity)`. A normal
   * Bouncer spawns at the top edge with vy0=0, so its apex IS the top edge.
   * A fragment spawning mid-screen with only a modest vy0 would get an apex
   * barely above its spawn point — i.e. it would never bounce as high as a
   * normal Bouncer ("losing bounce power"). To give fragments the same
   * full-screen bounce range regardless of where their parent died, vy0 is
   * solved so the apex lands exactly at the top edge, same as variant 1.
   * @returns {BouncerEnemy[]}
   */
  spawnFragments() {
    const cfg = Config.enemy.bouncer;
    const { fragmentCount, fragmentRadius, fragmentSpeedMax } = cfg.splitter;
    const fragments = [];
    for (let i = 0; i < fragmentCount; i++) {
      const spread = (i - (fragmentCount - 1) / 2) / fragmentCount; // -0.5..0.5-ish
      const vx = spread * fragmentSpeedMax * 2;
      const vy = -Math.sqrt(2 * cfg.gravity * (this.y + fragmentRadius));
      fragments.push(new BouncerEnemy({
        variant: 'fragment',
        x: this.x, y: this.y,
        vx, vy,
      }));
    }
    return fragments;
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * A shielded (variant 3) clone with shield hits remaining absorbs the hit
   * into the shield instead — the core takes no damage and isn't fatal.
   * @returns {boolean}
   */
  hit() {
    if (this._dying) return false;
    if (this._shieldHits > 0) {
      this._shieldHits--;
      this._shieldFlash = Config.enemy.bouncer.flashDuration;
      return false;
    }
    this._hitFlash = Config.enemy.bouncer.flashDuration;
    this._health--;
    if (this._health <= 0) {
      this._dying = true;
      return true;
    }
    return false;
  }

  /**
   * @param {number} dt
   * @param {(x: number) => number} barrierSurfaceY  y of the barrier's arc surface at a given x
   * @param {(x: number) => void} onBarrierHit  called once each time this clone bounces off the barrier, with the impact x
   */
  update(dt, barrierSurfaceY, onBarrierHit) {
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this._shieldFlash > 0) this._shieldFlash -= dt;
    if (this._dying) {
      if (this._hitFlash <= 0) this.alive = false;
      return;
    }

    const cfg = Config.enemy.bouncer;
    const { width: vW } = Config.virtual;
    const r = this._activeRadius();

    // Spin proportional to horizontal velocity — reverses naturally on wall bounce.
    this._angle += this.vx * cfg.spinFactor * dt;

    this.vy += cfg.gravity * dt;
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;

    // Bounce off left and right walls.
    if (this.x <= r) {
      this.x  = r;
      this.vx = Math.abs(this.vx);
    } else if (this.x >= vW - r) {
      this.x  = vW - r;
      this.vx = -Math.abs(this.vx);
    }

    // Bounce off the top — only when moving upward, so it doesn't get
    // trapped right at spawn while still falling in.
    if (this.y <= r && this.vy < 0) {
      this.y  = r;
      this.vy = Math.abs(this.vy);
    }

    // Bounce off the barrier's dome — only when falling onto it.
    const surfaceY = barrierSurfaceY(this.x);
    if (this.y + r >= surfaceY && this.vy > 0) {
      this.y  = surfaceY - r;
      this.vy = -Math.abs(this.vy);
      onBarrierHit(this.x);
    }
  }

  render(renderer) {
    const cfg   = Config.enemy.bouncer;
    const flash = this._hitFlash > 0;
    const c = Math.cos(this._angle), s = Math.sin(this._angle);
    const r = this._radius;

    if (this._variant === 3 && this._shieldHits > 0) {
      const sCfg = cfg.shielded;
      const shieldFlash = this._shieldFlash > 0;
      const shieldPts = this._shieldHull.points;
      for (let i = 0; i < cfg.sides; i++) {
        const a  = (i / cfg.sides) * Math.PI * 2;
        const lx = Math.cos(a) * sCfg.shieldRadius;
        const ly = Math.sin(a) * sCfg.shieldRadius;
        shieldPts[i][0] = this.x + c * lx - s * ly;
        shieldPts[i][1] = this.y + s * lx + c * ly;
      }
      renderer.strokePaths([this._shieldHull], {
        color: shieldFlash ? '#ffffff' : sCfg.shieldColor,
        lineWidth: cfg.lineWidth,
        alpha: 0.6,
        glowBlur: shieldFlash ? sCfg.shieldHitGlowBlur : sCfg.shieldGlowBlur,
        glowColor: shieldFlash ? '#ffffff' : sCfg.shieldColor,
      });
    }

    const pts = this._hull.points;
    for (let i = 0; i < cfg.sides; i++) {
      const a  = (i / cfg.sides) * Math.PI * 2;
      const lx = Math.cos(a) * r;
      const ly = Math.sin(a) * r;
      pts[i][0] = this.x + c * lx - s * ly;
      pts[i][1] = this.y + s * lx + c * ly;
    }

    renderer.strokePaths([this._hull], {
      color: flash ? '#ffffff' : cfg.color,
      lineWidth: cfg.lineWidth,
      glowBlur: flash ? cfg.hitGlowBlur : cfg.glowBlur,
      glowColor: flash ? '#ffffff' : cfg.color,
    });

    if (flash) return;

    renderer.drawText(String(this._health), this.x, this.y, {
      font: cfg.healthFont, color: cfg.healthColor,
    });
  }
}
