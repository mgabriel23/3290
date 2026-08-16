/**
 * BossEnemy.js
 * The first boss encounter ("Scout Prime") — spawned by WaveManager every
 * `Config.bossSchedule[mode].everyNLevels` levels in place of that level's
 * normal roster (see WaveManager's boss-level branch in its
 * constructor/`_spawnNext`). A
 * giant reskin of the Scout hull — the exact same authored proportions as
 * Enemy.js's SCOUT_HULL_PTS, just parameterized by a much bigger `size` (see
 * BOSS_HULL_PTS below) — whose attack is a cycle through the three
 * "ship-family" enemies it's built from:
 *
 *   phase 0 — Scout-style aimed bullet bursts     (Config.boss.scout1.scoutPhase)
 *   phase 1 — Rocketeer-style homing-missile salvos (...rocketeerPhase)
 *   phase 2 — Sniper-style charge/lock/fire         (...sniperPhase)
 *
 * ...then loops back to phase 0. Each phase runs its own small sub-state
 * machine (`_phaseState`, distinct from the top-level `_state` entering/
 * combat machine) and repeats itself `volleys`/`salvos`/`shots` times before
 * advancing — see `_enterPhase`/`_nextPhase` and each `_updateXPhase` method.
 *
 * Movement: enters from the top like any other enemy (`stepEntryGlide`,
 * shared with Enemy.js/SniperEnemy.js via EnemyCombat.js), then flies a
 * lazy figure-8/infinity loop laid on its side ("landscape" — wide left-
 * right, shallow up-down, see `_updateOrbit`) around its rest point for the
 * rest of the fight, so it never parks completely still like a regular
 * Scout. That loop is frozen entirely during phase 2 (see `update`'s
 * `_phase !== 2` guard) — the sniper phase aims from a dead-still hold,
 * not a drifting position.
 *
 * Hit/death-flash/entry-glide/engine-flame/engine-core rendering all reuse
 * the same shared EnemyCombat.js functions Enemy.js and SniperEnemy.js
 * already use — see that file's header for why those are plain functions
 * rather than a base class. Only one boss is ever on screen (a boss level's
 * synthetic wave config spawns exactly one — see WaveManager), so unlike
 * Scout/Rocketeer/Sniper it renders itself directly instead of being
 * batched into WaveManager's shared hull pools — the same reasoning
 * Drifter/Bouncer already render individually.
 */
import { Config } from '../core/Config.js';
import { rotateAround } from '../core/vectorMath.js';
import { applyHit, tickDeathState, stepEntryGlide, renderEngineFlame, renderEngineCore, renderHull } from './EnemyCombat.js';

const BS = Config.boss.scout1.size;

// Same authored proportions as Enemy.js's SCOUT_HULL_PTS, just parameterized
// by the boss's own (much bigger) size — see class doc.
const BOSS_HULL_PTS = [
  [ 0,        -BS * 0.30],
  [ BS * 0.80, -BS * 0.50],
  [ BS * 0.85,  BS * 0.00],
  [ BS * 0.40,  BS * 0.25],
  [ BS * 0.20,  BS * 0.55],
  [ 0,          BS * 0.70],
  [-BS * 0.20,  BS * 0.55],
  [-BS * 0.40,  BS * 0.25],
  [-BS * 0.85,  BS * 0.00],
  [-BS * 0.80, -BS * 0.50],
];

// Engine-flame anchor (nose) and gun-muzzle anchor (tail tip, where the
// sniper-phase charge orb/shot originate) — same local vertices Enemy.js/
// SniperEnemy.js use for their own (much smaller) S, scaled to BS.
const NOSE_LX = 0, NOSE_LY = -BS * 0.30;
const GUN_LX  = 0, GUN_LY  =  BS * 0.70;

export class BossEnemy {
  /**
   * @param {number} [healthBonus]  added to Config.boss.scout1.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.scout1;

    this.x = vW / 2;
    this.y = -BS;
    this.alive = true;

    this._type = 'boss';
    this._spawnX = vW / 2;
    this._restX  = vW / 2;
    this._restY  = this._cfg.restY;

    this._maxHealth = this._cfg.health + healthBonus;
    this._health    = this._maxHealth;
    this._enginePhase = Math.random() * Math.PI * 2;
    this._hitFlash = 0;
    this._dying    = false;

    this._angle = 0;
    this._state    = 'entering'; // 'entering' -> 'combat'
    this._stateAge = 0;
    // Starts at 0 (NOT randomized, unlike _enginePhase above) — the figure-8
    // parametric form (see _updateOrbit) is exactly (restX, restY) at t=0,
    // so the very first frame the orbit kicks in (right after stepEntryGlide
    // has snapped x/y to _restX/_restY exactly) starts from that same point
    // with zero jump. A random start angle here previously caused a
    // one-frame teleport to wherever the curve landed at that angle the
    // instant combat began — visible as a single sideways "blink" right as
    // the boss finished entering.
    this._orbitPhase = 0;

    // Phase/combat sub-state — real values assigned by _enterPhase once
    // entry finishes (see update()'s 'entering' branch); placeholder here
    // just keeps every field present from construction.
    this._phase      = 0;
    this._phaseState = 'aim';
    this._phaseAge   = 0;

    this._aimX = this.x; this._aimY = 0;
    this._burstShotsFired = 0;
    this._volley = 0;
    this._salvo  = 0;
    this._missilesFired = 0;
    this._targetX = 0; this._targetY = 0;
    this._shot = 0;
  }

  get type()      { return this._type; }
  get angle()     { return this._angle; }
  get hitRadius() { return this._cfg.hitRadius; }
  /** 0-1 remaining health fraction — read by WaveManager for the boss health bar. */
  get healthFrac() { return Math.max(0, this._health) / this._maxHealth; }
  get maxHealth()  { return this._maxHealth; } // see WaveManager._applySkillBombToBoss
  get name()  { return this._cfg.name; }
  get color() { return this._cfg.color; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY
   * @param {{
   *   fireBullet: (ox:number,oy:number,tx:number,ty:number)=>void,
   *   fireRocket: (ox:number,oy:number,tx:number,ty:number,sizeMult?:number)=>void,
   *   fireSniperBullet: (ox:number,oy:number,tx:number,ty:number,speedMult?:number)=>void,
   * }} fire  a small bag of every fire callback WaveManager can route a
   *   boss through — passed as one object (not positional args) so every
   *   boss class can share this exact `update` signature regardless of
   *   which subset of callbacks it actually uses (see SpiralBoss.js, which
   *   only ever reads `fire.fireSpiralBullet`). `fireRocket`'s
   *   `sizeMult`/`fireSniperBullet`'s `speedMult` are this boss's own
   *   `rocketSizeMult`/`bulletSpeedMult` tuning — see each phase's own doc.
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge    += dt;
    this._enginePhase += dt * 6;
    if (tickDeathState(this, dt)) return;

    // Nose points away from the player, same convention as Scout/Sniper —
    // except frozen during the sniper phase's 'locked' telegraph, exactly
    // like SniperEnemy's own angle handling (the bullet fires at the
    // locked point regardless of hull facing, so freezing here is purely visual).
    const frozen = this._state === 'combat' && this._phase === 2 && this._phaseState === 'locked';
    if (!frozen) {
      const dx = playerX - this.x, dy = playerY - this.y;
      this._angle = Math.atan2(-dx, dy);
    }

    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'combat');
      if (this._state === 'combat') this._enterPhase(0);
      return;
    }

    // Figure-8 flight loop — never sits fully still, unlike a regular parked
    // Scout. Frozen entirely for the sniper phase (2) instead: it holds a
    // dead-still aim for that phase's charge/lock/fire, rather than sniping
    // from a drifting position — `_orbitPhase` itself is also frozen (not
    // just x/y), so the loop resumes exactly where it left off once the
    // cycle loops back to phase 0, with no positional pop.
    if (this._phase !== 2) this._updateOrbit(dt);

    if      (this._phase === 0) this._updateScoutPhase(dt, playerX, playerY, fire.fireBullet);
    else if (this._phase === 1) this._updateRocketeerPhase(dt, playerX, playerY, fire.fireRocket);
    else                        this._updateSniperPhase(dt, playerX, playerY, fire.fireSniperBullet);
  }

  /**
   * Lemniscate-of-Gerono figure-8: x = sin(t), y = sin(t)cos(t) — traced
   * with t = `_orbitPhase`. At t=0 this is exactly (restX, restY) (see the
   * constructor's doc for why that matters), sweeps out to the right lobe
   * at t=π/2, back through center at t=π, out to the left lobe at t=3π/2,
   * and closes at t=2π. `orbitAmplitudeX` >> `orbitAmplitudeY` (see Config)
   * is what makes the loop read as a flat, "landscape" infinity symbol
   * rather than a tall figure-8.
   */
  _updateOrbit(dt) {
    const cfg = this._cfg;
    this._orbitPhase += dt * cfg.orbitSpeed;
    const s = Math.sin(this._orbitPhase);
    const c = Math.cos(this._orbitPhase);
    this.x = this._restX + s * cfg.orbitAmplitudeX;
    this.y = this._restY + s * c * cfg.orbitAmplitudeY;
  }

  /** Switch to `phase` (0/1/2 — scout/rocketeer/sniper), resetting that phase's own repeat counter. */
  _enterPhase(phase) {
    this._phase = phase;
    if      (phase === 0) { this._volley = 0; this._setPhaseState('aim'); }
    else if (phase === 1) { this._salvo  = 0; this._missilesFired = 0; this._setPhaseState('aim'); }
    else                  { this._shot   = 0; this._setPhaseState('charge'); }
  }

  /** Advance to the next phase in the cycle (2 wraps back to 0). */
  _nextPhase() { this._enterPhase((this._phase + 1) % 3); }

  _setPhaseState(name) { this._phaseState = name; this._phaseAge = 0; }

  /**
   * Phase 0 — Scout-style aim→burst, repeated `volleys` times. Mirrors
   * Enemy.js's own aiming/firing state machine at boss scale.
   */
  _updateScoutPhase(dt, playerX, playerY, fireBullet) {
    const p = this._cfg.scoutPhase;
    this._phaseAge += dt;

    if (this._phaseState === 'aim') {
      if (this._phaseAge <= dt) { this._aimX = playerX; this._aimY = playerY; }
      if (this._phaseAge >= p.aimPause) {
        this._burstShotsFired = 0;
        this._setPhaseState('burst');
      }
    } else if (this._phaseState === 'burst') {
      if (this._burstShotsFired < p.burstCount && this._phaseAge >= this._burstShotsFired * p.burstInterval) {
        const leadX = playerX + (playerX - this._aimX) * p.leadFactor;
        const leadY = playerY + (playerY - this._aimY) * p.leadFactor;
        fireBullet(this.x, this.y, leadX, leadY);
        this._burstShotsFired++;
      }
      const burstDuration = (p.burstCount - 1) * p.burstInterval;
      if (this._burstShotsFired >= p.burstCount && this._phaseAge >= burstDuration + p.cooldown) {
        this._volley++;
        if (this._volley >= p.volleys) this._nextPhase();
        else this._setPhaseState('aim');
      }
    }
  }

  /**
   * Phase 1 — Rocketeer-style missile swarm: `missileCount` rockets fired
   * one after another, `missileInterval` seconds apart (not all at once —
   * a readable stagger), each fanned across `spreadAngle` around the
   * player's current position (see core/vectorMath.js's rotateAround) so
   * they don't all launch on an identical initial heading. Repeated
   * `salvos` times before advancing — same aim→fire→cooldown shape as
   * `_updateScoutPhase`'s aim→burst.
   */
  _updateRocketeerPhase(dt, playerX, playerY, fireRocket) {
    const p = this._cfg.rocketeerPhase;
    this._phaseAge += dt;

    if (this._phaseState === 'aim') {
      if (this._phaseAge >= p.aimPause) {
        this._missilesFired = 0;
        this._setPhaseState('firing');
      }
    } else if (this._phaseState === 'firing') {
      const n = p.missileCount;
      if (this._missilesFired < n && this._phaseAge >= this._missilesFired * p.missileInterval) {
        const frac = n === 1 ? 0 : (this._missilesFired / (n - 1)) - 0.5; // -0.5 .. 0.5 across the salvo
        const [tx, ty] = rotateAround(this.x, this.y, playerX, playerY, frac * p.spreadAngle);
        fireRocket(this.x, this.y, tx, ty, p.rocketSizeMult);
        this._missilesFired++;
      }
      const firingDuration = (n - 1) * p.missileInterval;
      if (this._missilesFired >= n && this._phaseAge >= firingDuration + p.cooldown) {
        this._salvo++;
        if (this._salvo >= p.salvos) this._nextPhase();
        else this._setPhaseState('aim');
      }
    }
  }

  /**
   * Phase 2 — Sniper-style charge/lock/fire, repeated `shots` times before
   * looping back to phase 0. Same three-beat cadence as SniperEnemy.js.
   */
  _updateSniperPhase(dt, playerX, playerY, fireSniperBullet) {
    const p = this._cfg.sniperPhase;
    this._phaseAge += dt;

    if (this._phaseState === 'charge') {
      if (this._phaseAge >= p.chargeWarmup) {
        this._targetX = playerX;
        this._targetY = playerY;
        this._setPhaseState('locked');
      }
    } else if (this._phaseState === 'locked') {
      if (this._phaseAge >= p.warningDuration) {
        const c = Math.cos(this._angle), s = Math.sin(this._angle);
        const noseX = this.x + c * GUN_LX - s * GUN_LY;
        const noseY = this.y + s * GUN_LX + c * GUN_LY;
        fireSniperBullet(noseX, noseY, this._targetX, this._targetY, p.bulletSpeedMult);
        this._setPhaseState('recover');
      }
    } else if (this._phaseState === 'recover') {
      if (this._phaseAge >= p.recoverDuration) {
        this._shot++;
        if (this._shot >= p.shots) this._nextPhase();
        else this._setPhaseState('charge');
      }
    }
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /** Engine exhaust — must be drawn BEFORE the hull so it appears behind it. */
  renderFlame(renderer) {
    renderEngineFlame(renderer, this, NOSE_LX, NOSE_LY, BS * 0.45);
  }

  /** Engine core orb, plus (during phase 2) the sniper-style charge orb at the gun muzzle. */
  renderCore(renderer) {
    renderEngineCore(renderer, this, 0, BS * 0.05, BS * 0.14, BS * 0.10);

    if (this._hitFlash > 0 || this._state !== 'combat' || this._phase !== 2) return;
    const p = this._cfg.sniperPhase;
    const c = Math.cos(this._angle), s = Math.sin(this._angle);
    const noseX = this.x + c * GUN_LX - s * GUN_LY;
    const noseY = this.y + s * GUN_LX + c * GUN_LY;

    if (this._phaseState === 'charge') {
      const t = this._phaseAge / p.chargeWarmup;
      renderer.strokeCircle(noseX, noseY, p.orbStartRadius + t * p.orbGrowth, {
        color: this._cfg.color, lineWidth: p.orbLineWidth, glowBlur: p.orbGlowBlur, glowColor: this._cfg.color,
        alpha: p.orbAlphaMin + t * (1 - p.orbAlphaMin),
      });
    } else if (this._phaseState === 'locked') {
      const t     = this._phaseAge / p.warningDuration;
      const blink = 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * p.lockedBlinkSpeed));
      renderer.strokeCircle(noseX, noseY, p.lockedOrbRadius, {
        color: this._cfg.color, lineWidth: p.lockedOrbLineWidth, glowBlur: p.lockedOrbGlowBlur, glowColor: this._cfg.color,
        alpha: blink,
      });
    }
  }

  /**
   * White "!" warning marker during the sniper phase's locked telegraph —
   * WaveManager's `_renderSniperExtras` already calls `renderExtras?.()` on
   * every enemy unconditionally each frame, so this needs no extra wiring.
   */
  renderExtras(renderer) {
    if (this._state !== 'combat' || this._phase !== 2 || this._phaseState !== 'locked') return;
    const p     = this._cfg.sniperPhase;
    const t     = this._phaseAge / p.warningDuration;
    const base  = Math.min(1, t * p.warningFadeInSpeed);
    const pulse = base * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * p.warningPulseSpeed)));

    renderer.strokeCircle(this._targetX, this._targetY, p.warningRingRadius, {
      color: '#ffffff', lineWidth: p.warningRingLineWidth, alpha: pulse * p.warningRingAlphaMult,
    });
    renderer.strokeCircle(this._targetX, this._targetY, p.warningDotRadius, {
      color: '#ffffff', lineWidth: p.warningDotLineWidth, glowBlur: p.warningDotGlowBlur, glowColor: '#ffffff', alpha: pulse,
    });
    renderer.drawText('!', this._targetX, this._targetY - p.warningLabelOffset, {
      font: p.warningLabelFont, color: '#ffffff', glowBlur: p.warningLabelGlowBlur, glowColor: '#ffffff', alpha: pulse,
    });
  }

  /**
   * Standalone render — flame → hull → core. WaveManager calls this
   * directly (see `_renderIndividualEnemies`) since only one boss is ever
   * on screen at once, unlike the batched Scout/Rocketeer/Sniper hulls.
   */
  render(renderer) {
    this.renderFlame(renderer);
    renderHull(renderer, this, BOSS_HULL_PTS);
    this.renderCore(renderer);
  }
}
