/**
 * PlayerMissiles.js
 * The player's homing missile pool — a Shop-only weapon (see Config.player.
 * missiles, Player.missilesUnlocked/missileInterval/missileDamageMultiplier/
 * hasWingMissilePods) that fires automatically on an interval at whichever
 * enemy is currently closest to the player (WaveManager.nearestEnemy),
 * homes toward it continuously, and detonates on proximity — deliberately
 * modeled on Rockets.js (an enemy Rocketeer's own homing weapon) for the
 * movement/trail/body-rendering shape. The one structural difference:
 * Rockets all home toward one shared target (the player) passed into
 * `update` each frame, while every missile here can be chasing a DIFFERENT
 * enemy, so each missile keeps a direct object reference to its own target
 * (`_targets[i]`) instead. Deliberately slow (Config.player.missiles.speed)
 * — it leans on persistence, not speed, to actually connect.
 *
 * If a target dies before the missile reaches it, `update` re-queries
 * `waveManager.nearestEnemy` from the missile's OWN current position and
 * retargets onto whatever's now closest, rather than coasting on its last
 * heading toward empty space — reads as "actively hunting," not "fired and
 * forgotten." (A dead enemy object stays safe to have held a reference to
 * in the meantime — WaveManager never pools/reuses them, a dead one just
 * falls out of its `_enemies` array and its `.alive` flips to false
 * forever.) If nothing's left alive to retarget onto, the missile stops
 * turning and accelerates instead (`Config.player.missiles.noTargetAccel`)
 * — it rushes off whichever edge it was already heading toward and
 * despawns quietly the instant it clears the screen, no explosion, rather
 * than detonating on the spot. A target reappearing on a later frame (this
 * check runs every frame, not just once) snaps it right back into homing.
 *
 * Fire cooldown/target-acquisition is owned internally, the same
 * self-contained shape Bullets.js already uses for its own auto-fire —
 * GameplayScene just calls `update(dt, player, waveManager)` every frame.
 */
import { Config } from '../core/Config.js';
import { directionalVelocity } from '../core/vectorMath.js';

const MAX        = Config.player.missiles.poolSize;
const TRAIL_HIST = Config.player.missiles.trailHistory; // stored history positions per missile
const TRAIL_PTS  = TRAIL_HIST + 1; // polyline points = history + current tip
const TRAIL_STEP = Config.player.missiles.trailStep; // seconds between recorded positions

// Local-space dart silhouette, nose pointing toward +X ("forward") — rotated
// to each missile's current travel direction in render(). Same shape family
// as Rockets.js's own BODY_LOCAL_PTS, sized off Config.player.missiles
// instead of Config.rocket.
const { halfLen: MISSILE_LEN, bodyHalfWidth: MISSILE_HW } = Config.player.missiles;
const BODY_LOCAL_PTS = [
  [ MISSILE_LEN,          0],
  [ MISSILE_LEN * 0.25,   MISSILE_HW * 0.5],
  [-MISSILE_LEN * 0.55,   MISSILE_HW],
  [-MISSILE_LEN * 0.85,   MISSILE_HW * 0.35],
  [-MISSILE_LEN,          0],
  [-MISSILE_LEN * 0.85,  -MISSILE_HW * 0.35],
  [-MISSILE_LEN * 0.55,  -MISSILE_HW],
  [ MISSILE_LEN * 0.25,  -MISSILE_HW * 0.5],
];

export class PlayerMissiles {
  /**
   * @param {{ onDetonate: (x: number, y: number) => void, onHit: (target: object) => void }} callbacks
   *   `onDetonate` fires on a proximity hit or a `maxLife` timeout, for the
   *   visual explosion — NOT when a missile rushes off-screen for lack of a
   *   target (see `update`'s own doc), which just despawns quietly instead.
   *   `onHit` fires only for a real proximity hit on a still-alive target —
   *   GameplayScene routes this into
   *   WaveManager.handleBulletHit.
   */
  constructor({ onDetonate, onHit }) {
    this._onDetonate = onDetonate;
    this._onHit       = onHit;

    this._x    = new Float32Array(MAX);
    this._y    = new Float32Array(MAX);
    this._vx   = new Float32Array(MAX);
    this._vy   = new Float32Array(MAX);
    this._age  = new Float32Array(MAX);
    this._targets = new Array(MAX).fill(null); // direct enemy-object references — see class doc
    this._count = 0;

    this._cooldown   = 0;
    this._launchSide = 1; // alternates -1/1 between left/right wing pods once Player.hasWingMissilePods — see _launchPoint

    // Position history ring buffers — flat layout, same shape as Rockets.js.
    this._hx    = new Float32Array(MAX * TRAIL_HIST);
    this._hy    = new Float32Array(MAX * TRAIL_HIST);
    this._hHead = new Uint8Array(MAX);
    this._hTick = new Float32Array(MAX);

    this._pool = Array.from({ length: MAX }, () => ({
      points: Array.from({ length: TRAIL_PTS }, () => [0, 0]),
      closed: false,
    }));
    this._bodyPool = Array.from({ length: MAX }, () => ({
      points: BODY_LOCAL_PTS.map(() => [0, 0]),
      closed: true,
    }));

    const { color, lineWidth, glowBlur, bodyFillColor } = Config.player.missiles;
    this._style = { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true, alpha: 1 };
    this._bodyStyle = {
      fillColor: bodyFillColor, strokeColor: color, lineWidth, glowColor: color, glowBlur, singleStroke: true, alpha: 1,
    };
  }

  /**
   * Advance the fire cooldown (launching a new missile at the nearest enemy
   * once ready, via `waveManager.nearestEnemy`) and every in-flight
   * missile's homing/movement/detonation.
   * @param {number} dt
   * @param {import('./Player.js').Player} player
   * @param {import('./WaveManager.js').WaveManager} [waveManager]  undefined during the very first "LEVEL 1" intro, before any WaveManager exists yet — see GameplayScene.update
   */
  update(dt, player, waveManager) {
    if (player.ready && player.missilesUnlocked) {
      this._cooldown -= dt;
      if (this._cooldown <= 0) {
        const target = waveManager?.nearestEnemy(player.x, player.y);
        if (target) {
          const [ox, oy] = this._launchPoint(player);
          this._fire(ox, oy, target);
          this._cooldown += player.missileInterval; // += preserves sub-frame accuracy, same as Bullets
        } else {
          this._cooldown = 0.2; // nothing to target yet — retry shortly rather than stalling a full interval
        }
      }
    }

    const { speed, turnRate, maxLife, proximityRadius, noTargetAccel } = Config.player.missiles;
    const { width: vW, height: vH } = Config.virtual;
    const prox2 = proximityRadius * proximityRadius;
    const offscreenMargin = 60; // vp — beyond this the missile is unambiguously gone, see the "rushing off" branch below

    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._age[i]  += dt;
      this._hTick[i] += dt;

      // Retarget every frame the current target is missing/dead — same
      // query the fire-cooldown branch above uses — rather than coasting
      // toward wherever it used to be. `target` stays null for the rest of
      // THIS frame if nothing's alive to chase; see the fork below for what
      // that means for movement/detonation this frame. A later frame can
      // still pick this back up the instant a new enemy appears, since this
      // check runs unconditionally every time.
      let target = this._targets[i];
      if (!target || !target.alive) {
        target = waveManager?.nearestEnemy(this._x[i], this._y[i]) ?? null;
        this._targets[i] = target;
      }

      if (target) {
        // ── Homing — same cross-product steering as Rockets.js's own
        // homing, see that file's doc for the math.
        const ux = this._vx[i] / speed;
        const uy = this._vy[i] / speed;
        const ddx = target.x - this._x[i];
        const ddy = target.y - this._y[i];
        const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const tx = ddx / dlen;
        const ty = ddy / dlen;
        const cross = ux * ty - uy * tx;
        const maxT  = turnRate * dt;
        const turn  = cross >= 0 ? Math.min(cross, maxT) : Math.max(cross, -maxT);
        const nux = ux - turn * uy;
        const nuy = uy + turn * ux;
        const nlen = Math.sqrt(nux * nux + nuy * nuy) || 1;
        this._vx[i] = (nux / nlen) * speed;
        this._vy[i] = (nuy / nlen) * speed;
      } else {
        // ── Nothing left to chase — hold the current heading (no more
        // turning) and accelerate, so it visibly rushes off the screen
        // instead of detonating on the spot or drifting at cruise speed.
        const cur = Math.sqrt(this._vx[i] * this._vx[i] + this._vy[i] * this._vy[i]) || speed;
        const boosted = cur + noTargetAccel * dt;
        this._vx[i] = (this._vx[i] / cur) * boosted;
        this._vy[i] = (this._vy[i] / cur) * boosted;
      }

      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;

      if (this._hTick[i] >= TRAIL_STEP) {
        this._hTick[i] -= TRAIL_STEP;
        const head = (this._hHead[i] + 1) % TRAIL_HIST;
        this._hHead[i] = head;
        const base = i * TRAIL_HIST;
        this._hx[base + head] = this._x[i];
        this._hy[base + head] = this._y[i];
      }

      if (target) {
        const dx2 = target.x - this._x[i];
        const dy2 = target.y - this._y[i];
        if (dx2 * dx2 + dy2 * dy2 <= prox2) {
          this._onHit(target);
          this._onDetonate(this._x[i], this._y[i]);
          continue; // remove — compact in place, same as every other removal branch below
        }
      } else if (
        this._x[i] < -offscreenMargin || this._x[i] > vW + offscreenMargin ||
        this._y[i] < -offscreenMargin || this._y[i] > vH + offscreenMargin
      ) {
        continue; // rushed off the edge — just gone, no explosion (unlike every other removal branch here)
      }
      if (this._age[i] >= maxLife) {
        this._onDetonate(this._x[i], this._y[i]);
        continue;
      }

      // Keep alive — compact in place
      if (w !== i) {
        this._x[w] = this._x[i];   this._y[w] = this._y[i];
        this._vx[w] = this._vx[i]; this._vy[w] = this._vy[i];
        this._age[w] = this._age[i]; this._targets[w] = this._targets[i];
        this._hHead[w] = this._hHead[i];
        this._hTick[w] = this._hTick[i];
        this._hx.copyWithin(w * TRAIL_HIST, i * TRAIL_HIST, (i + 1) * TRAIL_HIST);
        this._hy.copyWithin(w * TRAIL_HIST, i * TRAIL_HIST, (i + 1) * TRAIL_HIST);
      }
      w++;
    }
    this._count = w;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;

    const cfg   = Config.player.missiles;
    const fadeT = cfg.fadeStart / cfg.maxLife;
    let batchAlpha = 1;

    for (let i = 0; i < this._count; i++) {
      const base = i * TRAIL_HIST;
      const head = this._hHead[i];
      const p    = this._pool[i];

      for (let j = 0; j < TRAIL_HIST; j++) {
        const k = (head + 1 + j) % TRAIL_HIST; // oldest first
        p.points[j][0] = this._hx[base + k];
        p.points[j][1] = this._hy[base + k];
      }
      p.points[TRAIL_HIST][0] = this._x[i];
      p.points[TRAIL_HIST][1] = this._y[i];

      const lt = this._age[i] / cfg.maxLife;
      if (lt > fadeT) {
        const a = 1 - (lt - fadeT) / (1 - fadeT);
        if (a < batchAlpha) batchAlpha = a;
      }
    }

    this._style.alpha = batchAlpha;
    renderer.strokePaths(this._pool, this._style, this._count);

    // Body silhouette on top of the trail — rotated to face each missile's
    // current travel direction, same no-atan2 trick as Rockets.js.
    for (let i = 0; i < this._count; i++) {
      const vx = this._vx[i], vy = this._vy[i];
      const spd = Math.sqrt(vx * vx + vy * vy) || 1;
      const cos = vx / spd, sin = vy / spd;
      const bp  = this._bodyPool[i].points;
      for (let j = 0; j < BODY_LOCAL_PTS.length; j++) {
        const lx = BODY_LOCAL_PTS[j][0], ly = BODY_LOCAL_PTS[j][1];
        bp[j][0] = this._x[i] + lx * cos - ly * sin;
        bp[j][1] = this._y[i] + lx * sin + ly * cos;
      }
    }
    this._bodyStyle.alpha = batchAlpha;
    renderer.fillStrokePaths(this._bodyPool, this._bodyStyle, this._count);
  }

  /** True while any missile is still in flight. */
  get active() { return this._count > 0; }

  // ---------------------------------------------------------------------------

  /**
   * Where the next missile launches from — dead-center on the player until
   * `Player.hasWingMissilePods` (missiles level 3), after which it
   * alternates between the left/right wing pod offsets each shot (see
   * Config.player.missiles.wingOffsetX/Y and Player.js's own matching
   * MISSILE_POD_PATHS hull decoration).
   */
  _launchPoint(player) {
    if (!player.hasWingMissilePods) return [player.x, player.y];
    this._launchSide = -this._launchSide;
    const { wingOffsetX, wingOffsetY } = Config.player.missiles;
    return [player.x + wingOffsetX * this._launchSide, player.y + wingOffsetY];
  }

  _fire(ox, oy, target) {
    if (this._count >= MAX) return;
    const { speed } = Config.player.missiles;
    const [vx, vy] = directionalVelocity(ox, oy, target.x, target.y, speed);
    const i = this._count++;

    this._x[i]   = ox;
    this._y[i]   = oy;
    this._vx[i]  = vx;
    this._vy[i]  = vy;
    this._age[i] = 0;
    this._targets[i] = target;
    this._hHead[i] = 0;
    this._hTick[i] = 0;

    const base = i * TRAIL_HIST;
    for (let k = 0; k < TRAIL_HIST; k++) {
      this._hx[base + k] = ox;
      this._hy[base + k] = oy;
    }
  }
}
