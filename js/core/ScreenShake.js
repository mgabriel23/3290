/**
 * ScreenShake.js
 * A small "trauma" accumulator for camera shake (a simplified version of
 * Squirrel Eiserloh's classic GDC technique): each impact adds trauma
 * (0..1, clamped) rather than setting an absolute shake amount, so several
 * hits in quick succession stack into a stronger shake instead of each one
 * just resetting the last. Trauma decays linearly over time; the actual
 * offset read each frame is trauma SQUARED, so the shake snaps hard right
 * after an impact and tails off quickly rather than swaying evenly down to
 * zero. Gameplay-agnostic — GameplayScene owns the instance and decides
 * what counts as an impact.
 */
import { Config } from './Config.js';
import { prefersReducedMotion } from './Settings.js';

export class ScreenShake {
  constructor() {
    this._trauma = 0;
    // See Settings.prefersReducedMotion's own doc — scales offset down
    // rather than zeroing it, so a hit still reads as a hit.
    this._motionScale = prefersReducedMotion() ? Config.screenShake.reducedMotionScale : 1;
    // Reused every frame by getOffset() (called exactly once/frame, read
    // immediately — see that method's own doc) instead of allocating a new
    // {x, y} object each call.
    this._offset = { x: 0, y: 0 };
  }

  /** @param {number} amount 0..1 — added to current trauma, clamped at 1 */
  trigger(amount) {
    this._trauma = Math.min(1, this._trauma + amount);
  }

  /** @param {number} dt */
  update(dt) {
    if (this._trauma <= 0) return;
    this._trauma = Math.max(0, this._trauma - Config.screenShake.decayPerSecond * dt);
  }

  /**
   * This frame's camera offset, in virtual px — freshly randomized every
   * call, so read it once per frame rather than caching it.
   * @returns {{x: number, y: number}}
   */
  getOffset() {
    if (this._trauma <= 0) {
      this._offset.x = 0;
      this._offset.y = 0;
      return this._offset;
    }
    const power = this._trauma * this._trauma;
    const maxOffset = Config.screenShake.maxOffset * this._motionScale;
    this._offset.x = (Math.random() * 2 - 1) * maxOffset * power;
    this._offset.y = (Math.random() * 2 - 1) * maxOffset * power;
    return this._offset;
  }
}
