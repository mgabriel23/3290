/**
 * Share.js
 * The Game Over screen's SHARE SCORE button — tries the native Web Share
 * API first (the real "send this somewhere" sheet on mobile), and falls
 * back to copying the same text to the clipboard on browsers/desktops that
 * don't have it. Text-only, no URL — this game has no public deployed
 * address to attach one to.
 *
 * Every step is optional browser API surface (like AudioPool's Web Audio
 * calls), so this is wrapped the same way: a failure here — including the
 * player just cancelling the native share sheet, which rejects with an
 * AbortError — must never throw back into the caller.
 */

/**
 * @param {string} text
 * @returns {Promise<'shared'|'copied'|'failed'>}
 */
export async function shareScore(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch {
      return 'failed'; // includes the player cancelling the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
