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
 *
 * A flat chance on every real kill also drops a PowerUps pickup (health
 * restore, shield restore, a temporary fire-power/fire-rate boost, or a
 * temporary full damage immunity — see Config.powerUps, PowerUps.js,
 * `_maybeDropPowerUp`, and `checkPowerUpPickup`, the pickup-side mirror of
 * `checkPlayerHit`). A separate, much higher flat chance also drops a gold
 * coin worth that enemy's reward (see Config.gold, GoldPickups.js,
 * `_maybeDropGold`, and `checkGoldPickup`) — gold is no longer credited
 * instantly on kill, it must be collected like any other pickup. Both
 * pools are constructor-injected (owned by GameplayScene, not `new`'d
 * here) specifically so an uncollected pickup survives a level transition
 * instead of vanishing with the WaveManager that spawned it — see the
 * constructor's own doc.
 *
 * `triggerSkillBomb` is the player's special-skill button (see
 * PlayerSkill.js and Config.playerSkill) — instantly kills every enemy
 * currently on screen through the same `handleBulletHit` pipeline a real
 * bullet hit uses, so it's a real kill (reward, explosion, SFX and all),
 * not a separate mechanic.
 *
 * Every `Config.boss.everyNLevels`th level (7, 14, 21, ...) is a boss level
 * — the constructor swaps in a synthetic one-group `_waveCfg` (`{ type:
 * 'boss', count: 1 }`) instead of reading `Config.waves.levels`, so the
 * existing spawn machinery (`_spawnNext`/`_groupForIdx`) builds a single
 * boss instance the same way it builds any other group. WHICH boss is read
 * off `Config.boss.roster`, cycling once every boss has had a turn (level
 * 7 → roster[0] "scout1", 14 → roster[1] "spiral", 21 → roster[2]
 * "bouncerPrimal", 28 → roster[3] "snake", 35 → roster[4] "tetra", 42 →
 * roster[5] "nova", 49 → roster[6] "pulsor", 56 → roster[7] "zigzag", 63 →
 * roster[0] again, ...) — see the constructor's `_bossKey`/`_bossCfg`
 * lookup and the `BOSS_CLASSES` table above for the matching class
 * construction. Every boss class shares one `update(dt, playerX, playerY,
 * ctx)` shape, where `ctx` is a bag of every callback ANY boss might need —
 * fire callbacks for the ship-family bosses (`fireBullet`/`fireRocket`/
 * `fireSniperBullet`/`fireSpiralBullet`/`fireTetraBullet`/`fireNovaSeed`/
 * `fireNovaSeedAngle`/`firePulsorBullet`/`fireZigzagBullet`),
 * `barrierSurfaceY`/`onBarrierHit` for a bouncing boss like Bouncer Primal,
 * and `fireDrifterProjectile` for Snake's head (`_bossContext`, built once
 * in the constructor) — each class reads only the ones it actually uses
 * (see BossEnemy.js/SpiralBoss.js/BouncerPrimalBoss.js/SnakeBoss.js/
 * TetraBoss.js/NovaBoss.js/PulsorBoss.js/ZigzagBoss.js's own docs for
 * their attack patterns). Every boss renders itself individually
 * like Drifter/Bouncer (see `_renderIndividualEnemies`), and gets its own
 * boss-tier UI treatment — `renderBossHealthBar`, a separate method
 * GameplayScene calls from the fixed UI camera layer (not part of this
 * class's own `render()`, which
 * runs inside the panned/shaking world layer) — driven generically off
 * whichever boss instance is alive (`.name`/`.color`/`.healthFrac`), not
 * hardcoded to one boss type, and skipped outright for a boss that opts out
 * via `.hideHealthBar` (Bouncer Primal draws its own health as a number on
 * its hull instead — see that class's doc for why).
 */
import { Config } from '../core/Config.js';
import { Enemy, SCOUT_HULL_PTS } from './Enemy.js';
import { SniperEnemy } from './SniperEnemy.js';
import { DrifterEnemy, createDrifterPath, createSweeperPath, createDiverPath, createWeaverPath, BODY_PTS as DRIFTER_BODY_PTS } from './DrifterEnemy.js';
import { BouncerEnemy } from './BouncerEnemy.js';
import { BossEnemy } from './BossEnemy.js';
import { SpiralBoss } from './SpiralBoss.js';
import { BouncerPrimalBoss } from './BouncerPrimalBoss.js';
import { SnakeBoss } from './SnakeBoss.js';
import { TetraBoss } from './TetraBoss.js';
import { NovaBoss } from './NovaBoss.js';
import { PulsorBoss } from './PulsorBoss.js';
import { ZigzagBoss } from './ZigzagBoss.js';
import { EnemyBullets } from './EnemyBullet.js';
import { Rockets } from './Rockets.js';
import { SniperBullets } from './SniperBullets.js';
import { SpiralBullets } from './SpiralBullets.js';
import { TetraBullets } from './TetraBullets.js';
import { NovaSeedBullets } from './NovaSeedBullets.js';
import { NovaBullets } from './NovaBullets.js';
import { PulsorBullets } from './PulsorBullets.js';
import { ZigzagBullets } from './ZigzagBullets.js';
import { DrifterProjectiles } from './DrifterProjectiles.js';
import { Particles } from './Particles.js';
import { AudioPool } from '../core/AudioPool.js';

// Arbitrarily large multiplier on _playerDamage used by triggerSkillBomb to
// guarantee a one-shot kill regardless of level scaling, without needing to
// read any enemy type's own private health field directly. Only applied to
// regular (non-boss) enemies — see _applySkillBombToBoss for the capped,
// never-lethal damage a boss takes from the same button instead.
const SKILL_LETHAL_MULTIPLIER = 9999;

// Which boss CLASS to construct for a given Config.boss.roster key — see
// the constructor's boss-selection lookup and _spawnNext's 'boss' branch.
const BOSS_CLASSES = { scout1: BossEnemy, spiral: SpiralBoss, bouncerPrimal: BouncerPrimalBoss, snake: SnakeBoss, tetra: TetraBoss, nova: NovaBoss, pulsor: PulsorBoss, zigzag: ZigzagBoss };

// Pre-allocated world-space hull pools — reused every frame, zero heap allocations.
const MAX_BATCH = 20;
const _PTS      = SCOUT_HULL_PTS.length;
const _mkPool   = () => Array.from({ length: MAX_BATCH }, () =>
  ({ points: Array.from({ length: _PTS }, () => [0, 0]), closed: true }));
const _scoutNormalHulls     = _mkPool();
const _rocketeerNormalHulls = _mkPool();
const _sniperNormalHulls    = _mkPool();
const _flashHulls           = _mkPool();

// Pre-allocated boss-health-bar rectangles (track + fill), mutated in place
// every frame by renderBossHealthBar instead of building fresh nested arrays
// each call — a boss fight can be a large share of playtime, so this stays
// zero-allocation the same way the hull pools above do. Track's points never
// change (Config.boss.healthBar's x/y/width/height are fixed), only the
// fill rectangle's two right-edge x-coordinates move with boss.healthFrac.
const _bossHealthBarCfg   = Config.boss.healthBar;
const _bhbLeft            = _bossHealthBarCfg.x - _bossHealthBarCfg.width / 2;
const _bhbRight           = _bhbLeft + _bossHealthBarCfg.width;
const _bhbTop             = _bossHealthBarCfg.y;
const _bhbBottom          = _bhbTop + _bossHealthBarCfg.height;
const _bossHealthTrackPath = {
  points: [[_bhbLeft, _bhbTop], [_bhbRight, _bhbTop], [_bhbRight, _bhbBottom], [_bhbLeft, _bhbBottom]],
  closed: true,
};
const _bossHealthFillPath = {
  points: [[_bhbLeft, _bhbTop], [_bhbLeft, _bhbTop], [_bhbLeft, _bhbBottom], [_bhbLeft, _bhbBottom]],
  closed: true,
};
// fillStrokePaths wants an indexable array, not a bare path object — wrap
// each pooled path in its own single-element array ONCE so the render call
// below never allocates one fresh per frame either.
const _bossHealthTrackPathArr = [_bossHealthTrackPath];
const _bossHealthFillPathArr  = [_bossHealthFillPath];

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
   * @param {import('./HUD.js').HUD} hud  score is awarded directly onto it on kill; gold is collected via GoldPickups instead — see handleBulletHit/_rewardFor/checkGoldPickup
   * @param {import('../core/ScreenShake.js').ScreenShake} screenShake  triggered on barrier impacts — see the onBarrierHit closure below; kill-triggered shake/hit-stop instead lives in GameplayScene, driven by handleBulletHit's return value
   * @param {import('./PowerUps.js').PowerUps} powerUps  owned by GameplayScene, not this class — a fresh WaveManager is constructed every level, but an uncollected pickup shouldn't vanish with the old one, so the SAME pool instance is handed to each new WaveManager across level transitions. See GoldPickups' own param for why.
   * @param {import('./GoldPickups.js').GoldPickups} goldPickups  same cross-level-survival reasoning as `powerUps` above
   * @param {number} [dropChanceMultiplier]  multiplies both Config.powerUps.dropChance and Config.gold.dropChance for this WaveManager's whole lifetime — see _maybeDropPowerUp/_maybeDropGold. Defaults to 1 (no change); GameplayScene passes a boosted value for a run that claimed a Lucky Drop daily reward (see Config.dailyReward.luckyDrop, core/DailyReward.js's consumeLuckyDrop).
   */
  constructor(level, barrier, hud, screenShake, powerUps, goldPickups, dropChanceMultiplier = 1) {
    this._hud     = hud;
    this._barrier = barrier; // direct reference — needed by checkPowerUpPickup to heal it outside the onBarrierHit closure below
    this._dropChanceMultiplier = dropChanceMultiplier;

    this._resolveLevelAndBoss(level);
    this._buildBarrierCallbacks(barrier, screenShake);

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

    this._enemies = [];
    this._boss    = null; // set by _spawnNext on a boss level — see renderBossHealthBar

    this._buildProjectilePools();
    this._buildParticlePools();

    this._powerUps    = powerUps;    // not owned here — see constructor doc
    this._goldPickups = goldPickups; // not owned here — see constructor doc

    // Same audio file across all enemy types; volume set per-play (see
    // _playExplosionSfx) since it varies by which type died.
    this._sfxPool = new AudioPool(Config.enemy.scout.audio.src, Config.enemy.scout.audio.poolSize);

    this._buildFireCallbacks();

    this._waveClear = false;
  }

  /**
   * Resolves which level/wave content applies, and — every
   * Config.boss.everyNLevels levels (7, 14, 21, ...) — which boss takes
   * over the wave entirely. Checked against the raw level number rather
   * than read from `Config.waves.levels` (which only defines 30 entries and
   * caps at the last one forever), so boss levels keep recurring past level
   * 30 too. Sets `_level`, `_isBossLevel`, `_bossKey`, `_bossCfg`, `_waveCfg`.
   */
  _resolveLevelAndBoss(level) {
    const levels = Config.waves.levels;
    this._level = level;
    // A boss wave completely replaces the level's normal roster. This
    // synthetic single-group config feeds the exact same spawn machinery
    // every other level already uses (`_totalToSpawn`/`_groupForIdx`/
    // `_spawnNext`) — see `_spawnNext`'s own 'boss' branch for how that
    // group actually gets built.
    this._isBossLevel = level % Config.boss.everyNLevels === 0;
    // Which boss appears is read off Config.boss.roster, cycling once every
    // boss has had a turn (1st boss-level encounter → roster[0], 2nd →
    // roster[1], 3rd → roster[0] again, ...) — see BOSS_CLASSES above for
    // the matching class lookup used in _spawnNext. `_bossCfg` falls back to
    // scout1 on non-boss levels purely so `_bossParticles` below always has
    // a valid (if never-emitted) color to construct with.
    this._bossKey = null;
    this._bossCfg = Config.boss.scout1;
    if (this._isBossLevel) {
      const bossEncounterNum = level / Config.boss.everyNLevels; // 1, 2, 3, ...
      this._bossKey = Config.boss.roster[(bossEncounterNum - 1) % Config.boss.roster.length];
      this._bossCfg = Config.boss[this._bossKey];
    }
    this._waveCfg = this._isBossLevel
      ? { enemies: [{ type: 'boss', count: 1, spawnInterval: 0 }] }
      : levels[Math.min(level - 1, levels.length - 1)];
  }

  /** Sets `_barrierSurfaceY`, `_onBarrierHit`, `_onDrifterBarrierHit` — shared by every attack source that can hit the barrier. */
  _buildBarrierCallbacks(barrier, screenShake) {
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
  }

  /** Constructs every projectile pool (enemy bullets, sniper/spiral bullets, rockets, drifter lashes) and their fire-and-forget impact callbacks. */
  _buildProjectilePools() {
    this._enemyBullets  = new EnemyBullets();
    this._sniperBullets = new SniperBullets();
    this._spiralBullets = new SpiralBullets();
    this._tetraBullets  = new TetraBullets();
    this._novaBullets   = new NovaBullets();
    // A Nova seed's `onDetonate` fans out into `fragment.count` spiral
    // fragments — see NovaBoss.js's class doc for the golden-angle/
    // speed-step technique that makes straight-line bullets trace a spiral.
    // This fan-out formula lives HERE (not in NovaSeedBullets/NovaBoss) —
    // same "pool reports WHEN, WaveManager decides WHAT" split Rockets'
    // own onDetonate below already keeps.
    this._novaSeedBullets = new NovaSeedBullets({
      onDetonate: (x, y) => {
        const { fragment } = Config.boss.nova;
        const startAngle = Math.random() * Math.PI * 2;
        for (let i = 0; i < fragment.count; i++) {
          const angle = startAngle + i * fragment.angleStep;
          const speed = fragment.baseSpeed + i * fragment.speedStep;
          this._novaBullets.fire(x, y, angle, speed);
        }
      },
    });
    this._pulsorBullets = new PulsorBullets();
    this._zigzagBullets = new ZigzagBullets();
    this._rockets = new Rockets({
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
  }

  /** Constructs one Particles pool per enemy/boss variant that can die or emit sparks. Reads `_bossCfg`, so must run after `_resolveLevelAndBoss`. */
  _buildParticlePools() {
    this._particles          = new Particles(Config.enemy.scout.color);
    this._rocketeerParticles = new Particles(Config.enemy.rocketeer.color);
    this._sniperParticles    = new Particles(Config.enemy.sniper.color);
    this._drifterParticles   = new Particles(Config.enemy.drifter.color);
    this._sweeperParticles   = new Particles(Config.enemy.drifter.sweeper.color, Config.enemy.drifter.sweeper.sparksPerEmit);
    this._diverParticles     = new Particles(Config.enemy.drifter.diver.color, Config.enemy.drifter.diver.sparksPerEmit);
    this._weaverParticles    = new Particles(Config.enemy.drifter.weaver.color, Config.enemy.drifter.weaver.sparksPerEmit);
    this._bouncerParticles   = new Particles(Config.enemy.bouncer.color, Config.enemy.bouncer.sparksPerEmit);
    this._bossParticles      = new Particles(this._bossCfg.color, this._bossCfg.sparksPerEmit);
    this._snakeSegmentParticles = new Particles(Config.boss.snake.color, Config.boss.snake.segment.sparksPerEmit);
  }

  /** Pre-binds every fire callback (zero closures per frame) and bundles the boss-facing subset into `_bossContext`. Reads the projectile pools and barrier callbacks, so must run after both are built. */
  _buildFireCallbacks() {
    this._fireBullet = (ox, oy, tx, ty) => this._enemyBullets.fire(ox, oy, tx, ty);
    // `sizeMult` is only ever passed by BossEnemy.js's rocketeer phase (see
    // Config.boss.scout1.rocketeerPhase.rocketSizeMult) — a regular
    // Rocketeer's onFire call omits it, so `Rockets.fire`'s own default (1)
    // applies and its rocket's rendered size is unaffected.
    this._fireRocket = (ox, oy, tx, ty, sizeMult) => this._rockets.fire(ox, oy, tx, ty, sizeMult);
    // `speedMult` is only ever passed by BossEnemy.js's sniper phase (see
    // Config.boss.scout1.sniperPhase.bulletSpeedMult) — a regular
    // SniperEnemy's onFire call omits it, so `SniperBullets.fire`'s own
    // default (1) applies and its shot is unaffected.
    this._fireSniperBullet = (ox, oy, tx, ty, speedMult) => this._sniperBullets.fire(ox, oy, tx, ty, speedMult);
    this._fireSpiralBullet = (ox, oy, angle) => this._spiralBullets.fire(ox, oy, angle);
    this._fireTetraBullet = (ox, oy, angle) => this._tetraBullets.fire(ox, oy, angle);
    this._fireNovaSeed = (ox, oy, tx, ty) => this._novaSeedBullets.fire(ox, oy, tx, ty);
    // Nova's phase-2 bullet-hell volleys fire the SAME seed pool, just in a
    // fixed direction instead of aimed at the player (NovaSeedBullets'
    // `fireAngle` — see NovaBoss._fireVolley) — every one of those seeds
    // still independently spreads into its own spiral burst later, through
    // this exact same onDetonate wiring above.
    this._fireNovaSeedAngle = (ox, oy, angle) => this._novaSeedBullets.fireAngle(ox, oy, angle);
    this._firePulsorBullet = (ox, oy, angle, speed) => this._pulsorBullets.fire(ox, oy, angle, speed);
    this._fireZigzagBullet = (ox, oy, angle) => this._zigzagBullets.fire(ox, oy, angle);
    this._fireDrifterProjectile = (ox, oy, tx, ty, color) => this._drifterProjectiles.fire(ox, oy, tx, ty, color);
    // Passed into Enemy.js's repositioning so it picks a fresh rest point
    // that's already clear of other enemies, instead of a blind random one
    // — see _findClearRestPoint's own doc for why picking clear beats only
    // reactively separating afterward.
    this._findClearRestPoint = (enemy) => this._findClearRestPointFor(enemy);

    // Every callback a boss could possibly need, bundled as one object — see
    // BossEnemy.update's doc for why a bag-of-callbacks beats positional
    // args once more than one boss class (with different subsets of
    // callbacks) shares the same generic update() call site below.
    // barrierSurfaceY/onBarrierHit are the same closures a regular Bouncer
    // gets (see the 'bouncer' branch just below) — Bouncer Primal is the
    // only boss that currently reads them; fireDrifterProjectile is the
    // same closure a regular Drifter's lash gets — only Snake's head reads
    // it. Every boss receives the full bag regardless.
    this._bossContext = {
      fireBullet: this._fireBullet,
      fireRocket: this._fireRocket,
      fireSniperBullet: this._fireSniperBullet,
      fireSpiralBullet: this._fireSpiralBullet,
      fireTetraBullet: this._fireTetraBullet,
      fireNovaSeed: this._fireNovaSeed,
      fireNovaSeedAngle: this._fireNovaSeedAngle,
      firePulsorBullet: this._firePulsorBullet,
      fireZigzagBullet: this._fireZigzagBullet,
      fireDrifterProjectile: this._fireDrifterProjectile,
      barrierSurfaceY: this._barrierSurfaceY,
      onBarrierHit: this._onBarrierHit,
    };
  }

  /**
   * @param {number} dt
   * @param {number} playerX
   * @param {number} playerY
   * @param {number} [magnetRadius]  vp — forwarded into PowerUps/GoldPickups so nearby drops pull toward the player, see Player.magnetRadius. Defaults to 0 (no pull) so callers that don't pass it — none currently — degrade safely.
   * @param {number} [magnetPullAccel]  vp/sec^2 — see Player.magnetPullAccel
   */
  update(dt, playerX, playerY, magnetRadius = 0, magnetPullAccel = 0) {
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
    this._bossParticles.update(dt);
    this._snakeSegmentParticles.update(dt);
    this._rockets.update(dt, playerX, playerY);
    this._drifterProjectiles.update(dt, playerX, playerY);
    this._enemyBullets.update(dt);
    this._sniperBullets.update(dt);
    this._spiralBullets.update(dt);
    this._tetraBullets.update(dt);
    this._novaBullets.update(dt);
    this._novaSeedBullets.update(dt);
    this._pulsorBullets.update(dt);
    this._zigzagBullets.update(dt);
    this._powerUps.update(dt, playerX, playerY, magnetRadius, magnetPullAccel);
    this._goldPickups.update(dt, playerX, playerY, magnetRadius, magnetPullAccel);

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
      if (e.type === 'boss') {
        e.update(dt, playerX, playerY, this._bossContext);
        continue;
      }
      if (e.type === 'snakeSegment') {
        e.update(dt, playerX, playerY, this._fireDrifterProjectile);
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

    // Time-based summons (currently only Snake's growth tick — see
    // SnakeBoss.update) drain here every frame, unlike Bouncer Primal's
    // on-hit summons which only ever queue inside handleBulletHit and are
    // drained there. Both share the exact same generic drainSummons()
    // interface, so this is harmless (and simply empty) for any boss whose
    // summons are hit-triggered instead of time-triggered.
    if (this._boss?.drainSummons) {
      for (const summon of this._boss.drainSummons()) this._enemies.push(summon);
    }

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
    this._powerUps.render(renderer);
    this._goldPickups.render(renderer);
  }

  /** Projectile pools — enemy bullets, sniper bullets, homing rockets, drifter orbs. */
  _renderProjectiles(renderer) {
    this._enemyBullets.render(renderer);
    this._sniperBullets.render(renderer);
    this._spiralBullets.render(renderer);
    this._tetraBullets.render(renderer);
    this._novaBullets.render(renderer);
    this._novaSeedBullets.render(renderer);
    this._pulsorBullets.render(renderer);
    this._zigzagBullets.render(renderer);
    this._rockets.render(renderer);
    this._drifterProjectiles.render(renderer);
  }

  /** Engine exhaust — must render behind hulls (Drifter/Bouncer have no engine flame). */
  _renderEngineFlames(renderer) {
    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'drifter' || e.type === 'bouncer' || e.type === 'boss' || e.type === 'snakeSegment') continue;
      e.renderFlame(renderer);
    }
  }

  /**
   * World-transform every batchable enemy's hull into its (type × flash)
   * pool, then draw each non-empty pool in one fillStrokePaths call — keeps
   * GPU shadow-blur passes flat regardless of enemy count. Drifter/Bouncer
   * hulls vary per-clone and are rendered individually in
   * _renderIndividualEnemies instead. Split into an assign pass (writes
   * world-space points into the pools, returns per-pool counts) and a draw
   * pass (issues the actual fillStrokePaths calls) — two distinguishable
   * jobs glued into one call site below.
   */
  _renderHullBatches(renderer) {
    const counts = this._assignHullBatches();
    this._drawHullBatches(renderer, counts);
  }

  /** Walks live enemies, world-transforms each batchable one's hull into its (type × flash) pool, and returns how many landed in each pool. */
  _assignHullBatches() {
    let scoutNormalCount = 0, rocketeerNormalCount = 0, sniperNormalCount = 0, flashCount = 0;
    let drifterNormalCount = 0, drifterFlashCount = 0, sweeperNormalCount = 0, sweeperFlashCount = 0,
        diverNormalCount = 0, diverFlashCount = 0, weaverNormalCount = 0, weaverFlashCount = 0;

    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      if (e.type === 'bouncer' || e.type === 'boss' || e.type === 'snakeSegment') continue; // rendered individually/batched separately below
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

    return {
      scoutNormalCount, rocketeerNormalCount, sniperNormalCount, flashCount,
      drifterNormalCount, drifterFlashCount, sweeperNormalCount, sweeperFlashCount,
      diverNormalCount, diverFlashCount, weaverNormalCount, weaverFlashCount,
    };
  }

  /** Issues one fillStrokePaths call per non-empty pool `_assignHullBatches` just filled. */
  _drawHullBatches(renderer, counts) {
    const {
      scoutNormalCount, rocketeerNormalCount, sniperNormalCount, flashCount,
      drifterNormalCount, drifterFlashCount, sweeperNormalCount, sweeperFlashCount,
      diverNormalCount, diverFlashCount, weaverNormalCount, weaverFlashCount,
    } = counts;
    const sCfg  = Config.enemy.scout;
    const rCfg  = Config.enemy.rocketeer;
    const snCfg = Config.enemy.sniper;

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
      if (e.type === 'drifter' || e.type === 'bouncer' || e.type === 'boss' || e.type === 'snakeSegment') continue;
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
      else if (e.type === 'bouncer' || e.type === 'boss') e.render(renderer);
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
    this._bossParticles.render(renderer);
    this._snakeSegmentParticles.render(renderer);
  }

  /**
   * Boss health bar — top-center, wider than the player's own health bar,
   * shown only while a boss is alive. A SEPARATE method, not part of
   * `render()` above: `render()` is called by GameplayScene from inside the
   * panned/shaking "world" camera offset, but this is UI chrome that should
   * stay fixed like the HUD — GameplayScene calls this only after resetting
   * the camera to (0, 0), the same fixed-layer treatment HUD/PlayerSkill get.
   * @param {import('../core/Renderer.js').Renderer} renderer
   */
  renderBossHealthBar(renderer) {
    if (!this._boss || !this._boss.alive || this._boss.hideHealthBar) return;
    const cfg  = _bossHealthBarCfg;
    const boss = this._boss;

    renderer.drawText(boss.name, cfg.x, cfg.y - 14, {
      font: cfg.nameFont, color: boss.color, glowBlur: cfg.nameGlowBlur, glowColor: boss.color,
    });

    renderer.fillStrokePaths(_bossHealthTrackPathArr, { fillColor: cfg.trackColor, strokeColor: cfg.trackColor, lineWidth: 1 });

    const frac = boss.healthFrac;
    if (frac > 0) {
      const fillRight = _bhbLeft + cfg.width * frac;
      const fp = _bossHealthFillPath.points;
      fp[1][0] = fillRight;
      fp[2][0] = fillRight;
      renderer.fillStrokePaths(_bossHealthFillPathArr, { fillColor: boss.color, strokeColor: boss.color, lineWidth: 1 });
    }
  }

  /**
   * Called by GameplayScene when a player bullet hits an enemy.
   * @param {number} [damageMultiplier]  applied on top of `_playerDamage` —
   *   GameplayScene passes >1 while a fireBoost PowerUp is active (see
   *   Config.powerUps.fireBoost), 1 otherwise.
   * @param {number} [scoreMultiplier]  applied to this kill's POINTS only
   *   (never gold) — GameplayScene passes its current combo streak
   *   multiplier here (see Config.combo, GameplayScene._checkCollisions), 1
   *   otherwise (e.g. triggerSkillBomb's kills, which deliberately don't
   *   feed or benefit from the combo — see that method's own doc).
   * @returns {boolean} true if this hit was fatal — GameplayScene uses this to trigger kill-feedback (screen shake, hit-stop)
   */
  handleBulletHit(enemy, damageMultiplier = 1, scoreMultiplier = 1) {
    const killed = enemy.hit(this._playerDamage * damageMultiplier);

    // Bouncer Primal (and any future boss with its own summon-on-hit
    // mechanic) queues newly-summoned enemies inside its own hit() —
    // drained here regardless of whether THIS particular hit was fatal,
    // since the summon already happened the instant the hit landed. Every
    // other enemy type simply has no `drainSummons` method, so this is a no-op for them.
    if (enemy.drainSummons) {
      for (const summon of enemy.drainSummons()) this._enemies.push(summon);
    }

    // Same on-hit (not just on-kill) shape as the summon drain above — a
    // boss with its own higher on-hit PowerUp chance (currently only
    // Bouncer Primal) queues drops inside its own hit(), drained here every
    // hit regardless of whether it was fatal.
    if (enemy.drainPowerUpDrops) {
      const dropCount = enemy.drainPowerUpDrops();
      for (let i = 0; i < dropCount; i++) this._spawnRandomPowerUp(enemy.x, enemy.y);
    }

    if (killed) {
      const reward = this._rewardFor(enemy);
      this._hud.score += Math.round(reward.points * scoreMultiplier);

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
      } else if (enemy.type === 'boss') {
        this._bossParticles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(this._bossCfg.audio.volume);
        this._boss = null; // health bar disappears immediately rather than lingering through the death-flash
      } else if (enemy.type === 'snakeSegment') {
        this._snakeSegmentParticles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.boss.snake.segment.audio.volume);
      } else {
        this._particles.emit(enemy.x, enemy.y);
        this._playExplosionSfx(Config.enemy.scout.audio.volume);
      }
      this._maybeDropPowerUp(enemy.x, enemy.y);
      this._maybeDropGold(enemy.x, enemy.y, reward.gold);
    }
    return killed;
  }

  /**
   * Flat-chance PowerUp drop on a real kill — see Config.powerUps. Only
   * called from handleBulletHit's `killed` branch, so a Diver/Weaver clone
   * destroyed by reaching the barrier (routed through _onDrifterBarrierHit
   * instead, which never calls this) can't drop one — that's the player
   * failing to intercept it, not a kill worth rewarding.
   */
  _maybeDropPowerUp(x, y) {
    if (Math.random() >= Config.powerUps.dropChance * this._dropChanceMultiplier) return;
    this._spawnRandomPowerUp(x, y);
  }

  /**
   * Flat-chance gold-coin drop on a real kill — a separate roll from
   * _maybeDropPowerUp/Config.powerUps on purpose, see Config.gold's class
   * doc (gold used to be guaranteed on every kill, so it needs a much
   * higher rate than the rare PowerUps pool). Same "only real kills"
   * restriction as _maybeDropPowerUp applies here too.
   * @param {number} x @param {number} y @param {number} value  gold amount from _rewardFor
   */
  _maybeDropGold(x, y, value) {
    if (Math.random() >= Config.gold.dropChance * this._dropChanceMultiplier) return;
    this._goldPickups.spawn(x, y, value);
  }

  /**
   * Picks a random PowerUp type and spawns it — the un-gated half of
   * `_maybeDropPowerUp` (its own outer `dropChance` roll happens before
   * this), pulled out so it can also be reused by a boss's own on-hit drop
   * chance (currently only Bouncer Primal's, higher than the flat kill-time
   * `dropChance` — see BouncerPrimalBoss.hit and handleBulletHit's
   * `drainPowerUpDrops` check).
   *
   * Type is a cumulative-threshold roll across the four kinds — shield,
   * then fireBoost, then invincible, health taking whatever's left — not
   * four independent rolls, so the weights always sum to a clean 100%
   * regardless of their individual values.
   */
  _spawnRandomPowerUp(x, y) {
    const { shieldDropWeight, fireBoostDropWeight, invincibleDropWeight } = Config.powerUps;
    const roll = Math.random();
    const type = roll < shieldDropWeight ? 'shield'
      : roll < shieldDropWeight + fireBoostDropWeight ? 'fireBoost'
      : roll < shieldDropWeight + fireBoostDropWeight + invincibleDropWeight ? 'invincible'
      : 'health';
    this._powerUps.spawn(x, y, type);
  }

  /**
   * Score/gold reward for a just-killed enemy. Drifter clones already cache
   * their resolved per-variant Config object as `_palette` (e.g.
   * `Config.enemy.drifter.sweeper`), so their reward is just a field read —
   * Bouncer has no such cached palette (only radius/health vary by variant,
   * not color), so it gets an explicit branch here instead.
   */
  _rewardFor(enemy) {
    if (enemy.type === 'boss') {
      return { points: this._bossCfg.points, gold: this._bossCfg.gold };
    }
    if (enemy.type === 'snakeSegment') {
      return { points: Config.boss.snake.segment.points, gold: Config.boss.snake.segment.gold };
    }
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
   * etc.) even during that window, same as a real impact would be. The one
   * exception is a boss's own `checkLaserHit` (currently only Tetra's phase-2
   * beams) — nothing to consume, it's a live geometry test re-run every
   * frame the beam is up, same as Bouncer's circle-based `contactDamage`.
   * @param {{ x: number, y: number, hitRadius: number }} player
   * @returns {number}
   */
  checkPlayerHit(player) {
    let damage = this._pendingPlayerDamage;
    this._pendingPlayerDamage = 0;

    const { x, y, hitRadius } = player;

    if (this._enemyBullets.checkHit(x, y, hitRadius)) damage += Config.enemyBullet.damage;
    if (this._sniperBullets.checkHit(x, y, hitRadius)) damage += Config.enemy.sniper.bullet.damage;
    if (this._spiralBullets.checkHit(x, y, hitRadius)) damage += Config.boss.spiral.bullet.damage;
    if (this._tetraBullets.checkHit(x, y, hitRadius)) damage += Config.boss.tetra.bullet.damage;
    if (this._novaBullets.checkHit(x, y, hitRadius)) damage += Config.boss.nova.fragment.damage;
    if (this._novaSeedBullets.checkHit(x, y, hitRadius)) damage += Config.boss.nova.seed.damage;
    if (this._pulsorBullets.checkHit(x, y, hitRadius)) damage += Config.boss.pulsor.pulseDamage;
    if (this._zigzagBullets.checkHit(x, y, hitRadius)) damage += Config.boss.zigzag.bullet.damage;

    for (let i = 0; i < this._enemies.length; i++) {
      const e = this._enemies[i];
      // A regular Bouncer always deals contact damage; a boss opts in by
      // exposing its own `.contactDamage` (currently only Bouncer Primal —
      // see that class's doc) rather than every other boss needing a
      // no-op getter just to be excluded here.
      if (e.type === 'bouncer' || e.contactDamage > 0) {
        const dx = e.x - x, dy = e.y - y;
        const r  = e.hitRadius + hitRadius;
        if (dx * dx + dy * dy <= r * r) {
          damage += e.type === 'bouncer' ? Config.enemy.bouncer.contactDamage : e.contactDamage;
        }
      }
      // A boss with a continuous beam attack (currently only Tetra's phase-2
      // lasers) opts in by exposing `.checkLaserHit`, a live point-to-segment
      // test rather than a circle — see TetraBoss.checkLaserHit's own doc.
      if (e.checkLaserHit) damage += e.checkLaserHit(x, y, hitRadius);
    }

    return damage;
  }

  /**
   * Called once per frame by GameplayScene — every active PowerUps pickup
   * tested against `player`'s circle (see PowerUps.checkPickup). A shield
   * pickup heals the barrier directly (WaveManager already holds a
   * `_barrier` reference for onBarrierHit). A health, fireBoost, or
   * invincible pickup can't be applied the same way — WaveManager never
   * holds a `player` instance (only its x/y each frame), and the
   * fire-rate/damage-multiplier timer spans both Bullets and this class
   * (see GameplayScene's `_fireBoostTimer`) — so all three are reported
   * back in the returned object for GameplayScene to apply, the same shape
   * checkPlayerHit already uses for damage/`player.takeDamage()`. Loops so
   * several pickups collected in the same frame are all applied, not just
   * the first.
   * @param {{ x: number, y: number, hitRadius: number }} player
   * @returns {{ playerHeal: number, fireBoost: boolean, invincible: boolean }}
   *   playerHeal — total player health to restore this frame (0 if none);
   *   fireBoost/invincible — true if at least one of that kind was
   *   collected this frame
   */
  checkPowerUpPickup(player) {
    let playerHeal = 0;
    let fireBoost = false;
    let invincible = false;
    let type;
    while ((type = this._powerUps.checkPickup(player.x, player.y, player.hitRadius))) {
      if (type === 'shield') this._barrier.heal(Config.powerUps.shield.healAmount);
      else if (type === 'fireBoost') fireBoost = true;
      else if (type === 'invincible') invincible = true;
      else playerHeal += Config.powerUps.health.healAmount;
    }
    return { playerHeal, fireBoost, invincible };
  }

  /**
   * Collects every gold coin currently overlapping the player, same
   * loop-until-empty shape as checkPowerUpPickup — several coins picked up
   * in the same frame are all summed rather than just the first. GoldPickups
   * returns 0 (falsy) once nothing overlaps, ending the loop.
   * @param {{ x: number, y: number, hitRadius: number }} player
   * @returns {number} total gold collected this frame (0 if none)
   */
  checkGoldPickup(player) {
    let total = 0;
    let value;
    while ((value = this._goldPickups.checkPickup(player.x, player.y, player.hitRadius))) {
      total += value;
    }
    return total;
  }

  /**
   * The player's special skill: instantly kills every regular enemy
   * currently on screen, reusing the exact same kill pipeline a bullet hit
   * uses (handleBulletHit — reward, explosion, SFX, Splitter fragments,
   * PowerUp drop roll, all included for free). A boss (`type === 'boss'`)
   * is a deliberate exception — seeing it vanish in one tap would trivialize
   * the fight, so it takes a heavy-but-capped hit instead (see
   * `_applySkillBombToBoss`) and lives to keep fighting. "On screen" is a
   * plain bounds check against Config.virtual — an enemy still off-screen
   * (mid entry-glide, or a Drifter clone that hasn't reached the play area
   * yet, see DrifterEnemy's own `_visible`) is untouched, and so are any
   * already-fired enemy projectiles (this clears enemies, not bullets).
   *
   * `damage` is an arbitrarily large multiplier on `_playerDamage` rather
   * than reading each enemy's own health field directly — every enemy type
   * already exposes a uniform `.hit(damage)` (handleBulletHit calls it the
   * same way for all four families), so this needs no per-type knowledge of
   * private health-field names to guarantee a one-shot kill regardless of
   * level scaling.
   *
   * The enemy list length is snapshotted before the loop — a killed
   * Splitter pushes 3 fresh fragments onto `_enemies` mid-loop (see
   * handleBulletHit), and those are deliberately left for the player to
   * mop up afterward rather than recursively bombed in the same pass.
   * @returns {{ killCount: number, hitBoss: boolean }} how many regular
   *   enemies died and whether a boss was damaged, so GameplayScene can
   *   skip the cooldown/shake entirely if the button did nothing at all
   */
  triggerSkillBomb() {
    const { width: vW, height: vH } = Config.virtual;
    const n = this._enemies.length;
    let killCount = 0;
    let hitBoss = false;
    for (let i = 0; i < n; i++) {
      const e = this._enemies[i];
      if (!e.alive) continue;
      if (e.x < 0 || e.x > vW || e.y < 0 || e.y > vH) continue; // only what's actually on screen
      if (e.type === 'boss') {
        if (this._applySkillBombToBoss(e)) hitBoss = true;
        continue;
      }
      if (this.handleBulletHit(e, SKILL_LETHAL_MULTIPLIER)) killCount++;
    }
    return { killCount, hitBoss };
  }

  /**
   * Deals Config.boss.skillBombDamageFrac of the boss's own max health,
   * capped so it can never be the killing blow — reuses handleBulletHit
   * (so a boss's own on-hit mechanics, e.g. Bouncer Primal's summon roll,
   * still fire normally) by expressing the capped raw damage as an
   * equivalent `_playerDamage` multiplier.
   * @returns {boolean} true if any damage was actually dealt (false only
   *   if the boss was already down to 1 health, an edge case the normal
   *   bullet-kill path will finish off next hit)
   */
  _applySkillBombToBoss(boss) {
    const maxHealth = boss.maxHealth;
    const currentHealth = boss.healthFrac * maxHealth;
    const damage = Math.min(Config.boss.skillBombDamageFrac * maxHealth, currentHealth - 1);
    if (damage <= 0) return false;
    this.handleBulletHit(boss, damage / this._playerDamage);
    return true;
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
      && !this._bossParticles.active
      && !this._snakeSegmentParticles.active
      && !this._rockets.active
      && !this._drifterProjectiles.active
      && !this._enemyBullets.active
      && !this._sniperBullets.active
      && !this._spiralBullets.active
      && !this._tetraBullets.active
      && !this._novaBullets.active
      && !this._novaSeedBullets.active
      && !this._pulsorBullets.active
      && !this._zigzagBullets.active;
  }

  // ---------------------------------------------------------------------------

  _resolveOverlaps() {
    const { restXMargin, restYMin, restYMax } = Config.enemy.scout;
    const { width: vW, height: vH } = Config.virtual;
    const xLo = restXMargin,   xHi = vW - restXMargin;
    const yLo = vH * restYMin, yHi = vH * restYMax;

    for (let i = 0; i < this._enemies.length; i++) {
      const a = this._enemies[i];
      if (a._state === 'entering' || a._type === 'drifter' || a._type === 'bouncer' || a._type === 'boss' || a._type === 'snakeSegment') continue;

      for (let j = i + 1; j < this._enemies.length; j++) {
        const b = this._enemies[j];
        if (b._state === 'entering' || b._type === 'drifter' || b._type === 'bouncer' || b._type === 'boss' || b._type === 'snakeSegment') continue;

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
        if (other === enemy || other._state === 'entering' || other._type === 'drifter' || other._type === 'bouncer' || other._type === 'boss' || other._type === 'snakeSegment') continue;
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

    if (type === 'boss') {
      const BossClass = BOSS_CLASSES[this._bossKey];
      // `this._level` is only read by SnakeBoss, to derive its segments' own
      // per-level health bonus (Config.boss.snake.segment.healthPerLevel) —
      // every other boss class's constructor simply ignores the extra arg.
      const boss = new BossClass(this._healthBonus(this._bossCfg), this._level);
      this._enemies.push(boss);
      this._boss = boss;
      // Snake's initial chain (everything behind the head) is queued via
      // the exact same drainSummons() interface its later growth ticks use
      // — draining once right here collects that starting formation the
      // same way. A no-op for every other boss class, which doesn't define drainSummons.
      if (boss.drainSummons) {
        for (const summon of boss.drainSummons()) this._enemies.push(summon);
      }
      this._advanceSpawnIndex();
      return;
    }

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
