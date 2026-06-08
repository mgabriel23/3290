/**
 * Portal.js
 * A wireframe vortex — a "tear in the sky": identical spiral arms fanned
 * evenly around a small counter-spinning faceted core, the whole
 * assembly easing into view (growing and fading in together) and then
 * spinning in place. Used exclusively by PrologueScene's "portals" beat
 * to stage the unexplained tears the commander's briefing describes; a
 * purely cinematic prop that never interacts with anything else.
 *
 * The spiral silhouette is what makes it read as a portal/wormhole
 * rather than a shield or HUD reticle — concentric rings (an earlier
 * pass at this) just look like targeting graphics; arms curling toward
 * a center read immediately as something pulling inward. One arm shape
 * is precomputed once into SPIRAL_ARM (the usual bake-once pattern,
 * since its points in local space never change) and then re-stroked at
 * `armCount` evenly fanned rotations every frame — so the swirl is
 * built from a single baked curve, not `armCount` separate ones. The
 * small core polygon (CORE_SHAPE, the same faceted-ring technique as
 * before) anchors the center and spins counter to the arms, the better
 * to sell "alien machinery" over "natural phenomenon".
 *
 * `delay` staggers when an instance starts its own appear animation,
 * letting PrologueScene stand up several portals that burst into view
 * one after another rather than all at once.
 */
import { Config } from '../core/Config.js';

const { spiral, core } = Config.prologue.portals;

const SPIRAL_ARM = buildSpiralArm(spiral);
const CORE_SHAPE = buildPolygon(core.sides, core.radius);

/**
 * One arm's curve in local space: a polyline winding outward from
 * `innerRadius` to `outerRadius` over `turns` revolutions. Multiple
 * copies of this same shape, fanned at evenly-spaced rotations, are
 * what produce the whirlpool/galaxy silhouette.
 */
function buildSpiralArm({ innerRadius, outerRadius, turns, segments }) {
  const sweep = turns * Math.PI * 2;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * sweep - Math.PI / 2; // start pointing "up", like the polygons below
    const radius = innerRadius + t * (outerRadius - innerRadius);
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

/** A regular polygon's vertices in local space, starting at the top and going clockwise. */
function buildPolygon(sides, radius) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

export class Portal {
  /**
   * @param {{x: number, y: number, delay?: number}} options  position in
   *   virtual coordinates, plus a delay (seconds) before this instance
   *   starts its own appear animation
   */
  constructor({ x, y, delay = 0 }) {
    this.x = x;
    this.y = y;
    this.delay = delay;
    this._age = 0;
  }

  update(dt) {
    this._age += dt;
  }

  /** Nothing to draw until this instance's own delay has elapsed. */
  render(renderer) {
    const elapsed = this._age - this.delay;
    if (elapsed <= 0) return;

    const { appearDuration, color, glowColor, lineWidth, glowBlur } = Config.prologue.portals;
    const appearT = Math.min(elapsed / appearDuration, 1);
    const eased = 1 - (1 - appearT) ** 3; // ease-out cubic — fast start, soft settle

    const shared = {
      x: this.x,
      y: this.y,
      scale: 0.5 + eased * 0.5, // grows from half-size up to full as it "tears open"
      alpha: eased,
      color,
      glowColor,
      lineWidth,
      glowBlur,
    };

    this._renderArms(renderer, elapsed, shared);
    renderer.strokePaths([{ points: CORE_SHAPE }], { ...shared, rotation: elapsed * core.rotationSpeed });
  }

  /** Fan `armCount` copies of the same baked curve evenly around the center, all spinning together as one swirl. */
  _renderArms(renderer, elapsed, shared) {
    const { armCount, rotationSpeed } = spiral;
    const spin = elapsed * rotationSpeed;

    for (let i = 0; i < armCount; i++) {
      const fanOffset = (i / armCount) * Math.PI * 2;
      renderer.strokePaths([{ points: SPIRAL_ARM, closed: false }], { ...shared, rotation: spin + fanOffset });
    }
  }
}
