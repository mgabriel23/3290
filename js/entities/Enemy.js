/**
 * Enemy.js
 * The Scout — first enemy type.
 *
 * Behaviour: enters from the top at speed, gliding diagonally to a random
 * resting position, then fires aimed shots at the player on a fixed reload
 * cycle, leading each shot by however much the player has moved since
 * `_aimStartX/Y` was sampled at the start of the cycle
 * (`Config.enemy.<type>.leadFactor` — 0 for Rocketeer, whose rocket already
 * homes continuously after launch). Each cycle can fire a BURST of multiple
 * shots, `burstCount` rounds `burstInterval` seconds apart (both optional —
 * absent/undefined means a single shot, e.g. Rocketeer's one rocket; Scout
 * fires a 3-round burst) — every round re-runs the lead formula fresh
 * against the player's position at the instant IT fires, not just once for
 * the whole burst, so a fast burst still tracks the player across its short
 * span instead of dumping every round on one now-stale point. `reloadTime`
 * is the cooldown AFTER the whole burst, not between each round of it.
 * After a reload, a `repositionChance` roll may send it gliding to a fresh
 * rest point (`repositioning` state, eased with `core/animation.js`'s
 * `easeOutCubic`) instead of aiming again from the same spot — so it
 * doesn't camp forever.
 * The ship continuously rotates to keep its NOSE pointing AWAY from
 * the player (tail toward player) — giving a "looking upward" silhouette
 * even while tracking. One player bullet kills it; a particle burst from
 * WaveManager provides the death visual.
 *
 * Separation: WaveManager checks pairwise distances each frame and nudges
 * overlapping enemies apart directly (see WaveManager._resolveOverlaps).
 * Repositioning's target also comes from WaveManager (`findRestPoint`,
 * i.e. `_findClearRestPointFor`), which tries to land somewhere already
 * clear of other enemies rather than picking blind — reactive push-apart
 * alone isn't enough here, since 'repositioning' recomputes x/y from the
 * target every frame and would just erase a push next frame otherwise.
 *
 * Hit/death-flash/entry-glide/engine rendering are shared with SniperEnemy
 * (and, partially, DrifterEnemy/BouncerEnemy) via EnemyCombat.js — see that
 * file's header for why those are plain shared functions rather than a base
 * class.
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';
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

    // Lead-prediction aim: `_aimStartX/Y` is sampled once, at the moment
    // 'aiming' begins, and held fixed for the whole cycle — it's the
    // baseline "how far has the player moved since I started tracking"
    // measures from. Every shot (including each round of a burst — see
    // Config.enemy.<type>'s burstCount/burstInterval, both optional/absent
    // = a single shot, e.g. Rocketeer's one rocket) re-runs the lead
    // formula fresh against the CURRENT player position at the instant it
    // actually fires, rather than reusing one shot's target for the whole
    // burst — otherwise a fast burst reads as freezing the player in place
    // instead of tracking them.
    this._aimStartX = spawnX;
    this._aimStartY = 0;
    this._burstShotsFired = 0;

    // Mid-fight repositioning target — see the 'repositioning' branch.
    this._repoStartX = restX;
    this._repoStartY = restY;
  }

  /** Enemy variant — used by WaveManager to route rendering and projectile creation. */
  get type() { return this._type; }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   * @param {(ox:number, oy:number, tx:number, ty:number) => void} onFire
   * @param {(enemy: Enemy) => {x:number, y:number}} findRestPoint  supplies
   *   a rest point clear of other enemies (or a best-effort one) when
   *   repositioning — see WaveManager._findClearRestPointFor.
   */
  update(dt, playerX, playerY, onFire, findRestPoint) {
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
      // Sample once, on the first tick of this state (stateAge was just
      // reset to 0 by whichever transition led here, then bumped by dt
      // above — this is the dt-independent way to detect "just arrived").
      if (this._stateAge <= dt) {
        this._aimStartX = playerX;
        this._aimStartY = playerY;
      }
      if (this._stateAge >= cfg.aimPause) {
        // Lead prediction: extrapolate however far the player moved since
        // `_aimStartX/Y` was sampled, forward by `leadFactor` more of the
        // same motion. leadFactor 0 (Rocketeer) reduces this to plain
        // current-position aim — the rocket's own continuous homing makes
        // leading the initial heading redundant.
        const leadX = playerX + (playerX - this._aimStartX) * cfg.leadFactor;
        const leadY = playerY + (playerY - this._aimStartY) * cfg.leadFactor;
        // The first round fires immediately, right here — same instant as
        // before burst fire existed (byte-identical timing for anything
        // with burstCount 1, e.g. Rocketeer). Additional rounds (if any)
        // fire later from the 'firing' branch below, each re-aiming fresh
        // rather than reusing this target — see this class's constructor doc.
        onFire(this.x, this.y, leadX, leadY);
        this._burstShotsFired = 1;
        setState(this, 'firing');
      }

    } else if (this._state === 'firing') {
      // Burst fire: `burstCount` shots (default 1 — e.g. Rocketeer's single
      // rocket, already fired above), each `burstInterval` seconds apart.
      // The reload countdown is measured from the moment 'firing' began
      // (stateAge==0 right as the transition above ran) and only ends once
      // the whole burst is done, so `reloadTime` still means "cooldown
      // after this attack", not "cooldown after the first round of it".
      const shotCount      = cfg.burstCount ?? 1;
      const burstInterval  = cfg.burstInterval ?? 0;
      if (this._burstShotsFired < shotCount && this._stateAge >= this._burstShotsFired * burstInterval) {
        // Re-aim fresh against the player's CURRENT position for each
        // round — reusing round 1's target for the whole burst would make
        // a fast burst read as freezing the player in place instead of
        // actually tracking them (`_aimStartX/Y` itself stays fixed, same
        // baseline the first round used, only the "where are they now"
        // side of the lead formula updates).
        const leadX = playerX + (playerX - this._aimStartX) * cfg.leadFactor;
        const leadY = playerY + (playerY - this._aimStartY) * cfg.leadFactor;
        onFire(this.x, this.y, leadX, leadY);
        this._burstShotsFired++;
      }
      const totalFiringDuration = (shotCount - 1) * burstInterval + cfg.reloadTime;
      if (this._stateAge >= totalFiringDuration) {
        if (Math.random() < cfg.repositionChance) {
          this._repoStartX = this.x;
          this._repoStartY = this.y;
          const target = findRestPoint(this);
          this._restX = target.x;
          this._restY = target.y;
          setState(this, 'repositioning');
        } else {
          setState(this, 'aiming');
        }
      }

    } else if (this._state === 'repositioning') {
      // Same ease-out-cubic Player.js's own entry animation uses — not
      // stepEntryGlide, which is hard-coded to "enter from the top edge"
      // and doesn't fit a mid-fight reposition between two arbitrary points.
      const t = Math.min(this._stateAge / cfg.repositionDuration, 1);
      const eased = easeOutCubic(t);
      this.x = this._repoStartX + (this._restX - this._repoStartX) * eased;
      this.y = this._repoStartY + (this._restY - this._repoStartY) * eased;
      if (t >= 1) setState(this, 'aiming');
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
