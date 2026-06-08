/**
 * Game.js
 * Owns the application lifecycle: responsive sizing, forwarding input to
 * the active scene, switching between scenes, and driving the main loop
 * that advances and renders whichever scene is current. Still deliberately
 * contains no gameplay logic of its own (entities, physics) — scenes own
 * their content; Game just owns *which* scene is running and feeds it
 * time and gestures.
 */
import { Config } from './Config.js';
import { Renderer } from './Renderer.js';
import { SwipeInput } from './SwipeInput.js';
import { IntroScene } from '../scenes/IntroScene.js';
import { GameplayScene } from '../scenes/GameplayScene.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} stage  the element whose box defines available space
   */
  constructor(canvas, stage) {
    this.stage = stage;
    this.renderer = new Renderer(canvas);
    this.scene = new IntroScene(this.renderer, { onContinue: () => this._startGameplay() });
    this._lastTimestamp = 0;

    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);

    // Forward swipe-up gestures to whichever scene is currently active —
    // only IntroScene reacts to it today, but the lookup is dynamic so
    // this keeps working as `this.scene` is swapped out.
    this.input = new SwipeInput(stage, {
      thresholdPx: Config.intro.swipeThresholdPx,
      onSwipeUp: () => this.scene.handleSwipeUp?.(),
    });
  }

  /** Wire up listeners, perform the first layout + paint, and start the loop. */
  start() {
    window.addEventListener('resize', this._onResize);
    this._onResize();
    requestAnimationFrame(this._tick);
  }

  /** Swap the intro prompt out for the gameplay scene once it's done. */
  _startGameplay() {
    this.scene = new GameplayScene(this.renderer);
  }

  /**
   * The main loop: advance the scene by the elapsed time (in seconds),
   * render it, and schedule the next frame — keeping animation in step
   * with the display's refresh rate.
   * @param {number} timestamp  high-resolution time in ms, supplied by rAF
   */
  _tick(timestamp) {
    const dt = this._lastTimestamp ? (timestamp - this._lastTimestamp) / 1000 : 0;
    this._lastTimestamp = timestamp;

    this.scene.update(dt);
    this.scene.render();

    requestAnimationFrame(this._tick);
  }

  /**
   * Compute the largest rectangle that fits the available space while
   * preserving the virtual aspect ratio (letterboxing). This keeps gameplay
   * dimensions constant, avoids distortion, and prevents stretching on
   * large screens.
   */
  _onResize() {
    const { width: vW, height: vH } = Config.virtual;
    const aspect = vW / vH;

    const availW = this.stage.clientWidth;
    const availH = this.stage.clientHeight;

    let cssW = availW;
    let cssH = cssW / aspect;
    if (cssH > availH) {
      cssH = availH;
      cssW = cssH * aspect;
    }

    this.renderer.resize(cssW, cssH);
    this.scene.render();
  }
}
