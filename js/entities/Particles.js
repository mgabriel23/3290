/**
 * Particles.js
 * Explosion effects for enemy deaths.
 *
 * Each emit() produces two effects simultaneously:
 *
 *   Shockwave rings — two concentric expanding circles. An inner ring (small,
 *   fast) delivers the immediate impact "pop"; an outer ring (larger, slower)
 *   is the shockwave traveling outward. Together they give a "sound wave"
 *   double-pulse that reads as force rather than just sparkle. Rings are cheap
 *   plain objects; at most one explosion per enemy per wave means the pool
 *   never holds more than ~8 live rings at once.
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

const MAX  = 256; // well above any expected burst count
const HALF = 3;   // half-length of each spark line, virtual px

// Inner ring: tight, fast — the "pop" of the impact
const INNER = { life: 0.28, startR: 6,  maxR: 38 };
// Outer ring: wide, slower — the shockwave traveling outward
const OUTER = { life: 0.52, startR: 10, maxR: 72 };

export class Particles {
  /**
   * @param {string} color  hex color for all effects emitted by this pool
   * @param {number} [sparksPerEmit] sparks spawned per explosion — lower
   *   for pools whose source can emit many explosions in close succession
   *   (e.g. large enemy formations), keeping the shared glow pass's
   *   bounding box smaller on low-end devices
   */
  constructor(color, sparksPerEmit = 14) {
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

    // ── Shockwave ring pool ───────────────────────────────────────────────────
    this._rings = [];
    this._ringColor = color;
  }

  /**
   * Trigger a full explosion at (x, y): inner + outer shockwave rings
   * plus a radial spark burst.
   * @param {number} x @param {number} y
   */
  emit(x, y) {
    // Two rings per explosion — inner "pop" then outer shockwave
    this._rings.push({ x, y, age: 0, ...INNER });
    this._rings.push({ x, y, age: 0, ...OUTER });

    // Sparks — faster than before so they burst through and past the inner ring
    for (let i = 0; i < this._sparksPerEmit && this._count < MAX; i++) {
      const a  = Math.random() * Math.PI * 2;
      const s  = 140 + Math.random() * 240;
      const ca = Math.cos(a), sa = Math.sin(a);
      const j  = this._count++;
      this._x[j]    = x;
      this._y[j]    = y;
      this._vx[j]   = ca * s;
      this._vy[j]   = sa * s;
      this._ndx[j]  = ca;  // unit direction — invariant under scalar drag
      this._ndy[j]  = sa;
      this._age[j]  = 0;
      this._life[j] = 0.18 + Math.random() * 0.18;
    }
  }

  /** @param {number} dt */
  update(dt) {
    // Update rings — iterate backward so splice doesn't shift unvisited indices
    for (let i = this._rings.length - 1; i >= 0; i--) {
      this._rings[i].age += dt;
      if (this._rings[i].age >= this._rings[i].life) this._rings.splice(i, 1);
    }

    // Update sparks
    const drag = 1 - dt * 5;
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
    return this._count > 0 || this._rings.length > 0;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    // Shockwave rings — drawn behind sparks so they read as the ground layer
    for (let i = 0; i < this._rings.length; i++) {
      const ring   = this._rings[i];
      const t      = ring.age / ring.life;
      const eased  = t * (2 - t);                  // ease-out quad: fast start, soft finish
      const radius = ring.startR + eased * (ring.maxR - ring.startR);
      const alpha  = 1 - t;                         // linear fade
      const lw     = 1 + (1 - t) * 2;              // 3→1 virtual px as ring expands

      // No glowBlur — eliminates one GPU shadow pass per ring per frame.
      // The expanding circle with fading alpha reads clearly as a shockwave without glow.
      renderer.strokeCircle(ring.x, ring.y, radius, {
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
