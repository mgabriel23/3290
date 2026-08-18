/**
 * DailyReward.js
 * Persistence and roll logic for the daily reward — a 7-day streak calendar
 * (Config.dailyReward.calendar) rather than a flat random pick: claiming on
 * consecutive local calendar days advances `streakDay` (1-7), missing a day
 * resets it to 1, and day 7 loops back to day 1 the day after. See
 * entities/DailyRewardPanel.js for the popup that renders whatever this
 * module resolves, and scenes/PrologueScene.js for both the panel's
 * composition into the title beat and the post-claim footer that reads
 * previewNextReward().
 *
 * "Today" is always the player's own local date (not UTC, not a rolling 24h
 * window from last claim) — see localDayNumber(). A day's slot (and its
 * rolled gold amount, for a 'gold' entry) is resolved once, the first time
 * that day is observed, and persisted immediately — see ensureRolled — so
 * reloading the page before claiming can't hand out a different prize, or
 * silently re-roll the streak, than what's already showing.
 *
 * Gold is credited immediately on claim, straight to the same 'gold'
 * Storage key HUD's own wallet reads (see HUD.js) — no HUD instance needs
 * to exist yet for this to work. luckyDrop/shieldStart instead set a
 * one-shot "pending" flag, consumed exactly once by the next GameplayScene
 * via consumeLuckyDrop()/consumeShieldStart() — see that scene's
 * constructor. This contract is unchanged from before the streak rework.
 */
import { Config } from './Config.js';
import { loadNumber, saveNumber, loadBool, saveBool } from './Storage.js';

const CALENDAR = Config.dailyReward.calendar;

/**
 * Today as a count of local calendar days since the epoch — unlike a
 * YYYYMMDD int, this is diffable across month/year boundaries, which
 * ensureRolled's "was yesterday claimed?" check depends on.
 */
function localDayNumber() {
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

/** Clamps a `streakDay` read back from storage into the CALENDAR's real 1-7 range — a value written by this file's own write path is always already in range, but a value edited directly in localStorage isn't, and every read site indexes `CALENDAR[streakDay - 1]` with no bounds check of its own, so an out-of-range value would resolve to `undefined` and throw on `entry.type`/`entry.name` a moment later. */
function clampStreakDay(n) {
  return Math.min(CALENDAR.length, Math.max(1, Math.round(n)));
}

/** Merges a calendar slot's own overrides (day 7's jackpot name/color/description) over its type's default display config (Config.dailyReward[type]). */
function resolveDisplay(entry) {
  const base = Config.dailyReward[entry.type];
  return {
    name: entry.name ?? base.name,
    color: entry.color ?? base.color,
    description: entry.description ?? base.description,
  };
}

/**
 * Ensures today's slot has been rolled — advancing or resetting the streak
 * exactly once per newly-observed day — then persists it. Safe to call
 * repeatedly; only the first call for a given day actually rolls anything,
 * gated on `dailyReward.highestDayObserved` rather than a plain "is today
 * different from last time" check — a monotonic high-water mark, not just
 * the last value, so a system clock rolled BACKWARD past a day already
 * resolved can't re-enter this branch and re-arm `claimed = false`. Without
 * that, oscillating the clock back and forth would let a player re-claim
 * the daily reward indefinitely instead of waiting a real 24h — a static
 * site has no server truth to check the clock against, so this can't stop
 * clock manipulation outright, but it does stop the specific "rewind to
 * farm" exploit from working.
 */
function ensureRolled() {
  const today = localDayNumber();
  const highestSeen = loadNumber('dailyReward.highestDayObserved', -1);
  if (today <= highestSeen) return; // already resolved today (or we're behind it) — nothing new to roll
  saveNumber('dailyReward.highestDayObserved', today);

  const lastClaim = loadNumber('dailyReward.lastClaimDay', -1);
  const prevStreak = clampStreakDay(loadNumber('dailyReward.streakDay', 1));
  const streakDay = lastClaim === today - 1
    ? (prevStreak >= 7 ? 1 : prevStreak + 1) // claimed yesterday — streak continues (or loops past day 7)
    : 1; // missed a day, or this is the very first roll ever — start the cycle over

  const entry = CALENDAR[streakDay - 1];
  let amount = 0;
  if (entry.type === 'gold') {
    amount = Math.round((entry.amountMin + Math.random() * (entry.amountMax - entry.amountMin)) / 5) * 5;
  }

  saveNumber('dailyReward.streakDay', streakDay);
  saveNumber('dailyReward.amount', amount);
  saveBool('dailyReward.claimed', false);
}

/** True if today's reward hasn't been claimed yet — DailyRewardPanel checks this once at construction. */
export function hasPendingReward() {
  ensureRolled();
  return !loadBool('dailyReward.claimed', false);
}

/**
 * Today's rolled reward, resolved for display/claim. Only meaningful while
 * hasPendingReward() is true.
 * @returns {{ streakDay: number, type: 'gold'|'luckyDrop'|'shieldStart', amount: number, jackpot: boolean, displayName: string, displayColor: string, displayDescription: string }}
 */
export function getPendingReward() {
  ensureRolled();
  const streakDay = clampStreakDay(loadNumber('dailyReward.streakDay', 1));
  const entry = CALENDAR[streakDay - 1];
  const display = resolveDisplay(entry);
  return {
    streakDay,
    type: entry.type,
    amount: loadNumber('dailyReward.amount', 0),
    jackpot: !!entry.jackpot,
    displayName: display.name,
    displayColor: display.color,
    displayDescription: display.description,
  };
}

/**
 * Grants today's rolled reward, marks it claimed, and stamps today as the
 * last claim day — the value tomorrow's ensureRolled() checks to decide
 * whether the streak continues or resets. Idempotent within a day.
 */
export function claimReward() {
  const reward = getPendingReward();
  if (reward.type === 'gold') {
    saveNumber('gold', loadNumber('gold', 0) + reward.amount);
  } else if (reward.type === 'luckyDrop') {
    saveBool('dailyReward.luckyDropPending', true);
  } else if (reward.type === 'shieldStart') {
    saveBool('dailyReward.shieldStartPending', true);
  }
  saveBool('dailyReward.claimed', true);
  saveNumber('dailyReward.lastClaimDay', localDayNumber());
}

/**
 * Consumes (clears) a pending Lucky Drop flag, if one was claimed. Called
 * exactly once by GameplayScene's constructor — see Config.dailyReward.
 * luckyDrop's own doc for what the returned boolean should drive.
 * @returns {boolean} whether Lucky Drop was active
 */
export function consumeLuckyDrop() {
  const active = loadBool('dailyReward.luckyDropPending', false);
  if (active) saveBool('dailyReward.luckyDropPending', false);
  return active;
}

/**
 * Consumes (clears) a pending Shield Start flag, if one was claimed. Called
 * exactly once by GameplayScene's constructor, same shape as consumeLuckyDrop.
 * @returns {boolean} whether Shield Start was active
 */
export function consumeShieldStart() {
  const active = loadBool('dailyReward.shieldStartPending', false);
  if (active) saveBool('dailyReward.shieldStartPending', false);
  return active;
}

/**
 * The display config for whichever slot comes AFTER today's — used by
 * PrologueScene's post-claim footer to tease tomorrow's reward (see
 * Config.dailyReward.claimedBadge). Always resolvable even mid-cycle since
 * the calendar loops: day 7's "next" is day 1.
 * @returns {{ name: string, color: string }}
 */
export function previewNextReward() {
  ensureRolled();
  const streakDay = clampStreakDay(loadNumber('dailyReward.streakDay', 1));
  const nextDay = streakDay >= 7 ? 1 : streakDay + 1;
  const display = resolveDisplay(CALENDAR[nextDay - 1]);
  return { name: display.name, color: display.color };
}
