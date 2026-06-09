/**
 * Bullets.js
 * The player's auto-firing energy bolt stream.
 *
 * Fires a new bolt at Config.bullet.fireRate once per second while the
 * player's ship is ready (entry animation complete). Each bolt moves
 * straight up at Config.bullet.speed and is culled when it exits the
 * top of the screen.
 *
 * All bullet positions live in typed arrays for cache efficiency; all
 * path geometry is pre-allocated in a pool and mutated in place each
 * frame, so the render path produces zero per-frame heap allocations.
 * Every active bullet is batched into a single strokePaths call —
 * one shadow-blur GPU pass no matter how many are on screen.
 */
import { Config } from '../core/Config.js';

const MAX = 64; // well above steady-state peak (~10 at 7/s × 1.5s screen-cross time)

export class Bullets {
  constructor() {
    // Typed arrays — compact, cache-friendly bullet positions
    this._bx    = new Float32Array(MAX);
    this._by    = new Float32Array(MAX);
    this._count = 0;
    this._cooldown = 0;

    // Pre-allocated path objects — mutated in place per render frame,
    // then passed as a batch to strokePaths (no per-frame allocation).
    this._pool = Array.from({ length: MAX }, () => ({
      points: [[0, 0], [0, 0]],
      closed: false,
    }));
    this._renderBatch = []; // emptied (length=0) and refilled each frame

    const { color, lineWidth, glowBlur } = Config.bullet;
    // singleStroke: all bullets share one ctx.stroke() call → one shadow-blur
    // GPU pass per frame regardless of how many bullets are on screen.
    this._style = { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true };

    // Audio pool — pre-created so rapid retrigger layers rather than cuts
    const { src, volume, poolSize } = Config.bullet.audio;
    this._audioPool = Array.from({ length: poolSize }, () => {
      const a = new Audio(src);
      a.volume = volume;
      return a;
    });
    this._audioIdx = 0;
  }

  /**
   * Advance all bullets by `dt` seconds and auto-fire if the player is ready.
   * @param {number} dt
   * @param {{ x: number, y: number, ready: boolean }} player
   */
  update(dt, player) {
    const { fireRate, speed, spawnOffsetY } = Config.bullet;

    // Only count down and fire once the ship has landed — prevents the
    // cooldown from going deeply negative during the entry animation and
    // causing a burst of overlapping bullets the moment the ship settles.
    if (player.ready) {
      this._cooldown -= dt;
      if (this._cooldown <= 0) {
        this._fire(player.x, player.y + spawnOffsetY);
        this._cooldown += 1 / fireRate; // += preserves sub-frame accuracy
      }
    }

    // Move bolts upward; compact array to remove off-screen ones in-place
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._by[i] -= speed * dt;
      if (this._by[i] > -30) { // -30 gives glow headroom above y=0 before culling
        if (w !== i) {
          this._bx[w] = this._bx[i];
          this._by[w] = this._by[i];
        }
        w++;
      }
    }
    this._count = w;
  }

  /** Draw all active bullets as a single batched rounded-capsule stroke. */
  render(renderer) {
    if (this._count === 0) return;

    const hLen = Config.bullet.halfLen;
    this._renderBatch.length = 0;
    for (let i = 0; i < this._count; i++) {
      const p = this._pool[i];
      p.points[0][0] = this._bx[i];
      p.points[0][1] = this._by[i] - hLen;
      p.points[1][0] = this._bx[i];
      p.points[1][1] = this._by[i] + hLen;
      this._renderBatch.push(p);
    }
    renderer.strokePaths(this._renderBatch, this._style);
  }

  // ---------------------------------------------------------------------------

  _fire(x, y) {
    if (this._count >= MAX) return;
    this._bx[this._count] = x;
    this._by[this._count] = y;
    this._count++;

    const a = this._audioPool[this._audioIdx];
    this._audioIdx = (this._audioIdx + 1) % this._audioPool.length;
    a.currentTime = 0;
    a.play().catch(() => {});
  }
}
