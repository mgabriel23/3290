/**
 * SpiralBoss.js
 * Boss #2 — "Spiral". Spawned by WaveManager on every OTHER boss-level
 * encounter (level 14, 42, ... under Survival Mode's canonical schedule —
 * see Config.bossSchedule[mode].roster and WaveManager's boss-selection
 * lookup in its constructor). An original radial-turret/orb
 * silhouette (see SPIRAL_HULL_PTS below — a symmetric N-pointed star/gear),
 * unlike Boss #1's giant-Scout reskin: no other enemy in the game is
 * circular, so this reads as a wholly different kind of threat.
 *
 * Attack: continuously spins in place (`_angle`, driven by `rotationSpeed`
 * — this doubles as the hull's render rotation AND the current fire
 * direction, so the two always match visually) while firing `fireDirections`
 * slow bullets every `fireInterval` seconds, evenly spaced around that
 * current angle (e.g. 4 → one every 90°) — aimed along whatever directions
 * the turret currently faces, NOT at the player, unlike every other enemy/
 * boss in the game. Because the fire angle keeps rotating tick to tick, the
 * individual straight-line bullets (SpiralBullets.js) fan out into
 * `fireDirections` interleaved visible spiral arms as they travel outward —
 * no curved-path bullet math is needed, the spiral shape emerges purely
 * from firing straight shots at a slightly different angle each tick.
 * After `fireDuration` seconds of that it stops, glides to a new random
 * spot within the play area (`_beginReposition`, eased with
 * core/animation.js's easeOutCubic — the same curve Enemy.js's own
 * mid-fight repositioning uses), and resumes firing from there.
 *
 * Hit/death-flash/entry-glide rendering reuse the same shared
 * EnemyCombat.js functions every other enemy class uses — see that file's
 * header for why those are plain functions rather than a base class. No
 * engine flame (unlike the ship-family bosses/enemies) — a hovering orb
 * has no thruster; a pulsing core-ring glow stands in for one instead.
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';
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
    // current fire direction (see class doc).
    this._angle = 0;

    this._state     = 'entering'; // 'entering' -> 'firing' <-> 'repositioning'
    this._stateAge  = 0;
    this._fireTimer = 0; // seconds remaining until the next bullet

    // Repositioning origin/target — real values assigned by
    // _beginReposition once the first firing spell ends.
    this._moveFromX = this.x; this._moveFromY = this._restY;
    this._moveToX   = this.x; this._moveToY   = this._restY;
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

    // Always spinning — even mid-reposition — so it never reads as inert.
    this._angle += dt * cfg.rotationSpeed;

    if (this._state === 'entering') {
      stepEntryGlide(this, cfg, dt, 'firing');
      if (this._state === 'firing') this._fireTimer = 0; // fire almost immediately on arrival
      return;
    }

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
          const a  = this._angle + k * (Math.PI * 2 / n);
          const ox = this.x + Math.cos(a) * OUTER_R;
          const oy = this.y + Math.sin(a) * OUTER_R;
          fire.fireSpiralBullet(ox, oy, a);
        }
        this._fireTimer += cfg.fireInterval;
      }
      if (this._stateAge >= cfg.fireDuration) this._beginReposition();

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
    }
  }

  /** Pick a new random spot within the play area and start gliding there. */
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

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /**
   * Standalone render — core glow, then hull. WaveManager calls this
   * directly (see WaveManager._renderIndividualEnemies) since only one
   * boss is ever on screen at once.
   */
  render(renderer) {
    const cfg = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, INNER_R * 0.7, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
    renderHull(renderer, this, SPIRAL_HULL_PTS);
  }
}
