/**
 * Game.js
 * Owns the application lifecycle: responsive sizing and driving the main
 * loop that advances and renders the active scene. Still deliberately
 * contains no gameplay logic of its own (entities, input, physics) — the
 * loop exists only to drive scene animation (e.g. the scrolling backdrop).
 */
import { Config } from './Config.js';
import { Renderer } from './Renderer.js';
import { GameplayScene } from '../scenes/GameplayScene.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} stage  the element whose box defines available space
   */
  constructor(canvas, stage) {
    this.stage = stage;
    this.renderer = new Renderer(canvas);
    this.scene = new GameplayScene(this.renderer);
    this._lastTimestamp = 0;

    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
  }

  /** Wire up listeners, perform the first layout + paint, and start the loop. */
  start() {
    window.addEventListener('resize', this._onResize);
    this._onResize();
    requestAnimationFrame(this._tick);
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
