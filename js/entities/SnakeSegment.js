/**
 * SnakeSegment.js
 * One body piece of Boss #4 "Snake" (see SnakeBoss.js for the chain-level
 * doc — this file is deliberately just the lightweight, hittable "body")
 * — every entry behind the head (SnakeBoss's own lane 0) is one of these,
 * pushed into WaveManager's enemy list as its own independently hittable
 * `type: 'snakeSegment'` entity, same as any other enemy.
 *
 * Position: rather than tracking its own independent physics like a
 * regular DrifterEnemy clone, a segment CHASES a target path-distance
 * (`_targetU`) the head recomputes and pushes into every live segment once
 * per frame via `setTarget` (see SnakeBoss.update) — `_u` moves toward
 * `_targetU` at `catchUpSpeed`, capped so it can't overshoot. In steady
 * state (no deaths) `_targetU` advances at exactly the formation's normal
 * `speed`, so this reads identically to a regular fixed-offset conga-line
 * clone.
 *
 * `_lane` is this segment's own distance from the head, in `spacing`
 * units — normally equal to its position in line, but NOT purely a
 * function of array order the way a regular Drifter formation's is. When
 * a segment elsewhere in the chain dies, the head increments the `_lane`
 * of every segment currently IN FRONT of (closer to the head than) the
 * dead one — those segments visibly retreat backward by one spacing unit
 * to fill the gap, cascading toward the head. Everything from the dead
 * segment's lane back to the tail is untouched. `catchUpSpeed` (faster
 * than `speed`) is what makes that lane jump read as a visible "step back"
 * rather than an instant teleport (see SnakeBoss.update's own doc for the
 * exact reassignment algorithm). If the head itself has died, `headAlive`
 * goes false and the segment simply falls back to advancing `_u` under its
 * own steam (no target, no chasing) — a "headless" body segment keeps
 * slithering along the same shared path rather than freezing in place.
 *
 * Attack: only a segment whose spawn-time lane was a multiple of
 * `Config.boss.snake.attackInterval` (~1 in 10, fixed forever at spawn —
 * NOT re-rolled as `_lane` later changes) ever fires — a direct shot at
 * the player (no tentacle wind-up, unlike a regular Drifter's lash)
 * through the same shared DrifterProjectiles pool every Drifter-family
 * enemy already uses. Deliberately simplified from DrifterEnemy's own
 * tentacle animation/lash-wind-up: at up to ~17 simultaneous attackers,
 * the full per-clone tentacle machinery would be both a visual and a
 * performance step too far for something this numerous.
 *
 * Rendering: a segment does NOT render itself — SnakeBoss batches every
 * live, visible segment's body hull into its own pre-allocated pools and
 * draws them in one or two `fillStrokePaths` calls per frame (see
 * SnakeBoss.render), the same shadow-blur-flattening trick WaveManager
 * already uses for Scout/Rocketeer/Sniper/Drifter — at up to 175
 * instances, an individual glow pass per segment would be far too expensive.
 */
import { Config } from '../core/Config.js';
import { sampleSweeperPath } from './DrifterEnemy.js';
import { applyHit, tickDeathState } from './EnemyCombat.js';

export class SnakeSegment {
  /**
   * @param {SnakeBoss} head  the chain's front segment — read each frame for `.alive`
   * @param {object} path  the shared Sweeper path (DrifterEnemy.createSweeperPath())
   * @param {number} initialLane  this segment's distance-from-head (in `spacing` units) the moment it was created — seeds `_lane` AND fixes `_isAttacker` forever, even as `_lane` itself later changes (see class doc)
   * @param {number} u  initial path-distance — always `headU - initialLane * spacing` at the moment of creation, for both the initial formation and later mid-fight growth
   * @param {number} healthBonus  added to Config.boss.snake.segment.health — WaveManager/SnakeBoss scale this by level, same convention as every regular enemy
   */
  constructor(head, path, initialLane, u, healthBonus) {
    const cfg = Config.boss.snake;
    this._cfg  = cfg;
    this._type = 'snakeSegment';
    this._head = head;
    this._path = path;

    this._u = u;
    this._targetU = u;
    this._lane = initialLane; // mutated by SnakeBoss.update when a segment ahead of this one dies — see class doc
    this._isAttacker = initialLane % cfg.attackInterval === 0;

    const start = sampleSweeperPath(path, u);
    this.x = start.x;
    this.y = start.y;
    this._angle = start.heading;
    this._cosA = Math.cos(this._angle);
    this._sinA = Math.sin(this._angle);
    this.alive = true;
    this._visible = false; // read directly by SnakeBoss.render — see class doc

    this._health   = cfg.segment.health + healthBonus;
    this._hitFlash = 0;
    this._dying    = false;
    this._age      = Math.random() * Math.PI * 2; // phase offset for the attacker pulse marker

    this._fireTimer = this._isAttacker
      ? cfg.fireMinInterval + Math.random() * (cfg.fireMaxInterval - cfg.fireMinInterval)
      : 0;
  }

  get type()      { return this._type;  }
  get angle()     { return this._angle; }
  get hitRadius() { return this._cfg.hitRadius; }

  /** Called once per frame by the head, before any segment's own update() runs this frame — see class doc. */
  setTarget(u) { this._targetU = u; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY
   * @param {(ox:number,oy:number,tx:number,ty:number,color:string)=>void} fireDrifterProjectile
   */
  update(dt, playerX, playerY, fireDrifterProjectile) {
    const cfg = this._cfg;
    this._age += dt;
    if (tickDeathState(this, dt)) return;

    if (this._head.alive) {
      const diff = this._targetU - this._u;
      const maxStep = cfg.catchUpSpeed * dt;
      this._u += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
    } else {
      this._u += cfg.speed * dt; // orphaned — keep slithering under its own steam
    }

    const { x, y, heading } = sampleSweeperPath(this._path, this._u);
    this.x = x;
    this.y = y;
    this._angle = heading;
    this._cosA = Math.cos(heading);
    this._sinA = Math.sin(heading);

    const { width: vW, height: vH } = Config.virtual;
    const margin = 40;
    this._visible = x > -margin && x < vW + margin && y > -margin && y < vH + margin;
    if (y > vH + margin) { this.alive = false; return; } // sunk past the bottom for good

    if (!this._isAttacker || !this._visible) return;

    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      // Only actually fire if the player is roughly beneath this segment —
      // otherwise withhold and re-check shortly rather than firing blind,
      // same fairness convention every Drifter-family lash already uses.
      if (Math.abs(playerX - x) > cfg.engageRangeX) {
        this._fireTimer = 0.3;
        return;
      }
      fireDrifterProjectile(x, y, playerX, playerY, cfg.color);
      this._fireTimer = cfg.fireMinInterval + Math.random() * (cfg.fireMaxInterval - cfg.fireMinInterval);
    }
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }
}
