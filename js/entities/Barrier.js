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
    this._pulseX = 0;
    this._pulseT = -1; // -1 = no ripple in progress
    this._initGeometry();
  }

  /**
   * Y coordinate of the main arc's surface at horizontal position `x` —
   * used by BouncerEnemy to detect when it has landed on the barrier.
   */
  surfaceY(x) {
    const { baseY, arcHeight } = Config.barrier;
    return this._arcY(x, baseY, arcHeight);
  }

  /** Apply damage from a bounce/impact, clamped at 0. */
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  /** Trigger a spring-ripple deformation centered on horizontal position `x`. */
  pulse(x) {
    this._pulseX = x;
    this._pulseT = 0;
  }

  /** @param {number} dt */
  update(dt) {
    if (this._pulseT < 0) return;
    this._pulseT += dt;
    if (this._pulseT >= Config.barrier.pulse.duration) this._pulseT = -1;
  }

  /** @param {number} [power]  player bullet damage — shown inside the dome's left side when given */
  render(renderer, power) {
    const { color, lineWidth, glowBlur } = Config.barrier;
    this._applyPulse();
    // Main arc — full brightness, full lineWidth
    renderer.strokePaths(this._mainPaths, { color, lineWidth, glowBlur });
    // Details — inner echo, struts, emblem, anchors — all at the same dimmer style
    renderer.strokePaths(this._detailPaths, {
      color, lineWidth: 1, glowBlur: glowBlur * 0.5, alpha: 0.45,
    });
    this._renderHealth(renderer);
    if (power !== undefined) this._renderPower(renderer, power);
  }

  /**
   * Re-derive the main arc and inner echo arc points from their static base
   * shapes, offsetting each point's y by a damped-spring ripple centered on
   * `_pulseX`. A no-op (cheap copy) once the ripple has settled.
   */
  _applyPulse() {
    const mainPts  = this._mainPaths[0].points;
    const innerPts = this._detailPaths[0].points;
    for (let i = 0; i < mainPts.length; i++) {
      const offset = this._pulseT < 0 ? 0 : this._deformAt(this._baseMainPoints[i][0]);
      mainPts[i][1]  = this._baseMainPoints[i][1]  + offset;
      innerPts[i][1] = this._baseInnerPoints[i][1] + offset;
    }
  }

  /** Damped-spring vertical offset at horizontal position `x`, given the active pulse. */
  _deformAt(x) {
    const { amplitude, width, frequency, damping } = Config.barrier.pulse;
    const dx      = x - this._pulseX;
    const spatial = Math.exp(-(dx * dx) / (2 * width * width));
    const temporal = Math.exp(-damping * this._pulseT) * Math.cos(frequency * this._pulseT);
    return amplitude * spatial * temporal;
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

  /** Player bullet damage readout, mirroring _renderHealth's layout but offset toward the dome's left side. */
  _renderPower(renderer, power) {
    const { baseY, arcHeight, healthLabelFont, healthValueFont, powerColor, healthGlowBlur, powerXRatio } =
      Config.barrier;
    const { width: vW } = Config.virtual;
    const peakY = baseY - arcHeight;
    const x = vW * powerXRatio;
    renderer.drawText('PWR', x, peakY + 26, {
      font: healthLabelFont, color: powerColor, alpha: 0.5,
    });
    renderer.drawText(power.toFixed(2), x, peakY + 52, {
      font: healthValueFont, color: powerColor, glowBlur: healthGlowBlur,
    });
  }

  // ---------------------------------------------------------------------------

  _initGeometry() {
    const { baseY, arcHeight, arcSegments, innerInset, strutCount, strutDepth } = Config.barrier;
    const { width: vW, height: vH } = Config.virtual;
    const cx = vW / 2;

    // Main arc
    this._mainPaths = [{ points: this._buildArc(baseY, arcHeight, arcSegments), closed: false }];
    // Undeformed copies — _applyPulse derives the live points from these each frame.
    this._baseMainPoints = this._mainPaths[0].points.map((p) => p.slice());

    this._detailPaths = [];

    // Inner echo arc — shallower by `innerInset` virtual px, creating a tapered shield band
    this._detailPaths.push({
      points: this._buildArc(baseY, arcHeight - innerInset, arcSegments),
      closed: false,
    });
    this._baseInnerPoints = this._detailPaths[0].points.map((p) => p.slice());

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
