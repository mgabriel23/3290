/**
 * FloatingText.js
 * Small pool of transient "+N"-style text popups — currently only the gold
 * amount gained on a coin pickup (see GameplayScene's checkGoldPickup
 * handling) — that rise a short distance and fade out, giving an
 * otherwise-silent stat change (the HUD number just ticking up) a moment
 * of on-screen feedback right where it happened.
 *
 * Same pre-allocated-typed-array pooling shape as every other small pooled
 * effect in this codebase (Particles.js, PowerUps.js): swap-remove on cull
 * once `maxLife` elapses. No falling/physics like PowerUps/GoldPickups —
 * just a fixed rise-and-fade over a short, fixed lifetime.
 */
import { Config } from '../core/Config.js';

const MAX = Config.floatingText.poolSize;

export class FloatingText {
  constructor() {
    this._x     = new Float32Array(MAX);
    this._y     = new Float32Array(MAX);
    this._age   = new Float32Array(MAX);
    this._text  = new Array(MAX).fill('');
    this._color = new Array(MAX).fill('');
    this._count = 0;
  }

  /**
   * @param {number} x @param {number} y
   * @param {string} text
   * @param {string} color
   */
  spawn(x, y, text, color) {
    if (this._count >= MAX) return;
    const i = this._count++;
    this._x[i]     = x;
    this._y[i]     = y;
    this._age[i]   = 0;
    this._text[i]  = text;
    this._color[i] = color;
  }

  /** @param {number} dt */
  update(dt) {
    const { maxLife } = Config.floatingText;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      this._age[i] += dt;
      if (this._age[i] < maxLife) {
        if (w !== i) {
          this._x[w] = this._x[i]; this._y[w] = this._y[i]; this._age[w] = this._age[i];
          this._text[w] = this._text[i]; this._color[w] = this._color[i];
        }
        w++;
      }
    }
    this._count = w;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const { riseDistance, maxLife, fadeStart, font, glowBlur } = Config.floatingText;
    for (let i = 0; i < this._count; i++) {
      const t = this._age[i] / maxLife;
      const y = this._y[i] - riseDistance * t;
      const alpha = t < fadeStart ? 1 : Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart));
      renderer.drawText(this._text[i], this._x[i], y, {
        font, color: this._color[i], alpha, glowBlur,
      });
    }
  }
}
