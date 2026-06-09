/**
 * Barrier.js
 * The planetary shield — a wide shallow dome spanning the full screen width
 * along the bottom edge. In gameplay it represents the structure the player
 * must protect; enemies that reach it deal damage to it instead of (or in
 * addition to) the player.
 *
 * Visual design: a neon-outline arc (same wireframe language as the player
 * ship and title screen chrome) with a dimmer inner echo arc for shield-body
 * depth, five upward structural struts, a small diamond emblem at the peak,
 * and short anchor posts at both edges. All secondary elements share one
 * strokePaths call so the whole barrier costs just two shadow-blur passes
 * per frame regardless of strut count.
 *
 * All geometry is computed once from Config in the constructor — `render`
 * produces zero per-frame allocations.
 */
import { Config } from '../core/Config.js';

export class Barrier {
  constructor() {
    this.health = 100; // 0–100; written by gameplay systems, read by this render method
    this._initGeometry();
  }

  render(renderer) {
    const { color, lineWidth, glowBlur } = Config.barrier;
    // Main arc — full brightness, full lineWidth
    renderer.strokePaths(this._mainPaths, { color, lineWidth, glowBlur });
    // Details — inner echo, struts, emblem, anchors — all at the same dimmer style
    renderer.strokePaths(this._detailPaths, {
      color, lineWidth: 1, glowBlur: glowBlur * 0.5, alpha: 0.45,
    });
    this._renderHealth(renderer);
  }

  _renderHealth(renderer) {
    const { baseY, arcHeight, healthLabelFont, healthValueFont, healthColor, healthGlowBlur } =
      Config.barrier;
    const { width: vW } = Config.virtual;
    const peakY = baseY - arcHeight; // y of the arc's topmost point
    renderer.drawText('SHIELD', vW / 2, peakY + 26, {
      font: healthLabelFont, color: healthColor, alpha: 0.5,
    });
    renderer.drawText(String(this.health), vW / 2, peakY + 52, {
      font: healthValueFont, color: healthColor, glowBlur: healthGlowBlur,
    });
  }

  // ---------------------------------------------------------------------------

  _initGeometry() {
    const { baseY, arcHeight, arcSegments, innerInset, strutCount, strutDepth } = Config.barrier;
    const { width: vW, height: vH } = Config.virtual;
    const cx = vW / 2;

    // Main arc
    this._mainPaths = [{ points: this._buildArc(baseY, arcHeight, arcSegments), closed: false }];

    this._detailPaths = [];

    // Inner echo arc — shallower by `innerInset` virtual px, creating a tapered shield band
    this._detailPaths.push({
      points: this._buildArc(baseY, arcHeight - innerInset, arcSegments),
      closed: false,
    });

    // Upward structural struts evenly spaced along the arc
    const step = vW / (strutCount + 1);
    for (let i = 1; i <= strutCount; i++) {
      const x = step * i;
      const y = this._arcY(x, baseY, arcHeight);
      this._detailPaths.push({ points: [[x, y], [x, y - strutDepth]], closed: false });
    }

    // Diamond emblem at the peak
    const peakY = baseY - arcHeight;
    const d = 6;
    this._detailPaths.push({
      points: [[cx, peakY - d], [cx + d, peakY], [cx, peakY + d], [cx - d, peakY]],
    });

    // Anchor posts at left and right endpoints, going down to screen bottom
    this._detailPaths.push({ points: [[0,   baseY], [0,   vH]], closed: false });
    this._detailPaths.push({ points: [[vW, baseY], [vW, vH]], closed: false });
  }

  /**
   * Build a circular arc spanning the full virtual width at the given
   * `baseY`, rising `height` virtual px at the center.
   * Uses the chord/sagitta formula: R = (halfW² + h²) / (2h).
   */
  _buildArc(baseY, height, segments) {
    const { width: vW } = Config.virtual;
    const halfW = vW / 2;
    const R  = (halfW * halfW + height * height) / (2 * height);
    const cy = baseY - height + R; // circle center (below screen)
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const x  = (i / segments) * vW;
      const dx = x - halfW;
      points.push([x, cy - Math.sqrt(R * R - dx * dx)]);
    }
    return points;
  }

  /** Y coordinate on the arc at a given x — used to place strut bases. */
  _arcY(x, baseY, height) {
    const { width: vW } = Config.virtual;
    const halfW = vW / 2;
    const R  = (halfW * halfW + height * height) / (2 * height);
    const cy = baseY - height + R;
    const dx = x - halfW;
    return cy - Math.sqrt(R * R - dx * dx);
  }
}
