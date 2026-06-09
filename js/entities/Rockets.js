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
 * can emit a particle explosion at the impact point.
 *
 * Visual: a motion-trail polyline drawn through the rocket's recent position
 * history. When flying straight the trail is a straight line; when the homing
 * algorithm steers, the trail bends through the actual arc taken — no fake
 * sine wave, just the real flight path rendered as a glowing thread.
 * All trails are batched into one strokePaths call per frame.
 */
import { Config } from '../core/Config.js';

const MAX          = 16;   // matches Config.rocket.poolSize ceiling
const TRAIL_HIST   = 8;    // stored history positions per rocket
const TRAIL_PTS    = TRAIL_HIST + 1; // polyline points = history + current tip
const TRAIL_STEP   = 0.04; // seconds between recorded positions (~2.4 frames at 60fps)

export class Rockets {
  /**
   * @param {{ onDetonate: (x: number, y: number) => void }} callbacks
   */
  constructor({ onDetonate }) {
    this._onDetonate = onDetonate;

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

    const { color, lineWidth, glowBlur } = Config.rocket;
    this._style = { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true };
  }

  /**
   * Launch one rocket from `(ox, oy)` initially aimed at `(tx, ty)`.
   * @param {number} ox @param {number} oy  origin (rocketeer centre)
   * @param {number} tx @param {number} ty  initial target (player centre at fire time)
   */
  fire(ox, oy, tx, ty) {
    if (this._count >= MAX) return;
    const { speed } = Config.rocket;
    const dx  = tx - ox;
    const dy  = ty - oy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const i   = this._count++;

    this._x[i]    = ox;
    this._y[i]    = oy;
    this._vx[i]   = (dx / len) * speed;
    this._vy[i]   = (dy / len) * speed;
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

      // ── Homing: steer toward the player, clamped by turn rate ──────────────
      const curAngle = Math.atan2(this._vy[i], this._vx[i]);
      const tgtAngle = Math.atan2(playerY - this._y[i], playerX - this._x[i]);
      let   diff     = tgtAngle - curAngle;
      if (diff >  Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      const newAngle  = curAngle + Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);
      this._vx[i]     = Math.cos(newAngle) * speed;
      this._vy[i]     = Math.sin(newAngle) * speed;

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
      if (dx2 * dx2 + dy2 * dy2 <= prox2 || this._age[i] >= maxLife) {
        this._onDetonate(this._x[i], this._y[i]);
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

    renderer.strokePaths(this._pool, { ...this._style, alpha: batchAlpha }, this._count);
  }

  /** True while any rocket is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }
}
