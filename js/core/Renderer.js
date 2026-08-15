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
   * device pixel ratio (capped — see Config.performance.maxDevicePixelRatio),
   * then derive a single scale factor that maps the fixed virtual resolution
   * onto the backing store. Keeps everything sharp and lets all subsequent
   * draw calls use virtual coordinates.
   * @param {number} cssWidth  displayed width in CSS px
   * @param {number} cssHeight displayed height in CSS px
   */
  resize(cssWidth, cssHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, Config.performance.maxDevicePixelRatio);
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    // Map the virtual resolution onto the backing store uniformly.
    this.scale = (cssWidth * dpr) / Config.virtual.width;
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
  }

  /**
   * Re-establish the canvas transform as the base virtual→backing-store
   * scale plus a translation, in virtual px — the seam a scene uses for
   * camera/screen shake (see core/ScreenShake.js). Cheap (one setTransform
   * call), so it's fine to call every frame regardless of whether a shake
   * is actually active — pass (0, 0) to draw undisplaced, e.g. to reset
   * before a UI layer that should never shake with the world.
   * @param {number} [dx] @param {number} [dy]
   */
  setCameraOffset(dx = 0, dy = 0) {
    this.ctx.setTransform(this.scale, 0, 0, this.scale, dx * this.scale, dy * this.scale);
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
   * reveal/dismiss effects — same opt-in convention as `drawImage`. `scale`
   * (default 1) grows/shrinks the glyph about `(x, y)` — the seam a
   * celebratory "pop" text effect (e.g. entities/ComboBanner.js) scales
   * into view through, without needing its own transform handling.
   * @param {string} text @param {number} x @param {number} y
   * @param {{font: string, color: string, align?: CanvasTextAlign, baseline?: CanvasTextBaseline, alpha?: number, scale?: number}} style
   */
  drawText(text, x, y, { font, color, align = 'center', baseline = 'middle', alpha = 1, glowBlur = 0, glowColor, scale = 1 }) {
    const { ctx } = this;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (alpha >= 1 && glowBlur === 0 && scale === 1) {
      ctx.fillText(text, x, y);
      return;
    }
    ctx.save();
    if (scale !== 1) {
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      x = 0; y = 0;
    }
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (glowBlur > 0) {
      ctx.shadowColor = glowColor ?? color;
      ctx.shadowBlur = this._glow(glowBlur);
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Scales an authored `glowBlur` radius by `Config.performance.glowScale`
   * — the one seam every `ctx.shadowBlur` assignment routes through, so
   * shadow-blur cost (Canvas 2D's most expensive per-pixel operation,
   * especially on WebKit/Safari) can be tuned globally without touching
   * the individual glow values authored throughout the rest of Config.
   * @param {number} glowBlur
   * @returns {number}
   */
  _glow(glowBlur) {
    return glowBlur * Config.performance.glowScale;
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
   * Stroke one or more hand-authored vector paths in a single call.
   *
   * @param {Array<{points: Array<[number, number]>, closed?: boolean}>} paths
   * @param {{x?: number, y?: number, scale?: number, rotation?: number, alpha?: number,
   *          color: string, lineWidth: number, glowColor?: string, glowBlur?: number,
   *          lineCap?: CanvasLineCap, lineDash?: number[], singleStroke?: boolean}} style
   * @param {number} [count]  how many entries in `paths` to draw; defaults to
   *   `paths.length`. Pass a smaller value to use only a leading slice of a
   *   pre-allocated pool without slicing the array (zero allocation).
   *   `singleStroke: true` draws all sub-paths with one `ctx.stroke()` call so
   *   the shadow-blur GPU pass runs once total — use for large same-style batches.
   *   `lineDash` (e.g. `[10, 8]`) draws a dashed rather than solid line — the
   *   canvas dash state lives in the save/restore pair below, so it never
   *   leaks into unrelated draw calls. Omit for a solid line (the common case).
   */
  strokePaths(paths, { x = 0, y = 0, scale = 1, rotation = 0, alpha = 1, color, lineWidth, glowColor, glowBlur = 0, lineCap = 'butt', lineDash, singleStroke = false }, count = paths.length) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    if (scale !== 1) ctx.scale(scale, scale);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    // Counter-scale so `lineWidth` stays constant in virtual px regardless of
    // how the shape itself is scaled.
    ctx.lineWidth = scale !== 1 ? lineWidth / scale : lineWidth;
    if (lineCap !== 'butt') ctx.lineCap = lineCap;
    if (lineDash) ctx.setLineDash(lineDash);
    if (glowBlur > 0) {
      ctx.shadowColor = glowColor ?? color;
      ctx.shadowBlur = this._glow(glowBlur);
    }

    if (singleStroke) {
      // One beginPath/stroke for every sub-path → one shadow-blur GPU pass total.
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const path = paths[i];
        const pts  = path.points;
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        if (path.closed !== false) ctx.closePath();
      }
      ctx.stroke();
    } else {
      for (let i = 0; i < count; i++) {
        const path = paths[i];
        const pts  = path.points;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        if (path.closed !== false) ctx.closePath();
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Fill AND stroke closed polygons in one transformed pass.
   *
   * `singleStroke: true` — the key batching optimisation for same-style shapes
   * (e.g. all enemy hulls in a frame). Fills each polygon individually (fill
   * needs no shadow, so no GPU pass), then builds all outlines into ONE compound
   * path and calls `stroke()` once — a single GPU shadow-blur pass regardless of
   * how many polygons are in the batch. Points must already be in the coordinate
   * space set by `{x, y, rotation}` (pass world-space points with defaults to
   * draw pre-transformed geometry without an additional translate/rotate).
   *
   * `singleStroke: false` (default) — original per-path fill+stroke behaviour,
   * each with its own shadow pass. Use when paths need different styles.
   *
   * @param {Array<{points: Array<[number,number]>, closed?: boolean}>} paths
   * @param {{x?:number,y?:number,rotation?:number,alpha?:number,
   *          fillColor:string, strokeColor:string, lineWidth:number,
   *          glowColor?:string, glowBlur?:number, singleStroke?:boolean}} style
   * @param {number} [count]
   */
  fillStrokePaths(paths, { x = 0, y = 0, rotation = 0, alpha = 1,
                            fillColor, strokeColor, lineWidth,
                            glowColor, glowBlur = 0, singleStroke = false }, count = paths.length) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.fillStyle   = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = lineWidth;

    if (singleStroke) {
      // Phase 1: fill each polygon — no shadow needed, cheap
      ctx.shadowBlur = 0;
      for (let i = 0; i < count; i++) {
        const pts = paths[i].points;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        if (paths[i].closed !== false) ctx.closePath();
        ctx.fill();
      }
      // Phase 2: build compound path for all outlines, stroke once — 1 GPU shadow pass total
      if (glowBlur > 0) {
        ctx.shadowColor = glowColor ?? strokeColor;
        ctx.shadowBlur  = this._glow(glowBlur);
      }
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const pts = paths[i].points;
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        if (paths[i].closed !== false) ctx.closePath();
      }
      ctx.stroke();
    } else {
      if (glowBlur > 0) {
        ctx.shadowColor = glowColor ?? strokeColor;
        ctx.shadowBlur  = this._glow(glowBlur);
      }
      for (let i = 0; i < count; i++) {
        const pts = paths[i].points;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        if (paths[i].closed !== false) ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Fill an ellipse whose centre is at `(localCx, localCy)` in the local
   * space defined by `{x, y, rotation}`. Used for engine core orbs that
   * live at a fixed offset inside a rotating ship.
   * @param {number} localCx @param {number} localCy
   * @param {number} rx @param {number} ry
   * @param {{x?:number, y?:number, rotation?:number, fillColor:string, alpha?:number}} style
   */
  fillEllipse(localCx, localCy, rx, ry, { x = 0, y = 0, rotation = 0, fillColor, alpha = 1 }) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.fillStyle  = fillColor;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(localCx, localCy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Stroke a full circle in virtual coordinates — the expanding-ring primitive
   * for explosion shockwave effects. `ctx.arc` is natively GPU-accelerated and
   * produces a smoother curve than a polyline approximation.
   * @param {number} x @param {number} y @param {number} radius
   * @param {{color:string, lineWidth:number, glowBlur?:number, glowColor?:string, alpha?:number}} style
   */
  strokeCircle(x, y, radius, { color, lineWidth, glowBlur = 0, glowColor, alpha = 1 }) {
    if (radius <= 0) return;
    const { ctx } = this;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    if (glowBlur > 0) {
      ctx.shadowColor = glowColor ?? color;
      ctx.shadowBlur  = this._glow(glowBlur);
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw a gradient engine-exhaust flame triangle with additive (`lighter`)
   * compositing. The flame base sits at `(localBaseX, localBaseY)` in the
   * ship's local space and extends `length` virtual px in the local −y
   * direction (i.e. "upward" in local space — engine exhaust trails away
   * from the direction of thrust regardless of world rotation).
   * @param {number} localBaseX @param {number} localBaseY @param {number} length
   * @param {{x?:number, y?:number, rotation?:number, halfWidth?:number,
   *          color:string, alpha?:number}} style
   */
  drawFlame(localBaseX, localBaseY, length, { x = 0, y = 0, rotation = 0, halfWidth = 4, color, alpha = 1 }) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';

    // Cache hex → solid rgba string per unique color — avoids per-frame parseInt
    // and createLinearGradient allocations (8 enemies × 60fps = 480 GC objects/sec avoided).
    // At this scale the solid fill is visually indistinguishable from a gradient.
    if (!this._rgbaCache) this._rgbaCache = new Map();
    let rgba = this._rgbaCache.get(color);
    if (!rgba) {
      const h = color.replace('#', '');
      rgba = `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},0.70)`;
      this._rgbaCache.set(color, rgba);
    }
    ctx.fillStyle = rgba;
    const tipY = localBaseY - length;
    ctx.beginPath();
    ctx.moveTo(localBaseX - halfWidth, localBaseY);
    ctx.lineTo(localBaseX + halfWidth, localBaseY);
    ctx.lineTo(localBaseX, tipY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

}
