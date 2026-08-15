/**
 * TutorialProgress.js
 * Tracks whether a player has ever sat through TutorialScene's hint sequence,
 * tracked separately per mode ('mission'/'survival') rather than one global
 * flag — Mission Mode and Survival Mode are independent on-ramps (see
 * Game._afterTutorial), so a player who already cleared the tutorial via one
 * mode still sees it once for the other the first time they try it. Backed by
 * Storage.js's loadBool/saveBool, same `spaceShooter.` prefix every other
 * persisted flag (best score, gold, mission completion, prologue-seen)
 * already uses.
 */
import { loadBool, saveBool } from './Storage.js';

/** @param {'mission'|'survival'} mode @returns {boolean} */
export function hasSeenTutorial(mode) {
  return loadBool(`tutorial.${mode}.seen`, false);
}

/** @param {'mission'|'survival'} mode */
export function markTutorialSeen(mode) {
  saveBool(`tutorial.${mode}.seen`, true);
}
