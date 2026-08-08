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

    damage:         1,     // health points removed from an enemy per bullet hit, at level 1
    damagePerLevel: 0.25,  // added to `damage` for each level beyond 1 (level 4 → 1 + 3*0.25 = 1.75)

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
   * Level / wave system. Each level begins with a full-screen indicator —
   * a large cyan "LEVEL N" that fades in, holds with an unstable flicker,
   * then fades out before gameplay (enemies, bullets) is unblocked.
   * LocalStorage progress persistence is deferred — see project notes.
   */
  level: Object.freeze({
    introDuration:   2.8,   // total seconds the indicator occupies the screen
    fadeInDuration:  0.35,  // initial fade-in phase
    fadeOutDuration: 0.55,  // closing fade-out phase
    // Large enough to dominate the screen; Audiowide at 72 vp ≈ 360 px wide for "LEVEL 1" — fits within 540
    font: '400 72px "Audiowide", "Courier New", monospace',
    color: '#4DEFFF',
    glowBlur: 16,           // wider halo than normal UI — makes the text feel heavy and threatening; kept at 16 (47% cheaper than 22 per blur cost ∝ radius²)
  }),

  /**
   * Player bullets: auto-fired as a continuous stream once the player's
   * ship has landed, rendered as short glowing capsule strokes in the same
   * neon-cyan as the hull so they read as energy bolts rather than solid
   * projectiles. All active bullets are batched into a single strokePaths
   * call each frame — one shadow-blur GPU pass regardless of bullet count.
   */
  bullet: Object.freeze({
    color: '#4DEFFF',      // matches player hull
    lineWidth: 5,          // virtual px — thick enough to look solid
    halfLen: 6,            // virtual px — segment half-length; with round caps total visual height ≈ 17px
    glowBlur: 8,           // reduced from 12 — blur cost ∝ radius², so 8 vs 12 is ~56% cheaper; singleStroke batching means this runs once regardless of bullet count
    speed: 1500,            // virtual px/sec, upward
    fireRate: 9,           // shots per second — fast mid rate
    spawnOffsetY: -14,     // virtual px above player.y — places spawn near the nose tip

    audio: Object.freeze({
      src: 'assets/audio/bullet-shoot.mp3',
      // At 9/sec, 2–3 clips overlap at any moment → effective stacked volume ≈ 0.18–0.27.
      // That places bullets clearly above BGM (0.22) as rhythmic SFX texture without fatigue.
      volume: 0.09,
      // Pool of 12 → each slot isn't reused until 12/9 ≈ 1.3s after it was claimed,
      // giving a short shoot clip time to finish well before its element is reset.
      poolSize: 12,
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
     * (see core/animation.js's flickerAlpha, called from _renderYearCard),
     * so it reads as a weak transmission barely coming through rather than
     * a clean title card.
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
      maxVisibleLines: 4, // the "subtitle window" never shows more than this many lines at once — older ones fall away as new ones reveal (see PrologueScene._renderBriefingText)
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
        // Fires at up to 12/sec (year card) and 6/sec (briefing) — kept very low
        // so rapid stacking stays as subtle texture beneath BGM at 0.22.
        volume: 0.06,
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
      exitFadeDuration: 0.55, // seconds — black veil that falls over the title when PLAY is tapped

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
   * Scout enemy — the first enemy type. Enters from the top, glides to a
   * random resting position in the upper third, then fires aimed shots at
   * the player on a fixed reload cycle.
   */
  enemy: Object.freeze({
    // Shared white hit-flash duration (seconds) for every enemy type whose
    // hit() goes through EnemyCombat.applyHit (Scout/Rocketeer, Sniper,
    // Drifter). Bouncer has its own `bouncer.flashDuration` since its flash
    // also covers its shield-hit case.
    hitFlashDuration: 0.15,

    /**
     * Scout — basic fighter. Enters, parks at a fixed rest position,
     * fires aimed bullet bursts at the player.
     */
    scout: Object.freeze({
      size:             22,
      health:           3,
      healthPerLevel:   1,    // +1 health per level beyond 1
      color:            '#ff3ec9',   // magenta
      fillColor:        '#1a0a20',
      lineWidth:        1.5,
      glowBlur:         12,
      hitGlowBlur:      22,
      engineCoreColor:  '#ff5f00',
      flameColor:       '#ff3ec9',
      flameHalfWidth:   3,
      entrySpeed:       320,
      restXMargin:      80,
      restYMin:         0.08,
      restYMax:         0.35,
      aimPause:         0.5,
      reloadTime:       2.2,
      hitRadius:        16,
      minSeparation:    60,
      points:           100,  // reward on kill — baseline
      gold:             5,
      audio: Object.freeze({
        src: 'assets/audio/explosion.mp3', volume: 0.40, poolSize: 4,
      }),
    }),

    /**
     * Sniper — same hull silhouette, electric violet. High health (8 hits).
     * Continuously records the player's position history; when it fires it
     * targets where the player WAS `historyWindow` seconds ago, giving a
     * skilled player a chance to dodge if they read the warning indicator.
     * Charge sequence: 2 s warmup (nose orb grows) → 1 s locked (! shown,
     * nose blinking) → instant laser flash → immediately recharge.
     */
    sniper: Object.freeze({
      size:             22,
      health:           8,
      healthPerLevel:   2,    // +2 health per level beyond 1 — already tanky, scales faster
      color:            '#BF5FFF',   // electric violet — reads as energy/laser weapon
      fillColor:        '#110022',
      lineWidth:        1.8,
      glowBlur:         12,
      hitGlowBlur:      22,
      engineCoreColor:  '#8833CC',   // deeper violet for the engine orb
      flameColor:       '#BF5FFF',
      flameHalfWidth:   3,
      entrySpeed:       300,
      restXMargin:      80,
      restYMin:         0.08,
      restYMax:         0.35,
      chargeWarmup:     1.5,         // seconds of nose charge before ! appears
      warningDuration:  0.7,         // seconds ! is shown before the shot fires
      historyWindow:    0.3,         // seconds into the past to sample player position
      recoverDuration:  1.0,         // seconds after firing before player-tracking resumes
      recoverTurnRate:  4,           // rad/sec — slow turn back toward the player during recovery
      hitRadius:        24,
      minSeparation:    64,
      points:           300,  // reward on kill — tankiest ship-family enemy, telegraphed one-shot threat
      gold:             15,

      // Nose charge-orb visual tuning (see SniperEnemy.renderCore)
      chargeOrbStartRadius: 3,   // radius at t=0 while charging
      chargeOrbGrowth:      7,   // added radius by full charge (radius = start + growth*t)
      chargeOrbLineWidth:   2,
      chargeOrbGlowBlur:    6,
      chargeOrbAlphaMin:    0.2, // alpha at t=0 while charging (ramps to 1)
      lockedOrbRadius:      10,  // full-charge orb size while locked/flashing
      lockedOrbLineWidth:   2.5,
      lockedOrbGlowBlur:    8,
      lockedBlinkSpeed:     6,   // × π rad/sec — rapid blink signaling imminent fire
      flashOrbGrowth:       14,  // added radius as the charge orb releases into the laser

      // "!" warning marker visual tuning (see SniperEnemy.renderExtras)
      warningRingRadius:    20,
      warningRingLineWidth: 2,
      warningRingAlphaMult: 0.6, // outer ring reads dimmer than the inner dot/label
      warningDotRadius:     4,
      warningDotLineWidth:  3,
      warningDotGlowBlur:   6,
      warningLabelOffset:   32,  // vp above the marker
      warningLabelFont:     '400 28px "Audiowide", "Courier New", monospace',
      warningLabelGlowBlur: 10,
      warningFadeInSpeed:   6,   // × t — how quickly the marker reaches full pulse strength
      warningPulseSpeed:    4,   // × π rad/sec — pulse rate once faded in
      audio: Object.freeze({
        src: 'assets/audio/explosion.mp3', volume: 0.55, poolSize: 4,
      }),
    }),

    /**
     * Rocketeer — same hull silhouette as the Scout, amber coloring.
     * Fires homing rockets instead of bullets; slower to shoot but
     * rockets track and detonate on proximity, making them harder to dodge.
     */
    rocketeer: Object.freeze({
      size:             22,
      health:           2,
      healthPerLevel:   1,    // +1 health per level beyond 1
      color:            '#FFB020',   // amber/gold — warm, distinct from scout magenta
      fillColor:        '#1a1000',   // very dark amber
      lineWidth:        1.5,
      glowBlur:         12,
      hitGlowBlur:      22,
      engineCoreColor:  '#FF6A00',   // deeper orange — contrasts with the amber hull
      flameColor:       '#FFB020',
      flameHalfWidth:   3,
      entrySpeed:       280,
      restXMargin:      80,
      restYMin:         0.08,
      restYMax:         0.35,
      aimPause:         1.0,         // longer lock-on pause before launch
      reloadTime:       3.8,         // slow reload — rockets are powerful
      hitRadius:        16,
      minSeparation:    64,
      points:           150,  // reward on kill — homing rocket is harder to dodge than a straight shot
      gold:             8,
      audio: Object.freeze({
        src: 'assets/audio/explosion.mp3', volume: 0.50, poolSize: 4,
      }),
    }),

    /**
     * Drifter — an alien "tentacle" creature, spawned in formations that
     * share a single diagonal-entry → loop-the-loop → diagonal-exit path
     * (see DrifterEnemy.createPath/samplePath). Each clone in a formation
     * trails the one ahead by `spacing` along the path, conga-line style.
     * Doesn't track or steer toward the player at all — purely follows its
     * path and is removed once it leaves the screen during its exit run.
     * Independently of its movement, each clone periodically whips a
     * tentacle toward the player's current position and launches a slow
     * projectile that bursts into a small AOE at the player's (locked)
     * position when it arrives.
     */
    drifter: Object.freeze({
      health:           3,
      healthPerLevel:   1,    // +1 health per level beyond 1 — applies to all varieties (sweeper/diver/weaver share `health`)
      color:            '#FFB020',   // amber/gold — matches Rocketeer
      fillColor:        '#1a1000',
      eyeColor:         '#FFE0A0',
      lineWidth:        1.8,
      glowBlur:         8,
      hitGlowBlur:      22,
      tentacleGlowBlur: 6,
      lashGlowBlur:     10,

      // Path-following formation
      formationSize: 8,    // clones per formation, conga-line
      spacing:       50,   // vp along the path between trailing clones
      speed:         220,  // vp/sec along the path
      loopRadius:    70,   // loop-the-loop radius
      entryMargin:   60,   // vp off-screen at the diagonal entry point
      offscreenMargin:   40,  // vp beyond each edge before a clone counts as off-screen (culling + exit checks)
      pathEntryRunMin:   250, // vp — variant #1's straight run before the loop starts
      pathEntryRunMax:   400,
      pathExitRunLength: 900, // vp — variant #1's straight run after the loop, well past the far corner

      // Tentacle animation
      tentacleLen:   20,
      tentacleSegs:  3,    // fewer segments = fewer points per stroke and fewer per-frame sin() calls
      tentacleAmp:   6,
      tentacleSpeed: 5,
      tentacleWaveFreq:     3,   // per-segment wave-phase multiplier (see DrifterEnemy.render)
      tentaclePhaseSpacing: 1.3, // per-tentacle-index phase offset — desyncs the 4 tentacles' waves
      lashStraightenFactor: 0.7, // how much a lashing tentacle's wave amplitude shrinks as it extends

      // Tentacle-lash projectile attack
      fireMinInterval:  2.5,  // seconds idle before the next lash
      fireMaxInterval:  5.0,
      lashDuration:     0.22, // tentacle whips toward the player
      lashLen:          40,   // tentacle extension at full lash (2x tentacleLen)
      projectileSpeed:  320,  // vp/sec toward the locked target
      projectileRadius: 4,

      hitRadius:     18,
      points:        120,  // reward on kill — base variant
      gold:          6,
      audio: Object.freeze({
        // Lower than Rocketeer/Sniper (0.45) — formations of up to 8 clones
        // can die in close succession, and the shared SFX pool would
        // otherwise stack into a much louder cumulative volume.
        src: 'assets/audio/explosion.mp3', volume: 0.3, poolSize: 4,
      }),

      /**
       * Variety #2 — "Sweeper": a single conga-line that travels in
       * straight horizontal runs, stepping straight down by `step` each
       * time it hits a screen edge (no diagonal motion). Reuses the same
       * body/tentacle/attack shapes and tunables above, just a different
       * path, formation size, palette, and slightly calmer fire rate
       * (more clones on screen at once than variety #1).
       */
      sweeper: Object.freeze({
        color:     '#ff3ec9',   // magenta — matches Scout
        fillColor: '#1a0a20',
        eyeColor:  '#ffd0ee',

        formationSize: 15,   // clones per formation, conga-line
        spacing:       50,   // vp along the path between trailing clones
        speed:         220,  // vp/sec along the path
        margin:        50,   // horizontal bounds the row sweeps between
        step:          40,   // vertical drop performed at each bounce
        startY:        60,   // starting height

        // Slightly longer fire intervals than variety #1 — with up to 15
        // clones on screen at once, firing at the same rate would feel
        // overwhelming.
        fireIntervalMult: 1.4,

        // Smaller glow radii than variety #1 (8/22/6/10) — up to 15 clones
        // can be on screen at once (vs 8), so each shadow-blur pass covers
        // more ground; smaller radii keep per-pass cost down (blur cost ∝
        // radius²) without losing the magenta neon read.
        glowBlur:         6,   // body hull glow
        hitGlowBlur:      16,  // hit-flash hull glow
        tentacleGlowBlur: 4,   // per-clone tentacle glow
        lashGlowBlur:     7,   // per-clone lash glow

        audio: Object.freeze({
          // Lower than variety #1's 0.3 — formations of up to 15 clones
          // (vs 8) can die in close succession on the same shared SFX pool.
          src: 'assets/audio/explosion.mp3', volume: 0.20, poolSize: 4,
        }),

        // Fewer sparks per explosion than variety #1's default 14 — up to
        // 15 simultaneous deaths would otherwise flood the spark pool and
        // widen the shared glow pass's bounding box.
        sparksPerEmit: 8,

        points: 100,  // reward on kill — large formation (15), calmer per-clone threat than variety #1
        gold:   5,
      }),

      /**
       * Variety #3 — "Diver": a small V-shaped wedge that drops straight
       * down, accelerating as it falls (kinematics: dist = v0*t + 0.5*a*t^2
       * — see DrifterEnemy.sampleDiverPath). Always faces straight down
       * (head toward the player, tentacles trailing above). Reuses the same
       * body/tentacle/attack shapes and tunables above, just a different
       * path, formation shape, and palette. Formation (5) is smaller than
       * variety #1's (8), but the wedge's tight [-70..70] spread means a
       * single bullet sweep can pop several clones within the same frame
       * or two — trimmed hit-flash/lash glow, spark count, and explosion
       * volume below variety #1's defaults to keep those simultaneous-kill
       * bursts cheap on low-end devices.
       */
      diver: Object.freeze({
        color:     '#39ff14',   // neon green — distinct from amber (#1) and magenta (#2)
        fillColor: '#06190a',
        eyeColor:  '#c8ffb0',

        // Fixed [dx, dy] offsets from the wedge's leader (tip), pointing in
        // the direction of travel (down) — a rigid V formation.
        formationSize: 5,
        offsets: Object.freeze([
          Object.freeze([0, 0]),
          Object.freeze([-35, -35]), Object.freeze([35, -35]),
          Object.freeze([-70, -70]), Object.freeze([70, -70]),
        ]),

        spawnY:     -70,  // leader's y at spawn, vp
        margin:     80,   // horizontal spawn-x bounds
        startSpeed: 140,  // vp/sec at spawn
        accel:      90,   // vp/sec^2 — speeds up as it falls

        fireIntervalMult: 1,

        glowBlur:         8,
        hitGlowBlur:      18,
        tentacleGlowBlur: 5,
        lashGlowBlur:     8,

        audio: Object.freeze({
          src: 'assets/audio/explosion.mp3', volume: 0.25, poolSize: 4,
        }),
        sparksPerEmit: 10,

        points: 130,  // reward on kill — fast kinematic fall
        gold:   6,
      }),

      /**
       * Variety #4 — "Weaver": a conga-line that travels straight down the
       * screen while swaying side-to-side in a sine wave (see
       * DrifterEnemy.sampleWeaverPath). Reuses the same body/tentacle/attack
       * shapes and tunables above, just a different path, palette (Sniper's
       * electric violet), and formation size. Formation (6) sits close to
       * variety #3's (5) — same trimmed hit-flash/lash glow, spark count,
       * and explosion volume as variety #3, since the conga-line's full run
       * keeps several clones on screen simultaneously for an extended
       * stretch (more cumulative glow-pass exposure than a quick pass-through).
       */
      weaver: Object.freeze({
        color:     '#BF5FFF',   // electric violet — matches Sniper
        fillColor: '#110022',
        eyeColor:  '#e0c0ff',

        formationSize: 6,    // clones per formation, conga-line
        spacing:       50,   // vp along the path between trailing clones
        speed:         200,  // vp/sec along the path
        amplitude:     90,   // horizontal sway amplitude, vp
        frequency:     0.012,// radians per vp traveled — wave tightness
        spawnYOffset:  -60,  // vp — y at path distance 0, above the top edge so clones ease into view

        fireIntervalMult: 1,

        glowBlur:         8,
        hitGlowBlur:      18,
        tentacleGlowBlur: 5,
        lashGlowBlur:     8,

        audio: Object.freeze({
          src: 'assets/audio/explosion.mp3', volume: 0.25, poolSize: 4,
        }),
        sparksPerEmit: 10,

        points: 130,  // reward on kill — sustained on-screen sway threat
        gold:   6,
      }),
    }),

    /**
     * Bouncer — a wireframe-only hexagon (no fill) that drops in from the
     * top and bounces indefinitely off the side walls, the top edge, and
     * the barrier at the bottom (see BouncerEnemy.js), accelerating
     * downward under a constant "gravity" between bounces. Each bounce off
     * the barrier deals `barrierDamage` to Barrier.health — it stays a
     * persistent threat until the player destroys it. Its remaining health
     * is drawn as a number at its center (no per-eye/tentacle detail to
     * read otherwise).
     *
     * Variety #2 ("Splitter", `splitter` below) is a larger, tankier hexagon
     * that on death breaks into `fragmentCount` small low-health Bouncer
     * clones (variant 'fragment'), kicked outward from the splitter's death
     * position — see BouncerEnemy.spawnFragments().
     *
     * Variety #3 ("Shielded", `shielded` below) is a normal-size core
     * surrounded by an outer hexagonal shield ring that spins in lockstep
     * with the core and absorbs `shieldHits` bullet hits — and determines
     * the bounce/collision radius while it's up — before the core can take
     * damage like a normal Bouncer.
     *
     * Low-end pass: unlike Scout/Rocketeer/Sniper, Bouncers are rendered
     * individually (not batched), each costing its own shadow-blur pass —
     * and they persist on screen indefinitely rather than exiting, so that
     * cost is sustained, not momentary. Splitter compounds this further:
     * its shield ring is a second blur pass per frame, and on death it adds
     * 3 fragment Bouncers (each with their own pass) at once. glowBlur,
     * hitGlowBlur, and the shield blurs are trimmed accordingly, audio
     * volume matches Drifter's low-end value, and sparksPerEmit is reduced
     * for the same simultaneous-kill-burst reason as Diver/Weaver.
     */
    bouncer: Object.freeze({
      health:     3,
      healthPerLevel: 1,    // +1 health per level beyond 1 — applies to core, splitter, and shielded core alike
      color:      '#FFB020',   // amber — same family as Rocketeer/Drifter #1
      lineWidth:  2,
      glowBlur:   5,
      hitGlowBlur: 12,

      radius:    20,    // vp — both collision radius and hull size
      sides:     6,     // hexagon
      gravity:   300,   // vp/sec^2
      speedMin:  80,    // vp/sec — initial horizontal speed range
      speedMax:  160,
      spinFactor: 0.04, // rad/sec of spin per vp/sec of horizontal speed

      flashDuration: 0.08, // seconds — white hit-flash overlay

      barrierDamage: 5, // Barrier.health lost per bounce off the barrier

      healthFont:  '400 16px "Audiowide", "Courier New", monospace',
      healthColor: '#ffffff',

      audio: Object.freeze({
        src: 'assets/audio/explosion.mp3', volume: 0.3, poolSize: 4,
      }),
      sparksPerEmit: 10,
      points: 150,  // reward on kill — persistent, doesn't naturally leave, must be fully destroyed
      gold:   8,

      splitter: Object.freeze({
        radius: 40,   // vp — ~2x the base hull size
        health: 12,   // ~4x base health

        fragmentCount:    3,
        fragmentRadius:   12,  // vp — smaller than the base Bouncer (20)
        fragmentHealth:   1,
        fragmentSpeedMax: 200, // vp/sec — horizontal fan-out speed (vy is solved per-fragment, see spawnFragments)

        points: 400,  // reward on kill — tanky (12 HP); each spawned fragment scores separately too
        gold:   20,
        fragmentPoints: 30,  // reward on kill — low-value, spawned incidentally
        fragmentGold:   2,
      }),

      shielded: Object.freeze({
        shieldRadius:     32,        // vp — outer ring radius (core uses the base `radius` above)
        shieldHits:       2,         // bullet hits absorbed before the core starts taking damage
        shieldColor:      '#6FE0FF', // ice-blue — visually distinct from the amber core
        shieldGlowBlur:     5,
        shieldHitGlowBlur: 12,

        points: 300,  // reward on kill — shield adds effective HP before the core can be hurt
        gold:   15,
      }),
    }),
  }),

  /**
   * Enemy bullet pool — aimed, straight-line capsules fired by Scouts.
   */
  enemyBullet: Object.freeze({
    speed:     420,
    color:     '#ff3ec9',    // matches Scout hull
    lineWidth: 4,
    halfLen:   5,
    glowBlur:  8,
    poolSize:  32,
  }),

  /**
   * Sniper laser beam — an instant full-screen flash fired by the Sniper.
   * Rendered as a single glowing line segment that fades out in flashDuration
   * seconds. No projectile travels; the hit is instantaneous (future milestone).
   */
  laser: Object.freeze({
    color:         '#BF5FFF',   // matches Sniper hull
    lineWidth:     3,
    glowBlur:      12,          // 20→12: blur cost ∝ radius², ~64% cheaper, still reads as a hot beam
    flashDuration: 0.20,        // seconds the beam remains visible
    beamLength:    1200,        // vp — drawn well past any edge so the beam always reaches off-screen
  }),

  /**
   * Homing rocket pool — fired by Rocketeers. Rockets continuously
   * steer toward the player after launch and detonate either when
   * they get close enough (proximity) or when their fuel runs out (timer).
   */
  rocket: Object.freeze({
    speed:           190,          // vp/sec — slow and relentless
    turnRate:        2.2,          // radians/sec — how fast it steers (≈126°/s)
    maxLife:         4.5,          // seconds before self-destruct
    proximityRadius: 38,           // vp — detonate when this close to player
    fadeStart:       3.5,          // seconds — alpha begins fading toward self-destruct
    color:           '#FFB020',    // matches Rocketeer hull
    lineWidth:       2.5,
    halfLen:         13,
    glowBlur:        10,
    poolSize:        16,
  }),

  /**
   * Enemy-death explosion effect (see entities/Particles.js): two
   * concentric shockwave rings plus a radial spark burst. One `Particles`
   * pool exists per enemy family/variant so each can tune its own
   * `sparksPerEmit` (denser formations use fewer sparks per kill to keep
   * the shared shadow-blur pass cheap).
   */
  particles: Object.freeze({
    maxSparks: 256,             // spark pool size — well above any expected burst count
    sparkHalfLength: 3,         // half-length of each spark line, virtual px
    sparkSpeedMin: 140,
    sparkSpeedMax: 380,         // vp/sec — actual speed is randomized in this range
    sparkLifeMin: 0.18,
    sparkLifeMax: 0.36,         // seconds — actual life is randomized in this range
    sparkDrag: 5,                // per-second drag coefficient applied to spark velocity
    defaultSparksPerEmit: 14,
    innerRing: Object.freeze({ life: 0.28, startR: 6,  maxR: 38 }), // tight, fast — the impact "pop"
    outerRing: Object.freeze({ life: 0.52, startR: 10, maxR: 72 }), // wide, slower — the traveling shockwave
  }),

  /**
   * Wave / level definitions. `type` maps to a key in `Config.enemy`.
   * WaveManager caps the index at the last entry — levels beyond the
   * array repeat the final wave indefinitely.
   *
   * Each level's group sequence is governed by `simultaneous`:
   *   true  — groups can overlap; the next group starts spawning on its
   *           own timer regardless of what's still on screen.
   *   false — only one enemy type is ever active at a time in this level.
   *           The next group won't start spawning until every enemy from
   *           the previous group has been cleared.
   * A level that omits `simultaneous` falls back to the top-level
   * `waves.simultaneous` default below, then to `true`.
   */
  waves: Object.freeze({
    simultaneous: true,
    levels: Object.freeze([
      // Level 1 — scout and rocketeer
      Object.freeze({ enemies: Object.freeze([
        Object.freeze({ type: 'diver', count: 2, spawnInterval: 3 }),
        Object.freeze({ type: 'rocketeer', count: 2, spawnInterval: 3 }),
        Object.freeze({ type: 'scout', count: 3, spawnInterval: 3 }),
        Object.freeze({ type: 'rocketeer', count: 3, spawnInterval: 3 })
      ]) }),
      // Level 2 - diver, scout, and rocketeer mix
      Object.freeze({ enemies: Object.freeze([
        Object.freeze({ type: 'diver', count: 2, spawnInterval: 5 }),
        Object.freeze({ type: 'scout', count: 3, spawnInterval: 2.5 }),
        Object.freeze({ type: 'diver', count: 1, spawnInterval: 5 }),
        Object.freeze({ type: 'rocketeer', count: 3, spawnInterval: 2.5 })
      ]) }),
      // Level 3 — sniper, scout and drifter mix
      Object.freeze({ enemies: Object.freeze([
        Object.freeze({ type: 'sniper', count: 3, spawnInterval: 3 }),
        Object.freeze({ type: 'drifter', count: 3, spawnInterval: 3.5 }),
        Object.freeze({ type: 'scout', count: 2, spawnInterval: 2.5 }),
        Object.freeze({ type: 'sniper', count: 3, spawnInterval: 3 })
      ]) }),
      // Level 4 — scout, rocketeer,drifter and sweeper mix
      Object.freeze({ simultaneous: false, enemies: Object.freeze([
        Object.freeze({ type: 'drifter', count: 2, spawnInterval: 5 }),
        Object.freeze({ type: 'rocketeer', count: 3, spawnInterval: 2.8 }),
        Object.freeze({ type: 'sweeper', count: 2, spawnInterval: 6 }),
        Object.freeze({ type: 'scout', count: 3, spawnInterval: 2.8 }),
        Object.freeze({ type: 'rocketeer', count: 3, spawnInterval: 2.8 })
      ]) }),
      // Level 5 — sniper, scout and diver mix
       Object.freeze({ simultaneous: false, enemies: Object.freeze([
        Object.freeze({ type: 'sniper', count: 3, spawnInterval: 2.8 }),
        Object.freeze({ type: 'scout', count: 3, spawnInterval: 2.8 }),
        Object.freeze({ type: 'diver', count: 3, spawnInterval: 5 }),
        Object.freeze({ type: 'sniper', count: 3, spawnInterval: 2.8 }),
        Object.freeze({ type: 'diver', count: 3, spawnInterval: 5 })
      ]) }),
    ]),
  }),

  /**
   * Background music. A single looping theme track, started the moment
   * the player swipes past the intro prompt.
   */
  audio: Object.freeze({
    themeSrc: 'assets/audio/bg-music.mp3',
    themeVolume: 0.22, // BGM bed — lower than SFX so bullets and explosions always sit clearly on top
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

    // Permanent power (player bullet damage) readout, offset toward the
    // dome's left side — same font sizes/glow as the health readout.
    powerXRatio: 0.22, // fraction of virtual width — x position of the power readout
    powerColor: '#4DEFFF',

    // Impact ripple — a damped spring deformation applied to the arc near
    // an impact point (e.g. BouncerEnemy bouncing off the dome), so the
    // shield visibly flexes inward then springs back rather than the hit
    // being purely numeric. See Barrier.pulse()/_deformAt().
    pulse: Object.freeze({
      amplitude: 16,  // virtual px — peak inward dent depth at the impact point
      width:     100, // virtual px — spatial falloff radius around the impact x
      duration:  0.4, // seconds — ripple fully settles after this long
      frequency: 24,  // rad/sec — spring oscillation speed
      damping:   10,  // exponential decay rate of the oscillation
    }),
  }),

  /**
   * Gameplay HUD: score (top-left) and gold (top-right) displayed as
   * compact neon panels. Same sci-fi design language as the title screen —
   * L-bracket corner accent, dim label, bright neon value with glow. The
   * score panel also carries a small "BEST" line — the all-time high score,
   * persisted via core/Storage.js.
   */
  hud: Object.freeze({
    margin: 20,          // virtual px from screen edges to the panel anchor corner
    labelFont: '400 10px "Audiowide", "Courier New", monospace',
    labelColor: '#aab4d4',
    valueFont: '400 20px "Audiowide", "Courier New", monospace',
    valueColor: '#4DEFFF',
    valueGlowBlur: 6,    // reduced from 8 — 44% cheaper shadow pass (blur cost ∝ radius²)
    bestFont: '400 11px "Audiowide", "Courier New", monospace',
    chromeColor: '#4DEFFF',
    chromeLineWidth: 1,
    chromeGlowBlur: 4,   // reduced from 5
    bracketSize: 12,     // leg length (virtual px) of the L-bracket corner accent
  }),

  /**
   * Enemy Codex — an in-gameplay reference button (see entities/EnemyCodex.js)
   * that pauses the game and pages through one card per enemy type, each
   * showing a re-drawn vector thumbnail of its actual hull, a short
   * description, and its stats. Same sci-fi chrome language as the rest of
   * the game's UI (HUD, title screen, tutorial).
   */
  codex: Object.freeze({
    button: Object.freeze({
      x: 270, y: 34, radius: 16, // virtual px — the empty top-center gap between the HUD's score/gold panels
      color: '#4DEFFF',
      lineWidth: 1.5,
      glowBlur: 6,
      font: '400 16px "Audiowide", "Courier New", monospace',
      pulseSpeed: 2.0, // rad/sec — same breathing shape as the title screen's PLAY button
      pulseDepth: 0.3,
    }),
    overlay: Object.freeze({
      dimAlpha: 0.85, // how dark the frozen gameplay frame behind the card reads
      fadeInDuration: 0.2, // seconds — card content eases in on open/page-change rather than popping

      // Layout is grouped by proximity, not evenly spread — tight gaps
      // within a related group (name+tag, the header pair), larger gaps
      // between groups (header / picture frame / identity / description /
      // stat), and deliberate breathing room at the bottom for thumb reach.
      titleFont:  '400 16px "Audiowide", "Courier New", monospace',
      titleColor: '#4DEFFF',
      titleY: 56,

      progressFont:  '400 12px "Audiowide", "Courier New", monospace',
      progressColor: '#aab4d4',
      progressY: 86,

      // Enemies are drawn at their real in-game size (see EnemyCodex —
      // it renders actual entity instances, not a re-derived approximation),
      // so this "display case" frame is sized to comfortably fit the
      // largest entry (Splitter, 80vp across) with padding; smaller entries
      // just sit smaller within the same consistent frame.
      frameY: 250,
      frameHalfWidth: 100,
      frameHalfHeight: 90,
      frameLegSize: 16,
      frameColor: '#4DEFFF',
      frameLineWidth: 1,
      frameGlowBlur: 4,

      nameFont:  '400 24px "Audiowide", "Courier New", monospace',
      nameGlowBlur: 8,
      nameY: 372,

      tagFont:  '400 13px "Audiowide", "Courier New", monospace',
      tagColor: '#aab4d4',
      tagY: 402,

      descFont: '400 15px "Courier New", monospace',
      descColor: '#e8ecff',
      descY: 452,
      descLineHeight: 24,
      descMaxWidth: 420,

      statFont:  '400 14px "Audiowide", "Courier New", monospace',
      statColor: '#4DEFFF',
      statY: 548,
      rewardFont:  '400 12px "Audiowide", "Courier New", monospace',
      rewardColor: '#aab4d4',
      rewardY: 578,

      arrowColor: '#4DEFFF',
      arrowGlowBlur: 6,
      arrowY: 250,           // aligned with the frame
      arrowMarginX: 40,      // vp from each screen edge
      arrowHalfSize: 22,     // vp — half-width/height of the tappable arrow hit-box

      footerFont:  '400 11px "Audiowide", "Courier New", monospace',
      footerColor: '#aab4d4',
      footerY: 780,
      footerText: 'TAP ARROWS TO BROWSE · TAP ? TO CLOSE',
    }),
  }),

  /**
   * Tutorial overlay. Plays once between the title screen and the first
   * gameplay session — the full gameplay backdrop (starfield, barrier, HUD)
   * is visible behind a dim overlay so every hint arrow points at the real
   * UI element it describes.
   */
  tutorial: Object.freeze({
    fadeInDuration: 0.5,   // seconds — backdrop fades in from black (covers handoff from PrologueScene's fade-out)
    hintStartDelay: 1.4,   // seconds before the first hint appears: fade-in (0.5s) + breathing room (0.9s)
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
      // Fires at 8/sec — slightly louder than the prologue blip since tutorial
      // blips are paced more deliberately and each one marks a word landing.
      volume: 0.08,
      perSecond: 8,
    }),
  }),
});
