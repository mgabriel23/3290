/**
 * Game.js
 * Owns the application lifecycle: responsive sizing and delegating
 * rendering to the active scene. Deliberately contains no gameplay logic
 * and no update loop yet — the current milestone is a static foundation,
 * so adding a requestAnimationFrame tick now would be speculative.
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

    this._onResize = this._onResize.bind(this);
  }

  /** Wire up listeners and perform the first layout + paint. */
  start() {
    window.addEventListener('resize', this._onResize);
    this._onResize();
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
