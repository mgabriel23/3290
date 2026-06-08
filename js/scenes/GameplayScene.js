/**
 * GameplayScene.js
 * The gameplay screen foundation.
 *
 * Current milestone: this scene draws the empty battlefield — the void
 * fill and the world border, and nothing more. It is the slot where future
 * gameplay systems (entities, input, physics) will eventually be composed,
 * but no such hooks are stubbed here yet, by design.
 */
import { Config } from '../core/Config.js';

export class GameplayScene {
  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
  }

  /** Render one frame of the (currently empty) battlefield. */
  render() {
    const { colors, virtual, world } = Config;

    this.renderer.clear(colors.void);

    this.renderer.strokeRect(
      world.margin,
      world.margin,
      virtual.width - world.margin * 2,
      virtual.height - world.margin * 2,
      { color: colors.worldBorder, width: world.borderWidth, glow: colors.worldGlow }
    );
  }
}
