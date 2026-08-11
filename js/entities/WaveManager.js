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
 *   sniper    → SniperBullets (straight shot, slow-start/fast-finish speed curve)
 *
 * `checkPlayerHit` is the reverse of `handleBulletHit` — every enemy-attack
 * source (enemy bullets, sniper bullets, rocket proximity, drifter orb
 * arrival, bouncer contact) tested against the player once per frame,
 * returning total damage for GameplayScene to apply.
 *
 * Barrier damage is separate from player damage: Bouncer clones chip it on
 * every bounce (persistent threat, never exits on its own — see
 * BouncerEnemy.js), while Diver/Weaver clones (the only Drifter-family
 * variants that dive low enough to reach it) deal a one-shot hit and are
 * destroyed the instant they reach its surface (see DrifterEnemy.update) —
 * both routed through the same `_onBarrierHit(x, damage)` closure below,
 * with each attack source supplying its own damage value.
 */
import { Config } from '../core/Config.js';
import { Enemy, SCOUT_HULL_PTS } from './Enemy.js';
import { SniperEnemy } from './SniperEnemy.js';
import { DrifterEnemy, createDrifterPath, createSweeperPath, createDiverPath, createWeaverPath, BODY_PTS as DRIFTER_BODY_PTS } from './DrifterEnemy.js';
import { BouncerEnemy } from './BouncerEnemy.js';
import { EnemyBullets } from './EnemyBullet.js';
import { Rockets } from './Rockets.js';
import { SniperBullets } from './SniperBullets.js';
import { DrifterProjectiles } from './DrifterProjectiles.js';
import { Particles } from './Particles.js';
import { AudioPool } from '../core/AudioPool.js';

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

// Variety #4 ("Weaver") — same body shape, its own palette (Sniper's
// violet), own pools (formation of 6, well within DRIFTER_MAX_BATCH).
const _weaverNormalHulls = _mkDrifterPool();
const _weaverFlashHulls  = _mkDrifterPool();

export class WaveManager {
  /**
   * @param {number} level  1-based. Values beyond the config array reuse the last entry.
   * @param {import('./Barrier.js').Barrier} barrier  used by Bouncer clones (repeated bounces) and Diver/Weaver clones (one-shot dive-through impact) to detect/damage the barrier
   * @param {import('./HUD.js').HUD} hud  score/gold are awarded directly onto it on kill — see handleBulletHit/_rewardFor
   * @param {import('../core/ScreenShake.js').ScreenShake} screenShake  triggered on barrier impacts — see the onBarrierHit closure below; kill-triggered shake/hit-stop instead lives in GameplayScene, driven by handleBulletHit's return value
   */
  constructor(level, barrier, hud, screenShake) {
    const levels = Config.waves.levels;
    this._level   = level;
    this._waveCfg = levels[Math.min(level - 1, levels.length - 1)];
    this._hud = hud;
    this._barrierSurfaceY = (x) => barrier.surfaceY(x);
    // `damage` is explicit per-call, not hardcoded here, since multiple
    // attack sources now share this same callback with their own values —
    // Bouncer's per-bounce chip damage, Diver/Weaver's one-shot impact.
    this._onBarrierHit = (x, damage) => {
      barrier.takeDamage(damage);
      barrier.pulse(x);
      screenShake.trigger(Config.screenShake.barrierTrauma);
    };
    // Diver/Weaver's own barrier-impact callback — layers that same barrier
    // damage/pulse/shake on top of the death explosion + SFX their own kind
    // already gets from a player-bullet kill (see handleBulletHit's
    // `_drifterVarietyAssets` use), since a barrier impact destroys the
    // clone too (unlike Bouncer, which bounces off and stays alive, so it
    // never gets an explosion here). No score/gold reward, on purpose — this
    // is the player FAILING to intercept it, not a kill.
    this._onDrifterBarrierHit = (x, y, damage, variant) => {
      this._onBarrierHit(x, damage);
      const { particles, audio } = this._drifterVarietyAssets(variant);
      particles.emit(x, y);
      this._playExplosionSfx(audio.volume);
    };

    // Player bullet damage scales with level — see Config.player.damage/damagePerLevel.
    this._playerDamage = Config.player.damage + (level - 1) * Config.player.damagePerLevel;

    this._totalToSpawn = this._waveCfg.enemies.reduce((s, g) => s + g.count, 0);
    this._spawnIdx   = 0;
    this._allSpawned = false;
    this._spawnTimer = 0;

    // Accumulates damage from sources whose "did it hit the player" check
    // naturally happens inside their own update() (Rockets/DrifterProjectiles
    // detect proximity/arrival there) rather than via an external point-test —
    // checkPlayerHit reads and clears this each frame alongside the sources
    // it tests directly (enemy bullets, sniper bullets, bouncer contact).
    this._pendingPlayerDamage = 0;

    this._enemies      = [];
    this._enemyBullets = new EnemyBullets();
    this._sniperBullets = new SniperBullets();
    this._rockets      = new Rockets({
      onDetonate: (x, y) => {
        this._rocketeerParticles.emit(x, y);
        this._playExplosionSfx(Config.enemy.rocketeer.audio.volume);
      },
      onPlayerHit: () => { this._pendingPlayerDamage += Config.rocket.damage; },
    });
    this._drifterProjectiles = new DrifterProjectiles({
      onImpact: (x, y, color) => {
        let particles = this._drifterParticles;
        if (color === Config.enemy.drifter.sweeper.color) particles = this._sweeperParticles;
        else if (color === Config.enemy.drifter.diver.color) particles = this._diverParticles;
        else if (color === Config.enemy.drifter.weaver.color) particles = this._weaverParticles;
        particles.emit(x, y);
      },
      onPlayerHit: () => { this._pendingPlayerDamage += Config.enemy.drifter.projectileDamage; },
    });

    this._particles          = new Particles(Config.enemy.scout.color);
    this._rocketeerParticles = new Particles(Config.enemy.rocketeer.color);
    this._sniperParticles    = new Particles(Config.enemy.sniper.color);
    this._drifterParticles   = new Particles(Config.enemy.drifter.color);
    this._sweeperParticles   = new Particles(Config.enemy.drifter.sweeper.color, Config.enemy.drifter.sweeper.sparksPerEmit);
    this._diverParticles     = new Particles(Config.enemy.drifter.diver.color, Config.enemy.drifter.diver.sparksPerEmit);
    this._weaverParticles    = new Particles(Config.enemy.drifter.weaver.color, Config.enemy.drifter.weaver.sparksPerEmit);
    this._bouncerParticles   = new Particles(Config.enemy.bouncer.color, Config.enemy.bouncer.sparksPerEmit);

    // Same audio file across all enemy types; volume set per-play (see
    // _playExplosionSfx) since it varies by which type died.
    this._sfxPool = new AudioPool(Config.enemy.scout.audio.src, Config.enemy.scout.audio.poolSize);

    // Pre-bound fire callbacks — stored once, zero closures per frame.
    this._fireBullet           = (ox, oy, tx, ty) => this._enemyBullets.fire(ox, oy, tx, ty);
    this._fireRocket           = (ox, oy, tx, ty) => this._rockets.fire(ox, oy, tx, ty);
    this._fireSniperBullet     = (ox, oy, tx, ty) => this._sniperBullets.fire(ox, oy, tx, ty);
    this._fireDrifterProjectile = (ox, oy, tx, ty, color) => this._drifterProjectiles.fire(ox, oy, tx, ty, color);
    // Passed into Enemy.js's repositioning so it picks a fresh rest point
    // that's already clear of other enemies, instead of a blind random one
    // — see _findClearRestPoint's own doc for why picking clear beats only
    // reactively separating afterward.
    this._findClearRestPoint = (enemy) => this._findClearRestPointFor(enemy);

    this._waveClear = false;
  }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   */
  update(dt, playerX, playerY) {
    // All particle/projectile systems drain past _waveClear so effects finish
    // (and keep moving/culling normally instead of freezing mid-flight)
    // before isDone returns true and the level transitions.
    this._particles.update(dt);
    this._rocketeerParticles.update(dt);
    this._sniperParticles.update(dt);
    this._drifterParticles.update(dt);
    this._sweeperParticles.update(dt);
    this._diverParticles.update(dt);
    this._weaverParticles.update(dt);
    this._bouncerParticles.update(dt);
    this._rockets.update(dt, playerX, playerY);
    this._drifterProjectiles.update(dt, playerX, playerY);
    this._enemyBullets.update(dt);
    this._sniperBullets.update(dt);

    if (this._waveClear) return;

    // ── Spawn ─────────────────────────────────────────────────────────────────
    // When `simultaneous` is false, a new group can't start spawning until
    // every enemy from the previous group has been cleared from the screen —
    // only one enemy type is ever active at a time.
    if (!this._allSpawned) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0 && this._spawnIdx < this._totalToSpawn) {
        const group = this._groupForIdx(this._spawnIdx);
        const groupChanged = this._spawnIdx > 0 && group !== this._groupForIdx(this._spawnIdx - 1);
        const simultaneous = this._waveCfg.simultaneous ?? Config.waves.simultaneous ?? true;
        const blocked = simultaneous === false && groupChanged && this._enemies.length > 0;

        if (!blocked) {
          this._spawnNext();
          const nextGroup = this._groupForIdx(this._spawnIdx);
          this._spawnTimer = nextGroup ? nextGroup.spawnInterval : 1;
        } else {
          this._spawnTimer = 0.25; // recheck shortly until the screen clears
        }
      }
    }

    // ── Update enemies ────────────────────────────────────────────────────────
    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'bouncer') {
        e.update(dt, this._barrierSurfaceY, this._onBarrierHit);
        continue;
      }
      if (e.type === 'drifter') {
        // Diver/Weaver clones dive straight through where the barrier sits
        // and damage + explode on impact (see DrifterEnemy.update and
        // _onDrifterBarrierHit above) — drifter/sweeper ignore these two
        // extra params entirely, same shape as Bouncer above.
        e.update(dt, playerX, playerY, this._fireDrifterProjectile, this._barrierSurfaceY, this._onDrifterBarrierHit);
        continue;
      }
      let cb;
      if      (e.type === 'rocketeer') cb = this._fireRocket;
      else if (e.type === 'sniper')    cb = this._fireSniperBullet;
      else                             cb = this._fireBullet;
      // Sniper's update() signature simply doesn't read this 5th arg — only
      // Enemy.js (Scout/Rocketeer) uses it, for repositioning.
      e.update(dt, playerX, playerY, cb, this._findClearRestPoint);
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

    if (this._allSpawned && this._enemies.length === 0) this._waveClear = true;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    this._renderProjectiles(renderer);
    this._renderEngineFlames(renderer);
    this._renderHullBatches(renderer);
    this._renderEngineCores(renderer);
    this._renderSniperExtras(renderer);
    this._renderIndividualEnemies(renderer);
    this._renderExplosions(renderer);
  }

  /** Projectile pools — enemy bullets, sniper bullets, homing rockets, drifter orbs. */
  _renderProjectiles(renderer) {
    this._enemyBullets.render(renderer);
    this._sniperBullets.render(renderer);
    this._rockets.render(renderer);
    this._drifterProjectiles.render(renderer);
  }

  /** Engine exhaust — must render behind hulls (Drifter/Bouncer have no engine flame). */
  _renderEngineFlames(renderer) {
    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'drifter' || e.type === 'bouncer') continue;
      e.renderFlame(renderer);
    }
  }

  /**
   * World-transform every batchable enemy's hull into its (type × flash)
   * pool, then draw each non-empty pool in one fillStrokePaths call — keeps
   * GPU shadow-blur passes flat regardless of enemy count. Drifter/Bouncer
   * hulls vary per-clone and are rendered individually in
   * _renderIndividualEnemies instead.
   */
  _renderHullBatches(renderer) {
    const sCfg  = Config.enemy.scout;
    const rCfg  = Config.enemy.rocketeer;
    const snCfg = Config.enemy.sniper;
    let scoutNormalCount = 0, rocketeerNormalCount = 0, sniperNormalCount = 0, flashCount = 0;
    let drifterNormalCount = 0, drifterFlashCount = 0, sweeperNormalCount = 0, sweeperFlashCount = 0,
        diverNormalCount = 0, diverFlashCount = 0, weaverNormalCount = 0, weaverFlashCount = 0;

    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'bouncer') continue; // rendered individually below
      if (e.type === 'drifter') {
        if (!e._visible) continue;
        const isFlash = e._hitFlash > 0;
        let pool, idx;
        if (e._variant === 2) {
          pool = isFlash ? _sweeperFlashHulls : _sweeperNormalHulls;
          idx  = isFlash ? sweeperFlashCount++ : sweeperNormalCount++;
        } else if (e._variant === 3) {
          pool = isFlash ? _diverFlashHulls : _diverNormalHulls;
          idx  = isFlash ? diverFlashCount++ : diverNormalCount++;
        } else if (e._variant === 4) {
          pool = isFlash ? _weaverFlashHulls : _weaverNormalHulls;
          idx  = isFlash ? weaverFlashCount++ : weaverNormalCount++;
        } else {
          pool = isFlash ? _drifterFlashHulls : _drifterNormalHulls;
          idx  = isFlash ? drifterFlashCount++ : drifterNormalCount++;
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
        pool = _flashHulls;           idx = flashCount++;
      } else if (e.type === 'rocketeer') {
        pool = _rocketeerNormalHulls; idx = rocketeerNormalCount++;
      } else if (e.type === 'sniper') {
        pool = _sniperNormalHulls;    idx = sniperNormalCount++;
      } else {
        pool = _scoutNormalHulls;     idx = scoutNormalCount++;
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

    if (scoutNormalCount > 0) renderer.fillStrokePaths(_scoutNormalHulls, {
      fillColor: sCfg.fillColor,  strokeColor: sCfg.color,
      lineWidth:  sCfg.lineWidth, glowBlur:    sCfg.glowBlur,
      glowColor:  sCfg.color,     singleStroke: true,
    }, scoutNormalCount);
    if (rocketeerNormalCount > 0) renderer.fillStrokePaths(_rocketeerNormalHulls, {
      fillColor: rCfg.fillColor,  strokeColor: rCfg.color,
      lineWidth:  rCfg.lineWidth, glowBlur:    rCfg.glowBlur,
      glowColor:  rCfg.color,     singleStroke: true,
    }, rocketeerNormalCount);
    if (sniperNormalCount > 0) renderer.fillStrokePaths(_sniperNormalHulls, {
      fillColor: snCfg.fillColor,  strokeColor: snCfg.color,
      lineWidth:  snCfg.lineWidth, glowBlur:    snCfg.glowBlur,
      glowColor:  snCfg.color,     singleStroke: true,
    }, sniperNormalCount);
    if (flashCount > 0) renderer.fillStrokePaths(_flashHulls, {
      fillColor: '#ffffff', strokeColor: '#ffffff',
      lineWidth:  sCfg.lineWidth, glowBlur:   sCfg.hitGlowBlur,
      glowColor: '#ffffff', singleStroke: true,
    }, flashCount);

    // Drifter-family hull draws (drifter/sweeper/diver/weaver × normal/flash)
    // all share the same call shape — loop over a small table instead of 8
    // hand-duplicated blocks. `lineWidth` intentionally always comes from
    // the base drifter config (dCfg), not each variant's own — that's the
    // original behavior, preserved here rather than "fixed".
    const dCfg = Config.enemy.drifter;
    const drifterHullGroups = [
      { cfg: dCfg,         normalPool: _drifterNormalHulls, normalCount: drifterNormalCount, flashPool: _drifterFlashHulls, flashCount: drifterFlashCount },
      { cfg: dCfg.sweeper, normalPool: _sweeperNormalHulls, normalCount: sweeperNormalCount, flashPool: _sweeperFlashHulls, flashCount: sweeperFlashCount },
      { cfg: dCfg.diver,   normalPool: _diverNormalHulls,   normalCount: diverNormalCount,   flashPool: _diverFlashHulls,   flashCount: diverFlashCount },
      { cfg: dCfg.weaver,  normalPool: _weaverNormalHulls,  normalCount: weaverNormalCount,  flashPool: _weaverFlashHulls,  flashCount: weaverFlashCount },
    ];
    for (const g of drifterHullGroups) {
      // Clamp to pool capacity — guards against more clones being on screen
      // at once than DRIFTER_MAX_BATCH (the loop above already skips
      // drawing hulls beyond capacity, so this just keeps the draw call in sync).
      const normalCount = Math.min(g.normalCount, g.normalPool.length);
      const flashDrawCount = Math.min(g.flashCount, g.flashPool.length);
      if (normalCount > 0) renderer.fillStrokePaths(g.normalPool, {
        fillColor: g.cfg.fillColor, strokeColor: g.cfg.color,
        lineWidth:  dCfg.lineWidth, glowBlur:    g.cfg.glowBlur,
        glowColor:  g.cfg.color,    singleStroke: true,
      }, normalCount);
      if (flashDrawCount > 0) renderer.fillStrokePaths(g.flashPool, {
        fillColor: '#ffffff', strokeColor: '#ffffff',
        lineWidth:  dCfg.lineWidth, glowBlur:   g.cfg.hitGlowBlur,
        glowColor: '#ffffff', singleStroke: true,
      }, flashDrawCount);
    }
  }

  /** Engine core orbs — rendered on top of hulls (Drifter/Bouncer have none). */
  _renderEngineCores(renderer) {
    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'drifter' || e.type === 'bouncer') continue;
      e.renderCore(renderer);
    }
  }

  /** Sniper's "!" warning markers — a no-op for every other type. */
  _renderSniperExtras(renderer) {
    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].renderExtras?.(renderer);
    }
  }

  /** Drifters and Bouncers — variable/per-clone geometry can't be batched into the shared hull pools above. */
  _renderIndividualEnemies(renderer) {
    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'drifter' && e._visible) e.render(renderer);
      else if (e.type === 'bouncer') e.render(renderer);
    }
  }

  /** Explosion particle pools — one per enemy family/variant palette. */
  _renderExplosions(renderer) {
    this._particles.render(renderer);
    this._rocketeerParticles.render(renderer);
    this._sniperParticles.render(renderer);
    this._drifterParticles.render(renderer);
    this._sweeperParticles.render(renderer);
    this._diverParticles.render(renderer);
    this._bouncerParticles.render(renderer);
    this._weaverParticles.render(renderer);
  }

  /**
   * Called by GameplayScene when a player bullet hits an enemy.
   * @returns {boolean} true if this hit was fatal — GameplayScene uses this to trigger kill-feedback (screen shake, hit-stop)
   */
  handleBulletHit(enemy) {
    const killed = enemy.hit(this._playerDamage);
    if (killed) {
      const reward = this._rewardFor(enemy);
      this._hud.score += reward.points;
      this._hud.gold  += reward.gold;

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
      } else if (enemy.type === 'bouncer') {
        this._bouncerParticles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.enemy.bouncer.audio.volume);
        if (enemy._variant === 2) {
          for (const fragment of enemy.spawnFragments()) this._enemies.push(fragment);
        }
      } else {
        this._particles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.enemy.scout.audio.volume);
      }
    }
    return killed;
  }

  /**
   * Score/gold reward for a just-killed enemy. Drifter clones already cache
   * their resolved per-variant Config object as `_palette` (e.g.
   * `Config.enemy.drifter.sweeper`), so their reward is just a field read —
   * Bouncer has no such cached palette (only radius/health vary by variant,
   * not color), so it gets an explicit branch here instead.
   */
  _rewardFor(enemy) {
    if (enemy.type === 'drifter') {
      return { points: enemy._palette.points, gold: enemy._palette.gold };
    }
    if (enemy.type === 'bouncer') {
      const cfg = Config.enemy.bouncer;
      if (enemy._variant === 2) return { points: cfg.splitter.points, gold: cfg.splitter.gold };
      if (enemy._variant === 3) return { points: cfg.shielded.points, gold: cfg.shielded.gold };
      if (enemy._variant === 'fragment') return { points: cfg.splitter.fragmentPoints, gold: cfg.splitter.fragmentGold };
      return { points: cfg.points, gold: cfg.gold };
    }
    const cfg = Config.enemy[enemy.type]; // scout, rocketeer, sniper
    return { points: cfg.points, gold: cfg.gold };
  }

  /**
   * Per-variant particle pool + explosion SFX volume for a Drifter clone —
   * shared by handleBulletHit and the projectile onImpact callback so each
   * variant's explosions/audio match its own palette/tuning.
   */
  _drifterVarietyAssets(variant) {
    if (variant === 2) return { particles: this._sweeperParticles, audio: Config.enemy.drifter.sweeper.audio };
    if (variant === 3) return { particles: this._diverParticles,   audio: Config.enemy.drifter.diver.audio };
    if (variant === 4) return { particles: this._weaverParticles,  audio: Config.enemy.drifter.weaver.audio };
    return { particles: this._drifterParticles, audio: Config.enemy.drifter.audio };
  }

  /**
   * Called once per frame by GameplayScene — the mirror image of
   * handleBulletHit's direction. Tests every live enemy-attack source
   * against `player` and returns the total damage this frame (0 if none);
   * GameplayScene applies it via `player.takeDamage()`. Doesn't itself
   * check invulnerability — Player.takeDamage already no-ops while
   * invulnerable, so a hit source here just gets consumed (bullet removed,
   * etc.) even during that window, same as a real impact would be.
   * @param {{ x: number, y: number, hitRadius: number }} player
   * @returns {number}
   */
  checkPlayerHit(player) {
    let damage = this._pendingPlayerDamage;
    this._pendingPlayerDamage = 0;

    const { x, y, hitRadius } = player;

    if (this._enemyBullets.checkHit(x, y, hitRadius)) damage += Config.enemyBullet.damage;
    if (this._sniperBullets.checkHit(x, y, hitRadius)) damage += Config.enemy.sniper.bullet.damage;

    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'bouncer') {
        const dx = e.x - x, dy = e.y - y;
        const r  = e.hitRadius + hitRadius;
        if (dx * dx + dy * dy <= r * r) damage += Config.enemy.bouncer.contactDamage;
      }
    }

    return damage;
  }

  /** Direct reference — GameplayScene runs the bullet↔enemy collision loop. */
  get enemies() { return this._enemies; }

  /**
   * True once all enemies are dead AND every effect has finished animating.
   */
  get isDone() {
    return this._waveClear
      && !this._particles.active
      && !this._rocketeerParticles.active
      && !this._sniperParticles.active
      && !this._drifterParticles.active
      && !this._sweeperParticles.active
      && !this._diverParticles.active
      && !this._weaverParticles.active
      && !this._bouncerParticles.active
      && !this._rockets.active
      && !this._drifterProjectiles.active
      && !this._enemyBullets.active
      && !this._sniperBullets.active;
  }

  // ---------------------------------------------------------------------------

  _resolveOverlaps() {
    const { restXMargin, restYMin, restYMax } = Config.enemy.scout;
    const { width: vW, height: vH } = Config.virtual;
    const xLo = restXMargin,   xHi = vW - restXMargin;
    const yLo = vH * restYMin, yHi = vH * restYMax;

    for (let i = 0; i < this._enemies.length; i++) {
      const a = this._enemies[i];
      if (a._state === 'entering' || a._type === 'drifter' || a._type === 'bouncer') continue;

      for (let j = i + 1; j < this._enemies.length; j++) {
        const b = this._enemies[j];
        if (b._state === 'entering' || b._type === 'drifter' || b._type === 'bouncer') continue;

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

        // A repositioning enemy recomputes x/y from _restX/_restY every
        // frame (see Enemy.js's 'repositioning' branch) — without also
        // nudging the target itself, this push would just get overwritten
        // again next frame and the two could keep drifting back together.
        if (a._state === 'repositioning') {
          a._restX = Math.max(xLo, Math.min(xHi, a._restX - nx * push));
          a._restY = Math.max(yLo, Math.min(yHi, a._restY - ny * push));
        }
        if (b._state === 'repositioning') {
          b._restX = Math.max(xLo, Math.min(xHi, b._restX + nx * push));
          b._restY = Math.max(yLo, Math.min(yHi, b._restY + ny * push));
        }
      }
    }
  }

  /**
   * A clear (or best-effort) rest point for `enemy` to reposition to —
   * called from Enemy.js's repositioning trigger instead of it picking a
   * blind random point, so an enemy doesn't visibly glide toward wherever
   * another one already is. Retries a handful of times against every other
   * non-entering, non-drifter, non-bouncer enemy's CURRENT position (the
   * same population _resolveOverlaps itself considers); if nothing fully
   * clear turns up in that budget, the last candidate is used anyway — the
   * ordinary push-apart in _resolveOverlaps still catches whatever this
   * doesn't, exactly as it already does for spawn-time placement.
   */
  _findClearRestPointFor(enemy) {
    const { restXMargin, restYMin, restYMax, minSeparation } = enemy._cfg;
    const { width: vW, height: vH } = Config.virtual;
    const xLo = restXMargin,        xHi = vW - restXMargin;
    const yLo = vH * restYMin,      yHi = vH * restYMax;

    for (let attempt = 0; attempt < 8; attempt++) {
      const x = xLo + Math.random() * (xHi - xLo);
      const y = yLo + Math.random() * (yHi - yLo);

      let clear = true;
      for (let i = 0; i < this._enemies.length; i++) {
        const other = this._enemies[i];
        if (other === enemy || other._state === 'entering' || other._type === 'drifter' || other._type === 'bouncer') continue;
        const sep = Math.max(minSeparation, other._cfg.minSeparation);
        const dx  = other.x - x, dy = other.y - y;
        if (dx * dx + dy * dy < sep * sep) { clear = false; break; }
      }
      if (clear) return { x, y };
      if (attempt === 7) return { x, y }; // budget spent — best effort, _resolveOverlaps backstops the rest
    }
  }

  _spawnNext() {
    const group = this._groupForIdx(this._spawnIdx);
    const type  = group?.type ?? 'scout';

    if (type === 'bouncer' || type === 'splitter' || type === 'shielded') {
      // 'splitter'/'shielded' force variant 2/3 — used for testing that
      // variety in isolation.
      let variant = 1;
      let healthCfg = Config.enemy.bouncer;
      if (type === 'splitter') { variant = 2; healthCfg = Config.enemy.bouncer.splitter; }
      else if (type === 'shielded') { variant = 3; healthCfg = Config.enemy.bouncer.shielded; }
      // Splitter/Shielded read their OWN healthPerLevel (see the comment on
      // each), not the base Bouncer's — without this, `Config.enemy.bouncer`
      // was always passed regardless of variant, silently discarding their
      // elevated per-level scaling and letting their long-run tankiness
      // decay toward a plain Bouncer's over many levels.
      this._enemies.push(new BouncerEnemy({ variant, healthBonus: this._healthBonus(healthCfg) }));
      this._advanceSpawnIndex();
      return;
    }

    if (type === 'drifter' || type === 'sweeper' || type === 'diver' || type === 'weaver') {
      const cfg = Config.enemy.drifter;
      // 'drifter' = variety #1 (loop path), 'sweeper' = #2 (rows),
      // 'diver' = #3 (wedge), 'weaver' = #4 (sine descent) — each config
      // type spawns only that variety.
      let variant;
      if (type === 'sweeper') variant = 2;
      else if (type === 'diver') variant = 3;
      else if (type === 'weaver') variant = 4;
      else variant = 1;

      const path = variant === 2 ? createSweeperPath()
                  : variant === 3 ? createDiverPath()
                  : variant === 4 ? createWeaverPath()
                  : createDrifterPath();
      const formationSize = variant === 2 ? cfg.sweeper.formationSize
                           : variant === 3 ? cfg.diver.formationSize
                           : variant === 4 ? cfg.weaver.formationSize
                           : cfg.formationSize;
      const healthBonus = this._healthBonus(cfg);
      for (let lane = 0; lane < formationSize; lane++) {
        this._enemies.push(new DrifterEnemy(path, lane, healthBonus));
      }
      this._advanceSpawnIndex();
      return;
    }

    const { width: vW, height: vH } = Config.virtual;
    const eCfg   = Config.enemy[type];
    const spawnX = eCfg.restXMargin + Math.random() * (vW - eCfg.restXMargin * 2);
    const restX  = eCfg.restXMargin + Math.random() * (vW - eCfg.restXMargin * 2);
    const restY  = vH * (eCfg.restYMin + Math.random() * (eCfg.restYMax - eCfg.restYMin));

    const healthBonus = this._healthBonus(eCfg);
    const enemy = type === 'sniper'
      ? new SniperEnemy(spawnX, restX, restY, healthBonus)
      : new Enemy(spawnX, restX, restY, type, healthBonus);
    this._enemies.push(enemy);
    this._advanceSpawnIndex();
  }

  /** Bump the spawn cursor and flip `_allSpawned` once every group has been spawned. */
  _advanceSpawnIndex() {
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

  /** Extra health added on top of `cfg.health` for the current level — see `cfg.healthPerLevel`. */
  _healthBonus(cfg) {
    return (this._level - 1) * (cfg.healthPerLevel ?? 0);
  }

  _playExplosionSfx(volume) {
    this._sfxPool.play(volume);
  }
}
