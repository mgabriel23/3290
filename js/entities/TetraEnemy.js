/**
 * TetraEnemy.js
 * Enemy #12 — "Tetra". A small, placeable-in-any-wave version of Boss #5
 * (Config.boss.tetra, TetraBoss.js) — same creature, same silhouette/color,
 * "a little larger" than Scout rather than boss-sized (see Config.enemy.
 * tetra's own doc for the size/health comparison), spawnable in normal
 * mission/survival levels the same way Splitter/Shielded are still
 * recognizably "Bouncers" despite their own extra tricks.
 *
 * Falls in from the top exactly like a Bouncer/Boss Tetra do — spawns above
 * the screen already in 'bouncing' state (see the constructor), no separate
 * entry-glide state.
 *
 * A repeating loop between two very different phases (`_state`/`_stateAge`
 * — see update()), a scaled-down copy of TetraBoss's own state machine — see
 * that class's doc for the full mechanic description this mirrors:
 *
 *   phase 1 ('bouncing', `phase1Duration` seconds) — a genuine Bouncer:
 *   gravity pulls it down, it bounces off the side walls, the top edge, and
 *   the Barrier's dome exactly like a regular Bouncer/Boss Tetra do, reusing
 *   BouncerEnemy.js's own exported `stepBouncePhysics` at this type's own
 *   gravity/speed/spin numbers. Each barrier bounce chips the barrier
 *   (`bounce.barrierDamage`) and touching the hull at any point deals
 *   contact damage (an opt-in `.contactDamage` getter, the same generic hook
 *   Bouncer/Boss Tetra use — see WaveManager.checkPlayerHit). ALSO fires a
 *   slow "seed" bullet from each of the hull's 4 sides every `seed.
 *   fireInterval` seconds, which after `seed.scatterDelay` seconds bursts
 *   into a ring of faster shrapnel fragments — see TetraEnemySeedBullets.js/
 *   TetraEnemyBullets.js (this type's OWN pools, separate from the boss's
 *   TetraSeedBullets/TetraBullets, since several clones can be alive at once
 *   sharing one pair of pools at this type's own, weaker tuning).
 *
 *   phase 2 ('settling' → 'charging' → 'lasering') — the bounce halts, the
 *   hull eases back to its own rolled rest spot (`_restX`/`_restY` — see the
 *   constructor; UNLIKE the boss, which always settles to the same
 *   fixed screen-center point since only one of it is ever alive, each
 *   clone here rolls its own random rest point once at construction so
 *   several on screen don't all park in the same spot), then the circular
 *   "hole" at its center telegraphs an attack (`chargeOrb` + 3 dashed
 *   preview lines), then fires 3 live, damaging beams that sway together
 *   left and right around the locked aim direction (`laser`). Loops back to
 *   phase 1 once the beams finish.
 *
 * Hit/death-flash rendering reuse the same shared EnemyCombat.js functions
 * every other boss/enemy class uses — see that file's header for why those
 * are plain functions rather than a base class.
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';
import { distanceToSegment, rayRectExit } from '../core/vectorMath.js';
import { stepBouncePhysics } from './BouncerEnemy.js';
import { applyHit, tickDeathState, setState, renderHull } from './EnemyCombat.js';

const BEAM_COUNT = 3;

/** A plain 4-sided polygon, sized off Config.enemy.tetra.size — same "corners at the diagonals" shape as the boss's own TETRA_HULL_PTS, just this type's own smaller size. */
function buildHullPts() {
  const s = Config.enemy.tetra.size;
  return [
    [-s, -s],
    [ s, -s],
    [ s,  s],
    [-s,  s],
  ];
}
export const TETRA_ENEMY_HULL_PTS = buildHullPts();

export class TetraEnemy {
  /**
   * @param {number} [healthBonus]  added to Config.enemy.tetra.health —
   *   WaveManager scales this by level, same convention as every other enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW, height: vH } = Config.virtual;
    this._cfg = Config.enemy.tetra;
    const cfg = this._cfg;

    // Falls in from above exactly like a Bouncer/Boss Tetra spawn — see
    // BouncerEnemy's own constructor/TetraBoss's constructor — no entry-glide
    // state, gravity does the work from frame 1.
    this.x = cfg.hitRadius + Math.random() * (vW - cfg.hitRadius * 2);
    this.y = -cfg.hitRadius;
    this.vx = 0;
    this.vy = 0;
    this.alive = true;

    this._type = 'tetra';

    // Phase-2 settle target — rolled ONCE here rather than always a fixed
    // screen-center point (see class doc for why: unlike the boss, several
    // of these can be alive sharing the arena at once).
    const xLo = cfg.restXMargin, xHi = vW - cfg.restXMargin;
    this._restX = xLo + Math.random() * (xHi - xLo);
    this._restY = vH * (cfg.restYMin + Math.random() * (cfg.restYMax - cfg.restYMin));

    this._maxHealth = cfg.health + healthBonus;
    this._health    = this._maxHealth;
    this._hitFlash  = 0;
    this._dying     = false;

    this._angle = 0; // cosmetic hull spin — only advanced by stepBouncePhysics while 'bouncing'

    // 'bouncing' <-> 'settling' -> 'charging' -> 'lasering' -> 'bouncing' ...
    this._state    = 'bouncing';
    this._stateAge = 0;
    this._fireTimer = 0; // phase-1 seed-bullet volley cadence — see _updateBounceFire

    this._moveFromX = this.x; this._moveFromY = this.y; // 'settling' glide origin
    this._baseAngle = 0; // locked phase-2 aim direction, rolled once per 'charging' entry — see _enterChargePhase

    this._rollBounceVelocity();

    // Pre-allocated laser beam path pool — mutated in place by
    // _laserPaths()/_chargeWarningPaths() (mutually exclusive in time, so
    // safely shared), same technique TetraBoss.js uses so neither render nor
    // checkLaserHit reallocates 3 path objects + nested arrays per call.
    this._laserPathPool = Array.from({ length: BEAM_COUNT }, () => ({ points: [[0, 0], [0, 0]], closed: false }));
  }

  get type()       { return this._type; }
  get angle()      { return this._angle; }
  get hitRadius()  { return this._cfg.hitRadius; }
  /** Opts into WaveManager.checkPlayerHit's generic contact-damage circle test — active in every state, same convention as Bouncer/Boss Tetra. */
  get contactDamage() { return this._cfg.contactDamage; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY  read once, right as
   *   'charging' begins, to lock this lap's beam direction — see
   *   _enterChargePhase.
   * @param {{ barrierSurfaceY: (x:number)=>number, onBarrierHit: (x:number,damage:number)=>void, fireTetraEnemySeed: (ox:number,oy:number,angle:number)=>void }} ctx
   */
  update(dt, playerX, playerY, ctx) {
    const cfg = this._cfg;
    this._stateAge += dt;
    if (tickDeathState(this, dt)) return;

    if (this._state === 'bouncing') {
      stepBouncePhysics(
        this, dt, cfg.hitRadius,
        ctx.barrierSurfaceY, ctx.onBarrierHit,
        cfg.bounce.barrierDamage, cfg.bounce.spinFactor, cfg.bounce.gravity,
      );
      this._updateBounceFire(dt, ctx.fireTetraEnemySeed);
      if (this._stateAge >= cfg.phase1Duration) this._beginSettle();

    } else if (this._state === 'settling') {
      const t = Math.min(this._stateAge / cfg.settleDuration, 1);
      const eased = easeOutCubic(t);
      this.x = this._moveFromX + (this._restX - this._moveFromX) * eased;
      this.y = this._moveFromY + (this._restY - this._moveFromY) * eased;
      if (t >= 1) this._enterChargePhase(playerX, playerY);

    } else if (this._state === 'charging') {
      if (this._stateAge >= cfg.laser.chargeDuration) setState(this, 'lasering');

    } else if (this._state === 'lasering') {
      if (this._stateAge >= cfg.laser.liveDuration) this._beginBouncePhase();
    }
  }

  /** Roll a fresh horizontal launch speed/direction — called on the very first bounce and every time phase 1 resumes after the beams finish. */
  _rollBounceVelocity() {
    const cfg = this._cfg.bounce;
    const speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this.vx = speed * (Math.random() < 0.5 ? -1 : 1);
    this.vy = 0;
  }

  /** Phase 1's ranged attack — fires a slow seed bullet from each of the hull's 4 sides every `seed.fireInterval` seconds while bouncing (see class doc). */
  _updateBounceFire(dt, fireTetraEnemySeed) {
    const cfg = this._cfg;
    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      for (let k = 0; k < 4; k++) {
        const a  = this._fireDirection(k);
        const ox = this.x + Math.cos(a) * cfg.hitRadius;
        const oy = this.y + Math.sin(a) * cfg.hitRadius;
        fireTetraEnemySeed(ox, oy, a);
      }
      this._fireTimer += cfg.seed.fireInterval;
    }
  }

  /** The kth (0-3) of the hull's 4 side directions, in the hull's current (spin-driven) rotation — shared by the phase-1 seed volley's fire angles. */
  _fireDirection(k) {
    return this._angle + k * (Math.PI / 2);
  }

  /** End of phase 1 — freeze the bounce in place and start easing back to this instance's own rest spot before charging (see update()'s 'settling' branch). */
  _beginSettle() {
    this._moveFromX = this.x;
    this._moveFromY = this.y;
    this.vx = 0;
    this.vy = 0;
    setState(this, 'settling');
  }

  /** Settle finished — snap exactly onto the rest spot and lock this lap's beam direction at the player's CURRENT position, telegraphed for the whole charge. */
  _enterChargePhase(playerX, playerY) {
    this.x = this._restX;
    this.y = this._restY;
    this._baseAngle = Math.atan2(playerY - this.y, playerX - this.x);
    setState(this, 'charging');
  }

  /** End of phase 2 — drop the beams, resume bouncing with a freshly rolled launch velocity and an immediate seed volley. */
  _beginBouncePhase() {
    setState(this, 'bouncing');
    this._rollBounceVelocity();
    this._fireTimer = 0;
  }

  /** This lap's live sway offset — 0 at the instant 'lasering' begins (so the beams start exactly where the charge telegraph showed), then oscillates. */
  _swayOffset() {
    const cfg = this._cfg.laser;
    return Math.sin(this._stateAge * cfg.swaySpeed) * cfg.swayAmplitude;
  }

  /**
   * The 3 live laser beam segments in strokePaths-ready form, fanned
   * `laser.spreadAngle` apart around `_baseAngle + _swayOffset()`, all
   * originating at the hull's dead center — shared by `_renderLasers`
   * (drawing them) and `checkLaserHit` (colliding against them) so the two
   * always agree exactly.
   */
  _laserPaths() {
    const cfg   = this._cfg.laser;
    const sway  = this._swayOffset();
    const paths = this._laserPathPool;
    for (let k = 0; k < BEAM_COUNT; k++) {
      const a   = this._baseAngle + sway + (k - 1) * cfg.spreadAngle;
      const cos = Math.cos(a), sin = Math.sin(a);
      const pts = paths[k].points;
      pts[0][0] = this.x; pts[0][1] = this.y;
      pts[1][0] = this.x + cos * cfg.length; pts[1][1] = this.y + sin * cfg.length;
    }
    return paths;
  }

  /**
   * 'charging' preview — same 3-way fan, but frozen (no sway yet) and
   * trimmed to where each direction crosses the screen edge
   * (core/vectorMath.js's `rayRectExit`) rather than the live beam's full
   * `laser.length` — see TetraBoss._chargeWarningPaths for the same idiom.
   */
  _chargeWarningPaths() {
    const { width: vW, height: vH } = Config.virtual;
    const cfg   = this._cfg.laser;
    const paths = this._laserPathPool;
    for (let k = 0; k < BEAM_COUNT; k++) {
      const a   = this._baseAngle + (k - 1) * cfg.spreadAngle;
      const cos = Math.cos(a), sin = Math.sin(a);
      const edge = rayRectExit(this.x, this.y, cos, sin, vW, vH);
      const pts = paths[k].points;
      pts[0][0] = this.x; pts[0][1] = this.y;
      pts[1][0] = edge.x; pts[1][1] = edge.y;
    }
    return paths;
  }

  /**
   * Phase-2 laser vs. player test — an optional hook WaveManager.checkPlayerHit
   * reads generically (`e.checkLaserHit?.(...)`), the beam-collision
   * equivalent of a regular Bouncer's `contactDamage` circle test. Returns 0
   * outside the live 'lasering' state — see TetraBoss.checkLaserHit's own doc.
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

  /** Hull, then beams/telegraph (phase 2 only), then the center core/charge indicator. WaveManager calls this directly (see `_renderIndividualEnemies`) since geometry varies per-clone (bounce/settle/charge/laser state, current rotation). */
  render(renderer) {
    renderHull(renderer, this, TETRA_ENEMY_HULL_PTS);
    if (this._state === 'charging') this._renderChargeWarning(renderer);
    else if (this._state === 'lasering') this._renderLasers(renderer);
    this._renderCore(renderer);
  }

  /**
   * 'charging' telegraph — a faint dashed preview line per beam direction
   * fading in over the charge, a brighter pulsing ring where each one will
   * cross the screen edge, plus a growing/brightening ring right at the
   * center hole itself — same two-piece language as TetraBoss's own.
   */
  _renderChargeWarning(renderer) {
    const cfg   = this._cfg.laser;
    const orb   = this._cfg.chargeOrb;
    const t     = Math.min(1, this._stateAge / cfg.chargeDuration);
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(this._stateAge * cfg.chargePulseSpeed));
    const paths = this._chargeWarningPaths();

    renderer.strokePaths(paths, {
      color: cfg.color, lineWidth: cfg.warningLineWidth, lineDash: cfg.warningLineDash,
      lineCap: 'round', singleStroke: true, alpha: t * 0.4,
    });

    for (let k = 0; k < BEAM_COUNT; k++) {
      const [ex, ey] = paths[k].points[1];
      renderer.strokeCircle(ex, ey, cfg.warningMarkerRadius, {
        color: cfg.coreColor, lineWidth: cfg.warningMarkerLineWidth,
        glowBlur: cfg.warningMarkerGlowBlur, glowColor: cfg.color,
        alpha: t * pulse,
      });
    }

    renderer.strokeCircle(this.x, this.y, orb.startRadius + t * orb.growth, {
      color: cfg.color, lineWidth: orb.lineWidth, glowBlur: orb.glowBlur, glowColor: cfg.color,
      alpha: orb.alphaMin + t * (1 - orb.alphaMin),
    });
  }

  /** 'lasering' — outer colored glow + a bright white core stroke per beam, already fully telegraphed by 'charging' so no further fade-in here. */
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

  /** Idle pulsing core-ring glow at the center — stands in for an engine flame, same reasoning as TetraBoss's own core glow. Skipped during 'charging', where the growing chargeOrb takes over the same spot instead. */
  _renderCore(renderer) {
    if (this._state === 'charging') return;
    const cfg   = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, cfg.coreRadius, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
  }
}
