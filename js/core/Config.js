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

		// +2% render scale per Shop-upgrade level step purchased beyond each
		// part's free starting tier (0-10 steps total across the 5 parts —
		// see Player.renderScale) — so a heavily-upgraded ship (and its added
		// wing-cannon/missile-pod/nose-spike detail) reads as visibly bigger
		// and easier to make out, both in the Shop preview and in gameplay,
		// rather than staying pinned at the same small silhouette regardless
		// of how loaded out it is. Deliberately visual only: movement bounds
		// and `hitRadius` below stay fixed at the base `scale`, so a
		// bigger-looking ship isn't also a bigger target.
		upgradeScaleGrowth: 0.02,

		damage: 1, // health points removed from an enemy per bullet hit, at level 1 — multiplied by Player.damageMultiplier (see `cannon` below) at the point of use, not baked in here
		damagePerLevel: 0.25, // added to `damage` for each level beyond 1 (level 4 → 1 + 3*0.25 = 1.75)

		// Max HP now lives on `engine.levels` below (a Shop upgrade raises the
		// ceiling) — see Player.maxHealth. `engine.levels[0].maxHealth` is the
		// free starting value, same number this flat field used to hold.
		hitRadius: 18, // vp — collision circle for enemy attacks vs the player (ship is ~32vp wide at scale 0.5)
		invulnDuration: 0.6, // seconds of grace after taking a hit — stops one attack (e.g. a laser sweep) re-hitting across several consecutive frames
		hitFlashDuration: 0.15, // seconds the hull flashes white on a hit — matches Config.enemy.hitFlashDuration

		/**
		 * The Settings panel's sensitivity slider (core/Settings.js
		 * getSensitivity(), 0–1) interpolates between these two rates for
		 * Player.update's exponential ease toward `_targetX/_targetY` — see
		 * that method for the `1 - Math.exp(-rate * dt)` idiom, the same one
		 * GameplayScene._updateMusicDuck already uses. At sensitivity 0
		 * Player skips this entirely and snaps (today's exact behavior, and
		 * the default), so these two values only ever matter once a player
		 * has actually moved the slider off zero.
		 */
		followSmoothing: Object.freeze({
			maxRate: 40, // sensitivity just above 0 — snappy, barely-perceptible trailing
			minRate: 6, // sensitivity 1 — a soft, deliberate trailing motion
		}),

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
		 * indexes into it (1-based); `cost` (absent on level 1, the free
		 * starting tier) is the Shop's gold price to reach that level — see
		 * Shop.js/Config.shop. 10 levels total (see the class doc above this
		 * block for why: small per-level bonuses, steeply multiplying costs,
		 * so maxing any one part is a long-run investment rather than a quick
		 * couple of purchases).
		 */
		magnet: Object.freeze({
			levels: Object.freeze([
				Object.freeze({ radius: 70, pullAccel: 700 }), // level 1 — starting strength, free
				Object.freeze({ radius: 81, pullAccel: 760, cost: 125 }),
				Object.freeze({ radius: 92, pullAccel: 820, cost: 190 }),
				Object.freeze({ radius: 103, pullAccel: 880, cost: 275 }),
				Object.freeze({ radius: 114, pullAccel: 940, cost: 400 }),
				Object.freeze({ radius: 125, pullAccel: 1000, cost: 575 }),
				Object.freeze({ radius: 136, pullAccel: 1060, cost: 840 }),
				Object.freeze({ radius: 147, pullAccel: 1120, cost: 1215 }),
				Object.freeze({ radius: 158, pullAccel: 1180, cost: 1750 }),
				Object.freeze({ radius: 170, pullAccel: 1250, cost: 2540 }), // level 10 — matches the old (3-level) cap, now a long-run payoff instead of a quick 2nd purchase
			]),
		}),

		/**
		 * Wings — Shop upgrade path (Player._wingsLevel indexes into `levels`,
		 * 1-based, same convention as `magnet` above; 10 levels, same
		 * small-bonus/steep-cost shape). Every level raises `fireRateMult`,
		 * multiplied into Bullets' CENTER bolt rate alongside the fireBoost
		 * PowerUp's own multiplier (see GameplayScene.update). Level 8
		 * additionally sets `sideBullets`, which makes Bullets fire two more
		 * bolts from wing-mounted offsets (Config.bullet.wing) — deliberately
		 * on their own much slower cadence (Config.bullet.wing.fireRateMult),
		 * not the center bolt's own rate, since firing all three bolts at the
		 * main gun's rate trivialized kills once a player reached it. Player.js
		 * adds a matching pair of small wing-cannon nubs to the hull
		 * silhouette at that same level, so the visual upgrade and the
		 * mechanical one land together.
		 */
		wings: Object.freeze({
			levels: Object.freeze([
				Object.freeze({ fireRateMult: 1.0 }), // level 1 — starting rate, free
				Object.freeze({ fireRateMult: 1.06, cost: 175 }),
				Object.freeze({ fireRateMult: 1.11, cost: 250 }),
				Object.freeze({ fireRateMult: 1.17, cost: 375 }),
				Object.freeze({ fireRateMult: 1.22, cost: 540 }),
				Object.freeze({ fireRateMult: 1.28, cost: 775 }),
				Object.freeze({ fireRateMult: 1.33, cost: 1125 }),
				Object.freeze({
					fireRateMult: 1.39,
					sideBullets: true,
					cost: 1640,
				}),
				Object.freeze({ fireRateMult: 1.44, cost: 2375 }),
				Object.freeze({ fireRateMult: 1.5, cost: 3450 }), // level 10
			]),
		}),

		/**
		 * Engine — Shop upgrade path (Player._engineLevel, same convention as
		 * `magnet`/`wings` above; 10 levels). Each level raises `maxHealth`
		 * (see Player.maxHealth, HUD's health bar) — level 1's value is this
		 * ship's free starting max HP, the exact number the old flat
		 * `Config.player.maxHealth` field used to hold. `flameGrowthPerLevel`
		 * is a flat per-level multiplier bonus applied to the thruster flame's
		 * `flame.baseLength`/`glowBlur` (see Player._renderFlame) — a bigger,
		 * brighter engine reads as more powerful without needing a whole
		 * separate hull shape per level.
		 */
		engine: Object.freeze({
			flameGrowthPerLevel: 0.05, // +5% flame length/glow per level beyond 1 (lowered to match the gentler 10-level stat curve below)
			levels: Object.freeze([
				Object.freeze({ maxHealth: 100 }), // level 1 — free starting HP
				Object.freeze({ maxHealth: 115, cost: 200 }),
				Object.freeze({ maxHealth: 130, cost: 290 }),
				Object.freeze({ maxHealth: 148, cost: 415 }),
				Object.freeze({ maxHealth: 166, cost: 600 }),
				Object.freeze({ maxHealth: 184, cost: 875 }),
				Object.freeze({ maxHealth: 202, cost: 1265 }),
				Object.freeze({ maxHealth: 220, cost: 1825 }),
				Object.freeze({ maxHealth: 240, cost: 2650 }),
				Object.freeze({ maxHealth: 260, cost: 3840 }), // level 10
			]),
		}),

		/**
		 * Cannon — Shop upgrade path (Player._cannonLevel, same convention as
		 * `magnet`/`wings`/`engine` above; 10 levels). Each level raises
		 * `damageMult`, multiplied into every player bullet AND missile hit
		 * alongside the fireBoost PowerUp's own multiplier (see
		 * GameplayScene._checkCollisions/the missile onHit callback) — this is
		 * what the barrier's PWR readout displays. Level 8 additionally sets
		 * `noseSpike`, which adds a small forward spike to the hull silhouette
		 * (see Player.hasNoseSpike/`_rebuildExtraPaths`), reading as a bigger
		 * main gun. Like `wings.sideBullets`/`missiles.wingMount`, this only
		 * needs to be set on the ONE level that first unlocks it — Player.js's
		 * flag getters stay true at every level after that automatically (see
		 * Player.js's own `hasReachedFlag` helper).
		 */
		cannon: Object.freeze({
			levels: Object.freeze([
				Object.freeze({ damageMult: 1.0 }), // level 1 — starting damage, free
				Object.freeze({ damageMult: 1.09, cost: 200 }),
				Object.freeze({ damageMult: 1.18, cost: 290 }),
				Object.freeze({ damageMult: 1.27, cost: 415 }),
				Object.freeze({ damageMult: 1.36, cost: 600 }),
				Object.freeze({ damageMult: 1.45, cost: 875 }),
				Object.freeze({ damageMult: 1.54, cost: 1265 }),
				Object.freeze({
					damageMult: 1.64,
					noseSpike: true,
					cost: 1825,
				}), // level 8 — see Player.hasNoseSpike
				Object.freeze({ damageMult: 1.73, cost: 2650 }),
				Object.freeze({ damageMult: 1.82, cost: 3840 }), // level 10
			]),
		}),

		/**
		 * Missiles — a Shop-only weapon (Player._missileLevel, same convention
		 * as `magnet`/`wings`/`engine`/`cannon` above; 10 levels): level 1 is
		 * locked (`unlocked: false`, no missile ever fires); buying level 2
		 * turns the mechanic on outright rather than just tuning a number,
		 * since there's no meaningful "half a missile launcher." See
		 * PlayerMissiles.js for the homing/pooling mechanics themselves
		 * (deliberately modeled on Config.rocket/Rockets.js — an enemy
		 * Rocketeer's weapon — since both are homing projectiles that
		 * detonate on proximity or timeout).
		 *
		 * `damageMult` is a multiplier on the player's wave-level-scaled base
		 * bullet damage (`WaveManager._playerDamage`) rather than a flat
		 * number — GameplayScene composes it with `Player.damageMultiplier`
		 * (the cannon upgrade) the same way it already composes the fireBoost
		 * PowerUp's multiplier into `handleBulletHit`'s own `damageMultiplier`
		 * param, so a missile automatically keeps pace with both cannon
		 * upgrades and level scaling instead of needing its own separate
		 * damage curve. Level 8 additionally sets `wingMount`, which makes
		 * PlayerMissiles alternate its launch point between the ship's
		 * left/right wing pods (see Player.hasWingMissilePods) instead of
		 * firing from dead-center — the mechanical unlock (level 2) and the
		 * visible wing pods (level 8) land on separate levels on purpose, per
		 * the user's own request that the pods appear "later on," after
		 * missiles are already flying.
		 */
		missiles: Object.freeze({
			color: "#4DEFFF", // matches Config.player.color (can't reference it directly — this literal is still being built) so a missile in flight visibly reads as "mine," not an enemy projectile
			lineWidth: 2,
			glowBlur: 7, // trimmed alongside the smaller body below — a full-size halo on a shrunk body read as oversized/blobby
			bodyFillColor: "#0d2b30", // dark cyan-tinted fill, same "dark version of the stroke hue" convention Config.rocket.bodyFillColor uses for its own (amber) body
			halfLen: 5, // vp — half-length of the rendered dart body, see Config.rocket.halfLen
			bodyHalfWidth: 2.5,
			speed: 380, // vp/sec — deliberately slow and weighty; this is a support weapon that leans on homing/retargeting (see PlayerMissiles.update), not on outrunning anything
			turnRate: 3.0, // rad/sec homing turn rate
			proximityRadius: 20, // vp — detonation distance to a live target
			noTargetAccel: 1400, // vp/sec^2 — applied instead of homing once a missile has no live enemy left to retarget onto (see PlayerMissiles.update), so it visibly rushes off-screen and despawns quietly rather than detonating in place or drifting at cruise speed
			launchSwingAngleMin: 1.05, // rad (~60°) — minimum magnitude of the random left/right offset applied to a missile's initial launch heading (see PlayerMissiles._fire)
			launchSwingAngleMax: 1.75, // rad (~100°) — maximum magnitude; deliberately past 90° so a shot at a target dead overhead can visibly launch off to the side and dip below-horizontal before homing corrects it, instead of just leaning off-straight
			homingDelay: 0.15, // seconds a freshly-launched missile flies dead straight along its swung heading before homing (turnRate) engages — splits the flight into two readable beats, "swing out" then "curve onto the target", rather than one continuous gentle bend that's easy to miss among the player's own bullets
			maxLife: 5, // seconds before an unfulfilled missile just times out
			fadeStart: 4, // seconds — begins fading out in its final second of life, same shape as Config.rocket.fadeStart
			poolSize: 8,
			trailHistory: 6,
			trailStep: 0.03,
			wingOffsetX: 16, // vp — left/right launch offset once `wingMount` is active, see Player.hasWingMissilePods
			wingOffsetY: 6,
			levels: Object.freeze([
				Object.freeze({ unlocked: false }), // level 1 — locked, free (nothing to buy yet)
				Object.freeze({
					unlocked: true,
					interval: 4.0,
					damageMult: 3.0,
					cost: 375,
				}),
				Object.freeze({
					unlocked: true,
					interval: 3.7,
					damageMult: 3.6,
					cost: 540,
				}),
				Object.freeze({
					unlocked: true,
					interval: 3.4,
					damageMult: 4.2,
					cost: 775,
				}),
				Object.freeze({
					unlocked: true,
					interval: 3.1,
					damageMult: 4.8,
					cost: 1125,
				}),
				Object.freeze({
					unlocked: true,
					interval: 2.8,
					damageMult: 5.4,
					cost: 1625,
				}),
				Object.freeze({
					unlocked: true,
					interval: 2.5,
					damageMult: 6.0,
					cost: 2350,
				}),
				Object.freeze({
					unlocked: true,
					interval: 2.3,
					damageMult: 6.6,
					wingMount: true,
					cost: 3415,
				}),
				Object.freeze({
					unlocked: true,
					interval: 2.1,
					damageMult: 7.2,
					cost: 4950,
				}),
				Object.freeze({
					unlocked: true,
					interval: 1.9,
					damageMult: 8.0,
					cost: 7175,
				}), // level 10
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
		// transition (every level after that). Which of the two fires depends
		// on whether the entered level is a boss level (Config.bossSchedule) —
		// see GameplayScene._isBossLevel.
		normalAudioSrc: "assets/audio/normal-level.mp3",
		bossAudioSrc: "assets/audio/boss-level.mp3",
		normalRepeatCount: 3, // normal-level stinger loops back-to-back this many times (AudioPool.play's repeatCount) — the clip alone reads as too short/abrupt
		bossRepeatCount: 2, // boss-level stinger loops back-to-back this many times — same reasoning, fewer repeats since the boss clip reads as more substantial on its own
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
	 * Config.missionWaves.levels[N-1] via GameplayScene constructed with
	 * `{ mode: 'mission', level: N }`, and ends the instant that single
	 * level's wave clears — no auto-advance to N+1 like Survival Mode does.
	 * Mission Mode's wave content (Config.missionWaves) and boss schedule
	 * (Config.bossSchedule.mission) are deliberately SEPARATE from Survival
	 * Mode's (Config.waves, Config.bossSchedule.survival) — see
	 * WaveManager's `mode`-driven `_resolveLevelAndBoss` — so either mode's
	 * pacing/composition can be tuned without touching the other. `count`
	 * is the full campaign: 50 missions, a boss every 5th level (see
	 * Config.bossSchedule.mission) — bump it (and add matching entries to
	 * Config.missionWaves.levels) whenever the campaign grows further.
	 */
	mission: Object.freeze({
		count: 50,
	}),

	/**
	 * Mission Mode's own wave content — same shape as Config.waves
	 * (`{ simultaneous, levels: [...] }`; see that key's doc for the
	 * per-level `enemies` group shape), kept as a fully independent array
	 * so mission levels can diverge from whatever Survival Mode plays at
	 * the same level number (see Config.mission's doc for why).
	 *
	 * The full 50-level campaign, organized as ten five-level chapters —
	 * levels 1-4/6-9/11-14/... are real hand-authored content, levels
	 * 5/10/15/.../50 are boss levels (Config.bossSchedule.mission), so
	 * WaveManager intercepts those before ever reading this array (see the
	 * comment on Survival's level-7 entry above for why the boss-index
	 * slots are still kept as real, playable fallback content rather than
	 * placeholders). Each chapter ends on one boss, in the roster's
	 * original introduction order. Composition (types × overlap × spawn
	 * density), not raw stat inflation, is the difficulty lever — HP still
	 * climbs on its own via each type's `healthPerLevel` (Config.enemy /
	 * Config.boss) exactly like Survival Mode. New enemy types debut in a
	 * gentle, legible order: Scout (1) → Rocketeer (2) → Diver (3) →
	 * Sniper (4) → Drifter (6) → Sweeper (7) → Weaver (8) → Bouncer (11) →
	 * Splitter (16) → Shielded (18) — the full 10-type roster is complete
	 * by level 18, leaving the back half of the campaign to ramp overlap
	 * and density with everything already introduced, the same philosophy
	 * Survival Mode's own doc comment describes. Levels 1-3 are
	 * deliberately gentle (small counts, generous spawnIntervals, Scout
	 * only on level 1) so new players get a real on-ramp before Sniper (4)
	 * and the campaign's first boss (5). The back half's floor never drops
	 * far below Survival's own endless-mode ceiling (its level 30, "The
	 * Reckoning") — this is a one-time finale climb, not a sustained loop,
	 * so a small spike right at level 49 (the last non-boss level, one step
	 * before the campaign's final boss) is intentional rather than a
	 * balance bug.
	 */
	missionWaves: Object.freeze({
		simultaneous: true,
		// Seconds of breathing room after a level (re)starts before the first
		// enemy group's spawn timer begins counting down — see Config.waves'
		// own `startDelay` doc for why this lives per-mode alongside `simultaneous`.
		startDelay: 2,
		levels: Object.freeze([
			// ---- Chapter 1 — First Contact (boss: Scout Prime, L5) ----
			// Level 1 — {Scout}. Easy on purpose — three small, escalating
			// bursts so a first-time player can just aim and shoot.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 2, spawnInterval: 2.6 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 2.4 }),
				Object.freeze({ type: "scout", count: 2, spawnInterval: 2.2 }),
			]) }),
			// Level 2 — {Scout, Rocketeer}. Still gentle — Rocketeer's homing
			// arrives lightly, overlapping just a little with Scout.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 2.4 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.7 }),
				Object.freeze({ type: "scout", count: 2, spawnInterval: 2.2 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.4 }),
			]) }),
			// Level 3 — {Scout, Rocketeer, Diver}. Last of the "easy" on-ramp
			// — two lone Diver ambushes while Scout/Rocketeer stay light.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 2.3 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "diver", count: 1, spawnInterval: 3.6 }),
				Object.freeze({ type: "scout", count: 2, spawnInterval: 2.1 }),
				Object.freeze({ type: "diver", count: 1, spawnInterval: 3.4 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.3 }),
			]) }),
			// Level 4 — {+Sniper}. The real difficulty step-up: reading a
			// Sniper telegraph while Scout/Rocketeer/Diver keep pressuring.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 2.2 }),
				Object.freeze({ type: "sniper", count: 1, spawnInterval: 3.6 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.4 }),
				Object.freeze({ type: "diver", count: 1, spawnInterval: 3.3 }),
				Object.freeze({ type: "sniper", count: 1, spawnInterval: 3.3 }),
				Object.freeze({ type: "scout", count: 2, spawnInterval: 2.0 }),
			]) }),
			// Level 5 — BOSS: Scout Prime. Array entry unreachable while
			// Config.bossSchedule.mission.everyNLevels === 5 (WaveManager
			// intercepts first) — kept as real fallback content anyway.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 3.3 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 2.3 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 3.2 }),
				Object.freeze({ type: "scout", count: 2, spawnInterval: 2.0 }),
			]) }),

			// ---- Chapter 2 — Alien Signals (boss: Spiral, L10) ----
			// Level 6 — {+Drifter}. First alien-family arrival, dropped in
			// while the ship-family threats are still live.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 5.0 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.4 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 3.2 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 4.8 }),
				Object.freeze({ type: "diver", count: 1, spawnInterval: 3.2 }),
			]) }),
			// Level 7 — {+Sweeper}.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 5.0 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 2.0 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 3.1 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 4.8 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 4.6 }),
			]) }),
			// Level 8 — {+Weaver}. The Drifter family's full four-variant set
			// is now in rotation.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 4.6 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 4.6 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 4.6 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 3.0 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 4.4 }),
			]) }),
			// Level 9 — Alien ramp — all four Drifter-family variants at once
			// under steady ship-family pressure.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 4.4 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 4.4 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 4.2 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 3.0 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.9 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 2.2 }),
			]) }),
			// Level 10 — BOSS: Spiral. Dead entry (see Level 5's comment).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 4.2 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 4.2 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 4.0 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 2.9 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.8 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 2.1 }),
			]) }),

			// ---- Chapter 3 — Kinetic Threat (boss: Bouncer Primal, L15) ----
			// Level 11 — {+Bouncer}.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 3.4 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 2.2 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 3.0 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 3.2 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 4.2 }),
			]) }),
			// Level 12 — Bouncer + alien mix.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 3.2 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 4.2 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 2.9 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.9 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 3.0 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 4.0 }),
			]) }),
			// Level 13 — Bouncer + full ship-family, heavier overlap.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 3.0 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 4.0 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.8 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 3.8 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 2.9 }),
			]) }),
			// Level 14 — Heavy Bouncer + full-roster preview.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 2.9 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 3.8 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 2.7 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 2.7 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 2.0 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 3.8 }),
			]) }),
			// Level 15 — BOSS: Bouncer Primal. Dead entry (see Level 5).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 2.8 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 3.7 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 2.6 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 2.6 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.9 }),
			]) }),

			// ---- Chapter 4 — Fractures (boss: Snake, L20) ----
			// Level 16 — {+Splitter}.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 4.4 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 2.9 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.6 }),
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 4.2 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.9 }),
			]) }),
			// Level 17 — Splitter + Bouncer mix.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 4.0 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 2.8 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 3.6 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.6 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 3.8 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 1.9 }),
			]) }),
			// Level 18 — {+Shielded}. Full 10-type roster is now unlocked.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "shielded", count: 1, spawnInterval: 4.4 }),
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 3.8 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 2.7 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 3.6 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.6 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "shielded", count: 1, spawnInterval: 4.2 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.8 }),
			]) }),
			// Level 19 — Full-roster gauntlet — everything introduced so far,
			// all at once.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.6 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 1.8 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.4 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 3.5 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 3.5 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 3.4 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 2.6 }),
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 3.6 }),
				Object.freeze({ type: "shielded", count: 1, spawnInterval: 4.0 }),
			]) }),
			// Level 20 — BOSS: Snake. Dead entry (see Level 5).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "rocketeer", count: 2, spawnInterval: 1.7 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 3.4 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 3.4 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 2.4 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 3.3 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 3.5 }),
				Object.freeze({ type: "shielded", count: 1, spawnInterval: 3.9 }),
			]) }),

			// ---- Chapter 5 — Escalation (boss: Tetra, L25) ----
			// Level 21 — density ramp, full roster.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 2.4 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 3.3 }),
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 3.3 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 3.2 }),
			]) }),
			// Level 22 — alien-heavy.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 3.2 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 3.2 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 3.2 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.2 }),
				Object.freeze({ type: "bouncer", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.5 }),
			]) }),
			// Level 23 — mechanical-heavy (Bouncer/Splitter/Shielded).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 2.2 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 3.1 }),
				Object.freeze({ type: "shielded", count: 1, spawnInterval: 3.5 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.4 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.6 }),
				Object.freeze({ type: "sniper", count: 2, spawnInterval: 2.1 }),
			]) }),
			// Level 24 — full roster, tight overlap.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.4 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.6 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 3.1 }),
				Object.freeze({ type: "sweeper", count: 1, spawnInterval: 3.1 }),
				Object.freeze({ type: "diver", count: 2, spawnInterval: 2.2 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 3.0 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 3.1 }),
				Object.freeze({ type: "shielded", count: 1, spawnInterval: 3.5 }),
			]) }),
			// Level 25 — BOSS: Tetra. Dead entry (see Level 5).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.4 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 2.0 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 2.0 }),
				Object.freeze({ type: "splitter", count: 1, spawnInterval: 3.0 }),
				Object.freeze({ type: "shielded", count: 1, spawnInterval: 3.4 }),
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 3.0 }),
			]) }),

			// ---- Chapter 6 — Overdrive (boss: Nova, L30) ----
			// Level 26.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.4 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 2.0 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 2.0 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 3.0 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.9 }),
			]) }),
			// Level 27.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 1, spawnInterval: 2.9 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.9 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 2.9 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 2.0 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "scout", count: 3, spawnInterval: 1.3 }),
			]) }),
			// Level 28.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.8 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 3.2 }),
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 1.9 }),
			]) }),
			// Level 29 — full-roster max density before the chapter's boss.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.7 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.7 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 2.0 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.7 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.8 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 3.1 }),
			]) }),
			// Level 30 — BOSS: Nova. Dead entry (see Level 5).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.4 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.7 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 3.0 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.6 }),
			]) }),

			// ---- Chapter 7 — Storm Front (boss: Pulsor, L35) ----
			// Level 31.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.4 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.6 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.6 }),
			]) }),
			// Level 32.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.6 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.6 }),
				Object.freeze({ type: "weaver", count: 1, spawnInterval: 2.5 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 1.9 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.2 }),
			]) }),
			// Level 33.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 2.9 }),
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.2 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.4 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 1.7 }),
			]) }),
			// Level 34.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.2 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.7 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 1.8 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.4 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 2.9 }),
			]) }),
			// Level 35 — BOSS: Pulsor. Dead entry (see Level 5).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.2 }),
				Object.freeze({ type: "rocketeer", count: 3, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.5 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 2.8 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.4 }),
			]) }),

			// ---- Chapter 8 — Gauntlet (boss: Zigzag, L40) ----
			// Level 36.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.2 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.7 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.7 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.4 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.4 }),
			]) }),
			// Level 37.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.4 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.4 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 1.7 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.6 }),
				Object.freeze({ type: "bouncer", count: 3, spawnInterval: 1.6 }),
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.1 }),
			]) }),
			// Level 38.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.6 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.3 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 2.7 }),
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.2 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.6 }),
			]) }),
			// Level 39.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.2 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.6 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 1.6 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.2 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.6 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 2.7 }),
			]) }),
			// Level 40 — BOSS: Zigzag. Dead entry (see Level 5).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 4, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.2 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 2, spawnInterval: 2.3 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 2.6 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.2 }),
			]) }),

			// ---- Chapter 9 — Endgame (boss: Phoenix, L45) ----
			// Level 41.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 5, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.2 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.2 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.2 }),
			]) }),
			// Level 42.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.2 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.2 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.1 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 1.6 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "scout", count: 5, spawnInterval: 1.1 }),
			]) }),
			// Level 43.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "shielded", count: 3, spawnInterval: 2.5 }),
				Object.freeze({ type: "scout", count: 5, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
			]) }),
			// Level 44.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 5, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.1 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.1 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.0 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "shielded", count: 2, spawnInterval: 2.4 }),
			]) }),
			// Level 45 — BOSS: Phoenix. Dead entry (see Level 5).
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 5, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "shielded", count: 3, spawnInterval: 2.4 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.0 }),
			]) }),

			// ---- Chapter 10 — Final Stand (boss: Electron, L50) ----
			// Level 46.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 5, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.0 }),
			]) }),
			// Level 47.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.0 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.0 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.0 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "scout", count: 5, spawnInterval: 1.1 }),
			]) }),
			// Level 48.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "shielded", count: 3, spawnInterval: 2.4 }),
				Object.freeze({ type: "scout", count: 6, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 4, spawnInterval: 1.5 }),
			]) }),
			// Level 49 — the campaign's final non-boss gauntlet: the entire
			// 10-type roster, at its highest density, one step before Electron.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 6, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 5, spawnInterval: 1.5 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.0 }),
				Object.freeze({ type: "sweeper", count: 2, spawnInterval: 2.0 }),
				Object.freeze({ type: "diver", count: 3, spawnInterval: 1.5 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.0 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "shielded", count: 3, spawnInterval: 2.4 }),
			]) }),
			// Level 50 — BOSS: Electron, the campaign's final boss. Dead
			// entry (see Level 5) — the true finale content lives in
			// Config.boss.electron, not here.
			Object.freeze({ enemies: Object.freeze([
				Object.freeze({ type: "scout", count: 6, spawnInterval: 1.1 }),
				Object.freeze({ type: "rocketeer", count: 4, spawnInterval: 1.3 }),
				Object.freeze({ type: "sniper", count: 5, spawnInterval: 1.5 }),
				Object.freeze({ type: "bouncer", count: 4, spawnInterval: 1.5 }),
				Object.freeze({ type: "splitter", count: 3, spawnInterval: 2.1 }),
				Object.freeze({ type: "shielded", count: 3, spawnInterval: 2.4 }),
				Object.freeze({ type: "drifter", count: 2, spawnInterval: 2.0 }),
				Object.freeze({ type: "weaver", count: 2, spawnInterval: 2.0 }),
			]) }),
		]),
	}),

	/**
	 * MissionSelectScene — the level-select screen reached after choosing
	 * MISSION MODE on the title card and finishing the tutorial. One node
	 * per mission (Config.mission.count, 50), laid out as a zigzag journey
	 * map (odd levels left, even levels right — see
	 * MissionSelectScene._nodeCenter) and joined by a connector path (see
	 * _renderPath) rather than a plain vertical stack — locked (dim),
	 * unlocked-not-completed (cyan), or completed (green) — see
	 * MissionProgress.js for the unlock/completion rules and
	 * MissionSelectScene.js for the node content.
	 *
	 * 50 nodes don't fit in one screen (nodeStartY + 49 * nodeSpacingY is
	 * far taller than Config.virtual.height), so the scene is a vertically
	 * drag-scrollable map — see MissionSelectScene's handlePointerDown/
	 * Move/Up (same optional-handler convention GameplayScene's ship-drag
	 * uses) — clamped to the content's bounds and auto-scrolled on open to
	 * whichever mission the player would tap next, so returning players
	 * aren't stranded at level 1's node every time.
	 *
	 * Every 5th node (Config.bossSchedule.mission.everyNLevels) is a boss
	 * level — those get a larger radius, the game's shared "danger red"
	 * accent (bossColor, same color GameplayScene's "BOSS INCOMING"
	 * subtitle uses), a diamond hazard ring (core/shapes.js's diamondPath,
	 * the same reusable emblem shape as everywhere else in the game's
	 * sci-fi chrome) instead of a plain circle-only ring, and the boss's
	 * own name (Config.boss[key].name) in place of "MISSION N" — so the
	 * shape alone reads as "boss round" even under colorblindness, not
	 * just the color.
	 */
	missionSelect: Object.freeze({
		fadeInDuration: 0.3,

		titleFont: '400 20px "Audiowide", "Courier New", monospace',
		titleColor: "#4DEFFF",
		titleY: 70,

		backLabel: "◀ BACK",
		backFont: '400 14px "Audiowide", "Courier New", monospace',
		backColor: "#aab4d4",
		backX: 20,
		backY: 34,
		backHitWidth: 100, // generous tap target, same "wider than the text itself" philosophy used throughout the game's tap targets
		backHitHeight: 48, // bumped from 40 toward a real CSS-px touch-target size, not just virtual px — see Config.playbackControls' own comment for the scale math

		// Node centers: y increases per level (top to bottom), x alternates
		// between vW/2 - nodeXOffset and vW/2 + nodeXOffset (zigzag). This is
		// CONTENT space — MissionSelectScene subtracts its live scroll offset
		// before drawing/hit-testing, so these stay fixed regardless of scroll.
		nodeStartY: 190,
		nodeSpacingY: 150,
		nodeXOffset: 110,
		nodeRadius: 42,
		nodeHitRadius: 56, // generous tap target beyond the drawn ring, same philosophy as backHitWidth
		nodeLineWidth: 2.5,
		nodeGlowBlur: 6,
		nodeNumberFont: '400 28px "Audiowide", "Courier New", monospace',

		labelGap: 20, // vertical gap from a node's bottom edge to its "MISSION N" label
		statusGap: 20, // vertical gap from the name label down to the status label

		// Connector line between consecutive nodes — lights up (unlockedColor,
		// glowing, solid) once its source mission is completed, otherwise
		// dashed in lockedColor to read as "path ahead, not yet open".
		pathLineWidth: 3,
		pathGlowBlur: 6,
		pathLockedDash: [10, 8],

		nameFont: '400 20px "Audiowide", "Courier New", monospace',
		statusFont: '400 13px "Audiowide", "Courier New", monospace',

		unlockedColor: "#4DEFFF", // ready to play — same cyan as everything else interactive
		completedColor: "#4DFF8A", // same soft green as Config.powerUps.health / Shop's OWNED color
		lockedColor: "#4a5570", // dim — same "disabled" read as Shop's unaffordable color

		// Boss-node styling — layered on top of the normal locked/unlocked/
		// completed color above, not a replacement for it (a locked boss
		// node still reads as locked).
		bossColor: "#ff3b3b", // same "danger red" as Config.boss.intro's BOSS INCOMING subtitle
		bossRadiusBonus: 10, // added to nodeRadius so boss nodes stand out by size too
		bossRingScale: 1.55, // diamondPath half-size, relative to the boss node's radius
		bossRingLineWidth: 2.5,
		bossRingGlowBlur: 8,
		bossLabelFont: '400 15px "Audiowide", "Courier New", monospace', // boss name, replacing "MISSION N"

		mapClipTopY: 110, // nodes whose circle would rise above this (behind the fixed title) are skipped entirely rather than drawn half-obscured

		// Vertical drag-scroll — scrollY is clamped to [0, maxScroll], where
		// scrollY: 0 shows the top of the map (level 1, at nodeStartY) and
		// maxScroll pins the last level's node scrollBottomPadding above the
		// bottom of Config.virtual (see MissionSelectScene._maxScrollY).
		// Nothing is canvas-clipped — there's little enough on this screen
		// that drawing the handful of off-screen nodes too is cheap.
		scrollBottomPadding: 90, // breathing room below the last node's status label
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

		/**
		 * The "last 5 runs" list — core/RunHistory.js's local comparison
		 * point, since bestScore alone (HUD's own wallet) never showed a
		 * player how a run stacked up against their recent form, only their
		 * single all-time peak. Sits well below `promptOffsetY` (680vp),
		 * in the ~280vp of untouched space before the 960vp bottom edge, so
		 * it never competes with the REVIVE CTA or the restart prompt above
		 * it. Row 0 (the run just played) is drawn in `currentColor` instead
		 * of `entryColor` — same "highlight the current one" language
		 * DailyRewardPanel's streak strip already uses for today's pip —
		 * confirming to the player that this run just landed on the list.
		 */
		history: Object.freeze({
			titleText: "LAST 5 RUNS",
			titleFont: '400 13px "Audiowide", "Courier New", monospace',
			titleColor: "#aab4d4",
			titleY: 742,
			entryFont: '400 13px "Courier New", monospace',
			entryColor: "#aab4d4",
			currentColor: "#4DEFFF", // this run's own row — matches Config.player.color
			startY: 768,
			lineHeight: 20,
		}),

		/**
		 * SHARE SCORE — Web Share API (clipboard-copy fallback), see
		 * core/Share.js. `label` swaps briefly to whatever
		 * `shareScore()` resolved to (`sharedLabel`/`copiedLabel`) so the tap
		 * has visible feedback even though nothing else on screen changes;
		 * GameplayScene reverts it after `feedbackDuration` seconds.
		 */
		shareButton: Object.freeze({
			offsetY: 420, // vp below the title, well under the history list above it
			width: 200,
			height: 42,
			legSize: 10,
			color: "#4DEFFF",
			lineWidth: 1.5,
			glowBlur: 6,
			font: '400 14px "Audiowide", "Courier New", monospace',
			label: "SHARE SCORE",
			sharedLabel: "SHARED!",
			copiedLabel: "COPIED!",
			feedbackDuration: 1.6,
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
	 * Shop's OWNED color) rather than the alarm red of GAME OVER.
	 *
	 * `revealDelay` holds the overlay back briefly after the wave actually
	 * clears — same `Math.max(0, age - delay)` fade-clock idiom
	 * `_renderGameOver` uses for its own `explosionDelay` — so the player
	 * gets a clear beat on the just-cleared, undimmed screen (no more
	 * enemies, no new wave) before the result popup covers it, rather than
	 * the popup slamming in the instant the last enemy dies.
	 */
	missionComplete: Object.freeze({
		revealDelay: 0.6, // seconds the cleared screen sits undimmed before the overlay starts fading in
		fadeInDuration: 0.6,
		dimAlpha: 0.75,
		// Covers revealDelay + fadeInDuration (1.2s) with a small margin, same
		// reasoning as Config.gameOver.minRestartDelay — a tap can't continue
		// before the overlay has even finished appearing.
		minContinueDelay: 1.3,
		titleText: "MISSION COMPLETE",
		titleFont: '400 44px "Audiowide", "Courier New", monospace',
		titleColor: "#4DFF8A",
		titleGlowBlur: 16,
		promptText: "TAP TO CONTINUE",
		promptFont: '400 18px "Audiowide", "Courier New", monospace',
		promptColor: "#aab4d4",
		promptOffsetY: 60,
		// Plays once, on trigger — see GameplayScene._triggerMissionComplete.
		audioSrc: "assets/audio/success.mp3",
		audioVolume: 0.7,

		/**
		 * Fireworks-style celebration — a handful of the same pooled
		 * shockwave-ring+spark bursts every enemy death already uses
		 * (entities/Particles.js), just scattered across the upper screen and
		 * cycling through a few colors instead of one explosion at one spot,
		 * so the moment reads as "celebrating" rather than "something died."
		 * All `burstCount` bursts are scheduled the instant
		 * `_triggerMissionComplete` fires (same "already mid-burst by the
		 * first real render" timing DailyRewardPanel's own celebratory burst
		 * uses), staggered `burstInterval` seconds apart by
		 * GameplayScene._updateCelebrationBursts — so they're popping over the
		 * just-cleared, undimmed screen through most of `revealDelay`, then
		 * finish out right as the title itself fades in.
		 */
		celebration: Object.freeze({
			burstCount: 6,
			burstInterval: 0.15, // seconds between each burst popping — last one lands at ~0.75s, just ahead of revealDelay (0.6s) + the title's own fade-in starting
			sparkCount: 18, // per burst — below Config.particles.defaultSparksPerEmit(14)*2, keeps 6 staggered bursts well under the shared spark pool
			spreadX: 170, // vp either side of center the bursts scatter across
			minY: 300, maxY: 620, // vp band the bursts scatter within — brackets the title's own vH/2 (480) position without landing on top of the text
			// Cycles round-robin across bursts (see _updateCelebrationBursts) so
			// consecutive pops alternate color instead of repeating one hue.
			colors: ["#4DFF8A", "#4DEFFF", "#FFDE59"], // titleColor's green, Config.player.color's cyan, Config.gold.color's gold
		}),
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

		// Wing-mounted side bolts, fired once Player.hasSideBullets is true
		// (Config.player.wings level 8) — see Bullets.update. Deliberately on
		// their OWN slower cooldown (`fireRateMult`, a fraction of the center
		// bolt's current rate) rather than firing every center-bolt volley —
		// three simultaneous bolts at the main gun's full rate trivialized
		// kills the moment a player reached the upgrade, so the side guns are
		// a much slower support stream instead of tripling the main output
		// outright. Offsets are authored independently of the hull's own
		// wing-cannon-nub geometry (Player.js) so either can be retuned
		// without touching the other.
		wing: Object.freeze({
			offsetX: 16, // vp — left/right of player.x
			offsetY: -4, // vp — relative to player.y, shallower than spawnOffsetY since the wing cannons sit further back than the nose
			fireRateMult: 0.3, // side bolts fire at ~30% of the center bolt's current rate — roughly one wing volley per 3 center shots
		}),

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
	 * The opening cinematic — deliberately unskippable, and plays exactly
	 * once per player, ever: the very first time they reach it (see
	 * PrologueScene's class doc and core/PrologueProgress.js). Every later
	 * launch boots straight to the title card instead. Structured as a fixed
	 * sequence of "beats" (see PrologueScene): a year card sets the scene,
	 * three wireframe portals tear open, the commander's mandatory briefing
	 * types itself out, the whole assembly fades to black, and finally the
	 * game's title card — "3290", deliberately doubling as the year —
	 * appears with the PLAY button that gates entry into actual gameplay.
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
		 * (silence, then "it just ended"), so the very next beat (the sky
		 * revealing itself and the commander's briefing cutting in) reads as
		 * the thing that was just promised rather than a surprise. A "three
		 * hundred years" motif the briefing beat echoes back later.
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
		 * Beat 2: the sky reveals itself (Starfield fading in — see
		 * `skyFadeInDuration`) as the commander's voice cuts in over comms —
		 * a typewriter-revealed briefing, centered in the middle of the
		 * screen with a signal-interference flicker (see
		 * PrologueScene._renderBriefingText/core/animation.js's
		 * flickerAlpha) as its only visual effect — the whole transmission
		 * reads as weak and on the edge of dropping out, no portals or
		 * sample enemies needed to sell "something is wrong with the sky".
		 * There's no skip control on this (or any) beat — the cinematic is
		 * deliberately unskippable, see the `prologue` block's own doc above.
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
			skyFadeInDuration: 1.6, // seconds for the Starfield to fade in once this beat starts
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

		/** Beat 3: the assembled scene dissolves to black — see Renderer.clear's translucent-overlay technique. */
		fadeOutDuration: 1.2,

		/**
		 * Beat 4: the title card. "3290" is the game's name, deliberately
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
			taglineFont: '400 12px "Audiowide", "Courier New", monospace', // bumped from 10px for legibility at real device scale
			taglineColor: "#aab4d4", // same as other UI text, kept dim via alpha in render
			chromeColor: "#4DEFFF", // decorative HUD lines and bracket ticks
			chromeLineWidth: 1,
			chromeGlowBlur: 6,
			fadeInDuration: 1.0,
			exitFadeDuration: 0.55, // seconds — black veil that falls over the title when a mode button is tapped

			// One-shot sting that plays shortly after the main menu (this title
			// card) is reached — see PrologueScene._updateMenuAudio, driven off
			// `_beatAge` so it lands `menuAudioDelay` seconds into the beat
			// rather than in the same instant as the title's own fade-in.
			// AudioPool never loops a clip on its own, so this fires exactly
			// once per arrival rather than repeating.
			menuAudioSrc: "assets/audio/menu.mp3",
			menuAudioVolume: 0.7,
			menuAudioDelay: 0.6,

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
	 * technique PrologueScene's own fadeOut beat uses to dissolve
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
		cardLegSize: 16, // matches Config.codex.overlay.frameLegSize — both are the "large full-screen panel" tier
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
		// the card's top edge (like an achievement badge), scaled up from
		// whichever real drop-up the reward corresponds to (Config.gold's coin
		// palette for 'gold', Config.powerUps.invincible's for 'shieldStart' —
		// see DailyRewardPanel._renderGoldIcon/_renderShieldStartIcon) so the
		// badge reads as "the same pickup you see in a run," not a lookalike.
		// luckyDrop has no in-game pickup of its own, so it borrows the
		// health pickup's green body (Config.powerUps.health) with a filled
		// sparkle glyph in the same iconFillColor white PowerUps uses for its
		// own cross/diamond/bolt glyphs — see _renderLuckyDropIcon.
		iconBadge: Object.freeze({
			radius: 42,
			lineWidth: 2.5,
			glowBlur: 14,
		}),

		nameFont: '400 20px "Audiowide", "Courier New", monospace',
		valueFont: '400 18px "Audiowide", "Courier New", monospace',
		descFont: '400 15px "Courier New", monospace', // bumped from 13px — real reading content, not a caption
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

		// Plays once, in place of the generic Config.ui.click blip, the instant
		// CLAIM is tapped (see DailyRewardPanel.handleTap) — the daily reward
		// is a bigger moment than an ordinary button, so it gets its own
		// distinct sting rather than sounding like every other UI tap.
		claimAudioSrc: "assets/audio/reward.mp3",
		claimVolume: 0.6,

		// A small persistent reminder shown ON the title card once today's
		// reward has already been claimed (see PrologueScene's 'title'
		// render) — without this, a player who already claimed has no
		// on-screen cue the daily-reward system exists at all until
		// tomorrow's popup happens to catch them again.
		claimedBadge: Object.freeze({
			// Line 1: plain confirmation, same dim footnote read as before.
			text: "TODAY'S REWARD CLAIMED",
			font: '400 13px "Courier New", monospace', // bumped from 11px for legibility at real device scale
			color: "#aab4d4",
			alpha: 0.55,
			y: 884,

			// Line 2: the actual "come back" hook — a colored preview of
			// TOMORROW's reward (core/DailyReward.js's previewNextReward()),
			// tinted with that reward's own color so it visually pops even at
			// low alpha instead of reading as more of the same grey text.
			nextPrefix: "TOMORROW: ",
			nextFont: '400 13px "Courier New", monospace',
			nextAlpha: 0.8,
			nextY: 906,
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

		/**
		 * The 7-day streak calendar — core/DailyReward.js's `ensureRolled`
		 * advances a `streakDay` index (1-7) through this array once per
		 * newly-observed calendar day: continuing to `streakDay + 1` if
		 * yesterday was claimed, resetting to 1 on any missed day, and
		 * looping back to 1 again the day after day 7 is claimed — so the
		 * cycle repeats indefinitely rather than capping out. Each entry's
		 * `type` still drives shape (icon, gold-credit vs pending-flag) via
		 * the `gold`/`luckyDrop`/`shieldStart` blocks above; `amountMin`/
		 * `amountMax` (gold entries only) give each gold day its OWN band,
		 * escalating across the week instead of one flat range every time —
		 * see DailyReward.js's `resolveDisplay`/`getPendingReward` for how a
		 * slot's `name`/`color`/`description` override (day 7 only) merges
		 * over its type's defaults above.
		 */
		calendar: Object.freeze([
			Object.freeze({ type: "gold", amountMin: 40, amountMax: 60 }),
			Object.freeze({ type: "shieldStart" }),
			Object.freeze({ type: "gold", amountMin: 70, amountMax: 100 }),
			Object.freeze({ type: "luckyDrop" }),
			Object.freeze({ type: "gold", amountMin: 110, amountMax: 150 }),
			Object.freeze({ type: "shieldStart" }),
			// Day 7 — the payoff for a full week of consecutive logins: a
			// visibly bigger gold band plus its own name/color (amber, not
			// gold's usual yellow) so it reads as a distinct "jackpot" tier
			// rather than just another same-looking gold card. `jackpot: true`
			// is read by DailyRewardPanel to boost its icon-badge glow/halo
			// and by the streak strip to tint this day's pip even while it's
			// still in the future (see Config.dailyReward.streakStrip).
			Object.freeze({
				type: "gold",
				amountMin: 250,
				amountMax: 350,
				jackpot: true,
				name: "WEEK JACKPOT",
				color: "#FF9F1C",
				description:
					"A full week of logins, claimed — the biggest gold bonus in the cycle.",
			}),
		]),

		/**
		 * The 7-pip streak strip rendered above the main reward card (see
		 * entities/DailyRewardPanel.js's _renderStreakStrip) — a day-by-day
		 * read of the whole calendar above, not just today's roll, so a
		 * player can see a claimed streak building AND the still-locked days
		 * ahead (especially day 7's jackpot) in one glance — the "come back
		 * for this" hook. Reuses the exact same 3-state semantic palette
		 * Shop.js/MissionSelectScene.js already use for their own owned/
		 * available/locked tiles (Config.shop.buy*Color, Config.missionSelect.
		 * *Color) so "claimed / today / not yet" reads as the same visual
		 * language as the rest of the game rather than a fourth color scheme.
		 * A future pip whose calendar entry is the jackpot renders in ITS OWN
		 * amber (Config.dailyReward.calendar[6].color) instead of the flat
		 * futureColor grey — everything else builds anticipation toward day
		 * 7 specifically, so its pip shouldn't blend into the rest.
		 */
		streakStrip: Object.freeze({
			y: 295, // vp — pip row center. Kept clear of the halo's max breathing radius below (haloBaseRadius + 2*haloRingSpacing + 10 = 192vp from cardCenterY, i.e. down to y=328) so the two never visually overlap.
			labelY: 252, // vp — "DAY N STREAK" label, above the row
			labelFont: '400 15px "Audiowide", "Courier New", monospace',
			pipSize: 50, // vp square footprint per pip (corner-bracket frame + icon)
			pipGap: 10, // vp between adjacent pips — 7*50 + 6*10 = 410vp, well inside the 540vp virtual width
			pipLegSize: 8,
			pipLineWidth: 1.5,
			iconScale: 0.42, // shrinks the same icon paths _renderIcon draws on the big badge down to pip size
			claimedColor: "#4DFF8A", // matches Shop's buyMaxedColor / MissionSelect's completedColor
			currentColor: "#4DEFFF", // matches Shop's buyAffordableColor / MissionSelect's unlockedColor
			futureColor: "#4a5570", // matches Shop's buyUnaffordableColor / MissionSelect's lockedColor
			futureIconAlpha: 0.5, // future pips still show their reward's icon, just dimmed — the preview itself
			currentPulseSpeed: 3.2, // rad/sec — same breathing idea as Config.dailyReward.claimButton
			currentPulseDepth: 0.25,
			checkLineWidth: 2,
			// A plain "1".."7" caption under each pip, same state color (and,
			// for today's pip, the same glow) as the pip itself — spells out
			// which calendar day each icon belongs to instead of making the
			// player count positions from the left. Bumped from 10px, which
			// was too small to read at a glance on a real phone screen.
			dayLabelFont: '700 15px "Courier New", monospace',
			dayLabelOffsetY: 42, // vp below pip center (half pipSize + a gap, nudged down for the bigger font)
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

		// 1/sec exponential-smoothing rate for Scout/Rocketeer's tracked
		// player-velocity estimate (see Enemy.js) — used to lead shots off the
		// player's CURRENT motion instead of a stale sample. Higher = the
		// estimate reacts to a direction change faster; this is fast enough to
		// pick up a reversal within ~0.1-0.15s while still filtering single-
		// frame pointer-event jitter.
		leadVelocitySmoothing: 8,

		// Every enemy attack that can hit the player (Config.enemyBullet.damage,
		// enemy.sniper.bullet.damage, rocket.damage, enemy.bouncer.contactDamage,
		// enemy.drifter.projectileDamage, every boss bullet/contact type) is
		// authored as its LEVEL-1 value and scaled up at the point WaveManager
		// tallies player damage (checkPlayerHit, and the rocket/drifter onPlayerHit
		// callbacks) by `1 + damageGrowthPerLevel × (level-1)` — the same flat
		// additive-per-level shape as Config.player.damagePerLevel, just on the
		// enemy side. Added alongside the healthPerLevel bump documented in the
		// EffortScore comment below, for the same reason: Player.maxHealth now
		// grows up to 2.6x via the Shop's `engine` upgrade (Config.player.engine),
		// so a hit that felt threatening at level 1 would otherwise decay toward
		// harmless chip damage for a tanky late-run ship. 0.02 (+2%/level,
		// unbounded — matches damagePerLevel's own never-caps shape) reaches
		// +58% by level 30 ("The Reckoning", where Survival's hand-authored
		// content ends and only numbers keep climbing) and keeps compounding
		// through the true endless tail beyond it, deliberately NOT fully
		// canceling out a maxed engine's 2.6x survivability — buying engine
		// levels should still make the ship meaningfully tankier, just not
		// immune to the run's own escalation.
		damageGrowthPerLevel: 0.02,

		/**
		 * How every type's `points`/`gold` below were derived — not
		 * independently hand-picked per type. Difficulty is modeled as
		 * verified effort-to-kill (danger-to-player is a separate axis, now
		 * covered by `damageGrowthPerLevel` above rather than folded into this
		 * score — see that field's own doc):
		 *
		 *   1. hitsToKill = ceil((health + healthPerLevel×(debutLevel-1)) /
		 *      (player.damage + player.damagePerLevel×(debutLevel-1))) — real
		 *      numbers from this file, evaluated at the level each type first
		 *      appears in Config.waves.levels (Survival Mode's array — the
		 *      default/primary mode; Mission Mode's independent debut order,
		 *      Config.missionWaves, isn't used for this calibration).
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
		 * extra difficulty today without a player-damage system.
		 *
		 * Shop-compensation note: every `healthPerLevel` below is the type's
		 * "raw" per-level growth × 1.65 (SHOP_HEALTH_FACTOR, a constant only
		 * expressed here in the comment, not a separate Config field — it was
		 * folded into each number below once, not re-applied at runtime).
		 * Added because the Shop (Config.player.wings/cannon/missiles) lets a
		 * player push effective bullet DPS well past what `player.damage`/
		 * `damagePerLevel` alone assume — cannon's damageMult alone reaches
		 * 1.82x at max level, wings' fireRateMult (plus its level-8 side
		 * bullets) pushes noticeably higher, and missiles add a wholly separate
		 * damage stream once unlocked. Left uncompensated, hitsToKill for every
		 * type would visibly erode over a run as a player buys upgrades,
		 * trivializing exactly the levels meant to feel hardest. 1.65 is a
		 * deliberate midpoint, not the full ~2.7x+ a maxed cannon+wings
		 * combination could reach: `health` (the level-1 base, untouched here)
		 * is what a fresh, zero-Shop-investment player meets, so inflating
		 * healthPerLevel all the way to match a FULLY maxed ship would make
		 * early-to-mid levels feel unfairly tanky for anyone still saving up
		 * gold. 1.65 keeps early debuts close to their original feel while
		 * still meaningfully compensating by the point a run reaches its later
		 * levels, where sustained kills have had time to fund real Shop
		 * progress — matching this file's own preference for moderate,
		 * legible adjustments over precise theoretical maximization (see the
		 * mobility/engagement multipliers' own "kept small" reasoning above).
		 *
		 * healthPerLevel note: most types share this file's implicit
		 * convention of one `healthPerLevel` per family, EXCEPT
		 * bouncer.splitter/bouncer.shielded, which each define their OWN
		 * `healthPerLevel` (read by WaveManager._spawnNext, not the base
		 * bouncer's) — see the comment on each. Without that, their relative
		 * tankiness over a plain Bouncer decays toward zero over a long
		 * endless-mode run, since a flat health head-start becomes
		 * proportionally smaller as player damage keeps climbing. Sniper
		 * sidesteps this the same way structurally (its own `healthPerLevel`
		 * is already a dedicated per-type field, not shared with anything).
		 */

		/**
		 * Scout — basic fighter. Enters, parks at a fixed rest position,
		 * fires aimed bullet bursts at the player.
		 */
		scout: Object.freeze({
			size: 22,
			health: 3,
			healthPerLevel: 1.65, // +1.65 health per level beyond 1 — 1 × SHOP_HEALTH_FACTOR, see the methodology comment above
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
			leadTime: 0.3, // seconds — bullets aim at the player's tracked (smoothed) CURRENT velocity projected this far ahead; unguided bullet, so leading it matters
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
			healthPerLevel: 3.3, // +3.3 health per level beyond 1 — already tanky, scales faster; 2 × SHOP_HEALTH_FACTOR, see the methodology comment above
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
			chargeWarmup: 0.85, // seconds of nose charge before ! appears — eased back up slightly from 0.7, a touch slower fire rate
			warningDuration: 0.7, // seconds ! is shown before the shot fires — kept as-is, this is the fairness/reaction window
			recoverDuration: 0.45, // seconds after firing before the recovery turn-back can start — eased back up slightly from 0.35, a touch slower fire rate; actual tracking resume is also gated on the shot starting to accelerate, see SniperEnemy's _angleFreezeRemaining
			recoverTurnRate: 4, // rad/sec — slow turn back toward the player during recovery
			hitRadius: 24,
			minSeparation: 64,
			// EffortScore 11.00 (hitsToKill 11, stationary, mandatory) — highest
			// hits-to-kill of any single-stage enemy in the roster. See the
			// methodology comment above `hitFlashDuration`.
			points: 370,
			gold: 18,

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
				accelDelay: 0.35, // seconds spent at startSpeed before the jet kicks in — also how long SniperEnemy freezes its angle after firing, see SniperEnemy's _angleFreezeRemaining
				accelDuration: 0.1, // seconds to ramp from startSpeed to maxSpeed — shortened again from 0.15 for an even sharper, faster acceleration kick
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
			healthPerLevel: 1.65, // +1.65 health per level beyond 1 — 1 × SHOP_HEALTH_FACTOR, see the methodology comment above
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
			leadTime: 0, // no lead — the rocket already homes continuously after launch, so leading the initial heading is redundant
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
			healthPerLevel: 1.65, // +1.65 health per level beyond 1 — applies to all varieties (sweeper/diver/weaver share `health`); 1 × SHOP_HEALTH_FACTOR, see the methodology comment above `hitFlashDuration`
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
			projectileDamage: 8, // player HP lost if still within range when the orb arrives — see Player.maxHealth
			// Bumped from a flat 16 (fine for a handful of regular Drifter
			// clones lashing at once) — Boss #4 "Snake" (Config.boss.snake) can
			// have up to ~20 attacker segments sharing this same pool, each on
			// their own multi-second cycle, so concurrent in-flight orbs can
			// climb well past what a normal level ever produces.
			projectilePoolSize: 40,
			engageRangeX: 160, // vp — a lash only fires if the player is within this horizontal range of the clone
			engageRetryInterval: 0.3, // seconds before re-checking range after a would-be lash was withheld

			hitRadius: 18,
			// EffortScore 6.61 (hitsToKill 5, path-moving ×1.15, optional-to-
			// engage ×1.15) — identical to Sweeper/Diver/Weaver below, which all
			// share this same base health/healthPerLevel and only differ in
			// path/palette, not actual difficulty. See the methodology comment
			// above `hitFlashDuration`.
			points: 220,
			gold: 11,
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
				points: 220,
				gold: 11,
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
				points: 220,
				gold: 11,

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
				points: 220,
				gold: 11,

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
			// Bumped from 4/1.2 — Bouncer/Splitter/Shielded are meant to be a
			// sustained bounce-off-the-barrier threat, not a one-or-two-hit
			// speed bump; dying too fast undercuts that role. Points/gold below
			// are recalculated via the EffortScore formula so the reward keeps
			// pace with the added tankiness — see the methodology comment above.
			health: 6,
			healthPerLevel: 2.475, // +2.475 health per level beyond 1 — used by the plain Bouncer (variant 1) and, via the shared `health` fallback above, Shielded's core; Splitter/Shielded scale their OWN healthPerLevel below at 1.5x this rate. 1.5 × SHOP_HEALTH_FACTOR, see the methodology comment above `hitFlashDuration`
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
			// EffortScore 11.70 (hitsToKill 9, erratic-bounce mobility ×1.3,
			// mandatory so no engagement bonus). See the methodology comment
			// above `hitFlashDuration`.
			points: 390,
			gold: 20,

			splitter: Object.freeze({
				radius: 40, // vp — ~2x the base hull size
				health: 20, // ~3.33x base health
				// Own healthPerLevel, 1.5x the base Bouncer's 1.5 (read by
				// WaveManager._spawnNext — NOT the base bouncer.healthPerLevel).
				// Without this, Splitter's flat HP head start over a plain
				// Bouncer becomes proportionally smaller every level (player
				// damage keeps growing, the gap doesn't) — its relative tankiness
				// would decay toward parity with a plain Bouncer over a long
				// endless-mode run instead of staying a real step up. 3.7125 =
				// 2.25 × SHOP_HEALTH_FACTOR, see the methodology comment above
				// `hitFlashDuration`.
				healthPerLevel: 3.7125,

				fragmentCount: 3,
				// vp — smaller than the base Bouncer (20), but bumped from 12 so
				// the fixed 16px healthFont has room to sit inside the hull once
				// fragmentHealth scales past 2 digits over a long endless-mode
				// run (see fragmentHealthPerLevel below) instead of crowding a
				// too-small hexagon.
				fragmentRadius: 18,
				// fragmentHealth (level 1) + fragmentHealthPerLevel×(level-1) =
				// exactly 2× the current wave/survival level at every level —
				// e.g. 18 HP at level 9, 32 HP at level 16. Previously a flat 1,
				// which was a dead knob in practice: by the earliest level a
				// Splitter can appear (survival 9 / mission 16), player damage
				// per hit is already >=3, so a flat-1 fragment always died in
				// exactly one hit regardless of how much later it was actually
				// killed — it could never read as a real (if small) threat late
				// into a run. Scaling with level keeps it a minor-but-real mop-up
				// fight instead of a freebie. WaveManager passes the level-scaled
				// bonus into BouncerEnemy.spawnFragments(); see fragmentHealthPerLevel below.
				fragmentHealth: 2,
				fragmentHealthPerLevel: 2,
				fragmentSpeedMax: 200, // vp/sec — horizontal fan-out speed (vy is solved per-fragment, see spawnFragments)

				// EffortScore 22.10 (hitsToKill 17 from 20 HP @ healthPerLevel
				// 3.7125, evaluated at Survival's real debut level 9 — see the
				// "survival 9 / mission 16" note above — erratic-bounce ×1.3) —
				// the single highest-value type in the roster. Fragment reward
				// below is its own separate, smaller EffortScore, recalculated
				// off the level-scaled fragment health above: EffortScore 7.80
				// (hitsToKill 6 from 18 HP @ Splitter's own Survival debut level
				// 9, erratic-bounce ×1.3) — no extra "split bonus" stacked onto
				// Splitter's own value, since the 3 spawned fragments already
				// each earn their own reward when they're individually killed.
				// See the methodology comment above `hitFlashDuration`.
				points: 740,
				gold: 37,
				fragmentPoints: 260,
				fragmentGold: 13,
			}),

			shielded: Object.freeze({
				shieldRadius: 32, // vp — outer ring radius (core uses the base `radius` above)
				shieldHits: 4, // bullet hits absorbed before the core starts taking damage
				shieldColor: "#6FE0FF", // ice-blue — visually distinct from the amber core
				shieldGlowBlur: 5,
				shieldHitGlowBlur: 12,
				// Own healthPerLevel for the core, same 1.5x rationale as Splitter
				// above — the shield's flat absorbed-hit count doesn't decay on
				// its own, but the core underneath was scaling at the same rate
				// as a plain Bouncer's core. 3.7125 = 2.25 × SHOP_HEALTH_FACTOR,
				// see the methodology comment above `hitFlashDuration`.
				healthPerLevel: 3.7125,

				// EffortScore 22.10 (hitsToKill 17 total — 4 shield-absorbed hits
				// + 13 core hits @ healthPerLevel 3.7125, evaluated at Survival's
				// real debut level 10 — × erratic-bounce ×1.3). See the
				// methodology comment above `hitFlashDuration`.
				points: 740,
				gold: 37,
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
		damage: 6, // player HP lost per hit — see Player.maxHealth
		maxLife: 4, // seconds before self-destruct (safety net — it should always long since have hit or left the screen; same convention as Config.enemy.sniper.bullet.maxLife)
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
			healAmount: 25, // player HP restored — see Player.maxHealth
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
		// mid-gold body, a brighter glinting rim, and a deep antique-bronze for
		// the stamped emblem/emboss. This is what actually reads as "gold coin"
		// at a glance rather than "colored orb" (the old fillColor was a
		// near-black wash, so only the thin outline carried any gold color at
		// all — see GoldPickups.render).
		color: "#FFDE59", // bright rim/glint — distinct from Config.powerUps.fireBoost's warm-gold (#FFD24D)
		fillColor: "#E7B740", // solid coin body
		shadeColor: "#6B4610", // dark antique-gold — stamped star emblem + inner emboss; darkened from #8A5A12 so the emblem clears WCAG 1.4.11's 3:1 non-text contrast against fillColor with real margin (was ~3.2:1, now ~4.5:1)
	}),

	/**
	 * Score combo — a streak multiplier on kill POINTS only (never gold) that
	 * climbs while the player goes without taking damage, and resets to ×1
	 * the instant a hit actually lands (see GameplayScene._checkPlayerHit).
	 * Tiered rather than per-kill-continuous so it's simple to read at a
	 * glance (HUD just shows "COMBO ×N") — see Config.hud.combo for the
	 * display side. Skill-bomb kills (triggerSkillBomb) deliberately don't
	 * feed this — see GameplayScene._checkCollisions' own doc for why.
	 *
	 * Also nudges drop luck: each tier-up slightly raises the roll chance
	 * for both the gold and PowerUp drops on that same kill (see
	 * `dropBonusPerTier`/`maxDropBonus` below and GameplayScene._comboDropBonus).
	 */
	combo: Object.freeze({
		step: 5, // kills-without-damage per multiplier tier
		incrementPerStep: 0.5, // multiplier added per tier
		maxMultiplier: Infinity, // uncapped by design — the streak (and its score payoff) climbs for as long as the player stays unhit

		// Extra roll-chance multiplier for gold/PowerUp drops, scaled by the
		// current tier index (see GameplayScene._comboDropBonus) — e.g. tier 3
		// with 0.08 below multiplies both Config.gold.dropChance and
		// Config.powerUps.dropChance by 1.24. `maxDropBonus` caps the bonus
		// itself (not the tier) so an extreme streak still can't approach a
		// guaranteed drop.
		dropBonusPerTier: 0.08,
		maxDropBonus: 1, // i.e. drop chance can at most double (1 + 1)

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
		 * reached (index 0 = the first tier, 5 kills); the streak is now
		 * uncapped, so tiers beyond the array's length (6) reuse the last
		 * label ("LEGENDARY!") — see ComboBanner.trigger's clamp — while the
		 * ×N multiplier shown on the sub-line keeps climbing underneath it.
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
		maxRings: 64, // shockwave ring pool size (2 rings/emit) — well above any expected burst count, e.g. a skill-bomb wiping a full MAX_BATCH(20)-sized formation at once
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
		// Seconds of breathing room after a level (re)starts before the first
		// enemy group's spawn timer begins counting down (WaveManager seeds
		// `_spawnTimer` with this instead of 0) — gives the player a beat to
		// get oriented (barrier/HUD state, own position) before anything fires.
		startDelay: 2,
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
			// level is a boss level (see Config.bossSchedule.survival.everyNLevels)
			// — WaveManager checks that BEFORE ever reading this array, so this entry (and
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
			// Config.bossSchedule.survival.everyNLevels) — this is the first
			// level of "act two", right after the player's first boss kill.
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
			// plays while Config.bossSchedule.survival.everyNLevels stays 7 —
			// kept as a real config for the same reason).
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
	 * Per-mode boss encounter SCHEDULE — WHEN a boss level occurs
	 * (`everyNLevels`) and WHICH boss appears (`roster`, cycling once every
	 * boss has had a turn), kept fully independent per mode so Survival
	 * Mode's pacing can be tuned without touching Mission Mode's and vice
	 * versa (see Config.mission's doc for why the two modes' content is
	 * deliberately kept apart). The boss DESIGNS themselves — stats,
	 * visuals, attack patterns (`Config.boss.scout1`/`spiral`/.../`electron`
	 * below) — are mode-agnostic and shared by both schedules; only the
	 * "every Nth level, in this order" scheduling lives here. See
	 * WaveManager's `_resolveLevelAndBoss` for how its `mode` argument
	 * selects `survival` vs `mission` below, and GameplayScene's
	 * boss-level-intro check (`_renderLevelIntro`) for the other read site.
	 */
	bossSchedule: Object.freeze({
		survival: Object.freeze({
			// NOTE: everyNLevels/roster below are currently hand-tweaked for
			// local playtesting (forces every level to be a boss level, Tetra
			// moved to the front) — canonical shipped values are
			// `everyNLevels: 7` and roster starting with 'scout1'; revert
			// before shipping. `nova` is appended at the end regardless, so
			// it's in rotation either way.
			everyNLevels: 1,
			roster: Object.freeze([
				"electron",
				"phoenix",
				"scout1",
				"snake",
				"spiral",
				"bouncerPrimal",
				"tetra",
				"nova",
				"pulsor",
				"zigzag",
				"pulsor",
				"nova",
				"tetra",
				"scout1",
				"spiral",
				"bouncerPrimal",
				"snake",
				"phoenix",
				"electron",
			]), // ordered — which boss spawns on the 1st/2nd/3rd/4th/5th/6th/7th/8th/9th/10th/... boss-level encounter, in CANONICAL order (level 7→roster[0] "scout1", 14→roster[1] "spiral", 21→roster[2] "bouncerPrimal", 28→roster[3] "snake", 35→roster[4] "tetra", 42→roster[5] "nova", 49→roster[6] "pulsor", 56→roster[7] "zigzag", 63→roster[8] "phoenix", 70→roster[9] "electron", 77→roster[0] again, ...) — see WaveManager's boss-selection lookup in its constructor. The array above is temporarily reordered for playtesting (see NOTE), so the live spawn order doesn't currently match this comment.
		}),
		// Mission Mode's real, shipped schedule (independent of Survival's
		// playtesting hack above) — a boss every 5th level across the full
		// 50-level campaign (Config.mission.count), so the 10-boss roster
		// below runs exactly once, in the bosses' original introduction
		// order (matches each boss's "enemy boss #N" doc numbering, e.g.
		// Config.boss.scout1 was boss #1, Config.boss.electron was #10):
		// level 5→scout1, 10→spiral, 15→bouncerPrimal, 20→snake, 25→tetra,
		// 30→nova, 35→pulsor, 40→zigzag, 45→phoenix, 50→electron (the
		// campaign's final boss). No repeats needed since 50 / 5 === roster
		// length, but the roster still cycles if `Config.mission.count` ever
		// grows past 50.
		mission: Object.freeze({
			everyNLevels: 5,
			roster: Object.freeze([
				"scout1",
				"spiral",
				"bouncerPrimal",
				"snake",
				"tetra",
				"nova",
				"pulsor",
				"zigzag",
				"phoenix",
				"electron",
			]),
		}),
	}),

	/**
	 * Boss encounters — a single, much tougher enemy that completely
	 * replaces the normal level roster on a boss level (see the per-mode
	 * `Config.bossSchedule` above for WHEN/WHICH — this key only holds the
	 * boss DESIGNS themselves, shared by every mode). Checked against the
	 * raw level number in WaveManager rather than read from `waves.levels`
	 * above (which only defines 30 entries and caps at the last one
	 * forever), so boss levels keep recurring past level 30 too.
	 *
	 * `scout1` is the first boss ("Scout Prime") — a giant reskin of the
	 * Scout hull (BossEnemy.js reuses SCOUT_HULL_PTS's exact authored
	 * proportions, just at a much bigger `size`) whose attack cycles between
	 * the two "ship-family" enemies it's built from: an aimed Scout-style
	 * burst (`scoutPhase`) fired from a pair of dedicated shoulder-cannon
	 * hull points, then a Sniper-style charge/lock/fire (`sniperPhase`) —
	 * looping back to the first once both have run. A Rocketeer-style rocket
	 * launches occasionally on its own timer (`rocketPod`) from a separate
	 * pair of wing-pod hull points, layered on top of the scout phase rather
	 * than a dedicated phase of its own. Later boss encounters (level 56,
	 * 105, ... — this boss is roster[0], so it recurs every 7th boss
	 * encounter once the roster cycles) reuse this
	 * same boss for now, scaled up via `healthPerLevel` like every regular
	 * enemy — future reiterations (a giant Rocketeer or Sniper build) are a
	 * later addition.
	 */
	boss: Object.freeze({
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

			size: 44, // vp — same authored hull proportions as Scout (Enemy.js's SCOUT_HULL_PTS), just 2x Scout's 22 (trimmed down again from 58 — still read as too large at that scale)
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

			entrySpeed: 120, // vp/sec — slowed again from 150, itself already well under a regular Scout's 320 — sells the weight of something this big
			// Pushed down from an initial 190 — the hull's own nose tip
			// otherwise swings up into the boss health bar
			// (Config.boss.healthBar) at the top of `repositionYMin` below;
			// 245 keeps clear of it with margin.
			restY: 245, // vp — initial rest height (only moves via the occasional reposition below, same as a regular Scout — not randomized at spawn like a regular enemy)
			hitRadius: 35, // vp — big collision circle matching the huge hull, scaled down alongside `size`

			// Movement while fighting: holds perfectly still at its rest
			// point — same as a regular parked Scout — rather than any
			// continuous idle drift. The only motion is an occasional
			// reposition: once a full scout+sniper attack cycle finishes (see
			// BossEnemy._maybeBeginReposition, called from the sniper phase's
			// last shot), a `repositionChance` roll may send it gliding
			// (`repositionDuration`, eased with core/animation.js's
			// easeOutCubic — the same curve Enemy.js's own mid-fight
			// repositioning and SpiralBoss's between-volley relocation both
			// use) to a fresh random spot instead of resuming its gunnery
			// from the same place. `repositionChance` is deliberately lower
			// than a regular Scout's own 0.5 — combined with this roll only
			// happening once per full ~12s attack cycle instead of every
			// ~3.4s burst/reload, repositioning reads as a rare, deliberate
			// relocation rather than constant fidgeting.
			repositionChance: 0.35,
			repositionDuration: 1.1, // seconds to ease to the new rest point — a touch slower than Scout's own 0.9, sells the weight of something this big
			repositionMarginX: 70, // vp from each screen edge — keeps the hull's own half-width clear of the edge
			repositionYMin: 200, // vp — keeps the hull's topmost point clear of the boss health bar, same margin `restY` was originally tuned for
			repositionYMax: 320, // vp — stays clearly in the upper play area

			// Phase 1 of 2 in the cycle (see class doc) — Scout-style aimed
			// burst fire, mirroring Enemy.js's own aim→burst cycle at boss
			// scale: more rounds per burst, repeated `volleys` times before
			// the cycle moves on to the next phase. Each shot alternates
			// between the hull's two shoulder-cannon points (see BossEnemy.js's
			// GUN_L/GUN_R anchors) instead of firing from dead-center.
			scoutPhase: Object.freeze({
				aimPause: 0.3,
				burstCount: 10,
				burstInterval: 0.15,
				leadFactor: 1.0,
				volleys: 3,
				cooldown: 1, // between volleys
			}),

			// Occasional rocket, layered on top of the scout phase rather than
			// a dedicated phase of its own (see class doc) — fires one homing
			// rocket every `minInterval`-`maxInterval` seconds (randomized)
			// while the boss is in its scout phase, alternating between the
			// hull's two outer wing-pod points (see BossEnemy.js's POD_L/POD_R
			// anchors). `swingAngleMin/Max`/`homingDelay` are passed straight
			// through to the shared Rockets pool's optional launch-swing
			// params (see Rockets.fire's doc) using the EXACT same values
			// Config.player.missiles uses, so this rocket launches swung off
			// its aim point and flies that heading for a beat before curving
			// in — the same "swing out, then hook in" read as the player's
			// own missile — rather than snapping onto a beeline the instant
			// it fires, unlike a regular Rocketeer's rocket.
			rocketPod: Object.freeze({
				minInterval: 4.5,
				maxInterval: 7.5,
				swingAngleMin: 1.05,
				swingAngleMax: 1.75,
				homingDelay: 0.15,
				// Scales down the shared Rockets pool's rendered body silhouette
				// ONLY for rockets launched from this pod (see Rockets.fire's
				// optional `sizeMult` param) — a regular Rocketeer's own rocket
				// is unaffected, since Config.rocket itself isn't touched.
				// Cosmetic only — detonation proximity/damage stay the same.
				rocketSizeMult: 0.75,
			}),

			// Phase 2 of 2 — Sniper-style charge/lock/fire, repeated `shots`
			// times before looping back to phase 1. Same telegraph LANGUAGE as
			// SniperEnemy (a nose orb that fills, then a locked "!" marker) —
			// see BossEnemy.js's renderCore/renderExtras — AND now the same
			// angle-lock/reangle timing: `chargeWarmup`/`recoverDuration`
			// match Config.enemy.sniper's own values exactly (same fire-rate
			// interval as a regular SniperEnemy, just at boss scale), and the
			// nose freezes on firing for the shared `Config.enemy.sniper.
			// bullet.accelDelay` window (see BossEnemy.update's angle-tracking
			// block) rather than snapping free the instant the shot leaves the
			// barrel. The boss also holds perfectly still for this entire
			// phase (see BossEnemy.update's sway-freeze) — a stationary aim to
			// match the fast strike pace below.
			sniperPhase: Object.freeze({
				chargeWarmup: 0.85, // matches Config.enemy.sniper.chargeWarmup — same fire-rate interval as a regular Sniper
				warningDuration: 0.7, // matches Config.enemy.sniper.warningDuration — the fairness/reaction window
				recoverDuration: 0.45, // matches Config.enemy.sniper.recoverDuration
				recoverTurnRate: 4, // rad/sec — matches Config.enemy.sniper.recoverTurnRate; how fast the nose eases back toward the player once the angle freeze expires
				shots: 3,

				// Multiplies the shared SniperBullets pool's `maxSpeed` ONLY for
				// bullets fired from this phase (see SniperBullets.fire's optional
				// `speedMult` param) — a regular SniperEnemy's own shot is
				// unaffected, since Config.enemy.sniper.bullet itself isn't
				// touched. The initial crawl (`startSpeed`) stays identical; only
				// the boosted top speed the bullet ramps up to is faster, so the
				// boss's version reads as "the same telegraph, a harder kick."
				// Bumped from 1.6 for an even harder kick.
				bulletSpeedMult: 2.2,

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
			health: 8400, // lowered ~30% from 12000 — fight was running too long
			healthPerLevel: 1260, // lowered ~30% from 1800, matching the base health cut
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
		 * (createSweeperPath/sampleSweeperPath) rather than authoring new
		 * movement — the "upgrade" is the chain's length, toughness, a
		 * dynamic gap-closing behavior no regular Drifter formation has, and
		 * its own dedicated hull (SnakeBoss.js's SEGMENT_PTS/HEAD_PTS — an
		 * angular, tapered, banded plate chain with a distinct head, not
		 * DrifterEnemy's rounded body silhouette) (see SnakeBoss.js's own
		 * doc for exactly how the chain behavior works).
		 *
		 * The FRONT segment (`SnakeBoss`, chain index 0) is the actual boss —
		 * own health/reward/health-bar, same as every other boss. Every
		 * segment behind it (`SnakeSegment`, `segment` below) is tougher than
		 * a regular Sweeper clone but individually much cheaper, and only
		 * every `attackInterval`-th one (fixed at spawn, ~1 in 10) actually
		 * fires its own projectile at the player — the rest are pure physical
		 * hazards. The full `maxSegments`-long chain is built all at once in
		 * the constructor (no gradual mid-fight growth) and queued into
		 * WaveManager's enemy list via the same generic `drainSummons`
		 * interface Bouncer Primal's on-hit summons use — see SnakeBoss.js's
		 * own doc.
		 *
		 * Also periodically enters "phase 2" — a temporary invulnerable,
		 * blinking, faster-moving burst covering the whole chain at once, not
		 * just the head — see `phase2` below and SnakeBoss.update/render.
		 */
		snake: Object.freeze({
			name: "SNAKE",
			color: "#4DFF6B", // fresh venom green — distinct from every other boss color (red/violet/amber) used so far
			fillColor: "#0a2010",
			lineWidth: 2,
			glowBlur: 7,
			hitGlowBlur: 16,
			hitRadius: 18, // vp — same as a regular Sweeper's own (Config.enemy.drifter.hitRadius)

			// Head-only accents (SnakeBoss.render draws the head as its own
			// distinct hull, separate from the batched body-plate pools, so
			// the actual boss reads as a head rather than another identical
			// plate — see SnakeBoss.js HEAD_PTS).
			eyeColor: "#e8ffb0",
			eyeRadius: 2.4,
			eyeOffsetX: 6, // vp, local space, mirrored left/right
			eyeOffsetY: -9,

			// Shared-path chain formation — see class doc.
			spacing: 34, // vp along the path between segments — tighter than a regular Sweeper's 50, so a fully-grown chain doesn't stretch absurdly far past both screen edges
			speed: 205, // vp/sec along the path — still under a regular Sweeper's 220 (reads heavier), nudged up from 190 for a bit more pace
			// Gap-closing "catch-up" rate (vp/sec) — see SnakeSegment.update.
			// Faster than `speed` (and than `speed * phase2.speedMult`, its
			// highest possible value) so a segment can both keep pace with the
			// formation AND still visibly hurry to close a gap left by a dead
			// neighbor, in either phase.
			catchUpSpeed: 420,

			// Phase 2 — a periodic invulnerable/blinking speed burst. Every
			// `interval` seconds of normal time, the whole chain (head +
			// every live segment, via each segment's own `_head` reference —
			// see SnakeSegment.hit) goes invulnerable and moves at
			// `speed * speedMult` for `duration` seconds, then reverts. The
			// blink is a hard on/off alpha flicker (`dimAlpha` every other
			// `blinkInterval`), not a continuous pulse, so it reads distinctly
			// from every other "gentle breathing" alpha cue in the game — see
			// SnakeBoss.update/render.
			phase2: Object.freeze({
				interval: 12, // seconds of normal-speed time between activations
				duration: 5,
				speedMult: 1.5,
				blinkInterval: 0.12,
				dimAlpha: 0.3,
			}),

			// vp — once the shared Sweeper path's leading edge would sink past
			// this depth, sampleBoundedSweeperPath (DrifterEnemy.js) freezes the
			// row and folds any further travel into a left-right patrol of that
			// same row instead of continuing to step downward forever — keeps
			// the head (and by extension every segment chasing it) on screen
			// and killable for the rest of the fight instead of eventually
			// sinking below the bottom edge for good, invisible and unkillable.
			// Well clear of the barrier (baseY 940, dome peak ~870).
			patrolDepthY: 700,

			maxSegments: 200, // chain length (INCLUDING the head), spawned all at once

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

			health: 400, // the front segment's (the actual boss) own health — nudged up from 350 for a bit more toughness
			healthPerLevel: 50,

			segment: Object.freeze({
				health: 9, // a regular Sweeper's own is 3 (+1/level) — noticeably tankier per "a more tanky one each"; nudged up from 8
				healthPerLevel: 1.2,
				points: 20,
				gold: 1,
				sparksPerEmit: 6, // small — many can die in close succession

				// Multiplies Config.powerUps.dropChance / Config.gold.dropChance
				// (respectively) for a snakeSegment kill only (see
				// WaveManager.handleBulletHit) — with up to Config.boss.snake.
				// maxSegments individually-rollable kills in one fight, the flat
				// per-kill chances would otherwise flood the screen with far more
				// PowerUps/gold coins than any other single enemy wave could ever
				// produce.
				powerUpDropChanceMult: 0.3,
				goldDropChanceMult: 0.3,

				// Alternate plate fill, banded onto every other lane (odd
				// `_lane`) so the chain reads as individual scaled plates
				// rather than one flat-colored blob — see SnakeBoss.render's
				// `_altHulls` pool.
				altFillColor: "#15301c",

				// Cosmetic size taper along the chain: plate scale shrinks
				// from 1.0 at the head toward `taperFloor` as `_lane` grows,
				// giving the tail a slightly leaner silhouette than the neck.
				// Purely visual — hitRadius above stays constant for every
				// segment regardless of its drawn scale.
				taperFloor: 0.6,
				taperRate: 0.008, // scale lost per lane — floor reached at lane 50

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

		/**
		 * Boss #9 — "Phoenix". An original angular bird silhouette (see
		 * PhoenixBoss.js's PHOENIX_HULL_PTS — a swept-wing, forked-tail bird
		 * shape, not a reskin, same "original hull" lineage as Spiral/Tetra/
		 * Nova/Pulsor/Zigzag), the first boss whose hull isn't a regular
		 * polygon. Reuses the ship-family's nose/tail anchor convention
		 * (Enemy.js's `atan2(-dx, dy)` — local -Y away from the player, local
		 * +Y toward it) in a way that doubles as the phoenix's own anatomy:
		 * the tail-spike anchor (local -Y) gets `renderEngineFlame`'s exhaust
		 * plume as a trailing fire plume, and the beak anchor (local +Y) is
		 * where phase 1's fireballs launch from — same `renderFlame`/
		 * `renderCore` pairing BossEnemy.js uses, not the coreGlow-ring-only
		 * treatment Tetra/Nova/Pulsor/Zigzag use, because — like BossEnemy —
		 * this hull has a real facing direction, not just a spinning turret.
		 *
		 * A repeating TIMED loop between THREE phases (`_phase`/`_phaseAge`),
		 * one more than every other boss's 2-phase loop, all sharing ONE
		 * fixed rest point (`restX` = arena center, `restY` below) so every
		 * phase transition lands exactly where the next phase expects to
		 * start from — see PhoenixBoss.js's class doc for the full seam-by-
		 * seam reasoning:
		 *
		 *   phase 1 (`phase1Duration` seconds) — circles the rest point on a
		 *   closed loop (`orbitRadiusX/Y`, `orbitSpeed`) that starts and ends
		 *   exactly AT the rest point (same zero-jump trick BossEnemy's own
		 *   figure-8 orbit uses), beak tracking the player throughout, firing
		 *   one aimed fireball (PhoenixFireballs.js) straight at the player's
		 *   CURRENT position — no lead prediction, same idiom as Nova's seed —
		 *   every `fireball.fireInterval` seconds.
		 *
		 *   phase 2 (`charge`) — a single telegraphed dash, three beats:
		 *   'telegraph' locks the player's position at that instant (NOT
		 *   re-aimed as they move) and shows a directional indicator line +
		 *   target reticle for `charge.telegraphDuration` seconds; 'charging'
		 *   then accelerates the boss from `chargeStartSpeed` toward
		 *   `chargeMaxSpeed` (`chargeAcceleration` vp/sec²) along that FIXED
		 *   locked direction — a real dodge-or-get-hit commitment, not a
		 *   homing missile — dealing `charge.contactDamage` to the player on
		 *   touch (opts into WaveManager.checkPlayerHit's generic
		 *   `.contactDamage` hook only while actually mid-dash, see
		 *   PhoenixBoss.contactDamage's getter) until it either travels for
		 *   `chargeDuration` seconds or crosses the `boundMarginX`/`boundYMin`/
		 *   `boundYMax` clamp (kept comfortably above the barrier — this is a
		 *   player-only attack, it never touches the barrier); 'recover' then
		 *   eases it back to the shared rest point over `recoverDuration`
		 *   seconds (smoothstep, not linear) before phase 3 begins.
		 *
		 *   phase 3 (`sway`) — sways side-to-side around the rest point
		 *   (`swayAmplitude`, `swaySpeed`) while holding one continuous
		 *   straight-line beam of fire anchored to its own X position,
		 *   sweeping with the sway — same live point-test idiom TetraBoss's
		 *   phase-2 lasers use (`checkLaserHit`, read by WaveManager
		 *   generically), just a fixed vertical beam instead of a rotating
		 *   one, so no segment-angle math is needed. Telegraphs harmlessly
		 *   for `warmupDuration` seconds on every entry, same fairness beat
		 *   Tetra's laser uses. Runs for an EXACT `swayCycles` full sway
		 *   periods (not a raw seconds duration) — see PhoenixBoss.js's class
		 *   doc — so it always finishes a cycle at its center point, which is
		 *   also exactly phase 1's own start point, before looping back.
		 */
		phoenix: Object.freeze({
			name: "PHOENIX",

			size: 52, // vp — hull half-reach; wingtips/tail spike extend to ~size, see PHOENIX_HULL_PTS
			health: 560,
			healthPerLevel: 70,
			color: "#E8382F", // crimson/vermillion — distinct two-tone pairing (see engineCoreColor/flameColor below) from every existing flat-hue boss
			fillColor: "#2a0509",
			lineWidth: 3,
			glowBlur: 18,
			hitGlowBlur: 30,
			engineCoreColor: "#FFD966", // gold ember — chest core, the "gold trim" half of the crimson+gold palette
			flameColor: "#FFB238", // gold-orange tail plume
			flameHalfWidth: 10,
			hitRadius: 42,

			entrySpeed: 150,
			// vp — shared rest point (with restX = arena center, set in
			// PhoenixBoss's constructor) that phase 1's orbit, phase 2's
			// recover beat, and phase 3's sway ALL treat as their common
			// anchor — see class doc for why that's load-bearing, not
			// cosmetic. Kept clear of the boss health bar (bottom edge ~162)
			// with the same margin reasoning as every other boss's restY.
			restY: 280,

			// Phase 1 — circular orbit + aimed fireballs, see class doc.
			phase1Duration: 8,
			orbitRadiusX: 95, // vp — horizontal reach
			orbitRadiusY: 65, // vp — vertical reach — close enough to orbitRadiusX to read as "circled", per the class doc, rather than Boss #1's deliberately flat figure-8
			orbitSpeed: 1.1, // rad/sec
			fireball: Object.freeze({
				fireInterval: 0.9,
				speed: 230,
				color: "#FF6A3D",
				lineWidth: 4,
				glowBlur: 10,
				halfLen: 8,
				poolSize: 40,
				damage: 12,
			}),

			// Phase 2 — telegraphed charge, see class doc.
			charge: Object.freeze({
				telegraphDuration: 0.85, // seconds the directional indicator is up before the dash — the fairness/reaction window
				chargeStartSpeed: 120, // vp/sec
				chargeAcceleration: 900, // vp/sec² — reaches chargeMaxSpeed in ~0.73s
				chargeMaxSpeed: 780, // vp/sec
				chargeDuration: 1.4, // seconds — safety cap if neither bound clamp is hit first (e.g. a near-horizontal lock)
				boundMarginX: 60,
				boundYMin: 150,
				// vp — kept well above the barrier (baseY 940, dome peak ~870)
				// so this player-only attack never visually crosses into
				// barrier territory, even at a dead-vertical lock.
				boundYMax: 820,
				contactDamage: 22,
				recoverDuration: 0.9, // seconds to smoothstep-ease back to the shared rest point once the dash ends

				indicatorColor: "#FFFFFF",
				indicatorLineWidth: 3,
				indicatorGlowBlur: 10,
				indicatorDashPulseSpeed: 5, // rad/sec-ish — how fast the indicator line/reticle pulse during the telegraph
				targetRingRadius: 24,
				targetRingLineWidth: 2.5,
				targetDotRadius: 5,
				targetDotLineWidth: 3.5,
				targetDotGlowBlur: 8,
			}),

			// Phase 3 — sweeping beam + sway, see class doc.
			sway: Object.freeze({
				swaySpeed: 1.5, // rad/sec
				// EXACT full sway periods, not a raw seconds duration — see
				// class doc for why this must divide evenly (PhoenixBoss.js
				// derives phase3's actual duration as swayCycles * 2π/swaySpeed).
				swayCycles: 2,
				swayAmplitude: 130,
				warmupDuration: 0.5, // seconds the beam is visible but harmless on every phase-3 entry
				halfWidth: 14,
				damage: 14,
				color: "#E8382F",
				coreColor: "#FFD966",
				lineWidth: 6,
				coreLineWidth: 2,
				glowBlur: 16,
			}),

			sparksPerEmit: 42,
			points: 3600,
			gold: 175,
			audio: Object.freeze({
				src: "assets/audio/explosion.mp3",
				volume: 0.8,
				poolSize: 3,
			}),
		}),

		/**
		 * Boss #10 — "Electron". An original hull (see ElectronBoss.js's
		 * ELECTRON_HULL_PTS — a sharp 4-point spark/sparkle star, alternating
		 * outer spike-tip and inner core radius around a full circle, same
		 * construction as Spiral's own N-pointed star just half the spikes and
		 * a tighter inner ratio for a sharper "spark" read instead of Spiral's
		 * rounder gear), same "original hull" lineage as Spiral/Tetra/Nova/
		 * Pulsor/Zigzag/Phoenix. No engine flame (a floating spark has no
		 * thruster) — a pulsing core-ring glow stands in for one, same
		 * reasoning as every other turret-style original hull.
		 *
		 * A repeating TIMED loop between THREE phases (`_phase`/`_phaseAge`),
		 * same shape as Phoenix's own 3-phase loop, but unlike Phoenix's
		 * shared-rest-point design, only phase 3 ever leaves the rest point —
		 * phases 1/2 both hold perfectly still at (restX, restY) (see
		 * ElectronBoss.js's class doc):
		 *
		 *   phase 1 (`phase1Duration` seconds) — "Spark Barrage": tracks the
		 *   player (`_angle = atan2(-dx, dy)`, same convention Nova/Scout/
		 *   BossEnemy already use) and fires ONE bolt (`bolt`,
		 *   ElectronBolts.js) straight at the player's CURRENT position — no
		 *   lead prediction, same idiom as Nova's seed/Phoenix's fireball —
		 *   every `bolt.fireInterval` seconds. Unlike Tetra/Spiral/Nova's own
		 *   "slow bullet, dodge at leisure" bullets, this leans the other
		 *   way: a moderate cadence but a FAST travel speed, so each
		 *   individual bolt is the real threat, not sheer stream density.
		 *
		 *   phase 2 (`chain`) — "Chain Lash": fires `chain.chainCount`
		 *   twin-sphere bolts (ElectronChains.js — two linked orbs,
		 *   `chain.spacing` apart, oriented perpendicular to their own travel
		 *   direction), `chain.chainInterval` seconds apart, each launched
		 *   from the boss's OWN current (x, y) straight at the player's
		 *   CURRENT position — same "aim once, no lead" idiom as phase 1's
		 *   bolt, just two orbs instead of one. The connecting link between
		 *   the two orbs is redrawn with a fresh random jitter every frame
		 *   (see ElectronChains.render) for a crackling "real electricity"
		 *   look; contact with either orb OR the link between them damages
		 *   the player and consumes the whole bolt, same swap-remove-on-hit
		 *   shape as every other boss bullet pool's own `checkHit`.
		 *
		 *   phase 3 (`surge`) — "Overcharge": the ONLY phase this boss
		 *   actually moves — a wandering patrol (`moveSpeed`, seeking a fresh
		 *   random point inside the bounds every time it arrives at its last
		 *   one, see ElectronBoss._pickWanderTarget/_updateRoam — not a
		 *   random-heading drift, which mostly loitered near wherever phase 3
		 *   started instead of actually covering the area) rather than the
		 *   fixed-point hold of phases 1/2. `boundMarginX`/`boundYMin`/
		 *   `boundYMax` deliberately cover nearly the WHOLE arena — the same
		 *   space the player themselves can move in, not a tucked-away upper
		 *   band like every other patrolling boss — the only hard limit is
		 *   staying clear of the barrier below (`boundYMax`, same
		 *   margin-above-the-dome-peak reasoning Phoenix's own charge bounds
		 *   use). While roaming it
		 *   repeatedly "surges": every `surge.interval` seconds it telegraphs
		 *   (a growing ring, harmless, for `surge.telegraphDuration` seconds
		 *   — the same fairness window every other telegraphed attack in
		 *   this game gives), then goes live for `surge.activeDuration`
		 *   seconds dealing `surge.damage` to the player if they're within
		 *   `surge.radius` — opts into WaveManager.checkPlayerHit's existing
		 *   `.contactDamage` circle-test hook the same way Bouncer/Phoenix's
		 *   charge already do, just paired with a NEW optional
		 *   `.contactRadius` getter so the AOE can reach well past this
		 *   boss's own `hitRadius` without inflating the hitbox player
		 *   bullets test against (see WaveManager.checkPlayerHit's own doc
		 *   for that one-line extension) — then `surge.recoverDuration`
		 *   seconds fading out before the next telegraph. Once
		 *   `phase3Duration` total seconds have passed it eases smoothly back
		 *   to (restX, restY) over `returnDuration` seconds (smoothstep, same
		 *   technique Phoenix's own charge-phase 'recover' beat uses) before
		 *   phase 1 begins again — the fixed rest point phases 1/2 both
		 *   expect to start from.
		 *
		 * Hit/death-flash/entry-glide rendering reuse the same shared
		 * EnemyCombat.js functions every other boss/enemy class uses — see
		 * that file's header for why those are plain functions rather than a
		 * base class.
		 */
		electron: Object.freeze({
			name: "ELECTRON",

			size: 46, // vp — outer spike-tip radius (see ELECTRON_HULL_PTS)
			innerRadiusRatio: 0.34, // core-ring radius as a fraction of `size` — tighter than Spiral's 0.45 for a sharper spike read
			health: 600,
			healthPerLevel: 75,
			color: "#22E8FF", // electric cyan — distinct from every other boss color (red/violet/amber/green/blue/gold/coral/orange/crimson) and reads as raw current, not Tetra's cooler "electric blue" laser hue
			fillColor: "#03181f",
			lineWidth: 3,
			glowBlur: 18,
			hitGlowBlur: 30,
			hitRadius: 46, // vp — matches `size`, same convention as Spiral's hitRadius

			entrySpeed: 150,
			// vp — shared rest point (with restX = arena center, set in
			// ElectronBoss's constructor) that phases 1 AND 2 both hold
			// perfectly still at — only phase 3 ever leaves it, easing back
			// here via `returnDuration` once phase 3 ends. See class doc.
			restY: 260,

			// How long phases 1 and 3 last before advancing — phase 2 instead
			// ends once its own `chain.chainCount` chains have fully played out
			// (see ElectronBoss._updateChainPhase), not a raw duration.
			phase1Duration: 7,
			phase3Duration: 9,

			// Phase 1 — dedicated bullet pool (ElectronBolts.js), fired
			// straight at the player's current position — see class doc for
			// why a fast travel speed (not sheer stream density) is this
			// attack's real threat.
			bolt: Object.freeze({
				fireInterval: 0.45, // seconds between shots — a real single-target cadence, not a barrage
				speed: 260, // vp/sec — noticeably faster than Tetra/Spiral/Nova's own "slow bullet" bosses, the actual threat here
				color: "#22E8FF",
				lineWidth: 4,
				glowBlur: 12,
				halfLen: 5,
				poolSize: 40,
				damage: 6, // matches a regular Scout bullet (Config.enemyBullet.damage)
			}),

			// Phase 2 — twin-sphere linked-bolt pool (ElectronChains.js). Each
			// bolt is 2 orbs `spacing` apart (oriented perpendicular to its
			// own travel direction, so the pair always reads as "wide" from
			// the player's approach angle) launched from the boss's own
			// current position straight at the player — see class doc.
			chain: Object.freeze({
				spacing: 70, // vp between the two linked orbs — a long connecting link, reads as a real hazard rather than a hairline
				sphereRadius: 7, // vp — each orb's rendered radius
				jitterAmount: 7, // vp — max per-frame random offset applied to the connecting link's midpoints, see ElectronChains.render
				speed: 190, // vp/sec
				chainCount: 12, // bolts fired per phase-2 visit
				chainInterval: 0.42, // seconds between bolts (40% slower than the original 0.3) — also re-aims the next one at the player's CURRENT position
				settleDuration: 1.0, // seconds after the last bolt fires before phase 3 begins — a breathing-room beat
				halfWidth: 12, // vp — collision half-thickness (added to the player's own hitRadius) tested against the link between the two orbs
				damage: 14, // player HP lost on contact — a single consuming hit (see ElectronChains.checkHit), not a per-frame tick
				poolSize: 18, // generous vs. chainCount (12) — several of one visit's bolts can be in flight at once, plus stragglers from the last visit
				color: "#22E8FF",
				lineWidth: 5, // a little wider than a normal boss-bullet stroke — this is a "connection", not a thin capsule
				glowBlur: 14,
			}),

			// Phase 3 — wandering patrol + periodic AOE pulse, see class doc.
			// Bounds cover nearly the full arena — only `boundYMax` is a real
			// constraint, keeping the boss clear of the barrier below.
			moveSpeed: 160, // vp/sec — brisk enough to actually cross the much larger roam area between wander-target picks, see ElectronBoss._updateRoam
			boundMarginX: 56, // vp from each side edge — just past `hitRadius`, so the hull's own spikes don't clip off-screen
			boundYMin: 175, // vp — kept clear of the boss health bar above it
			// vp — kept above the barrier (Config.barrier baseY 940, dome
			// peak ~870 at center) with the same margin reasoning Phoenix's
			// own charge attack bounds (`Config.boss.phoenix.charge.boundYMax`)
			// already use for the identical concern.
			boundYMax: 820,
			surgeRotationSpeed: 2.0, // rad/sec — continuous hull spin through phase 3, purely cosmetic (no attack reads its facing)
			returnDuration: 0.8, // seconds to smoothstep-ease back to (restX, restY) once phase 3 ends

			surge: Object.freeze({
				interval: 2.4, // seconds between surge pulses during phase 3
				telegraphDuration: 0.6, // seconds the growing warning ring is up before the pulse goes live — the fairness/reaction window
				activeDuration: 0.5, // seconds the AOE actually deals damage
				recoverDuration: 0.4, // seconds the ring fades out afterward
				radius: 110, // vp — AOE reach, well past `hitRadius` (see `.contactRadius`)
				damage: 18,
				color: "#22E8FF",
			}),

			// Pulsing core-ring glow at the center — stands in for an engine
			// flame, same reasoning as every other original-hull boss
			// (Spiral/Tetra/Nova/Pulsor/Zigzag's own `coreGlow*` fields).
			coreRadius: 15, // vp
			coreGlowLineWidth: 3,
			coreGlowBlur: 12,
			coreGlowPulseSpeed: 3, // rad/sec — breathing pulse

			sparksPerEmit: 44,
			points: 3700,
			gold: 180,
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

			// Shown whenever the active boss exposes a truthy `invulnerable`
			// getter (currently only SnakeBoss, during its phase2 burst — see
			// Config.boss.snake.phase2) — a generic hook so any future boss
			// with a similar temporary-invulnerability mechanic gets the same
			// indicator for free, no per-boss WaveManager code needed. Reads
			// the boss's own `age` (dt-accumulated, not wall-clock — see
			// SnakeBoss's `_age`) to drive the pulse so it stays in lockstep
			// with everything else in the game's frame-rate-independent timing.
			invulnerableOutlineColor: "#ffe873",
			invulnerableOutlineWidth: 3,
			invulnerableOutlineGlowBlur: 14,
			invulnerableText: "INVULNERABLE",
			invulnerableFont: '400 13px "Audiowide", "Courier New", monospace',
			invulnerableColor: "#ffe873",
			invulnerableGlowBlur: 8,
			invulnerableOffsetY: 22, // vp below the bar's own y
			invulnerablePulseSpeed: 6, // rad/sec — fast/urgent, distinct from the slower "alive breathing" pulses elsewhere in the game
			invulnerablePulseMin: 0.35, // alpha floor so the outline/text never fully vanish mid-pulse
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
	 *     playing through the cinematic, then fading back out the instant
	 *     the title/PLAY card ("the main menu") is reached (Game.js's
	 *     `_fadeOutPrologueMusic`, passed to PrologueScene as
	 *     `onMainMenuReached`) — so the main menu itself, and the tutorial
	 *     that follows it, play in silence.
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
		prologueFadeOutDuration: 0.6, // stops promptly once the main menu is reached, but not instantly

		themeSrc: "assets/audio/bg-music.mp3",
		themeVolume: 0.22, // BGM bed — lower than SFX so bullets and explosions always sit clearly on top
		themeLoop: true,
		themeFadeInDuration: 1.0, // eases in on gameplay start/restart
		themeFadeOutDuration: 0.7, // smooth stop on death, not an abrupt cut
	}),

	/**
	 * One shared "button tapped" blip, played by core/UiSound.js's
	 * `playButtonClick()` — every real button across every scene/panel
	 * (mode buttons, panel open/close buttons, Shop/Codex buttons, HUD
	 * icons, mission-select tiles, REVIVE, etc.) calls that same function
	 * rather than each owning its own AudioPool, so this one config entry
	 * tunes the feel of every button in the game at once.
	 * Deliberately NOT used for full-screen "tap anywhere to continue"
	 * dismissals (tutorial hints, the post-death "any other tap restarts"
	 * fallback, mission-complete's tap-to-continue) — those aren't discrete
	 * buttons, so they stay silent here. Also skipped on a button tap whose
	 * underlying action is a no-op (an unaffordable Shop card, a locked
	 * mission node) — same "reads as a disabled control" silence those
	 * already used before this existed.
	 */
	ui: Object.freeze({
		click: Object.freeze({
			audioSrc: "assets/audio/click.mp3",
			volume: 0.4,
		}),
	}),

	/**
	 * Colors. Centralised so the renderer stays dumb about theme.
	 */
	colors: Object.freeze({
		void: "#05070f", // deep space background
		// The colorblind-mode swap for the game's one reused "danger red" —
		// see core/Settings.js's dangerColor() for which call sites wrap
		// themselves with it and why only this one signal is remapped.
		// Amber rather than another red/green so it stays distinct from
		// both the danger-red it replaces AND the game's cyan/green accents
		// under red-green colorblindness, the most common form.
		dangerColorblind: "#FFB627",
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
		maxHealthPerLevel: 30, // +30 max HP per wave level beyond 1 — see Barrier.maxHealth/setLevel. Same "base + (level-1)*perLevel" shape as Config.player.damage/damagePerLevel.
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
		labelFont: '400 12px "Audiowide", "Courier New", monospace', // bumped from 10px for legibility at real device scale
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
			color: "#4DEFFF", // full-health fill color — ramps toward Config.player.lowHealth.color as health drops, see cautionThresholdRatio
			// Fraction of maxHealth at/below which the bar's fill (and its "N / max"
			// readout) begins ramping from `color` toward Config.player.lowHealth.color
			// — reaching pure red exactly at lowHealth.threshold, where the existing
			// pulse also kicks in. A graduated warning instead of a sudden binary
			// flip, since health is the single most important stat on screen.
			cautionThresholdRatio: 0.5,
			// Bumped from 9px — this renders the actual "N / max" numeric readout,
			// not a small caption, so it needs to be legible at real device scale
			// (Config.playbackControls' own comment has the CSS-px math this was
			// checked against).
			labelFont: '400 13px "Audiowide", "Courier New", monospace',
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
		 * every other tap target in the game.
		 */
		goldButton: Object.freeze({
			hitWidth: 120,
			hitHeight: 64,
			hitInsetTop: 8, // vp above the label's y-anchor included in the tap target
		}),
	}),

	/**
	 * Shop — the player's actual ship (Player.js, reused as-is — no
	 * re-derived approximation, same philosophy as EnemyCodex's enemy
	 * previews — rendered at its real Config.player position/scale, just
	 * relocated to screen center via `ship`) sits in the middle, with one
	 * card per upgradable part (see Shop.js's PARTS) arranged in a pentagon
	 * around it — `cardCenter` below places all 5 via one shared angle/
	 * radius formula (`-90° + i*72°`, i.e. one card straight up, the rest
	 * spaced evenly clockwise) rather than per-card coordinates, so the
	 * layout stays symmetric even though 5 doesn't divide the screen's own
	 * compass points evenly the way the old 4-card top/bottom/left/right
	 * version did. A thin connector line ties each card back to the ship,
	 * same "this part belongs to that ship" cue the original layout used.
	 * The part roster itself (names/icon glyphs) lives in Shop.js, not here
	 * — same content/chrome split as EnemyCodex (roster in EnemyCodex.js's
	 * ENTRIES, layout/chrome tuning here); the real numeric stats/costs live
	 * on Config.player.wings/engine/cannon/magnet/missiles instead, since
	 * those are shared with actual gameplay, not Shop-only display data.
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
			radius: 25, // bumped from 18 to match Config.codex.button's radius — the established accessible-touch-target baseline this game already uses for the mute/codex/pause row
			color: "#4DEFFF",
			lineWidth: 2,
			glowBlur: 7,
			font: '400 22px "Audiowide", "Courier New", monospace', // bumped from 18px to match the larger circle
		}),

		// The ship renders at its real in-game silhouette, centered in the
		// screen so the 5-card pentagon has equal room to breathe on every
		// side — see Shop.js's frozen preview instance.
		ship: Object.freeze({ x: 270, y: 480 }),
		cardRadiusX: 195, // vp — horizontal distance from ship center to a card's center
		cardRadiusY: 230, // vp — vertical distance (taller than X since the virtual canvas is a 9:16 portrait)

		connectorColor: "#4DEFFF",
		connectorLineWidth: 1,
		connectorAlpha: 0.25,

		// Corner-bracket-framed cards (same chrome motif as the codex's preview
		// frame / the title screen's PLAY button — see core/shapes.js's
		// cornerBracketPath), not a filled box, to read as this game's UI
		// rather than a generic panel. The whole card is the tap target.
		cardWidth: 140,
		cardHeight: 100,
		cardLegSize: 10,
		cardLineWidth: 1,
		cardGlowBlur: 3,

		// Icon glyph (see Shop.js's PARTS) drawn near the top of each card.
		iconOffsetY: -30, // vp above the card's center
		iconLineWidth: 1.5,
		iconGlowBlur: 4,

		nameFont: '400 12px "Audiowide", "Courier New", monospace',
		nameColor: "#e8ecff",
		nameOffsetY: -10, // vp from the card's center

		// Level readout ("LV 4/10") — a compact text line rather than one pip
		// per level; with 10 levels per part now (see Config.player.wings/
		// engine/cannon/magnet/missiles), 10 individual dots would have been
		// too cramped/fiddly to read at this card size, so this reuses the
		// same "labeled number" language the rest of the HUD already uses
		// (health "100/185", barrier "PWR"/"LVL") instead.
		levelFont: '400 11px "Audiowide", "Courier New", monospace',
		levelColor: "#aab4d4",
		levelOffsetY: 8, // vp from the card's center

		costFont: '400 13px "Audiowide", "Courier New", monospace',
		costOffsetY: 28, // vp from the card's center
		buyAffordableColor: "#4DEFFF",
		buyUnaffordableColor: "#4a5570", // dim — reads as "disabled," same intent as a grayed-out control
		buyMaxedColor: "#4DFF8A", // same soft green as Config.powerUps.health — "fully upgraded" reads the same as "restored"
		maxedText: "MAX",

		footerFont: '400 11px "Audiowide", "Courier New", monospace',
		footerColor: "#aab4d4",
		footerY: 900,
		footerText: "TAP A PART TO UPGRADE",

		// Plays on a SUCCESSFUL purchase only (see Shop._buy) in place of the
		// generic Config.ui.click blip — reuses the same celebratory sting
		// DailyRewardPanel's CLAIM uses (Config.dailyReward.claimAudioSrc),
		// same "a bigger moment gets its own distinct sound" reasoning, just
		// its own independent volume/AudioPool instance.
		buySuccessAudioSrc: "assets/audio/reward.mp3",
		buySuccessVolume: 0.5,

		// "+1 LVL" popup on a successful buy — same FloatingText rise-and-fade
		// entities/FloatingText.js already uses for "+N GOLD" pickups, spawned
		// from Shop's own instance right above the card that was bought.
		upgradePopupText: "+1 LVL",
		upgradePopupColor: "#4DFF8A", // same soft green as buyMaxedColor — "leveled up" reads the same as "fully upgraded"
		upgradePopupOffsetY: -60, // vp above the card's center — clears the corner-bracket frame
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

			descFont: '400 16px "Courier New", monospace', // bumped from 15px for legibility at real device scale
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
			// vp — half-width/height of the tappable arrow hit-box. Bumped from 22:
			// a 44-VIRTUAL-px hit box isn't the same as a 44-CSS-px one — at this
			// game's real device scale (~0.67-0.77x, see Config.playbackControls'
			// own comment) the old value only landed at ~29-34 CSS px. 30 lands
			// much closer to the actual 44 CSS px target.
			arrowHalfSize: 30,

			footerFont: '400 11px "Audiowide", "Courier New", monospace',
			footerColor: "#aab4d4",
			footerY: 780,
			footerText: "TAP ARROWS TO BROWSE · TAP ? TO CLOSE",
		}),
	}),

	/**
	 * The Achievements button + browsable card overlay (see
	 * entities/AchievementsPanel.js) — composed into PrologueScene's 'title'
	 * beat only, mirroring Config.settings.button's placement but on the
	 * OPPOSITE top corner (x:40 vs settings' x:500) so the two sit
	 * symmetrically either side of the title card. Not reachable mid-run —
	 * same reasoning as Settings (see SettingsPanel's own class doc): a
	 * lifetime-stats browser isn't gameplay-critical, and gameplay's own
	 * top-center button row (mute/codex/pause) is already at capacity.
	 *
	 * `overlay` reuses EnemyCodex's paginated-card layout almost exactly
	 * (same titleY/progressY, same arrow geometry) since it's the same
	 * "browse N items with arrows" shape, just one achievement TRACK per
	 * card instead of one enemy. `pip` is the 3-tier progress strip inside
	 * each card — same corner-bracket-frame technique as
	 * DailyRewardPanel.streakStrip's 7 day-pips, just 3 wide and bigger
	 * since there are far fewer of them to fit. `toast` tunes the
	 * celebratory pop-up (entities/AchievementToast.js) fired the moment a
	 * tier unlocks mid-run — same three-phase pop/hold/fade shape as
	 * Config.combo.banner, parked lower on screen (posY 460 vs combo's 380).
	 * That static split alone isn't enough room once both are at full size
	 * together, so `toast.comboClearanceOffsetY`/`comboOffsetRate` ease in
	 * extra clearance while the combo banner is also active — see
	 * AchievementToast's class doc. `tierRewards` is the flat gold payout
	 * (index 0-2, same tier ladder as tierLabels) credited to the HUD wallet
	 * the instant AchievementToast sees a tier crossed — same amount
	 * regardless of which TRACK, previewed in the panel's `pip.reward*` line
	 * and confirmed live in the toast's own sub-text.
	 */
	achievements: Object.freeze({
		button: Object.freeze({
			x: 40,
			y: 45,
			radius: 25,
			glyph: "🏆",
			color: "#4DEFFF",
			lineWidth: 2,
			glowBlur: 7,
			font: '400 20px "Audiowide", "Courier New", monospace',
			pulseSpeed: 2.0,
			pulseDepth: 0.3,
		}),
		tierLabels: Object.freeze(["I", "II", "III"]),
		// Gold credited straight to the HUD wallet the instant a tier unlocks
		// (AchievementToast.checkForUnlocks) — flat per tier level regardless
		// of which track, indexed 0-2 alongside tierLabels I/II/III.
		tierRewards: Object.freeze([250, 500, 1000]),
		overlay: Object.freeze({
			fadeInDuration: 0.2,

			titleFont: '400 16px "Audiowide", "Courier New", monospace',
			titleColor: "#4DEFFF",
			titleY: 100,

			progressFont: '400 12px "Audiowide", "Courier New", monospace',
			progressColor: "#aab4d4",
			progressY: 130,

			// The overall "N / 33 tiers unlocked" headline — distinct from
			// progressY's per-card page index just above it, and the whole
			// reason this screen exists: a persistent, always-visible measure
			// of lifetime progress, not just this one card's.
			overallFont: '400 14px "Audiowide", "Courier New", monospace',
			overallColor: "#4DFF8A",
			overallY: 158,

			trackTitleFont: '400 26px "Audiowide", "Courier New", monospace',
			trackTitleGlowBlur: 8,
			trackTitleY: 240,

			descFont: '400 15px "Courier New", monospace',
			descColor: "#e8ecff",
			descY: 285,
			descLineHeight: 22,
			descMaxWidth: 420,

			arrowColor: "#4DEFFF",
			arrowGlowBlur: 6,
			arrowY: 460, // aligned with the pip strip
			arrowMarginX: 40,
			arrowHalfSize: 30,

			footerFont: '400 11px "Audiowide", "Courier New", monospace',
			footerColor: "#aab4d4",
			footerY: 780,
			footerText: "TAP ARROWS TO BROWSE · TAP 🏆 TO CLOSE",
		}),
		// The 3-pip tier strip inside each card — see class doc. Colors reuse
		// the same three semantic states MissionSelect/Shop already use:
		// unlocked = completedColor, next-up = unlockedColor, not-yet-reachable = lockedColor.
		pip: Object.freeze({
			y: 460,
			size: 76,
			legSize: 14,
			gap: 40,
			lineWidth: 2,
			labelFont: '400 20px "Audiowide", "Courier New", monospace',
			unlockedColor: "#4DFF8A",
			currentColor: "#4DEFFF",
			lockedColor: "#4a5570",
			currentPulseSpeed: 2.4,
			currentPulseDepth: 0.25,
			checkLineWidth: 3,

			valueFont: '400 15px "Audiowide", "Courier New", monospace',
			valueY: 520, // current progress toward the next tier, or "ALL TIERS UNLOCKED"
			thresholdsFont: '400 11px "Courier New", monospace',
			thresholdsColor: "#aab4d4",
			thresholdsY: 548, // dim reference line listing all 3 thresholds

			rewardFont: '400 12px "Audiowide", "Courier New", monospace',
			rewardColor: "#FFD24D",
			rewardY: 578, // gold ladder, same flat reward for every track — see Config.achievements.tierRewards
		}),
		toast: Object.freeze({
			posY: 460,
			tagFont: '400 12px "Audiowide", "Courier New", monospace',
			tagText: "ACHIEVEMENT UNLOCKED",
			titleFont: '400 24px "Audiowide", "Courier New", monospace',
			subFont: '400 15px "Audiowide", "Courier New", monospace',
			color: "#4DFF8A",
			glowBlur: 14,
			tagOffsetY: -30,
			subOffsetY: 30,
			popDuration: 0.25,
			popOvershoot: 2.0,
			holdDuration: 1.4, // longer than Config.combo.banner's 0.85 — a rarer event, worth a beat longer to actually read
			fadeOutDuration: 0.4,
			// Extra downward push (added to posY) eased in while
			// Config.combo.banner is also on screen, so a simultaneous
			// combo-tier-up + achievement-unlock don't crowd each other's text
			// — see AchievementToast._comboOffsetY. Eased rather than snapped
			// so it doesn't visibly "pop" if the combo banner ends mid-toast.
			comboClearanceOffsetY: 65, // vp
			comboOffsetRate: 10, // 1/sec convergence rate — same exponential-ease shape as Config.level's duckInRate/duckOutRate
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
	 * SettingsPanel — a ⚙ button + full-screen overlay composed into
	 * PrologueScene's title beat ONLY (see that scene's class doc for why
	 * settings deliberately isn't reachable mid-run, unlike mute/pause).
	 * Same "one button toggles open/closed" shape as `codex` above, same
	 * "dimmed background is inert" convention as `shop`. Five rows, each
	 * built from `overlay.contentStartY + i * overlay.rowSpacing`:
	 * VOLUME/SENSITIVITY (sliders — no slider primitive exists on Renderer,
	 * so each is a `fillStrokePaths` rect track+fill plus a `fillEllipse`
	 * knob), HAPTICS/COLORBLIND (toggle switches), TEXT SIZE (a 3-way
	 * segmented control). See core/Settings.js for the persisted values
	 * these all read/write, and core/AudioSettings.js for volume
	 * specifically (grouped with mute there, not here).
	 */
	settings: Object.freeze({
		button: Object.freeze({
			x: 500,
			y: 45,
			radius: 25,
			color: "#4DEFFF",
			lineWidth: 2,
			glowBlur: 7,
			font: '400 20px "Audiowide", "Courier New", monospace',
			pulseSpeed: 2.0,
			pulseDepth: 0.3,
		}),
		overlay: Object.freeze({
			fadeInDuration: 0.2,

			titleFont: '400 16px "Audiowide", "Courier New", monospace',
			titleColor: "#4DEFFF",
			titleY: 100,

			contentStartY: 190, // first row's label baseline
			rowSpacing: 92, // vertical distance between each row's label baseline
			controlOffsetY: 32, // the row's control (slider/toggle/segmented) sits this far below its label

			labelFont: '400 13px "Audiowide", "Courier New", monospace',
			labelColor: "#aab4d4",
			valueFont: '400 12px "Courier New", monospace',
			valueColor: "#4DEFFF",

			footerFont: '400 11px "Audiowide", "Courier New", monospace',
			footerColor: "#aab4d4",
			footerY: 860,
			footerText: "TAP ⚙ TO CLOSE",
		}),
		slider: Object.freeze({
			trackWidth: 260,
			trackHeight: 6,
			trackColor: "#2a3350",
			fillColor: "#4DEFFF",
			knobRadius: 9,
			knobColor: "#4DEFFF",
			knobLineWidth: 2,
			glowBlur: 6,
			hitPaddingY: 18, // extra vertical hit-test margin around the thin track, for a real touch target
		}),
		toggle: Object.freeze({
			width: 52,
			height: 26,
			onColor: "#4DFF8A",
			offColor: "#4a5570",
			knobColor: "#e8ecff",
			labelOnText: "ON",
			labelOffText: "OFF",
			font: '400 11px "Audiowide", "Courier New", monospace',
		}),
		segmented: Object.freeze({
			options: Object.freeze(["SMALL", "NORMAL", "LARGE"]),
			optionWidth: 84,
			height: 30,
			gap: 6,
			legSize: 8,
			activeColor: "#4DEFFF",
			inactiveColor: "#4a5570",
			font: '400 11px "Audiowide", "Courier New", monospace',
		}),
		// Vibration durations (ms) for the two haptics hooks — Player.takeDamage
		// (a real hit landed) and WaveManager.handleBulletHit (an enemy died).
		// Both no-op unless core/Settings.js's haptics toggle is on, and
		// degrade silently on browsers with no Vibration API (every iOS
		// browser) — see Settings.js's vibrate().
		haptics: Object.freeze({
			hitPatternMs: 35,
			killPatternMs: 12,
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
		// Cooldown seconds before the bomb can be used again — kept independent
		// per mode (see PlayerSkill.use()/Config.mission's own doc for why
		// mode configs are kept separate throughout this file), so either can
		// be tuned without touching the other. Mission Mode's is 20s shorter
		// than Survival's: missions are short, discrete engagements (one wave
		// each) rather than an endless run, so the panic button needs to come
		// back around faster to matter more than once or twice a campaign.
		cooldown: Object.freeze({
			survival: 85,
			mission: 65,
		}),
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
		tapFont: '400 13px "Audiowide", "Courier New", monospace', // bumped from 10px for legibility at real device scale
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
