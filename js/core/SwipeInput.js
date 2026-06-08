/**
 * SwipeInput.js
 * Minimal upward-swipe/drag detector for gesture-driven UI (e.g. the
 * intro screen's "swipe up to continue" prompt).
 *
 * Built on the Pointer Events API, which reports touch and mouse input
 * through one unified event stream — exactly what's needed so the same
 * gesture works with a finger on a phone and a mouse during desktop
 * testing, without separate touch/mouse code paths.
 */
export class SwipeInput {
  /**
   * @param {HTMLElement} element  the element to listen on
   * @param {object} [options]
   * @param {number} [options.thresholdPx]   upward drag distance, in CSS px, that counts as a swipe
   * @param {() => void} [options.onSwipeUp] called once per gesture when the threshold is crossed
   */
  constructor(element, { thresholdPx = 48, onSwipeUp } = {}) {
    this.thresholdPx = thresholdPx;
    this.onSwipeUp = onSwipeUp;
    this._startY = null;
    this._firedThisGesture = false;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerEnd = this._onPointerEnd.bind(this);

    element.addEventListener('pointerdown', this._onPointerDown);
    element.addEventListener('pointermove', this._onPointerMove);
    element.addEventListener('pointerup', this._onPointerEnd);
    element.addEventListener('pointercancel', this._onPointerEnd);
  }

  _onPointerDown(event) {
    this._startY = event.clientY;
    this._firedThisGesture = false;
  }

  _onPointerMove(event) {
    if (this._startY === null || this._firedThisGesture) return;

    if (this._startY - event.clientY >= this.thresholdPx) {
      this._firedThisGesture = true;
      this.onSwipeUp?.();
    }
  }

  _onPointerEnd() {
    this._startY = null;
  }
}
