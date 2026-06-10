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
 * it elapses, a random tentacle whips toward the player's CURRENT
 * position (locked at that instant), then `onFire` launches a slow
 * projectile from the tentacle tip toward that locked point — WaveManager
 * routes this into a shared projectile pool (DrifterProjectiles) which
 * handles travel and the AOE burst on arrival.
 */
import { Config } from '../core/Config.js';

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

  const L1 = 250 + Math.random() * 150; // straight run before the loop
  const P1 = { x: entry.x + dir.x * L1, y: entry.y + dir.y * L1 };

  // Loop center: 90° left of travel direction, tangent-continuous at P1.
  const perp   = { x: -dir.y, y: dir.x };
  const C      = { x: P1.x + perp.x * cfg.loopRadius, y: P1.y + perp.y * cfg.loopRadius };
  const theta0 = Math.atan2(-dir.x, dir.y);
  const Lloop  = 2 * Math.PI * cfg.loopRadius;

  const L3 = 900; // straight run after the loop, well past the far corner

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
  const uic = dist - cyc * cycleLen;

  const dir      = p.dir * (cyc % 2 === 0 ? 1 : -1);
  const startX   = dir > 0 ? cfg.margin : vW - cfg.margin;
  const rowYBase = p.startY + cyc * cfg.step;

  if (uic < range) {
    return { x: startX + dir * uic, y: rowYBase, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }
  return { x: startX + dir * range, y: rowYBase + (uic - range), heading: Math.PI };
}

export class DrifterEnemy {
  /**
   * @param {ReturnType<typeof createDrifterPath>} path  shared by the whole formation
   * @param {number} laneIndex  0 = leader, 1.. = trailing clones
   */
  constructor(path, laneIndex) {
    this._type    = 'drifter';
    this._cfg     = Config.enemy.drifter;
    this._variant = path.variant ?? 1;
    this._path    = path;
    this._sample  = this._variant === 2 ? sampleSweeperPath : samplePath;
    this._fireMult = this._variant === 2 ? this._cfg.sweeper.fireIntervalMult : 1;
    this._palette = this._variant === 2
      ? this._cfg.sweeper
      : this._cfg;
    this._u    = -laneIndex * (this._variant === 2 ? this._cfg.sweeper.spacing : this._cfg.spacing);

    this.alive = true;
    if (this._variant === 2) {
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

    this._health   = this._cfg.health;
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

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   * @param {(ox:number, oy:number, tx:number, ty:number) => void} onFire
   */
  update(dt, playerX, playerY, onFire) {
    const cfg = this._cfg;
    this._age += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;

    if (this._dying) {
      if (this._hitFlash <= 0) this.alive = false;
      return;
    }

    const speed = this._variant === 2 ? cfg.sweeper.speed : cfg.speed;
    this._u += speed * dt;
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
    const margin   = 40;
    const onScreen = x > -margin && x < vW + margin && y > -margin && y < vH + margin;
    if (!onScreen) {
      const isFinalExit = this._variant === 2 || this._u >= this._path.L1 + this._path.Lloop;
      if (isFinalExit) { this.alive = false; return; }
      if (this._fireState !== 'idle') {
        this._fireState = 'idle';
        this._fireTimer = randInterval(cfg, this._fireMult);
      }
      this._visible = false;
      return;
    }
    this._visible = true;

    // ── Tentacle-lash attack state machine ────────────────────────────────────
    const c = this._cosA, s = this._sinA;
    if (this._fireState === 'idle') {
      this._fireTimer -= dt;
      if (this._fireTimer <= 0) {
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
        onFire(tipX, tipY, this._targetX, this._targetY);

        this._fireState = 'idle';
        this._fireTimer = randInterval(cfg, this._fireMult);
      }
    }
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @returns {boolean}
   */
  hit() {
    if (this._dying) return false;
    this._hitFlash = 0.15;
    this._health--;
    if (this._health <= 0) {
      this._dying = true;
      return true;
    }
    return false;
  }

  /**
   * Tentacles and eyes — drawn individually per clone (variable tentacle
   * geometry can't be pooled). The body is NOT drawn here: WaveManager
   * batches every visible clone's body (using the exported BODY_PTS) into
   * its shared hull pools, the same way it batches Scout/Rocketeer/Sniper.
   */
  render(renderer) {
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
        amp = cfg.tentacleAmp * (1 - t * 0.7);                       // straightens as it extends
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
        const wave = Math.sin(this._age * cfg.tentacleSpeed + j * 1.3 + t * 3) * (amp * t);
        pts[k][0] = bx + dirX * len * t + perpX * wave;
        pts[k][1] = by + dirY * len * t + perpY * wave;
      }

      if (isLashTentacle) lashPath = path;
      else this._normalTentacleBatch[normalCount++] = path;
    }

    renderer.strokePaths(this._normalTentacleBatch, {
      x: this.x, y: this.y, rotation: this._angle,
      color: bodyColor, lineWidth: 2.2, lineCap: 'round',
      glowBlur: this._palette.tentacleGlowBlur, glowColor: bodyColor, alpha: 0.85,
      singleStroke: true,
    }, normalCount);

    if (lashPath) {
      renderer.strokePaths([lashPath], {
        x: this.x, y: this.y, rotation: this._angle,
        color: bodyColor, lineWidth: 3, lineCap: 'round',
        glowBlur: this._palette.lashGlowBlur, glowColor: bodyColor, alpha: 0.85,
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
        alpha: pulse,
      });
    }
  }
}
