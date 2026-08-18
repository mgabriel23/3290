/**
 * PhoenixBoss.js
 * Boss #9 — "Phoenix". Spawned by WaveManager on every 9th boss-level
 * encounter (level 63, 126, ... under Survival Mode's canonical schedule —
 * see Config.bossSchedule[mode].roster and WaveManager's boss-selection
 * lookup in its constructor). An original swept-wing bird silhouette (see
 * PHOENIX_HULL_PTS below — not a reskin, same "original hull" lineage as
 * Spiral/Tetra/Nova/Pulsor/Zigzag, but the first of that lineage that isn't
 * a regular polygon): an angular head/beak, wings swept back with a jagged
 * double-tip (reads as layered primary feathers instead of one straight
 * edge), and a clean swallow-style forked tail (two feather tips, one notch
 * between them — not the 3-pronged trident silhouette an earlier revision
 * used, which read as neither bird nor phoenix). Reuses the ship-family's
 * own nose/tail convention (Enemy.js's `atan2(-dx, dy)` — local -Y away
 * from the player, local +Y toward it) as the phoenix's own anatomy: the
 * tail anchor (between the two fork tips) gets `renderEngineFlame`'s
 * exhaust plume as a trailing fire trail — a phoenix trailing fire from
 * between its own tail feathers — and the beak anchor is where fireballs
 * launch from. No engine-core orb on top of the hull the way BossEnemy.js
 * has (a chest ember was tried and cut — it read as a stray dot rather
 * than part of the silhouette); the flame trail alone carries the "this
 * has a real facing direction" read Tetra/Nova/Pulsor/Zigzag's spinning
 * turrets don't need.
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
 *   is exactly (restX, restY)), beak tracking the player, firing one round,
 *   aimed fireball (PhoenixFireballs.js) at the player's CURRENT position —
 *   no lead prediction — every `fireball.fireInterval` seconds. The
 *   fireball is the first stage of a 3-stage cascade: it later spreads into
 *   a fan of embers (PhoenixEmbers.js), which each later scatter into a
 *   wider burst of sparks (PhoenixSparks.js) — see PhoenixFireballs.js's own
 *   doc for the full chain. Runs for `phase1Duration` seconds, then
 *   advances.
 *
 *   phase 2 — a single telegraphed wind-up + charge, three beats
 *   (`_phaseState`/`_setPhaseState`, reusing `_phaseAge` as the SUBSTATE age
 *   the same way BossEnemy's own phase sub-machines do):
 *     'telegraph' — locks the player's position AND the charge direction at
 *     THIS instant (not re-aimed as they move), shows a directional
 *     indicator (see `renderExtras`), and eases the boss backward along the
 *     locked direction (`charge.windUpDistance`) — a visible coiled
 *     anticipation beat, not a static line — over `charge.telegraphDuration`
 *     seconds.
 *     'charging' — accelerates from `chargeStartSpeed` toward
 *     `chargeMaxSpeed` along that SAME locked direction, starting from the
 *     pulled-back point so the wind-up and the dash read as one continuous
 *     coil-and-release motion — a real commitment, not a homing missile —
 *     dealing `charge.contactDamage` to the player on touch (see the
 *     `contactDamage` getter, WaveManager's generic contact-damage hook)
 *     until either `chargeDuration` elapses or it crosses the arena bound
 *     clamp (kept well clear of the barrier — this attack never touches it,
 *     only the player).
 *     'recover' — smoothstep-eases back to the shared rest point over
 *     `recoverDuration` seconds before phase 3 begins.
 *
 *   phase 3 — holds still at the rest point while a single beam of fire
 *   goes through the SAME two-substate shape TetraBoss's own phase-2 laser
 *   uses (deliberately matched 1:1 so both beam bosses read the same way),
 *   reusing `_phaseState`/`_setPhaseState` the way phase 2 does:
 *     'charging' — a base direction LOCKED ONCE, the instant phase 3 begins
 *     (`_enterSwayPhase`), at wherever the player is standing right then —
 *     same one-shot lock TetraBoss's own `_baseAngle` uses, NOT re-aimed
 *     every frame (a continuous every-frame re-aim was tried first and is
 *     provably undodgeable: the swing returns to 0 offset twice per period
 *     by definition, and a live re-aim means "0 offset" always equals
 *     "aimed exactly at the player's current exact position" — the beam
 *     would guarantee-hit at every zero crossing no matter how the player
 *     moved). Frozen at that direction (no sway yet) for `chargeDuration`
 *     seconds, showing only a harmless dashed preview line to the screen
 *     edge plus a pulsing marker where it'll cross (`_renderChargeWarning`
 *     — same two-piece telegraph language TetraBoss._renderChargeWarning
 *     uses).
 *     'lasering' — the preview resolves into a live, damaging beam
 *     (`checkLaserHit`, a point-to-segment test each frame via
 *     `core/vectorMath.js`'s `distanceToSegment`, same idiom TetraBoss's
 *     phase-2 lasers use) that now sways with a slow sinusoidal offset
 *     around the SAME locked direction (`sway.swaySpeed`/`swayAmplitude`)
 *     for `liveDuration` seconds before looping back to phase 1 — since the
 *     beam doesn't re-track the player, standing still isn't safe forever;
 *     the player has to actively move to wherever the slow sway currently
 *     isn't. The hull rotates to visually aim along the beam throughout
 *     both substates.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared
 * EnemyCombat.js functions every other boss/enemy class uses — see that
 * file's header for why those are plain functions rather than a base class.
 */
import { Config } from '../core/Config.js';
import { applyHit, tickDeathState, stepEntryGlide, renderHull, renderEngineFlame } from './EnemyCombat.js';
import { distanceToSegment, rayRectExit } from '../core/vectorMath.js';

const PS = Config.boss.phoenix.size;

// A swept-wing bird silhouette, hand-authored (not a regular polygon like
// every earlier original-hull boss) — beak at local +Y (toward the player,
// see class doc), wings swept back to a jagged double tip (a leading
// wingtip point plus a shorter trailing feather point, selling layered
// primaries instead of one flat edge), waist tapering in, then a forked
// tail (two feather tips with a single notch between them) fanning out
// behind at local -Y (away from the player).
const PHOENIX_HULL_PTS = [
  [ 0,          PS * 0.95], // beak tip
  [ PS * 0.13,  PS * 0.66], // right cheek
  [ PS * 0.20,  PS * 0.52], // right neck notch (concave — separates head from wing)
  [ PS * 1.05,  PS * 0.15], // right wingtip (leading edge)
  [ PS * 0.75, -PS * 0.05], // right wing feather notch (concave — splits the wingtip into two points)
  [ PS * 0.92, -PS * 0.22], // right trailing wing point (secondary feather)
  [ PS * 0.30, -PS * 0.18], // right wing root / waist (concave, back to the body)
  [ PS * 0.42, -PS * 0.95], // right tail feather tip
  [ 0,         -PS * 0.55], // tail fork notch (concave center — the "V" of the forked tail)
  [-PS * 0.42, -PS * 0.95], // left tail feather tip
  [-PS * 0.30, -PS * 0.18], // left wing root / waist
  [-PS * 0.92, -PS * 0.22], // left trailing wing point
  [-PS * 0.75, -PS * 0.05], // left wing feather notch
  [-PS * 1.05,  PS * 0.15], // left wingtip
  [-PS * 0.20,  PS * 0.52], // left neck notch
  [-PS * 0.13,  PS * 0.66], // left cheek
];

// Beak anchor (fireball launch point) and tail anchor (flame-plume anchor,
// centered between the two fork tips at the same depth as their own tips —
// see class doc for why the flame reads as trailing from the fork rather
// than from a single spike) — same local-vertex-as-attachment-point idiom
// BossEnemy.js's NOSE_LX/LY, GUN_LX/LY use.
const BEAK_LX = 0, BEAK_LY = PS * 0.95;
const TAIL_LX = 0, TAIL_LY = -PS * 0.95;

export class PhoenixBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.phoenix.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.phoenix;
    // Derived, not authored — see Config's own doc on `orbitCycles` for why
    // orbitSpeed must be exactly this (phase1Duration * orbitSpeed always
    // lands on a whole multiple of 2π) rather than a hand-picked constant.
    this._orbitSpeed = this._cfg.orbitCycles * (Math.PI * 2 / this._cfg.phase1Duration);

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
    this._phaseAge   = 0; // seconds since _phase (or, while in phase 2/3, _phaseState) last changed
    // Phase 2's own substates ('telegraph' | 'charging' | 'recover') AND
    // phase 3's own substates ('charging' | 'lasering', reusing the SAME
    // field/name-space since the two phases never overlap) — the two
    // phases' 'charging' don't collide because every read of _phaseState is
    // always gated on the current _phase first. See _setPhaseState.
    this._phaseState = 'telegraph';
    this._orbitPhase = 0;
    this._fireTimer  = 0;
    this._swayPhase  = 0;

    this._chargeTargetX = 0; this._chargeTargetY = 0;
    this._chargeDirX = 0; this._chargeDirY = 0;
    this._chargeSpeed = 0;
    this._telegraphFromX = 0; this._telegraphFromY = 0;
    this._recoverFromX = 0; this._recoverFromY = 0;
    this._baseAngle = 0; // phase 3 only — locked once at phase-3 entry, see _enterSwayPhase
    this._beamAngle = 0; // phase 3 only — _baseAngle + the live swing offset, see _updateSwayPhase/checkLaserHit/_renderBeam

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
    else if (this._phase === 2) this._updateChargePhase(dt, playerX, playerY);
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
    // Exact snap to the shared rest point — phase 1's orbit is TUNED
    // (orbitSpeed derived from orbitCycles) to already land here, but this
    // guards against any residual float/frame-timing drift, same reasoning
    // as _enterSwayPhase's own snap. Load-bearing, not cosmetic: the
    // wind-up below eases AWAY from this exact point, and `charge.
    // boundYMin`/`windUpDistance` are only sized with enough margin against
    // the TRUE rest point — starting from anywhere else could walk the
    // wind-up straight past the bound before 'charging' even begins,
    // instantly clamping and collapsing the whole dash to near-nothing.
    this.x = this._restX;
    this.y = this._restY;
    this._chargeTargetX = playerX;
    this._chargeTargetY = playerY;
    // Direction is locked HERE, at telegraph start, not at telegraph end —
    // the 'telegraph' substate below needs it immediately to ease backward
    // along it (the wind-up), and 'charging' then reuses this exact same
    // direction so the coil and the release are visually one motion.
    const dx = playerX - this.x, dy = playerY - this.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this._chargeDirX = dx / len;
    this._chargeDirY = dy / len;
    this._angle = Math.atan2(-this._chargeDirX, this._chargeDirY);
    this._telegraphFromX = this.x;
    this._telegraphFromY = this.y;
    this._setPhaseState('telegraph');
  }

  _enterSwayPhase(playerX, playerY) {
    this._phase = 3;
    this._swayPhase = 0;
    // Exact snap — 'recover' already smoothstep-eased all the way to
    // (restX, restY), so this just guards against any float drift.
    this.x = this._restX;
    this.y = this._restY;
    // Locked ONCE, here, at wherever the player is standing right now — see
    // class doc for why a continuous every-frame re-aim is undodgeable and
    // was reverted. Frozen (no sway) through 'charging'; 'lasering' is the
    // only substate that adds the sinusoidal swing offset on top of this
    // fixed direction — same two-state shape TetraBoss's own phase-2 laser
    // uses (see class doc).
    this._baseAngle = Math.atan2(playerY - this.y, playerX - this.x);
    this._beamAngle = this._baseAngle;
    this._angle = this._baseAngle - Math.PI / 2; // hull aims along the locked direction immediately, through both substates
    this._setPhaseState('charging'); // phase 3's OWN 'charging'/'lasering' — reuses _phaseState the same way phase 2 does, see its own doc
  }

  _setPhaseState(name) { this._phaseState = name; this._phaseAge = 0; }

  /**
   * Phase 1 — circular orbit around the shared rest point (parametrized so
   * t=0 is exactly (restX, restY), same zero-jump trick BossEnemy's figure-8
   * uses), beak tracking the player, firing one aimed fireball on every
   * `fireball.fireInterval` tick. Advances to phase 2 after `phase1Duration`
   * — `this._orbitSpeed` (derived from `orbitCycles`, see constructor) is
   * exactly what makes that instant land back on t=0 (the rest point) too,
   * not just approximately close to it.
   */
  _updateOrbitPhase(dt, playerX, playerY, fireFireball) {
    const cfg = this._cfg;
    this._orbitPhase += dt * this._orbitSpeed;
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

  /** Phase 2 — telegraph (with a visible backward wind-up) -> charging -> recover, see class doc. */
  _updateChargePhase(dt, playerX, playerY) {
    const cfg = this._cfg.charge;

    if (this._phaseState === 'telegraph') {
      // Ease backward along the locked charge direction as the telegraph
      // plays — a coiled anticipation beat rather than a static hold, so
      // the dash itself reads as a release rather than a cold start.
      // Smoothstep so the pull-back settles rather than snapping to a stop.
      const t = Math.min(1, this._phaseAge / cfg.telegraphDuration);
      const ease = t * t * (3 - 2 * t);
      const pull = cfg.windUpDistance * ease;
      this.x = this._telegraphFromX - this._chargeDirX * pull;
      this.y = this._telegraphFromY - this._chargeDirY * pull;

      if (this._phaseAge >= cfg.telegraphDuration) {
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
      if (t >= 1) this._enterSwayPhase(playerX, playerY);
    }
  }

  /**
   * Phase 3 — holds at the rest point (no positional movement) while the
   * beam goes through the SAME two-substate shape TetraBoss's own phase-2
   * laser uses (see class doc), reusing `_phaseState` the way phase 2 does:
   *   'charging' — frozen at `_baseAngle` (locked once at phase-3 entry,
   *   see `_enterSwayPhase`), harmless, just the dashed preview
   *   (`_renderChargeWarning`) — no sway yet, so the player learns exactly
   *   where the live beam will start before it does anything.
   *   'lasering' — the live, damaging beam, sways with a slow sinusoidal
   *   offset around `_baseAngle` for `liveDuration` seconds, then loops
   *   back to phase 1.
   * The hull rotates to visually aim along the beam throughout both.
   */
  _updateSwayPhase(dt) {
    const cfg = this._cfg.sway;
    this.x = this._restX;
    this.y = this._restY;

    if (this._phaseState === 'charging') {
      if (this._phaseAge >= cfg.chargeDuration) {
        this._swayPhase = 0; // starts exactly at 0 offset — no jump from the frozen preview direction, same as TetraBoss's own _swayOffset() doc
        this._setPhaseState('lasering');
      }
      return;
    }

    // 'lasering'
    this._swayPhase += dt * cfg.swaySpeed;
    this._beamAngle = this._baseAngle + Math.sin(this._swayPhase) * cfg.swayAmplitude;
    // Convert the beam's world-space math angle into the ship-rotation
    // convention renderHull/renderEngineFlame use (see class doc/Enemy.js —
    // local +Y, the beak, points toward the player at ship-angle 0) so the
    // hull visually aims down the beam: world dir (cos θ, sin θ) is produced
    // by ship-angle (θ − π/2) under that convention.
    this._angle = this._beamAngle - Math.PI / 2;

    if (this._phaseAge >= cfg.liveDuration) this._enterOrbitPhase();
  }

  /**
   * Phase-3 beam vs. player test — an optional hook WaveManager.checkPlayerHit
   * reads generically (`e.checkLaserHit?.(...)`), same name/shape TetraBoss's
   * phase-2 lasers use. A point-to-segment test (`distanceToSegment`)
   * against the same angled segment `render`/`_renderBeam` draws. Returns 0
   * outside phase 3's 'lasering' substate — in particular during 'charging'
   * the dashed preview is purely visual, same fairness window TetraBoss's
   * own 'charging' telegraph gives the player.
   * @param {number} px @param {number} py @param {number} hitRadius
   * @returns {number}
   */
  checkLaserHit(px, py, hitRadius) {
    const cfg = this._cfg.sway;
    if (this._phase !== 3 || this._phaseState !== 'lasering') return 0;
    const x2 = this.x + Math.cos(this._beamAngle) * cfg.length;
    const y2 = this.y + Math.sin(this._beamAngle) * cfg.length;
    return distanceToSegment(px, py, this.x, this.y, x2, y2) <= cfg.halfWidth + hitRadius ? cfg.damage : 0;
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
   * Flame -> hull -> beam telegraph/live (phase 3 only). WaveManager calls
   * this directly (see `_renderIndividualEnemies`) since only one boss is
   * ever on screen at once. No separate engine-core orb on top of the hull
   * (unlike BossEnemy) — the earlier chest ember read as an odd stray dot
   * on the body rather than a coherent part of the silhouette.
   */
  render(renderer) {
    this.renderFlame(renderer);
    renderHull(renderer, this, PHOENIX_HULL_PTS);
    if (this._phase === 3) {
      if (this._phaseState === 'charging') this._renderChargeWarning(renderer);
      else this._renderBeam(renderer);
    }
  }

  /**
   * 'charging' — a faint dashed preview line from the boss to the screen
   * edge (core/vectorMath.js's `rayRectExit`) at the locked (frozen, no
   * sway) `_baseAngle`, plus a pulsing marker where it crosses — the exact
   * two-piece telegraph language TetraBoss._renderChargeWarning uses,
   * deliberately matched so both beam bosses read the same way to the
   * player, in place of the earlier "just fade the live beam's alpha in"
   * treatment.
   */
  _renderChargeWarning(renderer) {
    const cfg   = this._cfg.sway;
    const t     = Math.min(1, this._phaseAge / cfg.chargeDuration);
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(this._phaseAge * cfg.chargePulseSpeed));
    const { width: vW, height: vH } = Config.virtual;
    const edge = rayRectExit(this.x, this.y, Math.cos(this._beamAngle), Math.sin(this._beamAngle), vW, vH);

    const pts = this._beamPathArr[0].points;
    pts[0][0] = this.x; pts[0][1] = this.y;
    pts[1][0] = edge.x; pts[1][1] = edge.y;

    renderer.strokePaths(this._beamPathArr, {
      color: cfg.color, lineWidth: cfg.warningLineWidth, lineDash: cfg.warningLineDash,
      lineCap: 'round', singleStroke: true, alpha: t * 0.4,
    });
    renderer.strokeCircle(edge.x, edge.y, cfg.warningMarkerRadius, {
      color: cfg.coreColor, lineWidth: cfg.warningMarkerLineWidth,
      glowBlur: cfg.warningMarkerGlowBlur, glowColor: cfg.color,
      alpha: t * pulse,
    });
  }

  /** 'lasering' — outer colored glow + a bright core stroke down the beam, already fully telegraphed by 'charging' so no further fade-in here — same treatment as TetraBoss._renderLasers. */
  _renderBeam(renderer) {
    const cfg = this._cfg.sway;

    const pts = this._beamPathArr[0].points;
    pts[0][0] = this.x; pts[0][1] = this.y;
    pts[1][0] = this.x + Math.cos(this._beamAngle) * cfg.length;
    pts[1][1] = this.y + Math.sin(this._beamAngle) * cfg.length;

    renderer.strokePaths(this._beamPathArr, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color,
      lineCap: 'round', singleStroke: true,
    });
    renderer.strokePaths(this._beamPathArr, {
      color: cfg.coreColor, lineWidth: cfg.coreLineWidth,
      lineCap: 'round', singleStroke: true,
    });
  }
}
