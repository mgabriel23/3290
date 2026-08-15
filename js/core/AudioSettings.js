/**
 * AudioSettings.js
 * A single module-level mute flag shared by every audio-playing system in
 * the game — every `AudioPool` instance (Bullets, WaveManager, Prologue/
 * TutorialScene blips) and the persistent background music `Audio` element
 * in Game.js. Centralized here rather than threaded through constructors
 * because the audio sources are scattered across many otherwise-unrelated
 * classes; each just imports this module and reads/subscribes independently.
 * Persisted via Storage.js so the preference survives a reload.
 *
 * Also owns a separate `volume` level (0–1, independent of `muted`) — the
 * SettingsPanel's volume slider, read the same way by the same two
 * consumers (`AudioPool.play`, `Game._updateAudioFades`). Kept in this same
 * module rather than core/Settings.js since both are "how loud is the
 * game," not the newer accessibility/control settings.
 */
import { loadBool, saveBool, loadNumber, saveNumber } from './Storage.js';

let muted = loadBool('muted', false);
let volume = loadNumber('volume', 1);
const listeners = new Set();

export function isMuted() {
  return muted;
}

/**
 * @param {boolean} value
 */
function setMuted(value) {
  muted = value;
  saveBool('muted', muted);
  for (const listener of listeners) listener(muted);
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

/**
 * Notified with the new muted state on every change — e.g. Game.js uses
 * this to live-update the already-playing background music element's
 * `.muted` property, since that Audio instance isn't routed through
 * AudioPool (which checks `isMuted()` per-play instead).
 * @param {(muted: boolean) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onMutedChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @returns {number} 0–1 */
export function getVolume() {
  return volume;
}

/**
 * No change-notification here (unlike `setMuted`) — both consumers
 * (`AudioPool.play`, `Game._updateAudioFades`) already read `getVolume()`
 * fresh on every play/frame rather than caching it, so there's nothing to
 * push a value into.
 * @param {number} value 0–1, clamped
 */
export function setVolume(value) {
  volume = Math.max(0, Math.min(1, value));
  saveNumber('volume', volume);
}
