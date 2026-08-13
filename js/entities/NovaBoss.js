/**
 * NovaBoss.js
 * Boss #6 — "Nova". An original pentagon hull (see NOVA_HULL_PTS below — a
 * plain regular polygon, not a reskin of any existing enemy, same
 * "original hull" lineage as Spiral/Tetra), one vertex always pointing at
 * the player (`_angle`, same `atan2(-dx, dy)` convention Scout/BossEnemy
 * already use — see Enemy.js's own comment for the exact sign reasoning),
 * patrolling a slow bouncing path CONFINED TO THE TOP HALF of the arena
 * (`Config.boss.nova.boundYMin`/`boundYMax`, both well above the virtual
 * canvas's true half-height of 480 — same DVD-logo bounce technique as
 * TetraBoss._updatePatrol, just a tighter, higher band).
 *
 * A repeating TIMED loop between two phases (`_phase`/`_phaseAge`), same
 * shape as TetraBoss's own phase1/phase2 loop:
 *
 *   phase 1 (`phase1Duration` seconds) — a delayed spiral burst, not a
 *   direct spray: every `fireInterval` seconds it launches ONE slow bullet
 *   (NovaSeedBullets.js) straight at the player's CURRENT position — no
 *   lead prediction, no re-aiming after launch. That seed travels on its
 *   own, visibly swelling (see NovaSeedBullets.render), then detonates
 *   wherever it currently is once `Config.boss.nova.seed.spreadDelay`
 *   seconds have passed — into a spiral fan of fragments (NovaBullets.js).
 *   The fan-out math itself lives in WaveManager's `_buildProjectilePools`
 *   (the seed pool's `onDetonate` callback reads `Config.boss.nova.
 *   fragment`), not here — this class only ever fires the seed, same
 *   separation Rockets.js's own `onDetonate` keeps. The hull tracks the
 *   player throughout (`_angle = atan2(-dx, dy)`, same convention Scout/
 *   BossEnemy already use — see Enemy.js's own comment for the exact sign
 *   reasoning), so the pentagon's forward vertex visibly points at them.
 *
 *   phase 2 (`phase2` config) — the same seed/spiral-burst attack as phase
 *   1, just far denser: the hull stops tracking the player and spins
 *   continuously instead (`phase2.rotationSpeed`), firing a SEED from each
 *   of its 5 sides simultaneously (`_fireVolley` — `fire.fireNovaSeedAngle`,
 *   NovaSeedBullets' angle-launch mode — the exact same "N shots evenly
 *   spaced around the current rotation" mechanic Tetra/Spiral already use)
 *   `phase2.volleyCount` times, `phase2.volleyInterval` seconds apart, after
 *   an initial `phase2.windUp` seconds of visible spin-up (the telegraph).
 *   Every one of those seeds independently swells and detonates into its
 *   own spiral fan on the usual `seed.spreadDelay` clock — 2 volleys × 5
 *   seeds × `fragment.count` fragments each is what actually earns the
 *   "bullet hell" name, not a new attack shape.
 *
 * Patrol movement never pauses for either phase, same as Tetra.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared
 * EnemyCombat.js functions every other boss/enemy class uses — see that
 * file's header for why those are plain functions rather than a base class.
 */
import { Config } from '../core/Config.js';
import { applyHit, tickDeathState, stepEntryGlide, renderHull } from './EnemyCombat.js';

const NS = Config.boss.nova.size;

// A plain regular pentagon, one vertex at local (0, +NS) — local +Y is
// "toward the player" under the atan2(-dx, dy) convention this class uses
// (see Enemy.js's own comment for why -Y/+Y map to away-from/toward-player),
// so that vertex visibly points at the player once `_angle` is applied.
const NOVA_HULL_PTS = [];
for (let k = 0; k < 5; k++) {
  const a = Math.PI / 2 + k * (Math.PI * 2 / 5);
  NOVA_HULL_PTS.push([Math.cos(a) * NS, Math.sin(a) * NS]);
}

export class NovaBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.nova.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.nova;

    this.x = vW / 2;
    this.y = -NS;
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

    this._phase      = 1; // 1 (seed/spiral-burst) or 2 (bullet-hell volleys) — loops, see update()
    this._phaseAge   = 0; // seconds since the CURRENT phase began
    this._volleysFired = 0; // phase 2 only — how many of phase2.volleyCount have fired this phase

    this._fireTimer = 0;

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
   * @param {number} playerX @param {number} playerY
   * @param {{
   *   fireNovaSeed: (ox:number,oy:number,tx:number,ty:number)=>void,
   *   fireNovaSeedAngle: (ox:number,oy:number,angle:number)=>void,
   * }} fire
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge += dt;
    if (tickDeathState(this, dt)) return;

    if (this._state === 'entering') {
      // Track the player during entry too — looks natural flying in.
      const dx = playerX - this.x, dy = playerY - this.y;
      this._angle = Math.atan2(-dx, dy);
      stepEntryGlide(this, cfg, dt, 'combat');
      if (this._state === 'combat') {
        this._fireTimer = 0; // fire almost immediately on arrival
        const a = Math.random() * Math.PI * 2;
        this._vx = Math.cos(a) * cfg.moveSpeed;
        this._vy = Math.sin(a) * cfg.moveSpeed;
      }
      return;
    }

    this._updatePatrol(dt);
    this._phaseAge += dt;

    if (this._phase === 1) this._updateSeedPhase(dt, playerX, playerY, fire);
    else                   this._updateVolleyPhase(dt, fire);
  }

  /** Phase 1 — tracks the player, fires seed bullets on a cooldown, loops into phase 2 after `phase1Duration`. */
  _updateSeedPhase(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    const dx = playerX - this.x, dy = playerY - this.y;
    this._angle = Math.atan2(-dx, dy);

    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      fire.fireNovaSeed(this.x, this.y, playerX, playerY);
      this._fireTimer += cfg.fireInterval;
    }

    if (this._phaseAge >= cfg.phase1Duration) {
      this._phase = 2;
      this._phaseAge = 0;
      this._volleysFired = 0;
    }
  }

  /** Phase 2 — spins continuously, fires `phase2.volleyCount` radial volleys, loops back to phase 1 once done. */
  _updateVolleyPhase(dt, fire) {
    const p2 = this._cfg.phase2;
    this._angle += dt * p2.rotationSpeed;

    if (this._volleysFired < p2.volleyCount &&
        this._phaseAge >= p2.windUp + this._volleysFired * p2.volleyInterval) {
      this._fireVolley(fire);
      this._volleysFired++;
    }

    const doneAt = p2.windUp + (p2.volleyCount - 1) * p2.volleyInterval + p2.tailDuration;
    if (this._volleysFired >= p2.volleyCount && this._phaseAge >= doneAt) {
      this._phase = 1;
      this._phaseAge = 0;
      this._fireTimer = 0; // fire the next seed promptly on returning to phase 1
    }
  }

  /** Fires one seed from each of the hull's 5 sides, evenly spaced around the current rotation — see class doc. Each seed spreads into its own spiral burst later, same as phase 1's. */
  _fireVolley(fire) {
    for (let k = 0; k < 5; k++) {
      const a  = this._angle + k * (Math.PI * 2 / 5);
      const ox = this.x + Math.cos(a) * NS;
      const oy = this.y + Math.sin(a) * NS;
      fire.fireNovaSeedAngle(ox, oy, a);
    }
  }

  /** Slow constant-velocity patrol, bouncing off the arena bounds like a DVD-logo — confined to the top half only, see class doc. */
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

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /** Hull, then the pulsing core. WaveManager calls this directly (see `_renderIndividualEnemies`) since only one boss is ever on screen at once. */
  render(renderer) {
    renderHull(renderer, this, NOVA_HULL_PTS);
    this._renderCore(renderer);
  }

  /** Pulsing core-ring glow at the center — stands in for an engine flame, same reasoning as Spiral/Tetra's own core glow (this hull has no thruster). */
  _renderCore(renderer) {
    const cfg   = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, cfg.coreRadius, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
  }
}
