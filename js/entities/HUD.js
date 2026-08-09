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
 * Health is different: it's owned by Player (mirrors `Barrier.health`'s
 * convention), not by HUD, so `render(renderer, health)` takes the current
 * value as a parameter instead — the same pattern `Barrier.render` already
 * uses for `power`. Its low-health color/pulse reads `Config.player.
 * lowHealth` directly, so the bar and the ship's own hull pulse read as
 * one consistent warning cue. Needs `update(dt)` purely to drive that
 * pulse's clock (`_age`) — the score/gold panels have no such need.
 *
 * All bracket/bar geometry is pre-allocated once in the constructor so
 * `render` produces zero per-frame allocations regardless of update rate.
 */
import { Config } from '../core/Config.js';
import { cornerBracketPath } from '../core/shapes.js';
import { loadNumber, saveNumber } from '../core/Storage.js';

export class HUD {
  constructor() {
    this._score = 0;
    this.bestScore = loadNumber('bestScore', 0);
    this._gold = loadNumber('gold', 0);
    this._age = 0; // seconds — drives the health bar's low-health pulse only
    this._initGeometry();
  }

  /** Advance the health bar's low-health pulse clock. */
  update(dt) {
    this._age += dt;
  }

  /** Current run's score — starts at 0 each session. */
  get score() { return this._score; }
  set score(value) {
    this._score = value;
    if (this._score > this.bestScore) {
      this.bestScore = this._score;
      saveNumber('bestScore', this.bestScore);
    }
  }

  /** Wallet total — persists forward across sessions, no "best" concept. */
  get gold() { return this._gold; }
  set gold(value) {
    this._gold = value;
    saveNumber('gold', this._gold);
  }

  /**
   * Draw the score/gold panels and the health bar over whatever was
   * rendered before this call.
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {number} health  the player's current health — see class doc
   */
  render(renderer, health) {
    const {
      margin, labelFont, labelColor, valueFont, valueColor, valueGlowBlur, bestFont,
      chromeColor, chromeLineWidth, chromeGlowBlur,
    } = Config.hud;

    // Both brackets in one strokePaths call → one shadow-blur GPU pass instead of two.
    renderer.strokePaths(this._allBrackets, {
      color: chromeColor, lineWidth: chromeLineWidth, glowBlur: chromeGlowBlur,
    });

    // Score panel (left)
    renderer.drawText('SCORE', this._scoreTX, margin + 22, {
      font: labelFont, color: labelColor, align: 'left', alpha: 0.65,
    });
    renderer.drawText(String(this.score), this._scoreTX, margin + 44, {
      font: valueFont, color: valueColor, align: 'left', glowBlur: valueGlowBlur,
    });
    renderer.drawText(`BEST ${this.bestScore}`, this._scoreTX, margin + 62, {
      font: bestFont, color: labelColor, align: 'left', alpha: 0.6,
    });

    // Gold panel (right)
    renderer.drawText('GOLD', this._goldTX, margin + 22, {
      font: labelFont, color: labelColor, align: 'right', alpha: 0.65,
    });
    renderer.drawText(String(this.gold), this._goldTX, margin + 44, {
      font: valueFont, color: valueColor, align: 'right', glowBlur: valueGlowBlur,
    });

    this._renderHealthBar(renderer, health);
  }

  // ---------------------------------------------------------------------------

  /**
   * Player health bar. Below `Config.player.lowHealth.threshold` the fill
   * switches to the same warning red/pulse Player.js's own hull uses —
   * see that config's own doc for why the two are meant to read as one cue.
   */
  _renderHealthBar(renderer, health) {
    const cfg = Config.hud.health;
    const { maxHealth, lowHealth } = Config.player;
    const clamped = Math.max(0, Math.min(maxHealth, health));
    const frac    = clamped / maxHealth;
    const low     = clamped <= lowHealth.threshold;
    const color   = low ? lowHealth.color : cfg.color;
    const alpha   = low
      ? 1 - lowHealth.pulseDepth * (0.5 + 0.5 * Math.sin(this._age * lowHealth.pulseSpeed))
      : 1;

    renderer.fillStrokePaths([this._healthTrackPath], {
      fillColor: cfg.trackColor, strokeColor: cfg.trackColor, lineWidth: 1,
    });

    if (frac > 0) {
      const right = this._healthLeft + cfg.width * frac;
      const pts   = this._healthFillPath.points;
      pts[1][0] = right;
      pts[2][0] = right;
      renderer.fillStrokePaths([this._healthFillPath], {
        fillColor: color, strokeColor: color, lineWidth: 1, alpha,
      });
    }

    renderer.drawText(`${Math.ceil(clamped)} / ${maxHealth}`, cfg.x, this._healthLabelY, {
      font: cfg.labelFont, color: cfg.labelColor, alpha: 0.75,
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
    this._goldTX  = vW - margin - 8;

    // Health bar — pre-allocated track (fixed) + fill (right edge mutated
    // each frame by _renderHealthBar) rects, zero per-frame allocation.
    this._healthLeft = hCfg.x - hCfg.width / 2;
    const top    = hCfg.y;
    const bottom = hCfg.y + hCfg.height;
    const right  = this._healthLeft + hCfg.width;
    this._healthTrackPath = { points: [[this._healthLeft, top], [right, top], [right, bottom], [this._healthLeft, bottom]], closed: true };
    this._healthFillPath  = { points: [[this._healthLeft, top], [this._healthLeft, top], [this._healthLeft, bottom], [this._healthLeft, bottom]], closed: true };
    this._healthLabelY = bottom + 12;
  }
}
