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
   * The opening cinematic — plays once between the intro prompt and
   * gameplay, structured as a fixed sequence of "beats" (see
   * PrologueScene): a year card sets the scene, three wireframe portals
   * tear open, the commander's mandatory briefing types itself out, the
   * whole assembly fades to black, and finally the game's title card —
   * "3290", deliberately doubling as the year — appears with the PLAY
   * button that gates entry into actual gameplay.
   */
  prologue: Object.freeze({
    /**
     * Beat 1: a stark "when" title card — letters type in one by one with
     * a signal-interference alpha flicker on the whole line throughout
     * (see PrologueScene._yearCardFlickerAlpha), so it reads as a weak
     * transmission barely coming through rather than a clean title card.
     */
    yearCard: Object.freeze({
      text: 'EARTH — YEAR 3290',
      font: '400 28px "Audiowide", "Courier New", monospace',
      textColor: '#aab4d4',
      charsPerSecond: 12, // letter by letter — slower than the briefing for dramatic weight
      holdDuration: 2.4,   // seconds the finished year card lingers before the next beat starts
      fadeOutDuration: 0.8,
    }),

    /**
     * Beat 2: three wireframe vortices burst into the (now-visible) sky,
     * one after another (see Portal — identical spiral arms fanned
     * evenly around a small counter-spinning core, the whole assembly
     * growing and fading in with an ease-out "tearing open" animation).
     * An eerie violet, deliberately distinct from the player's
     * cyan/orange palette, so they read as something that doesn't belong.
     */
    portals: Object.freeze({
      color: '#9D7BFF',
      lineWidth: 2,
      glowBlur: 14, // reduced from 22 — blur cost scales roughly with area (radius²), so 14 vs 22 is ~60% cheaper per pass; still visibly glowing
      appearDuration: 1.6, // seconds for one portal's grow-and-fade-in (also syncs the sky's own reveal — see PrologueScene._renderPortals)
      staggerDelay: 1.2,   // seconds between each portal starting its own appear animation
      holdDuration: 1.8,   // seconds all three linger after the last one finishes appearing

      /** The swirling vortex body: one spiral-arm shape, baked once and re-stroked at evenly fanned rotations — see Portal._renderArms. */
      spiral: Object.freeze({
        armCount: 4,
        innerRadius: 8,   // virtual px — where each arm starts, near the core
        outerRadius: 50,  // virtual px — how far each arm reaches outward
        turns: 1.4,       // revolutions an arm sweeps through end to end — higher reads as "tighter"
        segments: 28,     // polyline resolution along the curve — higher = smoother
        rotationSpeed: 1.2, // radians/second — the whole swirl's spin
      }),

      /** A small faceted "event horizon" at the very center, counter-spinning against the arms for a layered, alien feel. */
      core: Object.freeze({ sides: 6, radius: 10, rotationSpeed: -2.4 }),

      // Spread across the upper half — virtual-ratio coordinates — deliberately
      // leaving the lower half clear: the briefing beat keeps these on screen
      // and anchors its text near the bottom edge, so the two never collide.
      positions: Object.freeze([
        Object.freeze({ xRatio: 0.24, yRatio: 0.13 }),
        Object.freeze({ xRatio: 0.80, yRatio: 0.26 }),
        Object.freeze({ xRatio: 0.48, yRatio: 0.46 }),
      ]),
    }),

    /**
     * Beat 3: the commander's voice cuts in over comms — a mandatory
     * typewriter-revealed briefing (deliberately no skip control: unlike
     * the sample paragraph this superseded, this part of the story always
     * plays) — staged centered, near the bottom edge, while the portals
     * keep churning above (PrologueScene keeps both alive and on screen
     * through this beat — see _renderBriefing).
     */
    briefing: Object.freeze({
      text:
        "Pilot, are you reading me? We don't know what's happening — three " +
        "tears just ripped open in the sky and nobody can explain it. Reports " +
        "are flooding in from every direction: unidentified objects coming " +
        "through, hitting multiple regions at once. Comms are down across half " +
        "the eastern sectors. We don't know what they are, where they came from, " +
        "or how many more are coming. All we know is — they're not stopping. " +
        "Get up there. We need eyes on this. Now.",
      font: '400 20px "Audiowide", "Courier New", monospace',
      textColor: '#aab4d4',
      lineHeight: 32,     // virtual px between line baselines
      sideMargin: 56,     // virtual px — bounds the wrapped paragraph's width
      bottomMargin: 64,   // virtual px from the bottom edge to the newest line's baseline (see PrologueScene._briefingAnchorY) — sits low, beneath the portals
      maxVisibleLines: 4, // the "subtitle window" never shows more than this many lines at once — older ones fall away as new ones reveal (see PrologueScene._drawBriefingText)
      wordsPerSecond: 4,  // the briefing reveals a whole word at a time, not letter by letter — see PrologueScene._updateBriefing for why that reads (and sounds) more like typing
      holdDuration: 1.6,  // seconds the finished briefing stays up before fading out

      /**
       * Ticks on its OWN clock — deliberately faster than `wordsPerSecond`
       * — so the typewriter sounds like a busy teletype clattering away
       * underneath the calmer, readable pace the words actually pop up
       * at, rather than one polite blip per word landing in lockstep
       * with the text (see PrologueScene._advanceBlips). Cloned per-play
       * so overlapping retriggers layer instead of cutting each other off.
       */
      blip: Object.freeze({
        src: 'assets/audio/typewriter-blip.mp3',
        volume: 0.5,
        perSecond: 6,
      }),
    }),

    /** Beat 4: the assembled scene dissolves to black — see Renderer.clear's translucent-overlay technique. */
    fadeOutDuration: 1.2,

    /**
     * Beat 5: the title card. "3290" is the game's name, deliberately
     * echoing the year established in the opening beat. PLAY is the
     * actual control gate — tapping it is what hands off to gameplay
     * (see PrologueScene.handleTap / Game._startGameplay).
     */
    title: Object.freeze({
      text: '3290',
      font: '400 64px "Audiowide", "Courier New", monospace',
      textColor: '#4DEFFF',
      glowBlur: 14,               // neon halo on the title glyph — matches all other neon elements; blur cost scales with radius² so 14 vs 20 is ~51% cheaper
      subtitleText: 'DEFEND EARTH',
      subtitleFont: '400 15px "Audiowide", "Courier New", monospace',
      subtitleColor: '#7af0ff',   // softer cyan — reads as a secondary register below the title
      taglineFont: '400 10px "Audiowide", "Courier New", monospace',
      taglineColor: '#aab4d4',    // same as other UI text, kept dim via alpha in render
      chromeColor: '#4DEFFF',     // decorative HUD lines and bracket ticks
      chromeLineWidth: 1,
      chromeGlowBlur: 6,
      fadeInDuration: 1.0,

      playButton: Object.freeze({
        label: 'PLAY',
        font: '400 20px "Audiowide", "Courier New", monospace',
        color: '#4DEFFF',
        lineWidth: 1.5,
        glowBlur: 14,
        width: 168,
        height: 52,
        offsetBelowTitle: 148,  // more vertical room for the subtitle + decorative rules below it
        cornerSize: 14,         // leg length (virtual px) of each L-bracket corner tick
        pulseSpeed: 2.2,        // radians/second — drives the breathing alpha on the button
        pulseDepth: 0.28,       // how far the alpha dips at the trough of each breath
      }),
    }),
  }),

  /**
   * Background music. A single looping theme track, started the moment
   * the player swipes past the intro prompt.
   */
  audio: Object.freeze({
    themeSrc: 'assets/audio/bg-music.mp3',
    themeVolume: 0.4, // kept moderate so future sound effects can sit on top without competing
    themeLoop: true,
  }),

  /**
   * Colors. Centralised so the renderer stays dumb about theme.
   */
  colors: Object.freeze({
    void: '#05070f', // deep space background
  }),

  /**
   * The planetary shield barrier: a wide shallow dome spanning the full
   * screen width along the bottom edge. The arc's geometry is derived from
   * the chord/sagitta formula so `baseY` and `arcHeight` are the only two
   * values needed to fully describe its shape. Everything else controls
   * visual detail and is read once at construction time (see Barrier.js).
   */
  barrier: Object.freeze({
    color: '#4DEFFF',
    lineWidth: 2,
    glowBlur: 10,      // reduced from 12 — blur cost ∝ radius², so 10 vs 12 is ~31% cheaper
    baseY: 940,        // virtual px — where the arc endpoints sit (bottom edge margin)
    arcHeight: 70,     // virtual px — how high the arc rises at center
    arcSegments: 48,   // polyline resolution — higher = smoother curve
    innerInset: 10,    // inner echo arc is this many px shallower than the main arc
    strutCount: 5,     // upward structural tick marks along the arc
    strutDepth: 14,    // virtual px — how far each strut extends toward screen center
    // Permanent health readout rendered inside the dome at the peak
    healthLabelFont: '400 9px "Audiowide", "Courier New", monospace',
    healthValueFont: '400 14px "Audiowide", "Courier New", monospace',
    healthColor: '#4DEFFF',
    healthGlowBlur: 3, // kept low — small radius means cheap shadow pass
  }),

  /**
   * Gameplay HUD: score (top-left) and gold (top-right) displayed as
   * compact neon panels. Same sci-fi design language as the title screen —
   * L-bracket corner accent, dim label, bright neon value with glow.
   */
  hud: Object.freeze({
    margin: 20,          // virtual px from screen edges to the panel anchor corner
    labelFont: '400 10px "Audiowide", "Courier New", monospace',
    labelColor: '#aab4d4',
    valueFont: '400 20px "Audiowide", "Courier New", monospace',
    valueColor: '#4DEFFF',
    valueGlowBlur: 6,    // reduced from 8 — 44% cheaper shadow pass (blur cost ∝ radius²)
    chromeColor: '#4DEFFF',
    chromeLineWidth: 1,
    chromeGlowBlur: 4,   // reduced from 5
    bracketSize: 12,     // leg length (virtual px) of the L-bracket corner accent
  }),

  /**
   * Tutorial overlay. Plays once between the title screen and the first
   * gameplay session — the full gameplay backdrop (starfield, barrier, HUD)
   * is visible behind a dim overlay so every hint arrow points at the real
   * UI element it describes.
   */
  tutorial: Object.freeze({
    textFont: '400 20px "Audiowide", "Courier New", monospace',
    textColor: '#aab4d4',
    lineHeight: 28,      // virtual px between lines of a multi-line hint
    wordsPerSecond: 5,   // typewriter reveal speed — word-at-a-time, same pattern as briefing
    textMaxWidth: 370,   // virtual px — hint text wraps at this width
    tapFont: '400 10px "Audiowide", "Courier New", monospace',
    tapColor: '#4DEFFF',
    overlayAlpha: 0.60,  // how much the gameplay backdrop dims behind the hint text
    arrowColor: '#4DEFFF',
    arrowGlowBlur: 8,    // reduced from 10 — tutorial arrows are short so a smaller halo still reads clearly
    progressFont: '400 10px "Audiowide", "Courier New", monospace',
    progressColor: '#4DEFFF',
    blip: Object.freeze({
      src: 'assets/audio/typewriter-blip.mp3',
      volume: 0.35,
      perSecond: 8,
    }),
  }),
});
