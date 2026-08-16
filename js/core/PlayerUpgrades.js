/**
 * PlayerUpgrades.js
 * Persisted ship-part upgrade levels purchased in the Shop (see Shop.js,
 * Config.player.wings/engine/cannon/magnet/missiles). Each part's level is
 * 1-based and indexes directly into that part's own Config `levels` array —
 * level 1 is always the free starting tier, never itself purchased, same
 * indexing convention Config.player.magnet.levels already established
 * before a Shop upgrade path existed for it. Backed by Storage.js's
 * loadNumber/saveNumber, same `spaceShooter.` prefix every other persisted
 * value (best score, gold wallet, mission progress) already uses.
 */
import { loadNumber, saveNumber } from './Storage.js';

/** @param {string} partId @returns {number} 1-based, defaults to 1 (no upgrades purchased yet) */
export function getPartLevel(partId) {
  return loadNumber(`shop.${partId}.level`, 1);
}

/** @param {string} partId @param {number} level */
export function setPartLevel(partId, level) {
  saveNumber(`shop.${partId}.level`, level);
}
