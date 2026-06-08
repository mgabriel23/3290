/**
 * Player.js
 * The player's ship: a neon-outline sci-fi fighter silhouette, drawn as
 * a handful of stroked vector paths with a glow — a "wireframe HUD"
 * look (strokes only, deliberately no fills).
 *
 * On creation it sits off-screen below the play area; `update` eases it
 * up into its resting position over `Config.player.entryDuration` (an
 * ease-out "launching into the scene" arrival, timed to start the
 * moment the gameplay scene does — alongside the starfield's fade-in).
 * Its thruster flame flickers continuously beneath it the whole time,
 * including during the entrance, since the ship is always under power.
 *
 * This is the game's first entity: a plain object with its own
 * `update(dt)` / `render(renderer)`, composed into GameplayScene rather
 * than owning a Renderer or touching anything outside itself.
 */
import { Config } from '../core/Config.js';

// Local ship-space outline coordinates (nose toward -Y — "forward", since
// the ship faces up the screen). Only the right half is authored; it's
// mirrored across the centerline below so the silhouette is guaranteed
// symmetric without hand-duplicating points.
const SHIP_HALF_OUTLINE = [
  [0, -40],  // nose tip
  [4, -30],  // nose taper
  [5, -14],  // cockpit-side fuselage
  [9, -6],   // wing root, leading edge
  [32, 12],  // wingtip (swept back)
  [15, 16],  // wing trailing edge
  [9, 24],   // aft fuselage
  [18, 36],  // tail fin tip
  [8, 33],   // tail fin trailing edge
  [4, 40],   // engine nacelle outer corner
  [0, 38],   // tail centerline notch
];

const SHIP_OUTLINE = mirrorAcrossCenterline(SHIP_HALF_OUTLINE);

const CANOPY = [
  [0, -28],
  [4, -20],
  [0, -12],
  [-4, -20],
];

const SPINE = [
  [0, -12],
  [0, 30],
];

/** Mirror every point but the first/last (which sit on the x=0 centerline). */
function mirrorAcrossCenterline(halfOutline) {
  const mirrored = halfOutline
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y]);
  return [...halfOutline, ...mirrored];
}

export class Player {
  constructor() {
    const { width: vW, height: vH } = Config.virtual;
    const { height, scale, restingYRatio } = Config.player;

    this.x = vW / 2;
    this._restY = vH * restingYRatio;
    this._startY = vH + height * scale; // fully below the visible area, at its rendered size
    this.y = this._startY;
    this._age = 0;
  }

  /** Advance the entrance animation and thruster flicker by `dt` seconds. */
  update(dt) {
    this._age += dt;

    const { entryDuration } = Config.player;
    const t = Math.min(this._age / entryDuration, 1);
    const eased = 1 - (1 - t) ** 3; // ease-out cubic: brisk launch, gentle settle
    this.y = this._startY + (this._restY - this._startY) * eased;
  }

  /** Draw the thruster flame, then the ship's neon wireframe on top of it. */
  render(renderer) {
    const { color, lineWidth, glowBlur, scale } = Config.player;

    this._renderFlame(renderer);

    renderer.strokePaths(
      [
        { points: SHIP_OUTLINE },
        { points: CANOPY },
        { points: SPINE, closed: false },
      ],
      { x: this.x, y: this.y, scale, color, lineWidth, glowBlur }
    );
  }

  // --- Thruster flame -------------------------------------------------------

  /**
   * The flame's length oscillates as the sum of two sine waves at
   * different speeds/amplitudes — a cheap, deterministic stand-in for
   * organic flicker (no per-frame randomness, so it's smooth and the
   * animation is reproducible).
   */
  _renderFlame(renderer) {
    const { color, lineWidth, glowBlur, baseLength, flickerAmplitudes, flickerSpeeds } =
      Config.player.flame;

    const flicker =
      Math.sin(this._age * flickerSpeeds[0]) * flickerAmplitudes[0] +
      Math.sin(this._age * flickerSpeeds[1]) * flickerAmplitudes[1];
    const length = Math.max(baseLength + flicker, 4);

    const flame = [
      [-6, 38],
      [0, 38 + length],
      [6, 38],
    ];

    // Same `scale` as the hull — the flame is authored in ship-local
    // coordinates too, so it must shrink and stay anchored to the tail.
    renderer.strokePaths([{ points: flame }], {
      x: this.x,
      y: this.y,
      scale: Config.player.scale,
      color,
      lineWidth,
      glowBlur,
    });
  }
}
