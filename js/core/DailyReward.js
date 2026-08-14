/**
 * DailyReward.js
 * Persistence and roll logic for the once-a-day reward (see Config.dailyReward
 * for the three possible kinds and their tuning; DailyRewardPanel.js is the
 * popup that renders whatever this module resolves; PrologueScene.js composes
 * that panel into its title beat). Exactly one reward kind is rolled per
 * calendar day, keyed off the player's own local date (not UTC, and not a
 * rolling 24h window from last claim) — "today" should match what the
 * player's clock says today is. The roll (and its concrete gold amount, for
 * a 'gold' reward) is persisted the moment a new day is first observed, not
 * re-rolled on every call, so reloading the page before claiming can't hand
 * out a different prize than the one already shown.
 *
 * Gold is credited immediately on claim, straight to the same 'gold' Storage
 * key HUD's own wallet reads (see HUD.js) — no HUD instance needs to exist
 * yet for this to work, since HUD just loads whatever that key holds the
 * next time one is constructed. luckyDrop/shieldStart instead set a one-shot
 * "pending" flag, consumed exactly once by the next GameplayScene via
 * consumeLuckyDrop()/consumeShieldStart() — see that scene's constructor.
 */
import { Config } from './Config.js';
import { loadNumber, saveNumber, loadBool, saveBool } from './Storage.js';

const REWARD_TYPES = ['gold', 'luckyDrop', 'shieldStart'];

/** Today's date as a single comparable integer (YYYYMMDD), in the player's local timezone. */
function todayKey() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * Ensures today's reward has been rolled (rolling it once, the first time
 * today is seen), then returns it. Safe to call repeatedly — only the first
 * call each day actually rolls anything.
 * @returns {{ type: 'gold'|'luckyDrop'|'shieldStart', amount: number }}
 *   `amount` is only meaningful for 'gold'.
 */
function currentReward() {
  const today = todayKey();
  if (loadNumber('dailyReward.day', 0) !== today) {
    const type = REWARD_TYPES[Math.floor(Math.random() * REWARD_TYPES.length)];
    let amount = 0;
    if (type === 'gold') {
      const { minAmount, maxAmount } = Config.dailyReward.gold;
      amount = Math.round((minAmount + Math.random() * (maxAmount - minAmount)) / 5) * 5;
    }
    saveNumber('dailyReward.day', today);
    saveNumber('dailyReward.type', REWARD_TYPES.indexOf(type));
    saveNumber('dailyReward.amount', amount);
    saveBool('dailyReward.claimed', false);
  }
  return {
    type: REWARD_TYPES[loadNumber('dailyReward.type', 0)],
    amount: loadNumber('dailyReward.amount', 0),
  };
}

/** True if today's reward hasn't been claimed yet — DailyRewardPanel checks this once at construction. */
export function hasPendingReward() {
  currentReward();
  return !loadBool('dailyReward.claimed', false);
}

/** Today's rolled reward. Only meaningful while hasPendingReward() is true. */
export function getPendingReward() {
  return currentReward();
}

/**
 * Grants today's rolled reward and marks it claimed for today. Idempotent
 * within a day (a second call would just re-set the same flags), but
 * DailyRewardPanel only ever calls this once, on the CLAIM tap.
 */
export function claimReward() {
  const reward = currentReward();
  if (reward.type === 'gold') {
    saveNumber('gold', loadNumber('gold', 0) + reward.amount);
  } else if (reward.type === 'luckyDrop') {
    saveBool('dailyReward.luckyDropPending', true);
  } else if (reward.type === 'shieldStart') {
    saveBool('dailyReward.shieldStartPending', true);
  }
  saveBool('dailyReward.claimed', true);
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
