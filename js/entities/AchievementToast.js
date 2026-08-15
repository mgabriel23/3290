/**
 * AchievementToast.js
 * The "make it enjoyable" half of the achievements feature — a brief,
 * hard-to-miss pop-up fired the instant a badge tier unlocks mid-run, same
 * spirit and shape as ComboBanner's combo-streak "hype" banner (pop-in via
 * easeOutBack, hold, fade), just its own color and parked lower on screen
 * (Config.achievements.toast.posY) so the two can never collide if both
 * fire close together.
 *
 * Owns its own unlock detection rather than being told about it: `checkForUnlocks()`
 * is polled once a frame from GameplayScene.update() (same "poll and drain"
 * convention WaveManager's checkGoldPickup/checkPowerUpPickup pickups use),
 * diffing the live Stats-derived tier of every TRACK against the tier it saw
 * last frame. This keeps Stats.js and WaveManager/GameplayScene's kill/pickup
 * hooks completely unaware achievements exist at all — they just record
 * counts, and this is the only thing that ever asks "did any of those counts
 * just cross a threshold." The tier snapshot is taken fresh at construction
 * (one per GameplayScene/run), so a badge already unlocked in a previous
 * session never re-fires here — only a tier crossed DURING this run does.
 *
 * Single-instance with its own small FIFO queue rather than one-shot like
 * ComboBanner: a single kill can plausibly cross two tracks' thresholds at
 * once (e.g. a boss kill bumps both `totalKills` and `bossKills`), so more
 * than one toast can become due in the same frame — each is shown in full
 * before the next starts, never overlapped or dropped.
 */
import { Config } from '../core/Config.js';
import { TRACKS, tierIndexFor } from '../core/Achievements.js';
import { getStats } from '../core/Stats.js';
import { easeOutBack } from '../core/animation.js';

export class AchievementToast {
  constructor() {
    this._age = -1; // -1 = inactive; update()/render() no-op
    this._track = null;
    this._tierIndex = 0; // 0-based — indexes Config.achievements.tierLabels
    this._queue = [];

    const stats = getStats();
    this._lastTiers = TRACKS.map((track) => tierIndexFor(track, track.getValue(stats)));
  }

  /** Poll once per frame — a single Stats read (cheap: a handful of numbers), same cost class as WaveManager's own per-frame pickup polls. */
  checkForUnlocks() {
    const stats = getStats();
    for (let i = 0; i < TRACKS.length; i++) {
      const track = TRACKS[i];
      const tier = tierIndexFor(track, track.getValue(stats));
      for (let t = this._lastTiers[i] + 1; t <= tier; t++) this._queue.push({ track, tierIndex: t });
      this._lastTiers[i] = tier;
    }
    if (this._age < 0 && this._queue.length > 0) this._advance();
  }

  _advance() {
    const next = this._queue.shift();
    this._track = next.track;
    this._tierIndex = next.tierIndex;
    this._age = 0;
  }

  update(dt) {
    if (this._age < 0) return;
    const { popDuration, holdDuration, fadeOutDuration } = Config.achievements.toast;
    this._age += dt;
    if (this._age >= popDuration + holdDuration + fadeOutDuration) {
      this._age = -1;
      if (this._queue.length > 0) this._advance();
    }
  }

  render(renderer) {
    if (this._age < 0) return;
    const {
      posY, tagFont, tagText, titleFont, subFont, color, glowBlur, tagOffsetY, subOffsetY,
      popDuration, popOvershoot, holdDuration, fadeOutDuration,
    } = Config.achievements.toast;
    const { width: vW } = Config.virtual;
    const t = this._age;
    const holdEnd = popDuration + holdDuration;

    let scale, alpha;
    if (t < popDuration) {
      scale = easeOutBack(t / popDuration, popOvershoot);
      alpha = Math.min(1, t / (popDuration * 0.4));
    } else if (t < holdEnd) {
      scale = 1;
      alpha = 1;
    } else {
      scale = 1;
      alpha = Math.max(0, 1 - (t - holdEnd) / fadeOutDuration);
    }
    if (alpha <= 0.02) return;

    renderer.drawText(tagText, vW / 2, posY + tagOffsetY, {
      font: tagFont, color, alpha: alpha * 0.85, scale,
    });
    renderer.drawText(this._track.title, vW / 2, posY, {
      font: titleFont, color, alpha, glowBlur, scale,
    });
    renderer.drawText(`TIER ${Config.achievements.tierLabels[this._tierIndex]}`, vW / 2, posY + subOffsetY, {
      font: subFont, color, alpha: alpha * 0.85, scale,
    });
  }
}
