/**
 * Renderer.js
 * Abstraction layer over the drawing backend.
 *
 * This is the seam that lets the rendering technology change later
 * (WebGL, PixiJS, Three.js) without rewriting game systems. Scenes
 * never touch the raw canvas context — they call this small, intentional
 * surface of primitive operations. A future GPU renderer just needs to
 * implement the same method contract.
 *
 * Responsibilities (current milestone):
 *  - Own the HTMLCanvasElement and its 2D context.
 *  - Manage device-pixel-ratio backing-store sizing for crisp output.
 *  - Expose primitive draw operations in VIRTUAL coordinates.
 */
import { Config } from './Config.js';

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1; // virtual-unit -> backing-pixel scale factor
  }

  /**
   * Size the canvas backing store to the displayed size multiplied by the
   * device pixel ratio, then derive a single scale factor that maps the
   * fixed virtual resolution onto the backing store. Keeps everything sharp
   * and lets all subsequent draw calls use virtual coordinates.
   * @param {number} cssWidth  displayed width in CSS px
   * @param {number} cssHeight displayed height in CSS px
   */
  resize(cssWidth, cssHeight) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    // Map the virtual resolution onto the backing store uniformly.
    this.scale = (cssWidth * dpr) / Config.virtual.width;
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
  }

  /** Clear the whole virtual surface to a solid color. */
  clear(color) {
    const { width, height } = Config.virtual;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, width, height);
  }

  /**
   * Fill a small circle in virtual coordinates — for point-like sprites
   * such as background stars.
   * @param {number} x @param {number} y @param {number} radius @param {string} color
   */
  fillCircle(x, y, radius, color) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

}
