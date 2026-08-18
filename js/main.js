/**
 * main.js
 * Composition root. The single place where concrete dependencies are
 * resolved and wired together, then handed to the Game. Nothing else
 * imports the DOM directly.
 */
import { Config } from './core/Config.js';
import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const stage = document.getElementById('game-stage');
const srStatus = document.getElementById('sr-status');

// The only DOM write Game ever needs for screen-reader support — passed in
// as a plain callback so Game.js itself never touches `document` (see this
// file's own doc: main.js is the only place that does).
function announce(text) {
  srStatus.textContent = text;
}

// IntroScene measures and positions each letter of its label individually
// (for the per-letter fade animation), via canvas `measureText`/`fillText`.
// If Audiowide hasn't finished downloading yet, the browser measures (and
// first paints) with a fallback font, then silently swaps to Audiowide's
// differently-sized glyphs once it arrives — positions computed against one
// font's metrics, painted with another's, reading as overlapping/cramped
// text. Loading the font up front guarantees the metrics are stable and
// correct from the very first frame.
document.fonts.load(Config.intro.font).finally(() => {
  const game = new Game(canvas, stage, { announce });

  window.addEventListener('resize', () => game.resize());
  // `window.resize` alone isn't reliable on mobile: the address bar/toolbar
  // showing or hiding changes the actual visible viewport (which is exactly
  // what the CSS `dvh` unit tracks live), but doesn't always fire a plain
  // `resize` event to tell the canvas to re-fit — leaving it stale-sized
  // relative to a `.app` box that's already resized itself via CSS.
  // `visualViewport`'s own `resize` event is the modern, purpose-built
  // signal for this exact case; feature-detected since older browsers lack it.
  window.visualViewport?.addEventListener('resize', () => game.resize());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) game.resumeFromBackground();
  });

  game.start();
});
