/**
 * Bullets.js
 * The player's auto-firing energy bolt stream.
 *
 * The center bolt fires at Config.bullet.fireRate once per second while the
 * player's ship is ready (entry animation complete), scaled by an optional
 * fireRateMultiplier GameplayScene passes into `update` — composed from the
 * fireBoost PowerUp's multiplier (see Config.powerUps.fireBoost) and the
 * player's own Shop-purchased wings fire-rate multiplier (see Player.
 * fireRateMultiplier/Config.player.wings), 1 for either while inactive/
 * unpurchased.
 *
 * Once `player.hasSideBullets` (wings level 8 — see Config.player.wings'
 * own doc), two more bolts fire from wing-mounted offsets
 * (Config.bullet.wing) — but on their OWN, much slower cooldown
 * (`_wingCooldown`, ticking at `fireRate * fireRateMultiplier *
 * Config.bullet.wing.fireRateMult`, a fraction of the center rate) rather
 * than every center-bolt volley. All three bolts firing together at the
 * main gun's full rate trivialized kills the moment a player reached the
 * upgrade, so the side guns are a slow support stream layered underneath
 * the center gun, not a flat tripling of it. Every bolt moves straight up
 * at Config.bullet.speed and is culled when it exits the top of the screen.
 *
 * All bullet positions live in typed arrays for cache efficiency; all
 * path geometry is pre-allocated in a pool and mutated in place each
 * frame, so the render path produces zero per-frame heap allocations.
 * Every active bullet is batched into a single strokePaths call —
 * one shadow-blur GPU pass no matter how many are on screen.
 */
import { Config } from '../core/Config.js';
import { AudioPool } from '../core/AudioPool.js';

const MAX = 96; // well above steady-state peak — center bolts plus an occasional slow wing volley, at up to ~15/s (wings + fireBoost stacked) × ~0.5s screen-cross time

export class Bullets {
  constructor() {
    // Typed arrays — compact, cache-friendly bullet positions
    this._bx    = new Float32Array(MAX);
    this._by    = new Float32Array(MAX);
    this._count = 0;
    this._cooldown = 0;
    this._wingCooldown = 0; // separate, slower cooldown for the wing-mounted side bolts — see class doc

    // Pre-allocated path objects — mutated in place per render frame,
    // then passed as a batch to strokePaths (no per-frame allocation).
    // strokePaths accepts a `count` arg so we pass _pool directly and
    // skip the frame without a separate auxiliary array.
    this._pool = Array.from({ length: MAX }, () => ({
      points: [[0, 0], [0, 0]],
      closed: false,
    }));

    const { color, lineWidth, glowBlur } = Config.bullet;
    // singleStroke: all bullets share one ctx.stroke() call → one shadow-blur
    // GPU pass per frame regardless of how many bullets are on screen.
    this._style = { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true };

    // AudioPool lazily creates its Audio elements on first play(), so
    // constructing it here doesn't allocate any HTMLMediaElement objects
    // before a shot is actually fired.
    const audioCfg = Config.bullet.audio;
    this._audioPool = new AudioPool(audioCfg.src, audioCfg.poolSize, audioCfg.volume);
  }

  /**
   * Advance all bullets by `dt` seconds and auto-fire if the player is ready.
   * @param {number} dt
   * @param {{ x: number, y: number, ready: boolean }} player
   * @param {number} [fireRateMultiplier]  applied on top of Config.bullet.fireRate
   *   — GameplayScene passes >1 while a fireBoost PowerUp is active (see
   *   Config.powerUps.fireBoost), 1 otherwise.
   */
  update(dt, player, fireRateMultiplier = 1) {
    const { fireRate, speed, spawnOffsetY, wing } = Config.bullet;

    // Only count down and fire once the ship has landed — prevents the
    // cooldown from going deeply negative during the entry animation and
    // causing a burst of overlapping bullets the moment the ship settles.
    if (player.ready) {
      this._cooldown -= dt;
      if (this._cooldown <= 0) {
        this._spawn(player.x, player.y + spawnOffsetY);
        this._audioPool.play();
        this._cooldown += 1 / (fireRate * fireRateMultiplier); // += preserves sub-frame accuracy
      }

      // Wing-mounted side bolts — own cooldown, own (much slower) rate, see class doc.
      if (player.hasSideBullets) {
        this._wingCooldown -= dt;
        if (this._wingCooldown <= 0) {
          this._spawn(player.x - wing.offsetX, player.y + wing.offsetY);
          this._spawn(player.x + wing.offsetX, player.y + wing.offsetY);
          this._audioPool.play();
          this._wingCooldown += 1 / (fireRate * fireRateMultiplier * wing.fireRateMult);
        }
      }
    }

    // Move bolts upward; compact array to remove off-screen ones in-place
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._by[i] -= speed * dt;
      if (this._by[i] > -30) { // -30 gives glow headroom above y=0 before culling
        if (w !== i) {
          this._bx[w] = this._bx[i];
          this._by[w] = this._by[i];
        }
        w++;
      }
    }
    this._count = w;
  }

  /** Draw all active bullets as a single batched rounded-capsule stroke. */
  render(renderer) {
    if (this._count === 0) return;

    const hLen = Config.bullet.halfLen;
    for (let i = 0; i < this._count; i++) {
      const p = this._pool[i];
      p.points[0][0] = this._bx[i];
      p.points[0][1] = this._by[i] - hLen;
      p.points[1][0] = this._bx[i];
      p.points[1][1] = this._by[i] + hLen;
    }
    // Pass _pool with explicit count so strokePaths reads only active slots —
    // no auxiliary array needed, no per-frame allocations.
    renderer.strokePaths(this._pool, this._style, this._count);
  }

  /**
   * Test whether any active bullet is within `radius` virtual px of `(ex, ey)`.
   * If one is found, remove it (compact swap) and return `true`. Used by
   * GameplayScene to resolve player-bullet vs. enemy collisions each frame.
   * @param {number} ex @param {number} ey @param {number} radius
   * @returns {boolean}
   */
  checkHit(ex, ey, radius) {
    const r2 = radius * radius;
    for (let i = 0; i < this._count; i++) {
      const dx = this._bx[i] - ex;
      const dy = this._by[i] - ey;
      if (dx * dx + dy * dy <= r2) {
        this._count--;
        if (i < this._count) {
          this._bx[i] = this._bx[this._count];
          this._by[i] = this._by[this._count];
        }
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------

  _spawn(x, y) {
    if (this._count >= MAX) return;
    this._bx[this._count] = x;
    this._by[this._count] = y;
    this._count++;
  }
}
