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

		/**
		 * Magnet pull — GoldPickups/PowerUps within `radius` of the player
		 * accelerate toward it instead of just falling, so a near-miss still
		 * gets collected (see GoldPickups.update/PowerUps.update, both folding
		 * this straight into their existing burst-velocity/drag fields rather
		 * than adding a separate speed cap — the pull naturally settles at
		 * `pullAccel / burstDrag`). Deliberately weak at launch (`levels[0]`):
		 * a small radius and a gentle pull, just enough to rescue a coin or
		 * pickup that grazes the player rather than yanking anything in from
		 * across the screen. `levels` IS the upgrade path — Player._magnetLevel
		 * indexes into it, so a future upgrade (e.g. a Shop purchase) only
		 * needs to append a stronger entry here and bump that index; nothing
		 * else about the pull mechanism changes.
		 */
		magnet: Object.freeze({
			levels: Object.freeze([
				Object.freeze({ radius: 70, pullAccel: 700 }), // level 1 — starting strength
			]),
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
	 * Mission Mode — a discrete, one-level-at-a-time alternative to the
	 * default endless Survival Mode (see PrologueScene's two title buttons,
	 * MissionSelectScene.js, MissionProgress.js). Mission N plays exactly
	 * Config.waves.levels[N-1] (the same wave content Survival Mode's level
	 * N would) via GameplayScene constructed with `{ mode: 'mission', level:
	 * N }`, and ends the instant that single level's wave clears — no
	 * auto-advance to N+1 like Survival Mode does. `count` starts small
	 * on purpose ("we can broaden it later" — only the first 3 of
	 * Config.waves.levels' 30 entries are reachable this way for now);
	 * bump it whenever more missions are ready.
	 */
	mission: Object.freeze({
		count: 3,
	}),

	/**
	 * MissionSelectScene — the level-select screen reached after choosing
	 * MISSION MODE on the title card and finishing the tutorial. One tile
	 * per mission (Config.mission.count), stacked vertically, corner-bracket
	 * framed like Shop's item cards — locked (dim), unlocked-not-completed
	 * (normal), or completed (green) — see MissionProgress.js for the
	 * unlock/completion rules and MissionSelectScene.js for the tile content.
	 */
	missionSelect: Object.freeze({
		fadeInDuration: 0.3,

		titleFont: '400 20px "Audiowide", "Courier New", monospace',
		titleColor: "#4DEFFF",
		titleY: 110,

		backLabel: "◀ BACK",
		backFont: '400 14px "Audiowide", "Courier New", monospace',
		backColor: "#aab4d4",
		backX: 20,
		backY: 34,
		backHitWidth: 90, // generous tap target, same "wider than the text itself" philosophy as Config.prologue.skip
		backHitHeight: 40,

		tileStartY: 260,
		tileSpacing: 150,
		tileWidth: 320,
		tileHeight: 110,
		tileLegSize: 14,

		nameFont: '400 20px "Audiowide", "Courier New", monospace',
		statusFont: '400 13px "Audiowide", "Courier New", monospace',

		unlockedColor: "#4DEFFF", // ready to play — same cyan as everything else interactive
		completedColor: "#4DFF8A", // same soft green as Config.powerUps.health / Shop's OWNED color
		lockedColor: "#4a5570", // dim — same "disabled" read as Shop's unaffordable color
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
		titleOffsetY: -20, // vp above vH/2 — nudges the title up off the REVIVE button's medallion/icon (Config.gameOver.continue.offsetY) so its glow has clear air above the CTA instead of crowding it
		promptText: "TAP TO RESTART",
		promptFont: '400 18px "Audiowide", "Courier New", monospace',
		promptColor: "#aab4d4",
		// Pushed well clear of the REVIVE button + its cost line (see `continue`
		// below) — deliberately more breathing room than the button's own
		// height needs, so a reflex tap near the CTA can't land here instead.
		promptOffsetY: 200,
		promptDimAlpha: 0.7, // extra alpha multiplier while REVIVE is still a live option (see _renderGameOver) — keeps this from visually competing with the CTA
		promptRevealDelay: 0.4, // seconds AFTER the overlay's own fade-in before this prompt starts appearing, same reasoning — see _renderGameOver

		/**
		 * Gold-cost revive — tap this button (instead of anywhere else, which
		 * still restarts as before) to resume the CURRENT run in place rather
		 * than starting over from level 1: full health/barrier restore plus a
		 * brief immunity window (see GameplayScene._tryRevive), same shape as
		 * an 'invincible' PowerUp. Capped at `maxRevives` uses per run (see
		 * GameplayScene._continuesUsed) — past that the button goes into a
		 * permanent locked state (`lockedLabel`, no cost shown) and
		 * `_tryRevive` is a no-op. Cost DOUBLES with each use THIS run
		 * (`baseCost * costMultiplier ** continuesUsed`, see `_continueCost`)
		 * and resets to `baseCost` only on an actual restart (a fresh
		 * GameplayScene) — classic arcade "continue?" pacing, steep enough
		 * that leaning on it repeatedly really costs something.
		 *
		 * Deliberately the loud, unmissable choice on the GAME OVER screen —
		 * a pulsing glow plus a heartbeat-icon medallion straddling its top
		 * edge (same "medallion over a bracket-framed card" language as
		 * DailyRewardPanel's own reward icon/CLAIM button — see
		 * GameplayScene._renderReviveButton) — bigger and louder than
		 * promptText beneath it, so a player who just died sees REVIVE first
		 * and has to consciously look past it to restart instead of losing a
		 * viable continue to a reflex tap. `deadZonePadding` backs that up
		 * structurally: a tap just outside the button but still within the
		 * padding is swallowed rather than read as "restart" (see
		 * GameplayScene.handleTap), so a near-miss on the CTA can't
		 * accidentally end the run. Always drawn, dimmed when unaffordable
		 * rather than hidden, so the option (and its rising cost, or the fact
		 * it's gone) is never a surprise.
		 */
		continue: Object.freeze({
			baseCost: 150,
			costMultiplier: 2, // each revive costs this many times the previous one's cost — see _continueCost
			maxRevives: 3, // paid revives allowed per run
			invincibleDuration: 3, // seconds of immunity granted immediately on revive — see Player.activateInvincibility
			offsetY: 100, // vp below the title, above the restart prompt
			width: 240,
			height: 74,
			legSize: 12,
			deadZonePadding: 22, // vp of extra hit-test margin around the button that absorbs taps instead of restarting — see GameplayScene.handleTap

			// Heartbeat medallion floats entirely ABOVE the box (see
			// GameplayScene._renderReviveButton) rather than straddling its top
			// edge — `iconGap` is the clear space between the icon's own bottom
			// edge and the box, so it never overlaps `label` below it.
			iconRadius: 15,
			iconGap: 6,
			// Row y-offsets, each measured from the box's OWN top edge (same
			// "fixed row spacing from a shared anchor" convention as HUD's
			// score panel) — keeps label/cost/pips from ever colliding
			// regardless of font metrics.
			row1OffsetY: 20, // REVIVE / lockedLabel
			row2OffsetY: 41, // cost line
			pipsOffsetY: 60, // remaining-use pips

			// One pip per `maxRevives`, bright+filled while still available,
			// dim+hollow once spent this run — see `_renderRevivePips` — so
			// "how many uses do I have left" is always a glance, not a
			// subtraction the player has to do off the cost number.
			pipRadius: 4,
			pipSpacing: 15,

			label: "REVIVE",
			lockedLabel: "NO REVIVES LEFT",
			font: '400 17px "Audiowide", "Courier New", monospace',
			costFont: '400 14px "Audiowide", "Courier New", monospace',
			affordableColor: "#4DFF8A", // soft green — same "yes, go" read as Config.powerUps.health / Shop's OWNED color
			unaffordableColor: "#4a5570", // dim — reads as disabled, same as Shop's own unaffordable color
			pulseSpeed: 3.2, // rad/sec — same gentle "alive" breathing pulse DailyRewardPanel's CLAIM button already uses
			pulseDepth: 0.3,
		}),

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
	 * Mission Mode's victory overlay — GameplayScene shows this instead of
	 * advancing to a next level once a mission's single wave clears (see
	 * Config.mission, GameplayScene._triggerMissionComplete). Deliberately
	 * mirrors Config.gameOver's shape (dim overlay, clean fade-in title,
	 * tap prompt) since it's the same "freeze gameplay, show a full-screen
	 * result, tap to continue" pattern — just a win instead of a loss, so
	 * the color reads as success (soft green, matching Config.powerUps.health/
	 * Shop's OWNED color) rather than the alarm red of GAME OVER. No
	 * explosion delay — nothing to wait out, the fade-in starts immediately.
	 */
	missionComplete: Object.freeze({
		fadeInDuration: 0.6,
		dimAlpha: 0.75,
		titleText: "MISSION COMPLETE",
		titleFont: '400 44px "Audiowide", "Courier New", monospace',
		titleColor: "#4DFF8A",
		titleGlowBlur: 16,
		promptText: "TAP TO CONTINUE",
		promptFont: '400 18px "Audiowide", "Courier New", monospace',
		promptColor: "#aab4d4",
		promptOffsetY: 60,
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
		comboTierTrauma: 0.4, // added on a combo-streak tier-up, alongside that kill's own killTrauma — a deliberately strong jolt so the moment reads as a reward, not just another kill (see Config.combo.banner)
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
	 * Full-screen damage flash: a brief translucent red wash over the whole
	 * canvas the instant the player takes damage — Player's own hull
	 * hit-flash (Config.player.hitFlashDuration) is easy to miss since the
	 * ship is small and the eye is often elsewhere (HUD, an incoming enemy).
	 * GameplayScene owns the countdown (`_damageFlashTimer`, decaying with
	 * real dt like `_hitStopTimer`'s trigger side) and renders it as a fixed-
	 * camera overlay drawn over the world layer but under the HUD — see
	 * GameplayScene.render/_renderDamageFlash.
	 */
	damageFlash: Object.freeze({
		color: "#ff1a1a",
		peakAlpha: 0.35, // opacity the instant a hit lands
		duration: 0.25, // seconds to linearly fade back to 0
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
			exitFadeDuration: 0.55, // seconds — black veil that falls over the title when a mode button is tapped

			/**
			 * Two stacked buttons replace the old single PLAY button — the
			 * player's very first choice is which mode to enter (see
			 * PrologueScene.handleTap/_renderModeButtons), threaded through
			 * Game.js as a `mode` string ('mission' | 'survival') all the way to
			 * `GameplayScene`. Same corner-bracket framing/pulse the old PLAY
			 * button used, just two of them and a bit narrower/smaller-font to
			 * fit each mode's longer label.
			 */
			modeButtons: Object.freeze({
				font: '400 17px "Audiowide", "Courier New", monospace',
				color: "#4DEFFF",
				lineWidth: 1.5,
				glowBlur: 14,
				width: 220,
				height: 50,
				firstOffsetBelowTitle: 148, // MISSION MODE — same offset the old single PLAY button used
				gap: 18, // vp between the two buttons
				cornerSize: 14, // leg length (virtual px) of each L-bracket corner tick
				pulseSpeed: 2.2, // radians/second — drives the breathing alpha on the buttons
				pulseDepth: 0.28, // how far the alpha dips at the trough of each breath
				missionLabel: "MISSION MODE",
				survivalLabel: "SURVIVAL MODE",
			}),
		}),
	}),

	/**
	 * Daily Reward — a once-a-day random bonus (see entities/DailyRewardPanel.js
	 * and core/DailyReward.js for the roll/persistence logic; PrologueScene
	 * composes the panel and gates it to its 'title' beat). Exactly one of
	 * three kinds is rolled per calendar day (local time, not UTC — this is
	 * "today" from the player's own clock): an instant gold credit straight
	 * to the persistent wallet, a "lucky drop" that raises the player's NEXT
	 * run's power-up/gold drop odds, or a "shield start" that opens the NEXT
	 * run with a few seconds of invincibility already active (reusing
	 * Player.activateInvincibility, the same effect the `invincible` PowerUp
	 * grants).
	 *
	 * Deliberately its own full-screen reveal rather than a modal drawn on
	 * top of the title card — PrologueScene renders EITHER this OR the
	 * title/mode buttons for the 'title' beat, never both, so the two never
	 * visually compete or invite a mis-tap through a dimmed button
	 * underneath. Closing is only via the explicit CLAIM button (no
	 * background dismiss), same principle as Shop's popup.
	 *
	 * Juice, so the moment actually reads as "a reward" rather than a
	 * settings dialog: the whole screen rises up out of a black veil on
	 * entrance (`entranceDuration` — the exact same clear-with-alpha
	 * technique PrologueScene's own fadeOut/skipFade beats use to dissolve
	 * TO black, just run in reverse, so this reads as a continuation of the
	 * same cinematic language rather than an unrelated screen just
	 * appearing) and drops back behind its own short veil on CLAIM
	 * (`exitDuration`) rather than an instant cut to the title card. The
	 * card and CLAIM button scale-pop in with an overshoot bounce
	 * (core/animation.js's easeOutBack, CLAIM staggered slightly behind the
	 * card), a soft pulsing color halo breathes behind the card, and a
	 * one-shot colored spark burst (entities/Particles.js — the same pooled
	 * effect every enemy death already uses) fires the instant the screen
	 * appears. Each reward also gets its own small vector icon (see
	 * DailyRewardPanel._renderIcon) instead of relying on text alone to
	 * tell the three kinds apart at a glance.
	 */
	dailyReward: Object.freeze({
		fadeInDuration: 0.3,
		entranceDuration: 0.6, // seconds for the black veil to lift on arrival
		exitDuration: 0.4, // seconds for the veil to fall again once CLAIM is tapped, before control returns to the title card
		popInDuration: 0.5, // seconds for the card/icon/CLAIM button's ease-out-back scale pop
		popInOvershoot: 1.7, // core/animation.js's easeOutBack overshoot factor — how far past full size the pop bounces before settling
		claimStagger: 0.18, // seconds after the card starts popping in before CLAIM starts its own — a small "beat 2" instead of everything landing at once

		titleText: "DAILY LOGIN REWARD",
		titleFont: '400 24px "Audiowide", "Courier New", monospace',
		titleColor: "#4DEFFF",
		titleY: 190,
		titleGlowBlur: 12,

		// Tells the player up front that this isn't a one-off — the whole
		// point of "inform that daily login can have rewards."
		subtitleText: "COME BACK EVERY DAY FOR A NEW BONUS",
		subtitleFont: '400 13px "Courier New", monospace',
		subtitleColor: "#aab4d4",
		subtitleY: 226,

		// Faint decorative rules bracketing the whole reveal, same HRule+
		// diamond chrome vocabulary as the title card's own (see
		// Config.prologue.title) so this still reads as part of the same
		// game — just its own dedicated moment, not a popup fighting the
		// title/mode buttons for space underneath it.
		chromeColor: "#4DEFFF",
		chromeAlpha: 0.35,
		chromeLineWidth: 1,
		chromeMarginX: 60,
		topRuleY: 130,
		bottomRuleY: 860,

		// Corner-bracket-framed card (same chrome motif as Shop's item cards),
		// its OWN paths built in local (center-relative) coordinates — see
		// DailyRewardPanel._buildCardPaths — specifically so the pop-in scale
		// animation can transform it around its true center via
		// Renderer.strokePaths' {x, y, scale} rather than the canvas origin.
		cardWidth: 360,
		cardHeight: 220,
		cardCenterY: 520,
		cardLegSize: 18,
		cardLineWidth: 2,
		cardGlowBlur: 10,

		// A soft, slow-breathing halo behind the card in the reward's own
		// color — several concentric rings rather than one, since a single
		// stroked circle at low alpha reads as a thin ring, not a glow.
		haloRingCount: 3,
		haloBaseRadius: 130,
		haloRingSpacing: 26,
		haloPulseSpeed: 1.4,
		haloAlpha: 0.1,

		// The reward's icon "medallion" — a filled+stroked circle straddling
		// the card's top edge (like an achievement badge), tinted to the
		// rolled reward's own color, with a small glyph inside distinguishing
		// which of the 3 it is — see DailyRewardPanel._renderIcon.
		iconBadge: Object.freeze({
			radius: 42,
			lineWidth: 2.5,
			glowBlur: 14,
			fillAlpha: 0.18,
		}),

		nameFont: '400 20px "Audiowide", "Courier New", monospace',
		valueFont: '400 18px "Audiowide", "Courier New", monospace',
		descFont: '400 13px "Courier New", monospace',
		descColor: "#aab4d4",
		descLineHeight: 18, // vp between wrapped description lines — see DailyRewardPanel's wrapText use

		// Celebratory spark burst (see entities/Particles.js) fired once the
		// moment this screen appears — same pooled shockwave-ring+spark
		// effect every enemy death already uses, just centered on the card
		// instead of an explosion, and tinted to the rolled reward's color.
		burstSparkCount: 30,

		claimButton: Object.freeze({
			label: "CLAIM",
			width: 200,
			height: 54,
			legSize: 14,
			offsetY: 150, // vp below cardCenterY
			font: '400 18px "Audiowide", "Courier New", monospace',
			color: "#4DFF8A", // soft green — same "yes, go" read as Config.gameOver.continue's affordable color
			lineWidth: 2,
			glowBlur: 12,
			pulseSpeed: 2.2, // rad/sec — same breathing-alpha idea as Config.prologue.title.modeButtons, so this reads as "the" tappable control on screen
			pulseDepth: 0.22,
		}),

		// A small persistent reminder shown ON the title card once today's
		// reward has already been claimed (see PrologueScene's 'title'
		// render) — without this, a player who already claimed has no
		// on-screen cue the daily-reward system exists at all until
		// tomorrow's popup happens to catch them again.
		claimedBadge: Object.freeze({
			text: "DAILY REWARD CLAIMED — COME BACK TOMORROW",
			font: '400 11px "Courier New", monospace',
			color: "#aab4d4",
			alpha: 0.55,
			y: 900,
		}),

		// The three possible rolls — REWARD_TYPES in DailyReward.js iterates
		// this same set of keys, so adding a fourth kind here is the only
		// change needed to widen the pool (plus whatever consumes its flag).
		gold: Object.freeze({
			name: "GOLD BONUS",
			description: "Instant gold, credited straight to your wallet.",
			minAmount: 50,
			maxAmount: 150,
			color: "#FFD700", // matches Config.gold.color — this reward IS that wallet
		}),
		luckyDrop: Object.freeze({
			name: "LUCKY DROP",
			description:
				"Your next run gets boosted power-up and gold drop odds.",
			// Multiplies Config.powerUps.dropChance (0.1 -> 0.25) AND
			// Config.gold.dropChance (0.8 -> effectively guaranteed) for one
			// entire run — see WaveManager's constructor-injected
			// `dropChanceMultiplier` and GameplayScene's consumeLuckyDrop() call.
			dropChanceMultiplier: 2.5,
			color: "#4DFF8A", // soft green — reads as "buff," same as Shop's OWNED color
		}),
		shieldStart: Object.freeze({
			name: "SHIELD START",
			description:
				"Your next run begins with a few seconds of invincibility.",
			duration: 5, // seconds — shorter than a real invincible PowerUp's 15s (Config.powerUps.invincible.duration); this is a head-start grace period, not a full buff
			color: "#E8F6FF", // matches Config.powerUps.invincible.color
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
			// Bumped from a flat 16 (fine for a handful of regular Drifter
			// clones lashing at once) — Boss #4 "Snake" (Config.boss.snake) can
			// have up to ~20 attacker segments sharing this same pool, each on
			// their own multi-second cycle, so concurrent in-flight orbs can
			// climb well past what a normal level ever produces.
			projectilePoolSize: 40,
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
	 * falling pickup the player flies through to collect. Four kinds exist:
	 * a player-health restore, a barrier-health ("shield") restore, a
	 * temporary fire-power + fire-rate boost, and a temporary full damage
	 * immunity — see PowerUps.js and WaveManager.checkPowerUpPickup. A
	 * Diver/Weaver clone destroyed by reaching the barrier (not a real kill
	 * — see _onDrifterBarrierHit) never rolls for a drop.
	 */
	powerUps: Object.freeze({
		// Trimmed down from an initial 0.12 now that the campaign runs 30
		// levels deep (see Config.waves.levels) instead of 10 — the back-half
		// levels throw far more enemies per wave, so the same fraction would
		// otherwise mean a steadily climbing ABSOLUTE pickup count as the
		// campaign progresses, not a steady one. `poolSize` below (8) is
		// still the hard on-screen cap regardless of this rate.
		dropChance: 0.1, // fraction of real kills that drop something
		// Of the drops that DO happen, these three fractions are shield/
		// fireBoost/invincible pickups — health gets whatever's left (~0.25).
		// invincible is weighted lowest on purpose — full damage immunity is
		// the single strongest effect of the four, so it's deliberately the
		// rarest. See _maybeDropPowerUp's cumulative-threshold roll.
		shieldDropWeight: 0.3,
		fireBoostDropWeight: 0.3,
		invincibleDropWeight: 0.15,
		fallSpeed: 30, // vp/sec, straight down — same for every kind (dropped from 90 for a much slower drift)
		maxLife: 6, // seconds an uncollected pickup survives before despawning
		expireFadeDuration: 1.5, // seconds before despawn during which the pickup fades to transparent — a visible "about to vanish" cue instead of an abrupt pop, see PowerUps.render
		hitRadius: 16, // vp — collision radius against the player, added to Player.hitRadius
		poolSize: 8,
		// A gold coin (Config.gold.dropChance 0.8) rolls independently of a
		// PowerUp (dropChance 0.1) on the same kill, so both can land on the
		// same frame — a static spawn-position offset just teleported them
		// apart with no motion to sell it, so instead each pickup launches
		// outward from the exact death point at a random angle/speed and
		// decelerates (same drag-based burst shape as Config.particles'
		// spark burst) before settling into its normal `fallSpeed` drift —
		// see PowerUps.spawn/update. This both reads as an "explosion" and
		// keeps a same-frame coin+PowerUp from stacking on top of each other.
		burstSpeedMin: 200, // vp/sec — slowest possible launch speed
		burstSpeedMax: 450, // vp/sec — fastest possible launch speed
		burstDrag: 5, // per-second drag coefficient, same value as Config.particles.sparkDrag for a consistent "pop" feel

		radius: 14, // vp — outer circle size
		lineWidth: 2,
		glowBlur: 10,
		pulseSpeed: 3.0, // rad/sec — gentle "alive" breathing alpha, distinct from the low-health warning pulses (faster/deeper elsewhere)
		pulseDepth: 0.25,
		// Every icon glyph below (cross/diamond/bolt) fills with this single
		// near-white tone rather than each type's own hue — "colored orb +
		// white glyph" reads far more clearly at small mobile sizes than a
		// thin same-hue-on-same-hue outline did, and keeps the glyph SHAPE
		// (what it does) legible independent of the orb's color (which type
		// it is). invincible's hex stays an outline-only ring on purpose —
		// see its own comment below — so it doesn't use this.
		iconFillColor: "#F5FFFA",

		// Soft green — deliberately distinct from Diver's neon green
		// (#39ff14) and every other enemy hue, so a pickup never reads as
		// another threat. Icon: a filled "+" cross badge, the universal
		// health-restore glyph.
		health: Object.freeze({
			color: "#4DFF8A",
			// A solid saturated green body instead of the old near-black wash
			// (#0a2a16, ~1.3:1 against Config.colors.void — invisible) — matches
			// the fully-vivid-body treatment Config.gold's fillColor already
			// uses. ~4.6:1 against void and ~4.3:1 against iconFillColor's
			// cross glyph, both clearing the WCAG 1.4.11 non-text 3:1 minimum.
			fillColor: "#178A45",
			healAmount: 25, // player HP restored — see Config.player.maxHealth
		}),
		// Same cyan as Barrier/its SHIELD readout on purpose — this pickup
		// visually reads as "the barrier's own color" at a glance. Icon: a
		// filled version of the same diamond emblem Barrier draws at its own
		// peak (see core/shapes.js's diamondPath) — a deliberate echo of
		// "this restores THAT".
		shield: Object.freeze({
			color: "#4DEFFF",
			// Solid saturated teal body, same near-black-wash fix as health's
			// fillColor above — ~3.7:1 against void, ~4.1:1 against
			// iconFillColor's diamond glyph.
			fillColor: "#0E86A8",
			healAmount: 20, // Barrier HP restored — see Config.barrier.maxHealth
		}),
		// Warm gold — reads as "energy/attack", distinct from every enemy hue
		// and the other two pickups. Icon: a filled lightning-bolt badge.
		// Temporary, not an instant restore: boosts both player bullet damage
		// (WaveManager._playerDamage) and Bullets' fire rate by the same
		// `multiplier` for `duration` seconds — see GameplayScene's
		// `_fireBoostTimer`. A repeat pickup while one is already running
		// REFRESHES the timer back to the full duration rather than stacking
		// (either additively or multiplicatively) with it.
		fireBoost: Object.freeze({
			color: "#FFD24D",
			// Solid saturated amber body, same near-black-wash fix as health's
			// fillColor above — ~4.8:1 against void, ~4.1:1 against
			// iconFillColor's bolt glyph.
			fillColor: "#B36A00",
			multiplier: 1.25, // +25% player bullet damage AND fire rate while active — flat, never compounds; a repeat pickup only refreshes `duration` below, it never stacks a second multiplier on top
			duration: 25, // seconds
		}),
		// Pale ice-white — reads as "protective energy field," distinct from
		// every enemy hue and the other three pickups. Icon: a hexagon RING
		// (unlike the other three, deliberately left unfilled — see
		// iconFillColor's own comment above), echoing the bubble shape the
		// effect actually draws around the ship (see
		// Player._renderInvincibleBubble). Temporary, not an instant
		// effect: while `Player._invincibleTimer` is running, takeDamage
		// ignores every hit outright (see Player.activateInvincibility) — a
		// repeat pickup REFRESHES that timer back to the full duration, same
		// no-stacking rule as fireBoost.
		invincible: Object.freeze({
			color: "#E8F6FF",
			// Solid saturated blue body, same near-black-wash fix as health's
			// fillColor above — ~3.7:1 against void. invincible's hex glyph is
			// stroke-only (not filled with iconFillColor, see class doc), so
			// what matters here is `color` read against THIS fill: ~5.0:1.
			fillColor: "#2A6DA3",
			duration: 15, // seconds of full damage immunity
			bubbleRadius: 30, // vp — encases the ship's ~32x40vp silhouette (Config.player width/height at scale 0.5)
			bubbleLineWidth: 2,
			bubbleGlowBlur: 14,
			bubblePulseSpeed: 2.5, // rad/sec — gentle "protective" breathing, slower/shallower than the low-health warning pulse
			bubblePulseDepth: 0.3,
		}),
	}),

	/**
	 * Gold coin pickup — a physical drop the player must fly through to
	 * collect (see WaveManager.handleBulletHit/_maybeDropGold, checkGoldPickup,
	 * and GoldPickups.js). This REPLACES what used to be an instant credit on
	 * every kill: each coin's `value` is still the same per-enemy-type amount
	 * Config.enemy.*.gold (or a boss/variant's own `gold` field) always
	 * specified — see WaveManager._rewardFor — so the whole hand-tuned
	 * effort-score balance table above is untouched; only the DELIVERY
	 * changed, from automatic to collected.
	 *
	 * Deliberately its own pool and its own roll, NOT a fifth weighted type
	 * folded into Config.powerUps' cumulative-threshold pick: gold used to be
	 * guaranteed on every kill, so its drop chance needs to stay much higher
	 * than the rare health/shield/fireBoost/invincible pool (dropChance 0.1)
	 * or the gold economy would crash to a tenth of its former rate.
	 */
	gold: Object.freeze({
		dropChance: 0.8, // fraction of real kills that drop a coin — much higher than Config.powerUps.dropChance (0.1) on purpose, see class doc above
		fallSpeed: 30, // vp/sec, straight down — same as Config.powerUps (dropped from 90 for a much slower drift)
		maxLife: 6, // seconds an uncollected coin survives before despawning
		expireFadeDuration: 1.5, // seconds before despawn during which the coin fades to transparent — a visible "about to vanish" cue instead of an abrupt pop, see GoldPickups.render
		hitRadius: 16, // vp — collision radius against the player, added to Player.hitRadius
		poolSize: 24, // higher than powerUps' 8 — dropChance is 8x higher, and triggerSkillBomb can kill many enemies (many coins) in one frame
		// See Config.powerUps' matching fields' own comment — same burst-and-settle
		// launch, same values, so a coin and a PowerUp scatter by a comparable amount.
		burstSpeedMin: 200,
		burstSpeedMax: 450,
		burstDrag: 5,

		radius: 12, // vp — outer circle size, slightly smaller than a powerUp orb so a swarm of coins doesn't visually compete with them
		lineWidth: 2,
		glowBlur: 10,
		// Unlike Config.powerUps' pulse (which breathes the WHOLE orb's alpha —
		// right for a magic energy effect), only the rim glint pulses here — see
		// GoldPickups.render. A physical coin shouldn't flicker in and out like a
		// spell effect, so pulseSpeed/pulseDepth below drive just that glint.
		pulseSpeed: 3.0,
		pulseDepth: 0.25,

		// A proper metallic gold palette instead of a single flat hue — a solid
		// mid-gold body, a brighter glinting rim, a pale specular highlight, and
		// a deep antique-bronze for the stamped emblem/emboss. This is what
		// actually reads as "gold coin" at a glance rather than "colored orb"
		// (the old fillColor was a near-black wash, so only the thin outline
		// carried any gold color at all — see GoldPickups.render).
		color: "#FFDE59",       // bright rim/glint — distinct from Config.powerUps.fireBoost's warm-gold (#FFD24D)
		fillColor: "#E7B740",   // solid coin body
		highlightColor: "#FFF6DC", // pale specular shine, drifts slowly across the face
		shadeColor: "#6B4610",  // dark antique-gold — stamped star emblem + inner emboss; darkened from #8A5A12 so the emblem clears WCAG 1.4.11's 3:1 non-text contrast against fillColor with real margin (was ~3.2:1, now ~4.5:1)
	}),

	/**
	 * Score combo — a streak multiplier on kill POINTS only (never gold) that
	 * climbs while the player goes without taking damage, and resets to ×1
	 * the instant a hit actually lands (see GameplayScene._checkPlayerHit).
	 * Tiered rather than per-kill-continuous so it's simple to read at a
	 * glance (HUD just shows "COMBO ×N") — see Config.hud.combo for the
	 * display side. Skill-bomb kills (triggerSkillBomb) deliberately don't
	 * feed this — see GameplayScene._checkCollisions' own doc for why.
	 */
	combo: Object.freeze({
		step: 5, // kills-without-damage per multiplier tier
		incrementPerStep: 0.5, // multiplier added per tier
		maxMultiplier: 4, // hard cap — reached at 30 kills into an unbroken streak

		// Plays once per tier-up (not per kill) — see GameplayScene._checkCollisions.
		// No shipped clip yet; AudioPool degrades silently until one exists at this path.
		audioSrc: "assets/audio/streak.mp4",
		audioVolume: 0.7,
		audioPoolSize: 4,

		/**
		 * Loud, hard-to-miss "hype" banner fired once per tier-up (see
		 * entities/ComboBanner.js) — the big-and-brief counterpart to the
		 * small always-on "COMBO ×N" HUD readout (Config.hud.combo), which
		 * is easy to miss mid-fight. `labels` escalate with the tier just
		 * reached (index 0 = the first tier, 5 kills); its length (6)
		 * intentionally matches the number of tiers `step`/`incrementPerStep`/
		 * `maxMultiplier` above produce (30 kills / 5 = 6), so every tier
		 * gets its own word without ever falling off the end of the array.
		 */
		banner: Object.freeze({
			labels: Object.freeze([
				"NICE!",
				"GREAT!",
				"AWESOME!",
				"UNSTOPPABLE!",
				"GODLIKE!",
				"LEGENDARY!",
			]),
			posY: 380, // vp — clear of the HUD panels above and every enemy type's resting height (~210-290), so it never visually collides with either
			font: '400 40px "Audiowide", "Courier New", monospace',
			subFont: '400 18px "Audiowide", "Courier New", monospace',
			color: "#FF7A45", // same hot-streak orange as Config.hud.combo — one consistent "combo" color across both the small readout and this banner
			glowBlur: 18,
			subOffsetY: 34, // vp below the main line, for the "×N COMBO" line
			popDuration: 0.22, // seconds — bounce-in (see core/animation.js's easeOutBack)
			popOvershoot: 2.4, // easeOutBack overshoot factor — a punchier bounce than easeOutBack's own 1.7 default, since this is a celebration cue
			holdDuration: 0.85, // seconds at full scale before fading
			fadeOutDuration: 0.35,
			// Same "weak transmission" flicker technique as Config.level's own
			// hold phase (see core/animation.js's flickerAlpha), tuned faster/
			// shallower so it reads as "crackling with energy" rather than
			// "signal barely holding together."
			flickerFreqs: Object.freeze([9.1, 17.3, 26.7]),
			flickerPhases: Object.freeze([1.3, 0.5]),
			flickerBase: 0.9,
			flickerDepth: 0.5,
		}),
	}),

	/**
	 * Small "+N"-style text popups (see entities/FloatingText.js) — currently
	 * only used for the gold amount gained on a coin pickup (see
	 * GameplayScene's checkGoldPickup handling), giving that otherwise-silent
	 * stat change (the HUD number just changing) a moment of on-screen
	 * feedback right where it happened.
	 */
	floatingText: Object.freeze({
		poolSize: 12,
		riseDistance: 30, // vp — total upward drift over the effect's lifetime
		maxLife: 0.9, // seconds
		fadeStart: 0.5, // fraction of maxLife after which alpha starts easing to 0 — full opacity before that
		font: '400 14px "Audiowide", "Courier New", monospace',
		glowBlur: 4,
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
			// Level 7 — {Scout, Rocketeer, Sniper, Bouncer, Diver}. Every 7th
			// level is a boss level (see Config.boss.everyNLevels) — WaveManager
			// checks that BEFORE ever reading this array, so this entry (and
			// every other multiple of 7 below) never actually plays while that
			// stays true. Kept as a real, playable config anyway rather than a
			// placeholder — everyNLevels has already changed more than once
			// during development, and a stale/broken entry would only turn into
			// a problem the next time it does.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 2.0,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.3,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 2.4,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 3.2,
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
						count: 4,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 1.9,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.1,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.8,
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
						count: 3,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "splitter",
						count: 1,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 4.4,
					}),
				]),
			}),
			// Level 10 — "Last Stand" — every single one of the 10 placeable
			// types, all overlapping. The campaign continues past this one now
			// (see levels 11-30 below) — it was the endless-mode repeat cap
			// before the campaign was extended, and reads as a real mid-campaign
			// gut-check rather than a final wall.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 2,
						spawnInterval: 3.1,
					}),
					Object.freeze({
						type: "sweeper",
						count: 1,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "splitter",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.1,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "shielded",
						count: 1,
						spawnInterval: 3.1,
					}),
				]),
			}),
			// Level 11 — "Alien Invasion" — {Weaver, Drifter, Sweeper, Diver,
			// Scout, Sniper, Rocketeer}. The only level in the game where all
			// four Drifter-family variants (same creature, four path/palette
			// reskins) are on screen together — the family's completion, played
			// as one deliberate spectacle rather than a rule to avoid. Originally
			// level 7, moved here once every 7th level became a boss level (see
			// Config.boss.everyNLevels) — this is the first level of "act two",
			// right after the player's first boss kill.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "weaver",
						count: 3,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "sweeper",
						count: 1,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 3.1,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 3.1,
					}),
					Object.freeze({
						type: "weaver",
						count: 1,
						spawnInterval: 4.4,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.2,
					}),
				]),
			}),
			// Level 12 — "Splitter Squad" — three Splitters (and the fragment
			// swarm each leaves behind) under steady ship-family pressure.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "splitter",
						count: 4,
						spawnInterval: 3.3,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2.1,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.6,
					}),
				]),
			}),
			// Level 13 — "Shielded Wall" — Shielded Bouncers debut in force,
			// each one soaking hits while Sniper telegraphs demand you hold position.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 4,
						spawnInterval: 2.9,
					}),
					Object.freeze({
						type: "sniper",
						count: 3,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 1.7,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2,
					}),
				]),
			}),
			// Level 14 — {Scout, Sniper, Rocketeer, Bouncer}. A boss level (see
			// the comment on level 7's entry above for why this never actually
			// plays while Config.boss.everyNLevels stays 7 — kept as a real
			// config for the same reason).
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 1.7,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.6,
					}),
				]),
			}),
			// Level 15 — "Diver Storm" — Divers and Weavers layered together,
			// both diving/descending toward the barrier at once.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "diver",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "weaver",
						count: 4,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 1.7,
					}),
				]),
			}),
			// Level 16 — "Sweeper Tide" — two full Sweeper rows layered with a
			// Drifter loop, a dense wall of tentacle-creatures on screen at once.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "sweeper",
						count: 3,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 1.7,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 2,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 2.6,
					}),
				]),
			}),
			// Level 17 — "Gauntlet" — pure ship-family pressure, tightened
			// intervals across the board instead of a new type to lean on.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 5,
						spawnInterval: 1.6,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 1.9,
					}),
					Object.freeze({
						type: "sniper",
						count: 3,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.5,
					}),
				]),
			}),
			// Level 18 — "Splitter Swarm" — four Splitters (and their fragments)
			// on top of a Weaver descent.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "splitter",
						count: 5,
						spawnInterval: 3.1,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 1.6,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 1.9,
					}),
				]),
			}),
			// Level 19 — "Full Roster Redux" — every type from level 10's "Last
			// Stand" again, denser this time — the finale you already beat,
			// escalated.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "splitter",
						count: 2,
						spawnInterval: 3.1,
					}),
					Object.freeze({
						type: "sweeper",
						count: 1,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 1.6,
					}),
					Object.freeze({
						type: "sniper",
						count: 3,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 1.9,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 4,
					}),
					Object.freeze({
						type: "diver",
						count: 1,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 4,
					}),
				]),
			}),
			// Level 20 — "Iron Wall" — Shielded, Bouncer, and Splitter all
			// together, the tankiest non-boss lineup in the game.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 4,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "bouncer",
						count: 3,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "splitter",
						count: 2,
						spawnInterval: 3.1,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "scout",
						count: 2,
						spawnInterval: 1.6,
					}),
				]),
			}),
			// Level 21 — {Scout, Sniper, Rocketeer, Splitter}. A boss level (see
			// the comment on level 7's entry above).
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 1.6,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 2,
						spawnInterval: 1.9,
					}),
					Object.freeze({
						type: "splitter",
						count: 1,
						spawnInterval: 3.1,
					}),
				]),
			}),
			// Level 22 — "Crossfire" — Snipers and Rocketeers at their fastest
			// reload yet, forcing constant movement between two aimed threats.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "sniper",
						count: 5,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 4,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 1.5,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.3,
					}),
				]),
			}),
			// Level 23 — "Storm Front" — Weaver, Diver, and Sweeper formations
			// layered on top of steady ship-family fire.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "weaver",
						count: 4,
						spawnInterval: 3.7,
					}),
					Object.freeze({
						type: "diver",
						count: 2,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "sweeper",
						count: 2,
						spawnInterval: 3.7,
					}),
					Object.freeze({
						type: "sniper",
						count: 3,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 1.5,
					}),
				]),
			}),
			// Level 24 — "Chaos Engine" — Shielded, Splitter, ship-family, and
			// Bouncer all overlapping at once — no single threat to focus on.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 4,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "splitter",
						count: 3,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "sniper",
						count: 3,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 1.5,
					}),
					Object.freeze({
						type: "bouncer",
						count: 3,
						spawnInterval: 2.3,
					}),
				]),
			}),
			// Level 25 — "Endurance" — more, smaller groups than any level
			// before it, so the wave keeps producing fresh threats for longer
			// rather than front-loading everything into one dense burst.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 1.5,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "sniper",
						count: 3,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 3.7,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 3.7,
					}),
					Object.freeze({
						type: "diver",
						count: 2,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "bouncer",
						count: 2,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "sweeper",
						count: 1,
						spawnInterval: 3.7,
					}),
					Object.freeze({
						type: "splitter",
						count: 2,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "scout",
						count: 3,
						spawnInterval: 1.5,
					}),
					Object.freeze({
						type: "sniper",
						count: 2,
						spawnInterval: 2.3,
					}),
				]),
			}),
			// Level 26 — "Overwhelm" — the highest single-type counts yet across
			// Shielded, Splitter, Sniper, Rocketeer, and Scout at once.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 5,
						spawnInterval: 2.5,
					}),
					Object.freeze({
						type: "splitter",
						count: 3,
						spawnInterval: 2.8,
					}),
					Object.freeze({
						type: "sniper",
						count: 4,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 4,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 1.4,
					}),
				]),
			}),
			// Level 27 — "Last Stretch" — the run-up to the Snake fight, dense
			// ship-family and Bouncer-family pressure with a Weaver descent on top.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 5,
						spawnInterval: 1.4,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 4,
						spawnInterval: 1.7,
					}),
					Object.freeze({
						type: "sniper",
						count: 4,
						spawnInterval: 2.1,
					}),
					Object.freeze({
						type: "bouncer",
						count: 3,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "splitter",
						count: 2,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 3.5,
					}),
				]),
			}),
			// Level 28 — {Scout, Sniper, Rocketeer, Shielded}. A boss level (see
			// the comment on level 7's entry above).
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 1.5,
					}),
					Object.freeze({
						type: "sniper",
						count: 3,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 3,
						spawnInterval: 1.8,
					}),
					Object.freeze({
						type: "shielded",
						count: 2,
						spawnInterval: 2.5,
					}),
				]),
			}),
			// Level 29 — "Final Wave" — every family at once, one step short of
			// the finale — the last chance to get comfortable before level 30.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 3,
						spawnInterval: 2.4,
					}),
					Object.freeze({
						type: "splitter",
						count: 3,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "sweeper",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "weaver",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "diver",
						count: 2,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "sniper",
						count: 5,
						spawnInterval: 2.1,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 4,
						spawnInterval: 1.7,
					}),
					Object.freeze({
						type: "scout",
						count: 4,
						spawnInterval: 1.4,
					}),
					Object.freeze({
						type: "bouncer",
						count: 3,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "drifter",
						count: 1,
						spawnInterval: 3.5,
					}),
				]),
			}),
			// Level 30 — "The Reckoning" — the entire roster at the campaign's
			// highest density. This is the level that repeats forever once
			// reached (WaveManager caps at the last entry), so "endless mode" is
			// genuinely the whole roster colliding at once, not a curated subset.
			Object.freeze({
				enemies: Object.freeze([
					Object.freeze({
						type: "shielded",
						count: 4,
						spawnInterval: 2.3,
					}),
					Object.freeze({
						type: "sweeper",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "scout",
						count: 6,
						spawnInterval: 1.3,
					}),
					Object.freeze({
						type: "sniper",
						count: 4,
						spawnInterval: 2,
					}),
					Object.freeze({
						type: "splitter",
						count: 3,
						spawnInterval: 2.6,
					}),
					Object.freeze({
						type: "rocketeer",
						count: 4,
						spawnInterval: 1.6,
					}),
					Object.freeze({
						type: "bouncer",
						count: 3,
						spawnInterval: 2.1,
					}),
					Object.freeze({
						type: "weaver",
						count: 3,
						spawnInterval: 3.3,
					}),
					Object.freeze({
						type: "diver",
						count: 2,
						spawnInterval: 2.2,
					}),
					Object.freeze({
						type: "drifter",
						count: 2,
						spawnInterval: 3.5,
					}),
					Object.freeze({
						type: "shielded",
						count: 2,
						spawnInterval: 2.3,
					}),
				]),
			}),
		]),
	}),

	/**
	 * Boss encounters — a single, much tougher enemy that completely
	 * replaces the normal level roster every `everyNLevels` levels (7, 14,
	 * 21, ...). Checked against the raw level number in WaveManager rather
	 * than read from `waves.levels` above (which only defines 30 entries and
	 * caps at the last one forever), so boss levels keep recurring past
	 * level 30 too.
	 *
	 * `scout1` is the first boss ("Scout Prime") — a giant reskin of the
	 * Scout hull (BossEnemy.js reuses SCOUT_HULL_PTS's exact authored
	 * proportions, just at a much bigger `size`) whose attack cycles through
	 * the three "ship-family" enemies it's built from: an aimed Scout-style
	 * burst (`scoutPhase`), a Rocketeer-style homing-missile salvo
	 * (`rocketeerPhase`), then a Sniper-style charge/lock/fire
	 * (`sniperPhase`) — looping back to the first once all three have run.
	 * Later boss encounters (level 56, 105, ... — this boss is roster[0], so
	 * it recurs every 7th boss encounter once the roster cycles) reuse this
	 * same boss for now, scaled up via `healthPerLevel` like every regular
	 * enemy — future reiterations (a giant Rocketeer or Sniper build) are a
	 * later addition.
	 */
	boss: Object.freeze({
		// NOTE: everyNLevels/roster below are currently hand-tweaked for local
		// playtesting (forces every level to be a boss level, Tetra moved to
		// the front) — canonical shipped values are `everyNLevels: 7` and
		// roster starting with 'scout1'; revert before shipping. `nova` is
		// appended at the end regardless, so it's in rotation either way.
		everyNLevels: 3,
		roster: Object.freeze([
			"zigzag",
			"pulsor",
			"nova",
			"tetra",
			"scout1",
			"spiral",
			"bouncerPrimal",
			"snake",
		]), // ordered — which boss spawns on the 1st/2nd/3rd/4th/5th/6th/7th/8th/... boss-level encounter, in CANONICAL order (level 7→roster[0] "scout1", 14→roster[1] "spiral", 21→roster[2] "bouncerPrimal", 28→roster[3] "snake", 35→roster[4] "tetra", 42→roster[5] "nova", 49→roster[6] "pulsor", 56→roster[7] "zigzag", 63→roster[0] again, ...) — see WaveManager's boss-selection lookup in its constructor. The array above is temporarily reordered for playtesting (see NOTE), so the live spawn order doesn't currently match this comment.
		killTrauma: 0.6, // screen-shake on the boss's own death — matches Config.gameOver.deathTrauma, the strongest non-player-death moment in the game

		// Fraction of a boss's OWN max health the player's skill bomb deals
		// when it lands on one, instead of the instant kill it deals to every
		// regular enemy — see WaveManager.triggerSkillBomb. A flat fraction
		// (rather than a fixed damage number) scales correctly across every
		// boss's very different health pool, from Snake's ~350 to Bouncer
		// Primal's 12000+. 0.25 reads as a clearly powerful burst (noticeably
		// more than what a stretch of ordinary bullets would do) without
		// letting one tap of an 85s-cooldown button skip a meaningful chunk
		// of the fight.
		skillBombDamageFrac: 0.25,

		scout1: Object.freeze({
			name: "SCOUT PRIME", // boss health-bar label

			size: 58, // vp — same authored hull proportions as Scout (Enemy.js's SCOUT_HULL_PTS), just ~2.6x Scout's 22 (trimmed down from an initial 70 — read as too large)
			health: 450,
			healthPerLevel: 60, // later boss encounters (level 35, 63, ...) scale up like every regular enemy's healthPerLevel
			color: "#ff3b3b", // same danger-red as Config.player.lowHealth/Config.gameOver — a boss reads as the threat, not another squad member
			fillColor: "#200808",
			lineWidth: 3,
			glowBlur: 18,
			hitGlowBlur: 30,
			engineCoreColor: "#ff5f00",
			flameColor: "#ff3b3b",
			flameHalfWidth: 9,

			entrySpeed: 150, // vp/sec — slower than a regular Scout's 320, sells the weight of something this big
			// Pushed down from an initial 190 — combined with `orbitAmplitudeY`
			// below, the hull's own nose tip could swing up into the boss
			// health bar (Config.boss.healthBar) at the top of its orbit; 245
			// keeps the highest point of the loop clear of it with margin.
			restY: 245, // vp — fixed rest height (not randomized, unlike regular enemies)
			hitRadius: 46, // vp — big collision circle matching the huge hull, scaled down alongside `size`
			// Idle flight path while fighting (phases 0/1 — frozen during phase
			// 2, see BossEnemy.update): a figure-8/infinity loop laid on its
			// side ("landscape" — wide left-right, shallow up-down), traced by
			// the lemniscate-of-Gerono parametric form x=cos(t), y=sin(t)cos(t)
			// — see BossEnemy._updateOrbit. `orbitAmplitudeX` is deliberately
			// well above `orbitAmplitudeY` so the loop reads as flat/wide
			// rather than a tall vertical 8.
			orbitAmplitudeX: 140, // vp — horizontal reach
			orbitAmplitudeY: 30, // vp — vertical reach — trimmed from 45 alongside the `restY` bump above, same reason
			orbitSpeed: 0.4, // rad/sec — how fast it traces the full loop

			// Phases 1 & 3 of the cycle (see class doc) — Scout-style aimed
			// burst fire, mirroring Enemy.js's own aim→burst cycle at boss
			// scale: more rounds per burst, repeated `volleys` times before
			// the cycle moves on to the next phase.
			scoutPhase: Object.freeze({
				aimPause: 0.3,
				burstCount: 10,
				burstInterval: 0.15,
				leadFactor: 1.0,
				volleys: 3,
				cooldown: 1, // between volleys
			}),

			// Phase 2 — Rocketeer-style missile swarm: `missileCount` homing
			// rockets launched one after another, `missileInterval` seconds
			// apart (NOT simultaneously — a readable stagger, not one instant
			// wall of missiles), fanned across `spreadAngle` radians so they
			// don't all launch on an identical initial heading (they still
			// home in and converge on the player after launch, same as a
			// regular Rocketeer's single rocket).
			rocketeerPhase: Object.freeze({
				aimPause: 0.8,
				missileCount: 5,
				missileInterval: 0.3, // seconds between each rocket's launch within a salvo — a bit more breathing room now that there are 5 of them
				spreadAngle: 0.6, // radians, total fan width across the salvo
				salvos: 2,
				cooldown: 1.4, // between salvos
				// Scales down the shared Rockets pool's rendered body silhouette
				// ONLY for rockets launched from this phase (see Rockets.fire's
				// optional `sizeMult` param) — a regular Rocketeer's own rocket
				// is unaffected, since Config.rocket itself isn't touched.
				// Cosmetic only — detonation proximity/damage stay the same.
				rocketSizeMult: 0.75,
			}),

			// Phase 3 — Sniper-style charge/lock/fire, repeated `shots` times
			// before looping back to phase 1. Same telegraph LANGUAGE as
			// SniperEnemy (a nose orb that fills, then a locked "!" marker) —
			// see BossEnemy.js's renderCore/renderExtras — just its own
			// tuning, scaled for the giant hull, rather than reused directly
			// off Config.enemy.sniper. The boss also holds perfectly still for
			// this entire phase (see BossEnemy.update's sway-freeze) — a
			// stationary aim to match the faster strike pace below.
			sniperPhase: Object.freeze({
				// Lengthened back up from an initial 1.0, then a too-fast 0.8 —
				// a big ship snapping onto the player's position that quickly
				// read as wrong for its scale; this is the "wind-up" before it
				// locks on, not the gap between shots (see `recoverDuration`
				// below, which stays fast — the strikes themselves are still
				// quick once the fight is underway, only the LOCK itself is
				// slower and more deliberate).
				chargeWarmup: 1.4,
				warningDuration: 0.7, // unchanged — this is the fairness/reaction window, not part of the "interval"
				recoverDuration: 0.25, // shortened from 0.5 — faster back-to-back strikes
				shots: 3,

				// Multiplies the shared SniperBullets pool's `maxSpeed` ONLY for
				// bullets fired from this phase (see SniperBullets.fire's optional
				// `speedMult` param) — a regular SniperEnemy's own shot is
				// unaffected, since Config.enemy.sniper.bullet itself isn't
				// touched. The initial crawl (`startSpeed`) stays identical; only
				// the boosted top speed the bullet ramps up to is faster, so the
				// boss's version reads as "the same telegraph, a harder kick."
				bulletSpeedMult: 1.6,

				orbStartRadius: 5,
				orbGrowth: 14,
				orbLineWidth: 2.5,
				orbGlowBlur: 10,
				orbAlphaMin: 0.2,
				lockedOrbRadius: 18,
				lockedOrbLineWidth: 3,
				lockedOrbGlowBlur: 12,
				lockedBlinkSpeed: 6,

				warningRingRadius: 26,
				warningRingLineWidth: 2.5,
				warningRingAlphaMult: 0.6,
				warningDotRadius: 5,
				warningDotLineWidth: 3.5,
				warningDotGlowBlur: 8,
				warningLabelOffset: 38,
				warningLabelFont:
					'400 32px "Audiowide", "Courier New", monospace',
				warningLabelGlowBlur: 12,
				warningFadeInSpeed: 6,
				warningPulseSpeed: 4,
			}),

			sparksPerEmit: 40, // a much bigger death burst than any regular enemy (Config.particles.defaultSparksPerEmit is 14)
			// Flat "boss-tier" reward — far above any regular enemy (the
			// toughest, Shielded Bouncer, is 390/20) — reflecting a fight
			// that runs tens of seconds rather than a handful of hits.
			points: 2500,
			gold: 125,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.8,
				poolSize: 3,
			}),
		}),

		/**
		 * Boss #2 — "Spiral". An original radial-turret/orb silhouette (see
		 * SpiralBoss.js's SPIRAL_HULL_PTS — an N-pointed star/gear, not a
		 * reskin of any existing enemy, unlike boss #1's giant Scout) that
		 * continuously spins in place while firing a slow bullet on every
		 * `fireInterval` tick, always aimed along whatever direction it
		 * currently faces rather than at the player — because the fire angle
		 * keeps rotating between shots, the individual straight-line bullets
		 * fan out into a visible spiral as they travel outward, with no
		 * curved-path math needed. After `fireDuration` seconds of that it
		 * relocates to a new random spot (`repositionMarginX`/`YMin`/`YMax`)
		 * and resumes — "occasionally moves to a different position to fire
		 * again."
		 */
		spiral: Object.freeze({
			name: "SPIRAL",
			size: 55, // vp — outer spike-tip radius of the hull
			spikeCount: 8, // symmetric points around the hull
			innerRadiusRatio: 0.45, // core-ring radius as a fraction of `size`
			health: 400,
			healthPerLevel: 55,
			color: "#BF5FFF", // electric violet — same accent Config.enemy.sniper already uses
			fillColor: "#150826",
			lineWidth: 3,
			glowBlur: 18,
			hitGlowBlur: 30,
			hitRadius: 55, // vp — matches `size`, the hull's own outer radius

			entrySpeed: 150,
			// Initial rest height once entry finishes — later firing spots are
			// re-rolled by _beginReposition within repositionYMin/Max below,
			// this is only where it first settles.
			restY: 290,

			rotationSpeed: 1.1, // rad/sec — continuous spin; also drives each shot's fire angle
			fireInterval: 0.12, // seconds between fire ticks — ~47.6 ticks per full rotation at this rotationSpeed, tight enough for each arm to read as one continuous spiral
			// Bullets fired per tick, evenly spaced around the turret (e.g. 4 →
			// one every 90°) — all four rotate together with the hull, so the
			// pattern reads as 4 interleaved spiral arms rather than 1. See
			// SpiralBoss._updateFiring.
			fireDirections: 4,
			fireDuration: 11, // seconds spent firing at one spot before relocating (~1.9 full rotations)
			moveDuration: 1.3, // seconds to glide to the next firing spot — same easeOutCubic curve Enemy.js's own mid-fight repositioning uses
			repositionMarginX: 80, // vp from each screen edge — keeps the hull's own radius from clipping off-screen
			repositionYMin: 250, // vp — keeps the hull's topmost spike clear of the boss health bar above it
			repositionYMax: 430,

			// Pulsing core-ring glow at the center — stands in for an engine
			// flame (a hovering orb has no thruster, unlike the ship-family
			// bosses/enemies).
			coreGlowLineWidth: 3,
			coreGlowBlur: 14,
			coreGlowPulseSpeed: 3, // rad/sec — breathing pulse

			sparksPerEmit: 40,
			points: 2500,
			gold: 125,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.8,
				poolSize: 3,
			}),

			// Dedicated slow-bullet pool — see SpiralBullets.js's own doc for
			// why this isn't the shared EnemyBullets pool every Scout uses.
			bullet: Object.freeze({
				speed: 90, // vp/sec — deliberately slow
				color: "#BF5FFF",
				lineWidth: 4,
				glowBlur: 8,
				halfLen: 6,
				poolSize: 240, // generous — slow bullets linger on screen far longer than a normal Scout's, and `fireDirections: 4` means 4 are spawned per tick, so far more are in flight at once
				damage: 8,
			}),
		}),

		/**
		 * Boss #3 — "Bouncer Primal". A giant reskin of the Splitter Bouncer
		 * variant (BouncerPrimalBoss.js reuses BouncerEnemy.js's own exported
		 * `stepBouncePhysics` — the exact same gravity/wall/top/barrier-bounce
		 * physics every regular Bouncer already runs, just at this boss's own
		 * much bigger radius/gravity/speed/barrier-damage numbers) rather than
		 * a stationary/orbiting ship like Boss #1/#2 — it drops in and bounces
		 * around the whole arena for the entire fight.
		 *
		 * A player-bullet hit has a `summonChance` chance (once
		 * `summonCooldown` has elapsed — the chance roll on top of the
		 * cooldown trims what was originally "every eligible hit," which
		 * spawned a crowd within seconds) to provoke a fresh regular Bouncer
		 * summon (`summonHealthMin`-`summonHealthMax`) — and that summon's
		 * own rolled health is ALSO deducted from THIS boss's health on top
		 * of the bullet's own damage, so provoking a summon is itself a real
		 * source of damage, not just a distraction. Independently, every hit
		 * also has a `powerUpDropChance` chance to drop a PowerUp — higher
		 * than the flat kill-time chance every other enemy uses, since a
		 * fight this long deserves steadier loot. See BouncerPrimalBoss.hit/
		 * drainSummons/drainPowerUpDrops and WaveManager.handleBulletHit's
		 * unconditional (not just on-kill) drain of both queues.
		 *
		 * No top-of-screen health bar for this one (`hideHealthBar` on the
		 * class — see WaveManager.renderBossHealthBar's check) — instead its
		 * remaining health is drawn directly on the hull as a big compact
		 * number (see BouncerPrimalBoss.render's `_formatHealth`), same
		 * "number on the hull" language every regular Bouncer already uses
		 * for its own (much smaller) health, just abbreviated for a "super
		 * tanky" number that'd otherwise be too long to read at a glance.
		 */
		bouncerPrimal: Object.freeze({
			name: "BOUNCER PRIMAL",
			radius: 65, // vp — well above even Splitter's 40; the biggest hull of any Bouncer variant
			sides: 6, // hexagon — same family silhouette as every Bouncer variant
			health: 12000,
			healthPerLevel: 1800,
			color: "#FFB020", // same amber as the whole Bouncer/Splitter family — the giant-reskin lineage, same idea as Boss #1 reusing Scout's magenta
			lineWidth: 3,
			glowBlur: 10,
			hitGlowBlur: 20,
			flashDuration: 0.1,

			// Physics — see BouncerEnemy.js's exported stepBouncePhysics. Spin
			// and speed are both slower than a regular Bouncer's own (0.04
			// rad/sec per vp/sec, 80-160 vp/sec) — a hull this size reads as
			// heavier when it turns and moves more deliberately.
			gravity: 300,
			spinFactor: 0.02,
			speedMin: 60,
			speedMax: 120,
			barrierDamage: 15, // per bounce off the barrier — well above a regular Bouncer's 5
			contactDamage: 20, // player HP lost on contact — well above a regular Bouncer's 10

			summonHealthMin: 15,
			summonHealthMax: 35,
			summonCooldown: 0.35, // seconds — minimum gap between summons regardless of how fast it's being hit
			// Trimmed down from "every eligible hit" (too many, too fast) to
			// 0.55, then down again to 0.45 — still too many summons at 0.55
			// alongside the cooldown above.
			summonChance: 0.25,

			// Higher than the flat Config.powerUps.dropChance (0.12) every
			// other enemy's KILL rolls against — a fight this long deserves
			// steadier loot along the way, not just one roll at the end. See
			// BouncerPrimalBoss.hit/WaveManager.handleBulletHit's drain.
			// Trimmed down a little from an initial 0.2.
			powerUpDropChance: 0.15,

			numberFont: '400 22px "Audiowide", "Courier New", monospace',
			numberColor: "#ffffff",

			sparksPerEmit: 45,
			// Highest flat reward of any boss so far — this is by far the
			// longest, tankiest fight (see the class doc above).
			points: 4000,
			gold: 200,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.85,
				poolSize: 3,
			}),
		}),

		/**
		 * Boss #4 — "Snake". An upgraded, far-longer, tankier Sweeper: reuses
		 * DrifterEnemy.js's own exported Sweeper path/sampler
		 * (createSweeperPath/sampleSweeperPath) and body silhouette
		 * (BODY_PTS) rather than authoring new movement or a new hull — the
		 * "upgrade" is the chain's length, toughness, and a dynamic
		 * gap-closing behavior no regular Drifter formation has (see
		 * SnakeBoss.js's own doc for exactly how that works).
		 *
		 * The FRONT segment (`SnakeBoss`, chain index 0) is the actual boss —
		 * own health/reward/health-bar, same as every other boss. Every
		 * segment behind it (`SnakeSegment`, `segment` below) is tougher than
		 * a regular Sweeper clone but individually much cheaper, and only
		 * every `attackInterval`-th one (fixed at spawn, ~1 in 10) actually
		 * fires its own projectile at the player — the rest are pure physical
		 * hazards. Starts at `initialSegments` and grows by
		 * `growthBatchSize` every `growthInterval` seconds, up to
		 * `maxSegments` (175) — see SnakeBoss.update's growth tick, drained
		 * into WaveManager's enemy list the same generic `drainSummons` way
		 * Bouncer Primal's on-hit summons already are, just triggered by time
		 * instead of a hit.
		 */
		snake: Object.freeze({
			name: "SNAKE",
			color: "#4DFF6B", // fresh venom green — distinct from every other boss color (red/violet/amber) used so far
			fillColor: "#0a2010",
			lineWidth: 2,
			glowBlur: 7,
			hitGlowBlur: 16,
			hitRadius: 18, // vp — same as a regular Sweeper's own (Config.enemy.drifter.hitRadius)

			// Shared-path chain formation — see class doc.
			spacing: 34, // vp along the path between segments — tighter than a regular Sweeper's 50, so a 200-long chain doesn't stretch absurdly far past both screen edges
			speed: 190, // vp/sec along the path — a touch slower than a regular Sweeper's 220, reads as heavier
			// Gap-closing "catch-up" rate (vp/sec) — see SnakeSegment.update.
			// Faster than `speed` so a segment visibly hurries to close a gap
			// left by a dead neighbor rather than trailing it forever.
			catchUpSpeed: 260,

			initialSegments: 15, // chain length (INCLUDING the head) at spawn — matches a regular Sweeper's own formationSize, so the fight visibly starts like "just a big Sweeper" before growing into something far larger
			maxSegments: 175, // hard cap — trimmed down from an initial 200
			growthInterval: 1.2, // seconds between growth ticks while under the cap
			growthBatchSize: 4, // new tail segments added per growth tick (~55s to grow from 15 to 200)

			// Every segment at a chain-index divisible by this fires its own
			// projectile at the player (reusing the shared DrifterProjectiles
			// pool every other Drifter-family enemy already uses — see
			// Config.enemy.drifter.projectilePoolSize, bumped specifically to
			// give this boss room) — fixed once at spawn from each segment's
			// INITIAL chain position, not re-rolled as the chain reshuffles.
			attackInterval: 10,
			fireMinInterval: 2.2,
			fireMaxInterval: 4.0,
			engageRangeX: 160,

			health: 350, // the front segment's (the actual boss) own health
			healthPerLevel: 50,

			segment: Object.freeze({
				health: 8, // a regular Sweeper's own is 3 (+1/level) — noticeably tankier per "a more tanky one each"
				healthPerLevel: 1.2,
				points: 20,
				gold: 1,
				sparksPerEmit: 6, // small — many can die in close succession
				audio: Object.freeze({
					src: "assets/audio/explosion.mp3",
					volume: 0.12, // quiet — shared pool, up to 200 possible deaths over the fight
					poolSize: 4,
				}),
			}),

			sparksPerEmit: 20,
			// Highest flat reward of any boss so far, reflecting the sheer
			// scale of the fight — on top of every individual segment's own
			// (much smaller) reward, so a full clear pays out far more than
			// the boss's own flat number alone suggests.
			points: 5000,
			gold: 250,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.85,
				poolSize: 3,
			}),
		}),

		/**
		 * Boss #5 — "Tetra". An original rotating-square silhouette (see
		 * TetraBoss.js's TETRA_HULL_PTS — a plain 4-sided polygon, not a
		 * reskin of any existing enemy, same "original hull" lineage as
		 * Spiral) that continuously spins while patrolling a slow bouncing
		 * path around the upper arena (`moveSpeed`/`boundMarginX`/
		 * `boundYMin`/`boundYMax` — reflects off each bound like a DVD-logo
		 * bounce, see TetraBoss._updatePatrol) — unlike Spiral, which holds
		 * still to fire and only relocates BETWEEN firing spells, Tetra never
		 * stops moving.
		 *
		 * A repeating TIMED loop between its two phases — bullets, then
		 * lasers, then back to bullets, for the entire fight, never settling
		 * permanently into either one (closer to Boss #1's own
		 * scout/rocketeer/sniper cycle than a one-way health-gated
		 * escalation):
		 *
		 *   phase 1 (`phase1Duration` seconds) — fires a slow bullet from
		 *   each of the hull's 4 sides every `bullet.fireInterval` seconds
		 *   (same "N shots evenly spaced around the current rotation"
		 *   mechanic as Spiral's fireDirections, just at this boss's own
		 *   cadence/speed), spinning at `phase1RotationSpeed`.
		 *
		 *   phase 2 (`phase2Duration` seconds) — stops firing bullets and
		 *   instead grows 4 continuous laser beams (`laser`), one from each
		 *   hull side straight outward past the screen edge, rigidly
		 *   attached to the rotating hull (see TetraBoss._laserPaths) —
		 *   spinning faster now (`phase2RotationSpeed`) so the safe gaps
		 *   between beams keep sweeping past the player, same "dodge through
		 *   the rotating gap" read as a bullet-hell rotating-laser pattern.
		 *   Every time phase 2 begins it telegraphs for `laser.warmupDuration`
		 *   seconds first (the beams are visibly growing but deal no damage
		 *   yet) before going live — the same fairness window every other
		 *   telegraphed attack in this game gives the player (Sniper's
		 *   charge, Boss #1's sniper phase, Drifter's lash), replayed fresh
		 *   on every lap of the loop, not just the first.
		 */
		tetra: Object.freeze({
			name: "TETRA",
			size: 50, // vp — half-extent of the square hull (see TETRA_HULL_PTS)
			health: 480,
			healthPerLevel: 62,
			color: "#3DA5FF", // electric blue — distinct from every other boss (red/violet/amber/green) and from the player's own cyan
			fillColor: "#081428",
			lineWidth: 3,
			glowBlur: 18,
			hitGlowBlur: 30,
			hitRadius: 50, // vp — matches `size`, same convention as Spiral's hitRadius

			entrySpeed: 150,
			restY: 260, // vp — where the entry glide ends and patrolling begins

			phase1RotationSpeed: 0.6, // rad/sec
			phase2RotationSpeed: 1.3, // rad/sec — faster once enraged, so the safe gaps between beams sweep past more urgently

			// Continuous bouncing patrol — reflects off each bound like a
			// DVD-logo bounce (see TetraBoss._updatePatrol). Never stops,
			// through both phases and regardless of firing state.
			moveSpeed: 85, // vp/sec
			boundMarginX: 90, // vp from each side edge
			boundYMin: 200, // vp — kept clear of the boss health bar above it
			boundYMax: 430,

			// How long each phase lasts before looping to the other — see
			// class doc. Phase 2's duration comfortably exceeds
			// `laser.warmupDuration` so the beams spend real time fully live
			// (dealing damage), not just telegraphing, before looping back.
			phase1Duration: 8, // seconds of bullets
			phase2Duration: 6, // seconds of lasers (including the warmup telegraph)

			// Phase 1 — dedicated slow-bullet pool (TetraBullets.js), fired
			// from each of the 4 hull sides on every tick, same shape as
			// Spiral's own `bullet`/`fireDirections` pattern just at this
			// boss's own slower pace/speed.
			bullet: Object.freeze({
				fireInterval: 0.5, // seconds between ticks — more aggressive mid-fast rate, still well below Spiral's near-continuous 0.12s tick
				speed: 110, // vp/sec — deliberately slow
				color: "#3DA5FF",
				lineWidth: 4,
				glowBlur: 8,
				halfLen: 6,
				poolSize: 80,
				damage: 10,
			}),

			// Phase 2 — 4 continuous rotating laser beams, rigidly attached to
			// the hull sides. Collision is a live point-to-segment test
			// (vectorMath.distanceToSegment) against the player each frame,
			// not a pooled projectile — see TetraBoss.checkLaserHit, read
			// generically by WaveManager.checkPlayerHit the same optional-hook
			// way a regular Bouncer's `contactDamage` already is.
			laser: Object.freeze({
				warmupDuration: 1.0, // seconds the beams are visible but harmless right after phase 2 begins
				length: 1300, // vp — comfortably longer than the virtual canvas's own diagonal (~1101vp) from anywhere within the patrol bounds, so a beam always reaches past every edge regardless of the boss's current position
				halfWidth: 6, // vp — collision half-thickness (added to the player's own hitRadius)
				damage: 14, // player HP lost per overlapping frame — throttled by Config.player.invulnDuration same as any other contact damage
				color: "#3DA5FF",
				coreColor: "#ffffff", // bright white inner line, laid over the colored outer glow for a "hot" beam core
				lineWidth: 10, // outer glow stroke width
				coreLineWidth: 3,
				glowBlur: 16,
			}),

			// Pulsing core-ring glow at the center — stands in for an engine
			// flame, same reasoning as Spiral's own `coreGlow*` fields (a
			// rotating turret has no thruster).
			coreRadius: 16, // vp
			coreGlowLineWidth: 3,
			coreGlowBlur: 12,
			coreGlowPulseSpeed: 3, // rad/sec — breathing pulse

			sparksPerEmit: 42,
			points: 2700,
			gold: 135,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.8,
				poolSize: 3,
			}),
		}),

		/**
		 * Boss #6 — "Nova". An original hull (see NovaBoss.js's NOVA_HULL_PTS
		 * — a plain regular pentagon, not a reskin of any existing enemy,
		 * same "original hull" lineage as Spiral/Tetra), one vertex always
		 * pointing at the player (`_angle = atan2(...)`, same convention
		 * Scout/BossEnemy already use), patrolling a slow bouncing path
		 * CONFINED TO THE TOP HALF of the arena (`boundYMin`/`boundYMax`,
		 * both well under the virtual canvas's own half-height of 480 —
		 * same DVD-logo bounce technique as Tetra's `_updatePatrol`, just a
		 * tighter, higher band) rather than roaming the whole upper arena.
		 *
		 * Attack — the whole point of this boss — is a delayed spiral burst,
		 * not a direct spray: every `fireInterval` seconds it launches ONE
		 * slow bullet (`seed`, NovaSeedBullets.js) straight at the player's
		 * CURRENT position (no lead prediction — "slowly" is the whole
		 * threat, not accuracy). That seed bullet travels on its own for
		 * `seed.spreadDelay` seconds (visibly swelling as it nears that
		 * moment — see NovaSeedBullets.render's telegraph), then detonates
		 * wherever it currently is — NOT necessarily on the player, who has
		 * had that whole `spreadDelay` window to move away — into
		 * `fragment.count` new bullets (`fragment`, NovaBullets.js). The
		 * fragments don't fan out into a static ring: each successive
		 * fragment is launched `fragment.angleStep` radians further around
		 * (≈137.5°, the golden angle — the same phyllotaxis trick sunflower
		 * seed-heads use for a dense, non-repeating fan) AND `fragment.
		 * speedStep` vp/sec faster than the last, so plotting all of them at
		 * any single instant traces a genuine expanding spiral arm, not a
		 * ring that just grows uniformly — no curved-path bullet math
		 * needed, purely straight-line bullets whose LAUNCH parameters
		 * happen to correlate (the exact same "no curve math, just angle
		 * correlation" principle SpiralBoss's own continuous spiral uses).
		 * The detonation fan-out math itself lives in WaveManager's
		 * `_buildProjectilePools` (NovaSeedBullets' `onDetonate` callback),
		 * not in NovaBoss or NovaSeedBullets — same separation Rockets.js's
		 * `onDetonate` already uses (a pool reports WHEN something happens,
		 * WaveManager decides what that means for other pools/effects).
		 *
		 * A repeating TIMED loop between two phases, same shape as Tetra's
		 * own phase1/phase2 loop (see Config.boss.tetra's class doc):
		 *
		 *   phase 1 (`phase1Duration` seconds) — the seed/spiral-burst attack
		 *   described above, hull tracking the player.
		 *
		 *   phase 2 (`phase2` below) — the SAME seed/spiral-burst attack as
		 *   phase 1, just far denser: the hull stops tracking the player and
		 *   instead spins continuously (`phase2.rotationSpeed`), firing a
		 *   SEED from each of its 5 sides simultaneously (`fireNovaSeedAngle`
		 *   — NovaSeedBullets' angle-launch mode — same "N shots evenly
		 *   spaced around the current rotation" mechanic Tetra/Spiral already
		 *   use) — `phase2.volleyCount` times (2), `phase2.volleyInterval`
		 *   seconds apart, after an initial `phase2.windUp` seconds of
		 *   visible spin-up (the telegraph). Every one of those 10 seeds
		 *   independently swells and detonates into its own spiral fan on the
		 *   usual `seed.spreadDelay` clock — see NovaBoss._fireVolley. Patrol
		 *   movement never pauses for this, same as Tetra.
		 */
		nova: Object.freeze({
			name: "NOVA",
			size: 44, // vp — pentagon hull radius
			health: 500,
			healthPerLevel: 65,
			color: "#FFD23D", // warm gold — distinct from every other boss (red/violet/amber/green/blue) and evocative of a burst of light
			fillColor: "#241a00",
			lineWidth: 3,
			glowBlur: 18,
			hitGlowBlur: 30,
			hitRadius: 46, // vp

			entrySpeed: 150,
			restY: 240, // vp — where the entry glide ends and patrolling begins

			// Continuous bouncing patrol, same DVD-logo bounce technique as
			// Tetra's `_updatePatrol` — CONFINED TO THE TOP HALF of the arena
			// (Config.virtual.height is 960, so 480 is the true half-line;
			// both bounds sit comfortably above it, with boundYMax leaving a
			// clear margin rather than grazing the line).
			moveSpeed: 80, // vp/sec
			boundMarginX: 90, // vp from each side edge
			boundYMin: 140, // vp — kept clear of the boss health bar above it
			boundYMax: 380, // vp — comfortably inside the top half (< 480)

			// How long phase 1 lasts before looping into phase 2's bullet-hell
			// burst — see class doc. There's no separate `phase2Duration`
			// field (unlike Tetra) — phase 2's own length falls straight out
			// of `phase2`'s windUp/volleyCount/volleyInterval/tailDuration
			// below, so there's no second number that could drift out of
			// sync with the actual volley timing.
			phase1Duration: 10, // seconds of the seed/spiral-burst attack

			fireInterval: 2.0, // seconds between seed-bullet launches

			// The seed bullet — see class doc. Grows visibly as it nears
			// detonation (NovaSeedBullets.render), the fairness telegraph
			// every other delayed/charged attack in this game already gives
			// the player (Sniper's charge orb, Boss #1's sniper phase,
			// Drifter's lash) — here on the projectile itself since there's
			// no separate charge-up state on the boss to hang it off of.
			seed: Object.freeze({
				speed: 100, // vp/sec — deliberately slow, the same "slowly" the player actually sees, not just a label
				spreadDelay: 1.4, // seconds alive before it bursts
				color: "#FFD23D",
				lineWidth: 2.5,
				glowBlur: 10,
				radius: 6, // vp — base drawn radius
				growthMult: 1.8, // radius multiplies up to this factor as spreadDelay approaches (see NovaSeedBullets.render)
				// In phase 1, fireInterval (2.0s) > spreadDelay (1.4s), so at
				// most one seed is ever in flight there. Phase 2 fires 5 at
				// once, twice, `phase2.volleyInterval` (0.9s) apart — with
				// spreadDelay 1.4s > volleyInterval, the two volleys' seeds
				// briefly overlap in flight (up to 10 at once) before either
				// batch detonates. Sized for that peak with a little headroom.
				poolSize: 12,
				damage: 8, // player HP lost on a direct hit, before it ever gets to burst
			}),

			// The burst fragments — see class doc for the golden-angle/
			// speed-step spiral technique.
			fragment: Object.freeze({
				count: 12,
				angleStep: 2.4, // radians (~137.5°) — the golden angle, for a natural non-repeating spiral fan rather than a static evenly-spaced ring
				baseSpeed: 70, // vp/sec — first-launched fragment's speed
				speedStep: 12, // vp/sec added per fragment index — later fragments outrun earlier ones, curving the fan into a spiral instead of an expanding ring
				color: "#FFD23D",
				lineWidth: 3.5,
				glowBlur: 7,
				halfLen: 5,
				// One phase-2 volley alone can detonate 5 seeds at once (5 ×
				// `count` = 60 fragments in a single frame), and both volleys'
				// fragments can briefly coexist — sized well past that peak.
				poolSize: 200,
				damage: 6, // shared by phase 2's volley-launched seeds' own fragments too — same pool, same "these are Nova's standard bolt" damage regardless of which attack spawned them
			}),

			// Phase 2 — the bullet-hell burst — see class doc. No `burstSpeed`
			// here: phase 2 fires SEEDS (Config.boss.nova.seed's own `speed`),
			// not a direct fragment shot, so there's nothing of its own to tune.
			phase2: Object.freeze({
				windUp: 0.5, // seconds of visible spin-up before the first volley — the telegraph
				volleyCount: 2, // fires from all 5 sides this many times
				volleyInterval: 0.9, // seconds between each volley
				// Long enough that the SECOND volley's seeds (fired at
				// windUp + volleyInterval, each detonating seed.spreadDelay
				// seconds later) have actually burst before phase 2 ends —
				// windUp(0.5) + volleyInterval(0.9) + spreadDelay(1.4) = 2.8s
				// after phase 2 begins; 1.6 lands just past that.
				tailDuration: 1.6,
				rotationSpeed: 1.4, // rad/sec while spinning — faster than a calm idle spin, sells "bullet hell" urgency
			}),

			// Pulsing core-ring glow at the center — stands in for an engine
			// flame, same reasoning as Spiral/Tetra's own `coreGlow*` fields.
			coreRadius: 14, // vp
			coreGlowLineWidth: 3,
			coreGlowBlur: 12,
			coreGlowPulseSpeed: 3, // rad/sec — breathing pulse

			sparksPerEmit: 42,
			points: 2900,
			gold: 145,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.8,
				poolSize: 3,
			}),
		}),

		/**
		 * Boss #7 — "Pulsor". The first CIRCULAR hull (see PulsorBoss.js's
		 * `_renderHull` — a plain stroked+filled circle via Renderer's
		 * `fillEllipse`/`strokeCircle` primitives, not a polygon, so it can't
		 * reuse EnemyCombat.js's `renderHull` the way every other boss/enemy
		 * does) patrolling a slow bouncing path around the upper arena, same
		 * DVD-logo bounce technique as Tetra/Nova. A small bright marker dot
		 * orbits the rim at radius `size` along `_angle` — during phase 1 it
		 * points at the player (an aim indicator, same idea as Nova's hull
		 * vertex), during phase 2 it's the visible tell for the boss's own
		 * spin, since a plain circle's rotation is otherwise invisible.
		 *
		 * Fires "pulses," not ordinary bullets — both phases share one
		 * pooled-bullet class (PulsorBullets.js, structurally identical to
		 * TetraBullets.js/NovaBullets.js — angle+speed, batched capsule
		 * render) tuned as short, thick, heavily-glowing round blobs rather
		 * than streaks, so they read as orbs of energy. `pulseDamage` is
		 * shared by both phases' bullets — WaveManager.checkPlayerHit reads
		 * one pool with one damage value regardless of which phase fired a
		 * given bullet, same simplification Nova's shared fragment pool
		 * already makes.
		 *
		 * A repeating TIMED loop between two phases, same shape as Tetra's/
		 * Nova's own phase1/phase2 loops:
		 *
		 *   phase 1 (`phase1Duration` seconds) — an expanding "C-shaped"
		 *   wave: every `wave.interval` seconds, `wave.count` pulses fire
		 *   simultaneously from the hull, evenly spaced around all but a
		 *   `wave.gapAngle`-wide slice of the circle — a full ring with one
		 *   bite taken out. Since every pulse in a wave launches at the same
		 *   instant and the same `wave.speed`, they stay in ring formation as
		 *   they travel outward, reading as one curved wall sweeping out
		 *   rather than a scatter of individual shots (see
		 *   PulsorBoss._fireWave). The gap is centered on the direction AWAY
		 *   from the player at that instant — the bulk of the wave converges
		 *   around wherever they're standing, so dodging means moving THROUGH
		 *   the expanding wall toward the opening on the far side, not just
		 *   standing still in an already-safe gap.
		 *
		 *   phase 2 (`phase2Duration` seconds) — the hull spins continuously
		 *   (`ring.rotationSpeed`) and every `ring.interval` seconds fires a
		 *   FULL circular pulse (`ring.count` bullets around the entire
		 *   circle) with `ring.gapCount` evenly-spaced narrow gaps
		 *   (`ring.gapWidth` each) carved out for the player to slip through
		 *   — see PulsorBoss._fireRing. Each gap's angular position is
		 *   `this._angle + <fixed offset>`, so because the hull keeps
		 *   spinning between pulses, every new ring's safe lanes land
		 *   somewhere different from the last one's — the same "rotate so
		 *   the safe gaps keep sweeping past" language Tetra's laser already
		 *   uses, just applied to a pulsing ring instead of a static beam.
		 *   A short `ring.windUp` delay before the very first ring of each
		 *   phase-2 visit gives the spin-up itself a beat to read as a
		 *   telegraph before the first ring lands.
		 */
		pulsor: Object.freeze({
			name: "PULSOR",
			size: 46, // vp — hull circle radius
			health: 520,
			healthPerLevel: 68,
			color: "#FF4D6D", // coral-red — distinct from every other boss (red/violet/amber/green/blue/gold) and reads as pulsing energy
			fillColor: "#2a0812",
			lineWidth: 3,
			glowBlur: 18,
			hitGlowBlur: 30,
			hitRadius: 46, // vp — matches `size`

			entrySpeed: 150,
			restY: 250, // vp — where the entry glide ends and patrolling begins

			// Continuous bouncing patrol, same DVD-logo bounce technique as
			// Tetra/Nova's own `_updatePatrol`.
			moveSpeed: 80, // vp/sec
			boundMarginX: 90, // vp from each side edge
			boundYMin: 180, // vp — kept clear of the boss health bar above it
			boundYMax: 420,

			// Rim marker — see class doc.
			markerRadius: 5, // vp
			markerLineWidth: 2,
			markerGlowBlur: 8,

			// How long each phase lasts before looping to the other — see
			// class doc.
			phase1Duration: 9, // seconds of the C-shaped wave attack
			phase2Duration: 7, // seconds of the rotating full-ring pulses

			// Phase 1 — see class doc.
			wave: Object.freeze({
				interval: 1.4, // seconds between waves — trimmed from 1.6 for a slightly more aggressive cadence
				count: 16, // pulses around the solid arc
				gapAngle: 1.0, // radians (~57°) left open, centered away from the player
				speed: 155, // vp/sec — bumped from 140 alongside the faster cadence
				poolSize: 140, // generous — several waves' worth can be in flight at once given interval (1.4s) vs how long a pulse lingers before leaving the screen
			}),

			// Phase 2 — see class doc.
			ring: Object.freeze({
				windUp: 0.5, // seconds of visible spin-up before the first ring of a phase-2 visit — the telegraph
				interval: 1.15, // seconds between ring pulses — trimmed from 1.3 for a slightly more aggressive cadence
				count: 30, // bullet slots evenly spaced around the full circle, before gaps are carved out
				gapCount: 3, // evenly-spaced safe lanes per ring
				gapWidth: 0.65, // radians per gap (~37°)
				rotationSpeed: 1.1, // rad/sec while in phase 2 — what makes each ring's gaps land somewhere new
				speed: 175, // vp/sec — bumped from 160 alongside the faster cadence, still a touch faster than the phase-1 wave
				poolSize: 220, // generous — see wave.poolSize's own reasoning, scaled up for the larger per-ring bullet count
			}),

			// Shared pulse-orb visuals (PulsorBullets.js) — short, thick,
			// heavily-glowing capsules that read as round energy blobs
			// rather than elongated streaks, used by both `wave` and `ring`.
			// A separate sub-object (not top-level fields) specifically so
			// these don't collide with the hull's OWN `color`/`lineWidth`/
			// `glowBlur` fields above.
			bullet: Object.freeze({
				color: "#FF4D6D",
				lineWidth: 9,
				halfLen: 2,
				glowBlur: 10,
			}),
			pulseDamage: 9, // shared by both phases' pulses — see class doc

			// Pulsing core-ring glow at the center — stands in for an engine
			// flame, same reasoning as Spiral/Tetra/Nova's own `coreGlow*` fields.
			coreRadius: 14, // vp
			coreGlowLineWidth: 3,
			coreGlowBlur: 12,
			coreGlowPulseSpeed: 3, // rad/sec — breathing pulse

			sparksPerEmit: 44,
			points: 3100,
			gold: 155,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.8,
				poolSize: 3,
			}),
		}),

		/**
		 * Boss #8 — "Zigzag". The first TRIANGULAR hull (see ZigzagBoss.js's
		 * ZIGZAG_HULL_PTS — a plain equilateral triangle, not a reskin, same
		 * "original hull" lineage as Spiral/Tetra/Nova/Pulsor), parked at a
		 * single FIXED spot — the middle of the arena just under both health
		 * bars (`restY`) — for the entire fight; it never patrols or
		 * otherwise leaves that spot.
		 *
		 * A simple 2-state loop, driven by a shot COUNT rather than a shared
		 * elapsed-time clock the way Tetra/Nova/Pulsor's own phase1/phase2
		 * loops are:
		 *
		 *   'firing' — hull spins continuously (`rotationSpeed`) and fires one
		 *   bullet (ZigzagBullets.js) from EACH of its 3 sides simultaneously
		 *   every `bullet.fireInterval` seconds (the same "N shots evenly
		 *   spaced around rotation" fire-from-facing idiom Tetra's 4 sides/
		 *   Nova's 5 sides use, just 3 here, matching the triangular hull) —
		 *   until it has fired `bulletLimit` (60 — 20 ticks × 3 sides) shots
		 *   total, then moves to 'cooldown'.
		 *
		 *   'cooldown' — stops firing (still spinning) for `cooldownDuration`
		 *   seconds — a breathing-room beat — then goes back to 'firing' with
		 *   a clean bullet count, looping for the rest of the fight.
		 *
		 * Zigzag's bullets have their OWN twist on top of ZigzagBullets.js's
		 * shared TetraBullets-shaped pool: each one reflects off the
		 * LEFT/RIGHT screen edges (not top/bottom) up to `bullet.maxBounces`
		 * (2) times before it's allowed to fly off-screen and cull normally
		 * — see ZigzagBullets.js's own doc.
		 */
		zigzag: Object.freeze({
			name: "ZIGZAG",
			// vp — circumradius (center-to-vertex). ZigzagBoss.js derives the
			// apothem (center-to-edge-midpoint, used as the fire-origin radius
			// for the 3-sided volley) from this as size*cos(60°).
			size: 60,
			health: 540,
			healthPerLevel: 70,
			color: "#FF8A00", // hazard orange — distinct from every other boss color used so far (red/violet/amber/green/blue/gold/coral)
			fillColor: "#2a1500",
			lineWidth: 3,
			glowBlur: 18,
			hitGlowBlur: 30,
			// vp — deliberately between the apothem (30) and the full
			// circumradius (60) rather than pinned to either: the pointy
			// corners carry real visual weight (unlike Tetra's square, whose
			// apothem IS its half-side), so a hit circle pinned to the apothem
			// would feel unfairly tight against them.
			hitRadius: 50,

			entrySpeed: 150,
			// Fixed rest position — this boss never patrols; it parks dead
			// center, just below both the boss health bar (Config.boss.
			// healthBar, bottom edge ~162) and the player's own HUD health
			// bar above that, and stays there for the whole fight.
			restY: 210,

			rotationSpeed: 0.9, // rad/sec — continuous turret spin through 'firing'/'cooldown'

			// 3 bullets per tick, one from each hull side (see class doc).
			// Also drives ZigzagBullets.js's pool sizing/styling.
			bullet: Object.freeze({
				fireInterval: 0.3, // seconds between ticks — "mid" pace: faster than Tetra's 0.5, well below Spiral's near-continuous 0.12
				speed: 130, // vp/sec
				color: "#FF8A00",
				lineWidth: 4,
				glowBlur: 8,
				halfLen: 7,
				poolSize: 300, // generous — up to bulletLimit (60) can be alive from one visit (3 per tick), plus stragglers still bouncing from a prior visit
				damage: 10,
				maxBounces: 2, // times a bullet reflects off the LEFT/RIGHT screen edges before it's allowed to exit and cull — see ZigzagBullets.js
			}),

			bulletLimit: 60, // total shots fired per 'firing' visit before switching to 'cooldown' — 20 ticks × 3 sides, see class doc
			cooldownDuration: 1.5, // seconds spent in 'cooldown' (still spinning, not firing) before the next 'firing' burst

			// Pulsing core-ring glow at the center — stands in for an engine
			// flame, same reasoning as every other original-hull boss
			// (Spiral/Tetra/Nova/Pulsor's own `coreGlow*` fields).
			coreRadius: 15, // vp
			coreGlowLineWidth: 3,
			coreGlowBlur: 12,
			coreGlowPulseSpeed: 3, // rad/sec — breathing pulse

			sparksPerEmit: 43,
			points: 3300,
			gold: 165,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.8,
				poolSize: 3,
			}),
		}),

		// Boss health bar — top-center, wider/more prominent than the
		// player's own health bar (Config.hud.health), positioned to clear
		// that bar/label sitting right above it.
		healthBar: Object.freeze({
			x: 270,
			// Pushed down from an initial 122 — that overlapped the player's
			// own health bar/label right above it (Config.hud.health, bottom
			// edge + label around y=105-110). 150 clears it with room; see
			// Config.boss.scout1.restY's own comment for the matching fix on
			// the boss's hull itself swinging up into this bar.
			y: 150,
			width: 320,
			height: 12,
			trackColor: "#1a2035",
			labelColor: "#aab4d4",
			nameFont: '400 15px "Audiowide", "Courier New", monospace',
			nameGlowBlur: 6,
		}),

		// Extra subtitle shown under the "LEVEL N" indicator on a boss level,
		// so the escalation reads clearly before the fight starts — see
		// GameplayScene._renderLevelIntro.
		intro: Object.freeze({
			text: "BOSS INCOMING",
			font: '400 20px "Audiowide", "Courier New", monospace',
			color: "#ff3b3b",
			glowBlur: 10,
			offsetY: 56, // vp below the "LEVEL N" line
		}),
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
		// Kill-switch — temporarily false. A reported visual issue during the
		// boss fight (enemy fire reading as slightly misaimed) was suspected
		// to trace back to this pan, so it's off for now rather than removed
		// outright — flip back to true once that's actually diagnosed. When
		// false, GameplayScene._updateCameraFollow skips the pan entirely
		// (camera pins to (0,0)) instead of just easing toward a zero target,
		// so turning this off takes effect instantly, not over a fade.
		enabled: false,
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
		maxHealth: 150, // barrier HP at level 1 — see Barrier.js's takeDamage/heal. Bumped from 100 (+50) so the shield has more of a cushion across a 30-level campaign.
		maxHealthPerLevel: 50, // +50 max HP per wave level beyond 1 — see Barrier.maxHealth/setLevel. Same "base + (level-1)*perLevel" shape as Config.player.damage/damagePerLevel.
		// A small guaranteed top-up applied once per wave clear (see
		// GameplayScene's isDone handling) — on top of, not instead of, the
		// rare shield PowerUp drop (Config.powerUps.shield.healAmount, 20).
		// Deliberately smaller than that drop's amount since this one is
		// guaranteed every single wave rather than a rare pickup — enough to
		// meaningfully offset routine chip damage between waves without
		// making barrier health management pressure-free for the whole run.
		healPerWaveClear: 15,
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
			thresholdRatio: 0.25, // fraction of the CURRENT (per-level-scaled) maxHealth at/below which the warning kicks in — was a flat 38 (25% of the original fixed 150) before maxHealth started scaling per level; a ratio keeps that same 25% read at every level instead of going stale as the ceiling rises
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

		// COMBO readout — sits under the SCORE/BEST lines, only drawn once the
		// multiplier is actually above ×1 (see HUD.render), same "only show
		// while it matters" convention as the fireBoost/invincible badges
		// below. See Config.combo for the gameplay-side tuning this displays.
		combo: Object.freeze({
			font: '400 12px "Audiowide", "Courier New", monospace',
			color: "#FF7A45", // warm "hot streak" orange — distinct from every other HUD/pickup color in the game
			offsetY: 80, // vp below the panel's margin anchor — 18vp under the BEST line (margin+62)
		}),

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

		/**
		 * Fire-boost active indicator — a small badge on the right-middle edge
		 * of the screen, shown only while a fireBoost PowerUp is active (see
		 * GameplayScene._fireBoostTimer). Deliberately reuses
		 * Config.powerUps.fireBoost's own color and icon language (a lightning
		 * bolt, matching PowerUps.js) so the badge reads as "the thing you just
		 * picked up is still active," not a new, unrelated icon.
		 */
		fireBoost: Object.freeze({
			x: 500, // vp — right side, inset from the edge so the glow doesn't clip
			y: 480, // vp — vertical center of the 960-tall virtual screen
			radius: 16,
			lineWidth: 2,
			glowBlur: 10,
			labelFont: '400 9px "Audiowide", "Courier New", monospace',
			valueFont: '400 15px "Audiowide", "Courier New", monospace',
		}),

		/**
		 * Invincibility active indicator — mirrors fireBoost's badge onto the
		 * LEFT-middle edge of the screen (same y, x mirrored across center) so
		 * the two never overlap even when both buffs happen to be running at
		 * once. Same reasoning as fireBoost: reuses Config.powerUps.invincible's
		 * own color/icon language rather than a new, unrelated one.
		 */
		invincible: Object.freeze({
			x: 40, // vp — left side, mirrors fireBoost's x=500 (540 - 500 = 40)
			y: 480,
			radius: 16,
			lineWidth: 2,
			glowBlur: 10,
			labelFont: '400 9px "Audiowide", "Courier New", monospace',
			valueFont: '400 15px "Audiowide", "Courier New", monospace',
		}),

		/**
		 * Tap target for the GOLD panel itself — opens the Shop (see Shop.js,
		 * HUD.isInsideGoldPanel, GameplayScene.handleTap). Generous, wider than
		 * the label+value text it sits over, same "easy to hit" philosophy as
		 * Config.prologue.skip's own hit box.
		 */
		goldButton: Object.freeze({
			hitWidth: 120,
			hitHeight: 64,
			hitInsetTop: 8, // vp above the label's y-anchor included in the tap target
		}),
	}),

	/**
	 * Shop — a placeholder purchase screen opened by tapping the HUD's GOLD
	 * panel, freezing gameplay the same way Config.codex's overlay does (see
	 * Shop.js). Laid out as an equipment screen: the player's real ship
	 * (Player.js, reused as-is — no re-derived approximation, same
	 * philosophy as EnemyCodex's enemy previews) sits center-screen, with
	 * one card per ship "part" radiating outward at the four compass points,
	 * a thin connector line tying each card back to the ship. The item
	 * roster itself (names/descriptions/costs) lives in Shop.js, not here —
	 * same content/chrome split as EnemyCodex (roster in EnemyCodex.js's
	 * ENTRIES, layout/chrome tuning here) — because those items are
	 * deliberately throwaway placeholders (see Shop.js's own doc) due to be
	 * replaced once the real weapon/upgrade design lands; only this visual
	 * chrome is expected to last.
	 */
	shop: Object.freeze({
		dimAlpha: 0.85, // same "frozen frame behind a dark veil" treatment as Config.codex.overlay
		fadeInDuration: 0.2,

		titleFont: '400 16px "Audiowide", "Courier New", monospace',
		titleColor: "#4DEFFF",
		titleY: 100, // clears the mute/codex/pause button row — see Config.codex.overlay.titleY's own comment

		balanceFont: '400 13px "Audiowide", "Courier New", monospace',
		balanceColor: "#FFD700", // same coin-gold as Config.gold.color — this number IS that wallet
		balanceY: 130,

		// Explicit close button (top-right of the overlay's own content, not
		// the HUD's dimmed GOLD panel underneath) — this popup must never
		// rely on tapping "through" or "behind" it to dismiss. Same circle+
		// glyph shape as Config.codex.button, just smaller.
		closeButton: Object.freeze({
			x: 500,
			y: 45,
			radius: 18,
			color: "#4DEFFF",
			lineWidth: 2,
			glowBlur: 7,
			font: '400 18px "Audiowide", "Courier New", monospace',
		}),

		// The ship renders at its real in-game position/scale (Config.player),
		// just relocated to this fixed spot for the overlay — see Shop.js's
		// frozen preview instance. Each item (see Shop.js's ITEMS) is tagged
		// with a compass `slot` resolved to a card center via these offsets.
		ship: Object.freeze({ x: 270, y: 520 }),
		cardOffsetX: 175, // vp from ship center to a left/right card's center
		cardOffsetY: 210, // vp from ship center to a top/bottom card's center

		connectorColor: "#4DEFFF",
		connectorLineWidth: 1,
		connectorAlpha: 0.25,

		// Corner-bracket-framed cards (same chrome motif as the codex's preview
		// frame / the title screen's PLAY button — see core/shapes.js's
		// cornerBracketPath), not a filled box, to read as this game's UI
		// rather than a generic panel. The whole card is the tap target.
		cardWidth: 150,
		cardHeight: 90,
		cardLegSize: 12,
		cardLineWidth: 1,
		cardGlowBlur: 3,

		nameFont: '400 11px "Audiowide", "Courier New", monospace',
		nameColor: "#e8ecff",
		costFont: '400 13px "Audiowide", "Courier New", monospace',
		buyAffordableColor: "#4DEFFF",
		buyUnaffordableColor: "#4a5570", // dim — reads as "disabled," same intent as a grayed-out control
		buyOwnedColor: "#4DFF8A", // same soft green as Config.powerUps.health — "acquired" reads the same as "restored"

		footerFont: '400 11px "Audiowide", "Courier New", monospace',
		footerColor: "#aab4d4",
		footerY: 860,
		footerText: "TAP A PART TO PURCHASE",
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
			// Pushed down from an initial 56 — the mute/codex/pause row sits at
			// y=48 with a 25vp radius (bottom edge ~73, see
			// Config.playbackControls' own comment), and those buttons render
			// on top of this overlay every frame (GameplayScene draws
			// PlaybackControls after EnemyCodex; EnemyCodex draws its own
			// toggle button after its overlay too), so the old titleY sat right
			// under them and read as overlapping/cut-off text (then 85, still
			// felt tight). 100 clears the row with clear breathing room.
			titleY: 100,

			progressFont: '400 12px "Audiowide", "Courier New", monospace',
			progressColor: "#aab4d4",
			progressY: 130, // shifted down by the same amount as titleY, preserving their original 30px gap

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
	 * The player's single special skill: a screen-clearing bomb. Tap the
	 * button — bottom-right, just above the barrier's dome — to instantly
	 * kill every regular enemy currently on screen through the exact same
	 * kill pipeline a bullet hit uses (reward, explosion, SFX, even a
	 * Splitter's fragments/a PowerUp drop roll — see
	 * WaveManager.triggerSkillBomb). A boss on screen is a deliberate
	 * exception: it takes a heavy hit (Config.boss.skillBombDamageFrac of
	 * its own max health) instead of dying outright, so the button stays a
	 * strong assist rather than a fight-skipping button.
	 * Enemies still off-screen (mid entry-glide, or a Drifter clone that
	 * hasn't reached the play area yet) are untouched. Every already-fired
	 * enemy projectile on screen (bullets, rockets, drifter orbs, every
	 * boss's own bullet pool) is also wiped — see
	 * WaveManager._clearEnemyProjectiles — so the bomb doubles as a panic
	 * button against an unavoidable wall of enemy fire, not just a kill
	 * button. That wipe is silent on its own (no per-projectile explosion),
	 * so it's paired with a handful of extra explosion bursts scattered at
	 * random points across the whole screen (`burstCount`/
	 * `burstSparksPerEmit` below, see WaveManager._emitSkillBombBursts) —
	 * screen-wide feedback that reads as the bomb detonating, not bullets
	 * just vanishing.
	 * PlayerSkill.js owns just the button/cooldown itself (mirrors
	 * PlaybackControls' buttons); GameplayScene decides what happens when
	 * it's actually tapped.
	 *
	 * x/y placed against Config.barrier's geometry (baseY 940, arcHeight 70):
	 * the dome's local surface height at x=490 is ≈915vp, so y=860 (with
	 * radius 26) sits comfortably clear above it, and clear of the LVL
	 * readout (~x=421) and the right anchor post (x=540).
	 */
	playerSkill: Object.freeze({
		cooldown: 85, // seconds before it can be used again — see PlayerSkill.use()
		x: 490,
		y: 860,
		radius: 26,
		glyph: "💥",
		font: '400 24px "Audiowide", "Courier New", monospace',
		// Warm red-orange — reads as "offensive/dangerous action", distinct
		// from every other UI accent (cyan HUD chrome, gold fireBoost,
		// ice-white invincible).
		color: "#FF5C3D",
		lineWidth: 2,
		glowBlur: 12,
		pulseSpeed: 2.2, // rad/sec — idle "ready" breathing pulse while off cooldown
		pulseDepth: 0.25,

		// Dim, inert look while recharging — no pulse, just a static ring and
		// a whole-seconds countdown (same countdown-text convention as the
		// fireBoost/invincible HUD badges).
		cooldownColor: "#5a4038",
		cooldownFont: '400 18px "Audiowide", "Courier New", monospace',

		useTrauma: 0.45, // screen-shake magnitude on activation — well above an ordinary kill's (Config.screenShake.killTrauma 0.18) but below the death explosion's (Config.gameOver.deathTrauma 0.6); one shake for the whole bomb rather than per-enemy

		// Extra screen-wide bursts (see WaveManager._emitSkillBombBursts),
		// scattered at random points across the whole screen rather than tied
		// to any enemy/projectile position. _clearEnemyProjectiles wipes every
		// enemy bullet/rocket/orb pool with no per-projectile feedback of its
		// own (see that method's doc), which read as bullets silently
		// vanishing; these bursts sell that same moment as a deliberate
		// detonation and make the bomb unmistakably the cause.
		burstCount: 6, // how many extra bursts scatter across the screen per activation
		burstSparksPerEmit: 8, // below Config.particles.defaultSparksPerEmit (14) — several fire at once, so each stays modest
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
