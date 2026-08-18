/**
 * ZigzagBoss.js
 * Boss #8 — "Zigzag". The first TRIANGULAR hull (see ZIGZAG_HULL_PTS below —
 * a plain equilateral triangle, not a reskin of any existing enemy, same
 * "original hull" lineage as Spiral/Tetra/Nova/Pulsor), holding its firing
 * spot near the top of the arena (`restY`) but no longer camped there for
 * the entire fight — see 'repositioning' below.
 *
 * A simple 3-mode loop (`_mode`), driven by a shot COUNT rather than a
 * shared elapsed-time clock the way Tetra/Nova/Pulsor's phase1/phase2 loops
 * are:
 *
 *   'firing' — hull spins continuously (`rotationSpeed`) and fires one
 *   bullet (ZigzagBullets.js) from EACH of its 3 sides simultaneously every
 *   `bullet.fireInterval` seconds (the same "N shots evenly spaced around
 *   rotation" fire-from-facing idiom Tetra's 4 sides/Nova's 5 sides use,
 *   just 3 here) — until `bulletLimit` shots have fired, then moves to
 *   'cooldown'.
 *
 *   'cooldown' — stops firing (still spinning) for `cooldownDuration`
 *   seconds — a breathing-room beat — then either relocates
 *   ('repositioning', a `repositionChance` roll) or goes straight back to
 *   'firing' with a clean bullet count.
 *
 *   'repositioning' — glides to a fresh point within
 *   `repositionMarginX`/`repositionYMin`/`repositionYMax`, eased with
 *   core/animation.js's easeOutCubic — the same technique SpiralBoss's own
 *   phase-1 repositioning uses — still spinning throughout, then resumes
 *   'firing' from the new spot. This is what keeps the fight from being a
 *   single fixed turret for its whole duration.
 *
 * Ringed with 3 cannon barrels (`_renderCannons`/`_placeCannon`) rather than
 * a plain smooth edge — same "make it read as the actual muzzle" idiom
 * PulsorBoss's own `_renderCannons` uses. Rendered behind the hull, one per
 * fire direction, rotating with it. Bullets spawn from the barrel's outer
 * TIP (`MUZZLE + cfg.cannon.len`, see `_updateFiring`), not the bare hull
 * edge, so every shot visibly leaves a muzzle instead of appearing to spawn
 * out of the hull's surface.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared
 * EnemyCombat.js functions every other boss/enemy class uses — see that
 * file's header for why those are plain functions rather than a base class.
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';
import { applyHit, tickDeathState, stepEntryGlide, renderHull } from './EnemyCombat.js';

const S = Config.boss.zigzag.size; // circumradius — center-to-vertex distance
// Apothem — center-to-edge-midpoint distance, used as the fire-origin
// radius so shots visibly originate from each SIDE, not each corner.
const MUZZLE = S * Math.cos(Math.PI / 3);

// A plain equilateral triangle. Vertices are offset by 60° from the fire
// directions (0°/120°/240°, see _fireDirection) so each EDGE's midpoint —
// not each corner — sits exactly on one of those 3 directions, the same
// "corners at the diagonals so edges land on the fire angles" trick
// TETRA_HULL_PTS uses for its own 4-sided hull.
const ZIGZAG_HULL_PTS = [];
for (let k = 0; k < 3; k++) {
  const a = k * (Math.PI * 2 / 3) + Math.PI / 3;
  ZIGZAG_HULL_PTS.push([Math.cos(a) * S, Math.sin(a) * S]);
}

export class ZigzagBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.zigzag.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.zigzag;

    this.x = vW / 2;
    this.y = -S;
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

    // Combat sub-state loop — see class doc.
    this._mode    = 'firing'; // 'firing' -> 'cooldown' -> ('repositioning' ->) 'firing' ...
    this._modeAge = 0;

    this._bulletsFired = 0;
    this._fireTimer    = 0;

    // Repositioning glide origin/target — real values assigned by
    // _beginReposition once a cooldown beat rolls to relocate.
    this._moveFromX = this.x; this._moveFromY = this._restY;
    this._moveToX   = this.x; this._moveToY   = this._restY;

    // Pre-allocated, mutated in place every frame by _placeCannon — never
    // reallocated, same convention PulsorBoss's own `_cannonPaths` uses.
    // Always exactly 3 (one per fire direction), unlike Pulsor's variable
    // count, so no separate pool-size constant is needed.
    this._cannonPaths = Array.from({ length: 3 }, () => ({
      points: [[0, 0], [0, 0], [0, 0], [0, 0]], closed: true,
    }));
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
   * @param {number} playerX @param {number} playerY  unused — Zigzag never
   *   aims at the player (it fires along its own rotation), kept only so
   *   every boss class shares the same generic update() signature
   * @param {{ fireZigzagBullet: (ox:number,oy:number,angle:number)=>void }} ctx
   */
  update(dt, playerX, playerY, ctx) {
    const cfg = this._cfg;
    this._stateAge += dt;
    if (tickDeathState(this, dt)) return;

    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'combat');
      return;
    }

    this._modeAge += dt;

    if      (this._mode === 'firing')   this._updateFiring(dt, ctx);
    else if (this._mode === 'cooldown') this._updateCooldown(dt);
    else                                 this._updateReposition(dt);
  }

  /** Spins continuously, fires one bullet from EACH of the 3 hull sides every `bullet.fireInterval` seconds, until `bulletLimit` shots have gone out. */
  _updateFiring(dt, ctx) {
    const cfg = this._cfg;
    this._angle += dt * cfg.rotationSpeed;

    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      // Spawn from the cannon barrel's outer TIP, not the bare hull edge —
      // see class doc — so shots visibly leave a muzzle.
      const muzzleR = MUZZLE + cfg.cannon.len;
      for (let k = 0; k < 3; k++) {
        const a  = this._fireDirection(k);
        const ox = this.x + Math.cos(a) * muzzleR;
        const oy = this.y + Math.sin(a) * muzzleR;
        ctx.fireZigzagBullet(ox, oy, a);
      }
      this._bulletsFired += 3;
      this._fireTimer += cfg.bullet.fireInterval;
    }

    if (this._bulletsFired >= cfg.bulletLimit) {
      this._mode = 'cooldown';
      this._modeAge = 0;
    }
  }

  /** The kth (0-2) of the hull's 3 side directions, in the hull's current rotation. */
  _fireDirection(k) {
    return this._angle + k * (Math.PI * 2 / 3);
  }

  /** Still spinning, not firing — a breathing-room beat before either relocating or the next 'firing' burst. */
  _updateCooldown(dt) {
    const cfg = this._cfg;
    this._angle += dt * cfg.rotationSpeed;

    if (this._modeAge >= cfg.cooldownDuration) {
      if (Math.random() < cfg.repositionChance) this._beginReposition();
      else this._resumeFiring();
    }
  }

  /** Pick a new random spot within the arena bounds and start gliding there — see class doc. */
  _beginReposition() {
    const { width: vW } = Config.virtual;
    const cfg = this._cfg;
    this._moveFromX = this.x;
    this._moveFromY = this.y;
    this._moveToX = cfg.repositionMarginX + Math.random() * (vW - cfg.repositionMarginX * 2);
    this._moveToY = cfg.repositionYMin + Math.random() * (cfg.repositionYMax - cfg.repositionYMin);
    this._mode = 'repositioning';
    this._modeAge = 0;
  }

  /** Still spinning, gliding from `_moveFromX/Y` to `_moveToX/Y`, eased with easeOutCubic — resumes firing from the new spot on arrival. */
  _updateReposition(dt) {
    const cfg = this._cfg;
    this._angle += dt * cfg.rotationSpeed;

    const t = Math.min(this._modeAge / cfg.repositionDuration, 1);
    const eased = easeOutCubic(t);
    this.x = this._moveFromX + (this._moveToX - this._moveFromX) * eased;
    this.y = this._moveFromY + (this._moveToY - this._moveFromY) * eased;

    if (t >= 1) {
      this._restX = this.x;
      this._restY = this.y;
      this._resumeFiring();
    }
  }

  /** Reset the shot counter and drop back into 'firing' — shared by both the "didn't reposition" and "just arrived" paths out of cooldown. */
  _resumeFiring() {
    this._mode = 'firing';
    this._modeAge = 0;
    this._bulletsFired = 0;
    this._fireTimer = 0;
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /** Cannon barrels (behind, so their bases tuck under the hull), then the hull, then the pulsing core. WaveManager calls this directly (see `_renderIndividualEnemies`) since only one boss is ever on screen at once. */
  render(renderer) {
    this._renderCannons(renderer);
    renderHull(renderer, this, ZIGZAG_HULL_PTS);
    this._renderCore(renderer);
  }

  /**
   * Cannon barrels at the 3 fire directions — a live preview of exactly
   * where the next volley will leave from, same "draw the trailing bits
   * first" trick DrifterEnemy uses for its tentacles / PulsorBoss uses for
   * its own `_renderCannons`.
   */
  _renderCannons(renderer) {
    const cfg   = this._cfg;
    const flash = this._hitFlash > 0;
    for (let k = 0; k < 3; k++) this._placeCannon(this._fireDirection(k), k);
    renderer.fillStrokePaths(this._cannonPaths, {
      fillColor:   flash ? '#ffffff' : cfg.fillColor,
      strokeColor: flash ? '#ffffff' : cfg.color,
      lineWidth:   cfg.cannon.lineWidth,
      glowBlur:    flash ? cfg.hitGlowBlur : cfg.cannon.glowBlur,
      glowColor:   flash ? '#ffffff' : cfg.color,
      singleStroke: true,
    });
  }

  /**
   * Writes one barrel quad (tapering slightly wider at the muzzle) into
   * `this._cannonPaths[idx]`, from the hull rim (`MUZZLE`) outward along
   * `angle` — same shape PulsorBoss._placeCannon builds.
   */
  _placeCannon(angle, idx) {
    const c = this._cfg.cannon;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const perpX = -dirY, perpY = dirX;

    const innerX = this.x + dirX * MUZZLE, innerY = this.y + dirY * MUZZLE;
    const outerX = this.x + dirX * (MUZZLE + c.len), outerY = this.y + dirY * (MUZZLE + c.len);

    const pts = this._cannonPaths[idx].points;
    pts[0][0] = innerX - perpX * c.baseHalfWidth; pts[0][1] = innerY - perpY * c.baseHalfWidth;
    pts[1][0] = innerX + perpX * c.baseHalfWidth; pts[1][1] = innerY + perpY * c.baseHalfWidth;
    pts[2][0] = outerX + perpX * c.tipHalfWidth;  pts[2][1] = outerY + perpY * c.tipHalfWidth;
    pts[3][0] = outerX - perpX * c.tipHalfWidth;  pts[3][1] = outerY - perpY * c.tipHalfWidth;
  }

  /** Pulsing core-ring glow at the center — stands in for an engine flame, same reasoning as every other original-hull boss (this hull has no thruster). */
  _renderCore(renderer) {
    const cfg   = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, cfg.coreRadius, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
  }
}
