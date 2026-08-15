/**
 * Particles.js
 * Explosion effects for enemy deaths.
 *
 * Each emit() produces two effects simultaneously:
 *
 *   Shockwave rings — two concentric expanding circles. An inner ring (small,
 *   fast) delivers the immediate impact "pop"; an outer ring (larger, slower)
 *   is the shockwave traveling outward. Together they give a "sound wave"
 *   double-pulse that reads as force rather than just sparkle. Same
 *   pre-allocated-typed-array, swap-compact pooling shape as the spark burst
 *   below — a burst kill (e.g. the player's skill bomb) can emit rings for
 *   many enemies in a single frame, so `Config.particles.maxRings` sizes the
 *   pool well above ordinary single-explosion counts.
 *
 *   Spark burst — short glowing line segments fanning outward from the blast
 *   centre, aligned with their velocity so they look like ejected shards. All
 *   active sparks are batched into a single strokePaths call — one shadow-blur
 *   GPU pass per frame regardless of spark count. Typed arrays keep positions
 *   cache-friendly; path objects are pre-allocated and mutated in place, so
 *   update + render produce zero per-frame heap allocations.
 *
 * Sparks are timed to pop and fade while the outer ring is still traveling,
 * so the eye tracks the ring rather than the sparks after the initial burst.
 */
import { Config } from '../core/Config.js';

const {
  maxSparks: MAX, maxRings: MAX_RINGS, sparkHalfLength: HALF,
  sparkSpeedMin, sparkSpeedMax, sparkLifeMin, sparkLifeMax, sparkDrag,
  defaultSparksPerEmit, innerRing: INNER, outerRing: OUTER,
} = Config.particles;

export class Particles {
  /**
   * @param {string} color  hex color for all effects emitted by this pool
   * @param {number} [sparksPerEmit] sparks spawned per explosion — lower
   *   for pools whose source can emit many explosions in close succession
   *   (e.g. large enemy formations), keeping the shared glow pass's
   *   bounding box smaller on low-end devices
   */
  constructor(color, sparksPerEmit = defaultSparksPerEmit) {
    this._sparksPerEmit = sparksPerEmit;
    // ── Spark pool (typed arrays, zero per-frame allocation) ──────────────────
    this._x    = new Float32Array(MAX);
    this._y    = new Float32Array(MAX);
    this._vx   = new Float32Array(MAX);
    this._vy   = new Float32Array(MAX);
    this._age  = new Float32Array(MAX);
    this._life = new Float32Array(MAX);
    // Pre-normalized travel direction — drag is scalar so direction never changes;
    // computing once at emit eliminates one sqrt per spark per render frame.
    this._ndx  = new Float32Array(MAX);
    this._ndy  = new Float32Array(MAX);
    this._count = 0;

    this._pool = Array.from({ length: MAX }, () => ({
      points: [[0, 0], [0, 0]],
      closed: false,
    }));

    this._sparkStyle = {
      color,
      lineWidth: 2,
      glowBlur: 7,
      lineCap: 'round',
      singleStroke: true,
    };

    // ── Shockwave ring pool (typed arrays, zero per-frame/per-emit allocation,
    // same swap-compact shape as the spark pool above) ────────────────────────
    this._ringX      = new Float32Array(MAX_RINGS);
    this._ringY      = new Float32Array(MAX_RINGS);
    this._ringAge    = new Float32Array(MAX_RINGS);
    this._ringLife   = new Float32Array(MAX_RINGS);
    this._ringStartR = new Float32Array(MAX_RINGS);
    this._ringMaxR   = new Float32Array(MAX_RINGS);
    this._ringCount  = 0;
    this._ringColor  = color;
  }

  /**
   * Trigger a full explosion at (x, y): inner + outer shockwave rings
   * plus a radial spark burst.
   * @param {number} x @param {number} y
   */
  emit(x, y) {
    // Two rings per explosion — inner "pop" then outer shockwave
    this._pushRing(x, y, INNER);
    this._pushRing(x, y, OUTER);

    // Sparks — faster than before so they burst through and past the inner ring
    for (let i = 0; i < this._sparksPerEmit && this._count < MAX; i++) {
      const a  = Math.random() * Math.PI * 2;
      const s  = sparkSpeedMin + Math.random() * (sparkSpeedMax - sparkSpeedMin);
      const ca = Math.cos(a), sa = Math.sin(a);
      const j  = this._count++;
      this._x[j]    = x;
      this._y[j]    = y;
      this._vx[j]   = ca * s;
      this._vy[j]   = sa * s;
      this._ndx[j]  = ca;  // unit direction — invariant under scalar drag
      this._ndy[j]  = sa;
      this._age[j]  = 0;
      this._life[j] = sparkLifeMin + Math.random() * (sparkLifeMax - sparkLifeMin);
    }
  }

  /** Append one ring at (x, y) using `template`'s life/startR/maxR — no allocation. */
  _pushRing(x, y, template) {
    if (this._ringCount >= MAX_RINGS) return;
    const i = this._ringCount++;
    this._ringX[i]      = x;
    this._ringY[i]      = y;
    this._ringAge[i]    = 0;
    this._ringLife[i]   = template.life;
    this._ringStartR[i] = template.startR;
    this._ringMaxR[i]   = template.maxR;
  }

  /** @param {number} dt */
  update(dt) {
    // Update rings — same swap-compact pattern as the sparks below
    let rw = 0;
    for (let i = 0; i < this._ringCount; i++) {
      this._ringAge[i] += dt;
      if (this._ringAge[i] < this._ringLife[i]) {
        if (rw !== i) {
          this._ringX[rw]      = this._ringX[i];      this._ringY[rw]    = this._ringY[i];
          this._ringAge[rw]    = this._ringAge[i];     this._ringLife[rw] = this._ringLife[i];
          this._ringStartR[rw] = this._ringStartR[i];  this._ringMaxR[rw] = this._ringMaxR[i];
        }
        rw++;
      }
    }
    this._ringCount = rw;

    // Update sparks
    const drag = 1 - dt * sparkDrag;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._age[i] += dt;
      if (this._age[i] < this._life[i]) {
        this._x[i]  += this._vx[i] * dt;
        this._y[i]  += this._vy[i] * dt;
        this._vx[i] *= drag;
        this._vy[i] *= drag;
        if (w !== i) {
          this._x[w]    = this._x[i];   this._y[w]    = this._y[i];
          this._vx[w]   = this._vx[i];  this._vy[w]   = this._vy[i];
          this._ndx[w]  = this._ndx[i]; this._ndy[w]  = this._ndy[i];
          this._age[w]  = this._age[i]; this._life[w] = this._life[i];
        }
        w++;
      }
    }
    this._count = w;
  }

  /** True while any spark or ring is still alive — used by WaveManager to delay level transition. */
  get active() {
    return this._count > 0 || this._ringCount > 0;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    // Shockwave rings — drawn behind sparks so they read as the ground layer
    for (let i = 0; i < this._ringCount; i++) {
      const age    = this._ringAge[i], life = this._ringLife[i];
      const t      = age / life;
      const eased  = t * (2 - t);                  // ease-out quad: fast start, soft finish
      const radius = this._ringStartR[i] + eased * (this._ringMaxR[i] - this._ringStartR[i]);
      const alpha  = 1 - t;                         // linear fade
      const lw     = 1 + (1 - t) * 2;              // 3→1 virtual px as ring expands

      // No glowBlur — eliminates one GPU shadow pass per ring per frame.
      // The expanding circle with fading alpha reads clearly as a shockwave without glow.
      renderer.strokeCircle(this._ringX[i], this._ringY[i], radius, {
        color:     this._ringColor,
        lineWidth: lw,
        alpha,
      });
    }

    // Sparks — use pre-normalized direction (no sqrt per frame)
    if (this._count === 0) return;
    for (let i = 0; i < this._count; i++) {
      const nx = this._ndx[i] * HALF;
      const ny = this._ndy[i] * HALF;
      const p  = this._pool[i];
      p.points[0][0] = this._x[i] - nx;
      p.points[0][1] = this._y[i] - ny;
      p.points[1][0] = this._x[i] + nx;
      p.points[1][1] = this._y[i] + ny;
    }
    renderer.strokePaths(this._pool, this._sparkStyle, this._count);
  }
}
