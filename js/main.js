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

// IntroScene measures and positions each letter of its label individually
// (for the per-letter fade animation), via canvas `measureText`/`fillText`.
// If Audiowide hasn't finished downloading yet, the browser measures (and
// first paints) with a fallback font, then silently swaps to Audiowide's
// differently-sized glyphs once it arrives — positions computed against one
// font's metrics, painted with another's, reading as overlapping/cramped
// text. Loading the font up front guarantees the metrics are stable and
// correct from the very first frame.
document.fonts.load(Config.intro.font).finally(() => {
  const game = new Game(canvas, stage);
  game.start();
});
