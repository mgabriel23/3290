/**
 * GameplayScene.js
 * The gameplay screen foundation.
 *
 * Current milestone: an animated backdrop — a drifting starfield that
 * loops seamlessly downward — behind an otherwise empty stage. It is the
 * slot where future gameplay systems (entities, input, physics) will
 * eventually be composed, but no such hooks are stubbed here yet, by design.
 *
 * Performance: the starfield is organised into a few parallax layers,
 * each baked ONCE to an off-screen canvas tile (see _bakeTile). Every
 * frame just translates and blits that tile twice (the standard
 * two-copy seamless-scroll technique) — flat per-frame cost no matter
 * how many stars a layer contains, which keeps this cheap on low-end
 * devices.
 */
import { Config } from '../core/Config.js';

export class GameplayScene {
  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.layers = this._createLayers();
  }

  /** Advance the backdrop by `dt` seconds. */
  update(dt) {
    const { height } = Config.virtual;
    for (const layer of this.layers) {
      layer.scroll += layer.speed * dt;
      if (layer.scroll > height) layer.scroll -= height; // wrap for a seamless loop
    }
  }

  /** Render one frame: void backdrop + starfield layers (back to front). */
  render() {
    this.renderer.clear(Config.colors.void);
    this._drawLayers();
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
   * loop point is never visible.
   */
  _drawLayers() {
    const { height } = Config.virtual;
    for (const layer of this.layers) {
      this.renderer.drawImage(layer.tile, 0, layer.scroll - height);
      this.renderer.drawImage(layer.tile, 0, layer.scroll);
    }
  }
}
