/**
 * SniperEnemy.js
 * Variant 3 — same Scout hull silhouette, electric violet, 8 health.
 *
 * Fires a real bullet (see SniperBullets.js) straight at wherever the player
 * was the instant it locked on — no continuous tracking after launch, no
 * historical-position misdirection. The threat instead comes from the
 * bullet's own speed curve: it crawls at `Config.enemy.sniper.bullet.
 * startSpeed` for a beat, then rockets up to `maxSpeed`, so a player who
 * reads the charge/warning telegraph AND keeps watching the bullet itself
 * has a real (if brief) window before it's actually dangerous.
 *
 * Shot cycle (repeats immediately):
 *   charging (1.5s) — nose orb grows; ship tracks player as normal
 *   locked   (0.7s) — target locked to the player's CURRENT position; nose
 *                      SNAPS to face target and STOPS tracking player; !
 *                      marker shown on canvas; nose orb blinks at full size
 *   → fires the bullet, then → recovering (resumes player tracking)
 *
 * Angle convention: same as Scout — atan2(-dx, dy) makes the NOSE face AWAY
 * from the player during normal tracking. In locked, the angle is frozen at
 * whatever it last tracked to (which, thanks to update()'s ordering, is
 * already facing away from the just-locked target — see the angle-tracking
 * block below).
 *
 * Entry-glide, hit/death-flash, and engine flame/core rendering are shared
 * with Enemy.js via EnemyCombat.js — see that file's header for why.
 */
import { Config } from '../core/Config.js';
import { SCOUT_HULL_PTS, SCOUT_S } from './Enemy.js';
import { applyHit, tickDeathState, setState, stepEntryGlide, renderEngineFlame, renderEngineCore, renderHull } from './EnemyCombat.js';

const S = SCOUT_S; // shared with Scout — both hulls use the same 22vp base size

// Engine-flame anchor in local space — same vertex Scout uses for its exhaust.
const NOSE_LX = 0;
const NOSE_LY = -S * 0.30;

// Gun muzzle in local space — the hull's single sharp tip, where the charge
// orb glows and the bullet actually fires from.
const GUN_LX = 0;
const GUN_LY = S * 0.70;

export class SniperEnemy {
  /**
   * @param {number} spawnX  entry column
   * @param {number} restX   resting x
   * @param {number} restY   resting y
   * @param {number} [healthBonus]  added to `Config.enemy.sniper.health` — used by WaveManager to scale health by level
   */
  constructor(spawnX, restX, restY, healthBonus = 0) {
    this.x     = spawnX;
    this.y     = -S;
    this.alive = true;

    this._type  = 'sniper';
    this._cfg   = Config.enemy.sniper;
    this._spawnX = spawnX;
    this._restX  = restX;
    this._restY  = restY;

    this._angle       = 0;
    // Cached cos/sin of _angle — recomputed only on the frames the angle
    // actually changes (charging/entering/recovering), then reused by both
    // renderCore and renderExtras instead of each calling Math.cos/sin again.
    this._cosA        = 1;
    this._sinA        = 0;
    this._health      = this._cfg.health + healthBonus;
    this._enginePhase = Math.random() * Math.PI * 2;
    this._hitFlash    = 0;
    this._dying       = false;

    this._state    = 'entering';
    this._stateAge = 0;

    // ── Locked target — the player's position at the instant 'charging' ends ──
    this._targetX = 0;
    this._targetY = 0;
  }

  get type()  { return this._type;  }
  get angle() { return this._angle; }

  /** Collision radius — used by GameplayScene's bullet↔enemy hit test. */
  get hitRadius() { return this._cfg.hitRadius; }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   * @param {(ox:number, oy:number, tx:number, ty:number) => void} onFire  fires the sniper bullet — see WaveManager's routing
   */
  update(dt, playerX, playerY, onFire) {
    const cfg = this._cfg;
    this._stateAge    += dt;
    this._enginePhase += dt * 9;
    if (tickDeathState(this, dt)) return;

    // ── Angle tracking ───────────────────────────────────────────────────────
    // Charging/entering: nose points away from player (same as Scout).
    // Locked: angle frozen at whatever it was — no tracking, no sweep. The
    // bullet fires from the nose toward _targetX/Y directly, so its
    // direction is independent of the ship's visual orientation. Recovering:
    // slowly turns back to face away from the player again, so the post-fire
    // reorientation reads as a deliberate motion, not an instant snap.
    if (this._state === 'recovering') {
      const dx          = playerX - this.x;
      const dy          = playerY - this.y;
      const targetAngle = Math.atan2(-dx, dy);
      const diff = Math.atan2(
        Math.sin(targetAngle - this._angle),
        Math.cos(targetAngle - this._angle),
      );
      const step = cfg.recoverTurnRate * dt;
      this._angle += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      this._cosA = Math.cos(this._angle);
      this._sinA = Math.sin(this._angle);
    } else if (this._state !== 'locked') {
      const dx    = playerX - this.x;
      const dy    = playerY - this.y;
      this._angle = Math.atan2(-dx, dy);
      this._cosA  = Math.cos(this._angle);
      this._sinA  = Math.sin(this._angle);
    }
    // Locked: angle frozen — _cosA/_sinA still hold the values from the last
    // frame they changed, so renderCore/renderExtras need no new trig calls.

    // ── State machine ────────────────────────────────────────────────────────
    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'charging');

    } else if (this._state === 'charging') {
      if (this._stateAge >= cfg.chargeWarmup) {
        // Lock onto the player's CURRENT position — not a historical one.
        this._targetX = playerX;
        this._targetY = playerY;
        setState(this, 'locked');
      }

    } else if (this._state === 'locked') {
      if (this._stateAge >= cfg.warningDuration) {
        // Gun muzzle world position — reuses cos/sin frozen at lock time.
        const c     = this._cosA;
        const s     = this._sinA;
        const noseX = this.x + c * GUN_LX - s * GUN_LY;
        const noseY = this.y + s * GUN_LX + c * GUN_LY;
        onFire(noseX, noseY, this._targetX, this._targetY);
        setState(this, 'recovering');
      }

    } else if (this._state === 'recovering') {
      if (this._stateAge >= cfg.recoverDuration) {
        setState(this, 'charging');
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

  /**
   * Engine exhaust — drawn behind the hull by WaveManager. `alpha` is an
   * optional entrance-fade multiplier (default 1, so WaveManager's real
   * per-frame calls are unaffected) — see EnemyCombat.renderHull's doc.
   */
  renderFlame(renderer, alpha = 1) {
    renderEngineFlame(renderer, this, NOSE_LX, NOSE_LY, S * 0.45, alpha);
  }

  /**
   * Standalone single-entity render — flame → hull → core (+ charge orb).
   * WaveManager never calls this for real gameplay (it batches hulls across
   * every on-screen enemy for performance); this is for contexts that
   * render exactly one enemy at a time, e.g. EnemyCodex's preview cards or
   * PrologueScene's portal creatures (which pass `alpha` to fade in on spawn).
   * Doesn't include renderExtras (the "!" warning marker) — that's
   * attack-telegraph state, not part of the ship's resting look.
   */
  render(renderer, alpha = 1) {
    this.renderFlame(renderer, alpha);
    renderHull(renderer, this, SCOUT_HULL_PTS, alpha);
    this.renderCore(renderer, alpha);
  }

  /** Engine orb + nose charge orb — drawn on top of hull by WaveManager. */
  renderCore(renderer, alpha = 1) {
    const cfg   = this._cfg;
    const flash = this._hitFlash > 0;

    renderEngineCore(renderer, this, 0, S * 0.05, S * 0.14, S * 0.10, alpha);

    if (flash) return;

    // Gun muzzle world position — reuses cos/sin cached in update()
    const c     = this._cosA;
    const s     = this._sinA;
    const noseX = this.x + c * GUN_LX - s * GUN_LY;
    const noseY = this.y + s * GUN_LX + c * GUN_LY;

    if (this._state === 'charging') {
      // Orb grows from nothing toward full charge
      const t = this._stateAge / cfg.chargeWarmup;
      renderer.strokeCircle(noseX, noseY, cfg.chargeOrbStartRadius + t * cfg.chargeOrbGrowth, {
        color:    cfg.color,
        lineWidth: cfg.chargeOrbLineWidth,
        glowBlur:  cfg.chargeOrbGlowBlur,
        glowColor: cfg.color,
        alpha:     (cfg.chargeOrbAlphaMin + t * (1 - cfg.chargeOrbAlphaMin)) * alpha,
      });

    } else if (this._state === 'locked') {
      // Full charge — rapid blink to signal imminent fire
      const t     = this._stateAge / cfg.warningDuration;
      const blink = 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * cfg.lockedBlinkSpeed));
      renderer.strokeCircle(noseX, noseY, cfg.lockedOrbRadius, {
        color:    cfg.color,
        lineWidth: cfg.lockedOrbLineWidth,
        glowBlur:  cfg.lockedOrbGlowBlur,
        glowColor: cfg.color,
        alpha:     blink * alpha,
      });
    }
  }

  /**
   * White ! warning indicator marking the locked firing point.
   * Optional-chained in WaveManager so Scout/Rocketeer skip it automatically.
   */
  renderExtras(renderer) {
    if (this._state !== 'locked') return;
    const cfg   = this._cfg;
    const t     = this._stateAge / cfg.warningDuration;
    const base  = Math.min(1, t * cfg.warningFadeInSpeed);
    const pulse = base * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * cfg.warningPulseSpeed)));

    // Outer pulsing ring — no glow (alpha-only ring is cheap and still reads
    // clearly against the inner dot + "!" which carry the glow)
    renderer.strokeCircle(this._targetX, this._targetY, cfg.warningRingRadius, {
      color:    '#ffffff',
      lineWidth: cfg.warningRingLineWidth,
      alpha:     pulse * cfg.warningRingAlphaMult,
    });

    // Inner filled dot to mark the exact hit point
    renderer.strokeCircle(this._targetX, this._targetY, cfg.warningDotRadius, {
      color:    '#ffffff',
      lineWidth: cfg.warningDotLineWidth,
      glowBlur:  cfg.warningDotGlowBlur,
      glowColor: '#ffffff',
      alpha:     pulse,
    });

    // "!" label above the marker — white, larger
    renderer.drawText('!', this._targetX, this._targetY - cfg.warningLabelOffset, {
      font:      cfg.warningLabelFont,
      color:     '#ffffff',
      glowBlur:  cfg.warningLabelGlowBlur,
      glowColor: '#ffffff',
      alpha:     pulse,
    });
  }
}
