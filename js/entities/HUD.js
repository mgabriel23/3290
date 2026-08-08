/**
 * HUD.js
 * Gameplay heads-up display: a score panel (top-left) and a gold panel
 * (top-right) rendered over the gameplay scene every frame.
 *
 * Each panel is a single L-bracket corner accent, a dim label, and a
 * brighter neon value — the same sci-fi design language as the title
 * screen's chrome and button. Score and gold are plain public fields
 * that the scene (and later gameplay systems) write to directly; the HUD
 * is opinion-free about where the numbers come from, it just draws them.
 *
 * All bracket geometry is pre-allocated once in the constructor so
 * `render` produces zero per-frame allocations regardless of update rate.
 */
import { Config } from '../core/Config.js';
import { cornerBracketPath } from '../core/shapes.js';

export class HUD {
  constructor() {
    this.score = 10000;
    this.gold  = 10000;
    this._initGeometry();
  }

  /** Draw both panels over whatever was rendered before this call. */
  render(renderer) {
    const {
      margin, labelFont, labelColor, valueFont, valueColor, valueGlowBlur,
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

    // Gold panel (right)
    renderer.drawText('GOLD', this._goldTX, margin + 22, {
      font: labelFont, color: labelColor, align: 'right', alpha: 0.65,
    });
    renderer.drawText(String(this.gold), this._goldTX, margin + 44, {
      font: valueFont, color: valueColor, align: 'right', glowBlur: valueGlowBlur,
    });
  }

  // ---------------------------------------------------------------------------

  _initGeometry() {
    const { margin, bracketSize: leg } = Config.hud;
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
  }
}
