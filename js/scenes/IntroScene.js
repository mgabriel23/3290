/**
 * IntroScene.js
 * The game's opening prompt: a "swipe up to continue" label — with a
 * small bobbing arrow hinting at the gesture — over the same void
 * backdrop the gameplay scene uses, so the handoff between the two is
 * visually seamless (no background color change to notice).
 *
 * Swiping up dismisses the label with a "typewriter" fade — each letter
 * fading to transparent in sequence, first letter first — before handing
 * off via `onContinue` to whatever scene follows (Prologue → Tutorial →
 * Gameplay). The background music itself is started later, by
 * `Game._startGameplay`, once that chain actually reaches gameplay —
 * still safely inside the original swipe's user-gesture activation
 * window (each scene hands off via a direct synchronous callback from a
 * tap/swipe, never deferred past an animation frame). This scene doesn't
 * start its own copy, since that would leave two independent `Audio`
 * instances playing the same track with no way to stop the first.
 */
import { Config } from '../core/Config.js';

// A simple open chevron "^", authored pointing up in local space and
// centered on the origin — drawn via `strokePaths` as an unclosed path.
const ARROW_CHEVRON = [
  [-10, 6],
  [0, -6],
  [10, 6],
];

export class IntroScene {
  /**
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {{ onContinue: () => void }} options  invoked once the dismiss animation finishes
   */
  constructor(renderer, { onContinue }) {
    this.renderer = renderer;
    this.onContinue = onContinue;

    this._age = 0; // seconds since the scene started — drives the arrow's idle bob

    this._exiting = false;
    this._exitAge = 0; // seconds since the swipe was detected — drives the letter fade-out
    this._chars = this._layoutLabel();
    this._exitDuration = this._computeExitDuration();
  }

  /** Advance the idle bob, or — once dismissing — the letter fade-out countdown. */
  update(dt) {
    this._age += dt;

    if (!this._exiting) return;

    this._exitAge += dt;
    if (this._exitAge >= this._exitDuration) {
      this.onContinue();
    }
  }

  /** Begin the dismiss animation. Fires once per intro. */
  handleSwipeUp() {
    if (this._exiting) return;
    this._exiting = true;
  }

  /** Render one frame: void backdrop, the label (mid-fade once dismissing), and the arrow hint. */
  render() {
    this.renderer.clear(Config.colors.void);
    this._renderLabel();
    if (!this._exiting) this._renderArrow();
  }

  // --- Label layout & typewriter fade-out -----------------------------------

  /**
   * Measure and position each character of the label once up front, so
   * `render` can draw them individually (each with its own fade alpha)
   * while the line as a whole still reads as centered — `Renderer.drawText`
   * has no notion of per-character styling, so the scene lays it out itself.
   */
  _layoutLabel() {
    const { text, font } = Config.intro;
    const { width: vW } = Config.virtual;

    const chars = text.split('');
    let totalWidth = 0;
    const widths = chars.map((char) => {
      const w = this.renderer.measureText(char, font).width;
      totalWidth += w;
      return w;
    });

    let x = vW / 2 - totalWidth / 2;
    return chars.map((char, i) => {
      const entry = { char, x };
      x += widths[i];
      return entry;
    });
  }

  /** Total time for the last letter to finish fading — that's when `onContinue` fires. */
  _computeExitDuration() {
    const { staggerDelay, fadeDuration } = Config.intro.exit;
    return (this._chars.length - 1) * staggerDelay + fadeDuration;
  }

  /**
   * Letter `index`'s current opacity: full while idle; once dismissing,
   * each letter holds at 1 until its turn, then eases to 0 over
   * `fadeDuration` — letters earlier in the string start (and finish)
   * fading first, producing the letter-by-letter "typewriter" dismissal.
   */
  _charAlpha(index) {
    if (!this._exiting) return 1;

    const { staggerDelay, fadeDuration } = Config.intro.exit;
    const t = (this._exitAge - index * staggerDelay) / fadeDuration;
    return 1 - Math.min(Math.max(t, 0), 1);
  }

  _renderLabel() {
    const { font, textColor, bottomMargin } = Config.intro;
    const y = Config.virtual.height - bottomMargin;

    for (let i = 0; i < this._chars.length; i++) {
      const alpha = this._charAlpha(i);
      if (alpha <= 0) continue;

      const { char, x } = this._chars[i];
      this.renderer.drawText(char, x, y, { font, color: textColor, align: 'left', alpha });
    }
  }

  // --- "Swipe up" arrow hint -------------------------------------------------

  /** A small neon chevron above the label, bobbing gently to suggest the swipe direction. */
  _renderArrow() {
    const { color, lineWidth, glowBlur, offsetAboveText, bobAmplitude, bobSpeed } = Config.intro.arrow;
    const { width: vW, height: vH } = Config.virtual;
    const { bottomMargin } = Config.intro;

    const baseY = vH - bottomMargin - offsetAboveText;
    const y = baseY + Math.sin(this._age * bobSpeed) * bobAmplitude;

    this.renderer.strokePaths([{ points: ARROW_CHEVRON, closed: false }], {
      x: vW / 2,
      y,
      color,
      lineWidth,
      glowBlur,
    });
  }
}
