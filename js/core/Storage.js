/**
 * Storage.js
 * Thin wrapper around `localStorage` for the game's persisted values
 * (currently: best score, gold wallet balance). This codebase has never
 * touched browser storage before this — wrapped rather than called
 * directly because `localStorage` can throw (private browsing, disabled
 * storage, some in-app browsers), and a storage failure should degrade to
 * "nothing persists this session" rather than crash the game.
 */
const PREFIX = 'spaceShooter.';

/**
 * @param {string} key
 * @param {number} [fallback]
 * @returns {number}
 */
export function loadNumber(key, fallback = 0) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {number} value
 */
export function saveNumber(key, value) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // Ignore — e.g. private browsing or storage disabled. The game keeps
    // running with an unpersisted value for the rest of this session.
  }
}

/**
 * @param {string} key
 * @param {boolean} [fallback]
 * @returns {boolean}
 */
export function loadBool(key, fallback = false) {
  return loadNumber(key, fallback ? 1 : 0) === 1;
}

/**
 * @param {string} key
 * @param {boolean} value
 */
export function saveBool(key, value) {
  saveNumber(key, value ? 1 : 0);
}
