/**
 * SnakeBoss.js
 * Boss #4 — "Snake". Spawned by WaveManager on every 4th boss-level
 * encounter (level 32, 64, ... — see Config.boss.roster and WaveManager's
 * boss-selection lookup in its constructor). This class IS the chain's
 * FRONT segment (chain index 0) — the actual boss, with its own health/
 * reward/health-bar, same as every other boss — and also OWNS/coordinates
 * the whole chain behind it (`SnakeSegment.js`, pushed into WaveManager's
 * enemy list as independently-hittable `type: 'snakeSegment'` entities, not
 * tracked as children of this class the way e.g. a Splitter's fragments
 * are children of nothing once spawned).
 *
 * Movement reuses DrifterEnemy.js's own exported Sweeper path/sampler
 * (createSweeperPath/sampleSweeperPath) wholesale — this boss doesn't
 * invent new movement, it's explicitly "an upgraded Sweeper."
 *
 * The chain and its gap-closing: `_chain` is an array of every live
 * segment, THIS HEAD INCLUDED — the head is not a special fixed anchor,
 * it's just chain member 0. Every member (head and body alike) carries its
 * own `_lane` — its distance from the shared leading edge (`_u`, see
 * `update`), in `spacing` units — which is normally just "how far back it
 * started" (0 for the head), but is NOT simply array order: when a BODY
 * segment dies, EVERY member currently IN FRONT of it (smaller `_lane`,
 * the head included) has its `_lane` incremented by one (see the
 * reassignment loop in `update`) — those members visibly retreat backward,
 * cascading toward the front, to fill the vacated slot. Everything from
 * the dead segment's lane back to the tail is left completely alone.
 * Concretely: chain 0(head),1,2,3,4,5 with #3 dying becomes head→1, 1→2,
 * 2→3 (all three shift back one, the head included), while 4 and 5 keep
 * their exact lanes. If instead the very FRONTMOST body segment (lane 1)
 * dies, the head is the only thing in front of it, so the head alone
 * retreats to close that gap — it's the "one in front" the same as any
 * other segment would be, not exempt. Multiple deaths in the same frame
 * are processed one at a time so their cascades correctly compound (a
 * member already pushed back by one death can get pushed back again by
 * another death still further ahead of it). Every frame, each live
 * member's `_lane` (however it currently stands) is what determines its
 * position: `_u - _lane * spacing` — for body segments that's a broadcast
 * TARGET that `SnakeSegment.update`'s own `catchUpSpeed` chase closes in on
 * over the next moment (so a lane change reads as a visible "step back",
 * not an instant jump); for the head it's used directly as this frame's
 * actual rendered/hittable position, no chase needed.
 *
 * Growth: starts at `initialSegments` (matching a regular Sweeper's own
 * formation size) and, every `growthInterval` seconds while under
 * `maxSegments` (175), appends `growthBatchSize` fresh tail segments at
 * the next unused lane (`_nextLane`, which only ever increases — it does
 * NOT reuse lanes vacated by the backward-shift mechanic above) — queued
 * in `_pendingSummons` and drained by WaveManager via the exact same
 * generic `drainSummons()` interface Bouncer Primal's on-hit summons
 * already use (see WaveManager.handleBulletHit and its per-frame drain in
 * update()), just triggered by time here instead of a hit. The very first
 * drain (called once by WaveManager._spawnNext right after construction)
 * collects the INITIAL formation the same way.
 *
 * Attack: this head counts as lane 0, which is trivially a multiple of
 * `attackInterval`, so it fires the same direct shot every attacker
 * segment does (see SnakeSegment.js's own doc for why that's simplified
 * from a regular Drifter's full tentacle-lash).
 */
import { Config } from '../core/Config.js';
import { createSweeperPath, sampleSweeperPath, BODY_PTS } from './DrifterEnemy.js';
import { SnakeSegment } from './SnakeSegment.js';
import { applyHit, tickDeathState } from './EnemyCombat.js';

export class SnakeBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.snake.health (this head's own) — WaveManager scales this by level, same convention as every regular enemy
   * @param {number} [level]  current level number — used to derive every SEGMENT's own healthBonus (Config.boss.snake.segment.healthPerLevel), since segments aren't constructed through WaveManager's own generic per-type health-scaling path
   */
  constructor(healthBonus = 0, level = 1) {
    const cfg = Config.boss.snake;
    this._cfg  = cfg;
    this._type = 'boss';

    this._path = createSweeperPath();
    this._u = 0; // this head's own path-distance — advances independently every frame; every trailing segment's target is relative to this

    const start = sampleSweeperPath(this._path, 0);
    this.x = start.x;
    this.y = start.y;
    this._angle = start.heading;
    this._cosA = Math.cos(this._angle);
    this._sinA = Math.sin(this._angle);
    this.alive = true;
    this._visible = false;

    this._maxHealth = cfg.health + healthBonus;
    this._health    = this._maxHealth;
    this._hitFlash  = 0;
    this._dying     = false;
    this._age       = 0;

    this._lane = 0; // mutable, same as every SnakeSegment's own — see class doc and update()'s reassignment loop
    this._isAttacker = true; // fixed true regardless of `_lane` changing later — see class doc
    this._fireTimer = cfg.fireMinInterval + Math.random() * (cfg.fireMaxInterval - cfg.fireMinInterval);

    this._segmentHealthBonus = (level - 1) * (cfg.segment.healthPerLevel ?? 0);
    this._growthTimer = cfg.growthInterval;

    // Chain — every live segment (this head included). Body segments are
    // separate WaveManager entities; `_pendingSummons` is how newly-created
    // ones (initial formation AND later growth) reach WaveManager's own
    // enemy list — see class doc. `_nextLane` only ever increases — growth
    // always extends the tail, it never reuses a lane vacated by the
    // backward-shift mechanic (see `update`).
    this._chain = [this];
    this._pendingSummons = [];
    for (let lane = 1; lane < cfg.initialSegments; lane++) {
      const seg = new SnakeSegment(this, this._path, lane, this._u - lane * cfg.spacing, this._segmentHealthBonus);
      this._chain.push(seg);
      this._pendingSummons.push(seg);
    }
    this._nextLane = cfg.initialSegments;

    // Pre-allocated batched-hull pools, sized to the hard cap — see render().
    const mkPool = () => Array.from({ length: cfg.maxSegments }, () => ({ points: BODY_PTS.map(() => [0, 0]), closed: true }));
    this._normalHulls = mkPool();
    this._flashHulls  = mkPool();
  }

  get type()       { return this._type;  }
  get angle()      { return this._angle; }
  get hitRadius()  { return this._cfg.hitRadius; }
  /** 0-1 remaining health fraction — read by WaveManager for the boss health bar. */
  get healthFrac() { return Math.max(0, this._health) / this._maxHealth; }
  get name()  { return this._cfg.name; }
  get color() { return this._cfg.color; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY
   * @param {{ fireDrifterProjectile: (ox:number,oy:number,tx:number,ty:number,color:string)=>void }} ctx
   */
  update(dt, playerX, playerY, ctx) {
    const cfg = this._cfg;
    this._age += dt;
    if (tickDeathState(this, dt)) return;

    // For every segment that died since last frame, push every segment
    // still IN FRONT of it (smaller `_lane`) one lane further back — see
    // class doc for why this (not the dead segment's own neighbors behind
    // it) is what closes the gap. This includes the head itself (`_lane`
    // starts at 0, same as everyone else, not hardcoded/exempt) — if the
    // very frontmost body segment (lane 1) dies, the head is the only thing
    // "in front of" it, so the head is what retreats to close that gap,
    // same rule as any other segment. Handled one death at a time so
    // several deaths in the same frame correctly compound rather than
    // clobbering each other. (Only BODY segments — index ≥ 1 — can ever be
    // found dead here: the head's own death is caught by tickDeathState's
    // early return above, before this loop runs at all.)
    for (let i = 1; i < this._chain.length; i++) {
      const dead = this._chain[i];
      if (dead.alive) continue;
      const deadLane = dead._lane;
      for (let j = 0; j < this._chain.length; j++) {
        const other = this._chain[j];
        if (other !== dead && other.alive && other._lane < deadLane) other._lane++;
      }
    }

    // Now prune the dead entries themselves (plain compaction — order
    // within `_chain` doesn't matter, only `_lane` does).
    let w = 0;
    for (let i = 0; i < this._chain.length; i++) {
      if (this._chain[i].alive) {
        if (w !== i) this._chain[w] = this._chain[i];
        w++;
      }
    }
    this._chain.length = w;

    // `_u` is the shared LEADING EDGE — it always advances at the full
    // formation speed regardless of anything else, and every chain
    // member's target (this head included) is `_u - itsOwnLane * spacing`.
    // Normally the head's own `_lane` stays 0, so it rides right at the
    // leading edge — but if it's been pushed back by the reassignment
    // above, its actual rendered/hittable position trails behind `_u` by
    // that much, exactly like a retreating body segment (just without a
    // separate catch-up chase — the head's position IS its target, always,
    // no lag).
    this._u += cfg.speed * dt;
    const posU = this._u - this._lane * cfg.spacing;
    const { x, y, heading } = sampleSweeperPath(this._path, posU);
    this.x = x;
    this.y = y;
    this._angle = heading;
    this._cosA = Math.cos(heading);
    this._sinA = Math.sin(heading);

    const { width: vW, height: vH } = Config.virtual;
    const margin = 40;
    this._visible = x > -margin && x < vW + margin && y > -margin && y < vH + margin;

    // Broadcast this frame's target lane position to every trailing
    // segment, using its CURRENT `_lane` (not array position) — each one
    // chases it independently (see SnakeSegment.update).
    for (let i = 1; i < this._chain.length; i++) {
      const seg = this._chain[i];
      seg.setTarget(this._u - seg._lane * cfg.spacing);
    }

    // Growth — see class doc. Always extends the tail at a brand-new lane,
    // regardless of how many lanes have been vacated near the head by the
    // backward-shift mechanic above.
    if (this._chain.length < cfg.maxSegments) {
      this._growthTimer -= dt;
      if (this._growthTimer <= 0) {
        this._growthTimer = cfg.growthInterval;
        const n = Math.min(cfg.growthBatchSize, cfg.maxSegments - this._chain.length);
        for (let i = 0; i < n; i++) {
          const lane = this._nextLane++;
          const seg = new SnakeSegment(this, this._path, lane, this._u - lane * cfg.spacing, this._segmentHealthBonus);
          this._chain.push(seg);
          this._pendingSummons.push(seg);
        }
      }
    }

    // This head's own attack — see class doc.
    if (this._visible) {
      this._fireTimer -= dt;
      if (this._fireTimer <= 0) {
        if (Math.abs(playerX - x) > cfg.engageRangeX) {
          this._fireTimer = 0.3;
        } else {
          ctx.fireDrifterProjectile(x, y, playerX, playerY, cfg.color);
          this._fireTimer = cfg.fireMinInterval + Math.random() * (cfg.fireMaxInterval - cfg.fireMinInterval);
        }
      }
    }
  }

  /** Drains and returns any segments queued (initial formation, or a growth tick) since the last drain — see WaveManager.handleBulletHit/update. */
  drainSummons() {
    const summons = this._pendingSummons;
    this._pendingSummons = [];
    return summons;
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /**
   * Standalone render — batches every LIVE, VISIBLE chain member's body
   * (this head included) into pre-allocated hull pools and draws them in
   * one or two `fillStrokePaths` calls, the same shadow-blur-flattening
   * trick WaveManager's own Scout/Rocketeer/Sniper/Drifter batching already
   * uses — essential at up to 175 instances. A small pulsing ring marks
   * each attacker segment afterward (cheap at ~1-in-10 density) so the
   * player can tell which pieces of the chain actually shoot.
   */
  render(renderer) {
    const cfg = this._cfg;
    let normalCount = 0, flashCount = 0;

    for (let i = 0; i < this._chain.length; i++) {
      const seg = this._chain[i];
      if (!seg._visible) continue;
      const isFlash = seg._hitFlash > 0;
      const pool = isFlash ? this._flashHulls : this._normalHulls;
      const idx  = isFlash ? flashCount++ : normalCount++;
      if (idx >= pool.length) continue; // safety net — shouldn't happen, pools are sized to maxSegments
      const c = seg._cosA, s = seg._sinA;
      const path = pool[idx];
      for (let j = 0; j < BODY_PTS.length; j++) {
        const lx = BODY_PTS[j][0], ly = BODY_PTS[j][1];
        path.points[j][0] = seg.x + c * lx - s * ly;
        path.points[j][1] = seg.y + s * lx + c * ly;
      }
    }

    if (normalCount > 0) renderer.fillStrokePaths(this._normalHulls, {
      fillColor: cfg.fillColor, strokeColor: cfg.color,
      lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur,
      glowColor: cfg.color, singleStroke: true,
    }, normalCount);
    if (flashCount > 0) renderer.fillStrokePaths(this._flashHulls, {
      fillColor: '#ffffff', strokeColor: '#ffffff',
      lineWidth: cfg.lineWidth, glowBlur: cfg.hitGlowBlur,
      glowColor: '#ffffff', singleStroke: true,
    }, flashCount);

    for (let i = 0; i < this._chain.length; i++) {
      const seg = this._chain[i];
      if (!seg._visible || !seg._isAttacker || seg._hitFlash > 0) continue;
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(seg._age * 4));
      renderer.strokeCircle(seg.x, seg.y, 4, { color: '#ffffff', lineWidth: 1.5, alpha: pulse * 0.8 });
    }
  }
}
