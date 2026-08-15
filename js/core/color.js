/**
 * color.js
 * Small, stateless color-interpolation helper — kept here (parallel to
 * animation.js's easing/flicker curves) rather than duplicated per-file, for
 * any UI element that needs to ramp smoothly between two authored hex colors
 * (e.g. a graduated health-bar warning) instead of a sudden binary color
 * swap once some threshold is crossed.
 */

/**
 * Linearly interpolate between two '#rrggbb' hex colors.
 * @param {string} hexA @param {string} hexB
 * @param {number} t  0 = hexA, 1 = hexB (clamped to [0, 1])
 * @returns {string} '#rrggbb'
 */
export function lerpHexColor(hexA, hexB, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const [ar, ag, ab] = _parseHex(hexA);
  const [br, bg, bb] = _parseHex(hexB);
  const r = Math.round(ar + (br - ar) * clamped);
  const g = Math.round(ag + (bg - ag) * clamped);
  const b = Math.round(ab + (bb - ab) * clamped);
  return `#${_toHex(r)}${_toHex(g)}${_toHex(b)}`;
}

function _parseHex(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function _toHex(n) {
  return n.toString(16).padStart(2, '0');
}
