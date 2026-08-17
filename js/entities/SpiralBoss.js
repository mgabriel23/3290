/**
 * SpiralBoss.js
 * Boss #2 — "Spiral". Spawned by WaveManager on every OTHER boss-level
 * encounter (level 14, 42, ... under Survival Mode's canonical schedule —
 * see Config.bossSchedule[mode].roster and WaveManager's boss-selection
 * lookup in its constructor). An original radial-turret/orb
 * silhouette (see SPIRAL_HULL_PTS below — a symmetric 4-pointed star/gear,
 * one spike per spiral arm), unlike Boss #1's giant-Scout reskin: no other
 * enemy in the game is circular, so this reads as a wholly different kind
 * of threat.
 *
 * A repeating TIMED loop between two phases (`_phase`/`_phaseAge` — see
 * update()), same "never settles permanently, loops for the whole fight"
 * convention TetraBoss uses rather than a one-way health-gated escalation:
 *
 *   phase 1 (`phase1Duration` seconds — deliberately short, roughly one
 *   firing/reposition subcycle) — holds its firing spot, spinning at
 *   `rotationSpeed` (`_angle`, doubling as both the hull's render rotation
 *   AND the current fire direction) while firing `fireDirections` slow
 *   bullets every `fireInterval` seconds, evenly spaced around that current
 *   angle (e.g. 4 → one every 90°) — aimed along whatever directions the
 *   turret currently faces, NOT at the player, unlike every other enemy/
 *   boss in the game. Because the fire angle keeps rotating tick to tick,
 *   the individual straight-line bullets (SpiralBullets.js) fan out into
 *   `fireDirections` interleaved visible spiral arms as they travel
 *   outward — no curved-path bullet math needed, the spiral shape emerges
 *   purely from firing straight shots at a slightly different angle each
 *   tick. Each firing burst (`fireDuration` seconds — deliberately close to
 *   one full rotation, so it reads as "complete a loop, then move") ends
 *   with either another relocation glide within phase 1 (`_beginReposition`,
 *   eased with core/animation.js's easeOutCubic — the same curve Enemy.js's
 *   own mid-fight repositioning uses) or, once `phase1Duration` has
 *   elapsed, a transition into phase 2.
 *
 *   phase 2 — a charge telegraph, THEN live rotating lasers:
 *
 *     'charging' (`laser.chargeDuration` seconds) — holds its current spot
 *     with rotation completely FROZEN (`_angle` doesn't advance — the fire
 *     angle it froze at is exactly where the beams will start from) while a
 *     warning telegraph plays for each of the SPIKES upcoming beam
 *     directions: a faint dashed preview line plus a pulsing ring marking
 *     exactly where that beam will cross the screen edge
 *     (`_renderChargeWarning`/`_chargeWarningPaths`, core/vectorMath.js's
 *     `rayRectExit`). Deals no damage yet.
 *
 *     'lasering' (`phase2Duration` seconds) — the charge resolves into 4
 *     continuous, damaging laser beams (`laser`), one rigidly attached to
 *     each hull spike, extending straight outward past the screen edge —
 *     same beam mechanic TetraBoss's own phase 2 uses (live
 *     point-to-segment test each frame, not a pooled projectile — see
 *     checkLaserHit). Rotation resumes here, but at `phase2RotationSpeed` —
 *     much SLOWER than phase 1's own spin, a slow, readable sweep rather
 *     than a blur. Unlike phase 1's hold-still-and-occasionally-relocate
 *     rhythm, this sub-phase never stops moving: it bounces around the same
 *     play-area bounds like a DVD logo (`phase2MoveSpeed`, see
 *     `_updatePatrol`), so the beams sweep AND drift at once. Loops back to
 *     phase 1 once `phase2Duration` elapses.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared
 * EnemyCombat.js functions every other enemy class uses — see that file's
 * header for why those are plain functions rather than a base class. No
 * engine flame (unlike the ship-family bosses/enemies) — a hovering orb
 * has no thruster; a pulsing core-ring glow stands in for one instead.
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';
import { distanceToSegment, rayRectExit } from '../core/vectorMath.js';
import { applyHit, tickDeathState, stepEntryGlide, renderHull } from './EnemyCombat.js';

const BS       = Config.boss.spiral.size;
const SPIKES   = Config.boss.spiral.spikeCount;
const OUTER_R  = BS;
const INNER_R  = BS * Config.boss.spiral.innerRadiusRatio;

// A symmetric N-pointed star/gear outline — alternating outer (spike tip)
// and inner (core ring) points evenly spaced around a full circle. Unlike
// BOSS_HULL_PTS (BossEnemy.js), this isn't derived from any existing
// enemy's authored silhouette — it's original to this boss.
const SPIRAL_HULL_PTS = [];
for (let j = 0; j < SPIKES * 2; j++) {
  const angle = j * (Math.PI / SPIKES);
  const r = (j % 2 === 0) ? OUTER_R : INNER_R;
  SPIRAL_HULL_PTS.push([r * Math.cos(angle), r * Math.sin(angle)]);
}

export class SpiralBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.spiral.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.spiral;

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

    // Continuous spin — doubles as the hull's render rotation and the
    // current fire direction (see class doc). Frozen during phase 2's
    // 'charging' sub-state — see update().
    this._angle = 0;

    this._state     = 'entering'; // 'entering' -> 'firing' <-> 'repositioning' (phase 1) / 'charging' -> 'lasering' (phase 2)
    this._stateAge  = 0;
    this._fireTimer = 0; // seconds remaining until the next bullet

    this._phase    = 1; // 1 (spiral bullets) or 2 (charge + rotating lasers/patrol) — loops for the whole fight, see class doc
    this._phaseAge = 0; // seconds since phase 1 last began — only used to gate the phase1 -> phase2 transition

    // Repositioning origin/target — real values assigned by
    // _beginReposition once a firing spell ends.
    this._moveFromX = this.x; this._moveFromY = this._restY;
    this._moveToX   = this.x; this._moveToY   = this._restY;

    // Phase 2 patrol velocity — real direction rolled once the charge
    // telegraph ends and the live beams begin (see _enterLiveLaserPhase).
    this._vx = 0;
    this._vy = 0;

    // Pre-allocated laser beam path pool — mutated in place by
    // _laserPaths()/_chargeWarningPaths() (mutually exclusive in time, so
    // safely shared), reused by render and checkLaserHit (both called every
    // frame during phase 2) so neither reallocates SPIKES path objects +
    // nested arrays per call. Same convention as TetraBoss's own pool.
    this._laserPathPool = Array.from({ length: SPIKES }, () => ({ points: [[0, 0], [0, 0]], closed: false }));
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
   * @param {number} playerX @param {number} playerY  unused — Spiral never
   *   aims at the player, kept only so every boss class shares the same
   *   `update(dt, playerX, playerY, fire)` shape WaveManager calls generically.
   * @param {{ fireSpiralBullet: (ox:number,oy:number,angle:number)=>void }} fire
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge += dt;
    if (tickDeathState(this, dt)) return;

    // Phase 1 spins continuously. Phase 2 freezes rotation during 'charging'
    // (so the warning telegraph below stays locked to the exact directions
    // the beams will start from) and only resumes, at the much slower
    // phase2RotationSpeed, once 'lasering' actually begins.
    if (this._phase === 2) {
      if (this._state === 'lasering') this._angle += dt * cfg.phase2RotationSpeed;
    } else {
      this._angle += dt * cfg.rotationSpeed;
    }

    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'firing');
      if (this._state === 'firing') this._fireTimer = 0; // fire almost immediately on arrival
      return;
    }

    this._phaseAge += dt;

    if (this._state === 'firing') {
      this._fireTimer -= dt;
      if (this._fireTimer <= 0) {
        // `fireDirections` bullets per tick, evenly spaced around the
        // current fire angle (e.g. 4 → every 90°) — all of them rotate
        // together with the hull tick to tick, so the result reads as that
        // many interleaved spiral arms rather than one. Each spawns just
        // outside the hull, at the spike tip along its own direction, so
        // bullets visually emerge from the rotating hull rather than its
        // exact center.
        const n = cfg.fireDirections;
        for (let k = 0; k < n; k++) {
          const a  = this._fireDirection(k, n);
          const ox = this.x + Math.cos(a) * OUTER_R;
          const oy = this.y + Math.sin(a) * OUTER_R;
          fire.fireSpiralBullet(ox, oy, a);
        }
        this._fireTimer += cfg.fireInterval;
      }
      if (this._stateAge >= cfg.fireDuration) {
        // Only escalate to phase 2 at a burst boundary (never mid-burst or
        // mid-glide), same reasoning TetraBoss's own phase loop follows by
        // checking every frame — here it's just gated to this one decision
        // point instead.
        if (this._phaseAge >= cfg.phase1Duration) this._enterLaserPhase();
        else this._beginReposition();
      }

    } else if (this._state === 'repositioning') {
      const t = Math.min(this._stateAge / cfg.moveDuration, 1);
      const eased = easeOutCubic(t);
      this.x = this._moveFromX + (this._moveToX - this._moveFromX) * eased;
      this.y = this._moveFromY + (this._moveToY - this._moveFromY) * eased;
      if (t >= 1) {
        this._restX = this._moveToX;
        this._restY = this._moveToY;
        this._state = 'firing';
        this._stateAge = 0;
        this._fireTimer = 0;
      }

    } else if (this._state === 'charging') {
      if (this._stateAge >= cfg.laser.chargeDuration) this._enterLiveLaserPhase();

    } else if (this._state === 'lasering') {
      this._updatePatrol(dt);
      if (this._stateAge >= cfg.phase2Duration) this._enterBulletPhase();
    }
  }

  /** Pick a new random spot within the play area and start gliding there (phase 1 only). */
  _beginReposition() {
    const { width: vW } = Config.virtual;
    const cfg = this._cfg;
    this._moveFromX = this.x;
    this._moveFromY = this.y;
    this._moveToX = cfg.repositionMarginX + Math.random() * (vW - cfg.repositionMarginX * 2);
    this._moveToY = cfg.repositionYMin + Math.random() * (cfg.repositionYMax - cfg.repositionYMin);
    this._state = 'repositioning';
    this._stateAge = 0;
  }

  /** End of phase 1 — freeze rotation and hold position while the charge telegraph (see class doc) warns where the beams are about to sweep in from. */
  _enterLaserPhase() {
    this._phase = 2;
    this._phaseAge = 0;
    this._state = 'charging';
    this._stateAge = 0;
  }

  /** Charge telegraph finished — unfreeze rotation (now at the much slower phase2RotationSpeed) and start the live, damaging beams + patrol. */
  _enterLiveLaserPhase() {
    const cfg = this._cfg;
    this._state = 'lasering';
    this._stateAge = 0;
    const a = Math.random() * Math.PI * 2;
    this._vx = Math.cos(a) * cfg.phase2MoveSpeed;
    this._vy = Math.sin(a) * cfg.phase2MoveSpeed;
  }

  /** End of phase 2 — drop the lasers, resume the spiral-bullet routine from wherever the patrol left it. */
  _enterBulletPhase() {
    this._phase = 1;
    this._phaseAge = 0;
    this._state = 'firing';
    this._stateAge = 0;
    this._fireTimer = 0;
  }

  /**
   * Phase 2's live sub-state — bounces the whole hull off the same
   * play-area bounds phase 1's repositioning uses, DVD-logo style, so the
   * lasers sweep AND drift at once instead of pivoting on a fixed spot.
   * Same technique as TetraBoss's own `_updatePatrol`, just active only
   * during 'lasering' here rather than for the whole fight.
   */
  _updatePatrol(dt) {
    const cfg = this._cfg;
    const { width: vW } = Config.virtual;
    const xLo = cfg.repositionMarginX, xHi = vW - cfg.repositionMarginX;
    const yLo = cfg.repositionYMin,    yHi = cfg.repositionYMax;

    this.x += this._vx * dt;
    this.y += this._vy * dt;

    if      (this.x < xLo) { this.x = xLo; this._vx = Math.abs(this._vx); }
    else if (this.x > xHi) { this.x = xHi; this._vx = -Math.abs(this._vx); }
    if      (this.y < yLo) { this.y = yLo; this._vy = Math.abs(this._vy); }
    else if (this.y > yHi) { this.y = yHi; this._vy = -Math.abs(this._vy); }
  }

  /** The kth (0-based) of `n` evenly-spaced directions around the hull's current rotation. Shared by phase 1's bullet fan and phase 2's laser beams/charge warning. */
  _fireDirection(k, n) {
    return this._angle + k * (Math.PI * 2 / n);
  }

  /**
   * The hull's `SPIKES` laser beam segments in strokePaths-ready form — one
   * per spike tip, from the hull's own outer radius straight outward past
   * the screen — shared by `_renderLasers` (drawing them) and
   * `checkLaserHit` (colliding against them) so the two always agree
   * exactly. Same technique as TetraBoss._laserPaths.
   */
  _laserPaths() {
    const cfg = this._cfg.laser;
    const paths = this._laserPathPool;
    for (let k = 0; k < SPIKES; k++) {
      const a   = this._fireDirection(k, SPIKES);
      const cos = Math.cos(a), sin = Math.sin(a);
      const ox = this.x + cos * OUTER_R,   oy = this.y + sin * OUTER_R;
      const ex = this.x + cos * cfg.length, ey = this.y + sin * cfg.length;
      const pts = paths[k].points;
      pts[0][0] = ox; pts[0][1] = oy;
      pts[1][0] = ex; pts[1][1] = ey;
    }
    return paths;
  }

  /**
   * The charge telegraph's `SPIKES` preview segments — same origin as
   * `_laserPaths` (each hull spike tip) but ending exactly where that
   * direction exits the screen (`core/vectorMath.js`'s `rayRectExit`)
   * rather than at the live beam's full `laser.length`, since the point is
   * to mark the screen edge the beam is about to sweep in from, not to draw
   * a beam that already reaches past it. Reuses the same pool `_laserPaths`
   * does — 'charging' and 'lasering' never overlap in time.
   */
  _chargeWarningPaths() {
    const { width: vW, height: vH } = Config.virtual;
    const paths = this._laserPathPool;
    for (let k = 0; k < SPIKES; k++) {
      const a   = this._fireDirection(k, SPIKES);
      const cos = Math.cos(a), sin = Math.sin(a);
      const ox = this.x + cos * OUTER_R, oy = this.y + sin * OUTER_R;
      const edge = rayRectExit(this.x, this.y, cos, sin, vW, vH);
      const pts = paths[k].points;
      pts[0][0] = ox; pts[0][1] = oy;
      pts[1][0] = edge.x; pts[1][1] = edge.y;
    }
    return paths;
  }

  /**
   * Phase-2 laser vs. player test — an optional hook WaveManager.checkPlayerHit
   * reads generically (`e.checkLaserHit?.(...)`), same convention as
   * TetraBoss.checkLaserHit. Returns 0 outside the live 'lasering'
   * sub-state — in particular, during 'charging' the telegraph is purely
   * visual, the same fairness window every other telegraphed attack in this
   * game gives the player.
   * @param {number} px @param {number} py @param {number} hitRadius
   * @returns {number}
   */
  checkLaserHit(px, py, hitRadius) {
    if (this._state !== 'lasering') return 0;
    const cfg = this._cfg.laser;
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

  /**
   * Standalone render — core glow, then the charge warning OR live lasers
   * (mutually exclusive, phase 2 only), then hull. WaveManager calls this
   * directly (see WaveManager._renderIndividualEnemies) since only one
   * boss is ever on screen at once.
   */
  render(renderer) {
    const cfg = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, INNER_R * 0.7, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
    if (this._state === 'charging') this._renderChargeWarning(renderer);
    else if (this._state === 'lasering') this._renderLasers(renderer);
    renderHull(renderer, this, SPIRAL_HULL_PTS);
  }

  /**
   * 'charging' telegraph — a faint dashed preview line per beam direction,
   * fading in over the charge, plus a brighter pulsing ring right where
   * each one will cross the screen edge (`_chargeWarningPaths`) — "a laser
   * is about to sweep in from here." See class doc.
   */
  _renderChargeWarning(renderer) {
    const cfg   = this._cfg.laser;
    const t     = Math.min(1, this._stateAge / cfg.chargeDuration);
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(this._stateAge * cfg.chargePulseSpeed));
    const paths = this._chargeWarningPaths();

    renderer.strokePaths(paths, {
      color: cfg.color, lineWidth: cfg.warningLineWidth, lineDash: cfg.warningLineDash,
      lineCap: 'round', singleStroke: true, alpha: t * 0.4,
    });

    for (let k = 0; k < SPIKES; k++) {
      const [ex, ey] = paths[k].points[1];
      renderer.strokeCircle(ex, ey, cfg.warningMarkerRadius, {
        color: cfg.coreColor, lineWidth: cfg.warningMarkerLineWidth,
        glowBlur: cfg.warningMarkerGlowBlur, glowColor: cfg.color,
        alpha: t * pulse,
      });
    }
  }

  /** 'lasering' — outer colored glow + a bright white core stroke per beam, already fully telegraphed by 'charging' so no further fade-in here. Same technique as TetraBoss._renderLasers. */
  _renderLasers(renderer) {
    const cfg   = this._cfg.laser;
    const paths = this._laserPaths();

    renderer.strokePaths(paths, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color,
      lineCap: 'round', singleStroke: true,
    });
    renderer.strokePaths(paths, {
      color: cfg.coreColor, lineWidth: cfg.coreLineWidth,
      lineCap: 'round', singleStroke: true,
    });
  }
}
