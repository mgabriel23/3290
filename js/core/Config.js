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
   * Colors. Centralised so the renderer stays dumb about theme.
   */
  colors: Object.freeze({
    void: '#05070f', // deep space background
  }),
});
