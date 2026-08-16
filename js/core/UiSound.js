/**
 * UiSound.js
 * A single shared "button tapped" blip for every real button across every
 * scene/panel — mode buttons, panel open/close buttons, Shop/Codex buttons,
 * HUD icons, mission-select tiles, revive/restart, and so on. Centralized
 * here (one lazily-constructed AudioPool, one `playButtonClick()` export)
 * rather than each button's owning class constructing its own pool, since
 * buttons are scattered across a dozen otherwise-unrelated files that would
 * otherwise all duplicate the same `new AudioPool(Config.ui.click...)` line
 * — same "import and call independently" shape AudioSettings.js uses for
 * mute/volume, for the same reason.
 *
 * Deliberately NOT called for full-screen "tap anywhere to continue"
 * dismissals (tutorial hints, the daily-reward popup's backdrop) — those
 * aren't discrete buttons, see Config.ui's own doc.
 */
import { Config } from './Config.js';
import { AudioPool } from './AudioPool.js';

let _pool = null;

export function playButtonClick() {
  if (!_pool) _pool = new AudioPool(Config.ui.click.audioSrc, 8, Config.ui.click.volume);
  _pool.play();
}
