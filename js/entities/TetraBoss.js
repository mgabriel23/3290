/**
 * TetraBoss.js
 * Boss #5 — "Tetra". Spawned by WaveManager on every 5th boss-level
 * encounter (level 35, 70, ... under Survival Mode's canonical schedule —
 * see Config.bossSchedule[mode].roster and WaveManager's boss-selection
 * lookup in its constructor). An original rotating-square silhouette (see
 * TETRA_HULL_PTS below — a plain 4-sided polygon, not a reskin of any
 * existing enemy, same "original hull" lineage as Spiral), now sized down
 * from the very first cut of this boss so it reads as agile rather than
 * lumbering.
 *
 * Falls in from the top exactly like a Bouncer/Bouncer Primal do — spawns
 * above the screen already in 'bouncing' state (see the constructor), no
 * separate entry-glide state the way most other bosses have.
 *
 * A repeating loop between two very different phases (`_state`/`_stateAge`
 * — see update()), same "never settles permanently, loops for the whole
 * fight" convention every other timed-phase boss uses:
 *
 *   phase 1 ('bouncing', `phase1Duration` seconds) — a genuine Bouncer:
 *   gravity pulls it down, it bounces off the side walls, the top edge, and
 *   the Barrier's dome exactly like a regular Bouncer/Bouncer Primal does,
 *   reusing BouncerEnemy.js's own exported `stepBouncePhysics` at this
 *   boss's own gravity/speed/spin numbers rather than duplicating that
 *   math. Each barrier bounce chips the barrier (`bounce.barrierDamage`)
 *   and touching the hull at any point deals `contactDamage` (an opt-in
 *   `.contactDamage` getter, the same generic hook Bouncer Primal/Phoenix/
 *   Electron use — see WaveManager.checkPlayerHit). The hull's own rotation
 *   is driven purely by `stepBouncePhysics`'s built-in spin-from-horizontal-
 *   velocity, so it visibly tumbles exactly like a Bouncer clone while
 *   airborne. ALSO fires a slow "seed" bullet from each of the hull's 4
 *   sides every `seed.fireInterval` seconds (`_updateBounceFire`/
 *   `_fireDirection` — the same "N shots evenly spaced around the current
 *   rotation" idiom Spiral's own fireDirections uses), which after `seed.
 *   scatterDelay` seconds bursts into a ring of faster shrapnel fragments
 *   (`fragment` — a TIME-based detonation, same idiom Nova's own seed/
 *   fragment pair uses, just a plain ring instead of Nova's golden-angle
 *   spiral) — see TetraSeedBullets.js/TetraBullets.js.
 *
 *   phase 2 ('settling' → 'charging' → 'lasering') — the bounce halts, the
 *   hull eases back to its fixed rest spot (`restX`/`restY`, `settleDuration`
 *   seconds, eased with core/animation.js's easeOutCubic — same curve
 *   Spiral's own repositioning uses), then the circular "hole" at its
 *   center telegraphs an attack: a growing/brightening charge ring
 *   (`chargeOrb`, same growth idiom as Sniper's own nose orb) plus 3 faint
 *   dashed preview lines fanned out from that center point, showing exactly
 *   where 3 real beams are about to fire (`laser.spreadAngle` apart,
 *   aimed — once, at the instant charging begins, not continuously — at
 *   the player's position: `_baseAngle`). Once `laser.chargeDuration`
 *   elapses the preview resolves into 3 live, damaging beams
 *   (`checkLaserHit`, a point-to-segment test each frame, not a pooled
 *   projectile — same technique every other beam boss in this game uses)
 *   that hold that same 3-way fan spacing but SWAY together left and right,
 *   SLOWLY, around the locked `_baseAngle` (`laser.swaySpeed`/
 *   `swayAmplitude`) for `laser.liveDuration` seconds — since the fan
 *   doesn't re-track the player, standing still isn't safe forever; the
 *   player has to actively drift into whichever gap the slow sway currently
 *   opens up. Loops back to phase 1 once the beams finish.
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

const BS = Config.boss.tetra.size;
const BEAM_COUNT = 3;

// A plain 4-sided polygon — corners at the diagonals. Purely cosmetic now:
// unlike the old design, neither the bounce physics nor the phase-2 beams
// (which fire from the dead center) care about the hull's rotation at all.
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

    // Falls in from above exactly like a Bouncer/Bouncer Primal spawn — see
    // BouncerEnemy's own constructor/BouncerPrimalBoss's constructor — no
    // entry-glide state, gravity does the work from frame 1.
    this.x = this._cfg.hitRadius + Math.random() * (vW - this._cfg.hitRadius * 2);
    this.y = -this._cfg.hitRadius;
    this.vx = 0;
    this.vy = 0;
    this.alive = true;

    this._type = 'boss';
    this._restX = vW / 2;
    this._restY = this._cfg.restY;

    this._maxHealth = this._cfg.health + healthBonus;
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
    // safely shared), reused by render and checkLaserHit (both called every
    // frame during phase 2) so neither reallocates 3 path objects + nested
    // arrays per call.
    this._laserPathPool = Array.from({ length: BEAM_COUNT }, () => ({ points: [[0, 0], [0, 0]], closed: false }));
  }

  get type()       { return this._type; }
  get angle()      { return this._angle; }
  get hitRadius()  { return this._cfg.hitRadius; }
  /** Opts into WaveManager.checkPlayerHit's generic contact-damage circle test — active in every state, same convention as Bouncer Primal/Phoenix/Electron. */
  get contactDamage() { return this._cfg.contactDamage; }
  /** 0-1 remaining health fraction — read by WaveManager for the boss health bar. */
  get healthFrac() { return Math.max(0, this._health) / this._maxHealth; }
  get maxHealth()  { return this._maxHealth; } // see WaveManager._applySkillBombToBoss
  get name()  { return this._cfg.name; }
  get color() { return this._cfg.color; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY  read once, right as
   *   'charging' begins, to lock this lap's beam direction — see
   *   _enterChargePhase. Otherwise unused; kept as positional args only so
   *   every boss class shares the same `update(dt, playerX, playerY, fire)`
   *   shape WaveManager calls generically.
   * @param {{ barrierSurfaceY: (x:number)=>number, onBarrierHit: (x:number,damage:number)=>void, fireTetraSeed: (ox:number,oy:number,angle:number)=>void }} fire
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge += dt;
    if (tickDeathState(this, dt)) return;

    if (this._state === 'bouncing') {
      stepBouncePhysics(
        this, dt, cfg.hitRadius,
        fire.barrierSurfaceY, fire.onBarrierHit,
        cfg.bounce.barrierDamage, cfg.bounce.spinFactor, cfg.bounce.gravity,
      );
      this._updateBounceFire(dt, fire.fireTetraSeed);
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

  /** Phase 1's ranged attack — fires a slow seed bullet from each of the hull's 4 sides every `seed.fireInterval` seconds while bouncing (see class doc). Each seed scatters into shrapnel on its own timer — TetraBoss doesn't track that part, see TetraSeedBullets.js. */
  _updateBounceFire(dt, fireTetraSeed) {
    const cfg = this._cfg;
    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      for (let k = 0; k < 4; k++) {
        const a  = this._fireDirection(k);
        const ox = this.x + Math.cos(a) * cfg.hitRadius;
        const oy = this.y + Math.sin(a) * cfg.hitRadius;
        fireTetraSeed(ox, oy, a);
      }
      this._fireTimer += cfg.seed.fireInterval;
    }
  }

  /** The kth (0-3) of the hull's 4 side directions, in the hull's current (spin-driven) rotation — shared by the phase-1 seed volley's fire angles. */
  _fireDirection(k) {
    return this._angle + k * (Math.PI / 2);
  }

  /** End of phase 1 — freeze the bounce in place and start easing back to the fixed rest spot before charging (see update()'s 'settling' branch). */
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
   * `laser.length`, so it reads as "here's exactly where these are about to
   * fire" rather than an already-live beam. Reuses `_laserPathPool` — the
   * two states never overlap in time.
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
   * outside the live 'lasering' state — in particular during 'charging' the
   * telegraph is purely visual, the same fairness window every other
   * telegraphed attack in this game gives the player.
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

  /** Hull, then beams/telegraph (phase 2 only), then the center core/charge indicator. WaveManager calls this directly (see `_renderIndividualEnemies`) since only one boss is ever on screen at once. */
  render(renderer) {
    renderHull(renderer, this, TETRA_HULL_PTS);
    if (this._state === 'charging') this._renderChargeWarning(renderer);
    else if (this._state === 'lasering') this._renderLasers(renderer);
    this._renderCore(renderer);
  }

  /**
   * 'charging' telegraph — a faint dashed preview line per beam direction
   * fading in over the charge, a brighter pulsing ring where each one will
   * cross the screen edge (same two-piece language as Spiral's own charge
   * warning), plus a growing/brightening ring right at the center hole
   * itself — "something is about to fire from HERE" — using the same
   * grow-from-nothing idiom as Sniper's own nose charge orb.
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

  /** Idle pulsing core-ring glow at the center — stands in for an engine flame, same reasoning as Spiral's own core glow (a rotating turret has no thruster). Skipped during 'charging', where the growing chargeOrb takes over the same spot instead. */
  _renderCore(renderer) {
    if (this._state === 'charging') return;
    const cfg   = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, cfg.coreRadius, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
  }
}
