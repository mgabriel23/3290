/**
 * WaveManager.js
 * Orchestrates enemy spawning, separation, and owns all active enemies for
 * one level's wave.
 *
 * New this version:
 *  - Owns a Particles pool; emits a magenta spark burst on each enemy kill.
 *  - _resolveOverlaps() checks all enemy pairs each frame and calls
 *    enemy.relocate() on any that are too close, preventing them from
 *    stacking on top of each other.
 *  - handleBulletHit(enemy) is the single call-site for collision effects —
 *    GameplayScene calls this instead of enemy.hit() directly so particle
 *    emission stays co-located with the kill logic.
 */
import { Config } from '../core/Config.js';
import { Enemy, SCOUT_HULL_PTS } from './Enemy.js';
import { EnemyBullets } from './EnemyBullet.js';
import { Particles } from './Particles.js';

// Pre-allocated world-space hull path pools — reused every frame, zero heap allocations.
// WaveManager transforms each enemy's local hull points into world space here, then passes
// the two pools to fillStrokePaths with singleStroke:true for 1 GPU shadow pass per group.
const MAX_BATCH = 16; // ceiling above the largest wave defined in Config
const _PTS      = SCOUT_HULL_PTS.length;
const _normalHulls = Array.from({ length: MAX_BATCH }, () =>
  ({ points: Array.from({ length: _PTS }, () => [0, 0]), closed: true }));
const _flashHulls  = Array.from({ length: MAX_BATCH }, () =>
  ({ points: Array.from({ length: _PTS }, () => [0, 0]), closed: true }));

export class WaveManager {
  /**
   * @param {number} level  1-based. Values beyond the config array reuse the last entry.
   */
  constructor(level) {
    const levels = Config.waves.levels;
    this._waveCfg = levels[Math.min(level - 1, levels.length - 1)];

    this._totalToSpawn = this._waveCfg.enemies.reduce((s, g) => s + g.count, 0);
    this._spawnIdx   = 0;
    this._allSpawned = false;
    this._spawnTimer = 0; // 0 → first enemy spawns on the first update tick

    this._enemies      = [];
    this._enemyBullets = new EnemyBullets();
    this._particles    = new Particles(Config.enemy.scout.color);

    // Lazy audio pool — allocated on first kill so construction never front-loads
    // HTMLMediaElement objects before any enemy has actually died.
    this._sfxPool = null;
    this._sfxIdx  = 0;

    this.waveClear = false;
  }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   */
  update(dt, playerX, playerY) {
    // Particles always drain — keeps death explosions alive through the level transition
    this._particles.update(dt);

    if (this.waveClear) return;

    // ── Spawn ─────────────────────────────────────────────────────────────────
    if (!this._allSpawned) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0 && this._spawnIdx < this._totalToSpawn) {
        this._spawnNext();
        const group = this._groupForIdx(this._spawnIdx);
        this._spawnTimer = group ? group.spawnInterval : 1;
      }
    }

    // ── Update enemies ────────────────────────────────────────────────────────
    const onFire = (ox, oy, tx, ty) => this._enemyBullets.fire(ox, oy, tx, ty);
    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].update(dt, playerX, playerY, onFire);
    }

    // Prevent enemies from overlapping
    this._resolveOverlaps();

    // Remove dead (compact in-place, no allocation)
    let w = 0;
    for (let i = 0; i < this._enemies.length; i++) {
      if (this._enemies[i].alive) {
        if (w !== i) this._enemies[w] = this._enemies[i];
        w++;
      }
    }
    this._enemies.length = w;

    this._enemyBullets.update(dt);

    if (this._allSpawned && this._enemies.length === 0) this.waveClear = true;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    this._enemyBullets.render(renderer);

    // ── Flames first — must render behind hulls ───────────────────────────────
    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].renderFlame(renderer);
    }

    // ── Hull batch — transform all hulls to world space, draw in ≤2 passes ───
    // Separating into flash vs. normal groups means at most 2 fillStrokePaths
    // calls (2 GPU shadow passes) no matter how many enemies are on screen,
    // vs. one pass per enemy in the naive approach.
    const cfg = Config.enemy.scout;
    let nCount = 0, fCount = 0;
    for (let i = 0; i < this._enemies.length; i++) {
      const e       = this._enemies[i];
      const isFlash = e._hitFlash > 0;
      const pool    = isFlash ? _flashHulls  : _normalHulls;
      const idx     = isFlash ? fCount++     : nCount++;
      const c       = Math.cos(e.angle);
      const s       = Math.sin(e.angle);
      const path    = pool[idx];
      for (let j = 0; j < _PTS; j++) {
        const lx = SCOUT_HULL_PTS[j][0];
        const ly = SCOUT_HULL_PTS[j][1];
        path.points[j][0] = e.x + c * lx - s * ly;
        path.points[j][1] = e.y + s * lx + c * ly;
      }
    }
    if (nCount > 0) renderer.fillStrokePaths(_normalHulls, {
      fillColor:    cfg.fillColor, strokeColor: cfg.color,
      lineWidth:    cfg.lineWidth, glowBlur:    cfg.glowBlur,
      glowColor:    cfg.color,    singleStroke: true,
    }, nCount);
    if (fCount > 0) renderer.fillStrokePaths(_flashHulls, {
      fillColor:   '#ffffff', strokeColor: '#ffffff',
      lineWidth:   cfg.lineWidth, glowBlur: cfg.hitGlowBlur,
      glowColor:   '#ffffff', singleStroke: true,
    }, fCount);

    // ── Engine cores last — render on top of hulls ────────────────────────────
    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].renderCore(renderer);
    }

    this._particles.render(renderer); // explosions on top of everything
  }

  /** Called by GameplayScene when a player bullet hits an enemy. */
  handleBulletHit(enemy) {
    const killed = enemy.hit();
    if (killed) {
      this._particles.emit(enemy.x, enemy.y);
      this._playExplosionSfx();
    }
  }

  /** Direct reference — GameplayScene runs the bullet↔enemy collision loop. */
  get enemies() { return this._enemies; }

  /**
   * True once all enemies are dead AND all particle/ring effects have finished
   * animating. GameplayScene waits for this before nulling the manager and
   * advancing to the next level — prevents explosions from being cut short.
   */
  get isDone() { return this.waveClear && !this._particles.active; }

  // ---------------------------------------------------------------------------

  /**
   * Physics-style overlap resolution — runs every frame, no cooldowns.
   *
   * For each overlapping pair, compute the penetration depth and push both
   * ships apart by slightly more than half of it so the gap is fully closed
   * in one frame. Positions are hard-clamped to the valid rest-zone bounds
   * so no enemy can be pushed off-screen. Entering enemies are skipped since
   * their position is driven by the entry animation, not by free placement.
   */
  _resolveOverlaps() {
    const { minSeparation, restXMargin, restYMin, restYMax } = Config.enemy.scout;
    const { width: vW, height: vH } = Config.virtual;
    const xLo = restXMargin,      xHi = vW - restXMargin;
    const yLo = vH * restYMin,    yHi = vH * restYMax;
    const min2 = minSeparation * minSeparation;

    for (let i = 0; i < this._enemies.length; i++) {
      const a = this._enemies[i];
      if (a._state === 'entering') continue;

      for (let j = i + 1; j < this._enemies.length; j++) {
        const b = this._enemies[j];
        if (b._state === 'entering') continue;

        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        const dist2 = ddx * ddx + ddy * ddy;
        if (dist2 >= min2 || dist2 < 0.01) continue;

        const dist = Math.sqrt(dist2);
        // push = slightly over half the gap so the pair ends up at minSeparation apart
        const push = (minSeparation - dist) * 0.55;
        const nx   = ddx / dist;
        const ny   = ddy / dist;

        a.x = Math.max(xLo, Math.min(xHi, a.x - nx * push));
        a.y = Math.max(yLo, Math.min(yHi, a.y - ny * push));
        b.x = Math.max(xLo, Math.min(xHi, b.x + nx * push));
        b.y = Math.max(yLo, Math.min(yHi, b.y + ny * push));
      }
    }
  }

  _spawnNext() {
    const { width: vW, height: vH } = Config.virtual;
    const { restXMargin, restYMin, restYMax } = Config.enemy.scout;
    const spawnX = restXMargin + Math.random() * (vW - restXMargin * 2);
    const restX  = restXMargin + Math.random() * (vW - restXMargin * 2);
    const restY  = vH * (restYMin + Math.random() * (restYMax - restYMin));
    this._enemies.push(new Enemy(spawnX, restX, restY));
    this._spawnIdx++;
    if (this._spawnIdx >= this._totalToSpawn) this._allSpawned = true;
  }

  _groupForIdx(idx) {
    let offset = 0;
    for (const group of this._waveCfg.enemies) {
      offset += group.count;
      if (idx < offset) return group;
    }
    return null;
  }

  _playExplosionSfx() {
    if (!this._sfxPool) {
      const { src, volume, poolSize } = Config.enemy.scout.audio;
      this._sfxPool = Array.from({ length: poolSize }, () => {
        const a = new Audio(src);
        a.volume = volume;
        return a;
      });
    }
    const a = this._sfxPool[this._sfxIdx];
    this._sfxIdx = (this._sfxIdx + 1) % this._sfxPool.length;
    a.currentTime = 0;
    a.play().catch(() => {});
  }
}
