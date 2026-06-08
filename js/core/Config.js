/**
 * Config.js
 * Single source of truth for all tunable constants.
 * No logic lives here — only frozen configuration data.
 * Keeping these decoupled from systems means future tuning never
 * requires touching the Renderer, Game, or Scene code.
 */
export const Config = Object.freeze({
  /**
   * The virtual (logical) resolution the game is authored against.
   * All future gameplay coordinates will be expressed in this space,
   * independent of the device's actual pixel dimensions.
   * 9:16 portrait — a phone-native aspect ratio.
   */
  virtual: Object.freeze({
    width: 540,
    height: 960,
  }),

  /**
   * Background starfield: small squares drifting downward to suggest
   * forward motion through space, organised into discrete parallax
   * layers (back to front) — each layer is baked once to an off-screen
   * tile and blitted thereafter, so per-frame cost stays flat regardless
   * of star count (see GameplayScene._bakeTile).
   */
  starfield: Object.freeze({
    color: '#aab4d4',
    layers: Object.freeze([
      Object.freeze({ count: 60, sizeMin: 0.6, sizeMax: 1.0, speed: 16 }), // far
      Object.freeze({ count: 30, sizeMin: 1.1, sizeMax: 1.8, speed: 38 }), // near
    ]),
  }),

  /**
   * Colors. Centralised so the renderer stays dumb about theme.
   */
  colors: Object.freeze({
    void: '#05070f', // deep space background
  }),
});
