/**
 * TetraBoss.js
 * Boss #5 — "Tetra". Spawned by WaveManager on every 5th boss-level
 * encounter (level 35, 70, ... — see Config.boss.roster and WaveManager's
 * boss-selection lookup in its constructor). An original rotating-square
 * silhouette (see TETRA_HULL_PTS below — a plain 4-sided polygon, not a
 * reskin of any existing enemy, same "original hull" lineage as Spiral),
 * spinning continuously while patrolling a slow bouncing path around the
 * upper arena (see _updatePatrol) — unlike Spiral, which holds still to fire
 * and only relocates BETWEEN firing spells, Tetra never stops moving.
 *
 * A repeating TIMED loop between two phases (`_phase`/`_phaseAge` — see
 * update()), similar in spirit to Boss #1's own scout/rocketeer/sniper
 * cycle: phase 1 runs for `Config.boss.tetra.phase1Duration` seconds, then
 * phase 2 for `phase2Duration`, then back to phase 1 — repeating for the
 * entire fight rather than a one-way health-gated escalation.
 *
 *   phase 1 — fires a slow bullet (TetraBullets.js) from each of the hull's
 *   4 sides on every `bullet.fireInterval` tick, evenly spaced around the
 *   current rotation angle — the exact same "N shots fanned around the
 *   current facing" mechanic SpiralBoss uses for its own bullets, just at
 *   this boss's own cadence/speed.
 *
 *   phase 2 — stops firing bullets and instead grows 4 continuous laser
 *   beams, one rigidly attached to each hull side, extending straight
 *   outward past the screen edge and sweeping around with the hull's
 *   (now faster) rotation. Telegraphs for `laser.warmupDuration` seconds
 *   right as EVERY phase-2 entry begins (visible but harmless) before going
 *   live — see checkLaserHit. Collision is a live point-to-segment distance
 *   test (core/vectorMath.js's distanceToSegment) against the player each
 *   frame, not a pooled projectile — WaveManager.checkPlayerHit reads this
 *   the same generic optional-hook way a regular Bouncer's `contactDamage`
 *   already is.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared
 * EnemyCombat.js functions every other boss/enemy class uses — see that
 * file's header for why those are plain functions rather than a base class.
 */
import { Config } from '../core/Config.js';
import { distanceToSegment } from '../core/vectorMath.js';
import { applyHit, tickDeathState, stepEntryGlide, renderHull } from './EnemyCombat.js';

const BS = Config.boss.tetra.size;

// A plain 4-sided polygon — corners at the diagonals, so each EDGE's
// midpoint sits exactly on one of the 4 cardinal directions (0°/90°/180°/
// 270°) relative to the hull's own rotation. Phase 1's bullets and phase 2's
// lasers both fire along those same 4 directions (see _fireDirection), so
// they visually originate from the hull's 4 sides, matching the class doc.
const TETRA_HULL_PTS = [
  [-BS, -BS],
  [ BS, -BS],
  [ BS,  BS],
  [-BS,  BS],
];

export class TetraBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.tetra.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.tetra;

    this.x = vW / 2;
    this.y = -BS;
    this.alive = true;

    this._type = 'boss';
    this._spawnX = vW / 2;
    this._restX  = vW / 2;
    this._restY  = this._cfg.restY;

    this._maxHealth = this._cfg.health + healthBonus;
    this._health    = this._maxHealth;
    this._hitFlash  = 0;
    this._dying     = false;

    this._angle = 0;
    this._state    = 'entering'; // 'entering' -> 'combat'
    this._stateAge = 0;

    this._phase     = 1; // 1 (bullets) or 2 (lasers) — loops, see update()
    this._phaseAge  = 0; // seconds since the CURRENT phase began — drives both the phase1/phase2Duration loop timer and the laser warmup telegraph

    this._fireTimer = 0; // phase 1 bullet cadence

    // Continuous bouncing patrol velocity — real direction rolled once entry
    // finishes (see update()'s 'entering' branch).
    this._vx = 0;
    this._vy = 0;
  }

  get type()       { return this._type; }
  get angle()      { return this._angle; }
  get hitRadius()  { return this._cfg.hitRadius; }
  /** 0-1 remaining health fraction — read by WaveManager for the boss health bar. */
  get healthFrac() { return Math.max(0, this._health) / this._maxHealth; }
  get maxHealth()  { return this._maxHealth; } // see WaveManager._applySkillBombToBoss
  get name()  { return this._cfg.name; }
  get color() { return this._cfg.color; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY  unused — Tetra never
   *   aims at the player (both phases fire along its own rotation), kept
   *   only so every boss class shares the same `update(dt, playerX, playerY,
   *   fire)` shape WaveManager calls generically.
   * @param {{ fireTetraBullet: (ox:number,oy:number,angle:number)=>void }} fire
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge += dt;
    if (tickDeathState(this, dt)) return;

    this._angle += dt * (this._phase === 2 ? cfg.phase2RotationSpeed : cfg.phase1RotationSpeed);

    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'combat');
      if (this._state === 'combat') {
        this._fireTimer = 0;
        const a = Math.random() * Math.PI * 2;
        this._vx = Math.cos(a) * cfg.moveSpeed;
        this._vy = Math.sin(a) * cfg.moveSpeed;
      }
      return;
    }

    this._updatePatrol(dt);
    this._phaseAge += dt;

    // Timed loop — bullets, then lasers, then back to bullets, for the rest
    // of the fight (see class doc). `_fireTimer` resets on returning to
    // phase 1 so it fires immediately rather than waiting out a stale
    // leftover interval from before the last switch.
    if (this._phase === 1 && this._phaseAge >= cfg.phase1Duration) {
      this._phase = 2;
      this._phaseAge = 0;
    } else if (this._phase === 2 && this._phaseAge >= cfg.phase2Duration) {
      this._phase = 1;
      this._phaseAge = 0;
      this._fireTimer = 0;
    }

    if (this._phase === 1) this._updateBulletPhase(dt, fire.fireTetraBullet);
  }

  /** Slow constant-velocity patrol, bouncing off the arena bounds like a DVD-logo — never stops, through both phases. */
  _updatePatrol(dt) {
    const cfg = this._cfg;
    const { width: vW } = Config.virtual;
    const xLo = cfg.boundMarginX, xHi = vW - cfg.boundMarginX;
    const yLo = cfg.boundYMin,    yHi = cfg.boundYMax;

    this.x += this._vx * dt;
    this.y += this._vy * dt;

    if      (this.x < xLo) { this.x = xLo; this._vx = Math.abs(this._vx); }
    else if (this.x > xHi) { this.x = xHi; this._vx = -Math.abs(this._vx); }
    if      (this.y < yLo) { this.y = yLo; this._vy = Math.abs(this._vy); }
    else if (this.y > yHi) { this.y = yHi; this._vy = -Math.abs(this._vy); }
  }

  /** Phase 1 — fires 4 bullets (one per hull side) every `bullet.fireInterval` seconds. */
  _updateBulletPhase(dt, fireTetraBullet) {
    const cfg = this._cfg.bullet;
    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      for (let k = 0; k < 4; k++) {
        const a  = this._fireDirection(k);
        const ox = this.x + Math.cos(a) * BS;
        const oy = this.y + Math.sin(a) * BS;
        fireTetraBullet(ox, oy, a);
      }
      this._fireTimer += cfg.fireInterval;
    }
  }

  /** The kth (0-3) of the hull's 4 side directions, in the hull's current rotation. */
  _fireDirection(k) {
    return this._angle + k * (Math.PI / 2);
  }

  /**
   * The 4 laser beam segments in strokePaths-ready form — one per hull
   * side, from the hull's edge straight outward past the screen — shared by
   * `render` (drawing them) and `checkLaserHit` (colliding against them) so
   * the two always agree exactly.
   */
  _laserPaths() {
    const cfg = this._cfg.laser;
    const paths = [];
    for (let k = 0; k < 4; k++) {
      const a   = this._fireDirection(k);
      const cos = Math.cos(a), sin = Math.sin(a);
      const ox = this.x + cos * BS,         oy = this.y + sin * BS;
      const ex = this.x + cos * cfg.length, ey = this.y + sin * cfg.length;
      paths.push({ points: [[ox, oy], [ex, ey]], closed: false });
    }
    return paths;
  }

  /**
   * Phase-2 laser vs. player test — an optional hook WaveManager.checkPlayerHit
   * reads generically (`e.checkLaserHit?.(...)`), the beam-collision
   * equivalent of a regular Bouncer's `contactDamage` circle test. Returns 0
   * (no damage) during phase 1, or for `laser.warmupDuration` seconds right
   * after EVERY phase-2 entry — the fairness telegraph described in the
   * class doc, replayed fresh on each lap of the loop.
   * @param {number} px @param {number} py @param {number} hitRadius
   * @returns {number}
   */
  checkLaserHit(px, py, hitRadius) {
    const cfg = this._cfg.laser;
    if (this._phase !== 2 || this._phaseAge < cfg.warmupDuration) return 0;
    const rSum = cfg.halfWidth + hitRadius;
    const paths = this._laserPaths();
    for (let i = 0; i < paths.length; i++) {
      const [x1, y1] = paths[i].points[0];
      const [x2, y2] = paths[i].points[1];
      if (distanceToSegment(px, py, x1, y1, x2, y2) <= rSum) return cfg.damage;
    }
    return 0;
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /** Beams (phase 2 only), then hull, then the pulsing core. WaveManager calls this directly (see `_renderIndividualEnemies`) since only one boss is ever on screen at once. */
  render(renderer) {
    renderHull(renderer, this, TETRA_HULL_PTS);
    if (this._phase === 2) this._renderLasers(renderer);
    this._renderCore(renderer);
  }

  /** Outer colored glow + a bright white core stroke per beam, faded in over the warmup window. */
  _renderLasers(renderer) {
    const cfg   = this._cfg.laser;
    const t     = Math.min(1, this._phaseAge / cfg.warmupDuration);
    const alpha = 0.15 + 0.85 * t;
    const paths = this._laserPaths();

    renderer.strokePaths(paths, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color,
      lineCap: 'round', singleStroke: true, alpha,
    });
    renderer.strokePaths(paths, {
      color: cfg.coreColor, lineWidth: cfg.coreLineWidth,
      lineCap: 'round', singleStroke: true, alpha,
    });
  }

  /** Pulsing core-ring glow at the center — stands in for an engine flame, same reasoning as Spiral's own core glow (a rotating turret has no thruster). */
  _renderCore(renderer) {
    const cfg   = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, cfg.coreRadius, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
  }
}
