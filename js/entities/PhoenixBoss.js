/**
 * PhoenixBoss.js
 * Boss #9 — "Phoenix". Spawned by WaveManager on every 9th boss-level
 * encounter (level 63, 126, ... under Survival Mode's canonical schedule —
 * see Config.bossSchedule[mode].roster and WaveManager's boss-selection
 * lookup in its constructor). An original swept-wing,
 * forked-tail bird silhouette (see PHOENIX_HULL_PTS below — not a reskin,
 * same "original hull" lineage as Spiral/Tetra/Nova/Pulsor/Zigzag, but the
 * first of that lineage that isn't a regular polygon). Reuses the ship-
 * family's own nose/tail convention (Enemy.js's `atan2(-dx, dy)` — local -Y
 * away from the player, local +Y toward it) as the phoenix's own anatomy:
 * the tail-spike anchor gets `renderEngineFlame`'s exhaust plume as a
 * trailing fire trail, and the beak anchor is where fireballs launch from —
 * the same `renderFlame`+`renderCore` pairing BossEnemy.js uses (not the
 * coreGlow-ring-only treatment Tetra/Nova/Pulsor/Zigzag use), because this
 * hull has a real facing direction rather than being a spinning turret.
 *
 * A repeating TIMED loop between THREE phases (`_phase`/`_phaseAge`) — one
 * more than every other boss's 2-phase loop — all sharing ONE fixed rest
 * point (`_restX`/`_restY`, arena center / Config.boss.phoenix.restY) so
 * every phase transition lands exactly where the next phase expects to
 * start, with zero positional pop anywhere in the loop:
 *
 *   phase 1 — orbits the rest point on a closed loop that starts and ends
 *   exactly AT the rest point (`_updateOrbitPhase` — same zero-jump trick
 *   BossEnemy's figure-8 orbit uses: the parametric form is defined so t=0
 *   is exactly (restX, restY)), beak tracking the player, firing one aimed
 *   fireball (PhoenixFireballs.js) at the player's CURRENT position — no
 *   lead prediction — every `fireball.fireInterval` seconds. Runs for
 *   `phase1Duration` seconds, then advances.
 *
 *   phase 2 — a single telegraphed charge, three beats
 *   (`_phaseState`/`_setPhaseState`, reusing `_phaseAge` as the SUBSTATE age
 *   the same way BossEnemy's own phase sub-machines do):
 *     'telegraph' — locks the player's position at THIS instant (not
 *     re-aimed as they move) and shows a directional indicator (see
 *     `renderExtras`) for `charge.telegraphDuration` seconds.
 *     'charging' — accelerates from `chargeStartSpeed` toward
 *     `chargeMaxSpeed` along that FIXED locked direction — a real
 *     commitment, not a homing missile — dealing `charge.contactDamage` to
 *     the player on touch (see the `contactDamage` getter, WaveManager's
 *     generic contact-damage hook) until either `chargeDuration` elapses or
 *     it crosses the arena bound clamp (kept well clear of the barrier —
 *     this attack never touches it, only the player).
 *     'recover' — smoothstep-eases back to the shared rest point over
 *     `recoverDuration` seconds before phase 3 begins.
 *
 *   phase 3 — sways side-to-side around the rest point while holding one
 *   continuous straight-line beam of fire anchored to its own X position,
 *   sweeping with the sway (`checkLaserHit` — same live point-test idiom
 *   TetraBoss's phase-2 lasers use, read generically by WaveManager, just a
 *   fixed vertical beam so no segment-angle math is needed). Telegraphs
 *   harmlessly for `warmupDuration` seconds on every entry, same fairness
 *   beat Tetra's laser uses. Runs for an EXACT `swayCycles` full sway
 *   periods rather than a raw seconds duration (see `_updateSwayPhase`) —
 *   sin(swayPhase) is guaranteed to be back at 0 (x = restX) the instant it
 *   ends, which is also exactly phase 1's own t=0 start point, so looping
 *   back to phase 1 is seamless too.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared
 * EnemyCombat.js functions every other boss/enemy class uses — see that
 * file's header for why those are plain functions rather than a base class.
 */
import { Config } from '../core/Config.js';
import { applyHit, tickDeathState, stepEntryGlide, renderHull, renderEngineFlame, renderEngineCore } from './EnemyCombat.js';

const PS = Config.boss.phoenix.size;

// A swept-wing, forked-tail bird silhouette, hand-authored (not a regular
// polygon like every earlier original-hull boss) — beak at local +Y (toward
// the player, see class doc), wingtips at the widest point, a 3-pronged
// tail fanning out behind at local -Y (away from the player).
const PHOENIX_HULL_PTS = [
  [ 0,          PS * 0.90], // beak tip
  [ PS * 0.16,  PS * 0.60],
  [ PS * 1.00,  PS * 0.08], // right wingtip
  [ PS * 0.42, -PS * 0.05],
  [ PS * 0.35, -PS * 0.85], // right tail feather
  [ PS * 0.10, -PS * 0.45],
  [ 0,         -PS * 1.00], // center tail spike
  [-PS * 0.10, -PS * 0.45],
  [-PS * 0.35, -PS * 0.85], // left tail feather
  [-PS * 0.42, -PS * 0.05],
  [-PS * 1.00,  PS * 0.08], // left wingtip
  [-PS * 0.16,  PS * 0.60],
];

// Beak anchor (fireball launch point) and tail-spike anchor (flame-plume
// anchor) — same local-vertex-as-attachment-point idiom BossEnemy.js's
// NOSE_LX/LY, GUN_LX/LY use.
const BEAK_LX = 0, BEAK_LY = PS * 0.90;
const TAIL_LX = 0, TAIL_LY = -PS * 1.00;

export class PhoenixBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.phoenix.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.phoenix;

    this.x = vW / 2;
    this.y = -PS;
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

    // Phase/combat sub-state — real values assigned by _enterOrbitPhase once
    // entry finishes (see update()'s 'entering' branch); placeholders here
    // just keep every field present from construction.
    this._phase      = 1; // 1 (orbit+fire), 2 (charge), 3 (sway+beam) — loops
    this._phaseAge   = 0; // seconds since _phase (or, during phase 2, _phaseState) last changed
    this._phaseState = 'telegraph'; // phase 2 only — 'telegraph' | 'charging' | 'recover'
    this._orbitPhase = 0;
    this._fireTimer  = 0;
    this._swayPhase  = 0;

    this._chargeTargetX = 0; this._chargeTargetY = 0;
    this._chargeDirX = 0; this._chargeDirY = 0;
    this._chargeSpeed = 0;
    this._recoverFromX = 0; this._recoverFromY = 0;

    // Pre-allocated path objects for the charge telegraph's indicator line
    // and phase 3's beam — mutated in place each frame rather than
    // reallocated, same convention as TetraBoss's `_laserPathPool`.
    this._chargeLinePathArr = [{ points: [[0, 0], [0, 0]], closed: false }];
    this._beamPathArr       = [{ points: [[0, 0], [0, 0]], closed: false }];
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
   * Opts into WaveManager.checkPlayerHit's generic contact-damage check —
   * same hook a regular Bouncer/Bouncer Primal use — but ONLY while actually
   * mid-dash (phase 2's 'charging' substate), not during the telegraph or
   * the recovery ease-back. See class doc.
   */
  get contactDamage() {
    return (this._phase === 2 && this._phaseState === 'charging') ? this._cfg.charge.contactDamage : 0;
  }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY
   * @param {{ firePhoenixFireball: (ox:number,oy:number,tx:number,ty:number)=>void }} fire
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge    += dt;
    this._enginePhase += dt * 6;
    if (tickDeathState(this, dt)) return;

    if (this._state === 'entering') {
      const dx = playerX - this.x, dy = playerY - this.y;
      this._angle = Math.atan2(-dx, dy);
      stepEntryGlide(this, cfg, dt, 'combat');
      if (this._state === 'combat') this._enterOrbitPhase();
      return;
    }

    this._phaseAge += dt;

    if      (this._phase === 1) this._updateOrbitPhase(dt, playerX, playerY, fire.firePhoenixFireball);
    else if (this._phase === 2) this._updateChargePhase(dt);
    else                        this._updateSwayPhase(dt);
  }

  _enterOrbitPhase() {
    this._phase = 1;
    this._phaseAge = 0;
    this._orbitPhase = 0;
    this._fireTimer = 0;
  }

  _enterChargePhase(playerX, playerY) {
    this._phase = 2;
    this._chargeTargetX = playerX;
    this._chargeTargetY = playerY;
    this._setPhaseState('telegraph');
  }

  _enterSwayPhase() {
    this._phase = 3;
    this._phaseAge = 0;
    this._swayPhase = 0;
    // Exact snap — 'recover' already smoothstep-eased all the way to
    // (restX, restY), so this just guards against any float drift.
    this.x = this._restX;
    this.y = this._restY;
  }

  _setPhaseState(name) { this._phaseState = name; this._phaseAge = 0; }

  /**
   * Phase 1 — circular orbit around the shared rest point (parametrized so
   * t=0 is exactly (restX, restY), same zero-jump trick BossEnemy's figure-8
   * uses), beak tracking the player, firing one aimed fireball on every
   * `fireball.fireInterval` tick. Advances to phase 2 after `phase1Duration`.
   */
  _updateOrbitPhase(dt, playerX, playerY, fireFireball) {
    const cfg = this._cfg;
    this._orbitPhase += dt * cfg.orbitSpeed;
    const s = Math.sin(this._orbitPhase), c = Math.cos(this._orbitPhase);
    this.x = this._restX + s * cfg.orbitRadiusX;
    this.y = this._restY - cfg.orbitRadiusY + c * cfg.orbitRadiusY;

    const dx = playerX - this.x, dy = playerY - this.y;
    this._angle = Math.atan2(-dx, dy);

    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      const cos = Math.cos(this._angle), sin = Math.sin(this._angle);
      const bx = this.x + cos * BEAK_LX - sin * BEAK_LY;
      const by = this.y + sin * BEAK_LX + cos * BEAK_LY;
      fireFireball(bx, by, playerX, playerY);
      this._fireTimer += cfg.fireball.fireInterval;
    }

    if (this._phaseAge >= cfg.phase1Duration) this._enterChargePhase(playerX, playerY);
  }

  /** Phase 2 — telegraph -> charging -> recover, see class doc. */
  _updateChargePhase(dt) {
    const cfg = this._cfg.charge;

    if (this._phaseState === 'telegraph') {
      if (this._phaseAge >= cfg.telegraphDuration) {
        const dx = this._chargeTargetX - this.x, dy = this._chargeTargetY - this.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        this._chargeDirX = dx / len;
        this._chargeDirY = dy / len;
        this._angle = Math.atan2(-this._chargeDirX, this._chargeDirY);
        this._chargeSpeed = cfg.chargeStartSpeed;
        this._setPhaseState('charging');
      }
    } else if (this._phaseState === 'charging') {
      this._chargeSpeed = Math.min(cfg.chargeMaxSpeed, this._chargeSpeed + cfg.chargeAcceleration * dt);
      this.x += this._chargeDirX * this._chargeSpeed * dt;
      this.y += this._chargeDirY * this._chargeSpeed * dt;

      const { width: vW } = Config.virtual;
      const xLo = cfg.boundMarginX, xHi = vW - cfg.boundMarginX;
      const yLo = cfg.boundYMin,    yHi = cfg.boundYMax;
      let hitBound = false;
      if      (this.x < xLo) { this.x = xLo; hitBound = true; }
      else if (this.x > xHi) { this.x = xHi; hitBound = true; }
      if      (this.y < yLo) { this.y = yLo; hitBound = true; }
      else if (this.y > yHi) { this.y = yHi; hitBound = true; }

      if (hitBound || this._phaseAge >= cfg.chargeDuration) {
        this._recoverFromX = this.x;
        this._recoverFromY = this.y;
        this._setPhaseState('recover');
      }
    } else { // 'recover'
      const t = Math.min(1, this._phaseAge / cfg.recoverDuration);
      const ease = t * t * (3 - 2 * t); // smoothstep
      this.x = this._recoverFromX + (this._restX - this._recoverFromX) * ease;
      this.y = this._recoverFromY + (this._restY - this._recoverFromY) * ease;
      if (t >= 1) this._enterSwayPhase();
    }
  }

  /**
   * Phase 3 — sways around the rest point while a vertical beam (see
   * checkLaserHit/render) sweeps with it. Runs for EXACTLY `swayCycles` full
   * sway periods — see class doc for why that must divide evenly rather
   * than being a raw seconds duration — then loops back to phase 1.
   */
  _updateSwayPhase(dt) {
    const cfg = this._cfg.sway;
    this._swayPhase += dt * cfg.swaySpeed;
    this.x = this._restX + Math.sin(this._swayPhase) * cfg.swayAmplitude;
    this.y = this._restY;
    this._angle = 0; // beak points straight down the screen — aligned with the vertical beam

    const duration = cfg.swayCycles * (Math.PI * 2 / cfg.swaySpeed);
    if (this._phaseAge >= duration) this._enterOrbitPhase();
  }

  /**
   * Phase-3 beam vs. player test — an optional hook WaveManager.checkPlayerHit
   * reads generically (`e.checkLaserHit?.(...)`), same name/shape TetraBoss's
   * phase-2 lasers use. Always a straight vertical beam (anchored to the
   * boss's own x, extending downward) rather than an arbitrary segment, so a
   * plain box test suffices — no distanceToSegment needed. Returns 0 outside
   * phase 3 or during its `warmupDuration` telegraph.
   * @param {number} px @param {number} py @param {number} hitRadius
   * @returns {number}
   */
  checkLaserHit(px, py, hitRadius) {
    const cfg = this._cfg.sway;
    if (this._phase !== 3 || this._phaseAge < cfg.warmupDuration || py < this.y) return 0;
    return Math.abs(px - this.x) <= cfg.halfWidth + hitRadius ? cfg.damage : 0;
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /** Tail-plume exhaust — must be drawn BEFORE the hull so it appears behind it. */
  renderFlame(renderer) {
    // A visible "afterburner" stretch while actually charging — sells the
    // acceleration on top of the speed itself — base length otherwise.
    const boost = (this._phase === 2 && this._phaseState === 'charging')
      ? 1 + this._chargeSpeed / this._cfg.charge.chargeMaxSpeed
      : 1;
    renderEngineFlame(renderer, this, TAIL_LX, TAIL_LY, PS * 0.5 * boost);
  }

  /** Chest ember core — drawn on top of the hull, same anchor idiom as BossEnemy's engine core. */
  renderCore(renderer) {
    renderEngineCore(renderer, this, 0, PS * 0.15, PS * 0.14, PS * 0.10);
  }

  /**
   * Directional charge telegraph — a line from the boss to the locked
   * target plus a target reticle, up during phase 2's 'telegraph' substate
   * only. WaveManager's `_renderSniperExtras` already calls `renderExtras?.()`
   * on every enemy unconditionally each frame, so this needs no extra wiring.
   */
  renderExtras(renderer) {
    if (this._state !== 'combat' || this._phase !== 2 || this._phaseState !== 'telegraph') return;
    const cfg = this._cfg.charge;
    const t      = this._phaseAge / cfg.telegraphDuration;
    const fadeIn = Math.min(1, t * 3);
    const pulse  = 0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * cfg.indicatorDashPulseSpeed));
    const alpha  = fadeIn * pulse;

    const linePts = this._chargeLinePathArr[0].points;
    linePts[0][0] = this.x; linePts[0][1] = this.y;
    linePts[1][0] = this._chargeTargetX; linePts[1][1] = this._chargeTargetY;
    renderer.strokePaths(this._chargeLinePathArr, {
      color: cfg.indicatorColor, lineWidth: cfg.indicatorLineWidth, glowBlur: cfg.indicatorGlowBlur, glowColor: this._cfg.color,
      lineCap: 'round', singleStroke: true, alpha,
    });
    renderer.strokeCircle(this._chargeTargetX, this._chargeTargetY, cfg.targetRingRadius, {
      color: cfg.indicatorColor, lineWidth: cfg.targetRingLineWidth, alpha: alpha * 0.7,
    });
    renderer.strokeCircle(this._chargeTargetX, this._chargeTargetY, cfg.targetDotRadius, {
      color: cfg.indicatorColor, lineWidth: cfg.targetDotLineWidth, glowBlur: cfg.targetDotGlowBlur, glowColor: cfg.indicatorColor, alpha,
    });
  }

  /**
   * Flame -> hull -> beam (phase 3 only) -> core. WaveManager calls this
   * directly (see `_renderIndividualEnemies`) since only one boss is ever on
   * screen at once.
   */
  render(renderer) {
    this.renderFlame(renderer);
    renderHull(renderer, this, PHOENIX_HULL_PTS);
    if (this._phase === 3) this._renderBeam(renderer);
    this.renderCore(renderer);
  }

  /** Outer colored glow + a bright core stroke down the beam, faded in over the warmup window — same two-pass treatment as TetraBoss._renderLasers. */
  _renderBeam(renderer) {
    const cfg   = this._cfg.sway;
    const t     = Math.min(1, this._phaseAge / cfg.warmupDuration);
    const alpha = 0.15 + 0.85 * t;
    const { height: vH } = Config.virtual;

    const pts = this._beamPathArr[0].points;
    pts[0][0] = this.x; pts[0][1] = this.y;
    pts[1][0] = this.x; pts[1][1] = vH + 30;

    renderer.strokePaths(this._beamPathArr, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color,
      lineCap: 'round', singleStroke: true, alpha,
    });
    renderer.strokePaths(this._beamPathArr, {
      color: cfg.coreColor, lineWidth: cfg.coreLineWidth,
      lineCap: 'round', singleStroke: true, alpha,
    });
  }
}
