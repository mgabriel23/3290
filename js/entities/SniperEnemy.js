/**
 * SniperEnemy.js
 * Variant 3 — same Scout hull silhouette, electric violet, 8 health.
 *
 * Fires an instant laser beam at where the player WAS 1.3 seconds ago,
 * giving a skilled player a dodge window if they read the warning.
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
 */
import { Config } from '../core/Config.js';
import { SCOUT_HULL_PTS } from './Enemy.js';

const S            = 22;
const HIST_STEP    = 0.05;  // seconds between position samples
const HIST_SAMPLES = Math.round(Config.enemy.sniper.historyWindow / HIST_STEP); // = 26

// Nose tip in local space — top-centre hull vertex; laser fires from here
const NOSE_LX = 0;
const NOSE_LY = -S * 0.30;

export class SniperEnemy {
  /**
   * @param {number} spawnX  entry column
   * @param {number} restX   resting x
   * @param {number} restY   resting y
   */
  constructor(spawnX, restX, restY) {
    this.x     = spawnX;
    this.y     = -S;
    this.alive = true;

    this._type  = 'sniper';
    this._cfg   = Config.enemy.sniper;
    this._spawnX = spawnX;
    this._restX  = restX;
    this._restY  = restY;

    this._angle       = 0;
    this._health      = this._cfg.health;
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
    if (this._hitFlash > 0) this._hitFlash -= dt;

    if (this._dying) {
      if (this._hitFlash <= 0) this.alive = false;
      return;
    }

    // ── Angle tracking ───────────────────────────────────────────────────────
    // Charging/entering: nose points away from player (same as Scout).
    // Locked/flashing: angle frozen at whatever it was — no tracking, no snap,
    // no sweep. The laser fires from the nose toward _targetX/Y directly, so
    // the beam direction is independent of the ship's visual orientation.
    if (this._state !== 'locked' && this._state !== 'flashing') {
      const dx    = playerX - this.x;
      const dy    = playerY - this.y;
      this._angle = Math.atan2(-dx, dy);
    }

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
      this.y += cfg.entrySpeed * dt;
      const t = Math.max(0, Math.min(1, this.y / this._restY));
      this.x  = this._spawnX + (this._restX - this._spawnX) * t;
      if (this.y >= this._restY) {
        this.x = this._restX;
        this.y = this._restY;
        this._setState('charging');
      }

    } else if (this._state === 'charging') {
      if (this._stateAge >= cfg.chargeWarmup) {
        // Read the oldest history slot = historyWindow seconds in the past
        const oldestIdx  = (this._histHead + 1) % HIST_SAMPLES;
        this._targetX    = this._histX[oldestIdx];
        this._targetY    = this._histY[oldestIdx];
        this._setState('locked');
      }

    } else if (this._state === 'locked') {
      if (this._stateAge >= cfg.warningDuration) {
        this._setState('flashing');
      }

    } else if (this._state === 'flashing') {
      if (this._stateAge >= Config.laser.flashDuration) {
        this._setState('charging'); // immediately recharge
      }
    }
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @returns {boolean}
   */
  hit() {
    if (this._dying) return false;
    this._hitFlash = 0.15;
    this._health--;
    if (this._health <= 0) {
      this._dying = true;
      return true;
    }
    return false;
  }

  /** Engine exhaust — drawn behind the hull by WaveManager. */
  renderFlame(renderer) {
    const cfg = this._cfg;
    renderer.drawFlame(NOSE_LX, NOSE_LY, S * 0.45 + Math.sin(this._enginePhase) * 2, {
      x: this.x, y: this.y, rotation: this._angle,
      halfWidth: cfg.flameHalfWidth,
      color:     cfg.flameColor,
    });
  }

  /** Engine orb + nose charge orb — drawn on top of hull by WaveManager. */
  renderCore(renderer) {
    const cfg   = this._cfg;
    const flash = this._hitFlash > 0;

    // Engine core orb
    renderer.fillEllipse(0, S * 0.05, S * 0.14, S * 0.10, {
      x: this.x, y: this.y, rotation: this._angle,
      fillColor: flash ? cfg.color : cfg.engineCoreColor,
    });

    if (flash) return;

    // Nose world position
    const c     = Math.cos(this._angle);
    const s     = Math.sin(this._angle);
    const noseX = this.x + c * NOSE_LX - s * NOSE_LY;
    const noseY = this.y + s * NOSE_LX + c * NOSE_LY;

    if (this._state === 'charging') {
      // Orb grows from nothing toward full charge
      const t = this._stateAge / cfg.chargeWarmup;
      renderer.strokeCircle(noseX, noseY, 3 + t * 7, {
        color:    cfg.color,
        lineWidth: 2,
        glowBlur:  8,
        glowColor: cfg.color,
        alpha:     0.2 + t * 0.8,
      });

    } else if (this._state === 'locked' || this._state === 'flashing') {
      // Full charge — rapid blink to signal imminent fire
      const t     = this._stateAge / cfg.warningDuration;
      const blink = 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * 6));
      renderer.strokeCircle(noseX, noseY, 10, {
        color:    cfg.color,
        lineWidth: 2.5,
        glowBlur:  12,
        glowColor: cfg.color,
        alpha:     blink,
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
      const t     = this._stateAge / this._cfg.warningDuration;
      const base  = Math.min(1, t * 6);           // fast fade-in
      const pulse = base * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 4)));

      // Outer pulsing ring — white, larger than before
      renderer.strokeCircle(this._targetX, this._targetY, 20, {
        color:    '#ffffff',
        lineWidth: 2,
        glowBlur:  8,
        glowColor: '#ffffff',
        alpha:     pulse * 0.6,
      });

      // Inner filled dot to mark the exact hit point
      renderer.strokeCircle(this._targetX, this._targetY, 4, {
        color:    '#ffffff',
        lineWidth: 3,
        glowBlur:  6,
        glowColor: '#ffffff',
        alpha:     pulse,
      });

      // "!" label above the marker — white, larger
      renderer.drawText('!', this._targetX, this._targetY - 32, {
        font:      '400 28px "Audiowide", "Courier New", monospace',
        color:     '#ffffff',
        glowBlur:  14,
        glowColor: '#ffffff',
        alpha:     pulse,
      });
    }

    // ── Laser flash ───────────────────────────────────────────────────────────
    if (this._state === 'flashing') {
      const flashT = this._stateAge / Config.laser.flashDuration;
      const alpha  = Math.pow(1 - flashT, 1.5);

      const c     = Math.cos(this._angle);
      const s     = Math.sin(this._angle);
      const noseX = this.x + c * NOSE_LX - s * NOSE_LY;
      const noseY = this.y + s * NOSE_LX + c * NOSE_LY;

      // Direction from nose through target, extended off-screen
      const ddx  = this._targetX - noseX;
      const ddy  = this._targetY - noseY;
      const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      const ux   = ddx / dlen;
      const uy   = ddy / dlen;

      this._laserPath[0].points[0][0] = noseX;
      this._laserPath[0].points[0][1] = noseY;
      this._laserPath[0].points[1][0] = noseX + ux * 1200;
      this._laserPath[0].points[1][1] = noseY + uy * 1200;

      this._laserStyle.alpha = alpha;
      renderer.strokePaths(this._laserPath, this._laserStyle, 1);
    }
  }

  // ---------------------------------------------------------------------------
  _setState(s) { this._state = s; this._stateAge = 0; }
}
