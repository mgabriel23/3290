/**
 * PrologueProgress.js
 * Tracks whether a player has ever finished PrologueScene's opening
 * cinematic (the yearCard → briefing → fadeOut beats) — backed by
 * Storage.js's loadBool/saveBool, same `spaceShooter.` prefix every other
 * persisted flag (best score, gold, mission completion, Shop ownership)
 * already uses. The cinematic is deliberately unskippable and, per
 * markPrologueSeen's call site, plays in full exactly once: the very first
 * time a player reaches it. Every later launch (Game._startPrologue) reads
 * this flag and jumps straight to the title/mode-button card instead — the
 * same devSkipToTitle path "back" navigation from MissionSelectScene already
 * used for a different reason.
 */
import { loadBool, saveBool } from './Storage.js';

/** @returns {boolean} */
export function hasSeenPrologue() {
  return loadBool('prologue.seen', false);
}

export function markPrologueSeen() {
  saveBool('prologue.seen', true);
}
