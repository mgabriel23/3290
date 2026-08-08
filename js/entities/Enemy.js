/**
 * Enemy.js
 * The Scout — first enemy type.
 *
 * Behaviour: enters from the top at speed, gliding diagonally to a random
 * resting position, then fires aimed shots at the player on a fixed reload
 * cycle. The ship continuously rotates to keep its NOSE pointing AWAY from
 * the player (tail toward player) — giving a "looking upward" silhouette
 * even while tracking. One player bullet kills it; a particle burst from
 * WaveManager provides the death visual.
 *
 * Separation: WaveManager checks pairwise distances each frame and nudges
 * overlapping enemies apart directly (see WaveManager._resolveOverlaps).
 *
 * Hit/death-flash/entry-glide/engine rendering are shared with SniperEnemy
 * (and, partially, DrifterEnemy/BouncerEnemy) via EnemyCombat.js — see that
 * file's header for why those are plain shared functions rather than a base
 * class.
 */
import { Config } from '../core/Config.js';
import { applyHit, tickDeathState, setState, stepEntryGlide, renderEngineFlame, renderEngineCore, renderHull } from './EnemyCombat.js';

// Exported so WaveManager can pre-transform hull points to world space for batched rendering.
export const SCOUT_S = 22;
const S = SCOUT_S; // local shorthand used throughout this file

export const SCOUT_HULL_PTS = [
  [ 0,       -S * 0.30],
  [ S * 0.80, -S * 0.50],
  [ S * 0.85,  S * 0.00],
  [ S * 0.40,  S * 0.25],
  [ S * 0.20,  S * 0.55],
  [ 0,          S * 0.70],
  [-S * 0.20,  S * 0.55],
  [-S * 0.40,  S * 0.25],
  [-S * 0.85,  S * 0.00],
  [-S * 0.80, -S * 0.50],
];
export class Enemy {
  /**
   * @param {number} spawnX  entry column (x at top of screen)
   * @param {number} restX   x of the resting position
   * @param {number} restY   y of the resting position
   * @param {string} [type]  key into Config.enemy — 'scout' | 'rocketeer'
   * @param {number} [healthBonus]  added to `Config.enemy[type].health` — used by WaveManager to scale health by level
   */
  constructor(spawnX, restX, restY, type = 'scout', healthBonus = 0) {
    this.x     = spawnX;
    this.y     = -S;
    this.alive = true;

    this._type  = type;
    this._cfg   = Config.enemy[type]; // cached once — all per-type constants live here

    this._spawnX  = spawnX;
    this._restX   = restX;
    this._restY   = restY;
    this._angle   = 0; // recomputed every frame to track the player
    this._health  = this._cfg.health + healthBonus;
    this._enginePhase = Math.random() * Math.PI * 2;
    this._hitFlash    = 0;     // seconds remaining in hit-white flash
    this._dying       = false; // true once health hits 0; waits for flash to finish

    this._state    = 'entering';
    this._stateAge = 0;
  }

  /** Enemy variant — used by WaveManager to route rendering and projectile creation. */
  get type() { return this._type; }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   * @param {(ox:number, oy:number, tx:number, ty:number) => void} onFire
   */
  update(dt, playerX, playerY, onFire) {
    const cfg = this._cfg;
    this._stateAge    += dt;
    this._enginePhase += dt * 9;
    if (tickDeathState(this, dt)) return;

    // Angle: local -y (nose) points AWAY from player; local +y (tail) faces player.
    // Formula: atan2(-dx, dy) makes tail face (dx, dy). Verified:
    //   player below (dx=0, dy>0) → angle=0 → nose points UP ✓
    //   player right  (dx>0, dy=0) → angle=-π/2 → tail points right ✓
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    this._angle = Math.atan2(-dx, dy);

    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'aiming');

    } else if (this._state === 'aiming') {
      if (this._stateAge >= cfg.aimPause) {
        onFire(this.x, this.y, playerX, playerY);
        setState(this, 'firing');
      }

    } else if (this._state === 'firing') {
      if (this._stateAge >= cfg.reloadTime) setState(this, 'aiming');
    }
  }

  /**
   * Register one bullet hit. Triggers a white flash regardless of outcome.
   * Returns `true` if this hit was fatal (health reached 0) so the caller
   * (WaveManager) knows when to emit the particle burst.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /** Public angle so WaveManager can read it for world-space hull transforms. */
  get angle() { return this._angle; }

  /** Collision radius — used by GameplayScene's bullet↔enemy hit test. */
  get hitRadius() { return this._cfg.hitRadius; }

  /**
   * Engine exhaust triangle — must be drawn BEFORE the hull so it appears
   * behind it. `alpha` is an optional entrance-fade multiplier (default 1,
   * so WaveManager's real per-frame calls are unaffected) — see
   * EnemyCombat.renderHull's doc.
   */
  renderFlame(renderer, alpha = 1) {
    renderEngineFlame(renderer, this, 0, -S * 0.30, S * 0.45, alpha);
  }

  /** Engine core orb — must be drawn AFTER the hull so it sits on top of it. */
  renderCore(renderer, alpha = 1) {
    renderEngineCore(renderer, this, 0, S * 0.05, S * 0.14, S * 0.10, alpha);
  }

  /**
   * Standalone single-entity render — flame → hull → core. WaveManager
   * never calls this for real gameplay (it batches hulls across every
   * on-screen enemy for performance — see EnemyCombat.renderHull); this is
   * for contexts that render exactly one enemy at a time, e.g. EnemyCodex's
   * preview cards or PrologueScene's portal creatures (which pass `alpha`
   * to fade themselves in on spawn).
   */
  render(renderer, alpha = 1) {
    this.renderFlame(renderer, alpha);
    renderHull(renderer, this, SCOUT_HULL_PTS, alpha);
    this.renderCore(renderer, alpha);
  }
}
