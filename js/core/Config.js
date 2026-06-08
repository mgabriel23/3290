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
    fadeInDuration: 1.5, // seconds — stars ease in from fully transparent when the scene starts
    layers: Object.freeze([
      Object.freeze({ count: 60, sizeMin: 0.6, sizeMax: 1.0, speed: 16 }), // far
      Object.freeze({ count: 30, sizeMin: 1.1, sizeMax: 1.8, speed: 38 }), // near
    ]),
  }),

  /**
   * The player's ship: drawn as a handful of stroked vector paths with
   * a neon glow — an outline-only "wireframe HUD" look, no fills. It
   * launches up from off-screen into its resting position the moment
   * the gameplay scene starts (alongside the starfield's fade-in), and
   * its thruster flame animates continuously underneath it.
   */
  player: Object.freeze({
    color: '#4DEFFF',      // electric-cyan neon outline
    lineWidth: 2.5,        // virtual px (kept visually constant regardless of `scale`)
    glowBlur: 14,          // shadow-blur radius behind the stroke (the "neon" halo)
    scale: 0.5,            // shrinks the authored ~64x80 silhouette down to a small ship
    width: 64,             // authored bounding width, virtual px (pre-`scale`)
    height: 80,            // authored bounding height, virtual px (pre-`scale`) — used to place it off-screen
    restingYRatio: 0.78,   // resting position as a fraction down the virtual height
    entryDuration: 1.4,    // seconds for the ease-out fly-up entrance

    /** The engine flame: a small pulsing neon triangle beneath the ship. */
    flame: Object.freeze({
      color: '#FF8A3D',           // warm neon orange — contrasts with the cyan hull
      lineWidth: 2,
      glowBlur: 16,
      baseLength: 20,             // virtual px, resting flame length
      flickerAmplitudes: Object.freeze([8, 4]),  // two summed sine waves = an organic flicker
      flickerSpeeds: Object.freeze([9, 21]),     // radians / second
    }),
  }),

  /**
   * The opening prompt: a static "swipe up to continue" label over the
   * same void backdrop the gameplay scene uses, so the handoff between
   * the two is visually seamless (no background color change).
   */
  intro: Object.freeze({
    text: 'SWIPE UP TO CONTINUE',
    // Audiowide ships in a single (regular) weight — requesting 700 would
    // just trigger faux-bold synthesis, so weight is left at its natural 400.
    font: '400 24px "Audiowide", "Courier New", monospace',
    textColor: '#aab4d4',
    bottomMargin: 100,    // virtual px from the bottom edge to the label's position
    swipeThresholdPx: 48, // CSS px of upward drag that counts as "swipe up"

    /** A small bobbing chevron above the label, hinting at the swipe direction. */
    arrow: Object.freeze({
      color: '#aab4d4',
      lineWidth: 2.5,
      glowBlur: 10,
      offsetAboveText: 38, // virtual px between the label's baseline and the arrow
      bobAmplitude: 6,     // virtual px of vertical travel
      bobSpeed: 3,         // radians / second
    }),

    /**
     * The "typewriter" fade-out: once the player swipes, each letter of
     * the label fades to transparent in sequence (first letter first),
     * each starting `staggerDelay` seconds after the previous one. Only
     * once the last letter has fully faded does `onContinue` fire.
     */
    exit: Object.freeze({
      staggerDelay: 0.05, // seconds between each letter's fade-out start
      fadeDuration: 0.2,  // seconds for a single letter to fade to transparent
    }),
  }),

  /**
   * Background music. A single looping theme track, started the moment
   * the player swipes past the intro prompt.
   */
  audio: Object.freeze({
    themeSrc: 'assets/audio/theme.mp3',
    themeVolume: 0.4, // kept moderate so future sound effects can sit on top without competing
    themeLoop: true,
  }),

  /**
   * Colors. Centralised so the renderer stays dumb about theme.
   */
  colors: Object.freeze({
    void: '#05070f', // deep space background
  }),
});
