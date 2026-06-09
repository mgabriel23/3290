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
 * is precomputed once into SPIRAL_ARM and then re-stroked at `armCount`
 * evenly fanned rotations every frame — so the swirl is built from a
 * single baked curve, not `armCount` separate ones.
 *
 * Performance: all geometry (arms + core) is batched into ONE
 * `strokePaths` call per portal per frame. Canvas shadow-blur is the
 * most expensive 2D operation on low-end GPU drivers — it fires a full
 * blur-filter pass over every drawn pixel — so going from 5 calls
 * (4 arms + 1 core, each setting shadowBlur separately) to 1 is the
 * single largest frame-time saving available. The per-arm rotation is
 * applied by mutating a pre-allocated `this._paths` buffer in-place
 * (see `_rotatePaths`) — zero per-frame allocations once constructed,
 * so no GC pressure during the render loop regardless of how long the
 * portals stay on screen.
 */
import { Config } from '../core/Config.js';

const { spiral, core } = Config.prologue.portals;

const SPIRAL_ARM = buildSpiralArm(spiral);
const CORE_SHAPE = buildPolygon(core.sides, core.radius);

/**
 * One arm's curve in local space: a polyline winding outward from
 * `innerRadius` to `outerRadius` over `turns` revolutions.
 */
function buildSpiralArm({ innerRadius, outerRadius, turns, segments }) {
  const sweep = turns * Math.PI * 2;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * sweep - Math.PI / 2;
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

    // Pre-allocated paths buffer — one slot per arm + one for the core.
    // _rotatePaths writes the rotated point coordinates into these arrays
    // every frame (in-place mutation) so strokePaths can read them without
    // any new allocation on the hot path.
    this._paths = [];
    for (let i = 0; i < spiral.armCount; i++) {
      this._paths.push({ points: SPIRAL_ARM.map(([px, py]) => [px, py]), closed: false });
    }
    this._paths.push({ points: CORE_SHAPE.map(([px, py]) => [px, py]) }); // closed: true (default)
  }

  update(dt) {
    this._age += dt;
  }

  /** Nothing to draw until this instance's own delay has elapsed. */
  render(renderer) {
    const elapsed = this._age - this.delay;
    if (elapsed <= 0) return;

    const { appearDuration, color, lineWidth, glowBlur } = Config.prologue.portals;
    const appearT = Math.min(elapsed / appearDuration, 1);
    const eased = 1 - (1 - appearT) ** 3; // ease-out cubic

    // Rotate all geometry in JS then hand the whole portal to strokePaths
    // as one call — one shadow-blur pass instead of (armCount + 1).
    this._rotatePaths(elapsed);

    renderer.strokePaths(this._paths, {
      x: this.x,
      y: this.y,
      scale: 0.5 + eased * 0.5,
      alpha: eased,
      color,
      lineWidth,
      glowBlur,
    });
  }

  /**
   * Write rotated coordinates directly into `this._paths[i].points[j]`
   * — reuses the same arrays every frame (no allocation). The rotation
   * math is cheap float arithmetic; doing it in JS so the GPU sees only
   * a single shadow-blur stroke rather than one per arm.
   */
  _rotatePaths(elapsed) {
    const spin = elapsed * spiral.rotationSpeed;

    for (let i = 0; i < spiral.armCount; i++) {
      const angle = spin + (i / spiral.armCount) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const pts = this._paths[i].points;
      for (let j = 0; j < SPIRAL_ARM.length; j++) {
        const px = SPIRAL_ARM[j][0];
        const py = SPIRAL_ARM[j][1];
        pts[j][0] = px * cosA - py * sinA;
        pts[j][1] = px * sinA + py * cosA;
      }
    }

    const coreAngle = elapsed * core.rotationSpeed;
    const cosC = Math.cos(coreAngle);
    const sinC = Math.sin(coreAngle);
    const corePts = this._paths[spiral.armCount].points;
    for (let j = 0; j < CORE_SHAPE.length; j++) {
      const px = CORE_SHAPE[j][0];
      const py = CORE_SHAPE[j][1];
      corePts[j][0] = px * cosC - py * sinC;
      corePts[j][1] = px * sinC + py * cosC;
    }
  }
}
