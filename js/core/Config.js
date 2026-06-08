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
   * The gameplay world border (the battlefield edge), inset from the
   * canvas edges so the play area reads as a contained arena.
   */
  world: Object.freeze({
    margin: 24,        // inset from canvas edge to the border, in virtual px
    borderWidth: 2,    // stroke width of the battlefield border, in virtual px
  }),

  /**
   * Colors. Centralised so the renderer stays dumb about theme.
   */
  colors: Object.freeze({
    void: '#05070f',          // deep space background inside the arena
    worldBorder: '#2dd4bf',   // battlefield border stroke
    worldGlow: 'rgba(45, 212, 191, 0.35)', // subtle border glow
  }),
});
