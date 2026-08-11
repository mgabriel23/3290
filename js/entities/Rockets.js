/**
 * Rockets.js
 * Homing rocket pool — fired by Rocketeer enemies.
 *
 * Each rocket launches toward the player's position at fire time, then
 * continuously steers to track wherever the player moves. Detonation
 * triggers on whichever comes first:
 *   • Proximity — the rocket gets within Config.rocket.proximityRadius vp
 *   • Timer     — the rocket exhausts its fuel (Config.rocket.maxLife seconds)
 *
 * When either condition fires, `onDetonate(x, y)` is called so WaveManager
 * can emit a particle explosion at the impact point. A proximity detonation
 * additionally calls `onPlayerHit()` — it actually reached the player,
 * unlike a timeout detonation — which WaveManager.checkPlayerHit reads to
 * apply `Config.rocket.damage`.
 *
 * Visual: a small nose-to-fins dart silhouette (see BODY_LOCAL_PTS) is drawn
 * at the rocket's current position, rotated to face its current travel
 * direction — this is what actually reads as "a rocket," rather than the
 * motion-trail polyline alone (still drawn behind it, through the rocket's
 * recent position history — when flying straight the trail is a straight
 * line, when the homing algorithm steers, the trail bends through the real
 * arc taken). Both the trail and every rocket's body are each batched into
 * one draw call per frame regardless of rocket count.
 */
import { Config } from '../core/Config.js';
import { directionalVelocity } from '../core/vectorMath.js';

const MAX          = Config.rocket.poolSize;
const TRAIL_HIST   = Config.rocket.trailHistory; // stored history positions per rocket
const TRAIL_PTS    = TRAIL_HIST + 1; // polyline points = history + current tip
const TRAIL_STEP   = Config.rocket.trailStep; // seconds between recorded positions

// Local-space dart silhouette, nose pointing toward +X ("forward") — rotated
// to each rocket's current travel direction in render(). Nose tip, tapered
// shoulders, fins flared out near the tail, then a slight tail notch (engine
// nozzle indent) — reads as a small missile in flight, not a bare capsule.
const { halfLen: ROCKET_LEN, bodyHalfWidth: ROCKET_HW } = Config.rocket;
const BODY_LOCAL_PTS = [
  [ ROCKET_LEN,          0],
  [ ROCKET_LEN * 0.25,   ROCKET_HW * 0.5],
  [-ROCKET_LEN * 0.55,   ROCKET_HW],
  [-ROCKET_LEN * 0.85,   ROCKET_HW * 0.35],
  [-ROCKET_LEN,          0],
  [-ROCKET_LEN * 0.85,  -ROCKET_HW * 0.35],
  [-ROCKET_LEN * 0.55,  -ROCKET_HW],
  [ ROCKET_LEN * 0.25,  -ROCKET_HW * 0.5],
];

export class Rockets {
  /**
   * @param {{ onDetonate: (x: number, y: number) => void, onPlayerHit: () => void }} callbacks
   *   `onDetonate` fires on every detonation (proximity or timeout) for the
   *   visual explosion; `onPlayerHit` fires only on a proximity detonation
   *   (i.e. it actually reached the player, not just ran out of fuel).
   */
  constructor({ onDetonate, onPlayerHit }) {
    this._onDetonate  = onDetonate;
    this._onPlayerHit = onPlayerHit;

    this._x    = new Float32Array(MAX);
    this._y    = new Float32Array(MAX);
    this._vx   = new Float32Array(MAX);
    this._vy   = new Float32Array(MAX);
    this._age  = new Float32Array(MAX);
    this._count = 0;

    // Position history ring buffers — flat layout: rocket i uses [i*TRAIL_HIST .. (i+1)*TRAIL_HIST)
    this._hx    = new Float32Array(MAX * TRAIL_HIST);
    this._hy    = new Float32Array(MAX * TRAIL_HIST);
    this._hHead = new Uint8Array(MAX);   // ring-buffer write head per rocket
    this._hTick = new Float32Array(MAX); // time accumulator until next history sample

    // Pre-allocated trail path pool — TRAIL_PTS points each, mutated in-place
    this._pool = Array.from({ length: MAX }, () => ({
      points: Array.from({ length: TRAIL_PTS }, () => [0, 0]),
      closed: false,
    }));

    // Pre-allocated rocket-body path pool — one dart silhouette per slot,
    // world-space points rewritten (rotated + translated) each frame in render().
    this._bodyPool = Array.from({ length: MAX }, () => ({
      points: BODY_LOCAL_PTS.map(() => [0, 0]),
      closed: true,
    }));

    const { color, lineWidth, glowBlur, bodyFillColor } = Config.rocket;
    // Mutable style objects — alpha is overwritten each render, no per-frame allocation
    this._style = { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true, alpha: 1 };
    this._bodyStyle = {
      fillColor: bodyFillColor, strokeColor: color, lineWidth, glowColor: color, glowBlur, singleStroke: true, alpha: 1,
    };
  }

  /**
   * Launch one rocket from `(ox, oy)` initially aimed at `(tx, ty)`.
   * @param {number} ox @param {number} oy  origin (rocketeer centre)
   * @param {number} tx @param {number} ty  initial target (player centre at fire time)
   */
  fire(ox, oy, tx, ty) {
    if (this._count >= MAX) return;
    const { speed } = Config.rocket;
    const [vx, vy] = directionalVelocity(ox, oy, tx, ty, speed);
    const i = this._count++;

    this._x[i]    = ox;
    this._y[i]    = oy;
    this._vx[i]   = vx;
    this._vy[i]   = vy;
    this._age[i]  = 0;
    this._hHead[i] = 0;
    this._hTick[i] = 0;

    // Pre-fill all history at spawn point so the trail builds naturally from there
    const base = i * TRAIL_HIST;
    for (let k = 0; k < TRAIL_HIST; k++) {
      this._hx[base + k] = ox;
      this._hy[base + k] = oy;
    }
  }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   */
  update(dt, playerX, playerY) {
    const { speed, turnRate, maxLife, proximityRadius } = Config.rocket;
    const prox2 = proximityRadius * proximityRadius;

    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._age[i]  += dt;
      this._hTick[i] += dt;

      // ── Homing: vector cross-product steering — no atan2/cos/sin ──────────
      // vx/vy always has magnitude ≈ speed (enforced by the renorm below),
      // so dividing by speed gives the unit current direction directly.
      const ux   = this._vx[i] / speed;
      const uy   = this._vy[i] / speed;

      const ddx  = playerX - this._x[i];
      const ddy  = playerY - this._y[i];
      const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      const tx   = ddx / dlen;   // unit target direction
      const ty   = ddy / dlen;

      // Cross product = sin(angle from current to target) — sign tells which way to turn.
      // For |turn| ≤ 0.037 rad (turnRate=2.2 at 60fps), sin ≈ angle to < 0.1% error.
      const cross = ux * ty - uy * tx;
      const maxT  = turnRate * dt;
      const turn  = cross >= 0 ? Math.min(cross, maxT) : Math.max(cross, -maxT);

      // Rotate by `turn` radians — small-angle linear approximation (exact for |turn|≤0.04)
      const nux  = ux - turn * uy;
      const nuy  = uy + turn * ux;
      // Renormalize to prevent float-point drift accumulating over seconds
      const nlen = Math.sqrt(nux * nux + nuy * nuy) || 1;
      this._vx[i] = (nux / nlen) * speed;
      this._vy[i] = (nuy / nlen) * speed;

      // ── Move ────────────────────────────────────────────────────────────────
      this._x[i] += this._vx[i] * dt;
      this._y[i] += this._vy[i] * dt;

      // ── Record position history ─────────────────────────────────────────────
      if (this._hTick[i] >= TRAIL_STEP) {
        this._hTick[i] -= TRAIL_STEP;
        const head = (this._hHead[i] + 1) % TRAIL_HIST;
        this._hHead[i] = head;
        const base = i * TRAIL_HIST;
        this._hx[base + head] = this._x[i];
        this._hy[base + head] = this._y[i];
      }

      // ── Detonation check ────────────────────────────────────────────────────
      const dx2 = playerX - this._x[i];
      const dy2 = playerY - this._y[i];
      const proximityHit = dx2 * dx2 + dy2 * dy2 <= prox2;
      if (proximityHit || this._age[i] >= maxLife) {
        this._onDetonate(this._x[i], this._y[i]);
        if (proximityHit) this._onPlayerHit();
        continue;
      }

      // Keep alive — compact in place
      if (w !== i) {
        this._x[w]    = this._x[i];    this._y[w]    = this._y[i];
        this._vx[w]   = this._vx[i];   this._vy[w]   = this._vy[i];
        this._age[w]  = this._age[i];
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

    const cfg   = Config.rocket;
    const fadeT = cfg.fadeStart / cfg.maxLife;
    let batchAlpha = 1;

    for (let i = 0; i < this._count; i++) {
      const base = i * TRAIL_HIST;
      const head = this._hHead[i];
      const p    = this._pool[i];

      // Build polyline oldest → newest: history positions then current tip.
      // Ring-buffer read: slot (head+1) is the oldest, slot (head) is the most recent stored.
      for (let j = 0; j < TRAIL_HIST; j++) {
        const k = (head + 1 + j) % TRAIL_HIST; // oldest first
        p.points[j][0] = this._hx[base + k];
        p.points[j][1] = this._hy[base + k];
      }
      // Current position as the tip — always exactly where the rocket is now
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

    // Body silhouette on top of the trail — rotated to face each rocket's
    // current travel direction. `(cos, sin)` derived straight from the
    // (already-normalized-speed) velocity vector, same no-atan2 trick
    // update()'s own homing math uses, rather than an extra trig call.
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
    this._bodyStyle.alpha = batchAlpha; // same end-of-life fade as the trail
    renderer.fillStrokePaths(this._bodyPool, this._bodyStyle, this._count);
  }

  /** True while any rocket is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }
}
