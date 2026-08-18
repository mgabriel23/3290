/**
 * ElectronBoss.js
 * Boss #10 — "Electron". An original hull (see ELECTRON_HULL_PTS below — a
 * sharp 4-point spark/sparkle star, alternating outer spike-tip and inner
 * core radius around a full circle, same construction as Spiral's own
 * N-pointed star just half the spikes and a tighter inner ratio for a
 * sharper "spark" read instead of Spiral's rounder gear), same "original
 * hull" lineage as Spiral/Tetra/Nova/Pulsor/Zigzag/Phoenix. No engine flame
 * (a floating spark has no thruster) — a pulsing core-ring glow stands in
 * for one, same reasoning as every other turret-style original hull.
 *
 * A repeating TIMED loop between THREE phases (`_phase`/`_phaseAge`), same
 * shape as PhoenixBoss's own 3-phase loop, but unlike Phoenix's
 * shared-rest-point design (every phase reachable from the rest point),
 * ONLY phase 3 ever leaves the rest point here — phases 1/2 both hold
 * perfectly still at (restX, restY):
 *
 *   phase 1 — "Spark Barrage" (`Config.boss.electron.phase1Duration`
 *   seconds): tracks the player (`_angle = atan2(-dx, dy)`, same convention
 *   Nova/Scout/BossEnemy already use) and, every `bolt.fireInterval`
 *   seconds, fires from ALL FOUR of the hull's outer spike tips at once
 *   (`_updateBarragePhase`) — FRONT fires one round bolt (ElectronBolts.js)
 *   straight at the player's CURRENT position, no lead prediction, a
 *   moderate cadence but FAST travel speed (unlike Tetra/Spiral/Nova's own
 *   "slow bullet" bosses); LEFT/RIGHT each fire a seed (ElectronSeeds.js)
 *   outward along their own side direction that detonates into a ring of
 *   shrapnel (ElectronShards.js); BACK fires one bolt (ElectronArcBolt.js)
 *   also straight at the player, but bouncing off the left/right screen
 *   edges instead of culling there. See `Config.boss.electron`'s own doc
 *   for the full tip-by-tip breakdown.
 *
 *   phase 2 — "Chain Lash" (`chain`): fires `chain.chainCount` twin-sphere
 *   bolts (ElectronChains.js — two linked orbs, `chain.spacing` apart,
 *   oriented perpendicular to their own travel direction), `chain.
 *   chainInterval` seconds apart, each launched from the boss's OWN current
 *   (x, y) straight at the player's CURRENT position — same "aim once, no
 *   lead" idiom as phase 1's bolt. Contact with either orb OR the link
 *   between them (redrawn with a fresh random jitter every frame for a
 *   crackling look — see ElectronChains.render) damages the player and
 *   consumes the whole bolt (see ElectronChains.checkHit). Ends
 *   `chain.settleDuration` seconds after the last bolt fires.
 *
 *   phase 3 — "Overcharge" (`surge`): the ONLY phase this boss actually
 *   moves — a wandering patrol (`moveSpeed`, seeking a fresh random point
 *   every time it arrives at its last one — see `_pickWanderTarget`/
 *   `_updateRoam` — rather than drifting on a random heading, so it actually
 *   covers the whole roam area instead of loitering near wherever phase 3
 *   started) within `boundMarginX`/`boundYMin`/`boundYMax`, which
 *   deliberately cover nearly the whole arena, the same space the player
 *   themselves can move in — the only real limit is `boundYMax` keeping it
 *   clear of the barrier below — instead of the fixed-point hold of phases
 *   1/2. While roaming it repeatedly "surges": every `surge.interval` seconds it
 *   telegraphs (a harmless growing ring, `surge.telegraphDuration` seconds),
 *   goes live for `surge.activeDuration` seconds dealing `surge.damage` to
 *   the player if they're within `surge.radius` — opting into
 *   WaveManager.checkPlayerHit's existing `.contactDamage` circle-test hook
 *   the same way Bouncer/Phoenix's charge already do, just paired with a
 *   `.contactRadius` getter (a small WaveManager extension — see that
 *   method's own doc) so the AOE can reach well past `hitRadius` without
 *   inflating the hitbox player bullets test against — then fades out over
 *   `surge.recoverDuration` seconds before the next telegraph. Once
 *   `phase3Duration` total seconds have passed, it smoothstep-eases back to
 *   (restX, restY) over `returnDuration` seconds (same technique Phoenix's
 *   own charge-phase 'recover' beat uses) before phase 1 begins again.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared EnemyCombat.js
 * functions every other boss/enemy class uses — see that file's header for
 * why those are plain functions rather than a base class.
 */
import { Config } from '../core/Config.js';
import { applyHit, tickDeathState, stepEntryGlide, renderHull } from './EnemyCombat.js';

const ES    = Config.boss.electron.size;
const INNER = ES * Config.boss.electron.innerRadiusRatio;

// A sharp 4-point spark/sparkle star — alternating outer (spike tip) and
// inner (core ring) points evenly spaced around a full circle, starting at
// local (0, +ES) so that spike lands "toward the player" once `_angle`
// (atan2(-dx, dy)) rotates it — same local +Y convention Nova's own hull
// vertex uses. Not derived from any existing enemy's silhouette — original
// to this boss, same lineage as SPIRAL_HULL_PTS/TETRA_HULL_PTS/etc.
const ELECTRON_HULL_PTS = [];
for (let j = 0; j < 8; j++) {
  const angle = Math.PI / 2 + j * (Math.PI / 4);
  const r = (j % 2 === 0) ? ES : INNER;
  ELECTRON_HULL_PTS.push([r * Math.cos(angle), r * Math.sin(angle)]);
}

// The hull's 4 outer spike-tip anchors (local space) — phase 1 fires a
// different attack from each one every volley (see class doc/
// _updateBarragePhase) so the barrage actually reads as coming from all 4
// points of the star, not one bolt out of its center. Same local-vertex-as-
// attachment-point idiom as PhoenixBoss's own BEAK_LX/LY/TAIL_LX/LY: FRONT
// (local +Y) is "toward the player" once `_angle` rotates it, BACK (local
// -Y) is directly opposite, LEFT/RIGHT (local -X/+X) are perpendicular.
const FRONT_LY = ES, BACK_LY = -ES, SIDE_LX = ES;

export class ElectronBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.electron.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.electron;

    this.x = vW / 2;
    this.y = -ES;
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

    // Phase/combat sub-state — real values assigned by _enterBarragePhase
    // once entry finishes (see update()'s 'entering' branch); placeholders
    // here just keep every field present from construction.
    this._phase    = 1; // 1 (bolt barrage), 2 (chain lash), 3 (roam + surge) — loops
    this._phaseAge = 0; // seconds since the CURRENT phase began

    this._fireTimer = 0; // phase 1 bolt cadence

    this._chainsFired = 0; // phase 2 only
    this._chainTimer  = 0;

    // Phase 3 only — the point the boss is currently gliding toward (see
    // _pickWanderTarget/_updateRoam), and the surge pulse's own sub-state
    // machine ('idle' -> 'telegraph' -> 'active' -> 'recover' -> 'idle' ...,
    // or 'returning' once phase3Duration elapses).
    this._wanderTargetX = 0;
    this._wanderTargetY = 0;
    this._surgeState = 'idle';
    this._surgeAge   = 0;
    this._returnFromX = 0;
    this._returnFromY = 0;
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
   * Opts into WaveManager.checkPlayerHit's generic contact-damage check —
   * same hook Bouncer/Phoenix's charge already use — but ONLY while a phase-3
   * surge pulse is actually live, not during its telegraph or fade-out.
   */
  get contactDamage() {
    return (this._phase === 3 && this._surgeState === 'active') ? this._cfg.surge.damage : 0;
  }
  /**
   * Paired with `contactDamage` — the AOE's own reach, which is well past
   * this boss's `hitRadius` (the hull's real size, still what player bullets
   * test against). See WaveManager.checkPlayerHit's own doc for why this is
   * a separate getter instead of just inflating `hitRadius`.
   */
  get contactRadius() { return this._cfg.surge.radius; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY
   * @param {{
   *   fireElectronBolt: (ox:number,oy:number,tx:number,ty:number)=>void,
   *   fireElectronSeed: (ox:number,oy:number,angle:number)=>void,
   *   fireElectronArc: (ox:number,oy:number,tx:number,ty:number)=>void,
   *   fireElectronChain: (ox:number,oy:number,tx:number,ty:number)=>void,
   * }} fire
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge += dt;
    if (tickDeathState(this, dt)) return;

    if (this._state === 'entering') {
      const dx = playerX - this.x, dy = playerY - this.y;
      this._angle = Math.atan2(-dx, dy);
      stepEntryGlide(this, cfg, dt, 'combat');
      if (this._state === 'combat') this._enterBarragePhase();
      return;
    }

    this._phaseAge += dt;

    if      (this._phase === 1) this._updateBarragePhase(dt, playerX, playerY, fire);
    else if (this._phase === 2) this._updateChainPhase(dt, playerX, playerY, fire.fireElectronChain);
    else                        this._updateSurgePhase(dt, playerX, playerY);
  }

  _enterBarragePhase() {
    this._phase    = 1;
    this._phaseAge = 0;
    this.x = this._restX;
    this.y = this._restY;
    this._fireTimer = 0; // fire almost immediately on arrival
  }

  _enterChainPhase() {
    this._phase      = 2;
    this._phaseAge    = 0;
    this._chainsFired = 0;
    this._chainTimer  = 0; // fire the first chain almost immediately
  }

  _enterSurgePhase() {
    this._phase    = 3;
    this._phaseAge = 0;
    this._pickWanderTarget();
    this._setSurgeState('idle');
  }

  _setSurgeState(name) { this._surgeState = name; this._surgeAge = 0; }

  /**
   * Phase 1 — tracks the player, every `bolt.fireInterval` seconds fires
   * from all 4 hull spike tips at once (see class doc), advances to phase 2
   * after `phase1Duration`.
   */
  _updateBarragePhase(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    const dx = playerX - this.x, dy = playerY - this.y;
    this._angle = Math.atan2(-dx, dy);

    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      const cos = Math.cos(this._angle), sin = Math.sin(this._angle);
      // World position of each local (lx, ly) tip anchor — same rotation
      // math as EnemyCombat's shared idiom / PhoenixBoss's own beak/tail
      // anchors: world = (x,y) + rotate(_angle) * (lx, ly).
      const frontX = this.x - sin * FRONT_LY, frontY = this.y + cos * FRONT_LY;
      const backX  = this.x - sin * BACK_LY,  backY  = this.y + cos * BACK_LY;
      const leftX  = this.x - cos * SIDE_LX,  leftY  = this.y - sin * SIDE_LX;
      const rightX = this.x + cos * SIDE_LX,  rightY = this.y + sin * SIDE_LX;

      fire.fireElectronBolt(frontX, frontY, playerX, playerY);
      fire.fireElectronArc(backX, backY, playerX, playerY);
      // Rotated local +X is exactly the world direction (cos(_angle),
      // sin(_angle)) — see class doc — so the right tip fires straight
      // along `_angle` itself, and the left tip along its opposite.
      fire.fireElectronSeed(rightX, rightY, this._angle);
      fire.fireElectronSeed(leftX, leftY, this._angle + Math.PI);

      this._fireTimer += cfg.bolt.fireInterval;
    }

    if (this._phaseAge >= cfg.phase1Duration) this._enterChainPhase();
  }

  /** Phase 2 — fires `chain.chainCount` bolts from the boss's own current position at the player, advances to phase 3 `chain.settleDuration` seconds after the last one launches. */
  _updateChainPhase(dt, playerX, playerY, fireChain) {
    const cfg = this._cfg.chain;
    const dx = playerX - this.x, dy = playerY - this.y;
    this._angle = Math.atan2(-dx, dy);

    if (this._chainsFired < cfg.chainCount) {
      this._chainTimer -= dt;
      if (this._chainTimer <= 0) {
        fireChain(this.x, this.y, playerX, playerY);
        this._chainsFired++;
        this._chainTimer += cfg.chainInterval;
      }
    }

    const doneAt = (cfg.chainCount - 1) * cfg.chainInterval + cfg.settleDuration;
    if (this._chainsFired >= cfg.chainCount && this._phaseAge >= doneAt) this._enterSurgePhase();
  }

  /** Phase 3 — wanders + periodically surges an AOE pulse, then eases back to the rest point once `phase3Duration` elapses (see `_updateReturn`). */
  _updateSurgePhase(dt, playerX, playerY) {
    const cfg = this._cfg;

    if (this._surgeState === 'returning') {
      this._updateReturn(dt);
      return;
    }

    this._angle += dt * cfg.surgeRotationSpeed;
    this._updateRoam(dt);

    this._surgeAge += dt;
    if (this._surgeState === 'idle') {
      if (this._surgeAge >= cfg.surge.interval) this._setSurgeState('telegraph');
    } else if (this._surgeState === 'telegraph') {
      if (this._surgeAge >= cfg.surge.telegraphDuration) this._setSurgeState('active');
    } else if (this._surgeState === 'active') {
      if (this._surgeAge >= cfg.surge.activeDuration) this._setSurgeState('recover');
    } else { // 'recover'
      if (this._surgeAge >= cfg.surge.recoverDuration) this._setSurgeState('idle');
    }

    if (this._phaseAge >= cfg.phase3Duration) {
      this._returnFromX = this.x;
      this._returnFromY = this.y;
      this._setSurgeState('returning');
    }
  }

  /**
   * Roll a fresh random point anywhere inside the roam bounds
   * (`boundMarginX`/`boundYMin`/`boundYMax` — nearly the whole arena, see
   * class doc) for `_updateRoam` to glide toward next.
   */
  _pickWanderTarget() {
    const cfg = this._cfg;
    const { width: vW } = Config.virtual;
    const xLo = cfg.boundMarginX, xHi = vW - cfg.boundMarginX;
    const yLo = cfg.boundYMin,    yHi = cfg.boundYMax;
    this._wanderTargetX = xLo + Math.random() * (xHi - xLo);
    this._wanderTargetY = yLo + Math.random() * (yHi - yLo);
  }

  /**
   * Straight-line glide toward `_wanderTargetX/Y` at a constant `moveSpeed`,
   * picking a fresh random target once it arrives. Deliberately a seek
   * (not a random-heading drift that only bounces off the bounds when it
   * happens to reach one) — with bounds this large, a drifting random walk
   * mostly wandered near wherever phase 3 started instead of actually
   * covering the arena; seeking a fresh random point every arrival visits
   * the full bounds evenly, including all the way down near the barrier.
   */
  _updateRoam(dt) {
    const cfg = this._cfg;
    const dx = this._wanderTargetX - this.x, dy = this._wanderTargetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < cfg.moveSpeed * dt || dist < 1) {
      this._pickWanderTarget();
      return;
    }
    this.x += (dx / dist) * cfg.moveSpeed * dt;
    this.y += (dy / dist) * cfg.moveSpeed * dt;
  }

  /** Smoothstep-eases from wherever phase 3 ended back to (restX, restY), same technique Phoenix's own charge-phase 'recover' beat uses, then re-enters phase 1. */
  _updateReturn(dt) {
    this._surgeAge += dt;
    const t = Math.min(1, this._surgeAge / this._cfg.returnDuration);
    const ease = t * t * (3 - 2 * t); // smoothstep
    this.x = this._returnFromX + (this._restX - this._returnFromX) * ease;
    this.y = this._returnFromY + (this._restY - this._returnFromY) * ease;
    if (t >= 1) this._enterBarragePhase();
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
    renderHull(renderer, this, ELECTRON_HULL_PTS);
    this._renderCore(renderer);
  }

  /** Pulsing core-ring glow at the center — stands in for an engine flame, same reasoning as every other original-hull boss (this hull has no thruster). */
  _renderCore(renderer) {
    const cfg   = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, cfg.coreRadius, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
  }

  /**
   * Phase-3 surge telegraph/active/recover ring — WaveManager's
   * `_renderSniperExtras` already calls `renderExtras?.()` on every enemy
   * unconditionally each frame, so this needs no extra wiring.
   */
  renderExtras(renderer) {
    if (this._state !== 'combat' || this._phase !== 3) return;
    const cfg = this._cfg.surge;

    if (this._surgeState === 'telegraph') {
      const t = this._surgeAge / cfg.telegraphDuration;
      renderer.strokeCircle(this.x, this.y, cfg.radius * t, {
        color: cfg.color, lineWidth: 2, glowBlur: 10, glowColor: cfg.color, alpha: 0.5 * t,
      });
    } else if (this._surgeState === 'active') {
      const pulse = 0.7 + 0.3 * Math.abs(Math.sin(this._surgeAge * 18));
      renderer.fillEllipse(0, 0, cfg.radius, cfg.radius, {
        x: this.x, y: this.y, fillColor: cfg.color, alpha: 0.10,
      });
      renderer.strokeCircle(this.x, this.y, cfg.radius, {
        color: cfg.color, lineWidth: 3, glowBlur: 18, glowColor: cfg.color, alpha: pulse,
      });
    } else if (this._surgeState === 'recover') {
      const t = 1 - Math.min(1, this._surgeAge / cfg.recoverDuration);
      renderer.strokeCircle(this.x, this.y, cfg.radius, {
        color: cfg.color, lineWidth: 2, glowBlur: 8, glowColor: cfg.color, alpha: 0.3 * t,
      });
    }
  }
}
