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
import { Config } from './Config.js';

// The five upgradable ship parts. Shop.js's own PARTS array also lists
// these (plus its Shop-only display concerns — name/icon glyph), but THIS
// is the single source of truth for "which part ids exist" that non-Shop
// code (HUD's upgrade summary below) reads from, rather than reaching into
// Shop.js for it.
const PART_IDS = ['wings', 'engine', 'cannon', 'magnet', 'missiles'];

/** @param {string} partId @returns {number} 1-based, defaults to 1 (no upgrades purchased yet) */
export function getPartLevel(partId) {
  return loadNumber(`shop.${partId}.level`, 1);
}

/** @param {string} partId @param {number} level */
export function setPartLevel(partId, level) {
  saveNumber(`shop.${partId}.level`, level);
}

/**
 * Total upgrade progress across every part, summed — e.g. `{ current: 7, max: 50 }`.
 * `max` is derived from each part's real `Config.player.<id>.levels.length`
 * (currently 10 apiece, 5 parts) rather than a hardcoded constant, so it
 * can't silently drift out of sync if a part's level count ever changes.
 * Read by HUD.js for the gold panel's upgrade-summary subtext.
 * @returns {{ current: number, max: number }}
 */
export function getUpgradeSummary() {
  let current = 0, max = 0;
  for (const id of PART_IDS) {
    current += getPartLevel(id);
    max += Config.player[id].levels.length;
  }
  return { current, max };
}
