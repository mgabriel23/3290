/**
 * SnakeBoss.js
 * Boss #4 — "Snake". Spawned by WaveManager on every 4th boss-level
 * encounter (level 28, 56, ... under Survival Mode's canonical schedule —
 * see Config.bossSchedule[mode].roster and WaveManager's boss-selection
 * lookup in its constructor). This class IS the chain's
 * FRONT segment (chain index 0) — the actual boss, with its own health/
 * reward/health-bar, same as every other boss — and also OWNS/coordinates
 * the whole chain behind it (`SnakeSegment.js`, pushed into WaveManager's
 * enemy list as independently-hittable `type: 'snakeSegment'` entities, not
 * tracked as children of this class the way e.g. a Splitter's fragments
 * are children of nothing once spawned).
 *
 * Movement reuses DrifterEnemy.js's own exported Sweeper path/sampler
 * (createSweeperPath/sampleSweeperPath) wholesale — this boss doesn't
 * invent new movement, it's explicitly "an upgraded Sweeper." One
 * difference: a regular Sweeper formation is fine to eventually sink off
 * the bottom of the screen and despawn (a throwaway wave), but this boss
 * must stay on screen and killable for the whole fight — so both the head
 * (below) and every segment (SnakeSegment.js) sample position through
 * DrifterEnemy.sampleBoundedSweeperPath instead of the plain sampler, which
 * freezes the row once the chain's leading edge reaches `Config.boss.snake.
 * patrolDepthY` and folds any further travel into patrolling that same row
 * left-right forever (see CAP_DIST below and that function's own doc).
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
 * Spawn: the full `maxSegments`-long chain is built all at once in the
 * constructor — no mid-fight growth, every lane from 1 to `maxSegments - 1`
 * exists from frame one. Queued in `_pendingSummons` and drained by
 * WaveManager via the exact same generic `drainSummons()` interface Bouncer
 * Primal's on-hit summons use (see WaveManager._spawnNext, which drains once
 * right after construction to collect this starting formation).
 *
 * Attack: this head counts as lane 0, which is trivially a multiple of
 * `attackInterval`, so it fires the same direct shot every attacker
 * segment does (see SnakeSegment.js's own doc for why that's simplified
 * from a regular Drifter's full tentacle-lash).
 *
 * Phase 2: every `Config.boss.snake.phase2.interval` seconds of normal
 * time, the WHOLE chain — this head plus every live SnakeSegment, via each
 * one's own `_head` reference (see SnakeSegment.hit) — goes invulnerable,
 * blinks, and moves `phase2.speedMult`× faster for `phase2.duration`
 * seconds, then reverts. One flag on this head (`_phase2Active`) gates
 * every hit() in the chain and drives the whole batch's render alpha, so
 * there's no per-segment broadcast to keep in sync — see `update`/`render`.
 */
import { Config } from '../core/Config.js';
import { createSweeperPath, sampleSweeperPath, sampleBoundedSweeperPath } from './DrifterEnemy.js';
import { SnakeSegment } from './SnakeSegment.js';
import { applyHit, tickDeathState } from './EnemyCombat.js';

// Body-plate silhouette for every segment BEHIND the head (local space, nose
// at -y matching every other enemy's forward convention) — an angular,
// elongated armor scute rather than DrifterEnemy's rounded bell-blob (this
// boss used to reuse that shape wholesale, which is exactly why a long chain
// of them read as "a row of plain circles" instead of a segmented body). The
// concave notch at the tail (points 4-5, pulled in to y=8 vs the flank tips'
// y=13) lets the next segment's nose sit into it, and the ~29vp nose-to-tail
// span against `spacing`'s 34vp leaves only a slim gap — tight enough to read
// as one continuous body rather than separated blobs. Scaled down per-segment
// toward the tail (see `segment.taperFloor`/`taperRate` and render()).
const SEGMENT_PTS = [
  [0,-16], [10,-10], [13,2], [9,13], [0,8], [-9,13], [-13,2], [-10,-10],
];

// Head silhouette (SnakeBoss itself, chain lane 0) — same nose-forward/tail-
// notch convention as SEGMENT_PTS but larger and fitted with small forward
// fangs, so the actual boss is visually identifiable at a glance instead of
// being just another identical plate at the front of the chain.
const HEAD_PTS = [
  [0,-20], [5,-15], [13,-6], [15,6], [9,16], [0,11], [-9,16], [-15,6], [-13,-6], [-5,-15],
];

// Path-distance depth at which the shared Sweeper path's descent freezes
// into a patrol — see Config.boss.snake.patrolDepthY and
// DrifterEnemy.sampleBoundedSweeperPath's own doc. Computed once from Config
// (fixed for every Snake fight): chosen so it always lands exactly on a
// row's start (patrolDepthY - startY is an exact multiple of `step`).
const _sweeperCfg = Config.enemy.drifter.sweeper;
const _cycleLen = (Config.virtual.width - 2 * _sweeperCfg.margin) + _sweeperCfg.step;
const CAP_DIST = Math.round((Config.boss.snake.patrolDepthY - _sweeperCfg.startY) / _sweeperCfg.step) * _cycleLen;

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

    // Phase 2 state — see class doc and Config.boss.snake.phase2. Read
    // directly off this head by every SnakeSegment's own `hit()` (via its
    // `_head` reference), so one flag here gates damage for the whole chain
    // at once with no per-segment broadcast needed.
    this._phase2Active  = false;
    this._phase2Timer   = 0; // counts down while active — remaining seconds left in the burst
    this._phase2Cooldown = cfg.phase2.interval; // counts down while inactive — seconds until the next burst

    // Chain — every live segment (this head included), built out to the
    // full `maxSegments` length right here — see class doc. Body segments
    // are separate WaveManager entities; `_pendingSummons` is how they
    // reach WaveManager's own enemy list (drained once, right after
    // construction — see WaveManager._spawnNext).
    this._chain = [this];
    this._pendingSummons = [];
    for (let lane = 1; lane < cfg.maxSegments; lane++) {
      const seg = new SnakeSegment(this, this._path, lane, this._u - lane * cfg.spacing, this._segmentHealthBonus, CAP_DIST);
      this._chain.push(seg);
      this._pendingSummons.push(seg);
    }

    // Pre-allocated batched-hull pools, sized to the hard cap — see render().
    // Three pools (vs. a regular enemy's two) because body segments alternate
    // between `fillColor` and `segment.altFillColor` by lane parity to read
    // as banded scales — `fillStrokePaths` takes one fill color per call, so
    // each band needs its own pool/call, same reason `_flashHulls` is split
    // out from `_normalHulls`.
    const mkPool = () => Array.from({ length: cfg.maxSegments }, () => ({ points: SEGMENT_PTS.map(() => [0, 0]), closed: true }));
    this._normalHulls = mkPool();
    this._altHulls    = mkPool();
    this._flashHulls  = mkPool();
    this._headHull    = { points: HEAD_PTS.map(() => [0, 0]), closed: true };
  }

  get type()       { return this._type;  }
  get angle()      { return this._angle; }
  get hitRadius()  { return this._cfg.hitRadius; }
  /** 0-1 remaining health fraction — read by WaveManager for the boss health bar. */
  get healthFrac() { return Math.max(0, this._health) / this._maxHealth; }
  get maxHealth()  { return this._maxHealth; } // see WaveManager._applySkillBombToBoss
  get name()  { return this._cfg.name; }
  get color() { return this._cfg.color; }
  /** Read by WaveManager.renderBossHealthBar for the generic phase2 indicator — see Config.boss.healthBar's own doc. */
  get invulnerable() { return this._phase2Active; }
  /** dt-accumulated age, read by WaveManager.renderBossHealthBar to drive the invulnerable indicator's pulse in lockstep with the rest of the game's timing. */
  get age() { return this._age; }

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

    // Phase 2 — see class doc and Config.boss.snake.phase2. Toggles
    // `_phase2Active`, which both `hit()` below and every SnakeSegment's own
    // `hit()` check to go invulnerable for the burst, and scales `speed`
    // just below. Frozen (not ticked) while dying, same as everything else
    // in this method after the early return above — but a fatal hit can
    // only ever land while `_phase2Active` is already false (see `hit()`),
    // so there's no risk of freezing it "stuck active".
    const p2 = cfg.phase2;
    if (this._phase2Active) {
      this._phase2Timer -= dt;
      if (this._phase2Timer <= 0) {
        this._phase2Active = false;
        this._phase2Cooldown = p2.interval;
      }
    } else {
      this._phase2Cooldown -= dt;
      if (this._phase2Cooldown <= 0) {
        this._phase2Active = true;
        this._phase2Timer = p2.duration;
      }
    }

    // `_u` is the shared LEADING EDGE — it always advances at the full
    // formation speed (boosted by `phase2.speedMult` during a burst)
    // regardless of anything else, and every chain member's target (this
    // head included) is `_u - itsOwnLane * spacing`. Normally the head's
    // own `_lane` stays 0, so it rides right at the leading edge — but if
    // it's been pushed back by the reassignment above, its actual
    // rendered/hittable position trails behind `_u` by that much, exactly
    // like a retreating body segment (just without a separate catch-up
    // chase — the head's position IS its target, always, no lag).
    this._u += cfg.speed * (this._phase2Active ? p2.speedMult : 1) * dt;
    const posU = this._u - this._lane * cfg.spacing;
    const { x, y, heading } = sampleBoundedSweeperPath(this._path, posU, CAP_DIST);
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

  /** Drains and returns the initial chain formation queued in the constructor — see WaveManager._spawnNext. */
  drainSummons() {
    // WaveManager calls this unconditionally every frame; the queue is only
    // ever populated once (the initial-formation drain, right after
    // construction) and empty on every frame after, so skip allocating a
    // fresh empty array in that common case rather than churning garbage
    // 60x/sec for a boss encounter's entire duration.
    if (this._pendingSummons.length === 0) return this._pendingSummons;
    const summons = this._pendingSummons;
    this._pendingSummons = [];
    return summons;
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal. A no-op
   * while `_phase2Active` — see class doc/Config.boss.snake.phase2.
   * @param {number} [damage]
   * @returns {boolean}
   */
  hit(damage = 1) {
    if (this._phase2Active) return false;
    return applyHit(this, damage);
  }

  /**
   * Standalone render — batches every LIVE, VISIBLE BODY segment's plate
   * (chain lane ≥ 1; the head is drawn separately below) into pre-allocated
   * hull pools and draws them in up to three `fillStrokePaths` calls (normal
   * band / alt band / hit-flash), the same shadow-blur-flattening trick
   * WaveManager's own Scout/Rocketeer/Sniper/Drifter batching already uses —
   * essential at up to `maxSegments` instances. Each plate is scaled down
   * per its own `_lane` (see `segment.taperFloor`/`taperRate`) for a leaner
   * tail, and banded between `fillColor`/`altFillColor` by lane parity to
   * read as individual scales. The head then gets its own distinct hull +
   * eyes so the actual boss doesn't just look like the frontmost plate. A
   * small pulsing ring marks each attacker segment afterward (cheap at
   * ~1-in-10 density) so the player can tell which pieces of the chain
   * actually shoot.
   */
  render(renderer) {
    const cfg = this._cfg;
    const segCfg = cfg.segment;
    // Phase 2 blink — a hard on/off flicker (not a smooth pulse) across the
    // WHOLE chain at once, driven by this head's own `_age` so every pool/
    // call below stays in sync (no per-segment desync) — see class doc.
    const blinkAlpha = this._phase2Active
      ? (Math.floor(this._age / cfg.phase2.blinkInterval) % 2 === 0 ? 1 : cfg.phase2.dimAlpha)
      : 1;
    let normalCount = 0, altCount = 0, flashCount = 0;

    for (let i = 1; i < this._chain.length; i++) {
      const seg = this._chain[i];
      if (!seg._visible) continue;
      const isFlash = seg._hitFlash > 0;
      const banded  = !isFlash && (seg._lane & 1) === 1;
      const pool = isFlash ? this._flashHulls : (banded ? this._altHulls : this._normalHulls);
      const idx  = isFlash ? flashCount++ : (banded ? altCount++ : normalCount++);
      if (idx >= pool.length) continue; // safety net — shouldn't happen, pools are sized to maxSegments
      const scale = Math.max(segCfg.taperFloor, 1 - seg._lane * segCfg.taperRate);
      const c = seg._cosA, s = seg._sinA;
      const path = pool[idx];
      for (let j = 0; j < SEGMENT_PTS.length; j++) {
        const lx = SEGMENT_PTS[j][0] * scale, ly = SEGMENT_PTS[j][1] * scale;
        path.points[j][0] = seg.x + c * lx - s * ly;
        path.points[j][1] = seg.y + s * lx + c * ly;
      }
    }

    if (normalCount > 0) renderer.fillStrokePaths(this._normalHulls, {
      fillColor: cfg.fillColor, strokeColor: cfg.color, alpha: blinkAlpha,
      lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur,
      glowColor: cfg.color, singleStroke: true,
    }, normalCount);
    if (altCount > 0) renderer.fillStrokePaths(this._altHulls, {
      fillColor: segCfg.altFillColor, strokeColor: cfg.color, alpha: blinkAlpha,
      lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur,
      glowColor: cfg.color, singleStroke: true,
    }, altCount);
    if (flashCount > 0) renderer.fillStrokePaths(this._flashHulls, {
      fillColor: '#ffffff', strokeColor: '#ffffff', alpha: blinkAlpha,
      lineWidth: cfg.lineWidth, glowBlur: cfg.hitGlowBlur,
      glowColor: '#ffffff', singleStroke: true,
    }, flashCount);

    // Head — always exactly one instance, so it's cheap to draw standalone
    // (own fillStrokePaths call + a pair of eye dots) rather than folding
    // into the batched pools above, unlike a body plate.
    if (this._visible) {
      const isFlash = this._hitFlash > 0;
      const c = this._cosA, s = this._sinA;
      const pts = this._headHull.points;
      for (let j = 0; j < HEAD_PTS.length; j++) {
        const lx = HEAD_PTS[j][0], ly = HEAD_PTS[j][1];
        pts[j][0] = this.x + c * lx - s * ly;
        pts[j][1] = this.y + s * lx + c * ly;
      }
      renderer.fillStrokePaths([this._headHull], {
        fillColor:   isFlash ? '#ffffff' : cfg.fillColor,
        strokeColor: isFlash ? '#ffffff' : cfg.color,
        lineWidth:   cfg.lineWidth, alpha: blinkAlpha,
        glowBlur:    isFlash ? cfg.hitGlowBlur : cfg.glowBlur,
        glowColor:   isFlash ? '#ffffff' : cfg.color,
      });
      if (!isFlash) {
        renderer.fillEllipse(-cfg.eyeOffsetX, cfg.eyeOffsetY, cfg.eyeRadius, cfg.eyeRadius, {
          x: this.x, y: this.y, rotation: this._angle, fillColor: cfg.eyeColor, alpha: blinkAlpha,
        });
        renderer.fillEllipse(cfg.eyeOffsetX, cfg.eyeOffsetY, cfg.eyeRadius, cfg.eyeRadius, {
          x: this.x, y: this.y, rotation: this._angle, fillColor: cfg.eyeColor, alpha: blinkAlpha,
        });
      }
    }

    for (let i = 0; i < this._chain.length; i++) {
      const seg = this._chain[i];
      if (!seg._visible || !seg._isAttacker || seg._hitFlash > 0) continue;
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(seg._age * 4));
      renderer.strokeCircle(seg.x, seg.y, 4, { color: '#ffffff', lineWidth: 1.5, alpha: pulse * 0.8 * blinkAlpha });
    }
  }
}
