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
 * After the entry animation completes the ship becomes controllable:
 * `moveTo(x, y)` repositions it instantly (clamped to the play-area
 * bounds) and is called by the scene on every pointer-move event while
 * the player's finger or mouse button is held. While no pointer is
 * active the ship holds its last position.
 *
 * This is the game's first entity: a plain object with its own
 * `update(dt)` / `render(renderer)`, composed into GameplayScene rather
 * than owning a Renderer or touching anything outside itself.
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';

// Local ship-space outline coordinates (nose toward -Y — "forward", since
// the ship faces up the screen). Only the right half is authored; it's
// mirrored across the centerline below so the silhouette is guaranteed
// symmetric without hand-duplicating points.
const SHIP_HALF_OUTLINE = [
  [0, -24],  // nose tip
  [3, -20],  // nose taper
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
    this._entryDone = false;

    // Target position — the ship snaps here each frame once the entry
    // animation completes; held at last pointer position when no pointer
    // is active.
    this._targetX = vW / 2;
    this._targetY = this._restY;

    // Play-area movement bounds — derived from ship rendered half-extents
    // and the HUD/barrier layout so the ship never overlaps chrome.
    const halfW = (Config.player.width  / 2) * scale; // 16 virtual px
    const halfH = (Config.player.height / 2) * scale; // 20 virtual px
    this._minX = halfW + 4;                            // clear left edge
    this._maxX = vW - halfW - 4;                       // clear right edge
    this._minY = 80;                                   // below HUD value text (~y 64)
    this._maxY = Config.barrier.baseY - Config.barrier.arcHeight - halfH - 10; // above barrier arc

    // Pre-allocated flame triangle — only the tip's y-value changes each
    // frame (mutated in _renderFlame), so no new arrays are created on
    // the hot path.
    this._flame = [[-6, 38], [0, 38], [6, 38]];
  }

  /** True once the entry animation has completed and the ship is controllable. */
  get ready() { return this._entryDone; }

  /**
   * Move the ship to (x, y) in virtual coordinates, clamped to the play area.
   * Silently ignored while the entry animation is still running.
   */
  moveTo(x, y) {
    if (!this._entryDone) return;
    this._targetX = Math.max(this._minX, Math.min(this._maxX, x));
    this._targetY = Math.max(this._minY, Math.min(this._maxY, y));
  }

  /** Advance the entrance animation and thruster flicker by `dt` seconds. */
  update(dt) {
    this._age += dt;

    const { entryDuration } = Config.player;
    const t = Math.min(this._age / entryDuration, 1);

    if (t < 1) {
      // Entry animation — brisk launch, gentle settle.
      const eased = easeOutCubic(t);
      this.y = this._startY + (this._restY - this._startY) * eased;
      // this.x stays at vW/2 from the constructor
    } else {
      if (!this._entryDone) {
        // First frame past entry: lock in starting target so the ship
        // holds its resting position until the player touches the screen.
        this._entryDone = true;
        this._targetX = this.x;
        this._targetY = this.y;
      }
      this.x = this._targetX;
      this.y = this._targetY;
    }
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

    this._flame[1][1] = 38 + length; // mutate tip y in-place — avoids creating a new array each frame

    // Same `scale` as the hull — the flame is authored in ship-local
    // coordinates too, so it must shrink and stay anchored to the tail.
    renderer.strokePaths([{ points: this._flame }], {
      x: this.x,
      y: this.y,
      scale: Config.player.scale,
      color,
      lineWidth,
      glowBlur,
    });
  }
}
