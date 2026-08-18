/**
 * Stats.js
 * Lifetime play stats — the game's only record of a player's history beyond
 * the single `bestScore` HUD.js tracks and RunHistory.js's last-5-runs list
 * (see Storage.js). Backed by loadJSON/saveJSON's `stats` key, same
 * `spaceShooter.` prefix as everything else. Achievements.js reads this to
 * derive unlock/progress state — nothing in this file knows what an
 * achievement even is, it only counts, the same separation EnemyCodex draws
 * between Config's real balance numbers and its own display-only ENTRIES.
 *
 * Kill counters are grouped by family, not by every exact enemy type/variant
 * — matching how WaveManager.handleBulletHit/_rewardFor already resolve a
 * kill (by `.type`, with Drifter/Bouncer's sub-variety folded into one
 * bucket each since the live entity's own `.type` doesn't distinguish them
 * either). `bossKills` is separate rather than a fifth family — rare,
 * high-value kills worth their own headline stat rather than folded into
 * one of the four regular families.
 */
import { loadJSON, saveJSON } from './Storage.js';

const DEFAULTS = Object.freeze({
  totalKills: 0,
  killsByFamily: Object.freeze({ scoutFamily: 0, sniper: 0, drifterFamily: 0, bouncerFamily: 0 }),
  bossKills: 0,
  goldCollected: 0,
  powerUpsCollected: 0,
  bestCombo: 0,
  runsPlayed: 0,
  playtimeSeconds: 0,
});

// In-memory cache of the persisted `stats` blob, plus a coalesced flush.
// WaveManager.handleBulletHit calls recordKill for every kill in one
// synchronous loop (see triggerSkillBomb — a single skill-bomb tap can kill
// everything on screen in one frame), so writing to localStorage
// synchronously on every call was a guaranteed hitch on low-end devices at
// exactly the moment the frame is already busiest. Every record* function
// below now mutates this cache directly and schedules one flush via
// queueMicrotask — multiple record* calls within the same synchronous frame
// collapse into a single localStorage write at the end of that frame's
// execution, instead of one write per call.
let cache = null;
let flushPending = false;

function readCache() {
  if (!cache) {
    const saved = loadJSON('stats', null) || {};
    cache = {
      ...DEFAULTS,
      ...saved,
      killsByFamily: { ...DEFAULTS.killsByFamily, ...(saved.killsByFamily || {}) },
    };
  }
  return cache;
}

function scheduleFlush() {
  if (flushPending) return;
  flushPending = true;
  queueMicrotask(() => {
    flushPending = false;
    saveJSON('stats', cache);
  });
}

/** @returns {typeof DEFAULTS} a plain copy of the current (possibly not-yet-flushed) in-memory stats — always reflects every record* call made so far this session, even ones still pending their microtask flush. */
export function getStats() {
  return { ...readCache(), killsByFamily: { ...readCache().killsByFamily } };
}

function save(stats) {
  cache = stats;
  scheduleFlush();
}

/**
 * Resolves which family bucket a kill belongs to — mirrors WaveManager's own
 * `.type` dispatch (see EnemyCombat.js's "small shared functions, no base
 * class" convention) but only ever needs the type string. `null` for
 * anything that isn't one of the four regular families (boss — see
 * `recordKill` — and one-off entities like a Snake boss's segments, which
 * still count toward `totalKills` but no specific family).
 * @param {string} type
 * @returns {string|null}
 */
function familyFor(type) {
  switch (type) {
    case 'scout': case 'rocketeer': case 'spitter': return 'scoutFamily';
    case 'sniper': return 'sniper';
    case 'drifter': return 'drifterFamily';
    case 'bouncer': return 'bouncerFamily';
    default: return null;
  }
}

/** @param {string} type  a live enemy's `.type` — see WaveManager.handleBulletHit's `killed` branch, the single choke point every kill in the game passes through. */
export function recordKill(type) {
  const stats = getStats();
  stats.totalKills++;
  if (type === 'boss') stats.bossKills++;
  else {
    const family = familyFor(type);
    if (family) stats.killsByFamily[family]++;
  }
  save(stats);
}

/** @param {number} amount  gold collected via a coin pickup this frame (not the wallet total — see GameplayScene's checkGoldPickup handling) */
export function recordGoldCollected(amount) {
  if (amount <= 0) return;
  const stats = getStats();
  stats.goldCollected += amount;
  save(stats);
}

/** @param {number} count  PowerUps collected this frame (see WaveManager.checkPowerUpPickup's own `count`) */
export function recordPowerUpsCollected(count) {
  if (count <= 0) return;
  const stats = getStats();
  stats.powerUpsCollected += count;
  save(stats);
}

/** @param {number} count  the run's best kill-streak-without-damage reached — only saved if it beats the existing record. */
export function recordBestCombo(count) {
  if (count <= 0) return;
  const stats = getStats();
  if (count <= stats.bestCombo) return;
  stats.bestCombo = count;
  save(stats);
}

/**
 * Called once per completed run (see GameplayScene.handleTap's `onGameOver`/
 * `onMissionComplete` branches — the two points a GameplayScene instance is
 * torn down for good, never on an in-place paid revive, which keeps the same
 * instance alive instead).
 * @param {number} seconds  this run's active playtime (GameplayScene's own `_age`)
 */
export function recordRunEnd(seconds) {
  const stats = getStats();
  stats.runsPlayed++;
  stats.playtimeSeconds += Math.max(0, seconds);
  save(stats);
}
