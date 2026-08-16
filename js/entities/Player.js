/**
 * Player.js
 * The player's ship: a neon-outline sci-fi fighter silhouette, drawn as
 * a handful of stroked vector paths with a glow — a "wireframe HUD"
 * look (strokes only, deliberately no fills).
 *
 * On creation it sits off-screen below the play area; `update` eases it
 * up into its resting position over `Config.player.entryDuration` (an
 * ease-out "launching into the scene" arrival, timed to start the
 * moment the gameplay scene does — alongside the starfield's fade-in).
 * Its thruster flame flickers continuously beneath it the whole time,
 * including during the entrance, since the ship is always under power.
 *
 * After the entry animation completes the ship becomes controllable:
 * `moveTo(x, y)` sets a target (clamped to the play-area bounds), called
 * by the scene on every pointer-move event while the player's finger or
 * mouse button is held. `update` then moves `x/y` toward that target — by
 * default an instant snap (core/Settings.js's sensitivity setting at its
 * default of 0), or an exponential ease if the Settings panel's
 * sensitivity slider has been raised — see `update`'s own comment. While
 * no pointer is active the ship holds its last position.
 *
 * This is the game's first entity: a plain object with its own
 * `update(dt)` / `render(renderer)`, composed into GameplayScene rather
 * than owning a Renderer or touching anything outside itself.
 *
 * Health/damage: `health` is a plain public field (same convention as
 * `Barrier.health`) that WaveManager.checkPlayerHit drains via
 * `takeDamage`. A hit triggers a brief white flash plus an invulnerability
 * window (`Config.player.invulnDuration`) during which further damage is
 * ignored — GameplayScene reads `takeDamage`'s return value to know
 * whether a hit actually applied before triggering shake/hit-stop
 * feedback. Below `Config.player.lowHealth.threshold` the hull pulses
 * warning red, identical in shape to Barrier's own low-health pulse; a
 * short danger blip plays immediately on crossing into that state, then
 * repeats every `Config.player.lowHealth.warningInterval` seconds, capped
 * at `warningMaxRepeats` plays per danger episode (Barrier.js mirrors
 * this for its own health); and HUD's health bar shows a pulsing "!" icon
 * for as long as the danger persists (independent of the capped blip —
 * the icon isn't capped, only the sound is).
 *
 * A separate, much longer immunity window comes from an 'invincible'
 * PowerUp pickup (see Config.powerUps.invincible and
 * WaveManager.checkPowerUpPickup): `activateInvincibility` sets
 * `_invincibleTimer`, which `takeDamage` checks alongside the brief
 * post-hit `_invulnTimer` — either one blocks a hit outright. While it's
 * running, a pulsing ring bubble is drawn around the whole ship (see
 * `_renderInvincibleBubble`) so the immunity reads as an obvious, deliberate
 * state rather than the same quick post-hit blink. A repeat pickup
 * refreshes `_invincibleTimer` back to the full duration rather than
 * stacking with whatever's left of a previous one.
 *
 * Magnet: `magnetRadius`/`magnetPullAccel` read off `Config.player.magnet
 * .levels[_magnetLevel - 1]` and are handed to WaveManager.update each
 * frame, which forwards them into GoldPickups/PowerUps so nearby drops
 * accelerate toward the ship instead of just falling.
 *
 * Shop upgrades: magnet is one of five parts (wings, engine, cannon,
 * magnet, missiles) purchasable in Shop.js — `_wingsLevel`/`_engineLevel`/
 * `_cannonLevel`/`_magnetLevel`/`_missileLevel` are all 1-based indices into
 * their own `Config.player.<part>.levels` array, loaded once from
 * PlayerUpgrades.js at construction and updated live by `applyUpgrade` the
 * instant a purchase happens (see that method's own doc — Shop.js calls it
 * on both the real gameplay Player and its own frozen preview instance).
 * Each level's stat effect is read through a getter (`maxHealth`,
 * `damageMultiplier`, `fireRateMultiplier`, `missileDamageMultiplier`, ...)
 * rather than cached, so nothing needs to be recomputed by hand when a level
 * changes — only the hull's decoration nubs (`_extraPaths`, see
 * `_rebuildExtraPaths`) are cached, since rebuilding those per-frame would
 * be wasted work for something that only ever changes on a purchase.
 * `renderScale` (used by `render`/`_renderFlame` instead of
 * `Config.player.scale` directly) grows a little with total upgrades
 * purchased, so the added decoration actually reads at a glance instead of
 * staying pinned at the same small silhouette — deliberately visual only,
 * see that getter's own doc for why movement bounds/`hitRadius` don't grow
 * with it.
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';
import { AudioPool } from '../core/AudioPool.js';
import { getSensitivity, dangerColor, vibrate } from '../core/Settings.js';
import { getPartLevel, setPartLevel } from '../core/PlayerUpgrades.js';

// Local ship-space outline coordinates (nose toward -Y — "forward", since
// the ship faces up the screen). Only the right half is authored; it's
// mirrored across the centerline below so the silhouette is guaranteed
// symmetric without hand-duplicating points.
const SHIP_HALF_OUTLINE = [
  [0, -24],  // nose tip
  [3, -20],  // nose taper
  [5, -14],  // cockpit-side fuselage
  [9, -6],   // wing root, leading edge
  [32, 12],  // wingtip (swept back)
  [15, 16],  // wing trailing edge
  [9, 24],   // aft fuselage
  [18, 36],  // tail fin tip
  [8, 33],   // tail fin trailing edge
  [4, 40],   // engine nacelle outer corner
  [0, 38],   // tail centerline notch
];

const SHIP_OUTLINE = mirrorAcrossCenterline(SHIP_HALF_OUTLINE);

const CANOPY = [
  [0, -28],
  [4, -20],
  [0, -12],
  [-4, -20],
];

const SPINE = [
  [0, -12],
  [0, 30],
];

// Pre-built once — SHIP_OUTLINE/CANOPY/SPINE never change, so render() reuses
// this same array/path-object set every frame instead of allocating fresh ones.
const SHIP_PATHS = [
  { points: SHIP_OUTLINE },
  { points: CANOPY },
  { points: SPINE, closed: false },
];

/** Mirror every point but the first/last (which sit on the x=0 centerline). */
function mirrorAcrossCenterline(halfOutline) {
  const mirrored = halfOutline
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y]);
  return [...halfOutline, ...mirrored];
}

/** Mirror a standalone (non-centerline-anchored) point set across x=0. */
function mirrorX(points) {
  return points.map(([x, y]) => [-x, y]);
}

/**
 * True if any of `levels[0..level-1]` (1-based `level`) has `flag` set —
 * i.e. a milestone declared on ONE level entry (e.g. wings' `sideBullets`
 * on its level-8 entry) stays unlocked at every level from there onward,
 * without needing that same flag repeated on every subsequent entry too.
 * Used by Player's `hasSideBullets`/`missilesUnlocked`/`hasWingMissilePods`/
 * `hasNoseSpike` getters.
 */
function hasReachedFlag(levels, level, flag) {
  for (let i = 0; i < level; i++) if (levels[i][flag]) return true;
  return false;
}

// ── Shop-upgrade hull decorations ─────────────────────────────────────────
// Small local-space nub shapes, drawn ON TOP of the base SHIP_PATHS once the
// matching part reaches its level-8-of-10 milestone (see
// Player._rebuildExtraPaths, Config.player.wings/cannon/missiles) — a late
// but not final tier, leaving levels 9-10 as pure stat refinement after the
// visual payoff already landed. The base hull outline itself is never
// touched — these are additive decoration, not a silhouette replacement, so
// they stay simple to reason about and can't break the mirrored-outline math.

// Wing-cannon nub — a small forward-pointing barrel near the wingtip
// (SHIP_HALF_OUTLINE's own wingtip sits at [32, 12]) — appears at
// Config.player.wings level 8, the same level that unlocks the wing-mounted
// side bullets it visually represents.
const WING_CANNON_RIGHT = [[24, 6], [35, 4], [37, 10], [26, 12]];
const WING_CANNON_PATHS = [
  { points: WING_CANNON_RIGHT, closed: true },
  { points: mirrorX(WING_CANNON_RIGHT), closed: true },
];

// Missile pod nub — slung under the wing root, closer to the fuselage than
// the wing cannon above — appears at Config.player.missiles level 8
// ("later on," after missiles are already flying since level 2 — see that
// config's own doc).
const MISSILE_POD_RIGHT = [[12, 16], [20, 15], [21, 26], [11, 27]];
const MISSILE_POD_PATHS = [
  { points: MISSILE_POD_RIGHT, closed: true },
  { points: mirrorX(MISSILE_POD_RIGHT), closed: true },
];

// Nose spike — a thin forward extension past the existing nose tip ([0, -24]
// in SHIP_HALF_OUTLINE), centered on x=0 so it needs no mirroring — appears
// at Config.player.cannon level 8, reading as a bigger main gun.
const CANNON_SPIKE_PATH = { points: [[-2, -22], [2, -22], [1.2, -34], [-1.2, -34]], closed: true };

export class Player {
  constructor() {
    const { width: vW, height: vH } = Config.virtual;
    const { height, scale, restingYRatio } = Config.player;

    this.x = vW / 2;
    this._restY = vH * restingYRatio;
    this._startY = vH + height * scale; // fully below the visible area, at its rendered size
    this.y = this._startY;
    this._age = 0;
    this._entryDone = false;

    // Target position — the ship snaps here each frame once the entry
    // animation completes; held at last pointer position when no pointer
    // is active.
    this._targetX = vW / 2;
    this._targetY = this._restY;

    // Play-area movement bounds — derived from ship rendered half-extents
    // and the HUD/barrier layout so the ship never overlaps chrome.
    const halfW = (Config.player.width  / 2) * scale; // 16 virtual px
    const halfH = (Config.player.height / 2) * scale; // 20 virtual px
    this._minX = halfW + 4;                            // clear left edge
    this._maxX = vW - halfW - 4;                       // clear right edge
    this._minY = 132;                                   // below HUD health bar label (~y 106) — see Config.hud.health's comment
    this._maxY = Config.barrier.baseY - Config.barrier.arcHeight - halfH - 10; // above barrier arc

    // Pre-allocated flame triangle — only the tip's y-value changes each
    // frame (mutated in _renderFlame), so no new arrays are created on
    // the hot path.
    this._flame = [[-6, 38], [0, 38], [6, 38]];
    // Wrapper array reused every frame by _renderFlame — this._flame's contents
    // are mutated in place (see _renderFlame), the array reference never changes.
    this._flamePathArr = [{ points: this._flame }];

    // Shop upgrade levels — 1-based indices into each part's own
    // Config.player.<part>.levels array (level 1 = free starting tier),
    // loaded once here and persisted across sessions via PlayerUpgrades.js.
    // See applyUpgrade's own doc for how a Shop purchase updates these live,
    // mid-run, on this exact instance.
    this._wingsLevel   = getPartLevel('wings');
    this._engineLevel  = getPartLevel('engine');
    this._cannonLevel  = getPartLevel('cannon');
    this._magnetLevel  = getPartLevel('magnet');
    this._missileLevel = getPartLevel('missiles');
    this._rebuildExtraPaths();

    // Health/damage — see takeDamage. `_hitFlash` and `_invulnTimer` mirror
    // the enemy hit-flash convention (EnemyCombat.applyHit) and Barrier's
    // own damage-taking shape respectively; `_age` above already drives the
    // low-health pulse the same way it drives Barrier's.
    this.health = this.maxHealth;
    this._hitFlash    = 0; // seconds remaining in the white hit-flash
    this._invulnTimer = 0; // seconds remaining of post-hit grace, during which takeDamage is a no-op
    this._invincibleTimer = 0; // seconds remaining of PowerUp-driven full damage immunity — see activateInvincibility

    // Low-health danger blip — see class doc.
    const { warningAudioSrc, warningVolume } = Config.player.lowHealth;
    this._warningAudio = new AudioPool(warningAudioSrc, 4, warningVolume);
    this._warningTimer = 0;   // seconds until the next blip; only ticks while low
    this._warningPlays = 0;   // blips played so far this danger episode — capped at warningMaxRepeats
    this._wasLowHealth = false; // edge-detects the moment danger starts, for an immediate first blip and a fresh play count
  }

  /** True once the entry animation has completed and the ship is controllable. */
  get ready() { return this._entryDone; }

  /** Collision radius — used by WaveManager's enemy-attack↔player hit tests. */
  get hitRadius() { return Config.player.hitRadius; }

  /** Seconds remaining on an active 'invincible' PowerUp, 0 if inactive — read by GameplayScene to feed HUD's indicator badge. */
  get invincibleTimer() { return this._invincibleTimer; }

  /** vp — current magnet pull radius, read by WaveManager.update and forwarded into GoldPickups/PowerUps. See class doc. */
  get magnetRadius() { return Config.player.magnet.levels[this._magnetLevel - 1].radius; }

  /** vp/sec^2 — current magnet pull strength. See class doc. */
  get magnetPullAccel() { return Config.player.magnet.levels[this._magnetLevel - 1].pullAccel; }

  /** Current max HP, per the Shop-purchased engine level — see Config.player.engine. */
  get maxHealth() { return Config.player.engine.levels[this._engineLevel - 1].maxHealth; }

  /** Multiplier on the player's base bullet/missile damage, per the Shop-purchased cannon level — see Config.player.cannon. */
  get damageMultiplier() { return Config.player.cannon.levels[this._cannonLevel - 1].damageMult; }

  /** Multiplier on Bullets' base fire rate, per the Shop-purchased wings level — see Config.player.wings. */
  get fireRateMultiplier() { return Config.player.wings.levels[this._wingsLevel - 1].fireRateMult; }

  /** True once wings has reached the level that fires extra wing-mounted bolts — see Bullets.update/Config.player.wings. */
  get hasSideBullets() { return hasReachedFlag(Config.player.wings.levels, this._wingsLevel, 'sideBullets'); }

  /** True once the missiles part has been purchased at all — see PlayerMissiles.js/Config.player.missiles. */
  get missilesUnlocked() { return hasReachedFlag(Config.player.missiles.levels, this._missileLevel, 'unlocked'); }

  /** Seconds between missile launches, per the Shop-purchased missiles level. */
  get missileInterval() { return Config.player.missiles.levels[this._missileLevel - 1].interval; }

  /** Multiplier on the player's CURRENT effective bullet damage applied by a missile hit — see Config.player.missiles' own doc for why this is relative, not flat. */
  get missileDamageMultiplier() { return Config.player.missiles.levels[this._missileLevel - 1].damageMult; }

  /** True once missiles has reached the level that launches from wing pods instead of dead-center — see PlayerMissiles.js/Config.player.missiles. */
  get hasWingMissilePods() { return hasReachedFlag(Config.player.missiles.levels, this._missileLevel, 'wingMount'); }

  /** True once cannon has reached the level that adds the forward nose-spike decoration — see `_rebuildExtraPaths`/Config.player.cannon. */
  get hasNoseSpike() { return hasReachedFlag(Config.player.cannon.levels, this._cannonLevel, 'noseSpike'); }

  /**
   * Visual-only render scale — grows a little with total Shop upgrades
   * purchased (see Config.player.upgradeScaleGrowth's own doc), independent
   * of the fixed `Config.player.scale` movement bounds/`hitRadius` are
   * built from. Read by `render`/`_renderFlame`, never by anything
   * collision- or bounds-related.
   */
  get renderScale() {
    const steps = (this._wingsLevel - 1) + (this._engineLevel - 1) + (this._cannonLevel - 1)
                + (this._magnetLevel - 1) + (this._missileLevel - 1);
    return Config.player.scale * (1 + steps * Config.player.upgradeScaleGrowth);
  }

  /**
   * Apply a Shop-purchased upgrade level for `partId` — updates this ship's
   * live stats/silhouette immediately and persists the new level via
   * PlayerUpgrades.js, the same "mutate + persist together" shape HUD's
   * gold/score setters already use. Shop.js calls this on both the real
   * gameplay Player and its own frozen preview instance on every purchase,
   * so the two never drift out of sync.
   * @param {'wings'|'engine'|'cannon'|'magnet'|'missiles'} partId
   * @param {number} level 1-based
   */
  applyUpgrade(partId, level) {
    switch (partId) {
      case 'wings':    this._wingsLevel   = level; break;
      case 'engine':   this._engineLevel  = level; break;
      case 'cannon':   this._cannonLevel  = level; break;
      case 'magnet':   this._magnetLevel  = level; break;
      case 'missiles': this._missileLevel = level; break;
    }
    setPartLevel(partId, level);
    this._rebuildExtraPaths();
  }

  /**
   * Rebuilds `_extraPaths` (the base SHIP_PATHS plus whichever upgrade-gated
   * decoration nubs the current levels have unlocked) — called once at
   * construction and again from applyUpgrade, never per-frame, since the
   * ship's silhouette only ever changes on a purchase. render() strokes this
   * array instead of the module-level SHIP_PATHS constant directly.
   */
  _rebuildExtraPaths() {
    this._extraPaths = [...SHIP_PATHS];
    if (this.hasSideBullets)     this._extraPaths.push(...WING_CANNON_PATHS);
    if (this.hasWingMissilePods) this._extraPaths.push(...MISSILE_POD_PATHS);
    if (this.hasNoseSpike)       this._extraPaths.push(CANNON_SPIKE_PATH);
  }

  /**
   * Apply `amount` damage unless still within the post-hit grace window or
   * an active 'invincible' PowerUp's immunity window (see class doc).
   * @param {number} amount
   * @returns {boolean} true if the damage actually applied (false while invulnerable/invincible)
   */
  takeDamage(amount) {
    if (this._invulnTimer > 0 || this._invincibleTimer > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this._hitFlash    = Config.player.hitFlashDuration;
    this._invulnTimer = Config.player.invulnDuration;
    vibrate(Config.settings.haptics.hitPatternMs);
    return true;
  }

  /**
   * (Re)start a full damage-immunity window from an 'invincible' PowerUp
   * pickup — a flat reset, so a repeat pickup refreshes the timer rather
   * than stacking with whatever's left of a previous one. See class doc.
   * @param {number} duration
   */
  activateInvincibility(duration) {
    this._invincibleTimer = duration;
  }

  /**
   * Restore `amount` health, clamped at `this.maxHealth`. Used by a health
   * PowerUp pickup (see WaveManager.checkPowerUpPickup) — no flash/feedback
   * beyond the number itself rising, unlike takeDamage's hit-flash.
   * @param {number} amount
   */
  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /**
   * Move the ship to (x, y) in virtual coordinates, clamped to the play area.
   * Silently ignored while the entry animation is still running.
   */
  moveTo(x, y) {
    if (!this._entryDone) return;
    this._targetX = Math.max(this._minX, Math.min(this._maxX, x));
    this._targetY = Math.max(this._minY, Math.min(this._maxY, y));
  }

  /** Advance the entrance animation, thruster flicker, and damage timers by `dt` seconds. */
  update(dt) {
    this._age += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this._invulnTimer > 0) this._invulnTimer -= dt;
    if (this._invincibleTimer > 0) this._invincibleTimer = Math.max(0, this._invincibleTimer - dt);
    this._updateLowHealthWarning(dt);

    const { entryDuration } = Config.player;
    const t = Math.min(this._age / entryDuration, 1);

    if (t < 1) {
      // Entry animation — brisk launch, gentle settle.
      const eased = easeOutCubic(t);
      this.y = this._startY + (this._restY - this._startY) * eased;
      // this.x stays at vW/2 from the constructor
    } else {
      if (!this._entryDone) {
        // First frame past entry: lock in starting target so the ship
        // holds its resting position until the player touches the screen.
        this._entryDone = true;
        this._targetX = this.x;
        this._targetY = this.y;
      }
      this._followTarget(dt);
    }
  }

  /**
   * Moves `x/y` toward `_targetX/_targetY` — a snap at the sensitivity
   * default (0), matching every build of this game before the Settings
   * panel existed exactly, or an exponential ease-toward-target once a
   * player raises the slider (same `1 - Math.exp(-rate * dt)` idiom
   * GameplayScene._updateMusicDuck already uses for its music duck).
   * `rate` is interpolated between Config.player.followSmoothing's
   * min/max by the sensitivity value — higher sensitivity, slower rate,
   * more visible trailing motion.
   */
  _followTarget(dt) {
    const sensitivity = getSensitivity();
    if (sensitivity <= 0) {
      this.x = this._targetX;
      this.y = this._targetY;
      return;
    }
    const { minRate, maxRate } = Config.player.followSmoothing;
    const rate = maxRate - (maxRate - minRate) * sensitivity;
    const k = 1 - Math.exp(-rate * dt);
    this.x += (this._targetX - this.x) * k;
    this.y += (this._targetY - this.y) * k;
  }

  /**
   * Draw the thruster flame, then the ship's neon wireframe on top of it.
   * Precedence when several damage-feedback states overlap: hit-flash
   * (pure white) beats low-health (warning red) beats normal color — the
   * same priority order Barrier and every enemy hull already use. While
   * invulnerable the whole ship blinks so the grace window is legible
   * rather than a silent free pass.
   */
  render(renderer) {
    const { lineWidth, glowBlur } = Config.player;
    const scale = this.renderScale;

    this._renderFlame(renderer);

    const flashing = this._hitFlash > 0;
    const low      = this._isLowHealth();
    const color    = flashing ? '#ffffff' : low ? dangerColor(Config.player.lowHealth.color) : Config.player.color;
    const alpha    = this._invulnTimer > 0 ? this._invulnBlinkAlpha() : (low ? this._lowHealthPulseAlpha() : 1);

    renderer.strokePaths(
      this._extraPaths,
      { x: this.x, y: this.y, scale, color, lineWidth, glowBlur, alpha }
    );

    if (this._invincibleTimer > 0) this._renderInvincibleBubble(renderer);
  }

  // --- Health/damage ----------------------------------------------------------

  /** Latching (not just-crossed) — stays true all the way to 0, matching Barrier's own convention. */
  _isLowHealth() {
    return this.health <= Config.player.lowHealth.threshold;
  }

  /** Same "breathing alpha" formula as Barrier's low-health pulse and the UI's pulsing buttons. */
  _lowHealthPulseAlpha() {
    const { pulseSpeed, pulseDepth } = Config.player.lowHealth;
    return 1 - pulseDepth * (0.5 + 0.5 * Math.sin(this._age * pulseSpeed));
  }

  /** Fast on/off blink while `_invulnTimer` is counting down, so the grace window reads as a deliberate state. */
  _invulnBlinkAlpha() {
    return Math.floor(this._invulnTimer * 20) % 2 === 0 ? 1 : 0.35;
  }

  /**
   * Pulsing ring encasing the whole ship while an 'invincible' PowerUp is
   * active — see class doc and Config.powerUps.invincible. Same breathing-
   * alpha formula as the low-health pulse/PowerUps.js's own pickup icons,
   * just slower/shallower so it reads as "protective," not "urgent."
   */
  _renderInvincibleBubble(renderer) {
    const cfg = Config.powerUps.invincible;
    const alpha = 1 - cfg.bubblePulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.bubblePulseSpeed));
    renderer.strokeCircle(this.x, this.y, cfg.bubbleRadius, {
      color: cfg.color, lineWidth: cfg.bubbleLineWidth, glowBlur: cfg.bubbleGlowBlur, alpha,
    });
  }

  /**
   * Danger blip while low on health — plays immediately the instant
   * health crosses into the danger zone (edge-triggered via
   * `_wasLowHealth`), then every `warningInterval` seconds, up to
   * `warningMaxRepeats` total plays for this danger episode (not
   * indefinitely). Recovering above the threshold and dropping low again
   * resets the count, so a fresh emergency gets its own full set of
   * blips. Can never ring after death since GameplayScene stops calling
   * `update()` entirely once the game-over overlay takes over.
   */
  _updateLowHealthWarning(dt) {
    const low = this._isLowHealth();
    if (low) {
      if (!this._wasLowHealth) { this._warningTimer = 0; this._warningPlays = 0; } // just entered danger — blip right away, fresh count
      if (this._warningPlays < Config.player.lowHealth.warningMaxRepeats) {
        this._warningTimer -= dt;
        if (this._warningTimer <= 0) {
          this._warningAudio.play();
          this._warningPlays++;
          this._warningTimer = Config.player.lowHealth.warningInterval;
        }
      }
    }
    this._wasLowHealth = low;
  }

  // --- Thruster flame -------------------------------------------------------

  /**
   * The flame's length oscillates as the sum of two sine waves at
   * different speeds/amplitudes — a cheap, deterministic stand-in for
   * organic flicker (no per-frame randomness, so it's smooth and the
   * animation is reproducible). `engineMult` (Config.player.engine.
   * flameGrowthPerLevel, see that config's own doc) scales both the flame's
   * length and glow by a flat bonus per engine level, so a Shop engine
   * upgrade reads as "bigger, brighter thruster" without needing its own
   * hull shape.
   */
  _renderFlame(renderer) {
    const { color, lineWidth, glowBlur, baseLength, flickerAmplitudes, flickerSpeeds } =
      Config.player.flame;
    const engineMult = 1 + (this._engineLevel - 1) * Config.player.engine.flameGrowthPerLevel;

    const flicker =
      Math.sin(this._age * flickerSpeeds[0]) * flickerAmplitudes[0] +
      Math.sin(this._age * flickerSpeeds[1]) * flickerAmplitudes[1];
    const length = Math.max((baseLength + flicker) * engineMult, 4);

    this._flame[1][1] = 38 + length; // mutate tip y in-place — avoids creating a new array each frame

    // Same `renderScale` as the hull — the flame is authored in ship-local
    // coordinates too, so it must shrink/grow and stay anchored to the tail.
    renderer.strokePaths(this._flamePathArr, {
      x: this.x,
      y: this.y,
      scale: this.renderScale,
      color,
      lineWidth,
      glowBlur: glowBlur * engineMult,
    });
  }
}
