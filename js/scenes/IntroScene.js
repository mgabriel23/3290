/**
 * IntroScene.js
 * The game's opening prompt: a static "swipe up to continue" label over
 * the same void backdrop the gameplay scene uses, so the handoff between
 * the two is visually seamless — no background color change to notice.
 *
 * Swiping up starts the background music and immediately hands off to
 * the gameplay scene via `onContinue`. The music is started the instant
 * the gesture is detected: browsers only allow `audio.play()` to proceed
 * without a rejected promise when it's called within a user gesture's
 * "activation" window, so it can't be deferred to some later point.
 */
import { Config } from '../core/Config.js';

export class IntroScene {
  /**
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {{ onContinue: () => void }} options  invoked once the player swipes past the prompt
   */
  constructor(renderer, { onContinue }) {
    this.renderer = renderer;
    this.onContinue = onContinue;
    this._handled = false;
  }

  /** A static prompt — nothing animates, but the scene contract requires this. */
  update() {}

  /** Start the music and hand off to the gameplay scene. Fires once per intro. */
  handleSwipeUp() {
    if (this._handled) return;
    this._handled = true;

    this._playMusic();
    this.onContinue();
  }

  /** Render one frame: void backdrop + the resting "swipe up" label. */
  render() {
    const { text, font, textColor, bottomMargin } = Config.intro;
    const { width, height } = Config.virtual;

    this.renderer.clear(Config.colors.void);
    this.renderer.drawText(text, width / 2, height - bottomMargin, { font, color: textColor });
  }

  // --- Music ---------------------------------------------------------------

  _playMusic() {
    const { themeSrc, themeVolume, themeLoop } = Config.audio;
    const music = new Audio(themeSrc);
    music.loop = themeLoop;
    music.volume = themeVolume;
    music.play().catch(() => {}); // ignore rejection — e.g. if the file is missing during dev
  }
}
