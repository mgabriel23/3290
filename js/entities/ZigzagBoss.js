/**
 * ZigzagBoss.js
 * Boss #8 — "Zigzag". The first TRIANGULAR hull (see ZIGZAG_HULL_PTS below —
 * a plain equilateral triangle, not a reskin of any existing enemy, same
 * "original hull" lineage as Spiral/Tetra/Nova/Pulsor), parked at a single
 * FIXED spot dead center just under both health bars (`restY`) for the
 * entire fight — it never patrols or otherwise leaves that spot.
 *
 * A simple 2-state loop (`_mode`), driven by a shot COUNT rather than a
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
 *   seconds — a breathing-room beat — then goes back to 'firing' with a
 *   clean bullet count, looping for the rest of the fight.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared
 * EnemyCombat.js functions every other boss/enemy class uses — see that
 * file's header for why those are plain functions rather than a base class.
 */
import { Config } from '../core/Config.js';
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
    this._mode    = 'firing'; // 'firing' -> 'cooldown' -> 'firing' ...
    this._modeAge = 0;

    this._bulletsFired = 0;
    this._fireTimer    = 0;
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

    if (this._mode === 'firing') this._updateFiring(dt, ctx);
    else                          this._updateCooldown(dt);
  }

  /** Spins continuously, fires one bullet from EACH of the 3 hull sides every `bullet.fireInterval` seconds, until `bulletLimit` shots have gone out. */
  _updateFiring(dt, ctx) {
    const cfg = this._cfg;
    this._angle += dt * cfg.rotationSpeed;

    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      for (let k = 0; k < 3; k++) {
        const a  = this._fireDirection(k);
        const ox = this.x + Math.cos(a) * MUZZLE;
        const oy = this.y + Math.sin(a) * MUZZLE;
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

  /** Still spinning, not firing — a breathing-room beat before the next 'firing' burst. */
  _updateCooldown(dt) {
    const cfg = this._cfg;
    this._angle += dt * cfg.rotationSpeed;

    if (this._modeAge >= cfg.cooldownDuration) {
      this._mode = 'firing';
      this._modeAge = 0;
      this._bulletsFired = 0;
      this._fireTimer = 0;
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

  /** Hull, then the pulsing core. WaveManager calls this directly (see `_renderIndividualEnemies`) since only one boss is ever on screen at once. */
  render(renderer) {
    renderHull(renderer, this, ZIGZAG_HULL_PTS);
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
}
