/**
 * ComboBanner.js
 * A large, hard-to-miss "hype" popup fired once per combo-streak tier-up
 * (see GameplayScene._checkCollisions and Config.combo) — the loud
 * counterpart to the small always-on "COMBO ×N" HUD readout (HUD.js /
 * Config.hud.combo), which is easy to lose track of mid-fight. Single-
 * instance, not pooled: only one tier-up can reasonably be in flight at a
 * time, and a new `trigger()` simply restarts the animation from the top
 * rather than queuing a second one behind it.
 *
 * Same three-phase shape as GameplayScene._renderLevelIntro (in → unstable
 * hold → out), but punchier and shorter: the pop-in uses `easeOutBack`
 * (core/animation.js) for a bounce rather than a clean linear rise, since
 * this is a celebration cue, not a threat announcement.
 */
import { Config } from '../core/Config.js';
import { easeOutBack, flickerAlpha } from '../core/animation.js';

export class ComboBanner {
  constructor() {
    this._age = -1; // -1 = inactive; update()/render() no-op
    this._label = '';
    this._multiplier = 1;
  }

  /**
   * @param {number} tierIndex  1-based tier just reached — indexes
   *   Config.combo.banner.labels (clamped to the array's last entry)
   * @param {number} multiplier  the resulting score multiplier, shown on the sub-line
   */
  trigger(tierIndex, multiplier) {
    const { labels } = Config.combo.banner;
    this._label = labels[Math.min(tierIndex, labels.length) - 1];
    this._multiplier = multiplier;
    this._age = 0;
  }

  /** Whether the banner is currently on screen — read by AchievementToast so it can make room for itself when both fire close together. */
  isActive() {
    return this._age >= 0;
  }

  /** @param {number} dt */
  update(dt) {
    if (this._age < 0) return;
    const { popDuration, holdDuration, fadeOutDuration } = Config.combo.banner;
    this._age += dt;
    if (this._age >= popDuration + holdDuration + fadeOutDuration) this._age = -1;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._age < 0) return;
    const {
      posY, font, subFont, color, glowBlur, subOffsetY,
      popDuration, popOvershoot, holdDuration, fadeOutDuration,
      flickerFreqs, flickerPhases, flickerBase, flickerDepth,
    } = Config.combo.banner;
    const { width: vW } = Config.virtual;
    const t = this._age;
    const holdEnd = popDuration + holdDuration;

    let scale, alpha;
    if (t < popDuration) {
      scale = easeOutBack(t / popDuration, popOvershoot);
      alpha = Math.min(1, t / (popDuration * 0.4)); // reach full opacity well before the bounce settles
    } else if (t < holdEnd) {
      scale = 1;
      alpha = flickerAlpha(t, flickerFreqs, flickerPhases, flickerBase, flickerDepth);
    } else {
      scale = 1;
      alpha = Math.max(0, 1 - (t - holdEnd) / fadeOutDuration);
    }
    if (alpha <= 0.02) return;

    renderer.drawText(this._label, vW / 2, posY, {
      font, color, alpha, glowBlur, scale,
    });
    renderer.drawText(`×${this._multiplier} COMBO`, vW / 2, posY + subOffsetY, {
      font: subFont, color, alpha: alpha * 0.85, glowBlur: glowBlur * 0.5, scale,
    });
  }
}
