/**
 * DrifterEnemy.js
 * Variant 4 — an alien tentacle-creature, spawned in formations of
 * `Config.enemy.drifter.formationSize` clones that share a single path
 * (see createPath/samplePath) and trail one another conga-line style,
 * each offset by `spacing` along the path. Unlike every other enemy,
 * Drifters never track or steer toward the player and don't "rest" —
 * they simply fly their fixed diagonal-entry → loop-the-loop →
 * diagonal-exit path and are removed once that exit run carries them
 * off-screen.
 *
 * Independently of movement, each clone runs its own attack timer: when
 * it elapses, it only actually lashes if the player is within
 * `Config.enemy.drifter.engageRangeX` of the clone's current x (otherwise
 * it re-checks shortly rather than firing blind) — a random tentacle whips
 * toward the player's CURRENT position (locked at that instant), then
 * `onFire` launches a slow projectile from the tentacle tip toward that
 * locked point — WaveManager routes this into a shared projectile pool
 * (DrifterProjectiles) which handles travel and the AOE burst on arrival.
 *
 * Barrier impact: variants #3 (Diver) and #4 (Weaver) dive straight down
 * through where the barrier sits — if the player doesn't kill a clone
 * before it reaches the surface, it deals `barrierDamage` to the barrier
 * and is destroyed on contact (a one-shot hit, unlike Bouncer which bounces
 * off and keeps threatening). Variants #1/#2's paths never reach that low,
 * so they're unaffected — see the `update` doc and WaveManager's
 * `onBarrierHit` wiring.
 */
import { Config } from '../core/Config.js';
import { applyHit, tickDeathState } from './EnemyCombat.js';

// Bell-shaped head — rounded dome on top, flatter base where tentacles
// attach. Local space, roughly 22 across, 22 tall.
// Exported so WaveManager can batch every clone's body into the same
// world-space hull pools it uses for Scout/Rocketeer/Sniper, keeping
// shadow-blur passes flat regardless of formation size.
export const BODY_PTS = [
  [-11,-2],[-9,-8],[-3,-12],[3,-12],[9,-8],[11,-2],
  [10,4],[6,8],[0,10],[-6,8],[-10,4],
];

// Eye sockets (local space) — pulse independently per clone.
const EYES = [[-4,-2],[4,-2]];

// Tentacle base attachment points along the bottom rim, local space.
// Local +y = trailing edge (the path's heading convention points local
// -y in the direction of travel, same as Scout's nose-forward convention).
const TENTACLE_BASES = [[-7,7],[-2.5,9],[2.5,9],[7,7]];

const randInterval = (cfg, mult = 1) => (cfg.fireMinInterval + Math.random() * (cfg.fireMaxInterval - cfg.fireMinInterval)) * mult;

/**
 * Build one shared path for an entire formation: a diagonal entry from a
 * randomly chosen top corner, one full loop-the-loop partway down, then a
 * continuation in the same diagonal direction off the opposite bottom
 * corner and beyond.
 */
export function createDrifterPath() {
  const cfg = Config.enemy.drifter;
  const { width: vW } = Config.virtual;
  const fromLeft = Math.random() < 0.5;
  const dir = fromLeft ? { x: 1 / Math.SQRT2, y: 1 / Math.SQRT2 }
                        : { x: -1 / Math.SQRT2, y: 1 / Math.SQRT2 };
  const entry = fromLeft
    ? { x: -cfg.entryMargin, y: -cfg.entryMargin }
    : { x: vW + cfg.entryMargin, y: -cfg.entryMargin };

  const L1 = cfg.pathEntryRunMin + Math.random() * (cfg.pathEntryRunMax - cfg.pathEntryRunMin); // straight run before the loop
  const P1 = { x: entry.x + dir.x * L1, y: entry.y + dir.y * L1 };

  // Loop center: 90° left of travel direction, tangent-continuous at P1.
  const perp   = { x: -dir.y, y: dir.x };
  const C      = { x: P1.x + perp.x * cfg.loopRadius, y: P1.y + perp.y * cfg.loopRadius };
  const theta0 = Math.atan2(-dir.x, dir.y);
  const Lloop  = 2 * Math.PI * cfg.loopRadius;

  const L3 = cfg.pathExitRunLength; // straight run after the loop, well past the far corner

  return { variant: 1, dir, entry, L1, P1, C, theta0, Lloop, L3, total: L1 + Lloop + L3 };
}

/** Position + heading at distance `dist` along the given path. */
export function samplePath(p, dist) {
  const cfg = Config.enemy.drifter;
  if (dist < p.L1) {
    return {
      x: p.entry.x + p.dir.x * dist, y: p.entry.y + p.dir.y * dist,
      heading: Math.atan2(p.dir.x, -p.dir.y),
    };
  }
  if (dist < p.L1 + p.Lloop) {
    const theta = p.theta0 + (dist - p.L1) / cfg.loopRadius;
    const tx = -Math.sin(theta), ty = Math.cos(theta);
    return {
      x: p.C.x + Math.cos(theta) * cfg.loopRadius, y: p.C.y + Math.sin(theta) * cfg.loopRadius,
      heading: Math.atan2(tx, -ty),
    };
  }
  const dd = dist - p.L1 - p.Lloop;
  return {
    x: p.P1.x + p.dir.x * dd, y: p.P1.y + p.dir.y * dd,
    heading: Math.atan2(p.dir.x, -p.dir.y),
  };
}

/**
 * Build the shared path for a "Sweeper" formation (variety #2): a single
 * conga-line that starts at the left edge moving right. Unlike
 * createDrifterPath, this path has no fixed length — it repeats
 * indefinitely (straight run, step down, reverse) until the formation
 * sinks off the bottom of the screen, which DrifterEnemy.update detects
 * directly via the off-screen check.
 */
export function createSweeperPath() {
  const cfg = Config.enemy.drifter.sweeper;
  return { variant: 2, dir: 1, startY: cfg.startY, total: Infinity };
}

/**
 * Position + heading at distance `dist` along a sweeper path: straight
 * horizontal runs of screen width (minus margins), facing the direction of
 * travel, each followed by a straight vertical drop of `step` (facing
 * straight down — head toward the player, tentacles trailing above),
 * alternating left/right after every drop.
 */
export function sampleSweeperPath(p, dist) {
  const cfg = Config.enemy.drifter.sweeper;
  const { width: vW } = Config.virtual;
  const range    = vW - 2 * cfg.margin;
  const cycleLen = range + cfg.step;

  const cyc = Math.floor(dist / cycleLen);
  const posInCycle = dist - cyc * cycleLen;

  const dir      = p.dir * (cyc % 2 === 0 ? 1 : -1);
  const startX   = dir > 0 ? cfg.margin : vW - cfg.margin;
  const rowYBase = p.startY + cyc * cfg.step;

  if (posInCycle < range) {
    return { x: startX + dir * posInCycle, y: rowYBase, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }
  return { x: startX + dir * range, y: rowYBase + (posInCycle - range), heading: Math.PI };
}

/**
 * Build the shared "anchor" for a "Diver" formation (variety #3): a
 * V-shaped wedge that drops straight down from a random horizontal spawn
 * point, accelerating as it falls. Like the sweeper path, this has no fixed
 * length — `total: Infinity` — DrifterEnemy.update detects the formation's
 * exit directly via the off-screen check once it sinks below the bottom.
 */
export function createDiverPath() {
  const cfg = Config.enemy.drifter.diver;
  const { width: vW } = Config.virtual;
  const x = cfg.margin + Math.random() * (vW - 2 * cfg.margin);
  return { variant: 3, x, total: Infinity };
}

/**
 * Position + heading at elapsed time `t` for one clone of a "Diver" wedge:
 * the whole formation falls straight down (kinematics: dist = v0*t +
 * 0.5*a*t^2) as a rigid body — `offset` is this clone's fixed [dx, dy]
 * displacement from the wedge's leader. Always faces straight down (head
 * toward the player, tentacles trailing above), same pose as the sweeper's
 * vertical step.
 */
export function sampleDiverPath(p, t, offset) {
  const cfg  = Config.enemy.drifter.diver;
  const dist = cfg.startSpeed * t + 0.5 * cfg.accel * t * t;
  return { x: p.x + offset[0], y: cfg.spawnY + dist + offset[1], heading: Math.PI };
}

/**
 * Build the shared path for a "Weaver" formation (variety #4): a
 * conga-line that descends straight down the screen while swaying
 * side-to-side in a sine wave. Like the sweeper path, this has no fixed
 * length — `total: Infinity` — DrifterEnemy.update detects each clone's
 * exit directly via the off-screen check once it sinks below the bottom.
 * A random `phase` shifts the sine wave per spawn, so the formation
 * doesn't always enter dead-center moving the same direction.
 */
export function createWeaverPath() {
  return { variant: 4, total: Infinity, phase: Math.random() * Math.PI * 2 };
}

/**
 * Position + heading at distance `dist` along a weaver path: y descends
 * linearly from off-screen above, x oscillates around screen-center in a
 * sine wave (offset by the path's random `phase`). Heading follows the
 * path's tangent direction (nose pointed along the direction of travel,
 * same convention as variant #1).
 */
export function sampleWeaverPath(p, dist) {
  const cfg = Config.enemy.drifter.weaver;
  const { width: vW } = Config.virtual;
  const baseX = vW / 2;
  const theta = dist * cfg.frequency + p.phase;

  const y = cfg.spawnYOffset + dist;
  const x = baseX + Math.sin(theta) * cfg.amplitude;

  const dx  = cfg.amplitude * cfg.frequency * Math.cos(theta);
  const dy  = 1;
  const len = Math.sqrt(dx * dx + dy * dy);
  return { x, y, heading: Math.atan2(dx / len, -dy / len) };
}

export class DrifterEnemy {
  /**
   * @param {ReturnType<typeof createDrifterPath>} path  shared by the whole formation
   * @param {number} laneIndex  0 = leader, 1.. = trailing clones
   * @param {number} [healthBonus]  added to `Config.enemy.drifter.health` — used by WaveManager to scale health by level
   */
  constructor(path, laneIndex, healthBonus = 0) {
    this._type    = 'drifter';
    this._cfg     = Config.enemy.drifter;
    this._variant = path.variant ?? 1;
    this._path    = path;
    this._offset  = this._variant === 3 ? this._cfg.diver.offsets[laneIndex] : null;
    this._sample  = this._variant === 2 ? sampleSweeperPath
                   : this._variant === 3 ? (p, t) => sampleDiverPath(p, t, this._offset)
                   : this._variant === 4 ? sampleWeaverPath
                   : samplePath;
    this._fireMult = this._variant === 2 ? this._cfg.sweeper.fireIntervalMult
                    : this._variant === 3 ? this._cfg.diver.fireIntervalMult
                    : this._variant === 4 ? this._cfg.weaver.fireIntervalMult
                    : 1;
    this._palette = this._variant === 2 ? this._cfg.sweeper
                   : this._variant === 3 ? this._cfg.diver
                   : this._variant === 4 ? this._cfg.weaver
                   : this._cfg;
    // The path-sampling parameter passed to `this._sample`. Its unit
    // depends on the variant: for #1/#2/#4 it's distance traveled along the
    // path (vp, advanced by `speed * dt` in update()); for #3 it's elapsed
    // time (seconds, advanced by `dt` directly — sampleDiverPath applies
    // its own kinematics to convert time to distance). Same field, two
    // different physical units, because every variant's sampler shares one
    // call shape — see the `_sample` assignment above.
    this._u    = this._variant === 3 ? 0
               : -laneIndex * (this._variant === 2 ? this._cfg.sweeper.spacing
                              : this._variant === 4 ? this._cfg.weaver.spacing
                              : this._cfg.spacing);

    this.alive = true;
    if (this._variant === 2 || this._variant === 3 || this._variant === 4) {
      const start = this._sample(path, this._u);
      this.x = start.x;
      this.y = start.y;
      this._angle = start.heading;
    } else {
      this.x = path.entry.x;
      this.y = path.entry.y;
      this._angle = Math.atan2(path.dir.x, -path.dir.y);
    }
    this._cosA  = Math.cos(this._angle);
    this._sinA  = Math.sin(this._angle);

    this._health   = this._cfg.health + healthBonus;
    this._hitFlash = 0;
    this._dying    = false;
    this._age      = Math.random() * Math.PI * 2; // phase offset — desyncs tentacle wobble/eye pulse across clones

    // ── Tentacle-lash projectile attack ───────────────────────────────────────
    this._fireState   = 'idle'; // 'idle' | 'lashing'
    this._fireAge     = 0;
    this._fireTimer   = randInterval(this._cfg, this._fireMult);
    this._tentacleIdx = 0;
    this._lashAngle   = 0;
    this._targetX     = 0;
    this._targetY     = 0;

    // True only while on (or near) screen — WaveManager skips render() otherwise
    // so trailing clones that haven't entered yet cost nothing to draw.
    this._visible = false;

    // Pre-allocated tentacle paths — mutated in place each frame, never
    // reallocated. Normal tentacles are batched into one singleStroke call
    // (1 shadow pass); an actively-lashing tentacle (different width/glow)
    // gets its own pass.
    this._tentaclePaths = TENTACLE_BASES.map(() => ({
      points: Array.from({ length: this._cfg.tentacleSegs + 1 }, () => [0, 0]),
      closed: false,
    }));
    this._normalTentacleBatch = new Array(TENTACLE_BASES.length);
  }

  get type()  { return this._type;  }
  get angle() { return this._angle; }

  /** Collision radius — used by GameplayScene's bullet↔enemy hit test. */
  get hitRadius() { return this._cfg.hitRadius; }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   * @param {(ox:number, oy:number, tx:number, ty:number) => void} onFire
   * @param {(x: number) => number} barrierSurfaceY  y of the barrier's arc surface at a given x — only read by Diver/Weaver (variants #3/#4), the only paths that dive low enough to reach it
   * @param {(x: number, y: number, damage: number, variant: number) => void} onBarrierHit  called once if a Diver/Weaver clone reaches the barrier, with the impact point, damage dealt, and this clone's variant (so WaveManager can trigger that variant's own explosion/SFX)
   */
  update(dt, playerX, playerY, onFire, barrierSurfaceY, onBarrierHit) {
    const cfg = this._cfg;
    this._age += dt;
    if (tickDeathState(this, dt)) return;

    if (this._variant === 3) {
      this._u += dt; // elapsed time — sampleDiverPath applies kinematics
    } else {
      const speed = this._variant === 2 ? cfg.sweeper.speed
                   : this._variant === 4 ? cfg.weaver.speed
                   : cfg.speed;
      this._u += speed * dt;
    }
    if (this._u > this._path.total) { this.alive = false; return; }
    if (this._u < 0) { this._visible = false; return; } // not yet entered

    const { x, y, heading } = this._sample(this._path, this._u);
    this.x = x;
    this.y = y;
    this._angle = heading;
    this._cosA  = Math.cos(heading);
    this._sinA  = Math.sin(heading);

    // Off-screen — cancel any in-progress attack so it can't fire while
    // invisible, skip rendering, and remove the clone outright once it's
    // off-screen during its final exit run. Variant #1 only finally exits
    // past its loop; variant #2's path stays within the horizontal bounds,
    // so any off-screen state (sunk past the bottom) is final.
    const { width: vW, height: vH } = Config.virtual;
    const margin   = cfg.offscreenMargin;
    const onScreen = x > -margin && x < vW + margin && y > -margin && y < vH + margin;
    if (!onScreen) {
      // Variants #3 and #4 start above the top edge by design (#3's
      // trailing wedge clones sit higher than the leader; #4 enters from
      // off-screen above like a sweeper row dropped a level) — only a
      // sunk-past-the-bottom exit is final; still-above-the-top just means
      // "not visible yet".
      if (this._variant === 3 || this._variant === 4) {
        if (y > vH + margin) { this.alive = false; return; }
        this._visible = false;
        return;
      }
      const isFinalExit = this._variant === 2
                       || this._u >= this._path.L1 + this._path.Lloop;
      if (isFinalExit) { this.alive = false; return; }
      if (this._fireState !== 'idle') {
        this._fireState = 'idle';
        this._fireTimer = randInterval(cfg, this._fireMult);
      }
      this._visible = false;
      return;
    }
    this._visible = true;

    // ── Barrier impact (Diver/Weaver only) ────────────────────────────────────
    // These two variants dive straight down through where the barrier sits;
    // drifter/sweeper's paths never reach that low, so they're excluded.
    // Unlike Bouncer (which bounces off and keeps threatening), the clone is
    // destroyed the instant it reaches the surface — a one-shot impact.
    if (this._variant === 3 || this._variant === 4) {
      const surfaceY = barrierSurfaceY(x);
      if (y + this.hitRadius >= surfaceY) {
        onBarrierHit(x, y, this._palette.barrierDamage, this._variant);
        this.alive = false;
        return;
      }
    }

    // ── Tentacle-lash attack state machine ────────────────────────────────────
    const c = this._cosA, s = this._sinA;
    if (this._fireState === 'idle') {
      this._fireTimer -= dt;
      if (this._fireTimer <= 0) {
        // Only actually lash if the player is roughly beneath/near this
        // clone — otherwise the attack read as blind (firing regardless of
        // where the player is). Withholding just re-checks shortly rather
        // than resetting the full random interval, so it engages promptly
        // once the player wanders into range.
        if (Math.abs(playerX - x) > cfg.engageRangeX) {
          this._fireTimer = cfg.engageRetryInterval;
          return;
        }
        this._fireState   = 'lashing';
        this._fireAge     = 0;
        this._tentacleIdx = Math.floor(Math.random() * TENTACLE_BASES.length);

        // Lock the target to the player's current position at the moment of
        // firing, and aim the lash toward it (converted to local space so it
        // rotates with the ship).
        const [lbx, lby] = TENTACLE_BASES[this._tentacleIdx];
        const baseX = x + c * lbx - s * lby;
        const baseY = y + s * lbx + c * lby;
        this._targetX   = playerX;
        this._targetY   = playerY;
        this._lashAngle = Math.atan2(this._targetY - baseY, this._targetX - baseX) - heading;
      }
    } else { // 'lashing'
      this._fireAge += dt;
      if (this._fireAge >= cfg.lashDuration) {
        // Launch the projectile from the tentacle's extended tip.
        const [lbx, lby] = TENTACLE_BASES[this._tentacleIdx];
        const dirX  = Math.cos(this._lashAngle), dirY = Math.sin(this._lashAngle);
        const tipLX = lbx + dirX * cfg.lashLen, tipLY = lby + dirY * cfg.lashLen;
        const tipX  = x + c * tipLX - s * tipLY;
        const tipY  = y + s * tipLX + c * tipLY;
        onFire(tipX, tipY, this._targetX, this._targetY, this._palette.color);

        this._fireState = 'idle';
        this._fireTimer = randInterval(cfg, this._fireMult);
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

  /**
   * The body hull, standalone. WaveManager never calls this for real
   * gameplay — it batches every visible clone's body into its own shared
   * hull pools instead (the same way it batches Scout/Rocketeer/Sniper).
   * This is for contexts that render exactly one clone at a time, e.g.
   * EnemyCodex's preview cards — mirrors WaveManager's per-clone styling
   * exactly (lineWidth always comes from the base `_cfg`, not the
   * per-variant `_palette`, matching the batched path). `alpha` is an
   * optional entrance-fade multiplier (default 1) — see
   * EnemyCombat.renderHull's doc for the convention.
   */
  renderBody(renderer, alpha = 1) {
    const flash = this._hitFlash > 0;
    renderer.fillStrokePaths([{ points: BODY_PTS, closed: true }], {
      x: this.x, y: this.y, rotation: this._angle, alpha,
      fillColor:   flash ? '#ffffff' : this._palette.fillColor,
      strokeColor: flash ? '#ffffff' : this._palette.color,
      lineWidth:   this._cfg.lineWidth,
      glowBlur:    flash ? this._palette.hitGlowBlur : this._palette.glowBlur,
      glowColor:   flash ? '#ffffff' : this._palette.color,
    });
  }

  /**
   * Tentacles and eyes — drawn individually per clone (variable tentacle
   * geometry can't be pooled). The body is NOT drawn here: WaveManager
   * batches every visible clone's body (using the exported BODY_PTS) into
   * its shared hull pools, the same way it batches Scout/Rocketeer/Sniper.
   * (For a standalone single-clone render, call `renderBody` first — see
   * EnemyCodex.) `alpha` is an optional entrance-fade multiplier (default
   * 1, so WaveManager's real per-frame calls are unaffected).
   */
  render(renderer, alpha = 1) {
    const cfg   = this._cfg;
    const flash = this._hitFlash > 0;
    const c     = this._cosA, s = this._sinA;
    const bodyColor = flash ? '#ffffff' : this._palette.color;

    // Tentacles — drawn first so they trail out from behind the body.
    // Normal tentacles share one singleStroke pass; an actively-lashing
    // tentacle (different width/glow/aim) gets its own pass.
    let normalCount = 0;
    let lashPath = null;
    for (let j = 0; j < TENTACLE_BASES.length; j++) {
      const [bx, by] = TENTACLE_BASES[j];
      const isLashTentacle = j === this._tentacleIdx && this._fireState === 'lashing';

      let len = cfg.tentacleLen;
      let amp = cfg.tentacleAmp;
      if (isLashTentacle) {
        const t = this._fireAge / cfg.lashDuration;
        len = cfg.tentacleLen + (cfg.lashLen - cfg.tentacleLen) * t; // whip outward
        amp = cfg.tentacleAmp * (1 - t * cfg.lashStraightenFactor);  // straightens as it extends
      }

      // Normal tentacles trail straight behind (local +y); a lashing
      // tentacle points toward the player along the angle locked at fire time.
      const dirAngle = isLashTentacle ? this._lashAngle : Math.PI / 2;
      const dirX = Math.cos(dirAngle), dirY = Math.sin(dirAngle);
      const perpX = -dirY, perpY = dirX;

      const path = this._tentaclePaths[j];
      const pts  = path.points;
      pts[0][0] = bx; pts[0][1] = by;
      for (let k = 1; k <= cfg.tentacleSegs; k++) {
        const t    = k / cfg.tentacleSegs;
        const wave = Math.sin(this._age * cfg.tentacleSpeed + j * cfg.tentaclePhaseSpacing + t * cfg.tentacleWaveFreq) * (amp * t);
        pts[k][0] = bx + dirX * len * t + perpX * wave;
        pts[k][1] = by + dirY * len * t + perpY * wave;
      }

      if (isLashTentacle) lashPath = path;
      else this._normalTentacleBatch[normalCount++] = path;
    }

    renderer.strokePaths(this._normalTentacleBatch, {
      x: this.x, y: this.y, rotation: this._angle,
      color: bodyColor, lineWidth: 2.2, lineCap: 'round',
      glowBlur: this._palette.tentacleGlowBlur, glowColor: bodyColor, alpha: 0.85 * alpha,
      singleStroke: true,
    }, normalCount);

    if (lashPath) {
      renderer.strokePaths([lashPath], {
        x: this.x, y: this.y, rotation: this._angle,
        color: bodyColor, lineWidth: 3, lineCap: 'round',
        glowBlur: this._palette.lashGlowBlur, glowColor: bodyColor, alpha: 0.85 * alpha,
      }, 1);
    }

    if (flash) return;

    // Pulsing eyes — small alpha-pulsed dots, no per-eye glow (the body's
    // single shared glow pass is enough to sell the "alien" look cheaply).
    for (let j = 0; j < EYES.length; j++) {
      const [lx, ly] = EYES[j];
      const wx = this.x + c * lx - s * ly;
      const wy = this.y + s * lx + c * ly;
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(this._age * 3 + j * 1.5));
      renderer.strokeCircle(wx, wy, 1.8, {
        color: this._palette.eyeColor, lineWidth: 2.5,
        alpha: pulse * alpha,
      });
    }
  }
}
