/**
 * SniperEnemy.js
 * Variant 3 — same Scout hull silhouette, electric violet, 8 health.
 *
 * Fires an instant laser beam at where the player WAS `historyWindow`
 * seconds ago (see Config.enemy.sniper), giving a skilled player a dodge
 * window if they read the warning.
 *
 * Shot cycle (repeats immediately):
 *   charging (2 s)  — nose orb grows; ship tracks player as normal
 *   locked   (1 s)  — target locked from history; nose SNAPS to face target
 *                      and STOPS tracking player; ! marker shown on canvas;
 *                      nose orb blinks at full size
 *   flashing (0.2s) — instant laser beam; angle still held on target
 *   → back to charging (resumes player tracking)
 *
 * Angle convention: same as Scout — atan2(-dx, dy) makes the NOSE face AWAY
 * from the player during normal tracking. In locked/flashing, the angle is
 * overridden to Math.atan2(tdx, -tdy) so the nose faces TOWARD the target.
 *
 * Entry-glide, hit/death-flash, and engine flame/core rendering are shared
 * with Enemy.js via EnemyCombat.js — see that file's header for why.
 */
import { Config } from '../core/Config.js';
import { SCOUT_HULL_PTS, SCOUT_S } from './Enemy.js';
import { applyHit, tickDeathState, setState, stepEntryGlide, renderEngineFlame, renderEngineCore, renderHull } from './EnemyCombat.js';

const S            = SCOUT_S; // shared with Scout — both hulls use the same 22vp base size
const HIST_STEP    = 0.05;  // seconds between position samples
const HIST_SAMPLES = Math.round(Config.enemy.sniper.historyWindow / HIST_STEP);

// Engine-flame anchor in local space — same vertex Scout uses for its exhaust.
const NOSE_LX = 0;
const NOSE_LY = -S * 0.30;

// Gun muzzle in local space — the hull's single sharp tip, where the charge
// orb glows and the laser actually fires from.
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

    // ── Player position history (ring buffer) ─────────────────────────────────
    this._histX    = new Float32Array(HIST_SAMPLES);
    this._histY    = new Float32Array(HIST_SAMPLES);
    this._histHead = 0;
    this._histTick = 0;

    // ── Locked target ─────────────────────────────────────────────────────────
    this._targetX = 0;
    this._targetY = 0;

    // ── Laser flash (pre-allocated, no per-frame heap) ────────────────────────
    this._laserPath  = [{ points: [[0, 0], [0, 0]], closed: false }];
    const lc = Config.laser;
    this._laserStyle = {
      color: lc.color, lineWidth: lc.lineWidth,
      glowBlur: lc.glowBlur, glowColor: lc.color,
      lineCap: 'round', alpha: 1,
    };
  }

  get type()  { return this._type;  }
  get angle() { return this._angle; }

  /** Collision radius — used by GameplayScene's bullet↔enemy hit test. */
  get hitRadius() { return this._cfg.hitRadius; }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   * @param {Function} _onFire  unused — sniper manages its own laser internally
   */
  update(dt, playerX, playerY, _onFire) {
    const cfg = this._cfg;
    this._stateAge    += dt;
    this._enginePhase += dt * 9;
    if (tickDeathState(this, dt)) return;

    // ── Angle tracking ───────────────────────────────────────────────────────
    // Charging/entering: nose points away from player (same as Scout).
    // Locked/flashing: angle frozen at whatever it was — no tracking, no snap,
    // no sweep. The laser fires from the nose toward _targetX/Y directly, so
    // the beam direction is independent of the ship's visual orientation.
    // Recovering: slowly turns back to face away from the player again, so
    // the post-fire reorientation reads as a deliberate motion, not an instant snap.
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
    } else if (this._state !== 'locked' && this._state !== 'flashing') {
      const dx    = playerX - this.x;
      const dy    = playerY - this.y;
      this._angle = Math.atan2(-dx, dy);
      this._cosA  = Math.cos(this._angle);
      this._sinA  = Math.sin(this._angle);
    }
    // Locked/flashing: angle frozen — _cosA/_sinA still hold the values from
    // the last frame they changed, so renderCore/renderExtras need no new trig calls.

    // ── Record player position history ───────────────────────────────────────
    this._histTick += dt;
    if (this._histTick >= HIST_STEP) {
      this._histTick -= HIST_STEP;
      this._histHead  = (this._histHead + 1) % HIST_SAMPLES;
      this._histX[this._histHead] = playerX;
      this._histY[this._histHead] = playerY;
    }

    // ── State machine ────────────────────────────────────────────────────────
    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'charging');

    } else if (this._state === 'charging') {
      if (this._stateAge >= cfg.chargeWarmup) {
        // Read the oldest history slot = historyWindow seconds in the past
        const oldestIdx  = (this._histHead + 1) % HIST_SAMPLES;
        this._targetX    = this._histX[oldestIdx];
        this._targetY    = this._histY[oldestIdx];
        setState(this, 'locked');
      }

    } else if (this._state === 'locked') {
      if (this._stateAge >= cfg.warningDuration) {
        setState(this, 'flashing');
      }

    } else if (this._state === 'flashing') {
      if (this._stateAge >= Config.laser.flashDuration) {
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
   * Doesn't include renderExtras (the "!" warning marker / laser flash) —
   * those are attack-telegraph state, not part of the ship's resting look.
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

    } else if (this._state === 'flashing') {
      // Charge orb releases outward into the laser — expanding ring that fades fast
      const t = this._stateAge / Config.laser.flashDuration;
      renderer.strokeCircle(noseX, noseY, cfg.lockedOrbRadius + t * cfg.flashOrbGrowth, {
        color:    cfg.color,
        lineWidth: cfg.lockedOrbLineWidth,
        glowBlur:  cfg.lockedOrbGlowBlur,
        glowColor: cfg.color,
        alpha:     (1 - t) * alpha,
      });
    }
  }

  /**
   * White ! warning indicator and laser flash beam.
   * Optional-chained in WaveManager so Scout/Rocketeer skip it automatically.
   */
  renderExtras(renderer) {
    // ── Warning marker ────────────────────────────────────────────────────────
    if (this._state === 'locked') {
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

    // ── Laser flash ───────────────────────────────────────────────────────────
    if (this._state === 'flashing') {
      const flashT = this._stateAge / Config.laser.flashDuration;
      const rem    = 1 - flashT;
      const alpha  = rem * Math.sqrt(rem); // == rem^1.5, cheaper than Math.pow

      // Reuse cos/sin cached in update() — angle is frozen during flashing
      const c     = this._cosA;
      const s     = this._sinA;
      const noseX = this.x + c * GUN_LX - s * GUN_LY;
      const noseY = this.y + s * GUN_LX + c * GUN_LY;

      // Direction from nose through target, extended off-screen
      const ddx  = this._targetX - noseX;
      const ddy  = this._targetY - noseY;
      const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      const ux   = ddx / dlen;
      const uy   = ddy / dlen;

      const beamLength = Config.laser.beamLength;
      this._laserPath[0].points[0][0] = noseX;
      this._laserPath[0].points[0][1] = noseY;
      this._laserPath[0].points[1][0] = noseX + ux * beamLength;
      this._laserPath[0].points[1][1] = noseY + uy * beamLength;

      this._laserStyle.alpha = alpha;
      renderer.strokePaths(this._laserPath, this._laserStyle, 1);
    }
  }
}
