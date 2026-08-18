/**
 * Achievements.js
 * The badge roster (`TRACKS`) plus pure derivation from core/Stats.js's
 * lifetime counters into unlock/progress state. Same split EnemyCodex draws
 * between Config's real numbers and its own display-only `ENTRIES` — this
 * file's content (titles/descriptions/thresholds) lives here rather than in
 * Config.js, while the *rendering* geometry it's browsed with lives in
 * Config.achievements, same convention as Config.codex vs EnemyCodex.ENTRIES.
 *
 * There is no separate "unlocked" flag persisted anywhere: a tier is
 * unlocked exactly when its threshold is at or below the live Stats value,
 * recomputed on every read. Nothing here can desync from Stats or need a
 * migration if a threshold is retuned later.
 *
 * Grouped by family rather than by every exact enemy type/variant (11 in
 * EnemyCodex) — see Stats.js's own doc for why the counters themselves are
 * already bucketed this way.
 */
import { Config } from './Config.js';
import { getStats } from './Stats.js';

export const TRACKS = [
  {
    id: 'totalKills',
    title: 'HULL BREAKER',
    description: 'Destroy enemies of any kind.',
    color: '#4DEFFF',
    thresholds: [100, 1000, 10000],
    getValue: (s) => s.totalKills,
  },
  {
    id: 'scoutFamily',
    title: 'INTERCEPTOR',
    description: 'Destroy Scouts, Rocketeers, and Spitters.',
    color: Config.enemy.scout.color,
    thresholds: [50, 500, 5000],
    getValue: (s) => s.killsByFamily.scoutFamily,
  },
  {
    id: 'sniper',
    title: 'COUNTERSNIPE',
    description: 'Destroy Snipers before their charged shot lands.',
    color: Config.enemy.sniper.color,
    thresholds: [25, 250, 2500],
    getValue: (s) => s.killsByFamily.sniper,
  },
  {
    id: 'drifterFamily',
    title: 'TENTACLE HUNTER',
    description: 'Destroy any Drifter-family creature — Drifter, Sweeper, Diver, or Weaver.',
    color: Config.enemy.drifter.color,
    thresholds: [50, 500, 5000],
    getValue: (s) => s.killsByFamily.drifterFamily,
  },
  {
    id: 'bouncerFamily',
    title: 'RICOCHET',
    description: 'Destroy any Bouncer-family hexagon — Bouncer, Splitter, or Shielded.',
    color: Config.enemy.bouncer.color,
    thresholds: [30, 300, 3000],
    getValue: (s) => s.killsByFamily.bouncerFamily,
  },
  {
    id: 'bossKills',
    title: 'GIANT SLAYER',
    description: 'Defeat bosses.',
    color: '#FF5C3D',
    thresholds: [1, 5, 20],
    getValue: (s) => s.bossKills,
  },
  {
    id: 'goldCollected',
    title: 'PROSPECTOR',
    description: 'Collect gold coins in flight.',
    color: Config.gold.color,
    thresholds: [500, 5000, 50000],
    getValue: (s) => s.goldCollected,
  },
  {
    id: 'powerUpsCollected',
    title: 'SUPPLY RUN',
    description: 'Collect PowerUps.',
    color: '#FFD24D',
    thresholds: [10, 100, 500],
    getValue: (s) => s.powerUpsCollected,
  },
  {
    id: 'bestCombo',
    title: 'UNTOUCHABLE',
    description: 'Reach a kill streak without taking a hit.',
    color: Config.combo.banner.color,
    thresholds: [15, 40, 100],
    getValue: (s) => s.bestCombo,
  },
  {
    id: 'runsPlayed',
    title: 'VETERAN',
    description: 'Complete runs, in either mode.',
    color: '#4DEFFF',
    thresholds: [5, 25, 100],
    getValue: (s) => s.runsPlayed,
  },
  {
    id: 'playtimeSeconds',
    title: 'ON WATCH',
    description: 'Spend time in active defense.',
    color: '#4DEFFF',
    thresholds: [3600, 18000, 72000], // 1h / 5h / 20h
    getValue: (s) => s.playtimeSeconds,
    format: (v) => {
      const totalMinutes = Math.floor(v / 60);
      const h = Math.floor(totalMinutes / 60), m = totalMinutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    },
  },
];

/** @param {number} value @returns {(v: number) => string} */
function defaultFormat(value) {
  return value.toLocaleString();
}

/** @param {object} track @param {number} value */
export function formatTrackValue(track, value) {
  return track.format ? track.format(value) : defaultFormat(value);
}

/** @param {object} track @param {number} value @returns {number} 0-3 — how many thresholds `value` has reached. */
export function tierIndexFor(track, value) {
  let tier = 0;
  for (const threshold of track.thresholds) {
    if (value < threshold) break;
    tier++;
  }
  return tier;
}

/**
 * @param {object} track
 * @param {ReturnType<typeof getStats>} stats
 * @returns {{ value: number, tier: number, maxTier: number }} `tier` is 0-3;
 *   `tier === maxTier` means every tier is unlocked.
 */
export function getTrackProgress(track, stats) {
  const value = track.getValue(stats);
  return { value, tier: tierIndexFor(track, value), maxTier: track.thresholds.length };
}

/**
 * Total tiers unlocked across every track right now — the "N / 33" headline
 * count. @param {ReturnType<typeof getStats>} [stats]  reuse an already-loaded
 * snapshot instead of a fresh Stats read, if the caller has one handy.
 */
export function totalUnlockedTiers(stats = getStats()) {
  return TRACKS.reduce((sum, track) => sum + tierIndexFor(track, track.getValue(stats)), 0);
}

/** Total tiers that exist across every track — the denominator for the headline count above. */
export function totalTierCount() {
  return TRACKS.reduce((sum, track) => sum + track.thresholds.length, 0);
}
