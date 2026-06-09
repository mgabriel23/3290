/**
 * WaveManager.js
 * Orchestrates spawning, separation, and owns all active entities for
 * one level's wave (enemies of any type, their projectiles, explosions).
 *
 * Hull rendering is batched by (type × flash) into at most 3 fillStrokePaths
 * calls per frame — 3 GPU shadow passes regardless of enemy count:
 *   scout-normal | rocketeer-normal | flash (white, shared across types)
 *
 * Each enemy type routes its onFire callback to a different projectile pool:
 *   scout     → EnemyBullets (straight aimed capsule)
 *   rocketeer → Rockets (homing, detonates on proximity or timer)
 */
import { Config } from '../core/Config.js';
import { Enemy, SCOUT_HULL_PTS } from './Enemy.js';
import { EnemyBullets } from './EnemyBullet.js';
import { Rockets } from './Rockets.js';
import { Particles } from './Particles.js';

// Pre-allocated world-space hull pools — reused every frame, zero heap allocations.
const MAX_BATCH = 20;
const _PTS      = SCOUT_HULL_PTS.length;
const _mkPool   = () => Array.from({ length: MAX_BATCH }, () =>
  ({ points: Array.from({ length: _PTS }, () => [0, 0]), closed: true }));
const _scoutNormalHulls     = _mkPool();
const _rocketeerNormalHulls = _mkPool();
const _flashHulls           = _mkPool();

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
    this._spawnTimer = 0;

    this._enemies      = [];
    this._enemyBullets = new EnemyBullets();
    this._rockets      = new Rockets({
      onDetonate: (x, y) => {
        this._rocketeerParticles.emit(x, y);
        this._playExplosionSfx(Config.enemy.rocketeer.audio.volume);
      },
    });

    this._particles          = new Particles(Config.enemy.scout.color);
    this._rocketeerParticles = new Particles(Config.enemy.rocketeer.color);

    // Lazy SFX pool — single shared pool for both enemy types (same audio file).
    // Volume is set per-play so scout vs rocketeer kills can differ.
    this._sfxPool = null;
    this._sfxIdx  = 0;

    // Pre-bound fire callbacks — stored once so update() creates no closures per frame.
    this._fireBullet = (ox, oy, tx, ty) => this._enemyBullets.fire(ox, oy, tx, ty);
    this._fireRocket = (ox, oy, tx, ty) => this._rockets.fire(ox, oy, tx, ty);

    this.waveClear = false;
  }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   */
  update(dt, playerX, playerY) {
    // These all drain past waveClear so in-flight effects finish animating before
    // isDone returns true and the level transitions.
    this._particles.update(dt);
    this._rocketeerParticles.update(dt);
    this._rockets.update(dt, playerX, playerY);

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
    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      e.update(dt, playerX, playerY,
        e.type === 'rocketeer' ? this._fireRocket : this._fireBullet);
    }

    this._resolveOverlaps();

    // Remove dead enemies (compact in-place, no allocation)
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
    // ── Projectiles ───────────────────────────────────────────────────────────
    this._enemyBullets.render(renderer);
    this._rockets.render(renderer);

    // ── Engine flames — must render behind hulls ──────────────────────────────
    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].renderFlame(renderer);
    }

    // ── Hull batch — ≤3 GPU shadow passes regardless of enemy count ───────────
    const sCfg = Config.enemy.scout;
    const rCfg = Config.enemy.rocketeer;
    let snCount = 0, rnCount = 0, fCount = 0;

    for (let i = 0; i < this._enemies.length; i++) {
      const e       = this._enemies[i];
      const isFlash = e._hitFlash > 0;
      let pool, idx;
      if (isFlash) {
        pool = _flashHulls; idx = fCount++;
      } else if (e.type === 'rocketeer') {
        pool = _rocketeerNormalHulls; idx = rnCount++;
      } else {
        pool = _scoutNormalHulls; idx = snCount++;
      }
      const c    = Math.cos(e.angle);
      const s    = Math.sin(e.angle);
      const path = pool[idx];
      for (let j = 0; j < _PTS; j++) {
        const lx = SCOUT_HULL_PTS[j][0];
        const ly = SCOUT_HULL_PTS[j][1];
        path.points[j][0] = e.x + c * lx - s * ly;
        path.points[j][1] = e.y + s * lx + c * ly;
      }
    }

    if (snCount > 0) renderer.fillStrokePaths(_scoutNormalHulls, {
      fillColor: sCfg.fillColor, strokeColor: sCfg.color,
      lineWidth:  sCfg.lineWidth, glowBlur:   sCfg.glowBlur,
      glowColor:  sCfg.color,    singleStroke: true,
    }, snCount);
    if (rnCount > 0) renderer.fillStrokePaths(_rocketeerNormalHulls, {
      fillColor: rCfg.fillColor, strokeColor: rCfg.color,
      lineWidth:  rCfg.lineWidth, glowBlur:   rCfg.glowBlur,
      glowColor:  rCfg.color,    singleStroke: true,
    }, rnCount);
    if (fCount > 0) renderer.fillStrokePaths(_flashHulls, {
      fillColor: '#ffffff', strokeColor: '#ffffff',
      lineWidth:  sCfg.lineWidth, glowBlur:  sCfg.hitGlowBlur,
      glowColor: '#ffffff', singleStroke: true,
    }, fCount);

    // ── Engine cores — rendered on top of hulls ───────────────────────────────
    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].renderCore(renderer);
    }

    // ── Explosions ────────────────────────────────────────────────────────────
    this._particles.render(renderer);
    this._rocketeerParticles.render(renderer);
  }

  /** Called by GameplayScene when a player bullet hits an enemy. */
  handleBulletHit(enemy) {
    const killed = enemy.hit();
    if (killed) {
      if (enemy.type === 'rocketeer') {
        this._rocketeerParticles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.enemy.rocketeer.audio.volume);
      } else {
        this._particles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.enemy.scout.audio.volume);
      }
    }
  }

  /** Direct reference — GameplayScene runs the bullet↔enemy collision loop. */
  get enemies() { return this._enemies; }

  /**
   * True once all enemies are dead AND every effect (particles, rockets) has
   * finished animating. GameplayScene delays advancing to the next level until
   * this returns true so no explosion is cut short mid-animation.
   */
  get isDone() {
    return this.waveClear
      && !this._particles.active
      && !this._rocketeerParticles.active
      && !this._rockets.active;
  }

  // ---------------------------------------------------------------------------

  _resolveOverlaps() {
    // Use scout bounds as the common play-zone — both types share identical margins.
    const { restXMargin, restYMin, restYMax } = Config.enemy.scout;
    const { width: vW, height: vH } = Config.virtual;
    const xLo = restXMargin,   xHi = vW - restXMargin;
    const yLo = vH * restYMin, yHi = vH * restYMax;

    for (let i = 0; i < this._enemies.length; i++) {
      const a = this._enemies[i];
      if (a._state === 'entering') continue;

      for (let j = i + 1; j < this._enemies.length; j++) {
        const b = this._enemies[j];
        if (b._state === 'entering') continue;

        // Respect the stricter separation requirement of the two enemies
        const minSep = Math.max(a._cfg.minSeparation, b._cfg.minSeparation);
        const ddx    = b.x - a.x;
        const ddy    = b.y - a.y;
        const dist2  = ddx * ddx + ddy * ddy;
        if (dist2 >= minSep * minSep || dist2 < 0.01) continue;

        const dist = Math.sqrt(dist2);
        const push = (minSep - dist) * 0.55;
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
    const group  = this._groupForIdx(this._spawnIdx);
    const type   = group?.type ?? 'scout';
    const eCfg   = Config.enemy[type];
    const spawnX = eCfg.restXMargin + Math.random() * (vW - eCfg.restXMargin * 2);
    const restX  = eCfg.restXMargin + Math.random() * (vW - eCfg.restXMargin * 2);
    const restY  = vH * (eCfg.restYMin + Math.random() * (eCfg.restYMax - eCfg.restYMin));
    this._enemies.push(new Enemy(spawnX, restX, restY, type));
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

  _playExplosionSfx(volume) {
    if (!this._sfxPool) {
      const { src, poolSize } = Config.enemy.scout.audio;
      this._sfxPool = Array.from({ length: poolSize }, () => new Audio(src));
    }
    const a = this._sfxPool[this._sfxIdx];
    this._sfxIdx  = (this._sfxIdx + 1) % this._sfxPool.length;
    a.volume      = volume; // set fresh each play — scout vs rocketeer kills differ
    a.currentTime = 0;
    a.play().catch(() => {});
  }
}
