/**
 * BossEnemy.js
 * The first boss encounter ("Scout Prime") — spawned by WaveManager every
 * `Config.bossSchedule[mode].everyNLevels` levels in place of that level's
 * normal roster (see WaveManager's boss-level branch in its
 * constructor/`_spawnNext`). A
 * giant reskin of the Scout hull — the exact same authored proportions as
 * Enemy.js's SCOUT_HULL_PTS, just parameterized by a much bigger `size` (see
 * BOSS_HULL_PTS below) — whose attack cycles between the two "ship-family"
 * enemies it's built from:
 *
 *   phase 0 — Scout-style aimed bullet bursts   (Config.boss.scout1.scoutPhase)
 *   phase 1 — Sniper-style charge/lock/fire     (...sniperPhase)
 *
 * ...then loops back to phase 0. Each phase runs its own small sub-state
 * machine (`_phaseState`, distinct from the top-level `_state` entering/
 * combat/repositioning machine) and repeats itself `volleys`/`shots` times
 * before advancing — see `_enterPhase`/`_nextPhase` and each `_updateXPhase`
 * method. Layered on top of phase 0 (independent of its own aim/burst/
 * cooldown cycle) is an occasional homing rocket (`_updateRocketPod`,
 * Config.boss.scout1.rocketPod) — a Rocketeer-style attack that no longer
 * gets a dedicated phase of its own, just a periodic side-attack while the
 * boss is busy gunning.
 *
 * Dedicated firing points: rather than every shot originating from the
 * hull's center, bullets and rockets fire from specific hull vertices —
 * CANNON_L/CANNON_R (a small wing-cannon nub jutting out from each wingtip,
 * same visual language as Player.js's own WING_CANNON_RIGHT wings-upgrade
 * decoration, see CANNON_R_PTS below — scout-phase bullets fire from the tip
 * of this nub, alternating left/right per shot) and POD_L/POD_R (the hull's
 * own inner "shoulder" vertices, the occasional rocket, also alternating).
 * The sniper phase's shot keeps firing from the existing tail-tip
 * GUN_LX/GUN_LY muzzle, unchanged.
 *
 * Movement: enters from the top like any other enemy (`stepEntryGlide`,
 * shared with Enemy.js/SniperEnemy.js via EnemyCombat.js), then holds
 * perfectly still at its rest point while fighting — same as a regular
 * parked Scout, no continuous idle drift. The only motion is an occasional
 * reposition (`_maybeBeginReposition`, called once per full scout+sniper
 * attack cycle from the sniper phase's last shot): a `repositionChance` roll
 * may glide it (`_state = 'repositioning'`, eased with core/animation.js's
 * easeOutCubic — the same curve Enemy.js's own mid-fight repositioning and
 * SpiralBoss's between-volley relocation both use) to a fresh random spot
 * before resuming the scout phase from there.
 *
 * Sniper-phase angle handling mirrors SniperEnemy.js exactly (see that
 * file's doc): the nose freezes the instant it locks on, stays frozen
 * through the post-fire crawl window (`_angleFreezeRemaining`, driven by
 * the same shared `Config.enemy.sniper.bullet.accelDelay` both a regular
 * Sniper and this boss's own shot use), then eases back toward the player
 * during 'recover' instead of snapping — see `update`'s angle-tracking
 * block.
 *
 * Hit/death-flash/entry-glide/engine-flame/engine-core rendering all reuse
 * the same shared EnemyCombat.js functions Enemy.js and SniperEnemy.js
 * already use — see that file's header for why those are plain functions
 * rather than a base class. Only one boss is ever on screen (a boss level's
 * synthetic wave config spawns exactly one — see WaveManager), so unlike
 * Scout/Rocketeer/Sniper it renders itself directly instead of being
 * batched into WaveManager's shared hull pools — the same reasoning
 * Drifter/Bouncer already render individually.
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';
import { applyHit, tickDeathState, setState, stepEntryGlide, renderEngineFlame, renderEngineCore, renderHull } from './EnemyCombat.js';

const BS = Config.boss.scout1.size;

// Same authored proportions as Enemy.js's SCOUT_HULL_PTS, just parameterized
// by the boss's own (much bigger) size — see class doc.
const BOSS_HULL_PTS = [
  [ 0,        -BS * 0.30],
  [ BS * 0.80, -BS * 0.50],
  [ BS * 0.85,  BS * 0.00],
  [ BS * 0.40,  BS * 0.25],
  [ BS * 0.20,  BS * 0.55],
  [ 0,          BS * 0.70],
  [-BS * 0.20,  BS * 0.55],
  [-BS * 0.40,  BS * 0.25],
  [-BS * 0.85,  BS * 0.00],
  [-BS * 0.80, -BS * 0.50],
];

// Engine-flame anchor (nose) and gun-muzzle anchor (tail tip, where the
// sniper-phase charge orb/shot originate) — same local vertices Enemy.js/
// SniperEnemy.js use for their own (much smaller) S, scaled to BS.
const NOSE_LX = 0, NOSE_LY = -BS * 0.30;
const GUN_LX  = 0, GUN_LY  =  BS * 0.70;

// Wing-cannon nub — a small barrel poking straight outward from each
// wingtip vertex (BOSS_HULL_PTS[2]/[8]) — same visual language as
// Player.js's own WING_CANNON_RIGHT nub (its wings-upgrade decoration),
// scaled up for the boss so scout-phase bullets visibly emerge from an
// attached part instead of the bare hull. CANNON_R_LX/LY is the tip's
// midpoint (the "muzzle") — where bullets actually spawn from, not the
// wingtip vertex itself. Rendered by `_renderCannons`, drawn on top of the
// hull in `render`.
const CANNON_LEN  = BS * 0.30; // vp — how far the barrel pokes past the wingtip
const CANNON_HALF = BS * 0.09; // vp — half-thickness at its base
const CANNON_R_PTS = [
  [ BS * 0.72,               -CANNON_HALF       ],
  [ BS * 0.85 + CANNON_LEN,  -CANNON_HALF * 0.6 ],
  [ BS * 0.85 + CANNON_LEN,   CANNON_HALF * 0.6 ],
  [ BS * 0.72,                CANNON_HALF       ],
];
const CANNON_L_PTS = CANNON_R_PTS.map(([x, y]) => [-x, y]);
const CANNON_R_LX = BS * 0.85 + CANNON_LEN, CANNON_R_LY = 0;
const CANNON_L_LX = -CANNON_R_LX,           CANNON_L_LY = 0;

// Wing-pod anchors — the occasional rocket fires from these, alternating
// left/right (see _updateRocketPod) — the hull's own inner "shoulder"
// vertices (BOSS_HULL_PTS[3]/[7]), the same spot bullets fired from before
// the wing-cannon nub above took over that job. No visible decoration here
// (matches how this anchor already looked before this pass), only the
// wing-cannon above is meant to read as an attached part.
const POD_L_LX = -BS * 0.40, POD_L_LY = BS * 0.25;
const POD_R_LX =  BS * 0.40, POD_R_LY = BS * 0.25;

export class BossEnemy {
  /**
   * @param {number} [healthBonus]  added to Config.boss.scout1.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.scout1;

    this.x = vW / 2;
    this.y = -BS;
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
    this._state    = 'entering'; // 'entering' -> 'combat' <-> 'repositioning'
    this._stateAge = 0;

    // Phase/combat sub-state — real values assigned by _enterPhase once
    // entry finishes (see update()'s 'entering' branch); placeholder here
    // just keeps every field present from construction.
    this._phase      = 0;
    this._phaseState = 'aim';
    this._phaseAge   = 0;

    this._aimX = this.x; this._aimY = 0;
    this._burstShotsFired = 0;
    this._volley = 0;
    this._targetX = 0; this._targetY = 0;
    this._shot = 0;

    // Set to Config.enemy.sniper.bullet.accelDelay the instant the sniper
    // phase's shot fires — while positive, the angle-tracking block below
    // freezes _angle instead of turning, same mechanic as SniperEnemy's own
    // _angleFreezeRemaining — see class doc.
    this._angleFreezeRemaining = 0;

    // Occasional rocket (phase 0 only) — independent timer from the scout
    // phase's own aim/burst/cooldown cycle. Real value rolled once combat
    // starts (see update()'s 'entering' branch); placeholder here just
    // keeps the field present from construction.
    this._rocketPodCooldown = 0;
    this._rocketPodSide = 1; // alternates -1/1 between POD_L/POD_R each shot

    // Reposition origin/target — real values assigned by
    // _maybeBeginReposition once a full attack cycle finishes; placeholder
    // here just keeps the fields present from construction.
    this._repoFromX = this.x; this._repoFromY = this._restY;
    this._repoToX   = this.x; this._repoToY   = this._restY;
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
   * @param {number} dt
   * @param {number} playerX @param {number} playerY
   * @param {{
   *   fireBullet: (ox:number,oy:number,tx:number,ty:number)=>void,
   *   fireRocket: (ox:number,oy:number,tx:number,ty:number,sizeMult?:number,swingAngle?:number,homingDelay?:number)=>void,
   *   fireSniperBullet: (ox:number,oy:number,tx:number,ty:number,speedMult?:number)=>void,
   * }} fire  a small bag of every fire callback WaveManager can route a
   *   boss through — passed as one object (not positional args) so every
   *   boss class can share this exact `update` signature regardless of
   *   which subset of callbacks it actually uses (see SpiralBoss.js, which
   *   only ever reads `fire.fireSpiralBullet`). `fireRocket`'s
   *   `sizeMult`/`swingAngle`/`homingDelay` and `fireSniperBullet`'s
   *   `speedMult` are this boss's own `rocketPod`/`sniperPhase` tuning —
   *   see each's own doc.
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge    += dt;
    this._enginePhase += dt * 6;
    if (tickDeathState(this, dt)) return;

    // ── Angle tracking ────────────────────────────────────────────────────
    // Entering/phase 0/repositioning: nose continuously points away from the
    // player, same convention as Scout. Phase 1 (sniper, once in combat):
    // same freeze/reangle mechanic as SniperEnemy — see class doc — frozen
    // through the 'locked' telegraph AND through the post-fire crawl window
    // (_angleFreezeRemaining), then eases back toward the player during
    // 'recover' at `sniperPhase.recoverTurnRate` instead of snapping.
    if (this._state === 'combat' && this._phase === 1) {
      if (this._angleFreezeRemaining > 0) {
        this._angleFreezeRemaining = Math.max(0, this._angleFreezeRemaining - dt);
      } else if (this._phaseState === 'recover') {
        const dx          = playerX - this.x;
        const dy          = playerY - this.y;
        const targetAngle = Math.atan2(-dx, dy);
        const diff = Math.atan2(
          Math.sin(targetAngle - this._angle),
          Math.cos(targetAngle - this._angle),
        );
        const step = cfg.sniperPhase.recoverTurnRate * dt;
        this._angle += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      } else if (this._phaseState !== 'locked') {
        const dx = playerX - this.x, dy = playerY - this.y;
        this._angle = Math.atan2(-dx, dy);
      }
      // 'locked': angle stays frozen at whatever it last tracked to.
    } else {
      const dx = playerX - this.x, dy = playerY - this.y;
      this._angle = Math.atan2(-dx, dy);
    }

    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'combat');
      if (this._state === 'combat') {
        this._enterPhase(0);
        this._rocketPodCooldown = this._rollRocketPodCooldown();
      }
      return;
    }

    if (this._state === 'repositioning') {
      const t = Math.min(this._stateAge / cfg.repositionDuration, 1);
      const eased = easeOutCubic(t);
      this.x = this._repoFromX + (this._repoToX - this._repoFromX) * eased;
      this.y = this._repoFromY + (this._repoToY - this._repoFromY) * eased;
      if (t >= 1) {
        this._restX = this._repoToX;
        this._restY = this._repoToY;
        setState(this, 'combat');
        this._enterPhase(0);
      }
      return;
    }

    if (this._phase === 0) {
      this._updateScoutPhase(dt, playerX, playerY, fire.fireBullet);
      this._updateRocketPod(dt, playerX, playerY, fire.fireRocket);
    } else {
      this._updateSniperPhase(dt, playerX, playerY, fire.fireSniperBullet);
    }
  }

  /** Random interval before the next occasional rocket — see _updateRocketPod. */
  _rollRocketPodCooldown() {
    const p = this._cfg.rocketPod;
    return p.minInterval + Math.random() * (p.maxInterval - p.minInterval);
  }

  /** Switch to `phase` (0/1 — scout/sniper), resetting that phase's own repeat counter. */
  _enterPhase(phase) {
    this._phase = phase;
    if (phase === 0) { this._volley = 0; this._setPhaseState('aim'); }
    else              { this._shot   = 0; this._setPhaseState('charge'); }
  }

  /** Advance to the next phase in the cycle (1 wraps back to 0). */
  _nextPhase() { this._enterPhase((this._phase + 1) % 2); }

  _setPhaseState(name) { this._phaseState = name; this._phaseAge = 0; }

  /**
   * Called once the sniper phase's last shot finishes recovering — i.e. once
   * per full scout+sniper attack cycle, NOT after every burst/reload like a
   * regular Scout — see class doc. A `repositionChance` roll may glide the
   * boss to a fresh rest point (`_state = 'repositioning'`, see `update`)
   * before resuming the scout phase from there; otherwise it just resumes
   * the scout phase from its current spot.
   */
  _maybeBeginReposition() {
    const cfg = this._cfg;
    if (Math.random() < cfg.repositionChance) {
      const { width: vW } = Config.virtual;
      this._repoFromX = this.x;
      this._repoFromY = this.y;
      this._repoToX = cfg.repositionMarginX + Math.random() * (vW - cfg.repositionMarginX * 2);
      this._repoToY = cfg.repositionYMin + Math.random() * (cfg.repositionYMax - cfg.repositionYMin);
      setState(this, 'repositioning');
    } else {
      this._enterPhase(0);
    }
  }

  /**
   * Phase 0 — Scout-style aim→burst, repeated `volleys` times. Mirrors
   * Enemy.js's own aiming/firing state machine at boss scale. Each shot
   * alternates between the CANNON_L/CANNON_R wing-cannon nub anchors rather
   * than firing from the hull's center — see class doc.
   */
  _updateScoutPhase(dt, playerX, playerY, fireBullet) {
    const p = this._cfg.scoutPhase;
    this._phaseAge += dt;

    if (this._phaseState === 'aim') {
      if (this._phaseAge <= dt) { this._aimX = playerX; this._aimY = playerY; }
      if (this._phaseAge >= p.aimPause) {
        this._burstShotsFired = 0;
        this._setPhaseState('burst');
      }
    } else if (this._phaseState === 'burst') {
      if (this._burstShotsFired < p.burstCount && this._phaseAge >= this._burstShotsFired * p.burstInterval) {
        const leadX = playerX + (playerX - this._aimX) * p.leadFactor;
        const leadY = playerY + (playerY - this._aimY) * p.leadFactor;

        const c = Math.cos(this._angle), s = Math.sin(this._angle);
        const [lx, ly] = this._burstShotsFired % 2 === 0 ? [CANNON_L_LX, CANNON_L_LY] : [CANNON_R_LX, CANNON_R_LY];
        const originX = this.x + c * lx - s * ly;
        const originY = this.y + s * lx + c * ly;
        fireBullet(originX, originY, leadX, leadY);
        this._burstShotsFired++;
      }
      const burstDuration = (p.burstCount - 1) * p.burstInterval;
      if (this._burstShotsFired >= p.burstCount && this._phaseAge >= burstDuration + p.cooldown) {
        this._volley++;
        if (this._volley >= p.volleys) this._nextPhase();
        else this._setPhaseState('aim');
      }
    }
  }

  /**
   * Occasional rocket, fired only while in phase 0 (scout) — see class doc.
   * An independent timer from the scout phase's own aim/burst/cooldown
   * cycle: ticks down every frame this runs and, on reaching zero, launches
   * one rocket from whichever wing-pod anchor is due next (alternating
   * POD_L/POD_R), swung off-angle with a brief straight-flight delay before
   * homing engages — see Config.boss.scout1.rocketPod's doc for why those
   * values mirror Config.player.missiles exactly (the "same behavior as the
   * player's rocket" this was built to match).
   */
  _updateRocketPod(dt, playerX, playerY, fireRocket) {
    const p = this._cfg.rocketPod;
    this._rocketPodCooldown -= dt;
    if (this._rocketPodCooldown > 0) return;

    const c = Math.cos(this._angle), s = Math.sin(this._angle);
    const [lx, ly] = this._rocketPodSide > 0 ? [POD_R_LX, POD_R_LY] : [POD_L_LX, POD_L_LY];
    this._rocketPodSide = -this._rocketPodSide;
    const originX = this.x + c * lx - s * ly;
    const originY = this.y + s * lx + c * ly;

    const mag   = p.swingAngleMin + Math.random() * (p.swingAngleMax - p.swingAngleMin);
    const swing = Math.random() < 0.5 ? -mag : mag;
    fireRocket(originX, originY, playerX, playerY, p.rocketSizeMult, swing, p.homingDelay);

    this._rocketPodCooldown = this._rollRocketPodCooldown();
  }

  /**
   * Phase 1 — Sniper-style charge/lock/fire, repeated `shots` times before
   * looping back to phase 0 (via `_maybeBeginReposition` — see class doc).
   * Same three-beat cadence as SniperEnemy.js, now tuned to the exact same
   * interval (see Config.boss.scout1.sniperPhase's doc).
   */
  _updateSniperPhase(dt, playerX, playerY, fireSniperBullet) {
    const p = this._cfg.sniperPhase;
    this._phaseAge += dt;

    if (this._phaseState === 'charge') {
      if (this._phaseAge >= p.chargeWarmup) {
        this._targetX = playerX;
        this._targetY = playerY;
        this._setPhaseState('locked');
      }
    } else if (this._phaseState === 'locked') {
      if (this._phaseAge >= p.warningDuration) {
        const c = Math.cos(this._angle), s = Math.sin(this._angle);
        const noseX = this.x + c * GUN_LX - s * GUN_LY;
        const noseY = this.y + s * GUN_LX + c * GUN_LY;
        fireSniperBullet(noseX, noseY, this._targetX, this._targetY, p.bulletSpeedMult);
        this._angleFreezeRemaining = Config.enemy.sniper.bullet.accelDelay;
        this._setPhaseState('recover');
      }
    } else if (this._phaseState === 'recover') {
      if (this._phaseAge >= p.recoverDuration) {
        this._shot++;
        if (this._shot >= p.shots) this._maybeBeginReposition();
        else this._setPhaseState('charge');
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

  /** Engine exhaust — must be drawn BEFORE the hull so it appears behind it. */
  renderFlame(renderer) {
    renderEngineFlame(renderer, this, NOSE_LX, NOSE_LY, BS * 0.45);
  }

  /**
   * Wing-cannon nubs — drawn ON TOP of the hull (matches Player.js's own
   * upgrade-decoration nubs, also drawn on top of its base silhouette), same
   * fill/stroke/glow styling as the hull itself so they read as an attached
   * part, not a separate object. See CANNON_R_PTS's own doc.
   */
  _renderCannons(renderer) {
    const cfg   = this._cfg;
    const flash = this._hitFlash > 0;
    if (!this._cannonPathArr) {
      this._cannonPathArr = [
        { points: CANNON_L_PTS, closed: true },
        { points: CANNON_R_PTS, closed: true },
      ];
    }
    renderer.fillStrokePaths(this._cannonPathArr, {
      x: this.x, y: this.y, rotation: this._angle,
      fillColor:   flash ? '#ffffff' : cfg.fillColor,
      strokeColor: flash ? '#ffffff' : cfg.color,
      lineWidth:   cfg.lineWidth,
      glowBlur:    flash ? cfg.hitGlowBlur : cfg.glowBlur,
      glowColor:   flash ? '#ffffff' : cfg.color,
    });
  }

  /** Engine core orb, plus (during phase 1) the sniper-style charge orb at the gun muzzle. */
  renderCore(renderer) {
    renderEngineCore(renderer, this, 0, BS * 0.05, BS * 0.14, BS * 0.10);

    if (this._hitFlash > 0 || this._state !== 'combat' || this._phase !== 1) return;
    const p = this._cfg.sniperPhase;
    const c = Math.cos(this._angle), s = Math.sin(this._angle);
    const noseX = this.x + c * GUN_LX - s * GUN_LY;
    const noseY = this.y + s * GUN_LX + c * GUN_LY;

    if (this._phaseState === 'charge') {
      const t = this._phaseAge / p.chargeWarmup;
      renderer.strokeCircle(noseX, noseY, p.orbStartRadius + t * p.orbGrowth, {
        color: this._cfg.color, lineWidth: p.orbLineWidth, glowBlur: p.orbGlowBlur, glowColor: this._cfg.color,
        alpha: p.orbAlphaMin + t * (1 - p.orbAlphaMin),
      });
    } else if (this._phaseState === 'locked') {
      const t     = this._phaseAge / p.warningDuration;
      const blink = 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * p.lockedBlinkSpeed));
      renderer.strokeCircle(noseX, noseY, p.lockedOrbRadius, {
        color: this._cfg.color, lineWidth: p.lockedOrbLineWidth, glowBlur: p.lockedOrbGlowBlur, glowColor: this._cfg.color,
        alpha: blink,
      });
    }
  }

  /**
   * White "!" warning marker during the sniper phase's locked telegraph —
   * WaveManager's `_renderSniperExtras` already calls `renderExtras?.()` on
   * every enemy unconditionally each frame, so this needs no extra wiring.
   */
  renderExtras(renderer) {
    if (this._state !== 'combat' || this._phase !== 1 || this._phaseState !== 'locked') return;
    const p     = this._cfg.sniperPhase;
    const t     = this._phaseAge / p.warningDuration;
    const base  = Math.min(1, t * p.warningFadeInSpeed);
    const pulse = base * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * p.warningPulseSpeed)));

    renderer.strokeCircle(this._targetX, this._targetY, p.warningRingRadius, {
      color: '#ffffff', lineWidth: p.warningRingLineWidth, alpha: pulse * p.warningRingAlphaMult,
    });
    renderer.strokeCircle(this._targetX, this._targetY, p.warningDotRadius, {
      color: '#ffffff', lineWidth: p.warningDotLineWidth, glowBlur: p.warningDotGlowBlur, glowColor: '#ffffff', alpha: pulse,
    });
    renderer.drawText('!', this._targetX, this._targetY - p.warningLabelOffset, {
      font: p.warningLabelFont, color: '#ffffff', glowBlur: p.warningLabelGlowBlur, glowColor: '#ffffff', alpha: pulse,
    });
  }

  /**
   * Standalone render — flame → hull → cannon nubs → core. WaveManager calls
   * this directly (see `_renderIndividualEnemies`) since only one boss is
   * ever on screen at once, unlike the batched Scout/Rocketeer/Sniper hulls.
   */
  render(renderer) {
    this.renderFlame(renderer);
    renderHull(renderer, this, BOSS_HULL_PTS);
    this._renderCannons(renderer);
    this.renderCore(renderer);
  }
}
