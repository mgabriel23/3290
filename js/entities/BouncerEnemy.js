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
 *
 * `stepBouncePhysics` (gravity/spin/wall/top/barrier-bounce) is exported so
 * BouncerPrimalBoss.js's giant reskin (see that file) can drive the exact
 * same physics at its own much larger radius/gravity/speed, rather than
 * duplicating this math — same "small shared function" shape EnemyCombat.js
 * already uses for the ship-family enemies, just scoped to this family instead.
 */
import { Config } from '../core/Config.js';
import { tickDeathState } from './EnemyCombat.js';

/**
 * Gravity/spin/wall/top/barrier-bounce physics step — mutates `enemy.x/y/vx/vy/_angle`
 * in place. Parameterized (not read from Config.enemy.bouncer directly) so
 * BouncerPrimalBoss.js can drive it with its own much bigger radius/gravity/
 * speed/barrier-damage numbers.
 * @param {{x:number,y:number,vx:number,vy:number,_angle:number}} enemy
 * @param {number} dt
 * @param {number} r  bounce/collision radius
 * @param {(x: number) => number} barrierSurfaceY
 * @param {(x: number, damage: number) => void} onBarrierHit
 * @param {number} barrierDamage  dealt to the barrier each time this bounces off it
 * @param {number} spinFactor  rad/sec of spin per vp/sec of horizontal velocity
 * @param {number} gravity  vp/sec^2
 */
export function stepBouncePhysics(enemy, dt, r, barrierSurfaceY, onBarrierHit, barrierDamage, spinFactor, gravity) {
  const { width: vW } = Config.virtual;

  // Spin proportional to horizontal velocity — reverses naturally on wall bounce.
  enemy._angle += enemy.vx * spinFactor * dt;

  enemy.vy += gravity * dt;
  enemy.x  += enemy.vx * dt;
  enemy.y  += enemy.vy * dt;

  // Bounce off left and right walls.
  if (enemy.x <= r) {
    enemy.x  = r;
    enemy.vx = Math.abs(enemy.vx);
  } else if (enemy.x >= vW - r) {
    enemy.x  = vW - r;
    enemy.vx = -Math.abs(enemy.vx);
  }

  // Bounce off the top — only when moving upward, so it doesn't get
  // trapped right at spawn while still falling in.
  if (enemy.y <= r && enemy.vy < 0) {
    enemy.y  = r;
    enemy.vy = Math.abs(enemy.vy);
  }

  // Bounce off the barrier's dome — only when falling onto it.
  const surfaceY = barrierSurfaceY(enemy.x);
  if (enemy.y + r >= surfaceY && enemy.vy > 0) {
    enemy.y  = surfaceY - r;
    enemy.vy = -Math.abs(enemy.vy);
    onBarrierHit(enemy.x, barrierDamage);
  }
}

/** Local (unrotated) [x, y] offset of each of a regular `sides`-gon's vertices at `radius`, evenly spaced — see BouncerEnemy's `_localVerts`/`_localShieldVerts`. */
function _hexVertexOffsets(sides, radius) {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
}

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
   * @param {number} [opts.health]  overrides the variant's base health outright (before `healthBonus`) — used by BouncerPrimalBoss.js to set a summoned clone's health to its own rolled value rather than the variant's normal base
   * @param {number} [opts.healthBonus]  added to the (possibly overridden) base health — used by WaveManager to scale health by level
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

    this._health   = (opts.health ?? stats.health) + (opts.healthBonus ?? 0);
    this._hitFlash = 0;
    this._dying    = false;
    this.alive     = true;

    // Variant 3 ('shielded') only: hits absorbed before the core takes
    // damage, and the shield's own hit-flash timer.
    this._shieldHits  = variant === 3 ? cfg.shielded.shieldHits : 0;
    this._shieldFlash = 0;

    // Pre-allocated world-space hulls — mutated in place each render, never reallocated.
    this._hull = { points: Array.from({ length: cfg.sides }, () => [0, 0]), closed: true };
    this._hullArr = [this._hull]; // wrapper reused by render() instead of allocating one each frame
    if (variant === 3) {
      this._shieldHull = { points: Array.from({ length: cfg.sides }, () => [0, 0]), closed: true };
      this._shieldHullArr = [this._shieldHull];
    }

    // Each vertex's LOCAL (unrotated) offset from center never changes —
    // only the hexagon's rotation does — so these are computed once here
    // instead of recomputing cos/sin per vertex, per frame, in render().
    this._localVerts = _hexVertexOffsets(cfg.sides, this._radius);
    if (variant === 3) {
      this._localShieldVerts = _hexVertexOffsets(cfg.sides, cfg.shielded.shieldRadius);
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
   * @param {number} [healthBonus]  added to each fragment's base health — see
   *   Config...bouncer.splitter.fragmentHealthPerLevel; passed in by
   *   WaveManager (which owns the current level) rather than read from
   *   Config directly here, same "caller owns the level" shape `opts.healthBonus`
   *   already uses on the constructor for every other variant.
   * @returns {BouncerEnemy[]}
   */
  spawnFragments(healthBonus = 0) {
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
        healthBonus,
      }));
    }
    return fragments;
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * A shielded (variant 3) clone with shield hits remaining absorbs the hit
   * into the shield instead — the core takes no damage and isn't fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    if (this._dying) return false;
    if (this._shieldHits > 0) {
      this._shieldHits--;
      this._shieldFlash = Config.enemy.bouncer.flashDuration;
      return false;
    }
    this._hitFlash = Config.enemy.bouncer.flashDuration;
    this._health -= damage;
    if (this._health <= 0) {
      this._dying = true;
      return true;
    }
    return false;
  }

  /**
   * @param {number} dt
   * @param {(x: number) => number} barrierSurfaceY  y of the barrier's arc surface at a given x
   * @param {(x: number, damage: number) => void} onBarrierHit  called once each time this clone bounces off the barrier, with the impact x and damage dealt
   */
  update(dt, barrierSurfaceY, onBarrierHit) {
    // Shield flash and hit flash are independent timers — order between them
    // doesn't matter, so the hit-flash decrement + dying-check is delegated
    // to the shared tickDeathState helper (see EnemyCombat.js).
    if (this._shieldFlash > 0) this._shieldFlash -= dt;
    if (tickDeathState(this, dt)) return;

    const cfg = Config.enemy.bouncer;
    stepBouncePhysics(this, dt, this._activeRadius(), barrierSurfaceY, onBarrierHit, cfg.barrierDamage, cfg.spinFactor, cfg.gravity);
  }

  render(renderer) {
    const cfg   = Config.enemy.bouncer;
    const flash = this._hitFlash > 0;
    const c = Math.cos(this._angle), s = Math.sin(this._angle);

    if (this._variant === 3 && this._shieldHits > 0) {
      const sCfg = cfg.shielded;
      const shieldFlash = this._shieldFlash > 0;
      const shieldPts = this._shieldHull.points;
      const localShieldVerts = this._localShieldVerts;
      for (let i = 0; i < cfg.sides; i++) {
        const lx = localShieldVerts[i][0], ly = localShieldVerts[i][1];
        shieldPts[i][0] = this.x + c * lx - s * ly;
        shieldPts[i][1] = this.y + s * lx + c * ly;
      }
      renderer.strokePaths(this._shieldHullArr, {
        color: shieldFlash ? '#ffffff' : sCfg.shieldColor,
        lineWidth: cfg.lineWidth,
        alpha: 0.6,
        glowBlur: shieldFlash ? sCfg.shieldHitGlowBlur : sCfg.shieldGlowBlur,
        glowColor: shieldFlash ? '#ffffff' : sCfg.shieldColor,
      });
    }

    const pts = this._hull.points;
    const localVerts = this._localVerts;
    for (let i = 0; i < cfg.sides; i++) {
      const lx = localVerts[i][0], ly = localVerts[i][1];
      pts[i][0] = this.x + c * lx - s * ly;
      pts[i][1] = this.y + s * lx + c * ly;
    }

    renderer.strokePaths(this._hullArr, {
      color: flash ? '#ffffff' : cfg.color,
      lineWidth: cfg.lineWidth,
      glowBlur: flash ? cfg.hitGlowBlur : cfg.glowBlur,
      glowColor: flash ? '#ffffff' : cfg.color,
    });

    if (flash) return;

    renderer.drawText(String(Math.max(0, Math.ceil(this._health))), this.x, this.y, {
      font: cfg.healthFont, color: cfg.healthColor,
    });
  }
}
