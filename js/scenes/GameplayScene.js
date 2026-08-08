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
 */
import { Config } from '../core/Config.js';
import { flickerAlpha } from '../core/animation.js';
import { ScreenShake } from '../core/ScreenShake.js';
import { Barrier } from '../entities/Barrier.js';
import { Bullets } from '../entities/Bullets.js';
import { EnemyCodex } from '../entities/EnemyCodex.js';
import { HUD } from '../entities/HUD.js';
import { Player } from '../entities/Player.js';
import { PlaybackControls } from '../entities/PlaybackControls.js';
import { Starfield } from '../entities/Starfield.js';
import { WaveManager } from '../entities/WaveManager.js';

export class GameplayScene {
  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.starfield = new Starfield();
    this.barrier = new Barrier();
    this.player = new Player();
    this.bullets = new Bullets();
    this.hud = new HUD();
    this._codex = new EnemyCodex();
    this._playback = new PlaybackControls();
    this._screenShake = new ScreenShake();
    this._hitStopTimer = 0; // seconds of gameplay-time freeze remaining — see update()'s effectiveDt
    this._age = 0; // seconds since this scene started — drives the starfield fade-in
    this._pointerDown = false;

    // Level / wave state -------------------------------------------------------
    // 'intro'  — level indicator is on screen; bullets are suppressed
    // 'active' — normal gameplay (enemies, bullets, scoring all live)
    // When enemies exist, 'active' → 'intro' fires once the wave is cleared.
    this._level      = 1;
    this._levelState = 'intro';
    this._levelAge   = 0; // seconds spent in the current level state

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
    this.starfield.update(dt); // keeps drifting even while paused/codex is open — purely cosmetic, not gameplay
    if (this._codex.isOpen || this._playback.isPaused) return; // frozen — nothing gameplay-related advances

    this._screenShake.update(dt);
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

    // Bullets and enemies are suppressed during the level intro.
    if (this._levelState === 'active') {
      this.bullets.update(effectiveDt, this.player);
      this._waveManager.update(effectiveDt, this.player.x, this.player.y);
      this._checkCollisions();

      // Wave cleared AND all death effects finished → begin the next level intro
      if (this._waveManager.isDone) {
        this._level++;
        this._levelState  = 'intro';
        this._levelAge    = 0;
        this._waveManager = null;
      }
    }
  }

  /**
   * Render one frame. The "world" layer (starfield/barrier/player/bullets/
   * enemies) is drawn under `_screenShake`'s current offset; the UI layer
   * (HUD, level intro, codex, playback controls) is drawn after resetting
   * the camera back to (0, 0), so buttons never visually drift away from
   * their own (unshaken) tap hit-boxes.
   */
  render() {
    const shake = this._screenShake.getOffset();
    this.renderer.setCameraOffset(shake.x, shake.y);
    this.renderer.clear(Config.colors.void);
    this._renderStarfield();
    const playerDamage = Config.player.damage + (this._level - 1) * Config.player.damagePerLevel;
    this.barrier.render(this.renderer, playerDamage);
    this.player.render(this.renderer);
    this.bullets.render(this.renderer);
    this._waveManager?.render(this.renderer);

    this.renderer.setCameraOffset(0, 0);
    this.hud.render(this.renderer);
    // Level intro overlays everything — rendered last so it always reads clearly
    if (this._levelState === 'intro') this._renderLevelIntro();
    // Codex, then playback controls — both must sit on top of everything else,
    // including the level intro. Playback renders last so its mute/pause
    // buttons stay visible and tappable even while the codex card is open.
    this._codex.render(this.renderer);
    this._playback.render(this.renderer);
  }

  handlePointerDown(x, y) {
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
    if (!this._pointerDown || this._codex.isOpen || this._playback.isPaused) return;
    this.player.moveTo(x, y);
  }

  handlePointerUp() {
    this._pointerDown = false;
  }

  /**
   * Mute always wins first — it never opens an overlay, so it's always
   * safe to toggle. Pause and the Codex are mutually exclusive full-screen
   * overlays: opening either is ignored while the other is already open,
   * so their dimming layers can never stack. Any remaining tap routes to
   * whichever overlay (if any) is currently open.
   */
  handleTap(x, y) {
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
}
