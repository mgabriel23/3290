/**
 * TutorialProgress.js
 * Tracks whether a player has ever sat through TutorialScene's hint sequence
 * — one global flag, not per-mode: Mission Mode and Survival Mode are two
 * on-ramps into the SAME hint sequence (both point at the same HUD/barrier
 * UI), so whichever one the player picks first is the one that plays it, and
 * the other is exempted from then on (see Game._startTutorial's call sites).
 * Backed by Storage.js's loadBool/saveBool, same `spaceShooter.` prefix every
 * other persisted flag (best score, gold, mission completion, prologue-seen)
 * already uses.
 */
import { loadBool, saveBool } from './Storage.js';

/** @returns {boolean} */
export function hasSeenTutorial() {
  return loadBool('tutorial.seen', false);
}

export function markTutorialSeen() {
  saveBool('tutorial.seen', true);
}
