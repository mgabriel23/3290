/**
 * HUD.js
 * Gameplay heads-up display: a score panel (top-left), a gold panel
 * (top-right), and a player health bar (top-center, under the mute/codex/
 * pause button row) rendered over the gameplay scene every frame.
 *
 * The score/gold panels are each a single L-bracket corner accent, a dim
 * label, and a brighter neon value — the same sci-fi design language as
 * the title screen's chrome and button. Score and gold are still plain
 * public fields that gameplay systems write to directly (`hud.score += n`)
 * — the HUD stays opinion-free about where the numbers come from — but
 * they're now getter/setter-backed so that write also carries the field's
 * persistence behavior (see Storage.js): score tracks an all-time best
 * (only saved once it's actually beaten), gold is a running wallet total
 * saved on every change.
 *
 * The GOLD panel doubles as a button: `isInsideGoldPanel` is its tap
 * hit-test, wired up by GameplayScene to open the Shop overlay (see
 * Shop.js) — HUD only owns the hit-test (it's HUD's own geometry), not the
 * shop itself or the open/close state.
 *
 * Health is different: it's owned by Player (mirrors `Barrier.health`'s
 * convention), not by HUD, so `render(renderer, health, maxHealth)` takes
 * both the current value AND the current ceiling as parameters instead —
 * the same pattern `Barrier.render` already uses for `power`. `maxHealth`
 * varies with the Shop-purchased engine level (see Player.maxHealth,
 * Config.player.engine) rather than being a fixed Config constant, which is
 * why it has to be passed in per-frame instead of read straight off Config
 * like it used to be. Its low-health color/pulse reads `Config.player.
 * lowHealth` directly, so the bar and the ship's own hull pulse read as
 * one consistent warning cue. Needs `update(dt)` purely to drive that
 * pulse's clock (`_age`) — the score/gold panels have no such need.
 *
 * A fire-boost badge (right-middle of the screen, see `_renderFireBoostIndicator`)
 * follows the same externally-owned-value pattern: `render`'s optional third
 * parameter is GameplayScene's `_fireBoostTimer` (seconds remaining, 0 =
 * inactive) — HUD itself has no opinion on when the boost starts or how long
 * it lasts, it just draws whatever's handed to it, same as `health`. A
 * fourth parameter, `invincibleTimer` (Player's own `invincibleTimer`
 * getter), drives a matching badge mirrored onto the LEFT-middle edge (see
 * `_renderInvincibleIndicator`) so the two never overlap even when both
 * buffs are active together.
 *
 * All bracket/bar geometry is pre-allocated once in the constructor so
 * `render` produces zero per-frame allocations regardless of update rate.
 */
import { Config } from "../core/Config.js";
import { cornerBracketPath } from "../core/shapes.js";
import { loadNumber, saveNumber } from "../core/Storage.js";
import { lerpHexColor } from "../core/color.js";
import { dangerColor, textSizeScale } from "../core/Settings.js";
import { getUpgradeSummary } from "../core/PlayerUpgrades.js";

export class HUD {
	constructor() {
		this._score = 0;
		this.bestScore = loadNumber("bestScore", 0);
		this._gold = loadNumber("gold", 0);
		this._age = 0; // seconds — drives the health bar's low-health pulse only
		// Cached rather than re-read from Storage every render() call (same
		// "cache in a field, write on change" convention score/gold already
		// use) — only ever changes on a Shop purchase, which calls
		// refreshUpgradeSummary() directly (see Shop._buy) instead of this
		// polling Storage 5 times a frame for a value that's static almost all
		// the time.
		this._upgradeSummary = getUpgradeSummary();
		this._initGeometry();
	}

	/** Re-reads the total upgrade progress from Storage — called by Shop.js right after a successful purchase persists a new part level. */
	refreshUpgradeSummary() {
		this._upgradeSummary = getUpgradeSummary();
	}

	/** Advance the health bar's low-health pulse clock. */
	update(dt) {
		this._age += dt;
	}

	/** Current run's score — starts at 0 each session. */
	get score() {
		return this._score;
	}
	set score(value) {
		this._score = value;
		if (this._score > this.bestScore) {
			this.bestScore = this._score;
			saveNumber("bestScore", this.bestScore);
		}
	}

	/** Wallet total — persists forward across sessions, no "best" concept. */
	get gold() {
		return this._gold;
	}
	set gold(value) {
		this._gold = value;
		saveNumber("gold", this._gold);
	}

	/**
	 * True while (x, y) is inside the GOLD panel's tap target — opens the
	 * Shop (see Shop.js, GameplayScene.handleTap). HUD owns this hit-test
	 * itself, same convention as EnemyCodex.isInsideButton/PlaybackControls'
	 * isInsideMuteButton, since HUD is what actually draws the panel this
	 * button lives on top of.
	 * @param {number} x @param {number} y
	 */
	isInsideGoldPanel(x, y) {
		const { margin, goldButton } = Config.hud;
		const { width: vW } = Config.virtual;
		const right = vW - margin + 8;
		const left = right - goldButton.hitWidth;
		const top = margin - goldButton.hitInsetTop;
		const bottom = top + goldButton.hitHeight;
		return x >= left && x <= right && y >= top && y <= bottom;
	}

	/**
	 * Draw the score/gold panels and the health bar over whatever was
	 * rendered before this call.
	 * @param {import('../core/Renderer.js').Renderer} renderer
	 * @param {number} health  the player's current health — see class doc
	 * @param {number} [maxHealth]  the player's current max health (Player.
	 *   maxHealth — varies with the Shop-purchased engine level, see
	 *   Config.player.engine) — defaults to the free starting tier's value for
	 *   callers with no real Player instance (TutorialScene's preview HUD)
	 * @param {number} [fireBoostTimer]  seconds remaining on an active fireBoost
	 *   PowerUp (0 or omitted = inactive, badge is skipped entirely) — see class doc
	 * @param {number} [invincibleTimer]  seconds remaining on an active invincible
	 *   PowerUp (0 or omitted = inactive, badge is skipped entirely) — see class doc
	 * @param {number} [comboMultiplier]  current score-combo multiplier (see
	 *   Config.combo, GameplayScene._comboMultiplier) — 1 or omitted = no
	 *   streak yet, the readout is skipped entirely, same "only show while it
	 *   matters" convention as the fireBoost/invincible badges
	 */
	render(
		renderer,
		health,
		maxHealth = Config.player.engine.levels[0].maxHealth,
		fireBoostTimer = 0,
		invincibleTimer = 0,
		comboMultiplier = 1,
	) {
		const {
			margin,
			labelFont,
			labelColor,
			valueFont,
			valueColor,
			valueGlowBlur,
			bestFont,
			combo,
			chromeColor,
			chromeLineWidth,
			chromeGlowBlur,
		} = Config.hud;
		// The Settings panel's text-size toggle (core/Settings.js) — applied via
		// Renderer.drawText's own `scale` option, so it needs no font-string
		// parsing. Scoped to the persistent gameplay HUD only (score/gold/best/
		// combo/health-bar text below), not every overlay in the game.
		const scale = textSizeScale();

		// Both brackets in one strokePaths call → one shadow-blur GPU pass instead of two.
		renderer.strokePaths(this._allBrackets, {
			color: chromeColor,
			lineWidth: chromeLineWidth,
			glowBlur: chromeGlowBlur,
		});

		// Score panel (left)
		renderer.drawText("SCORE", this._scoreTX, margin + 22, {
			font: labelFont,
			color: labelColor,
			align: "left",
			alpha: 0.65,
			scale,
		});
		renderer.drawText(String(this.score), this._scoreTX, margin + 44, {
			font: valueFont,
			color: valueColor,
			align: "left",
			glowBlur: valueGlowBlur,
			scale,
		});
		renderer.drawText(
			`BEST ${this.bestScore}`,
			this._scoreTX,
			margin + 62,
			{
				font: bestFont,
				color: labelColor,
				align: "left",
				alpha: 0.6,
				scale,
			},
		);
		if (comboMultiplier > 1) {
			renderer.drawText(
				`COMBO ×${comboMultiplier}`,
				this._scoreTX,
				margin + combo.offsetY,
				{
					font: combo.font,
					color: combo.color,
					align: "left",
					scale,
				},
			);
		}

		// Gold panel (right)
		renderer.drawText("GOLD", this._goldTX, margin + 22, {
			font: labelFont,
			color: labelColor,
			align: "right",
			alpha: 0.65,
			scale,
		});
		renderer.drawText(String(this.gold), this._goldTX, margin + 44, {
			font: valueFont,
			color: valueColor,
			align: "right",
			glowBlur: valueGlowBlur,
			scale,
		});
		// Total Shop upgrade progress across all 5 parts, e.g. "UPGRADES 7/50"
		// — same "BEST" sub-line treatment the score panel uses opposite it, so
		// the two panels read as visual peers (see SCORE_BOX/GOLD_BOX in
		// TutorialScene.js, sized to match for the same reason).
		renderer.drawText(
			`SHOP ${this._upgradeSummary.current}/${this._upgradeSummary.max}`,
			this._goldTX,
			margin + 62,
			{
				font: bestFont,
				color: labelColor,
				align: "right",
				alpha: 0.6,
				scale,
			},
		);

		this._renderHealthBar(renderer, health, maxHealth);
		if (fireBoostTimer > 0)
			this._renderFireBoostIndicator(renderer, fireBoostTimer);
		if (invincibleTimer > 0)
			this._renderInvincibleIndicator(renderer, invincibleTimer);
	}

	// ---------------------------------------------------------------------------

	/**
	 * Player health bar. Below `Config.player.lowHealth.threshold` the fill
	 * switches to the same warning red/pulse Player.js's own hull uses —
	 * see that config's own doc for why the two are meant to read as one cue
	 * — and a pulsing "!" appears beside the bar (same glowing-glyph
	 * language as SniperEnemy's own warning marker). The icon stays up for
	 * as long as the danger persists; only the danger *sound* is capped
	 * (see Player.js's `_updateLowHealthWarning`).
	 */
	_renderHealthBar(renderer, health, maxHealth) {
		const cfg = Config.hud.health;
		const { lowHealth } = Config.player;
		const clamped = Math.max(0, Math.min(maxHealth, health));
		const frac = clamped / maxHealth;
		const low = clamped <= lowHealth.threshold;

		// Graduated warning: full `cfg.color` above the caution threshold,
		// ramping toward `lowHealth.color` as health drops through it, reaching
		// pure red exactly at `lowHealth.threshold` (where the pulse below also
		// kicks in) — a smooth ramp instead of a sudden binary color flip, since
		// health is the single most important stat on screen.
		const cautionThreshold = maxHealth * cfg.cautionThresholdRatio;
		const dangerHex = dangerColor(lowHealth.color);
		let color;
		if (low) {
			color = dangerHex;
		} else if (clamped < cautionThreshold) {
			const t =
				1 -
				(clamped - lowHealth.threshold) /
					(cautionThreshold - lowHealth.threshold);
			color = lerpHexColor(cfg.color, dangerHex, t);
		} else {
			color = cfg.color;
		}

		const alpha = low
			? 1 -
				lowHealth.pulseDepth *
					(0.5 + 0.5 * Math.sin(this._age * lowHealth.pulseSpeed))
			: 1;

		renderer.fillStrokePaths(this._healthTrackPathArr, {
			fillColor: cfg.trackColor,
			strokeColor: cfg.trackColor,
			lineWidth: 1,
		});

		if (frac > 0) {
			const right = this._healthLeft + cfg.width * frac;
			const pts = this._healthFillPath.points;
			pts[1][0] = right;
			pts[2][0] = right;
			renderer.fillStrokePaths(this._healthFillPathArr, {
				fillColor: color,
				strokeColor: color,
				lineWidth: 1,
				alpha,
			});
		}

		// Tracks the same graduated color as the bar (rather than a flat dim
		// gray) and stays near-opaque — this is the actual "N / max" numeric
		// readout, not a secondary caption, so it should read with real weight.
		renderer.drawText(
			`${Math.ceil(clamped)} / ${maxHealth}`,
			cfg.x,
			this._healthLabelY,
			{
				font: cfg.labelFont,
				color,
				alpha: low ? alpha : 0.9,
				scale: textSizeScale(),
			},
		);

		if (low) {
			renderer.drawText("!", this._healthIconX, this._healthIconY, {
				font: cfg.iconFont,
				color,
				glowBlur: cfg.iconGlowBlur,
				glowColor: color,
				alpha,
			});
		}
	}

	/**
	 * Right-middle badge shown only while a fireBoost PowerUp is running —
	 * the same circle-backdrop + lightning-bolt icon language PowerUps.js
	 * itself draws for the pickup, so this reads as "that thing is still
	 * active," plus a "BOOST +25%" label (the actual bullet-damage/fire-rate
	 * multiplier, not just "something is boosted" — see
	 * Config.powerUps.fireBoost.multiplier, applied to both stats equally)
	 * and a whole-seconds countdown.
	 */
	_renderFireBoostIndicator(renderer, timer) {
		const cfg = Config.hud.fireBoost;
		const pCfg = Config.powerUps.fireBoost;
		const { x, y, radius, lineWidth, glowBlur, labelFont, valueFont } = cfg;
		const percent = Math.round((pCfg.multiplier - 1) * 100);

		renderer.fillEllipse(0, 0, radius, radius, {
			x,
			y,
			fillColor: pCfg.fillColor,
		});
		renderer.strokeCircle(x, y, radius, {
			color: pCfg.color,
			lineWidth,
			glowBlur,
		});
		renderer.strokePaths(this._boltPath, {
			x,
			y,
			color: pCfg.color,
			lineWidth,
			lineCap: "round",
		});

		renderer.drawText(`BOOST +${percent}%`, x, y - radius - 12, {
			font: labelFont,
			color: pCfg.color,
			alpha: 0.7,
		});
		renderer.drawText(`${Math.ceil(timer)}s`, x, y + radius + 16, {
			font: valueFont,
			color: pCfg.color,
			glowBlur: 4,
		});
	}

	/**
	 * Left-middle badge shown only while an 'invincible' PowerUp is running —
	 * mirrors `_renderFireBoostIndicator`'s shape exactly, reusing the same
	 * hexagon-ring icon language PowerUps.js and Player's own shield-bubble
	 * draw for this pickup, plus an "INVULN" label and a whole-seconds
	 * countdown. Named "INVULN" rather than "SHIELD" so it can't be confused
	 * with Barrier's own permanent SHIELD (health) readout at top-center.
	 */
	_renderInvincibleIndicator(renderer, timer) {
		const cfg = Config.hud.invincible;
		const pCfg = Config.powerUps.invincible;
		const { x, y, radius, lineWidth, glowBlur, labelFont, valueFont } = cfg;

		renderer.fillEllipse(0, 0, radius, radius, {
			x,
			y,
			fillColor: pCfg.fillColor,
		});
		renderer.strokeCircle(x, y, radius, {
			color: pCfg.color,
			lineWidth,
			glowBlur,
		});
		renderer.strokePaths(this._hexIconPathArr, {
			x,
			y,
			color: pCfg.color,
			lineWidth,
		});

		renderer.drawText("INVULN", x, y - radius - 12, {
			font: labelFont,
			color: pCfg.color,
			alpha: 0.7,
		});
		renderer.drawText(`${Math.ceil(timer)}s`, x, y + radius + 16, {
			font: valueFont,
			color: pCfg.color,
			glowBlur: 4,
		});
	}

	_initGeometry() {
		const { margin, bracketSize: leg, health: hCfg } = Config.hud;
		const { width: vW } = Config.virtual;
		const rx = vW - margin; // right-side x anchor

		// Both L-brackets in one array — shared strokePaths call halves chrome shadow passes.
		this._allBrackets = [
			cornerBracketPath(margin, margin, 1, 1, leg),
			cornerBracketPath(rx, margin, -1, 1, leg),
		];

		// Text x anchors — inset a few virtual px from each bracket edge
		this._scoreTX = margin + 8;
		this._goldTX = vW - margin - 8;

		// Health bar — pre-allocated track (fixed) + fill (right edge mutated
		// each frame by _renderHealthBar) rects, zero per-frame allocation.
		this._healthLeft = hCfg.x - hCfg.width / 2;
		const top = hCfg.y;
		const bottom = hCfg.y + hCfg.height;
		const right = this._healthLeft + hCfg.width;
		this._healthTrackPath = {
			points: [
				[this._healthLeft, top],
				[right, top],
				[right, bottom],
				[this._healthLeft, bottom],
			],
			closed: true,
		};
		this._healthFillPath = {
			points: [
				[this._healthLeft, top],
				[this._healthLeft, top],
				[this._healthLeft, bottom],
				[this._healthLeft, bottom],
			],
			closed: true,
		};
		// Wrapper arrays reused every frame by _renderHealthBar instead of
		// allocating a fresh single-element array each call.
		this._healthTrackPathArr = [this._healthTrackPath];
		this._healthFillPathArr = [this._healthFillPath];
		this._healthLabelY = bottom + 12;

		// Low-health warning icon — sits just left of the bar, vertically centered on it.
		this._healthIconX = this._healthLeft - hCfg.iconOffsetX;
		this._healthIconY = (top + bottom) / 2;

		// Fire-boost badge's lightning-bolt icon — local-space points centered
		// on the origin, same zigzag shape PowerUps.js draws on the pickup
		// itself (see that file's own `_boltPath`), repositioned onto the badge
		// via strokePaths' {x, y} transform at render time.
		const d = Config.hud.fireBoost.radius * 0.5;
		this._boltPath = [
			{
				points: [
					[-d * 0.3, -d],
					[d * 0.35, -d * 0.1],
					[-d * 0.1, d * 0.15],
					[d * 0.3, d],
				],
				closed: false,
			},
		];

		// Invincibility badge's hexagon-ring icon — same shape/scale ratio as
		// PowerUps.js's own `_hexPath` for the pickup, just sized off this
		// badge's own radius instead of Config.powerUps.radius.
		const hexD = Config.hud.invincible.radius * 0.45;
		const hexPts = [];
		for (let i = 0; i < 6; i++) {
			const a = (Math.PI / 3) * i - Math.PI / 2;
			hexPts.push([Math.cos(a) * hexD, Math.sin(a) * hexD]);
		}
		this._hexIconPath = { points: hexPts, closed: true };
		// Wrapper array reused every frame by _renderInvincibleIndicator.
		this._hexIconPathArr = [this._hexIconPath];
	}
}
