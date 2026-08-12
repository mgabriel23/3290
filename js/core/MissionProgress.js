/**
 * MissionProgress.js
 * Persisted unlock/completion state for Mission Mode's levels (see
 * Config.mission, MissionSelectScene.js, GameplayScene's mission-mode
 * handling). Mission 1 is always unlocked; mission N (N > 1) unlocks the
 * instant mission N-1 is marked completed. Backed by Storage.js's
 * loadBool/saveBool — same `spaceShooter.` prefix every other persisted
 * value (best score, gold, Shop's owned parts) already uses.
 */
import { loadBool, saveBool } from './Storage.js';

/** @param {number} level 1-based @returns {boolean} */
export function isMissionCompleted(level) {
  return loadBool(`mission.${level}.completed`, false);
}

/** @param {number} level 1-based @returns {boolean} */
export function isMissionUnlocked(level) {
  return level <= 1 || isMissionCompleted(level - 1);
}

/** @param {number} level 1-based */
export function completeMission(level) {
  saveBool(`mission.${level}.completed`, true);
}
