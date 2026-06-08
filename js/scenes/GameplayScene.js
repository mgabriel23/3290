/**
 * GameplayScene.js
 * The gameplay screen foundation.
 *
 * Current milestone: an animated backdrop — a drifting starfield that
 * loops seamlessly downward — with the player's ship launching into it,
 * and a skippable story beat (StoryOverlay) typing itself out near the
 * top of the screen while both animate in alongside it. This remains the
 * slot where future gameplay systems (input, physics, enemies, HUD) will
 * eventually be composed, but nothing beyond what's described here is
 * stubbed in yet, by design.
 *
 * Performance: the starfield is organised into a few parallax layers,
 * each baked ONCE to an off-screen canvas tile (see _bakeTile). Every
 * frame just translates and blits that tile twice (the standard
 * two-copy seamless-scroll technique) — flat per-frame cost no matter
 * how many stars a layer contains, which keeps this cheap on low-end
 * devices.
 *
 * Entrance: the starfield doesn't snap into view — it eases in from
 * fully transparent over `Config.starfield.fadeInDuration`, so the
 * handoff from the intro's static label feels like a soft reveal
 * rather than an abrupt scene swap (the void backdrop is identical in
 * both scenes, so only the stars themselves need to fade).
 */
import { Config } from '../core/Config.js';
import { Player } from '../entities/Player.js';
import { StoryOverlay } from '../entities/StoryOverlay.js';

export class GameplayScene {
  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.layers = this._createLayers();
    this.player = new Player();
    this.story = new StoryOverlay(renderer);
    this._age = 0; // seconds since this scene started — drives the fade-in
  }

  /** Advance the backdrop, the player, and the story overlay by `dt` seconds. */
  update(dt) {
    this._age += dt;

    const { height } = Config.virtual;
    for (const layer of this.layers) {
      layer.scroll += layer.speed * dt;
      if (layer.scroll > height) layer.scroll -= height; // wrap for a seamless loop
    }

    this.player.update(dt);
    this.story.update(dt);
  }

  /** The story overlay's "SKIP" button is the only interactive element this scene has. */
  handleTap(x, y) {
    this.story.handleTap(x, y);
  }

  /** Render one frame: void backdrop, starfield layers, the player, then the story overlay on top. */
  render() {
    this.renderer.clear(Config.colors.void);
    this._drawLayers();
    this.player.render(this.renderer);
    this.story.render(this.renderer);
  }

  // --- Starfield -----------------------------------------------------------

  /** Build each parallax layer: a baked tile plus its own scroll state. */
  _createLayers() {
    return Config.starfield.layers.map((layerConfig) => ({
      tile: this._bakeTile(layerConfig),
      speed: layerConfig.speed,
      scroll: 0,
    }));
  }

  /**
   * Render a layer's stars once onto an off-screen canvas the size of the
   * virtual surface. This tile is reused every frame — the stars within a
   * layer never move relative to each other, only the tile as a whole
   * scrolls, so there is no need to redraw them individually per frame.
   *
   * Drawing here goes straight to the tile's own private 2D context
   * (not through Renderer): Renderer's primitive seam abstracts draws to
   * the shared *display* surface, while this is a one-time, throwaway
   * bake of a static texture that never touches the screen directly.
   * @param {{count: number, sizeMin: number, sizeMax: number}} layerConfig
   * @returns {HTMLCanvasElement}
   */
  _bakeTile({ count, sizeMin, sizeMax }) {
    const { width, height } = Config.virtual;
    const { color } = Config.starfield;

    const tile = document.createElement('canvas');
    tile.width = width;
    tile.height = height;

    const ctx = tile.getContext('2d');
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const size = sizeMin + Math.random() * (sizeMax - sizeMin);
      const x = Math.random() * width;
      const y = Math.random() * height;
      ctx.fillRect(x, y, size, size);
    }

    return tile;
  }

  /**
   * Draw each layer's tile twice, offset by one tile-height — the
   * standard seamless scroll technique: as the lower copy scrolls fully
   * into view, the upper copy is simultaneously scrolling out, so the
   * loop point is never visible. All copies share one fade-in alpha
   * (ramping from 0 to 1 over `fadeInDuration`) so the whole starfield
   * eases into view together as a single reveal.
   */
  _drawLayers() {
    const { height } = Config.virtual;
    const { fadeInDuration } = Config.starfield;
    const alpha = Math.min(this._age / fadeInDuration, 1);

    for (const layer of this.layers) {
      this.renderer.drawImage(layer.tile, 0, layer.scroll - height, alpha);
      this.renderer.drawImage(layer.tile, 0, layer.scroll, alpha);
    }
  }
}
