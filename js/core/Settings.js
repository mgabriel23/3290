/**
 * Settings.js
 * The accessibility/control settings SettingsPanel exposes — sensitivity,
 * haptics, colorblind mode, text size — each a module-level value persisted
 * via Storage.js, same shape as AudioSettings.js's `muted`/`volume` (which
 * stays in its own file since it's "how loud," not this group). Every
 * default below reproduces today's exact behavior until a player actually
 * opens Settings, so nobody's experience changes just because this file
 * now exists.
 *
 * Also exports the three small helpers every consumer of these settings
 * actually calls, rather than making each entity re-read the raw value and
 * re-derive its own meaning:
 *   - `dangerColor(defaultColor)` — the one colorblind remap in this game
 *     (see class doc reasoning in the plan/PR this shipped with): the
 *     game's single reused "danger red" (Config.player.lowHealth.color,
 *     Config.barrier.lowHealth.color, Config.gameOver.titleColor,
 *     Config.boss.intro.color, Config.boss.scout1.color/flameColor — all
 *     the same hex, by those Config fields' own comments) swaps to an
 *     amber alternative. Every other color (the enemy roster's per-type
 *     palette) is untouched — those distinguish enemy TYPE, which is
 *     already legible by hull shape, not a colorblind-relevant signal.
 *   - `textSizeScale()` — a multiplier HUD.js's drawText calls pass through
 *     Renderer's own `scale` option.
 *   - `vibrate(ms)` — wraps navigator.vibrate behind the haptics toggle;
 *     no-op (not an error) on browsers with no Vibration API at all (every
 *     iOS browser, being WebKit) — same silent-degrade tolerance AudioPool
 *     already uses for browser-API gaps.
 */
import { Config } from './Config.js';
import { loadNumber, saveNumber, loadBool, saveBool } from './Storage.js';

let sensitivity = loadNumber('settings.sensitivity', 0); // 0 = today's exact instant snap
let haptics = loadBool('settings.haptics', true);
let colorblind = loadBool('settings.colorblind', false);
let textSize = loadNumber('settings.textSize', 1); // 0=small, 1=normal, 2=large

/** @returns {number} 0–1 — 0 is the original instant snap, see Player.update */
export function getSensitivity() {
  return sensitivity;
}

/** @param {number} value 0–1, clamped */
export function setSensitivity(value) {
  sensitivity = Math.max(0, Math.min(1, value));
  saveNumber('settings.sensitivity', sensitivity);
}

export function getHapticsEnabled() {
  return haptics;
}

/** @param {boolean} value */
export function setHapticsEnabled(value) {
  haptics = value;
  saveBool('settings.haptics', haptics);
}

export function getColorblindEnabled() {
  return colorblind;
}

/** @param {boolean} value */
export function setColorblindEnabled(value) {
  colorblind = value;
  saveBool('settings.colorblind', colorblind);
}

/** @returns {number} 0 (small), 1 (normal), or 2 (large) */
export function getTextSize() {
  return textSize;
}

/** @param {number} value 0, 1, or 2 */
export function setTextSize(value) {
  textSize = value;
  saveNumber('settings.textSize', textSize);
}

/** @returns {number} the multiplier matching the current textSize setting */
export function textSizeScale() {
  return [0.85, 1, 1.2][textSize] ?? 1;
}

/**
 * @param {string} defaultColor  the game's normal "danger red" for this call site
 * @returns {string}
 */
export function dangerColor(defaultColor) {
  return colorblind ? Config.colors.dangerColorblind : defaultColor;
}

/**
 * @param {number} ms
 */
export function vibrate(ms) {
  if (!haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Degrade silently — see class doc.
  }
}
