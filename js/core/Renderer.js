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

  /**
   * Convert viewport-relative client coordinates (CSS px — what pointer
   * events report) into virtual coordinates — the inverse of the mapping
   * `resize` establishes. Lets gesture-detecting input systems report
   * positions that scenes can hit-test directly against their own
   * virtual-space layout (e.g. an on-canvas button's bounds), without
   * each one re-deriving the canvas's on-screen geometry itself.
   * @param {number} clientX @param {number} clientY
   * @returns {{x: number, y: number}}
   */
  toVirtualCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const { width: vW, height: vH } = Config.virtual;
    return {
      x: ((clientX - rect.left) / rect.width) * vW,
      y: ((clientY - rect.top) / rect.height) * vH,
    };
  }

  /**
   * Clear the whole virtual surface to a solid color. `alpha` (0–1)
   * optionally makes the fill translucent rather than opaque — the
   * cheap way to lay a fade-to-black overlay on top of whatever was
   * drawn earlier in the frame, without a dedicated overlay primitive
   * (just call `clear` again, after the scene's normal drawing, with
   * the void color and a rising alpha).
   * @param {string} color @param {number} [alpha]
   */
  clear(color, alpha = 1) {
    const { ctx } = this;
    const { width, height } = Config.virtual;
    ctx.fillStyle = color;
    if (alpha >= 1) {
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = previousAlpha;
  }

  /**
   * Blit a pre-rendered image (e.g. an off-screen canvas tile) at a
   * position in virtual coordinates — the cheap way to draw static
   * content baked once and reused every frame (e.g. starfield layers).
   * `alpha` (0–1) optionally fades the blit, e.g. for fade-in transitions;
   * omitting it (the common case) skips touching `globalAlpha` entirely.
   * @param {CanvasImageSource} image @param {number} x @param {number} y @param {number} [alpha]
   */
  drawImage(image, x, y, alpha = 1) {
    const { ctx } = this;
    if (alpha >= 1) {
      ctx.drawImage(image, x, y);
      return;
    }
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, x, y);
    ctx.globalAlpha = previousAlpha;
  }

  /**
   * Draw a line of text in virtual coordinates — for simple UI labels
   * (prompts, menus). Alignment/baseline default to centring on `(x, y)`
   * so callers can position labels without measuring text themselves.
   * `alpha` (0–1) optionally fades the glyph, e.g. for letter-by-letter
   * reveal/dismiss effects — same opt-in convention as `drawImage`.
   * @param {string} text @param {number} x @param {number} y
   * @param {{font: string, color: string, align?: CanvasTextAlign, baseline?: CanvasTextBaseline, alpha?: number}} style
   */
  drawText(text, x, y, { font, color, align = 'center', baseline = 'middle', alpha = 1 }) {
    const { ctx } = this;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (alpha >= 1) {
      ctx.fillText(text, x, y);
      return;
    }
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = previousAlpha;
  }

  /**
   * Measure how wide `text` would render in `font`, in virtual px.
   * Lets scenes lay out custom text themselves (e.g. positioning each
   * character of a label individually for a per-letter animation)
   * without ever reaching for the raw canvas context.
   * @param {string} text @param {string} font
   * @returns {{ width: number }}
   */
  measureText(text, font) {
    const { ctx } = this;
    ctx.font = font;
    return { width: ctx.measureText(text).width };
  }

  /**
   * Stroke one or more hand-authored vector paths — each an array of
   * `[x, y]` points in a shape's own local space — translated as a
   * group to a world position, with an optional neon-style glow (a
   * soft colored halo behind the line). This is the primitive for
   * outline-only "wireframe" shapes (ships, debris, UI iconography)
   * that are drawn as strokes rather than filled sprites.
   * `rotation` (radians) spins the group about its local origin —
   * applied between translate and scale in the transform stack, so a
   * shape authored around `[0, 0]` rotates in place. `alpha` (0–1)
   * fades the whole group, e.g. for an "appearing" wireframe — same
   * opt-in convention as `drawImage`/`drawText`.
   * @param {Array<{points: Array<[number, number]>, closed?: boolean}>} paths
   * @param {{x?: number, y?: number, scale?: number, rotation?: number, alpha?: number, color: string, lineWidth: number, glowColor?: string, glowBlur?: number}} style
   */
  strokePaths(paths, { x = 0, y = 0, scale = 1, rotation = 0, alpha = 1, color, lineWidth, glowColor, glowBlur = 0 }) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    if (scale !== 1) ctx.scale(scale, scale);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    // Counter-scale so `lineWidth` always reads as that many virtual px,
    // regardless of how the shape itself is scaled (the scale transform
    // would otherwise thin out the stroke along with the geometry).
    ctx.lineWidth = scale !== 1 ? lineWidth / scale : lineWidth;
    if (glowBlur > 0) {
      ctx.shadowColor = glowColor ?? color;
      ctx.shadowBlur = glowBlur;
    }

    for (const { points, closed = true } of paths) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      if (closed) ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }

}
