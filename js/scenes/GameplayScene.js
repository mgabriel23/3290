/**
 * GameplayScene.js
 * The gameplay screen foundation.
 *
 * Current milestone: an animated backdrop — a drifting starfield (see
 * Starfield, composed here exactly like Player) that loops seamlessly
 * downward, with the player's ship launching into it. This remains the
 * slot where future gameplay systems (input, physics, enemies, HUD)
 * will eventually be composed, but nothing beyond what's described here
 * is stubbed in yet, by design.
 *
 * Entrance: the starfield doesn't snap into view — it eases in from
 * fully transparent over `Config.starfield.fadeInDuration`, so the
 * handoff from the intro's static label feels like a soft reveal
 * rather than an abrupt scene swap (the void backdrop is identical in
 * both scenes, so only the stars themselves need to fade). This scene
 * is what drives that fade — Starfield itself stays opinion-free about
 * when or how it should appear; it just knows how to draw and scroll.
 */
import { Config } from '../core/Config.js';
import { Barrier } from '../entities/Barrier.js';
import { Bullets } from '../entities/Bullets.js';
import { HUD } from '../entities/HUD.js';
import { Player } from '../entities/Player.js';
import { Starfield } from '../entities/Starfield.js';

export class GameplayScene {
  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.starfield = new Starfield();
    this.barrier = new Barrier();
    this.player = new Player();
    this.bullets = new Bullets();
    this.hud = new HUD();
    this._age = 0; // seconds since this scene started — drives the starfield fade-in
    this._pointerDown = false;

    // Level / wave state -------------------------------------------------------
    // 'intro'  — level indicator is on screen; bullets are suppressed
    // 'active' — normal gameplay (enemies, bullets, scoring all live)
    // When enemies exist, 'active' → 'intro' fires once the wave is cleared.
    this._level     = 1;
    this._levelState = 'intro';
    this._levelAge   = 0; // seconds spent in the current level state
  }

  /** Advance the backdrop and the player by `dt` seconds. */
  update(dt) {
    this._age    += dt;
    this._levelAge += dt;

    // Transition from intro → active once the indicator animation is done
    if (this._levelState === 'intro' && this._levelAge >= Config.level.introDuration) {
      this._levelState = 'active';
    }

    this.starfield.update(dt);
    this.player.update(dt);

    // Bullets are suppressed during the level intro so the dramatic
    // announcement isn't cluttered with gunfire. Once enemies exist and
    // waves cycle, this same gate will keep the field clear between waves.
    if (this._levelState === 'active') {
      this.bullets.update(dt, this.player);
    }
  }

  /** Render one frame: starfield → barrier → player → bullets → HUD → level intro. */
  render() {
    this.renderer.clear(Config.colors.void);
    this._drawStarfield();
    this.barrier.render(this.renderer);
    this.player.render(this.renderer);
    this.bullets.render(this.renderer);
    this.hud.render(this.renderer);
    // Level intro overlays everything — rendered last so it always reads clearly
    if (this._levelState === 'intro') this._renderLevelIntro();
  }

  handlePointerDown(x, y) {
    this._pointerDown = true;
    this.player.moveTo(x, y);
  }

  handlePointerMove(x, y) {
    if (!this._pointerDown) return;
    this.player.moveTo(x, y);
  }

  handlePointerUp() {
    this._pointerDown = false;
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
      alpha = this._levelFlicker(t);                       // unstable hold
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

  /**
   * Three incommensurate sine waves summed — their interference produces
   * quasi-random dips that feel like a weak or corrupted signal without
   * any per-frame randomness (same shape every time, no state needed).
   */
  _levelFlicker(t) {
    const n = (Math.sin(t * 6.7) + Math.sin(t * 15.3 + 1.1) + Math.cos(t * 24.9 + 0.6)) / 3;
    return Math.max(0.08, Math.min(1, 0.82 + n * 0.76));
  }

  /** Ease the whole starfield in from transparent over `Config.starfield.fadeInDuration` — see class doc's "Entrance" note. */
  _drawStarfield() {
    const { fadeInDuration } = Config.starfield;
    const alpha = Math.min(this._age / fadeInDuration, 1);
    this.starfield.render(this.renderer, alpha);
  }
}
