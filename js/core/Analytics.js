/**
 * Analytics.js
 * Thin, fail-silent wrapper around the GoatCounter tracking script (loaded
 * in index.html) for firing custom in-game events — e.g. which mode a
 * player picked. GoatCounter's script loads `async`, and ad blockers
 * commonly strip it entirely, so `window.goatcounter` may never exist;
 * every call here is a silent no-op in that case rather than a thrown
 * error, since analytics must never be able to break gameplay.
 */
export function trackEvent(path, title) {
  window.goatcounter?.count?.({ path, title, event: true });
}
