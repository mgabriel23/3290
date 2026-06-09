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
 * Separation: WaveManager checks pairwise distances each frame and calls
 * relocate(newX, newY) on enemies that are too close. The enemy smoothly
 * moves to the new position before resuming its fire cycle.
 */
import { Config } from '../core/Config.js';

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
const HULL = [{ points: SCOUT_HULL_PTS, closed: true }];

export class Enemy {
  /**
   * @param {number} spawnX  entry column (x at top of screen)
   * @param {number} restX   x of the resting position
   * @param {number} restY   y of the resting position
   */
  constructor(spawnX, restX, restY) {
    this.x     = spawnX;
    this.y     = -S;
    this.alive = true;

    this._spawnX  = spawnX;
    this._restX   = restX;
    this._restY   = restY;
    this._angle   = 0; // recomputed every frame to track the player
    this._health  = Config.enemy.scout.health;
    this._enginePhase = Math.random() * Math.PI * 2;
    this._hitFlash    = 0;     // seconds remaining in hit-white flash
    this._dying       = false; // true once health hits 0; waits for flash to finish

    this._state    = 'entering';
    this._stateAge = 0;
  }

  /**
   * Set a new rest target and smoothly move there — kept for future use
   * (e.g. scripted repositioning) but no longer called by WaveManager's
   * overlap resolution, which now uses direct per-frame position correction.
   * @param {number} nx @param {number} ny
   */
  relocate(nx, ny) {
    this._restX = nx;
    this._restY = ny;
    this._setState('relocating');
  }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   * @param {(ox:number, oy:number, tx:number, ty:number) => void} onFire
   */
  update(dt, playerX, playerY, onFire) {
    const cfg = Config.enemy.scout;
    this._stateAge    += dt;
    this._enginePhase += dt * 9;
    if (this._hitFlash > 0) this._hitFlash -= dt;

    // Hold position and keep flashing until the death-flash fades, then remove
    if (this._dying) {
      if (this._hitFlash <= 0) this.alive = false;
      return;
    }

    // Angle: local -y (nose) points AWAY from player; local +y (tail) faces player.
    // Formula: atan2(-dx, dy) makes tail face (dx, dy). Verified:
    //   player below (dx=0, dy>0) → angle=0 → nose points UP ✓
    //   player right  (dx>0, dy=0) → angle=-π/2 → tail points right ✓
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    this._angle = Math.atan2(-dx, dy);

    if (this._state === 'entering') {
      this.y += cfg.entrySpeed * dt;
      // Diagonal glide: lerp x from spawn column toward rest column
      const t = Math.max(0, Math.min(1, this.y / this._restY));
      this.x  = this._spawnX + (this._restX - this._spawnX) * t;
      if (this.y >= this._restY) {
        this.x = this._restX;
        this.y = this._restY;
        this._setState('aiming');
      }

    } else if (this._state === 'aiming') {
      if (this._stateAge >= cfg.aimPause) {
        onFire(this.x, this.y, playerX, playerY);
        this._setState('firing');
      }

    } else if (this._state === 'firing') {
      if (this._stateAge >= cfg.reloadTime) this._setState('aiming');

    } else if (this._state === 'relocating') {
      const rdx = this._restX - this.x;
      const rdy = this._restY - this.y;
      const dist = Math.sqrt(rdx * rdx + rdy * rdy);
      if (dist < 4) {
        this.x = this._restX;
        this.y = this._restY;
        this._setState('aiming');
      } else {
        const spd = cfg.entrySpeed * 1.3;
        this.x += (rdx / dist) * spd * dt;
        this.y += (rdy / dist) * spd * dt;
      }
    }
  }

  /**
   * Register one bullet hit. Triggers a white flash regardless of outcome.
   * Returns `true` if this hit was fatal (health reached 0) so the caller
   * (WaveManager) knows when to emit the particle burst.
   * @returns {boolean}
   */
  hit() {
    if (this._dying) return false; // already in death animation — ignore further hits
    this._hitFlash = 0.15;
    this._health--;
    if (this._health <= 0) {
      this._dying = true;
      return true; // killed
    }
    return false;
  }

  /** Public angle so WaveManager can read it for world-space hull transforms. */
  get angle() { return this._angle; }

  /**
   * Full standalone render — flame → hull → core.
   * WaveManager bypasses this in favour of batch rendering; this method
   * remains available for any context that renders a single enemy directly.
   */
  render(renderer) {
    this.renderFlame(renderer);
    this._renderHull(renderer);
    this.renderCore(renderer);
  }

  /** Engine exhaust triangle — must be drawn BEFORE the hull so it appears behind it. */
  renderFlame(renderer) {
    const cfg = Config.enemy.scout;
    renderer.drawFlame(0, -S * 0.30, S * 0.45 + Math.sin(this._enginePhase) * 2, {
      x: this.x, y: this.y, rotation: this._angle,
      halfWidth: cfg.flameHalfWidth,
      color:     cfg.flameColor,
    });
  }

  /** Engine core orb — must be drawn AFTER the hull so it sits on top of it. */
  renderCore(renderer) {
    const cfg = Config.enemy.scout;
    renderer.fillEllipse(0, S * 0.05, S * 0.14, S * 0.10, {
      x: this.x, y: this.y, rotation: this._angle,
      fillColor: this._hitFlash > 0 ? cfg.color : cfg.engineCoreColor,
    });
  }

  /**
   * Hull polygon — called directly by render() for standalone use, or pre-empted
   * by WaveManager's batch path (which world-transforms all hulls and draws them
   * in one fillStrokePaths call per style group).
   */
  _renderHull(renderer) {
    const cfg   = Config.enemy.scout;
    const flash = this._hitFlash > 0;
    renderer.fillStrokePaths(HULL, {
      x: this.x, y: this.y, rotation: this._angle,
      fillColor:   flash ? '#ffffff' : cfg.fillColor,
      strokeColor: flash ? '#ffffff' : cfg.color,
      lineWidth:   cfg.lineWidth,
      glowBlur:    flash ? cfg.hitGlowBlur : cfg.glowBlur,
      glowColor:   flash ? '#ffffff' : cfg.color,
    });
  }

  // ---------------------------------------------------------------------------
  _setState(s) { this._state = s; this._stateAge = 0; }
}
