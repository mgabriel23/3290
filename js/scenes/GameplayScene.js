/**
 * GameplayScene.js
 * The gameplay screen foundation.
 *
 * Current milestone: an animated backdrop — a drifting starfield that
 * loops seamlessly downward — behind an otherwise empty stage. It is the
 * slot where future gameplay systems (entities, input, physics) will
 * eventually be composed, but no such hooks are stubbed here yet, by design.
 */
import { Config } from '../core/Config.js';

export class GameplayScene {
  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.stars = this._createStars();
  }

  /** Advance the backdrop by `dt` seconds. */
  update(dt) {
    this._updateStars(dt);
  }

  /** Render one frame: void backdrop + starfield. */
  render() {
    this.renderer.clear(Config.colors.void);
    this._drawStars();
  }

  // --- Starfield ----------------------------------------------------------

  _createStars() {
    const { width, height } = Config.virtual;
    const { count, radiusMin, radiusMax, speedMin, speedMax } = Config.starfield;
    return Array.from({ length: count }, () => {
      // A shared "depth" ties size to speed: bigger stars drift faster,
      // reading as closer to the viewer — a simple parallax illusion.
      const depth = Math.random();
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        radius: radiusMin + depth * (radiusMax - radiusMin),
        speed: speedMin + depth * (speedMax - speedMin),
      };
    });
  }

  _updateStars(dt) {
    const { height } = Config.virtual;
    for (const star of this.stars) {
      star.y += star.speed * dt;
      if (star.y > height) star.y -= height; // wrap for a seamless vertical loop
    }
  }

  _drawStars() {
    const { color } = Config.starfield;
    for (const star of this.stars) {
      this.renderer.fillCircle(star.x, star.y, star.radius, color);
    }
  }
}
