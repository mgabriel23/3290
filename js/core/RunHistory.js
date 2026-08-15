/**
 * RunHistory.js
 * A local "last 5 runs" list — the comparison point the game had nothing
 * for beyond the single `bestScore` HUD.js already tracks (see Storage.js's
 * `bestScore` key). Backed by `Storage.js`'s `loadJSON`/`saveJSON`, most-
 * recent run first, capped at MAX_ENTRIES.
 *
 * `recordRun` and `updateLastRunScore` are two different calls rather than
 * one "upsert" because GameplayScene needs both: a fresh run calls
 * `recordRun` exactly once (see its own `_historyRecorded` flag), but a
 * paid revive lets the SAME run continue and (if the player dies again)
 * reach `_triggerGameOver` a second time — that should correct the same
 * row's final score in place, not add a second row for one run.
 */
import { loadJSON, saveJSON } from './Storage.js';

const MAX_ENTRIES = 5;

/** @returns {{ score: number, mode: 'mission'|'survival', level: number, timestamp: number }[]} most-recent first */
export function getRunHistory() {
  return loadJSON('runHistory', []);
}

/**
 * @param {{ score: number, mode: 'mission'|'survival', level: number }} run
 */
export function recordRun({ score, mode, level }) {
  const history = getRunHistory();
  history.unshift({ score, mode, level, timestamp: Date.now() });
  history.length = Math.min(history.length, MAX_ENTRIES);
  saveJSON('runHistory', history);
}

/**
 * Corrects the most-recent entry's score in place (see class doc) — a
 * no-op if there's nothing to correct (shouldn't happen in practice, since
 * this is only ever called after `recordRun` already ran once this run).
 * @param {number} score
 */
export function updateLastRunScore(score) {
  const history = getRunHistory();
  if (history.length === 0) return;
  history[0].score = score;
  saveJSON('runHistory', history);
}
