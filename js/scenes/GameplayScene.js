/**
 * GameplayScene.js
 * The gameplay screen foundation.
 *
 * Current milestone: this scene draws the empty void backdrop and nothing
 * more. It is the slot where future gameplay systems (entities, input,
 * physics) will eventually be composed, but no such hooks are stubbed
 * here yet, by design.
 */
import { Config } from '../core/Config.js';

export class GameplayScene {
  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
  }

  /** Render one frame of the (currently empty) scene. */
  render() {
    this.renderer.clear(Config.colors.void);
  }
}
