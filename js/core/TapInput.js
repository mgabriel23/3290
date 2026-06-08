/**
 * TapInput.js
 * Minimal tap/click detector for simple on-canvas controls (e.g. a
 * "Skip" button drawn directly onto the scene). Built on the Pointer
 * Events API — the same touch+mouse unification `SwipeInput` relies on,
 * so taps register identically from a finger on a phone or a mouse click
 * on desktop.
 *
 * A "tap" is a pointerdown/pointerup pair whose release stays within a
 * small movement tolerance of where it started — anything that travels
 * further is a drag/swipe, not a tap, and is ignored. That tolerance is
 * what lets this coexist peacefully with `SwipeInput` on the same
 * element: a swipe-up gesture moves far more than a tap ever would, so
 * neither detector mistakes the other's gesture for its own.
 */
export class TapInput {
  /**
   * @param {HTMLElement} element  the element to listen on
   * @param {object} [options]
   * @param {number} [options.movementTolerancePx]  max release-point drift (CSS px) still counted as a tap
   * @param {(clientX: number, clientY: number) => void} [options.onTap]  called with the release position
   */
  constructor(element, { movementTolerancePx = 12, onTap } = {}) {
    this.movementTolerancePx = movementTolerancePx;
    this.onTap = onTap;
    this._start = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerCancel = this._onPointerCancel.bind(this);

    element.addEventListener('pointerdown', this._onPointerDown);
    element.addEventListener('pointerup', this._onPointerUp);
    element.addEventListener('pointercancel', this._onPointerCancel);
  }

  _onPointerDown(event) {
    this._start = { x: event.clientX, y: event.clientY };
  }

  _onPointerUp(event) {
    if (!this._start) return;

    const dx = event.clientX - this._start.x;
    const dy = event.clientY - this._start.y;
    if (Math.hypot(dx, dy) <= this.movementTolerancePx) {
      this.onTap?.(event.clientX, event.clientY);
    }
    this._start = null;
  }

  _onPointerCancel() {
    this._start = null;
  }
}
