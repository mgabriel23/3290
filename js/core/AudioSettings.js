/**
 * AudioSettings.js
 * A single module-level mute flag shared by every audio-playing system in
 * the game — every `AudioPool` instance (Bullets, WaveManager, Prologue/
 * TutorialScene blips) and the persistent background music `Audio` element
 * in Game.js. Centralized here rather than threaded through constructors
 * because the audio sources are scattered across many otherwise-unrelated
 * classes; each just imports this module and reads/subscribes independently.
 * Persisted via Storage.js so the preference survives a reload.
 */
import { loadBool, saveBool } from './Storage.js';

let muted = loadBool('muted', false);
const listeners = new Set();

export function isMuted() {
  return muted;
}

/**
 * @param {boolean} value
 */
export function setMuted(value) {
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
