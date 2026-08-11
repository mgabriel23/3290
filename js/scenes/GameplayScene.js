/**
 * GameplayScene.js
 * The main gameplay screen. Composes the player ship, its bullets, the
 * barrier being defended, the HUD, the drifting starfield backdrop, and
 * (once a level's intro announcement finishes) a `WaveManager` that owns
 * that level's enemies/projectiles/particles — see each entity's own file
 * for its responsibilities. This scene's job is orchestration: level
 * sequencing (`_levelState`: 'intro' → 'active' → next level's 'intro'),
 * routing gestures to the player ship or the enemy codex, and running the
 * player-bullet-vs-enemy collision check once per frame.
 *
 * Entrance: the starfield doesn't snap into view — it eases in from
 * fully transparent over `Config.starfield.fadeInDuration`, so the
 * handoff from the tutorial's dim overlay feels like a soft reveal
 * rather than an abrupt scene swap (the void backdrop is identical in
 * every scene, so only the stars themselves need to fade). This scene
 * is what drives that fade — Starfield itself stays opinion-free about
 * when or how it should appear; it just knows how to draw and scroll.
 *
 * The enemy codex (`EnemyCodex`) and the pause button (`PlaybackControls`)
 * both freeze everything gameplay-related (`update` returns early) while
 * open, but the starfield keeps drifting and the scene still renders one
 * last normal frame underneath the dimming overlay, so the game reads as
 * "paused", not "gone". They're mutually exclusive full-screen overlays —
 * this scene is what enforces that only one can be open at a time; the mute
 * button (also owned by `PlaybackControls`) never opens an overlay, so it
 * stays tappable regardless of what else is open.
 *
 * Impact feedback: this scene owns a `ScreenShake` (see core/ScreenShake.js)
 * and a `_hitStopTimer` — a kill triggers both (see `_checkCollisions`),
 * and a barrier impact triggers shake on its own (see WaveManager's
 * onBarrierHit, which this scene hands its ScreenShake instance into at
 * construction). `render()` applies the shake offset only to the "world"
 * layer, resetting to (0, 0) before the UI layer so HUD/codex/playback
 * buttons never visually drift from their own tap hit-boxes.
 *
 * The world layer (starfield/player/bullets/enemies) also carries a subtle
 * camera-follow pan (`_cameraFollowX`, combined with shake into one
 * `worldOffsetX`) — a small fraction of the player's horizontal distance
 * from center, opposite direction, so the world reads as something being
 * panned through rather than a static backdrop the ship slides around on.
 * The barrier is deliberately NOT part of that panning layer — it renders
 * in its own fixed-camera pass (still ordered behind player/bullets/enemies)
 * so the thing the player is defending reads as a stationary emplacement,
 * not something drifting with the ship.
 *
 * The pan itself is exponentially smoothed (`_updateCameraFollow`, driven
 * off `_cameraX`) rather than snapped straight to its target every frame.
 * Every enemy attack's aim/homing math is pure world-space and entirely
 * unaffected by the camera (enemies, bullets, rockets, and the player are
 * all panned by the exact same offset each frame, so their positions
 * relative to each other never change) — but a bullet, rocket, or the
 * sniper's laser telegraph takes several frames to reach its target, and an
 * unsmoothed pan recomputed fresh every frame from the player's current x
 * jitters with every small wobble of player movement. Riding on top of that
 * jitter, an in-flight attack's straight-line path visually read as bent or
 * misaimed relative to the player — worst while the player kept moving,
 * exactly when the pan was changing the most. Smoothing only the camera
 * (not the player, which stays instant — Player.moveTo still snaps with no
 * easing) removes that visual jitter without adding any lag to the ship's
 * own controls.
 *
 * No border/frame hides the pan's trailing edge — instead `render()` clears
 * the whole canvas at a FIXED (0, 0) transform, before the pan is applied
 * for the rest of the world layer. Renderer.clear's fill rect is sized to
 * the virtual surface and would otherwise pan WITH the world layer if
 * cleared after the offset is set, leaving a stale, unrendered sliver at
 * whichever edge the camera just panned away from (neither Starfield's
 * tiles nor anything else would repaint it, since they're exactly
 * canvas-width). Clearing before the pan guarantees the exposed edge is
 * always void-colored, never leftover pixels from a previous frame.
 *
 * Player damage: `_checkPlayerHit` is `_checkCollisions`' mirror image —
 * every enemy-attack source tested against the player once per frame (see
 * WaveManager.checkPlayerHit) instead of every enemy tested against the
 * player's bullets. Reaching 0 health triggers the ship's own death
 * explosion (`_triggerGameOver` — a `Particles` burst plus explosion SFX
 * at the player's last position, same effect language every enemy death
 * already uses, and the ship itself stops rendering) and freezes gameplay
 * behind a "GAME OVER" overlay (`_isGameOver`) — the same mutually-
 * exclusive full-screen-overlay shape the codex/pause buttons already
 * establish, starfield keeps drifting underneath, everything else stops.
 * The overlay's own fade-in is deliberately delayed by
 * `Config.gameOver.explosionDelay` (see `_renderGameOver`) so the
 * explosion gets a clear beat to read before "GAME OVER" appears. A tap
 * (once `minRestartDelay` has passed) restarts by calling the optional
 * `onGameOver` constructor callback (same constructor-injected-callback
 * convention every other scene already uses for its own `onContinue`) —
 * Game.js wires this to simply construct a brand-new GameplayScene, so
 * "restart" is just "start over clean" rather than resetting state in place.
 */
import { Config } from '../core/Config.js';
import { flickerAlpha } from '../core/animation.js';
import { AudioPool } from '../core/AudioPool.js';
import { ScreenShake } from '../core/ScreenShake.js';
import { Barrier } from '../entities/Barrier.js';
import { Bullets } from '../entities/Bullets.js';
import { EnemyCodex } from '../entities/EnemyCodex.js';
import { HUD } from '../entities/HUD.js';
import { Particles } from '../entities/Particles.js';
import { Player } from '../entities/Player.js';
import { PlaybackControls } from '../entities/PlaybackControls.js';
import { Starfield } from '../entities/Starfield.js';
import { WaveManager } from '../entities/WaveManager.js';

export class GameplayScene {
  /**
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {{ onGameOver?: () => void, onMusicDuck?: (multiplier: number) => void, onMusicStop?: () => void }} [callbacks]
   *   `onGameOver` called once, on the restart tap after the player's health
   *   reaches 0 — see class doc. `onMusicDuck` called every frame with a
   *   0-1 multiplier for the gameplay bg music's volume — GameplayScene
   *   doesn't own that Audio element (Game.js does, since it persists
   *   across restarts), so ducking it during the level indicator has to be
   *   relayed out through this callback rather than touched directly — see
   *   `_updateMusicDuck`. `onMusicStop` called once, the instant death
   *   triggers (`_triggerGameOver`) — same ownership reasoning, but this one
   *   is a hard stop (Game.js pauses the Audio element outright), not a duck.
   */
  constructor(renderer, { onGameOver, onMusicDuck, onMusicStop } = {}) {
    this.renderer = renderer;
    this._onGameOver = onGameOver;
    this._onMusicDuck = onMusicDuck;
    this._onMusicStop = onMusicStop;
    this.starfield = new Starfield();
    this.barrier = new Barrier();
    this.player = new Player();
    this.bullets = new Bullets();
    this.hud = new HUD();
    this._codex = new EnemyCodex();
    this._playback = new PlaybackControls();
    this._screenShake = new ScreenShake();
    this._hitStopTimer = 0; // seconds of gameplay-time freeze remaining — see update()'s effectiveDt
    this._cameraX = 0; // smoothed camera-follow pan offset — see _updateCameraFollow
    this._age = 0; // seconds since this scene started — drives the starfield fade-in
    this._pointerDown = false;

    // Game-over overlay — see class doc's "Player damage" note.
    this._isGameOver  = false;
    this._gameOverAge = 0; // seconds since death — drives the explosion delay, overlay fade-in, and the restart-tap debounce
    this._playerParticles = new Particles(Config.gameOver.explosionColor, Config.gameOver.explosionSparksPerEmit);
    this._deathExplosionAudio = new AudioPool(Config.gameOver.explosionAudioSrc, 4, Config.gameOver.explosionVolume);
    this._gameOverAudio = new AudioPool(Config.gameOver.audioSrc, 4, Config.gameOver.audioVolume);

    // Level / wave state -------------------------------------------------------
    // 'intro'  — level indicator is on screen; bullets are suppressed
    // 'active' — normal gameplay (enemies, bullets, scoring all live)
    // When enemies exist, 'active' → 'intro' fires once the wave is cleared.
    this._level      = 1;
    this._levelState = 'intro';
    this._levelAge   = 0; // seconds spent in the current level state
    // Plays once per "LEVEL N" indicator — right here for level 1 (the scene
    // always starts in 'intro'), and again at the wave-cleared transition in
    // update() for every level after that.
    this._levelAudio = new AudioPool(Config.level.audioSrc, 4, Config.level.audioVolume);
    this._levelAudio.play();
    this._musicDuck = 1; // 0-1 bg-music volume multiplier — see _updateMusicDuck

    /** @type {WaveManager|null} created when a level's active phase begins */
    this._waveManager = null;
  }

  /**
   * Advance the backdrop and the player by `dt` seconds.
   *
   * Hit-stop: on a kill, `_checkCollisions` sets `_hitStopTimer` — while
   * it's counting down, `effectiveDt` is 0 for every gameplay sub-system
   * (barrier/player/bullets/wave), producing a brief freeze-frame without
   * either of them needing to know hit-stop exists. The timer itself, and
   * screen shake's own decay, always use the real `dt` so the freeze
   * actually expires and a shake still tails off even mid-freeze.
   */
  update(dt) {
    this._codex.update(dt);
    this._playback.update(dt);
    this.starfield.update(dt); // keeps drifting even while paused/codex/game-over is showing — purely cosmetic, not gameplay
    if (this._isGameOver) {
      this._gameOverAge += dt;
      this._playerParticles.update(dt); // let the death burst finish animating while everything else is frozen
      return; // frozen for good — only a restart tap moves things forward
    }
    if (this._codex.isOpen || this._playback.isPaused) return; // frozen — nothing gameplay-related advances

    this._screenShake.update(dt);
    this._updateCameraFollow(dt);
    this._hitStopTimer = Math.max(0, this._hitStopTimer - dt);
    const effectiveDt = this._hitStopTimer > 0 ? 0 : dt;

    this._age    += effectiveDt;
    this._levelAge += effectiveDt;

    // Transition from intro → active once the indicator animation is done
    if (this._levelState === 'intro' && this._levelAge >= Config.level.introDuration) {
      this._levelState  = 'active';
      this._waveManager = new WaveManager(this._level, this.barrier, this.hud, this._screenShake);
    }

    this.barrier.update(effectiveDt);
    this.player.update(effectiveDt);
    this.hud.update(effectiveDt); // drives the health bar's low-health pulse clock only
    this._updateMusicDuck(effectiveDt);

    // Bullets and enemies are suppressed during the level intro.
    if (this._levelState === 'active') {
      this.bullets.update(effectiveDt, this.player);
      this._waveManager.update(effectiveDt, this.player.x, this.player.y);
      this._checkCollisions();
      this._checkPlayerHit();

      // Wave cleared AND all death effects finished → begin the next level intro
      if (this._waveManager.isDone) {
        this._level++;
        this._levelState  = 'intro';
        this._levelAge    = 0;
        this._waveManager = null;
        this._levelAudio.play();
      }
    }
  }

  /**
   * Render one frame. The whole canvas is cleared first at a FIXED (0, 0)
   * transform (see class doc for why — it's what lets the pan's trailing
   * edge stay void-colored without a dedicated border/frame entity). The
   * "world" layer (starfield/player/bullets/enemies) is then drawn under a
   * combined offset — screen-shake plus a subtle camera-follow pan (see
   * `_cameraFollowX`) — so the world reads as something the player is
   * actually moving through, not a static backdrop. The barrier renders in
   * between, in its own fixed-camera pass (camera reset to (0, 0)) so it
   * stays visually stationary while still drawing behind player/bullets/
   * enemies. The UI layer (HUD, level intro, codex, playback controls) is
   * drawn last, also fixed, so buttons never visually drift away from
   * their own tap hit-boxes.
   */
  render() {
    const shake = this._screenShake.getOffset();
    const followX = this._cameraFollowX();
    const worldOffsetX = shake.x + followX;

    this.renderer.setCameraOffset(0, 0);
    this.renderer.clear(Config.colors.void);

    this.renderer.setCameraOffset(worldOffsetX, shake.y);
    this._renderStarfield();

    this.renderer.setCameraOffset(0, 0);
    const playerDamage = Config.player.damage + (this._level - 1) * Config.player.damagePerLevel;
    this.barrier.render(this.renderer, playerDamage);

    this.renderer.setCameraOffset(worldOffsetX, shake.y);
    if (!this._isGameOver) this.player.render(this.renderer); // the ship is destroyed — see _triggerGameOver's explosion
    this._playerParticles.render(this.renderer); // no-op when inactive — cheap to always call, same as WaveManager's own pools
    this.bullets.render(this.renderer);
    this._waveManager?.render(this.renderer);

    this.renderer.setCameraOffset(0, 0);
    this.hud.render(this.renderer, this.player.health);
    // Level intro overlays everything — rendered last so it always reads clearly
    if (this._levelState === 'intro') this._renderLevelIntro();
    // Codex, then playback controls — both must sit on top of everything else,
    // including the level intro. Playback renders last so its mute/pause
    // buttons stay visible and tappable even while the codex card is open.
    this._codex.render(this.renderer);
    this._playback.render(this.renderer);
    // Game over sits on top of literally everything — the final word on the frame.
    if (this._isGameOver) this._renderGameOver();
  }

  /** The current smoothed camera-follow pan — see class doc and `_updateCameraFollow`. */
  _cameraFollowX() {
    return this._cameraX;
  }

  /**
   * Ease `_cameraX` toward a small, direct fraction of the player's
   * horizontal offset from center, in the opposite direction — panning the
   * camera toward where the player is makes the world slide the other way,
   * the same as turning your head right makes a room appear to slide left.
   * `1 - exp(-rate*dt)` is the standard frame-rate-independent convergence
   * factor (same visual smoothing at 30fps or 144fps, unlike a fixed
   * per-frame lerp fraction) — see class doc for why this needs to be
   * damped rather than recomputed fresh every frame.
   */
  _updateCameraFollow(dt) {
    const { width: vW } = Config.virtual;
    const target = -(this.player.x - vW / 2) * Config.camera.followFactor;
    const rate = Config.camera.followSmoothing;
    this._cameraX += (target - this._cameraX) * (1 - Math.exp(-rate * dt));
  }

  /**
   * Ease `_musicDuck` (a 0-1 bg-music volume multiplier) toward
   * `Config.level.duckFactor` while the level indicator is on screen, or
   * back to 1 once it isn't — same frame-rate-independent exponential
   * convergence as `_updateCameraFollow`, but with a much faster release
   * rate (`duckOutRate` > `duckInRate`) so the music snaps back close to
   * instantly the moment the indicator hides rather than fading back up
   * slowly. Relayed out through `onMusicDuck` every frame since Game.js —
   * not this scene — owns the actual bg-music Audio element (see
   * constructor doc).
   */
  _updateMusicDuck(dt) {
    const { duckFactor, duckInRate, duckOutRate } = Config.level;
    const target = this._levelState === 'intro' ? duckFactor : 1;
    const rate = target < this._musicDuck ? duckInRate : duckOutRate;
    this._musicDuck += (target - this._musicDuck) * (1 - Math.exp(-rate * dt));
    this._onMusicDuck?.(this._musicDuck);
  }

  handlePointerDown(x, y) {
    if (this._isGameOver) return; // the ship is gone — nothing left to drag around
    // Both TapInput and DragInput fire on the same physical tap (pointerdown
    // fires before the tap is recognized) — without these guards, the tap
    // that opens an overlay or toggles mute would first snap the ship to
    // that button's position.
    if (this._codex.isOpen || this._codex.isInsideButton(x, y)) return;
    if (this._playback.isPaused
      || this._playback.isInsideMuteButton(x, y)
      || this._playback.isInsidePauseButton(x, y)) return;
    this._pointerDown = true;
    this.player.moveTo(x, y);
  }

  handlePointerMove(x, y) {
    if (this._isGameOver) return;
    if (!this._pointerDown || this._codex.isOpen || this._playback.isPaused) return;
    this.player.moveTo(x, y);
  }

  handlePointerUp() {
    this._pointerDown = false;
  }

  /**
   * Game over wins first — once it's showing, nothing else is interactible
   * (mirrors why mute/pause/codex are all mutually exclusive below, just
   * one level higher). `minRestartDelay` guards against the residual tap
   * that triggered the fatal hit being immediately reinterpreted as a
   * restart. Otherwise: mute always wins next — it never opens an overlay,
   * so it's always safe to toggle. Pause and the Codex are mutually
   * exclusive full-screen overlays: opening either is ignored while the
   * other is already open, so their dimming layers can never stack. Any
   * remaining tap routes to whichever overlay (if any) is currently open.
   */
  handleTap(x, y) {
    if (this._isGameOver) {
      if (this._gameOverAge >= Config.gameOver.minRestartDelay) this._onGameOver?.();
      return;
    }
    if (this._playback.isInsideMuteButton(x, y)) {
      this._playback.toggleMute();
      return;
    }
    if (this._playback.isInsidePauseButton(x, y)) {
      if (!this._codex.isOpen) this._playback.togglePause();
      return;
    }
    if (this._codex.isInsideButton(x, y)) {
      if (!this._playback.isPaused) this._codex.handleTap(x, y);
      return;
    }
    if (this._codex.isOpen) this._codex.handleTap(x, y);
  }

  /**
   * Test every active enemy against the player bullet pool. Each hit consumes
   * one bullet and calls `enemy.hit()` — enemies handle their own health and
   * death-flash logic. Called once per frame during 'active' state. A kill
   * triggers screen shake and a brief hit-stop (see update()'s effectiveDt);
   * `Math.max` (not `+=`) on the timer means several kills in the same frame
   * extend the freeze to the configured duration rather than stacking it
   * into a longer one.
   */
  _checkCollisions() {
    const enemies = this._waveManager.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (this.bullets.checkHit(e.x, e.y, e.hitRadius)) {
        const killed = this._waveManager.handleBulletHit(e);
        if (killed) {
          this._screenShake.trigger(Config.screenShake.killTrauma);
          this._hitStopTimer = Math.max(this._hitStopTimer, Config.hitStop.killDuration);
        }
      }
    }
  }

  /**
   * Test every live enemy-attack source against the player once per frame
   * — `_checkCollisions`' mirror image, in the other direction (see
   * WaveManager.checkPlayerHit). A hit that actually applies (not absorbed
   * by the player's post-hit invulnerability window) triggers shake/
   * hit-stop, or ends the run once health reaches 0.
   */
  _checkPlayerHit() {
    const damage = this._waveManager.checkPlayerHit(this.player);
    if (damage <= 0) return;
    if (!this.player.takeDamage(damage)) return; // invulnerable — hit source still consumed, no further effect

    if (this.player.health <= 0) {
      this._triggerGameOver();
      return;
    }
    this._screenShake.trigger(Config.screenShake.playerHitTrauma);
    this._hitStopTimer = Math.max(this._hitStopTimer, Config.hitStop.playerHitDuration);
  }

  /**
   * Blow up the ship (particle burst + explosion SFX at its last position,
   * the player.render() call this frees up its `!this._isGameOver` guard
   * skips from now on), freeze gameplay for good, and start the countdown
   * to the "GAME OVER" overlay's fade-in — see class doc and
   * `_renderGameOver`'s `explosionDelay` for why the overlay itself waits.
   * Also plays the separate game-over stinger and stops the gameplay bg
   * music outright (via `onMusicStop` — see constructor doc for why this
   * scene can't just pause it directly).
   */
  _triggerGameOver() {
    this._isGameOver  = true;
    this._gameOverAge = 0;
    this._playerParticles.emit(this.player.x, this.player.y);
    this._deathExplosionAudio.play();
    this._gameOverAudio.play();
    this._onMusicStop?.();
    this._screenShake.trigger(Config.gameOver.deathTrauma);
    this._hitStopTimer = Math.max(this._hitStopTimer, Config.hitStop.playerHitDuration);
  }

  /**
   * Full-screen "LEVEL N" announcement at the start of each wave.
   *
   * Three phases driven by a single `_levelAge` timer:
   *   fade-in  — clean linear rise so the text materialises crisply
   *   hold     — unstable flicker (summed incommensurate sines, same
   *              technique as the year-card beat) gives the impression of
   *              a threatening signal barely holding together
   *   fade-out — clean linear fall before gameplay is unblocked
   *
   * A micro y-tremor (±1.5 vp, very fast sine) runs throughout the hold
   * to add a physical instability on top of the alpha flicker.
   *
   * `_levelAudio` plays once per indicator, not from here — it fires the
   * instant `_levelState` becomes 'intro' (constructor for level 1, the
   * wave-cleared transition in `update()` for every level after), not on
   * every render() call this method makes while the indicator is on screen.
   * The gameplay bg music also ducks under that same window — see
   * `_updateMusicDuck` — so the level sound reads clearly over it.
   */
  _renderLevelIntro() {
    const { introDuration, fadeInDuration, fadeOutDuration, font, color, glowBlur } = Config.level;
    const { width: vW, height: vH } = Config.virtual;

    const t        = this._levelAge;
    const holdEnd  = introDuration - fadeOutDuration;
    let   alpha;

    if (t < fadeInDuration) {
      alpha = t / fadeInDuration;                          // clean rise
    } else if (t < holdEnd) {
      alpha = flickerAlpha(t, [6.7, 15.3, 24.9], [1.1, 0.6], 0.82, 0.76); // unstable hold
    } else {
      alpha = Math.max(0, 1 - (t - holdEnd) / fadeOutDuration); // clean fall
    }
    if (alpha < 0.02) return; // skip shadow computation when invisible

    // Micro-tremor only during the hold phase — tiny but adds to the instability
    const jitter = (t >= fadeInDuration && t < holdEnd)
      ? Math.sin(t * 71.3) * 1.5
      : 0;

    this.renderer.drawText(`LEVEL ${this._level}`, vW / 2, vH / 2 + jitter, {
      font, color, alpha, glowBlur,
    });
  }

  /** Ease the whole starfield in from transparent over `Config.starfield.fadeInDuration` — see class doc's "Entrance" note. */
  _renderStarfield() {
    const { fadeInDuration } = Config.starfield;
    const alpha = Math.min(this._age / fadeInDuration, 1);
    this.starfield.render(this.renderer, alpha);
  }

  /**
   * "GAME OVER" overlay — a dimming layer over the last live frame (same
   * idea as EnemyCodex's own dimAlpha), plus a clean fade-in title and
   * restart prompt. No flicker, unlike the level intro — this is somber,
   * not an alarm. Held back entirely for `explosionDelay` seconds so the
   * ship's death explosion (see `_triggerGameOver`) gets a clear beat
   * against the still-normal (undimmed) screen before this appears. Called
   * with the camera already reset to (0,0) (the UI layer's state at the
   * point render() calls this), so the dim rect is always full-screen and
   * fixed regardless of the world's current pan.
   */
  _renderGameOver() {
    const { width: vW, height: vH } = Config.virtual;
    const cfg = Config.gameOver;
    const revealAge = Math.max(0, this._gameOverAge - cfg.explosionDelay);
    const alpha = Math.min(revealAge / cfg.fadeInDuration, 1);
    if (alpha <= 0) return; // still inside explosionDelay — let the explosion read clearly first

    this.renderer.clear(Config.colors.void, cfg.dimAlpha * alpha);
    this.renderer.drawText(cfg.titleText, vW / 2, vH / 2, {
      font: cfg.titleFont, color: cfg.titleColor, alpha, glowBlur: cfg.titleGlowBlur,
    });
    this.renderer.drawText(cfg.promptText, vW / 2, vH / 2 + cfg.promptOffsetY, {
      font: cfg.promptFont, color: cfg.promptColor, alpha,
    });
  }
}
