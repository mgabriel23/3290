/**
 * WaveManager.js
 * Orchestrates spawning, separation, and owns all active entities for
 * one level's wave (enemies of any type, their projectiles, explosions).
 *
 * Hull rendering is batched by (type × flash) into at most 4 fillStrokePaths
 * calls per frame — 4 GPU shadow passes regardless of enemy count:
 *   scout-normal | rocketeer-normal | sniper-normal | flash (white, shared)
 *
 * Each enemy type routes its onFire callback differently:
 *   scout     → EnemyBullets (straight aimed capsule)
 *   rocketeer → Rockets (homing, detonates on proximity or timer)
 *   sniper    → no-op (_onFire unused; sniper manages its own laser internally)
 */
import { Config } from '../core/Config.js';
import { Enemy, SCOUT_HULL_PTS } from './Enemy.js';
import { SniperEnemy } from './SniperEnemy.js';
import { DrifterEnemy, createDrifterPath, createSweeperPath, createDiverPath, BODY_PTS as DRIFTER_BODY_PTS } from './DrifterEnemy.js';
import { EnemyBullets } from './EnemyBullet.js';
import { Rockets } from './Rockets.js';
import { DrifterProjectiles } from './DrifterProjectiles.js';
import { Particles } from './Particles.js';

// Pre-allocated world-space hull pools — reused every frame, zero heap allocations.
const MAX_BATCH = 20;
const _PTS      = SCOUT_HULL_PTS.length;
const _mkPool   = () => Array.from({ length: MAX_BATCH }, () =>
  ({ points: Array.from({ length: _PTS }, () => [0, 0]), closed: true }));
const _scoutNormalHulls     = _mkPool();
const _rocketeerNormalHulls = _mkPool();
const _sniperNormalHulls    = _mkPool();
const _flashHulls           = _mkPool();

// Drifter bodies use a different vertex count (BODY_PTS) — separate pools,
// same batching trick (≤2 extra fillStrokePaths calls regardless of formation size).
// Sized larger than MAX_BATCH: a sweeper formation alone is 15 clones, and
// successive formations can briefly overlap on screen.
const DRIFTER_MAX_BATCH = 40;
const _DRIFTER_PTS = DRIFTER_BODY_PTS.length;
const _mkDrifterPool = () => Array.from({ length: DRIFTER_MAX_BATCH }, () =>
  ({ points: Array.from({ length: _DRIFTER_PTS }, () => [0, 0]), closed: true }));
const _drifterNormalHulls = _mkDrifterPool();
const _drifterFlashHulls  = _mkDrifterPool();

// Variety #2 ("Sweeper") shares the same body shape but a different
// palette — its own pools so its formation (up to 15) doesn't collide
// with variety #1's (up to 8) in the same MAX_BATCH-sized arrays.
const _sweeperNormalHulls = _mkDrifterPool();
const _sweeperFlashHulls  = _mkDrifterPool();

// Variety #3 ("Diver") — same body shape, its own palette, own pools
// (formation of 5, well within DRIFTER_MAX_BATCH).
const _diverNormalHulls = _mkDrifterPool();
const _diverFlashHulls  = _mkDrifterPool();

// Sniper fire: laser is managed internally by SniperEnemy — callback is a no-op.
const _noFire = () => {};

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
    this._drifterProjectiles = new DrifterProjectiles({
      onImpact: (x, y, color) => {
        let particles = this._drifterParticles;
        if (color === Config.enemy.drifter.sweeper.color) particles = this._sweeperParticles;
        else if (color === Config.enemy.drifter.diver.color) particles = this._diverParticles;
        particles.emit(x, y);
      },
    });

    this._particles          = new Particles(Config.enemy.scout.color);
    this._rocketeerParticles = new Particles(Config.enemy.rocketeer.color);
    this._sniperParticles    = new Particles(Config.enemy.sniper.color);
    this._drifterParticles   = new Particles(Config.enemy.drifter.color);
    this._sweeperParticles   = new Particles(Config.enemy.drifter.sweeper.color, Config.enemy.drifter.sweeper.sparksPerEmit);
    this._diverParticles     = new Particles(Config.enemy.drifter.diver.color, Config.enemy.drifter.diver.sparksPerEmit);

    // Lazy SFX pool (same audio file across all types; volume set per-play).
    this._sfxPool = null;
    this._sfxIdx  = 0;

    // Pre-bound fire callbacks — stored once, zero closures per frame.
    this._fireBullet           = (ox, oy, tx, ty) => this._enemyBullets.fire(ox, oy, tx, ty);
    this._fireRocket           = (ox, oy, tx, ty) => this._rockets.fire(ox, oy, tx, ty);
    this._fireDrifterProjectile = (ox, oy, tx, ty, color) => this._drifterProjectiles.fire(ox, oy, tx, ty, color);

    this.waveClear = false;
  }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   */
  update(dt, playerX, playerY) {
    // All particle/projectile systems drain past waveClear so effects finish
    // before isDone returns true and the level transitions.
    this._particles.update(dt);
    this._rocketeerParticles.update(dt);
    this._sniperParticles.update(dt);
    this._drifterParticles.update(dt);
    this._sweeperParticles.update(dt);
    this._diverParticles.update(dt);
    this._rockets.update(dt, playerX, playerY);
    this._drifterProjectiles.update(dt);

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
      let cb;
      if      (e.type === 'rocketeer') cb = this._fireRocket;
      else if (e.type === 'sniper')    cb = _noFire;
      else if (e.type === 'drifter')   cb = this._fireDrifterProjectile;
      else                             cb = this._fireBullet;
      e.update(dt, playerX, playerY, cb);
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
    this._drifterProjectiles.render(renderer);

    // ── Engine flames — must render behind hulls ──────────────────────────────
    for (let i = 0; i < this._enemies.length; i++) {
      if (this._enemies[i].type === 'drifter') continue;
      this._enemies[i].renderFlame(renderer);
    }

    // ── Hull batch — ≤4 GPU shadow passes regardless of enemy count ───────────
    const sCfg  = Config.enemy.scout;
    const rCfg  = Config.enemy.rocketeer;
    const snCfg = Config.enemy.sniper;
    let scCount = 0, rnCount = 0, snCount = 0, fCount = 0;
    let dnCount = 0, dfCount = 0, swnCount = 0, swfCount = 0, dvnCount = 0, dvfCount = 0;

    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'drifter') {
        if (!e._visible) continue;
        const isFlash = e._hitFlash > 0;
        let pool, idx;
        if (e._variant === 2) {
          pool = isFlash ? _sweeperFlashHulls : _sweeperNormalHulls;
          idx  = isFlash ? swfCount++ : swnCount++;
        } else if (e._variant === 3) {
          pool = isFlash ? _diverFlashHulls : _diverNormalHulls;
          idx  = isFlash ? dvfCount++ : dvnCount++;
        } else {
          pool = isFlash ? _drifterFlashHulls : _drifterNormalHulls;
          idx  = isFlash ? dfCount++ : dnCount++;
        }
        if (idx >= pool.length) continue; // pool exhausted — skip drawing this clone's hull
        const c    = e._cosA, s = e._sinA;
        const path = pool[idx];
        for (let j = 0; j < _DRIFTER_PTS; j++) {
          const lx = DRIFTER_BODY_PTS[j][0];
          const ly = DRIFTER_BODY_PTS[j][1];
          path.points[j][0] = e.x + c * lx - s * ly;
          path.points[j][1] = e.y + s * lx + c * ly;
        }
        continue;
      }
      const isFlash = e._hitFlash > 0;
      let pool, idx;
      if (isFlash) {
        pool = _flashHulls;           idx = fCount++;
      } else if (e.type === 'rocketeer') {
        pool = _rocketeerNormalHulls; idx = rnCount++;
      } else if (e.type === 'sniper') {
        pool = _sniperNormalHulls;    idx = snCount++;
      } else {
        pool = _scoutNormalHulls;     idx = scCount++;
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

    if (scCount > 0) renderer.fillStrokePaths(_scoutNormalHulls, {
      fillColor: sCfg.fillColor,  strokeColor: sCfg.color,
      lineWidth:  sCfg.lineWidth, glowBlur:    sCfg.glowBlur,
      glowColor:  sCfg.color,     singleStroke: true,
    }, scCount);
    if (rnCount > 0) renderer.fillStrokePaths(_rocketeerNormalHulls, {
      fillColor: rCfg.fillColor,  strokeColor: rCfg.color,
      lineWidth:  rCfg.lineWidth, glowBlur:    rCfg.glowBlur,
      glowColor:  rCfg.color,     singleStroke: true,
    }, rnCount);
    if (snCount > 0) renderer.fillStrokePaths(_sniperNormalHulls, {
      fillColor: snCfg.fillColor,  strokeColor: snCfg.color,
      lineWidth:  snCfg.lineWidth, glowBlur:    snCfg.glowBlur,
      glowColor:  snCfg.color,     singleStroke: true,
    }, snCount);
    if (fCount > 0) renderer.fillStrokePaths(_flashHulls, {
      fillColor: '#ffffff', strokeColor: '#ffffff',
      lineWidth:  sCfg.lineWidth, glowBlur:   sCfg.hitGlowBlur,
      glowColor: '#ffffff', singleStroke: true,
    }, fCount);

    // Clamp to pool capacity — guards against more clones being on screen
    // at once than DRIFTER_MAX_BATCH (the loop above already skips drawing
    // hulls beyond capacity, so this just keeps the draw call in sync).
    dnCount  = Math.min(dnCount,  _drifterNormalHulls.length);
    dfCount  = Math.min(dfCount,  _drifterFlashHulls.length);
    swnCount = Math.min(swnCount, _sweeperNormalHulls.length);
    swfCount = Math.min(swfCount, _sweeperFlashHulls.length);
    dvnCount = Math.min(dvnCount, _diverNormalHulls.length);
    dvfCount = Math.min(dvfCount, _diverFlashHulls.length);

    const dCfg = Config.enemy.drifter;
    if (dnCount > 0) renderer.fillStrokePaths(_drifterNormalHulls, {
      fillColor: dCfg.fillColor,  strokeColor: dCfg.color,
      lineWidth:  dCfg.lineWidth, glowBlur:    dCfg.glowBlur,
      glowColor:  dCfg.color,     singleStroke: true,
    }, dnCount);
    if (dfCount > 0) renderer.fillStrokePaths(_drifterFlashHulls, {
      fillColor: '#ffffff', strokeColor: '#ffffff',
      lineWidth:  dCfg.lineWidth, glowBlur:   dCfg.hitGlowBlur,
      glowColor: '#ffffff', singleStroke: true,
    }, dfCount);

    const swCfg = Config.enemy.drifter.sweeper;
    if (swnCount > 0) renderer.fillStrokePaths(_sweeperNormalHulls, {
      fillColor: swCfg.fillColor, strokeColor: swCfg.color,
      lineWidth:  dCfg.lineWidth, glowBlur:    swCfg.glowBlur,
      glowColor:  swCfg.color,    singleStroke: true,
    }, swnCount);
    if (swfCount > 0) renderer.fillStrokePaths(_sweeperFlashHulls, {
      fillColor: '#ffffff', strokeColor: '#ffffff',
      lineWidth:  dCfg.lineWidth, glowBlur:   swCfg.hitGlowBlur,
      glowColor: '#ffffff', singleStroke: true,
    }, swfCount);

    const dvCfg = Config.enemy.drifter.diver;
    if (dvnCount > 0) renderer.fillStrokePaths(_diverNormalHulls, {
      fillColor: dvCfg.fillColor, strokeColor: dvCfg.color,
      lineWidth:  dCfg.lineWidth, glowBlur:    dvCfg.glowBlur,
      glowColor:  dvCfg.color,    singleStroke: true,
    }, dvnCount);
    if (dvfCount > 0) renderer.fillStrokePaths(_diverFlashHulls, {
      fillColor: '#ffffff', strokeColor: '#ffffff',
      lineWidth:  dCfg.lineWidth, glowBlur:   dvCfg.hitGlowBlur,
      glowColor: '#ffffff', singleStroke: true,
    }, dvfCount);

    // ── Engine cores — rendered on top of hulls ───────────────────────────────
    for (let i = 0; i < this._enemies.length; i++) {
      if (this._enemies[i].type === 'drifter') continue;
      this._enemies[i].renderCore(renderer);
    }

    // ── Sniper extras: ! warning markers and laser flash beams ───────────────
    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].renderExtras?.(renderer);
    }

    // ── Drifters — individually rendered (variable tentacle geometry can't
    //    be batched into the shared hull pools above) ─────────────────────────
    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'drifter' && e._visible) e.render(renderer);
    }

    // ── Explosions ────────────────────────────────────────────────────────────
    this._particles.render(renderer);
    this._rocketeerParticles.render(renderer);
    this._sniperParticles.render(renderer);
    this._drifterParticles.render(renderer);
    this._sweeperParticles.render(renderer);
    this._diverParticles.render(renderer);
  }

  /** Called by GameplayScene when a player bullet hits an enemy. */
  handleBulletHit(enemy) {
    const killed = enemy.hit();
    if (killed) {
      if (enemy.type === 'rocketeer') {
        this._rocketeerParticles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.enemy.rocketeer.audio.volume);
      } else if (enemy.type === 'sniper') {
        this._sniperParticles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.enemy.sniper.audio.volume);
      } else if (enemy.type === 'drifter') {
        const { particles, audio } = this._drifterVarietyAssets(enemy._variant);
        particles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(audio.volume);
      } else {
        this._particles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.enemy.scout.audio.volume);
      }
    }
  }

  /**
   * Per-variant particle pool + explosion SFX volume for a Drifter clone —
   * shared by handleBulletHit and the projectile onImpact callback so each
   * variant's explosions/audio match its own palette/tuning.
   */
  _drifterVarietyAssets(variant) {
    if (variant === 2) return { particles: this._sweeperParticles, audio: Config.enemy.drifter.sweeper.audio };
    if (variant === 3) return { particles: this._diverParticles,   audio: Config.enemy.drifter.diver.audio };
    return { particles: this._drifterParticles, audio: Config.enemy.drifter.audio };
  }

  /** Direct reference — GameplayScene runs the bullet↔enemy collision loop. */
  get enemies() { return this._enemies; }

  /**
   * True once all enemies are dead AND every effect has finished animating.
   */
  get isDone() {
    return this.waveClear
      && !this._particles.active
      && !this._rocketeerParticles.active
      && !this._sniperParticles.active
      && !this._drifterParticles.active
      && !this._sweeperParticles.active
      && !this._diverParticles.active
      && !this._rockets.active
      && !this._drifterProjectiles.active;
  }

  // ---------------------------------------------------------------------------

  _resolveOverlaps() {
    const { restXMargin, restYMin, restYMax } = Config.enemy.scout;
    const { width: vW, height: vH } = Config.virtual;
    const xLo = restXMargin,   xHi = vW - restXMargin;
    const yLo = vH * restYMin, yHi = vH * restYMax;

    for (let i = 0; i < this._enemies.length; i++) {
      const a = this._enemies[i];
      if (a._state === 'entering' || a._type === 'drifter') continue;

      for (let j = i + 1; j < this._enemies.length; j++) {
        const b = this._enemies[j];
        if (b._state === 'entering' || b._type === 'drifter') continue;

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
    const group = this._groupForIdx(this._spawnIdx);
    const type  = group?.type ?? 'scout';

    if (type === 'drifter' || type === 'sweeper' || type === 'diver') {
      const cfg = Config.enemy.drifter;
      // 'drifter' picks randomly per formation between variety #1 (loop
      // path), #2 (sweeper rows), and #3 (diver wedge); 'sweeper'/'diver'
      // force that variety directly (used for testing a variety in isolation).
      let variant;
      if (type === 'sweeper') variant = 2;
      else if (type === 'diver') variant = 3;
      else variant = 1 + Math.floor(Math.random() * 3);

      const path = variant === 2 ? createSweeperPath()
                  : variant === 3 ? createDiverPath()
                  : createDrifterPath();
      const formationSize = variant === 2 ? cfg.sweeper.formationSize
                           : variant === 3 ? cfg.diver.formationSize
                           : cfg.formationSize;
      for (let lane = 0; lane < formationSize; lane++) {
        this._enemies.push(new DrifterEnemy(path, lane));
      }
      this._spawnIdx++;
      if (this._spawnIdx >= this._totalToSpawn) this._allSpawned = true;
      return;
    }

    const { width: vW, height: vH } = Config.virtual;
    const eCfg   = Config.enemy[type];
    const spawnX = eCfg.restXMargin + Math.random() * (vW - eCfg.restXMargin * 2);
    const restX  = eCfg.restXMargin + Math.random() * (vW - eCfg.restXMargin * 2);
    const restY  = vH * (eCfg.restYMin + Math.random() * (eCfg.restYMax - eCfg.restYMin));

    const enemy = type === 'sniper'
      ? new SniperEnemy(spawnX, restX, restY)
      : new Enemy(spawnX, restX, restY, type);
    this._enemies.push(enemy);

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
    a.volume      = volume;
    a.currentTime = 0;
    a.play().catch(() => {});
  }
}
