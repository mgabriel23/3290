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
	 * Rendering performance limits — see Renderer.resize()/Renderer._glow().
	 *
	 * `maxDevicePixelRatio` caps how much `window.devicePixelRatio` is
	 * allowed to inflate the canvas BACKING STORE beyond its CSS size. Left
	 * uncapped, every per-frame draw call's cost (fillRect clears, drawImage
	 * blits, and above all shadowBlur — already documented throughout this
	 * codebase as the single most expensive Canvas 2D operation) scales with
	 * the backing store's pixel COUNT, which scales with dpr². A phone with a
	 * 3–4x-density display was therefore doing 2–4x the raw fill work of one
	 * at 2x for an IDENTICAL on-screen size — the counterintuitive "nicer
	 * phone runs it worse" result this value originally fixed.
	 *
	 * 1.5 (down from an initial 2): 2x/Retina is the single most common tier
	 * across BOTH iOS and Android (e.g. iPhone 11's 828×1792 @2x panel), so a
	 * cap AT 2 gave that entire tier zero benefit — it was never above the
	 * threshold. 1.5 actually engages for it: (2/1.5)² ≈ 1.8x fewer backing-
	 * store pixels, on top of whichever additional cut `glowScale` below
	 * buys on the same device. Still comfortably sharper than 1x (no cap at
	 * all); a standard 1x desktop monitor remains completely unaffected.
	 *
	 * `glowScale` — global multiplier applied to every `glowBlur` value at
	 * the moment it reaches the canvas (see Renderer._glow) — every entity's
	 * own Config still authors its "real" glow radius (e.g. `glowBlur: 14`),
	 * and this scales it down uniformly at the one seam that actually calls
	 * `ctx.shadowBlur`, rather than that number being touched everywhere
	 * it's authored throughout Config.
	 *
	 * Exists because Canvas 2D's shadow-blur is disproportionately expensive
	 * on WebKit specifically — every browser on iOS (Safari, Chrome, Firefox,
	 * anything) is required by Apple to run on WebKit under the hood, so
	 * "still laggy in both Safari and Chrome" on the same iPhone is exactly
	 * what a WebKit-rooted cost looks like, not a per-browser one. This is a
	 * per-pixel blur-KERNEL cost, distinct from (and multiplicative with) the
	 * resolution cost `maxDevicePixelRatio` addresses. Since blur cost scales
	 * with radius², 0.45 (down from an initial 0.6, which wasn't enough on
	 * an iPhone 11) is a ~80% cost cut from the originally-authored radii for
	 * a tighter — not gone — glow. Both values apply uniformly to every
	 * platform rather than branching on browser/OS (no reliable,
	 * future-proof way to detect "is this device slow" at runtime); desktop
	 * and already-smooth Android devices simply get a bonus rather than
	 * needing it.
	 */
	performance: Object.freeze({
		maxDevicePixelRatio: 1.5,
		glowScale: 0.45,
	}),

	/**
	 * Background starfield: small squares drifting downward to suggest
	 * forward motion through space, organised into discrete parallax
	 * layers (back to front) — each layer is baked once to an off-screen
	 * tile and blitted thereafter, so per-frame cost stays flat regardless
	 * of star count (see GameplayScene._bakeTile).
	 */
	starfield: Object.freeze({
		color: "#aab4d4",
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
		color: "#4DEFFF", // electric-cyan neon outline
		lineWidth: 2.5, // virtual px (kept visually constant regardless of `scale`)
		glowBlur: 14, // shadow-blur radius behind the stroke (the "neon" halo)
		scale: 0.5, // shrinks the authored ~64x80 silhouette down to a small ship
		width: 64, // authored bounding width, virtual px (pre-`scale`)
		height: 80, // authored bounding height, virtual px (pre-`scale`) — used to place it off-screen
		restingYRatio: 0.78, // resting position as a fraction down the virtual height
		entryDuration: 1.4, // seconds for the ease-out fly-up entrance

		damage: 1, // health points removed from an enemy per bullet hit, at level 1
		damagePerLevel: 0.25, // added to `damage` for each level beyond 1 (level 4 → 1 + 3*0.25 = 1.75)

		maxHealth: 100, // player HP — see Player.js's takeDamage and HUD's health bar
		hitRadius: 18, // vp — collision circle for enemy attacks vs the player (ship is ~32vp wide at scale 0.5)
		invulnDuration: 0.6, // seconds of grace after taking a hit — stops one attack (e.g. a laser sweep) re-hitting across several consecutive frames
		hitFlashDuration: 0.15, // seconds the hull flashes white on a hit — matches Config.enemy.hitFlashDuration

		/**
		 * Below `threshold`, the hull switches to a pulsing warning red —
		 * identical shape/formula to Barrier's own low-health pulse (see
		 * Config.barrier.lowHealth and Barrier._isLowHealth/_lowHealthPulseAlpha)
		 * so both cues read as the same warning language. HUD's health bar
		 * reads this same config for its own low-health color.
		 */
		lowHealth: Object.freeze({
			threshold: 25,
			color: "#ff3b3b",
			pulseSpeed: 4.0,
			pulseDepth: 0.5,

			// Short danger blip while health stays at/below threshold — plays
			// immediately on crossing into danger, then every `warningInterval`
			// seconds, capped at `warningMaxRepeats` total plays per danger
			// episode (not indefinitely — a nag that never stops is worse than
			// no warning at all). Recovering above the threshold and dropping
			// low again resets the count, so a fresh emergency always gets its
			// own full set of blips. Player.js stops ticking this the instant
			// GameplayScene freezes for game over, so it can't ring past death.
			warningAudioSrc: "assets/audio/warning.mp3",
			warningVolume: 0.5,
			warningInterval: 1.8,
			warningMaxRepeats: 3,
		}),

		/** The engine flame: a small pulsing neon triangle beneath the ship. */
		flame: Object.freeze({
			color: "#FF8A3D", // warm neon orange — contrasts with the cyan hull
			lineWidth: 2,
			glowBlur: 16,
			baseLength: 20, // virtual px, resting flame length
			flickerAmplitudes: Object.freeze([8, 4]), // two summed sine waves = an organic flicker
			flickerSpeeds: Object.freeze([9, 21]), // radians / second
		}),
	}),

	/**
	 * Level / wave system. Each level begins with a full-screen indicator —
	 * a large cyan "LEVEL N" that fades in, holds with an unstable flicker,
	 * then fades out before gameplay (enemies, bullets) is unblocked.
	 * LocalStorage progress persistence is deferred — see project notes.
	 */
	level: Object.freeze({
		introDuration: 2.8, // total seconds the indicator occupies the screen
		fadeInDuration: 0.35, // initial fade-in phase
		fadeOutDuration: 0.55, // closing fade-out phase
		// Large enough to dominate the screen; Audiowide at 72 vp ≈ 360 px wide for "LEVEL 1" — fits within 540
		font: '400 72px "Audiowide", "Courier New", monospace',
		color: "#4DEFFF",
		glowBlur: 16, // wider halo than normal UI — makes the text feel heavy and threatening; kept at 16 (47% cheaper than 22 per blur cost ∝ radius²)
		// Plays once each time a "LEVEL N" indicator appears — see
		// GameplayScene's constructor (level 1) and its wave-cleared
		// transition (every level after that).
		audioSrc: "assets/audio/level.m4a",
		audioVolume: 0.6,

		// Gameplay bg-music ducking while the indicator (and its sound) is on
		// screen, so the level sound reads clearly over the music instead of
		// fighting it — see GameplayScene._updateMusicDuck. `duckFactor` is a
		// multiplier on Config.audio.themeVolume, not an absolute volume.
		// Attack (duck in) and release (duck out) use different rates on
		// purpose: the release is deliberately much faster than the attack —
		// the music should snap back close to instantly the moment the
		// indicator hides, not linger ducked or fade back up slowly.
		duckFactor: 0.35,
		duckInRate: 8, // 1/sec convergence rate — see GameplayScene._updateCameraFollow's doc for what this shape means
		duckOutRate: 14,
	}),

	/**
	 * Game over — a full-screen overlay GameplayScene shows once the
	 * player's health reaches 0 (see GameplayScene's `_isGameOver`).
	 * The ship explodes first (particle burst + explosion SFX, same
	 * Particles pool shape every enemy death already uses, at the player's
	 * last position — see GameplayScene._triggerGameOver) and is hidden;
	 * only once `explosionDelay` has passed does the dim overlay + title
	 * begin their fade-in — `render()`'s `_renderGameOver` reads
	 * `Math.max(0, _gameOverAge - explosionDelay)` as the fade clock, so the
	 * explosion gets a clear beat to read before "GAME OVER" appears. Same
	 * clean fade-in text treatment as `level` above once it starts (no
	 * flicker — this is somber, not an alarm), plus a smaller restart
	 * prompt beneath. Freezes gameplay exactly like the codex/pause
	 * overlays already do; a tap restarts via a brand-new GameplayScene
	 * (see Game.js's `onGameOver` wiring) rather than resetting state in place.
	 */
	gameOver: Object.freeze({
		explosionDelay: 0.5, // seconds the death explosion plays before the overlay starts fading in
		fadeInDuration: 0.6,
		dimAlpha: 0.75, // darkens the frozen gameplay frame behind the text, same idea as codex.overlay.dimAlpha
		// Covers explosionDelay + fadeInDuration (1.1s) with a small margin, so
		// a tap can't restart before GAME OVER has even finished appearing.
		minRestartDelay: 1.2,
		titleText: "GAME OVER",
		titleFont: '400 56px "Audiowide", "Courier New", monospace',
		titleColor: "#ff3b3b", // matches Config.player.lowHealth.color — this is the ultimate low-health state
		titleGlowBlur: 16,
		promptText: "TAP TO RESTART",
		promptFont: '400 18px "Audiowide", "Courier New", monospace',
		promptColor: "#aab4d4",
		promptOffsetY: 60, // vp below the title

		// Death explosion — reuses the same shared explosion.mp3 every enemy
		// death already plays, just louder/bigger: this is the single most
		// significant explosion in the game.
		explosionColor: "#4DEFFF", // matches Config.player.color
		explosionSparksPerEmit: 28, // above Config.particles.defaultSparksPerEmit (14) — a bigger, one-off burst
		explosionAudioSrc: "assets/audio/explosion.mp3",
		explosionVolume: 0.7,
		deathTrauma: 0.6, // screen-shake trauma for the death explosion itself — stronger than Config.screenShake.playerHitTrauma's ordinary hit

		// A separate "game over" stinger, distinct from the explosion SFX
		// above — both play together the instant death triggers (see
		// GameplayScene._triggerGameOver). The gameplay bg music is stopped
		// (paused, not just ducked) at that same moment — see Game.js's
		// onMusicStop wiring — and resumes on restart.
		audioSrc: "assets/audio/gameover.mp3",
		audioVolume: 0.7,
	}),

	/**
	 * Camera shake — a small "trauma" accumulator (see core/ScreenShake.js):
	 * each trigger adds trauma (clamped at 1), which decays linearly over
	 * time while the actual offset is trauma SQUARED × maxOffset, so it
	 * snaps hard on impact and tails off quickly rather than swaying evenly.
	 * GameplayScene owns one instance and applies its offset only to the
	 * "world" layer (starfield/barrier/player/bullets/enemies) — never to
	 * the HUD/codex/playback UI layer, so buttons never visually drift from
	 * their tap hit-boxes.
	 */
	screenShake: Object.freeze({
		decayPerSecond: 2.5, // trauma drains this fast — a single kill's shake fully settles in well under 100ms
		maxOffset: 8, // virtual px — camera offset at full (1.0) trauma
		killTrauma: 0.18, // added per enemy kill — a burst of rapid kills stacks up further (capped at 1)
		barrierTrauma: 0.28, // added per barrier impact — stronger than a kill; it's your defense taking a hit
		playerHitTrauma: 0.35, // added when the player takes damage — the strongest shake in the game; it's the thing you're trying not to let happen
	}),

	/**
	 * Hit-stop: a very brief freeze of gameplay time on a kill — the classic
	 * "punch" cheat that sells impact without any new animation work. Only
	 * the gameplay sub-systems (barrier/player/bullets/wave) are frozen —
	 * see GameplayScene.update's `effectiveDt` — cosmetic-only systems
	 * (starfield, screen-shake decay, the freeze timer itself) keep using
	 * real dt so the freeze actually expires and the backdrop never visibly
	 * stutters.
	 */
	hitStop: Object.freeze({
		killDuration: 0.05, // seconds — short enough to read as a punch, not lag, even on back-to-back kills
		playerHitDuration: 0.08, // seconds — slightly longer than a kill's; sells the weight of taking a hit yourself
	}),

	/**
	 * Player bullets: auto-fired as a continuous stream once the player's
	 * ship has landed, rendered as short glowing capsule strokes in the same
	 * neon-cyan as the hull so they read as energy bolts rather than solid
	 * projectiles. All active bullets are batched into a single strokePaths
	 * call each frame — one shadow-blur GPU pass regardless of bullet count.
	 */
	bullet: Object.freeze({
		color: "#4DEFFF", // matches player hull
		lineWidth: 5, // virtual px — thick enough to look solid
		halfLen: 6, // virtual px — segment half-length; with round caps total visual height ≈ 17px
		glowBlur: 8, // reduced from 12 — blur cost ∝ radius², so 8 vs 12 is ~56% cheaper; singleStroke batching means this runs once regardless of bullet count
		speed: 1500, // virtual px/sec, upward
		fireRate: 9, // shots per second — fast mid rate
		spawnOffsetY: -14, // virtual px above player.y — places spawn near the nose tip

		audio: Object.freeze({
			src: "assets/audio/bullet-shoot.mp3",
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
		text: "SWIPE UP TO CONTINUE",
		// Audiowide ships in a single (regular) weight — requesting 700 would
		// just trigger faux-bold synthesis, so weight is left at its natural 400.
		font: '400 24px "Audiowide", "Courier New", monospace',
		textColor: "#aab4d4",
		bottomMargin: 100, // virtual px from the bottom edge to the label's position
		swipeThresholdPx: 48, // CSS px of upward drag that counts as "swipe up"

		/** A small bobbing chevron above the label, hinting at the swipe direction. */
		arrow: Object.freeze({
			color: "#aab4d4",
			lineWidth: 2.5,
			glowBlur: 10,
			offsetAboveText: 38, // virtual px between the label's baseline and the arrow
			bobAmplitude: 6, // virtual px of vertical travel
			bobSpeed: 3, // radians / second
		}),

		/**
		 * The "typewriter" fade-out: once the player swipes, each letter of
		 * the label fades to transparent in sequence (first letter first),
		 * each starting `staggerDelay` seconds after the previous one. Only
		 * once the last letter has fully faded does `onContinue` fire.
		 */
		exit: Object.freeze({
			staggerDelay: 0.05, // seconds between each letter's fade-out start
			fadeDuration: 0.2, // seconds for a single letter to fade to transparent
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
		 * a clean title card. Once the year finishes typing, a quiet second
		 * line fades in beneath it (reusing the same flicker alpha — no new
		 * fade state, see _renderYearCard) — the subtitle itself is the turn
		 * (silence, then "it just ended"), so the very next beat (the portals
		 * tearing open) reads as the thing that was just promised rather than
		 * a surprise. A "three hundred years" motif the briefing beat echoes
		 * back later.
		 */
		yearCard: Object.freeze({
			text: "EARTH — YEAR 3290",
			font: '400 28px "Audiowide", "Courier New", monospace',
			// Matches Config.prologue.title.textColor — the "header" line of the
			// cinematic reads in the same neon cyan as the title card's "3290"
			// later on, tying the two together visually. Color only, deliberately
			// no glow here (unlike the title card) — this stays a smaller, calmer
			// beat, not a second title moment.
			textColor: "#4DEFFF",
			charsPerSecond: 12, // letter by letter — slower than the briefing for dramatic weight
			holdDuration: 2.8, // seconds the finished year card lingers before the next beat starts — a little extra room for the subtitle to be read
			fadeOutDuration: 0.8,
			subtitleText: "THREE HUNDRED YEARS OF SILENCE. IT JUST ENDED.",
			subtitleFont: '400 13px "Audiowide", "Courier New", monospace',
			subtitleColor: "#6f7a99", // dimmer than the headline — a hushed aside, not a second title
			subtitleOffsetY: 40, // virtual px below the main line
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
			color: "#9D7BFF",
			lineWidth: 2,
			glowBlur: 14, // reduced from 22 — blur cost scales roughly with area (radius²), so 14 vs 22 is ~60% cheaper per pass; still visibly glowing
			appearDuration: 1.6, // seconds for one portal's grow-and-fade-in (also syncs the sky's own reveal — see PrologueScene._renderPortals)
			staggerDelay: 1.2, // seconds between each portal starting its own appear animation
			holdDuration: 1.8, // seconds all three linger after the last one finishes appearing

			/** The swirling vortex body: one spiral-arm shape, baked once and re-stroked at evenly fanned rotations — see Portal._renderArms. */
			spiral: Object.freeze({
				armCount: 4,
				innerRadius: 8, // virtual px — where each arm starts, near the core
				outerRadius: 50, // virtual px — how far each arm reaches outward
				turns: 1.4, // revolutions an arm sweeps through end to end — higher reads as "tighter"
				segments: 28, // polyline resolution along the curve — higher = smoother
				rotationSpeed: 1.2, // radians/second — the whole swirl's spin
			}),

			/** A small faceted "event horizon" at the very center, counter-spinning against the arms for a layered, alien feel. */
			core: Object.freeze({ sides: 6, radius: 10, rotationSpeed: -2.4 }),

			// Spread across the upper half — virtual-ratio coordinates — the
			// briefing text anchors near the bottom edge and stays legible over
			// any drifting sample enemy because it's drawn AFTER them, not
			// because the two occupy separate screen regions — see `creatures`
			// below and PrologueScene._renderBriefing's draw order.
			positions: Object.freeze([
				Object.freeze({ xRatio: 0.24, yRatio: 0.13 }),
				Object.freeze({ xRatio: 0.8, yRatio: 0.26 }),
			]),

			/**
			 * A stream of sample enemies emerges from each portal once its own
			 * tear-open animation finishes — real DrifterEnemy instances, one of
			 * its four variants (never a re-derived approximation, same
			 * principle as EnemyCodex), giving physical proof to the briefing's
			 * "things are already coming through them" instead of leaving the
			 * portals empty. Each spawn independently rolls a random variant
			 * from `species` — a portal isn't "the Weaver portal" forever, every
			 * tear can produce any of the four. Each one fades in on spawn, then
			 * drifts slowly toward (and eventually off) the bottom of the
			 * screen — see PrologueScene._spawnCreature/_updateCreatures. Their
			 * real update() (which would fly them off along their own formation
			 * path) is deliberately never called — only `_age` advances, which
			 * is all their idle tentacle-wave/eye-pulse animation needs — and
			 * their angle is fixed facing straight down (toward the direction
			 * they're drifting, not away from it).
			 */
			creatures: Object.freeze({
				species: Object.freeze([
					"drifter",
					"sweeper",
					"diver",
					"weaver",
				]), // the pool each spawn independently rolls a random pick from
				spawnInterval: 7.0, // seconds between spawns from the same portal — kept slow/sparse, not a swarm
				maxSpawnsPerPortal: 3, // total creatures one portal produces over the cinematic
				fadeInDuration: 0.6, // seconds for a freshly spawned creature to reach full opacity
				driftSpeed: 35, // virtual px/second, straight down — "slowly moving out of the screen"
				offscreenMarginY: 60, // virtual px past the bottom edge before a drifting creature is culled
			}),
		}),

		/**
		 * Beat 3: the commander's voice cuts in over comms — a typewriter-
		 * revealed briefing, staged centered near the bottom edge, while the
		 * portals and their sample enemies keep churning above (PrologueScene
		 * keeps everything alive and on screen through this beat — see
		 * _renderBriefing). The text is legible over them because of DRAW
		 * ORDER, not screen position: `_renderBriefing`/`_renderFadeOut` call
		 * `_renderCreatures()` before `_renderBriefingText()`, so the text is
		 * always painted on top, even if a drifting creature passes behind it.
		 * No per-beat skip lives here — the scene-level SKIP control (see
		 * `skip` below) covers every beat before the title card uniformly,
		 * rather than each beat inventing its own.
		 *
		 * Written to lean into dread rather than read as a clean tactical
		 * status report — matches the scarier background track this beat now
		 * plays over (Config.audio.prologueThemeVolume): the enemy stays
		 * unnamed and unexplained (worse than a labeled threat), a nearby
		 * sector's last transmission cuts from screaming to silence, and
		 * the transmission itself just trails off unresolved rather than
		 * landing on a comforting final line. "Three hundred quiet years"
		 * echoes the year card's subtitle, and the explicit "find them,
		 * all of them" objective still sets up the actual gameplay loop
		 * directly. The standalone "..." token is now the LAST word
		 * revealed — it exploits the word-by-word reveal to land as a
		 * genuine pause (a beat of silence) that the briefing simply ends
		 * inside of, rather than resolving out of it into a line — no new
		 * timing mechanism needed for any of it.
		 */
		briefing: Object.freeze({
			text:
				"Pilot, do you copy? Something is wrong with the sky. Portals " +
				"— if that's even the word — have torn open across the globe, " +
				"and nothing coming through fights like anything we've faced. " +
				"Three hundred quiet years. We told ourselves that meant " +
				"safe. It didn't. Comms went dark in six sectors within the " +
				"hour. The last thing we heard from Sector Nine was " +
				"screaming. Then nothing. We don't have a name for what's out " +
				"there. Find them. All of them. Nothing that comes through " +
				"reaches the ground. Earth doesn't get a second chance. ...",
			font: '400 20px "Audiowide", "Courier New", monospace',
			textColor: "#aab4d4",
			lineHeight: 32, // virtual px between line baselines
			sideMargin: 56, // virtual px — bounds the wrapped paragraph's width
			bottomMargin: 64, // virtual px from the bottom edge to the newest line's baseline (see PrologueScene._briefingAnchorY) — sits low, beneath the portals
			maxVisibleLines: 4, // the "subtitle window" never shows more than this many lines at once — older ones fall away as new ones reveal (see PrologueScene._renderBriefingText)
			wordsPerSecond: 4.3, // the briefing reveals a whole word at a time, not letter by letter — see PrologueScene._updateBriefing for why that reads (and sounds) more like typing
			holdDuration: 2.4, // seconds the finished briefing stays up before fading out — gives the trailing "..." room to actually read as a pause before the cut to black

			/**
			 * Ticks on its OWN clock — deliberately faster than `wordsPerSecond`
			 * — so the typewriter sounds like a busy teletype clattering away
			 * underneath the calmer, readable pace the words actually pop up
			 * at, rather than one polite blip per word landing in lockstep
			 * with the text (see PrologueScene._advanceBlips). Cloned per-play
			 * so overlapping retriggers layer instead of cutting each other off.
			 */
			blip: Object.freeze({
				src: "assets/audio/typewriter-blip.mp3",
				// Fires at up to 12/sec (year card) and 6/sec (briefing) — kept very low
				// so rapid stacking stays as subtle texture beneath the prologue's
				// own BGM (Config.audio.prologueThemeVolume, 0.15).
				volume: 0.06,
				perSecond: 6,
			}),
		}),

		/** Beat 4: the assembled scene dissolves to black — see Renderer.clear's translucent-overlay technique. */
		fadeOutDuration: 1.2,

		/**
		 * A small always-visible "SKIP" control, shown during every beat
		 * before the title card (yearCard/portals/briefing/fadeOut). Tapping
		 * it jumps straight to the title screen via a quick dissolve (its own
		 * `skipFade` beat — see PrologueScene._renderSkipFade), not an instant
		 * cut, so it doesn't feel like a glitch. The full cinematic (~28s) is
		 * still the default first-time experience; this exists so a player who
		 * has already seen it (or a dev/tester replaying the flow) isn't stuck
		 * sitting through it again before their first tap.
		 */
		skip: Object.freeze({
			label: "SKIP ▶▶",
			// Bigger + more opaque + a touch of glow than the original quiet
			// 13px/0.65-alpha/no-glow treatment — this is a real tappable
			// control, not a passive label, and was easy to miss at the old size.
			font: '400 17px "Audiowide", "Courier New", monospace',
			color: "#aab4d4",
			alpha: 0.85,
			glowBlur: 6,
			marginX: 24, // virtual px from the right edge to the text anchor
			marginY: 28, // virtual px from the top edge to the text anchor
			hitWidth: 116, // generous tap target — wider than the text itself; scaled up alongside the bigger font
			hitHeight: 46,
			fadeOutDuration: 0.5, // seconds for the quick dissolve into the title card once tapped
		}),

		/**
		 * Beat 5: the title card. "3290" is the game's name, deliberately
		 * echoing the year established in the opening beat. PLAY is the
		 * actual control gate — tapping it is what hands off to gameplay
		 * (see PrologueScene.handleTap / Game._startGameplay). The title
		 * glyph itself flickers with the exact same signal-interference
		 * effect (core/animation.js's flickerAlpha) the yearCard beat's own
		 * "EARTH — YEAR 3290" uses — same frequencies/phases/base/depth,
		 * hardcoded inline at both call sites rather than pulled from Config
		 * (matching how GameplayScene's own level-intro flicker does it too —
		 * this effect has never lived in Config, by established convention),
		 * so the number reads as the same unstable transmission both times it
		 * appears in the story.
		 */
		title: Object.freeze({
			text: "3290",
			font: '400 64px "Audiowide", "Courier New", monospace',
			textColor: "#4DEFFF",
			glowBlur: 14, // neon halo on the title glyph — matches all other neon elements; blur cost scales with radius² so 14 vs 20 is ~51% cheaper
			subtitleText: "NO SECOND CHANCE",
			subtitleFont: '400 15px "Audiowide", "Courier New", monospace',
			subtitleColor: "#7af0ff", // softer cyan — reads as a secondary register below the title
			taglineFont: '400 10px "Audiowide", "Courier New", monospace',
			taglineColor: "#aab4d4", // same as other UI text, kept dim via alpha in render
			chromeColor: "#4DEFFF", // decorative HUD lines and bracket ticks
			chromeLineWidth: 1,
			chromeGlowBlur: 6,
			fadeInDuration: 1.0,
			exitFadeDuration: 0.55, // seconds — black veil that falls over the title when PLAY is tapped

			playButton: Object.freeze({
				label: "PLAY",
				font: '400 20px "Audiowide", "Courier New", monospace',
				color: "#4DEFFF",
				lineWidth: 1.5,
				glowBlur: 14,
				width: 168,
				height: 52,
				offsetBelowTitle: 148, // more vertical room for the subtitle + decorative rules below it
				cornerSize: 14, // leg length (virtual px) of each L-bracket corner tick
				pulseSpeed: 2.2, // radians/second — drives the breathing alpha on the button
				pulseDepth: 0.28, // how far the alpha dips at the trough of each breath
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
		 * How every type's `points`/`gold` below were derived — not
		 * independently hand-picked per type. There's currently no way for the
		 * player to take damage anywhere in the game (no player health field,
		 * no enemy-projectile-vs-player collision check exists), so "difficulty"
		 * can't be modeled as danger-to-player — it's modeled as verified
		 * effort-to-kill instead:
		 *
		 *   1. hitsToKill = ceil((health + healthPerLevel×(debutLevel-1)) /
		 *      (player.damage + player.damagePerLevel×(debutLevel-1))) — real
		 *      numbers from this file, evaluated at the level each type first
		 *      appears in Config.waves.levels.
		 *   2. EffortScore = hitsToKill × mobilityMultiplier × engagementMultiplier
		 *        mobility:   1.0 stationary-after-entry (Scout/Rocketeer/Sniper)
		 *                    1.15 smooth path movement (Drifter family)
		 *                    1.3  erratic physics bounce (Bouncer family) —
		 *                         player bullets travel straight up only (see
		 *                         Bullets.js), so a moving target is genuinely
		 *                         harder to stay aligned under
		 *        engagement: 1.15 for Drifter-family types, which fly their
		 *                    path and expire on their own if ignored — a small
		 *                    incentive to actually hunt them instead of just
		 *                    outlasting them. 1.0 (no bonus) for every type
		 *                    that never expires and must be killed regardless.
		 *   3. points = round(EffortScore × 33.33, nearest 10)
		 *      gold   = round(EffortScore × 1.667, nearest 1) — always ~1/20th
		 *      of points, the same ratio for every type, not re-tuned per type.
		 *
		 * Mobility/engagement are the only two design-judgment inputs in this
		 * model, deliberately kept small (±15-30%) so hitsToKill — the fully
		 * objective term — stays dominant. Scout and Rocketeer land equal on
		 * purpose: identical hits-to-kill, identical stationary mobility,
		 * identical mandatory-kill status — the homing rocket has no measurable
		 * extra difficulty today without a player-damage system. Revisit this
		 * whole model if/when the player can actually take damage.
		 *
		 * healthPerLevel note: most types share this file's implicit
		 * convention of one `healthPerLevel` per family, EXCEPT
		 * bouncer.splitter/bouncer.shielded, which each define their OWN
		 * `healthPerLevel` (read by WaveManager._spawnNext, not the base
		 * bouncer's) — see the comment on each. Without that, their relative
		 * tankiness over a plain Bouncer decays toward zero over a long
		 * endless-mode run, since a flat health head-start becomes
		 * proportionally smaller as player damage keeps climbing. Sniper
		 * sidesteps this the same way structurally (its own `healthPerLevel: 2`
		 * is already a dedicated per-type field, not shared with anything).
		 */

		/**
		 * Scout — basic fighter. Enters, parks at a fixed rest position,
		 * fires aimed bullet bursts at the player.
		 */
		scout: Object.freeze({
			size: 22,
			health: 3,
			healthPerLevel: 1, // +1 health per level beyond 1
			color: "#ff3ec9", // magenta
			fillColor: "#1a0a20",
			lineWidth: 1.5,
			glowBlur: 12,
			hitGlowBlur: 22,
			engineCoreColor: "#ff5f00",
			flameColor: "#ff3ec9",
			flameHalfWidth: 3,
			entrySpeed: 320,
			restXMargin: 80,
			restYMin: 0.08,
			restYMax: 0.35,
			aimPause: 0.5,
			// Reload is the cooldown AFTER the whole 3-round burst below, not
			// between each round of it — lengthened by +0.5s from the old
			// single-shot cycle's 2.2s, so Scout's overall attack pace doesn't
			// just get strictly harder now that a "shot" means 3 rounds.
			reloadTime: 2.7,
			burstCount: 3, // fires 3 rounds per cycle instead of 1 — a quick machine-gun-style burst at the same lead-predicted target
			burstInterval: 0.12, // seconds between each round of the burst
			hitRadius: 16,
			minSeparation: 60,
			repositionChance: 0.5, // odds a finished firing cycle sends it to a fresh rest point instead of aiming again in place
			repositionDuration: 0.9, // seconds to ease to the new rest point (core/animation.js's easeOutCubic)
			leadFactor: 1.0, // extrapolates the player's movement during the aim window forward by this much — its bullet is unguided, so leading it matters
			// EffortScore 3.00 (hitsToKill 3, stationary, mandatory) — see the
			// methodology comment above `hitFlashDuration`. Calibration anchor:
			// the scaling constant is chosen so Scout, the very first enemy, lands at 100.
			points: 100,
			gold: 5,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.4,
				poolSize: 4,
			}),
		}),

		/**
		 * Sniper — same hull silhouette, electric violet. High health (8 hits).
		 * Charge sequence: 1.5s warmup (nose orb grows, tracks player) → 0.7s
		 * locked (target locked to the player's position AT THAT MOMENT, !
		 * shown, nose blinking) → fires a real bullet (see `bullet` below)
		 * straight at that locked point → recovers, tracking resumes.
		 * Previously fired an instant laser at a HISTORICAL player position;
		 * now fires a real projectile at the player's CURRENT position, with
		 * its own distinct threat instead — see `bullet`'s own doc.
		 */
		sniper: Object.freeze({
			size: 22,
			health: 8,
			healthPerLevel: 2, // +2 health per level beyond 1 — already tanky, scales faster
			color: "#BF5FFF", // electric violet — reads as energy weapon
			fillColor: "#110022",
			lineWidth: 1.8,
			glowBlur: 12,
			hitGlowBlur: 22,
			engineCoreColor: "#8833CC", // deeper violet for the engine orb
			flameColor: "#BF5FFF",
			flameHalfWidth: 3,
			entrySpeed: 300,
			restXMargin: 80,
			restYMin: 0.08,
			restYMax: 0.35,
			chargeWarmup: 1.0, // seconds of nose charge before ! appears — shortened from 1.5 for a faster fire rate
			warningDuration: 0.7, // seconds ! is shown before the shot fires — kept as-is, this is the fairness/reaction window
			recoverDuration: 0.6, // seconds after firing before player-tracking resumes — shortened from 1.0 for a faster fire rate
			recoverTurnRate: 4, // rad/sec — slow turn back toward the player during recovery
			hitRadius: 24,
			minSeparation: 64,
			// EffortScore 8.00 (hitsToKill 8, stationary, mandatory) — highest
			// hits-to-kill of any single-stage enemy in the roster. See the
			// methodology comment above `hitFlashDuration`.
			points: 270,
			gold: 13,

			// Nose charge-orb visual tuning (see SniperEnemy.renderCore)
			chargeOrbStartRadius: 3, // radius at t=0 while charging
			chargeOrbGrowth: 7, // added radius by full charge (radius = start + growth*t)
			chargeOrbLineWidth: 2,
			chargeOrbGlowBlur: 6,
			chargeOrbAlphaMin: 0.2, // alpha at t=0 while charging (ramps to 1)
			lockedOrbRadius: 10, // full-charge orb size while locked
			lockedOrbLineWidth: 2.5,
			lockedOrbGlowBlur: 8,
			lockedBlinkSpeed: 6, // × π rad/sec — rapid blink signaling imminent fire

			// "!" warning marker visual tuning (see SniperEnemy.renderExtras) —
			// still marks the exact locked firing point, same as before.
			warningRingRadius: 20,
			warningRingLineWidth: 2,
			warningRingAlphaMult: 0.6, // outer ring reads dimmer than the inner dot/label
			warningDotRadius: 4,
			warningDotLineWidth: 3,
			warningDotGlowBlur: 6,
			warningLabelOffset: 32, // vp above the marker
			warningLabelFont: '400 28px "Audiowide", "Courier New", monospace',
			warningLabelGlowBlur: 10,
			warningFadeInSpeed: 6, // × t — how quickly the marker reaches full pulse strength
			warningPulseSpeed: 4, // × π rad/sec — pulse rate once faded in
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.55,
				poolSize: 4,
			}),

			/**
			 * The shot itself, fired once `warningDuration` elapses (see
			 * SniperEnemy.js/SniperBullets.js) — a straight-line (non-homing)
			 * bullet aimed at wherever the player was the instant it locked.
			 * Starts crawling at `startSpeed` for `accelDelay` seconds (the
			 * dodge window a sharp-eyed player can actually use), then rockets
			 * up to `maxSpeed` over `accelDuration` seconds via an ease-IN
			 * curve (core/animation.js's easeInCubic — slow start, sudden brisk
			 * finish, reads as "kicking into gear like a jet") and holds there
			 * until impact or `maxLife` runs out. `halfLenMin/Max` stretch the
			 * bullet's drawn length along with its current speed, so the
			 * crawl-to-jet transition reads visually, not just in the numbers.
			 */
			bullet: Object.freeze({
				startSpeed: 35, // vp/sec — super slow, clearly crawling
				maxSpeed: 900, // vp/sec — bumped again from 700 for an even more dramatic jet kick
				accelDelay: 0.35, // seconds spent at startSpeed before the jet kicks in
				accelDuration: 0.25, // seconds to ramp from startSpeed to maxSpeed — shortened again from 0.3 so the kick lands even snappier
				maxLife: 3.5, // seconds before self-destruct (safety net — it should always long since have hit or left the screen)
				halfLenMin: 4, // vp — drawn half-length while crawling (reads as a small dot)
				halfLenMax: 22, // vp — drawn half-length at full speed (reads as a streaking bolt)
				color: "#BF5FFF", // matches Sniper hull — same "this came from the Sniper" read the old laser had
				lineWidth: 3,
				glowBlur: 10,
				poolSize: 8,
				damage: 25, // matches the old laser's damage — still the hardest single hit in the game, still earns it via a real telegraph (charge + warning + the slow crawl itself)
			}),
		}),

		/**
		 * Rocketeer — same hull silhouette as the Scout, amber coloring.
		 * Fires homing rockets instead of bullets; slower to shoot but
		 * rockets track and detonate on proximity, making them harder to dodge.
		 */
		rocketeer: Object.freeze({
			size: 22,
			health: 2,
			healthPerLevel: 1, // +1 health per level beyond 1
			color: "#FFB020", // amber/gold — warm, distinct from scout magenta
			fillColor: "#1a1000", // very dark amber
			lineWidth: 1.5,
			glowBlur: 12,
			hitGlowBlur: 22,
			engineCoreColor: "#FF6A00", // deeper orange — contrasts with the amber hull
			flameColor: "#FFB020",
			flameHalfWidth: 3,
			entrySpeed: 280,
			restXMargin: 80,
			restYMin: 0.08,
			restYMax: 0.35,
			aimPause: 1.0, // longer lock-on pause before launch
			reloadTime: 3.8, // slow reload — rockets are powerful
			hitRadius: 16,
			minSeparation: 64,
			repositionChance: 0.5, // odds a finished firing cycle sends it to a fresh rest point instead of aiming again in place
			repositionDuration: 0.9, // seconds to ease to the new rest point (core/animation.js's easeOutCubic)
			leadFactor: 0, // no lead — the rocket already homes continuously after launch, so leading the initial heading is redundant
			// Equal to Scout by design — see the EffortScore methodology comment
			// above `hitFlashDuration` near the top of this `enemy` block.
			points: 100,
			gold: 5,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.5,
				poolSize: 4,
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
			health: 3,
			healthPerLevel: 1, // +1 health per level beyond 1 — applies to all varieties (sweeper/diver/weaver share `health`)
			color: "#FFB020", // amber/gold — matches Rocketeer
			fillColor: "#1a1000",
			eyeColor: "#FFE0A0",
			lineWidth: 1.8,
			glowBlur: 8,
			hitGlowBlur: 22,
			tentacleGlowBlur: 6,
			lashGlowBlur: 10,

			// Path-following formation
			formationSize: 8, // clones per formation, conga-line
			spacing: 50, // vp along the path between trailing clones
			speed: 220, // vp/sec along the path
			loopRadius: 70, // loop-the-loop radius
			entryMargin: 60, // vp off-screen at the diagonal entry point
			offscreenMargin: 40, // vp beyond each edge before a clone counts as off-screen (culling + exit checks)
			pathEntryRunMin: 250, // vp — variant #1's straight run before the loop starts
			pathEntryRunMax: 400,
			pathExitRunLength: 900, // vp — variant #1's straight run after the loop, well past the far corner

			// Tentacle animation
			tentacleLen: 20,
			tentacleSegs: 3, // fewer segments = fewer points per stroke and fewer per-frame sin() calls
			tentacleAmp: 6,
			tentacleSpeed: 5,
			tentacleWaveFreq: 3, // per-segment wave-phase multiplier (see DrifterEnemy.render)
			tentaclePhaseSpacing: 1.3, // per-tentacle-index phase offset — desyncs the 4 tentacles' waves
			lashStraightenFactor: 0.7, // how much a lashing tentacle's wave amplitude shrinks as it extends

			// Tentacle-lash projectile attack
			fireMinInterval: 2.5, // seconds idle before the next lash
			fireMaxInterval: 5.0,
			lashDuration: 0.22, // tentacle whips toward the player
			lashLen: 40, // tentacle extension at full lash (2x tentacleLen)
			projectileSpeed: 320, // vp/sec toward the locked target
			projectileRadius: 4,
			projectileDamage: 8, // player HP lost if still within range when the orb arrives — see Config.player.maxHealth
			engageRangeX: 160, // vp — a lash only fires if the player is within this horizontal range of the clone
			engageRetryInterval: 0.3, // seconds before re-checking range after a would-be lash was withheld

			hitRadius: 18,
			// EffortScore 5.29 (hitsToKill 4, path-moving ×1.15, optional-to-
			// engage ×1.15) — identical to Sweeper/Diver/Weaver below, which all
			// share this same base health/healthPerLevel and only differ in
			// path/palette, not actual difficulty. See the methodology comment
			// above `hitFlashDuration`.
			points: 180,
			gold: 9,
			audio: Object.freeze({
				// Lower than Rocketeer/Sniper (0.45) — formations of up to 8 clones
				// can die in close succession, and the shared SFX pool would
				// otherwise stack into a much louder cumulative volume.
				src: "assets/audio/explosion.mp3",
				volume: 0.3,
				poolSize: 4,
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
				color: "#ff3ec9", // magenta — matches Scout
				fillColor: "#1a0a20",
				eyeColor: "#ffd0ee",

				formationSize: 15, // clones per formation, conga-line
				spacing: 50, // vp along the path between trailing clones
				speed: 220, // vp/sec along the path
				margin: 50, // horizontal bounds the row sweeps between
				step: 40, // vertical drop performed at each bounce
				startY: 60, // starting height

				// Slightly longer fire intervals than variety #1 — with up to 15
				// clones on screen at once, firing at the same rate would feel
				// overwhelming.
				fireIntervalMult: 1.4,

				// Smaller glow radii than variety #1 (8/22/6/10) — up to 15 clones
				// can be on screen at once (vs 8), so each shadow-blur pass covers
				// more ground; smaller radii keep per-pass cost down (blur cost ∝
				// radius²) without losing the magenta neon read.
				glowBlur: 6, // body hull glow
				hitGlowBlur: 16, // hit-flash hull glow
				tentacleGlowBlur: 4, // per-clone tentacle glow
				lashGlowBlur: 7, // per-clone lash glow

				audio: Object.freeze({
					// Lower than variety #1's 0.3 — formations of up to 15 clones
					// (vs 8) can die in close succession on the same shared SFX pool.
					src: "assets/audio/explosion.mp3",
					volume: 0.2,
					poolSize: 4,
				}),

				// Fewer sparks per explosion than variety #1's default 14 — up to
				// 15 simultaneous deaths would otherwise flood the spark pool and
				// widen the shared glow pass's bounding box.
				sparksPerEmit: 8,

				// Same EffortScore/hits-to-kill as base Drifter — 15 clones per
				// formation vs 8 means total wave reward scales up proportionately
				// on its own; no separate per-clone discount needed.
				points: 180,
				gold: 9,
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
				color: "#39ff14", // neon green — distinct from amber (#1) and magenta (#2)
				fillColor: "#06190a",
				eyeColor: "#c8ffb0",

				// Fixed [dx, dy] offsets from the wedge's leader (tip), pointing in
				// the direction of travel (down) — a rigid V formation.
				formationSize: 5,
				offsets: Object.freeze([
					Object.freeze([0, 0]),
					Object.freeze([-35, -35]),
					Object.freeze([35, -35]),
					Object.freeze([-70, -70]),
					Object.freeze([70, -70]),
				]),

				spawnY: -70, // leader's y at spawn, vp
				margin: 80, // horizontal spawn-x bounds
				startSpeed: 140, // vp/sec at spawn
				accel: 90, // vp/sec^2 — speeds up as it falls

				fireIntervalMult: 1,

				glowBlur: 8,
				hitGlowBlur: 18,
				tentacleGlowBlur: 5,
				lashGlowBlur: 8,

				audio: Object.freeze({
					src: "assets/audio/explosion.mp3",
					volume: 0.25,
					poolSize: 4,
				}),
				sparksPerEmit: 10,

				// Same EffortScore as base Drifter/Sweeper/Weaver — same hits-to-kill.
				points: 180,
				gold: 9,

				// Diver dives straight down and reaches the barrier if not killed
				// first — a one-shot impact (the clone is destroyed on contact,
				// unlike Bouncer which bounces off and keeps threatening) — see
				// DrifterEnemy.update and WaveManager's onBarrierHit wiring.
				barrierDamage: 10,
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
				color: "#BF5FFF", // electric violet — matches Sniper
				fillColor: "#110022",
				eyeColor: "#e0c0ff",

				formationSize: 6, // clones per formation, conga-line
				spacing: 50, // vp along the path between trailing clones
				speed: 200, // vp/sec along the path
				amplitude: 90, // horizontal sway amplitude, vp
				frequency: 0.012, // radians per vp traveled — wave tightness
				spawnYOffset: -60, // vp — y at path distance 0, above the top edge so clones ease into view

				fireIntervalMult: 1,

				glowBlur: 8,
				hitGlowBlur: 18,
				tentacleGlowBlur: 5,
				lashGlowBlur: 8,

				audio: Object.freeze({
					src: "assets/audio/explosion.mp3",
					volume: 0.25,
					poolSize: 4,
				}),
				sparksPerEmit: 10,

				// Same EffortScore as base Drifter/Sweeper/Diver — same hits-to-kill.
				points: 180,
				gold: 9,

				// Weaver descends all the way down like Diver and reaches the
				// barrier if not killed first — same one-shot-impact treatment,
				// same damage. See DrifterEnemy.update and WaveManager's
				// onBarrierHit wiring.
				barrierDamage: 10,
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
			health: 4,
			healthPerLevel: 1.2, // +1.2 health per level beyond 1 — used by the plain Bouncer (variant 1) and, via the shared `health` fallback above, Shielded's core; Splitter/Shielded scale their OWN healthPerLevel below at 1.5x this rate
			color: "#FFB020", // amber — same family as Rocketeer/Drifter #1
			lineWidth: 2,
			glowBlur: 5,
			hitGlowBlur: 12,

			radius: 20, // vp — both collision radius and hull size
			sides: 6, // hexagon
			gravity: 300, // vp/sec^2
			speedMin: 80, // vp/sec — initial horizontal speed range
			speedMax: 160,
			spinFactor: 0.04, // rad/sec of spin per vp/sec of horizontal speed

			flashDuration: 0.08, // seconds — white hit-flash overlay

			barrierDamage: 5, // Barrier.health lost per bounce off the barrier
			contactDamage: 10, // player HP lost per contact tick if the player touches it — throttled by Config.player.invulnDuration under sustained overlap

			healthFont: '400 16px "Audiowide", "Courier New", monospace',
			healthColor: "#ffffff",

			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.3,
				poolSize: 4,
			}),
			sparksPerEmit: 10,
			// EffortScore 6.50 (hitsToKill 5, erratic-bounce mobility ×1.3,
			// mandatory so no engagement bonus). See the methodology comment
			// above `hitFlashDuration`.
			points: 220,
			gold: 11,

			splitter: Object.freeze({
				radius: 40, // vp — ~2x the base hull size
				health: 14, // ~3.5x base health
				// Own healthPerLevel, 1.5x the base Bouncer's 1.2 (read by
				// WaveManager._spawnNext — NOT the base bouncer.healthPerLevel).
				// Without this, Splitter's flat HP head start over a plain
				// Bouncer becomes proportionally smaller every level (player
				// damage keeps growing, the gap doesn't) — its relative tankiness
				// would decay toward parity with a plain Bouncer over a long
				// endless-mode run instead of staying a real step up.
				healthPerLevel: 1.8,

				fragmentCount: 3,
				fragmentRadius: 12, // vp — smaller than the base Bouncer (20)
				fragmentHealth: 1,
				fragmentSpeedMax: 200, // vp/sec — horizontal fan-out speed (vy is solved per-fragment, see spawnFragments)

				// EffortScore 13.00 (hitsToKill 10 from 14 HP @ healthPerLevel 1.8,
				// erratic-bounce ×1.3) — the single highest-value type in the
				// roster. Fragment reward below is its own separate, smaller
				// EffortScore (1.30) — no extra "split bonus" stacked onto
				// Splitter's own value, since the 3 spawned fragments already each
				// earn their own reward when they're individually killed. See the
				// methodology comment above `hitFlashDuration`.
				points: 430,
				gold: 22,
				fragmentPoints: 40,
				fragmentGold: 2,
			}),

			shielded: Object.freeze({
				shieldRadius: 32, // vp — outer ring radius (core uses the base `radius` above)
				shieldHits: 2, // bullet hits absorbed before the core starts taking damage
				shieldColor: "#6FE0FF", // ice-blue — visually distinct from the amber core
				shieldGlowBlur: 5,
				shieldHitGlowBlur: 12,
				// Own healthPerLevel for the core, same 1.5x rationale as Splitter
				// above — the shield's +2 flat hits don't decay on their own, but
				// the core underneath was scaling at the same rate as a plain
				// Bouncer's core.
				healthPerLevel: 1.8,

				// EffortScore 11.70 (hitsToKill 9 total — 2 shield-absorbed hits +
				// 7 core hits @ healthPerLevel 1.8 — × erratic-bounce ×1.3). See
				// the methodology comment above `hitFlashDuration`.
				points: 390,
				gold: 20,
			}),
		}),
	}),

	/**
	 * Enemy bullet pool — aimed, straight-line capsules fired by Scouts.
	 */
	enemyBullet: Object.freeze({
		speed: 420,
		color: "#ff3ec9", // matches Scout hull
		lineWidth: 4,
		halfLen: 5,
		glowBlur: 8,
		poolSize: 32,
		damage: 6, // player HP lost per hit — see Config.player.maxHealth
	}),

	/**
	 * Homing rocket pool — fired by Rocketeers. Rockets continuously
	 * steer toward the player after launch and detonate either when
	 * they get close enough (proximity) or when their fuel runs out (timer).
	 */
	rocket: Object.freeze({
		speed: 260, // vp/sec — bumped from a "slow and relentless" 190 for a punchier, more threatening flight
		turnRate: 2.2, // radians/sec — how fast it steers (≈126°/s)
		maxLife: 4.5, // seconds before self-destruct
		proximityRadius: 38, // vp — detonate when this close to player
		fadeStart: 3.5, // seconds — alpha begins fading toward self-destruct
		color: "#FFB020", // matches Rocketeer hull
		lineWidth: 2.5,
		halfLen: 13, // half the rocket BODY silhouette's nose-to-tail length (see Rockets._buildBodyPts) — previously unused, the rocket used to be rendered as ONLY its motion trail
		glowBlur: 10,
		poolSize: 16,
		damage: 15, // player HP lost on a proximity detonation — hard to dodge (homing), so priced above enemyBullet

		// Small nose-to-fins dart silhouette drawn at the rocket's leading
		// tip, oriented along its current velocity — see Rockets.render. Added
		// because the motion trail alone read as a laser line, not a rocket in
		// flight. Filled + stroked, same dark-fill/neon-outline language every
		// enemy hull already uses; fillColor deliberately matches
		// Config.enemy.rocketeer.fillColor (same family, same craft).
		bodyHalfWidth: 5, // vp — half the fin-to-fin span at its widest point
		bodyFillColor: "#1a1000",

		// Motion-trail length, in stored position samples — see Rockets.js.
		// Shortened from an original 8 (a ~0.32s/83vp streak at the current
		// speed) so the trail reads as a short exhaust wake behind the body,
		// not a long laser-like line trailing off it.
		trailHistory: 4,
		trailStep: 0.04, // seconds between recorded positions (~2.4 frames at 60fps)
	}),

	/**
	 * Enemy-kill drops — a flat chance any real player-caused kill (see
	 * WaveManager.handleBulletHit/_maybeDropPowerUp) leaves behind a small
	 * falling pickup the player flies through to collect. Only two kinds
	 * exist: a player-health restore and a barrier-health ("shield") restore
	 * — see PowerUps.js and WaveManager.checkPowerUpPickup. A Diver/Weaver
	 * clone destroyed by reaching the barrier (not a real kill — see
	 * _onDrifterBarrierHit) never rolls for a drop.
	 */
	powerUps: Object.freeze({
		dropChance: 0.12, // fraction of real kills that drop something
		shieldDropWeight: 0.5, // of the drops that DO happen, this fraction are shield pickups (the rest are health)
		fallSpeed: 90, // vp/sec, straight down — same for both kinds
		maxLife: 6, // seconds an uncollected pickup survives before despawning
		hitRadius: 16, // vp — collision radius against the player, added to Player.hitRadius
		poolSize: 8,

		radius: 14, // vp — outer circle size
		lineWidth: 2,
		glowBlur: 10,
		pulseSpeed: 3.0, // rad/sec — gentle "alive" breathing alpha, distinct from the low-health warning pulses (faster/deeper elsewhere)
		pulseDepth: 0.25,

		// Soft green — deliberately distinct from Diver's neon green
		// (#39ff14) and every other enemy hue, so a pickup never reads as
		// another threat. Icon: a "+" cross, the universal health-restore glyph.
		health: Object.freeze({
			color: "#4DFF8A",
			fillColor: "#0a2a16",
			healAmount: 25, // player HP restored — see Config.player.maxHealth
		}),
		// Same cyan as Barrier/its SHIELD readout on purpose — this pickup
		// visually reads as "the barrier's own color" at a glance. Icon: the
		// same diamond emblem Barrier draws at its own peak (see
		// core/shapes.js's diamondPath) — a deliberate echo of "this restores
		// THAT".
		shield: Object.freeze({
			color: "#4DEFFF",
			fillColor: "#0a2530",
			healAmount: 20, // Barrier HP restored — see Config.barrier.maxHealth
		}),
	}),

	/**
	 * Enemy-death explosion effect (see entities/Particles.js): two
	 * concentric shockwave rings plus a radial spark burst. One `Particles`
	 * pool exists per enemy family/variant so each can tune its own
	 * `sparksPerEmit` (denser formations use fewer sparks per kill to keep
	 * the shared shadow-blur pass cheap).
	 */
	particles: Object.freeze({
		maxSparks: 256, // spark pool size — well above any expected burst count
		sparkHalfLength: 3, // half-length of each spark line, virtual px
		sparkSpeedMin: 140,
		sparkSpeedMax: 380, // vp/sec — actual speed is randomized in this range
		sparkLifeMin: 0.18,
		sparkLifeMax: 0.36, // seconds — actual life is randomized in this range
		sparkDrag: 5, // per-second drag coefficient applied to spark velocity
		defaultSparksPerEmit: 14,
		innerRing: Object.freeze({ life: 0.28, startR: 6, maxR: 38 }), // tight, fast — the impact "pop"
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
		// Ten levels, rebuilt around OVERLAP as the main hype/difficulty lever.
		// Every level uses `simultaneous: true` (the default — none of them
		// override it): groups spawn on their own independent timers regardless
		// of what's still on screen, so a Sniper telegraph, a homing Rocketeer,
		// and a ricocheting Bouncer can all be live at once, forcing real
		// split-attention decisions instead of one enemy type politely waiting
		// its turn. That layering — not raw type-count — is what actually
		// reads as "interaction." Each level still introduces exactly one new
		// type in order (so the escalation stays legible — you always know
		// what's new), but composition is NOT capped: level 7 ("Alien
		// Invasion") deliberately stacks all four Drifter-family variants
		// together for the only time in the game, and level 10 throws the
		// entire 10-type roster into one finale. Formation sizes and spawn
		// density both climb harder in the back half (levels 6/7/10 land
		// 50+ individual enemies) for real spectacle, not just a longer list.
		// Health/damage still scale with `level` on their own (see
		// Config.player.damagePerLevel / each enemy's healthPerLevel), so this
		// arc's difficulty is driven by composition/overlap/density, not stat
		// inflation. Level 10 repeats forever once reached (WaveManager caps
		// at the last entry) — the full-roster finale IS what endless mode
		// plays like, on purpose.
		levels: Object.freeze([
			// Level 1 — {Scout}. Nothing to learn but "aim and shoot" — three
			// escalating bursts instead of two flat ones, so even a one-enemy
			// level has some rhythm to it.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.0,
					}),
				]),
			}),
			// Level 2 — {Scout, Rocketeer}. Overlapping from the start — the
			// rocket group's timer starts while Scouts may still be on screen,
			// so the two threats genuinely cross paths instead of alternating politely.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.0,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 2.3,
					}),
				]),
			}),
			// Level 3 — {Scout, Rocketeer, Diver}. Two Diver drops ambush the
			// player mid-level, while Scout/Rocketeer pressure is still live.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 2.0,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.3,
					}),
				]),
			}),
			// Level 4 — {Scout, Rocketeer, Diver, Sniper}. The real "interaction"
			// debut: holding position to read Sniper's telegraph while
			// Scout/Rocketeer/Diver are still actively forcing you to move.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.2,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 2.0,
					}),
				]),
			}),
			// Level 5 — {Scout, Rocketeer, Diver, Sniper, Drifter}. First alien
			// formation arrival, dropped in while the ship-family threats are
			// still going — the "wait, what is THAT" moment.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.5,
					}),
				]),
			}),
			// Level 6 — {Scout, Rocketeer, Sniper, Drifter, Sweeper, Diver}. The
			// first big-formation spectacle — two full 15-clone Sweeper rows —
			// landing on top of everything else already active. Six types at once.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "sweeper",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "sweeper",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 5,
					}),
				]),
			}),
			// Level 7 — "Alien Invasion" — {Weaver, Drifter, Sweeper, Diver,
			// Scout, Sniper, Rocketeer}. The only level in the game where all
			// four Drifter-family variants (same creature, four path/palette
			// reskins) are on screen together — the family's completion, played
			// as one deliberate spectacle rather than a rule to avoid. Seven types.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "sweeper",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 2.0,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "weaver",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.5,
					}),
				]),
			}),
			// Level 8 — {Scout, Rocketeer, Sniper, Drifter, Bouncer}. Persistent-
			// threat debut, layered under active ship-family fire — juggling
			// "hunt the Bouncer down" against "keep dodging everything else."
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "bouncer",
						count: 3,
						spawnInterval: 3.2,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 3.2,
					}),
				]),
			}),
			// Level 9 — {Splitter, Weaver, Sniper, Bouncer, Scout, Rocketeer,
			// Drifter}. A real "boss-lite" beat — Splitter enters with a full
			// supporting cast still active, so popping it (and dealing with the
			// 3 fragments it throws) happens in the middle of everything else,
			// not a quiet arena.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "splitter",
						count: 2,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.2,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 3.2,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 2.0,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "splitter",
						count: 1,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 5,
					}),
				]),
			}),
			// Level 10 — "Last Stand" — every single one of the 10 placeable
			// types, all overlapping. This is the level that repeats forever
			// once reached (WaveManager caps at the last entry), so "endless
			// mode" is genuinely the whole roster colliding at once, not a
			// curated subset.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "sweeper",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.0,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.2,
					}),
					Object.freeze({
						type: "splitter",
						count: 2,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 3.2,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 5,
					}),
					Object.freeze({
						type: "shielded",
						count: 1,
						spawnInterval: 3.5,
					}),
				]),
			}),
		]),
	}),

	/**
	 * Background music — two separate looping tracks that never overlap:
	 *   - the prologue's own theme, started the instant the player swipes
	 *     past the intro prompt (IntroScene's `onSwipeDetected` fires
	 *     synchronously from the real swipe gesture, still safely inside
	 *     its user-gesture activation window — see Game._startPrologueMusic),
	 *     and playing continuously through the ENTIRE prologue scene —
	 *     cinematic and the title/PLAY card ("the main menu") alike — right
	 *     up until PLAY is actually tapped (Game._startTutorial, called once
	 *     the title card's exit-fade finishes), rather than continuing to
	 *     play underneath the tutorial that follows.
	 *   - gameplay's theme, started once the tutorial's last hint is
	 *     dismissed (Game._startGameplay).
	 */
	audio: Object.freeze({
		prologueThemeSrc: "assets/audio/bg-prologue.mp3",
		// Lowered from an initial 0.25 — at that level the music drowned out
		// the typewriter blip (Config.prologue.<year/briefing>.blip, 0.06),
		// which fires rapidly enough (up to 12/sec) that it needs real
		// headroom below the music to still read as text-reveal texture
		// rather than getting buried.
		prologueThemeVolume: 0.15,
		prologueThemeLoop: true,
		// Both tracks below ramp in/out via core/AudioFader.js (see Game.js)
		// instead of snapping straight to full volume or silence — a fade-in
		// on start, a fade-out (then an actual .pause()) on stop, so neither
		// transition lands as an abrupt audio pop.
		prologueFadeInDuration: 1.2, // swells in as the cinematic begins
		prologueFadeOutDuration: 0.6, // stops promptly once PLAY is tapped, but not instantly

		themeSrc: "assets/audio/bg-music.mp3",
		themeVolume: 0.22, // BGM bed — lower than SFX so bullets and explosions always sit clearly on top
		themeLoop: true,
		themeFadeInDuration: 1.0, // eases in on gameplay start/restart
		themeFadeOutDuration: 0.7, // smooth stop on death, not an abrupt cut
	}),

	/**
	 * Colors. Centralised so the renderer stays dumb about theme.
	 */
	colors: Object.freeze({
		void: "#05070f", // deep space background
	}),

	/**
	 * GameplayScene's subtle camera-follow: the "world" layer (starfield,
	 * player, bullets, enemies — see GameplayScene.render's world/UI split,
	 * the same split screen-shake uses) pans a small amount opposite the
	 * player's horizontal offset from center, the same way panning a real
	 * camera toward where you're looking makes the world slide the other
	 * way. Deliberately no smoothing/lerp — the player's own movement is
	 * already instant (Player.moveTo snaps, no easing), so the follow
	 * offset is just a small, direct fraction of that same instant motion,
	 * consistent with how nothing else in this game's movement has inertia.
	 * No border/frame is needed to hide the pan's trailing edge — see
	 * GameplayScene.render's comment on why the world-layer clear runs at a
	 * fixed (0,0) transform before the pan is applied, so the edge the pan
	 * exposes is always void-colored, never a stale/leftover pixel strip.
	 */
	camera: Object.freeze({
		followFactor: 0.07, // fraction of the player's offset from horizontal center
		// Convergence rate (1/sec) GameplayScene._updateCameraFollow uses to
		// exponentially ease the pan toward its target instead of snapping to
		// it every frame — see that method's doc for why an unsmoothed pan
		// made enemy attacks in flight (bullets/rockets/the sniper's laser
		// telegraph) look like they were bending away from the player. Higher
		// = snappier/closer to instant, lower = more trailing lag.
		followSmoothing: 6,
	}),

	/**
	 * The planetary shield barrier: a wide shallow dome spanning the full
	 * screen width along the bottom edge. The arc's geometry is derived from
	 * the chord/sagitta formula so `baseY` and `arcHeight` are the only two
	 * values needed to fully describe its shape. Everything else controls
	 * visual detail and is read once at construction time (see Barrier.js).
	 */
	barrier: Object.freeze({
		maxHealth: 100, // barrier HP — see Barrier.js's takeDamage/heal
		color: "#4DEFFF",
		lineWidth: 2,
		glowBlur: 10, // reduced from 12 — blur cost ∝ radius², so 10 vs 12 is ~31% cheaper
		baseY: 940, // virtual px — where the arc endpoints sit (bottom edge margin)
		arcHeight: 70, // virtual px — how high the arc rises at center
		arcSegments: 48, // polyline resolution — higher = smoother curve
		innerInset: 10, // inner echo arc is this many px shallower than the main arc
		strutCount: 5, // upward structural tick marks along the arc
		strutDepth: 14, // virtual px — how far each strut extends toward screen center
		// Permanent health readout rendered inside the dome at the peak
		healthLabelFont: '400 9px "Audiowide", "Courier New", monospace',
		healthValueFont: '400 14px "Audiowide", "Courier New", monospace',
		healthColor: "#4DEFFF",
		healthGlowBlur: 3, // kept low — small radius means cheap shadow pass

		// Permanent power (player bullet damage) readout, offset toward the
		// dome's left side — same font sizes/glow as the health readout.
		powerXRatio: 0.22, // fraction of virtual width — x position of the power readout
		powerColor: "#4DEFFF",

		// Permanent current-level readout, mirroring the power readout on the
		// dome's right side (0.78 = 1 - powerXRatio, so the two sit symmetric
		// around the centered SHIELD readout). Same font sizes/glow as both.
		levelXRatio: 0.78,
		levelColor: "#4DEFFF",

		// Small pulsing "!" beside the SHIELD readout, only while low — offset
		// to the right (powerXRatio's readout already occupies the left side,
		// so the icon goes the other way to avoid crowding it). Same glowing-
		// glyph language as Config.hud.health's own icon and SniperEnemy's
		// warning marker.
		warningIconOffsetX: 42, // vp to the right of screen-center
		warningIconFont: '400 16px "Audiowide", "Courier New", monospace',
		warningIconGlowBlur: 8,

		// Impact ripple — a damped spring deformation applied to the arc near
		// an impact point (e.g. BouncerEnemy bouncing off the dome), so the
		// shield visibly flexes inward then springs back rather than the hit
		// being purely numeric. See Barrier.pulse()/_deformAt().
		pulse: Object.freeze({
			amplitude: 16, // virtual px — peak inward dent depth at the impact point
			width: 100, // virtual px — spatial falloff radius around the impact x
			duration: 0.4, // seconds — ripple fully settles after this long
			frequency: 24, // rad/sec — spring oscillation speed
			damping: 10, // exponential decay rate of the oscillation
		}),

		// Warning pulse once health drops at/below `threshold` — the arc and
		// its health readout swap to a pulsing red instead of the normal cyan,
		// same breathing-alpha formula the UI's pulsing buttons already use
		// (1 - depth*(0.5+0.5*sin(age*speed))), just faster/deeper so it reads
		// as urgent rather than idle. See Barrier._isLowHealth/_lowHealthAlpha.
		lowHealth: Object.freeze({
			threshold: 25, // health (0-100) at/below which the warning kicks in
			color: "#ff3b3b", // warning red
			pulseSpeed: 4.0, // rad/sec — noticeably faster than the ~2.0 UI buttons pulse at
			pulseDepth: 0.5, // how far the alpha dips at the trough of each pulse

			// Same repeating (capped) danger-blip treatment as
			// Config.player.lowHealth — see that config's own comment.
			warningAudioSrc: "assets/audio/warning.mp3",
			warningVolume: 0.5,
			warningInterval: 1.8,
			warningMaxRepeats: 3,
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
		margin: 20, // virtual px from screen edges to the panel anchor corner
		labelFont: '400 10px "Audiowide", "Courier New", monospace',
		labelColor: "#aab4d4",
		valueFont: '400 20px "Audiowide", "Courier New", monospace',
		valueColor: "#4DEFFF",
		valueGlowBlur: 6, // reduced from 8 — 44% cheaper shadow pass (blur cost ∝ radius²)
		bestFont: '400 11px "Audiowide", "Courier New", monospace',
		chromeColor: "#4DEFFF",
		chromeLineWidth: 1,
		chromeGlowBlur: 4, // reduced from 5
		bracketSize: 12, // leg length (virtual px) of the L-bracket corner accent

		/**
		 * Player health bar — centered under the mute/codex/pause button row
		 * (those sit at y=48, radius 25 — see Config.codex.button/
		 * Config.playbackControls.muteButton/pauseButton), clear of the
		 * SCORE/GOLD corner panels since it's centered rather than
		 * edge-anchored. Low health reuses Config.player.lowHealth's
		 * color/threshold so the bar and the ship's own hull pulse read as
		 * one consistent warning cue.
		 */
		health: Object.freeze({
			x: 270, // vp — screen-center, matches the button row above it
			y: 83, // vp — clears the button row's bottom edge (73) by a 10vp gap
			width: 140,
			height: 10, // a little thicker than the original 8 — reads more clearly at a glance
			trackColor: "#1a2035", // dim background showing the "empty" portion
			color: "#4DEFFF", // normal (non-low-health) fill color
			labelFont: '400 9px "Audiowide", "Courier New", monospace',
			labelColor: "#aab4d4",

			// Small pulsing "!" beside the bar, only while low — same glowing-
			// glyph language SniperEnemy's own warning marker already uses
			// (see Config.enemy.sniper.warningLabelFont), reused here rather
			// than inventing a separate icon shape.
			iconOffsetX: 12, // vp to the left of the bar's left edge
			iconFont: '400 16px "Audiowide", "Courier New", monospace',
			iconGlowBlur: 8,
		}),
	}),

	/**
	 * Enemy Codex — an in-gameplay reference button (see entities/EnemyCodex.js)
	 * that pauses the game and pages through one card per enemy type, each
	 * showing a re-drawn vector thumbnail of its actual hull, a short
	 * description, and its stats. Same sci-fi chrome language as the rest of
	 * the game's UI (HUD, title screen, tutorial).
	 */
	codex: Object.freeze({
		// Sized/spaced against real device CSS px, not just virtual px — see
		// Config.playbackControls' own comment for the full accessibility
		// rationale (this button shares that same row and target size).
		button: Object.freeze({
			x: 270,
			y: 48,
			radius: 25, // virtual px — the empty top-center gap between the HUD's score/gold panels
			color: "#4DEFFF",
			lineWidth: 2,
			glowBlur: 7,
			font: '400 23px "Audiowide", "Courier New", monospace',
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
			titleFont: '400 16px "Audiowide", "Courier New", monospace',
			titleColor: "#4DEFFF",
			titleY: 56,

			progressFont: '400 12px "Audiowide", "Courier New", monospace',
			progressColor: "#aab4d4",
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
			frameColor: "#4DEFFF",
			frameLineWidth: 1,
			frameGlowBlur: 4,

			nameFont: '400 24px "Audiowide", "Courier New", monospace',
			nameGlowBlur: 8,
			nameY: 372,

			tagFont: '400 13px "Audiowide", "Courier New", monospace',
			tagColor: "#aab4d4",
			tagY: 402,

			descFont: '400 15px "Courier New", monospace',
			descColor: "#e8ecff",
			descY: 452,
			descLineHeight: 24,
			descMaxWidth: 420,

			statFont: '400 14px "Audiowide", "Courier New", monospace',
			statColor: "#4DEFFF",
			statY: 548,
			rewardFont: '400 12px "Audiowide", "Courier New", monospace',
			rewardColor: "#aab4d4",
			rewardY: 578,

			arrowColor: "#4DEFFF",
			arrowGlowBlur: 6,
			arrowY: 250, // aligned with the frame
			arrowMarginX: 40, // vp from each screen edge
			arrowHalfSize: 22, // vp — half-width/height of the tappable arrow hit-box

			footerFont: '400 11px "Audiowide", "Courier New", monospace',
			footerColor: "#aab4d4",
			footerY: 780,
			footerText: "TAP ARROWS TO BROWSE · TAP ? TO CLOSE",
		}),
	}),

	/**
	 * Playback controls — two small always-visible buttons flanking the
	 * Enemy Codex button in the same top-center HUD gap (see entities/
	 * PlaybackControls.js). Mute never opens an overlay, so it stays
	 * tappable no matter what else is open. Pause freezes gameplay and dims
	 * the screen — same technique as the Enemy Codex's overlay, and
	 * mutually exclusive with it so only one full-screen overlay is ever up.
	 *
	 * Sizing/spacing: this row (mute/codex/pause) was originally radius
	 * 14-16vp — comfortably tappable on the virtual canvas, but virtual px
	 * aren't device px. At the game's typical scale (virtual width 540
	 * mapped onto a real phone's full CSS width, ~360-414px), a 14-16vp
	 * radius rendered as roughly a 19-23 CSS px diameter touch target —
	 * well under both the WCAG 2.5.8 AA minimum (24x24 CSS px) and nowhere
	 * near the WCAG 2.5.5 / Material Design AAA guidance (44x44 CSS px).
	 * All three buttons are now a uniform 25vp radius (50vp diameter),
	 * which lands in the ~33-37 CSS px range across common phone widths —
	 * comfortably clear of the AA floor (an earlier 28vp pass pushed closer
	 * to the 44 CSS px AAA target but read as too large on-device — dialed
	 * back a little per feedback) — with a 14vp gap between adjacent
	 * buttons (WCAG 2.5.8 also credits spacing between undersized targets,
	 * so the gap matters as much as the size). Uniform sizing across the
	 * row is deliberate too — consistent target sizes in a control cluster
	 * reduce mis-taps versus mixed sizes. centerY=48 keeps the row's top
	 * edge close to Config.hud.margin (20), lining it up visually with the
	 * SCORE/GOLD panels beside it; see Config.hud.health's own comment for
	 * how the row below it was shifted to keep clearing this button row.
	 */
	playbackControls: Object.freeze({
		muteButton: Object.freeze({
			x: 206,
			y: 48,
			radius: 25,
			color: "#4DEFFF",
			lineWidth: 2,
			glowBlur: 7,
			font: '400 20px "Audiowide", "Courier New", monospace',
			pulseSpeed: 2.0,
			pulseDepth: 0.3,
		}),
		pauseButton: Object.freeze({
			x: 334,
			y: 48,
			radius: 25,
			color: "#4DEFFF",
			lineWidth: 2,
			glowBlur: 7,
			font: '400 20px "Audiowide", "Courier New", monospace',
			pulseSpeed: 2.0,
			pulseDepth: 0.3,
		}),
		overlay: Object.freeze({
			dimAlpha: 0.85,
			titleFont: '400 32px "Audiowide", "Courier New", monospace',
			titleColor: "#4DEFFF",
			titleGlowBlur: 12,
			hintFont: '400 13px "Audiowide", "Courier New", monospace',
			hintColor: "#aab4d4",
			hintOffsetY: 50, // virtual px below the title
		}),
	}),

	/**
	 * Tutorial overlay. Plays once between the title screen and the first
	 * gameplay session — the full gameplay backdrop (starfield, barrier, HUD)
	 * is visible behind a dim overlay so every hint arrow points at the real
	 * UI element it describes.
	 */
	tutorial: Object.freeze({
		fadeInDuration: 0.5, // seconds — backdrop fades in from black (covers handoff from PrologueScene's fade-out)
		hintStartDelay: 1.4, // seconds before the first hint appears: fade-in (0.5s) + breathing room (0.9s)
		textFont: '400 20px "Audiowide", "Courier New", monospace',
		textColor: "#aab4d4",
		lineHeight: 28, // virtual px between lines of a multi-line hint
		wordsPerSecond: 5, // typewriter reveal speed — word-at-a-time, same pattern as briefing
		textMaxWidth: 370, // virtual px — hint text wraps at this width
		tapFont: '400 10px "Audiowide", "Courier New", monospace',
		tapColor: "#4DEFFF",
		overlayAlpha: 0.6, // how much the gameplay backdrop dims behind the hint text
		// Shared accent color for both the highlight brackets (a pulsing 4-corner
		// frame drawn around the real UI element each hint describes — see
		// TutorialScene._renderHighlight) and the orbiting hand-icon demo on the
		// movement hint — one consistent tutorial accent, not two configs.
		highlightColor: "#4DEFFF",
		highlightGlowBlur: 8, // reduced from 10 — tutorial highlights are compact so a smaller halo still reads clearly
		highlightLineWidth: 2,
		highlightCornerSize: 14, // virtual px — leg length of each corner-bracket tick, same motif as HUD/codex chrome
		highlightPulseSpeed: 2.6, // rad/sec — breathing pulse so the bracket frame reads as "live," not static chrome
		highlightPulseDepth: 0.4,
		// How far the spotlight "cutout" extends beyond the highlight box (see
		// TutorialScene._renderDimOverlay) — the dim veil is punched out around
		// the target UI element instead of covering it too, so it reads as lit
		// up rather than sitting under the same flat dark overlay as everything else.
		spotlightPadding: 16,
		// A soft, pulsing glow traced along that same cutout boundary (see
		// TutorialScene._renderSpotlightGlow) — layered UNDER the crisp corner
		// brackets, so the lit window itself reads as glowing rather than just
		// "the dim doesn't cover this part." Much bigger blur and a deeper,
		// faster pulse than the brackets use, on purpose — this is meant to be
		// the obviously-animated, eye-catching part of the highlight, not a
		// steady/static frame.
		spotlightGlowLineWidth: 3,
		spotlightGlowBlur: 26,
		spotlightGlowPulseSpeed: 3.2,
		spotlightGlowPulseDepth: 0.5,
		progressFont: '400 10px "Audiowide", "Courier New", monospace',
		progressColor: "#4DEFFF",
		blip: Object.freeze({
			src: "assets/audio/typewriter-blip.mp3",
			// Fires at 8/sec — slightly louder than the prologue blip since tutorial
			// blips are paced more deliberately and each one marks a word landing.
			volume: 0.08,
			perSecond: 8,
		}),
	}),
});
