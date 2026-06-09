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
    this.hud = new HUD();
    this._age = 0; // seconds since this scene started — drives the fade-in
    this._pointerDown = false;
  }

  /** Advance the backdrop and the player by `dt` seconds. */
  update(dt) {
    this._age += dt;
    this.starfield.update(dt);
    this.player.update(dt);
  }

  /** Render one frame: starfield → barrier → player → HUD (back to front). */
  render() {
    this.renderer.clear(Config.colors.void);
    this._drawStarfield();
    this.barrier.render(this.renderer);
    this.player.render(this.renderer);
    this.hud.render(this.renderer);
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

  /** Ease the whole starfield in from transparent over `Config.starfield.fadeInDuration` — see class doc's "Entrance" note. */
  _drawStarfield() {
    const { fadeInDuration } = Config.starfield;
    const alpha = Math.min(this._age / fadeInDuration, 1);
    this.starfield.render(this.renderer, alpha);
  }
}
