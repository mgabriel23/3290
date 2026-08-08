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
    this._activePointerId = null; // pointerId currently driving the drag, or null when idle

    this._handleDown = this._handleDown.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._handleEnd  = this._handleEnd.bind(this);

    element.addEventListener('pointerdown',   this._handleDown);
    element.addEventListener('pointermove',   this._handleMove);
    element.addEventListener('pointerup',     this._handleEnd);
    element.addEventListener('pointercancel', this._handleEnd);
  }

  _handleDown(e) {
    if (this._activePointerId !== null) return; // a drag is already in progress — ignore extra touches
    this._activePointerId = e.pointerId;
    // Pointer capture keeps move/up events targeted at this element even if
    // the finger drifts outside its bounds mid-drag — without this, a fast
    // drag past the canvas edge silently stops delivering pointermove.
    e.target.setPointerCapture?.(e.pointerId);
    this._onDown?.(e.clientX, e.clientY);
  }

  _handleMove(e) {
    if (e.pointerId !== this._activePointerId) return;
    this._onMove?.(e.clientX, e.clientY);
  }

  _handleEnd(e) {
    if (e.pointerId !== this._activePointerId) return;
    this._activePointerId = null;
    e.target.releasePointerCapture?.(e.pointerId);
    this._onUp?.();
  }
}
