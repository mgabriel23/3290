/**
 * Starfield.js
 * The drifting, seamlessly-looping layered backdrop shared by every
 * scene that needs to feel like it's set against open space. Originally
 * authored inline as GameplayScene's permanent backdrop; extracted into
 * its own composed entity (the same shape as Player/Portal) once
 * PrologueScene needed the same sky behind its "portals" beat onward —
 * the tears need an actual sky to tear open in.
 *
 * Performance: each parallax layer is baked ONCE to an off-screen
 * canvas tile (see _bakeTile — drawing straight to the tile's own 2D
 * context, a throwaway static-texture bake rather than a draw to the
 * shared display surface Renderer abstracts). Every frame just
 * translates and blits that tile twice via Renderer.drawImage — the
 * standard two-copy seamless-scroll technique (one copy one
 * tile-height above the other, so the wrap point is never visible) —
 * keeping per-frame cost flat regardless of star count.
 *
 * This entity has no opinion about *when* or *how* it should appear —
 * `render`'s optional `alpha` lets each owning scene drive its own
 * entrance (GameplayScene's age-based fade-in; PrologueScene syncing it
 * to the portals' own appear animation) without this needing to know.
 */
import { Config } from '../core/Config.js';

export class Starfield {
  constructor() {
    this.layers = this._createLayers();
  }

  /** Scroll each layer downward at its own speed, wrapping for a seamless loop. */
  update(dt) {
    const { height } = Config.virtual;
    for (const layer of this.layers) {
      layer.scroll += layer.speed * dt;
      if (layer.scroll > height) layer.scroll -= height;
    }
  }

  /**
   * Draw each layer's tile twice, offset by one tile-height — see class
   * doc for why. `alpha` (0–1) optionally fades the whole starfield as
   * one shared value across every copy, so it eases into view (or stays
   * fully invisible pre-reveal) as a single coherent layer.
   * @param {import('../core/Renderer.js').Renderer} renderer @param {number} [alpha]
   */
  render(renderer, alpha = 1) {
    const { height } = Config.virtual;
    for (const layer of this.layers) {
      renderer.drawImage(layer.tile, 0, layer.scroll - height, alpha);
      renderer.drawImage(layer.tile, 0, layer.scroll, alpha);
    }
  }

  // --- Baking ----------------------------------------------------------------

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
}
