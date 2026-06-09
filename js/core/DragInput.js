/**
 * DragInput.js
 * Continuous pointer-position tracker for drag-to-move gameplay controls.
 * Reports where the pointer is on press, every movement while held, and
 * when it lifts — all via the Pointer Events API so it behaves identically
 * for a finger on a phone and a mouse on desktop.
 *
 * Coexists safely with SwipeInput and TapInput on the same element:
 *   - SwipeInput only fires after a large upward drag (≥ 48 CSS px) — not
 *     triggered by lateral or short play-area movement.
 *   - TapInput only fires when the pointer barely moves (< 12 CSS px) —
 *     DragInput treats that as a zero-movement drag and handles it correctly.
 * Neither fires during the other's intended gesture.
 */
export class DragInput {
  /**
   * @param {HTMLElement} element
   * @param {{
   *   onPointerDown?: (clientX: number, clientY: number) => void,
   *   onPointerMove?: (clientX: number, clientY: number) => void,
   *   onPointerUp?:   () => void,
   * }} options
   */
  constructor(element, { onPointerDown, onPointerMove, onPointerUp } = {}) {
    this._onDown = onPointerDown;
    this._onMove = onPointerMove;
    this._onUp   = onPointerUp;
    this._active = false;

    this._handleDown = this._handleDown.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._handleEnd  = this._handleEnd.bind(this);

    element.addEventListener('pointerdown',   this._handleDown);
    element.addEventListener('pointermove',   this._handleMove);
    element.addEventListener('pointerup',     this._handleEnd);
    element.addEventListener('pointercancel', this._handleEnd);
  }

  _handleDown(e) {
    this._active = true;
    this._onDown?.(e.clientX, e.clientY);
  }

  _handleMove(e) {
    if (!this._active) return;
    this._onMove?.(e.clientX, e.clientY);
  }

  _handleEnd() {
    if (!this._active) return;
    this._active = false;
    this._onUp?.();
  }
}
