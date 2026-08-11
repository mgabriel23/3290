/**
 * AudioFader.js
 * A generic 0-1 value ramp, advanced by explicit per-frame `update(dt)`
 * calls rather than any browser timer or CSS-style transition — used to
 * fade background-music `<audio>` elements in/out smoothly instead of
 * snapping their volume straight to full or to silence (see Game.js's
 * prologue/gameplay theme tracks). Deliberately NOT coupled to the Audio
 * element itself or its `.volume` — the caller multiplies this ramp's
 * `value` together with whatever OTHER independent 0-1 factors also want a
 * say (e.g. GameplayScene's per-level ducking), rather than the two
 * fighting to be the last writer of `.volume` each frame.
 */
export class AudioFader {
  constructor() {
    this.value = 0; // current ramp position, 0-1
    this._from = 0;
    this._to = 0;
    this._duration = 0.001;
    this._age = 0;
    this._active = false;
    this._onComplete = null;
  }

  /**
   * Start ramping `value` from wherever it currently sits toward `target`
   * (0 or 1) over `duration` seconds. Re-targeting mid-ramp (e.g. a fade-in
   * interrupted by a fade-out) just starts a fresh ramp from the current
   * value — no snapping, no queuing.
   * @param {number} target
   * @param {number} duration seconds
   * @param {(() => void)|null} [onComplete] fires once, the instant this
   *   ramp finishes — e.g. Game.js uses it to actually `.pause()` the
   *   underlying Audio element once a fade-out reaches silence, rather than
   *   leaving it playing inaudibly forever.
   */
  rampTo(target, duration, onComplete = null) {
    this._from = this.value;
    this._to = target;
    this._duration = Math.max(duration, 0.001); // avoid a divide-by-zero for a ~0-duration ramp
    this._age = 0;
    this._active = true;
    this._onComplete = onComplete;
  }

  /**
   * Advance the active ramp (if any) by `dt` seconds. Safe to call every
   * frame regardless of whether a ramp is currently active. Always returns
   * the current value.
   * @param {number} dt seconds
   * @returns {number}
   */
  update(dt) {
    if (this._active) {
      this._age += dt;
      const t = Math.min(this._age / this._duration, 1);
      this.value = this._from + (this._to - this._from) * t;
      if (t >= 1) {
        this._active = false;
        this._onComplete?.();
      }
    }
    return this.value;
  }
}
