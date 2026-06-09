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

export class HUD {
  constructor() {
    this.score = 10000;
    this.gold  = 0;
    this._initGeometry();
  }

  /** Draw both panels over whatever was rendered before this call. */
  render(renderer) {
    this._renderScorePanel(renderer);
    this._renderGoldPanel(renderer);
  }

  // ---------------------------------------------------------------------------

  _initGeometry() {
    const { margin, bracketSize: leg } = Config.hud;
    const { width: vW } = Config.virtual;
    const rx = vW - margin; // right-side x anchor

    // One L-bracket per panel, baked in world space
    this._scoreBracket = [
      { points: [[margin + leg, margin], [margin, margin], [margin, margin + leg]], closed: false },
    ];
    this._goldBracket = [
      { points: [[rx - leg, margin], [rx, margin], [rx, margin + leg]], closed: false },
    ];

    // Text x anchors — inset a few virtual px from the bracket edge
    this._scoreTX = margin + 8;
    this._goldTX  = vW - margin - 8;
  }

  _renderScorePanel(renderer) {
    const {
      margin, labelFont, labelColor, valueFont, valueColor, valueGlowBlur,
      chromeColor, chromeLineWidth, chromeGlowBlur,
    } = Config.hud;

    renderer.strokePaths(this._scoreBracket, {
      color: chromeColor, lineWidth: chromeLineWidth, glowBlur: chromeGlowBlur,
    });
    renderer.drawText('SCORE', this._scoreTX, margin + 22, {
      font: labelFont, color: labelColor, align: 'left', alpha: 0.65,
    });
    renderer.drawText(String(this.score), this._scoreTX, margin + 44, {
      font: valueFont, color: valueColor, align: 'left', glowBlur: valueGlowBlur,
    });
  }

  _renderGoldPanel(renderer) {
    const {
      margin, labelFont, labelColor, valueFont, valueColor, valueGlowBlur,
      chromeColor, chromeLineWidth, chromeGlowBlur,
    } = Config.hud;

    renderer.strokePaths(this._goldBracket, {
      color: chromeColor, lineWidth: chromeLineWidth, glowBlur: chromeGlowBlur,
    });
    renderer.drawText('GOLD', this._goldTX, margin + 22, {
      font: labelFont, color: labelColor, align: 'right', alpha: 0.65,
    });
    renderer.drawText(String(this.gold), this._goldTX, margin + 44, {
      font: valueFont, color: valueColor, align: 'right', glowBlur: valueGlowBlur,
    });
  }
}
