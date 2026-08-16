/**
 * AchievementsPanel.js
 * A 🏆 button + full-screen paginated card browser, composed into
 * PrologueScene's 'title' beat only (see Config.achievements' own doc for
 * why — same reasoning as SettingsPanel). Same "one button toggles
 * open/closed" shape as EnemyCodex/SettingsPanel (🏆 ↔ ✕), same "dimmed
 * background is inert, arrows page through, any other tap while open is
 * swallowed" convention as EnemyCodex.
 *
 * One card per Achievements.js TRACK, each showing that track's title,
 * description, and a 3-pip tier-progress strip (unlocked/next/locked —
 * same corner-bracket-frame technique DailyRewardPanel's 7-day streak strip
 * uses, just 3 wide). Unlock state is never stored here — every render
 * re-derives it fresh from core/Stats.js via Achievements.getTrackProgress,
 * so this panel can never show stale progress.
 */
import { Config } from '../core/Config.js';
import { TRACKS, getTrackProgress, formatTrackValue, totalUnlockedTiers, totalTierCount } from '../core/Achievements.js';
import { getStats } from '../core/Stats.js';
import { cornerBracketPath } from '../core/shapes.js';
import { wrapText } from '../core/textLayout.js';

export class AchievementsPanel {
  constructor() {
    this._open = false;
    this._index = 0;
    this._age = 0; // seconds — drives the idle button pulse
    this._cardAge = 0; // seconds since the card last opened/paged — drives the content fade-in

    const { size, legSize } = Config.achievements.pip;
    const half = size / 2;
    this._pipFramePaths = [
      cornerBracketPath(-half, -half, 1, 1, legSize),
      cornerBracketPath(half, -half, -1, 1, legSize),
      cornerBracketPath(-half, half, 1, -1, legSize),
      cornerBracketPath(half, half, -1, -1, legSize),
    ];
    this._checkPath = { points: [[-half * 0.28, 0], [-half * 0.08, half * 0.24], [half * 0.32, -half * 0.32]], closed: false };
  }

  get isOpen() { return this._open; }

  update(dt) {
    this._age += dt;
    if (this._open) this._cardAge += dt;
  }

  /** @returns {boolean} true if (x, y) is inside the toggle button's circular hit area. */
  isInsideButton(x, y) {
    const { x: bx, y: by, radius } = Config.achievements.button;
    const dx = x - bx, dy = y - by;
    return dx * dx + dy * dy <= radius * radius;
  }

  /** Same routing shape as EnemyCodex.handleTap. */
  handleTap(x, y) {
    if (this.isInsideButton(x, y)) {
      this._open = !this._open;
      this._cardAge = 0;
      return;
    }
    if (!this._open) return;
    if (this._isInsideArrow(x, y, -1)) { this._page(-1); return; }
    if (this._isInsideArrow(x, y, 1)) { this._page(1); return; }
  }

  _page(direction) {
    this._index = (this._index + direction + TRACKS.length) % TRACKS.length;
    this._cardAge = 0;
  }

  _arrowX(direction) {
    const { arrowMarginX } = Config.achievements.overlay;
    const { width: vW } = Config.virtual;
    return direction < 0 ? arrowMarginX : vW - arrowMarginX;
  }

  _isInsideArrow(x, y, direction) {
    const { arrowY, arrowHalfSize } = Config.achievements.overlay;
    return Math.abs(x - this._arrowX(direction)) <= arrowHalfSize
        && Math.abs(y - arrowY) <= arrowHalfSize;
  }

  render(renderer) {
    if (this._open) this._renderOverlay(renderer);
    this._renderButton(renderer);
  }

  _renderButton(renderer) {
    const cfg = Config.achievements.button;
    const pulse = 1 - cfg.pulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.pulseSpeed));
    renderer.strokeCircle(cfg.x, cfg.y, cfg.radius, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color, alpha: pulse,
    });
    renderer.drawText(this._open ? '✕' : cfg.glyph, cfg.x, cfg.y, {
      font: cfg.font, color: cfg.color, alpha: pulse,
    });
  }

  _renderOverlay(renderer) {
    const cfg = Config.achievements.overlay;
    const { width: vW } = Config.virtual;
    const track = TRACKS[this._index];
    const stats = getStats();
    const progress = getTrackProgress(track, stats);
    const alpha = Math.min(this._cardAge / cfg.fadeInDuration, 1);

    // Fully opaque, not a translucent dim — this sits over the still-live,
    // still-animating title screen (not a frozen frame like codex/pause), so
    // a see-through veil let the menu bleed through. Same "separate full
    // screen" precedent as DailyRewardPanel's own opaque `clear`.
    renderer.clear(Config.colors.void);

    renderer.drawText('ACHIEVEMENTS', vW / 2, cfg.titleY, {
      font: cfg.titleFont, color: cfg.titleColor, alpha,
    });
    renderer.drawText(`${this._index + 1} / ${TRACKS.length}`, vW / 2, cfg.progressY, {
      font: cfg.progressFont, color: cfg.progressColor, alpha: alpha * 0.7,
    });
    renderer.drawText(`${totalUnlockedTiers(stats)} / ${totalTierCount()} TIERS UNLOCKED`, vW / 2, cfg.overallY, {
      font: cfg.overallFont, color: cfg.overallColor, alpha: alpha * 0.9,
    });

    renderer.drawText(track.title, vW / 2, cfg.trackTitleY, {
      font: cfg.trackTitleFont, color: track.color, glowBlur: cfg.trackTitleGlowBlur, glowColor: track.color, alpha,
    });

    const lines = wrapText(track.description, cfg.descMaxWidth, (s) => renderer.measureText(s, cfg.descFont));
    for (let i = 0; i < lines.length; i++) {
      renderer.drawText(lines[i], vW / 2, cfg.descY + i * cfg.descLineHeight, {
        font: cfg.descFont, color: cfg.descColor, alpha,
      });
    }

    this._renderPipStrip(renderer, track, progress, alpha);

    this._renderArrow(renderer, -1, alpha);
    this._renderArrow(renderer, 1, alpha);

    renderer.drawText(cfg.footerText, vW / 2, cfg.footerY, {
      font: cfg.footerFont, color: cfg.footerColor, alpha: alpha * 0.6,
    });
  }

  /**
   * The 3-pip tier strip: each pip is unlocked (reached), current (the next
   * one to reach — pulses, shows live progress inside the value line below),
   * or locked (further out). Below the strip: the live "current / next
   * threshold" progress line, then a dim reference line listing all 3
   * thresholds so the player can see the whole ladder at a glance.
   */
  _renderPipStrip(renderer, track, progress, alpha) {
    const cfg = Config.achievements.pip;
    const { width: vW } = Config.virtual;
    const { tier, maxTier } = progress;
    const totalW = maxTier * cfg.size + (maxTier - 1) * cfg.gap;
    const startX = vW / 2 - totalW / 2 + cfg.size / 2;

    for (let i = 0; i < maxTier; i++) {
      const cx = startX + i * (cfg.size + cfg.gap);
      const state = i < tier ? 'unlocked' : i === tier ? 'current' : 'locked';

      let color = cfg.lockedColor;
      let pipAlpha = alpha;
      let glowBlur = 0;
      if (state === 'unlocked') {
        color = cfg.unlockedColor;
      } else if (state === 'current') {
        color = cfg.currentColor;
        glowBlur = 6;
        const pulse = 1 - cfg.currentPulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.currentPulseSpeed));
        pipAlpha = alpha * pulse;
      } else {
        pipAlpha = alpha * 0.6;
      }

      renderer.strokePaths(this._pipFramePaths, {
        x: cx, y: cfg.y, color, lineWidth: cfg.lineWidth, glowBlur, glowColor: color, alpha: pipAlpha,
      });

      if (state === 'unlocked') {
        renderer.strokePaths([this._checkPath], {
          x: cx, y: cfg.y, color, lineWidth: cfg.checkLineWidth, alpha: pipAlpha, lineCap: 'round',
        });
      } else {
        renderer.drawText(Config.achievements.tierLabels[i], cx, cfg.y, {
          font: cfg.labelFont, color, alpha: pipAlpha,
        });
      }
    }

    const valueText = tier >= maxTier
      ? 'ALL TIERS UNLOCKED'
      : `${formatTrackValue(track, progress.value)} / ${formatTrackValue(track, track.thresholds[tier])}`;
    renderer.drawText(valueText, vW / 2, cfg.valueY, {
      font: cfg.valueFont, color: tier >= maxTier ? cfg.unlockedColor : cfg.currentColor, alpha,
    });

    const thresholdsText = track.thresholds.map((t) => formatTrackValue(track, t)).join(' · ');
    renderer.drawText(thresholdsText, vW / 2, cfg.thresholdsY, {
      font: cfg.thresholdsFont, color: cfg.thresholdsColor, alpha: alpha * 0.8,
    });
  }

  /** Same arrow shape as EnemyCodex._renderArrow. */
  _renderArrow(renderer, direction, alpha) {
    const cfg = Config.achievements.overlay;
    const half = 10;
    const points = direction < 0
      ? [[half, -half], [-half, 0], [half, half]]
      : [[-half, -half], [half, 0], [-half, half]];
    renderer.strokePaths([{ points, closed: false }], {
      x: this._arrowX(direction), y: cfg.arrowY,
      color: cfg.arrowColor, lineWidth: 3, glowBlur: cfg.arrowGlowBlur, glowColor: cfg.arrowColor, alpha,
    });
  }
}
