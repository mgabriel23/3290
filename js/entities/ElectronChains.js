/**
 * ElectronChains.js
 * Electron boss's phase-2 attack (see ElectronBoss.js) — a bolt of TWO
 * linked spark-orbs, `chain.spacing` apart (offset perpendicular to the
 * bolt's own travel direction, so the pair always reads as "wide" head-on
 * regardless of which way it's aimed), launched from the boss's OWN current
 * position straight at the player's position at the instant it's fired (no
 * re-aiming after launch, same idiom as Nova's seed/Phoenix's fireball).
 * Contact with either orb OR the connecting link between them damages the
 * player and consumes the whole bolt — a real projectile, not a persistent
 * hazard — same swap-remove-on-hit shape as every other boss bullet pool's
 * own `checkHit`, just testing a line segment instead of a circle since the
 * link itself is a hit surface too.
 *
 * Reuses BossBulletPool.js's typed-array position/velocity storage and
 * generic advance/cull (`initBossBulletPool`/`fireBossBullet`/
 * `updateBossBullets` — a bolt is still just one point translating in a
 * straight line as far as THAT machinery cares) but swaps in its own
 * jittered-polyline path pool right after (BossBulletPool's default 2-point
 * capsule paths don't fit the "redraw the link every frame with a fresh
 * random crackle" look this attack wants) and writes its own render/checkHit
 * instead of the shared capsule ones — the same "shared advance/cull,
 * bespoke collide/render" split ZigzagBullets.js's wall-bounce layer already
 * uses on top of this same file.
 */
import { Config } from '../core/Config.js';
import { distanceToSegment } from '../core/vectorMath.js';
import { initBossBulletPool, fireBossBullet, updateBossBullets } from './BossBulletPool.js';

const CFG = Config.boss.electron.chain;
const MAX = CFG.poolSize;
const HALF_SPACING = CFG.spacing / 2;
// Intermediate points jittered every frame between the two orbs — see
// render()'s own doc. 3 gives a convincing "kinked lightning bolt" without
// being expensive (this pool is tiny, never more than a handful active).
const JITTER_STEPS = 3;

export class ElectronChains {
  constructor() {
    const { color, lineWidth, glowBlur } = CFG;
    initBossBulletPool(this, MAX, { color, lineWidth, glowBlur, lineCap: 'round', singleStroke: true });
    // Overwrite BossBulletPool's 2-point capsule paths with a jittered
    // multi-point polyline per bolt — see class doc.
    this._pool = Array.from({ length: MAX }, () => ({
      points: Array.from({ length: JITTER_STEPS + 2 }, () => [0, 0]),
      closed: false,
    }));
  }

  /**
   * Spawn one twin-orb bolt from the boss's own CURRENT `(ox, oy)` straight
   * at `(tx, ty)` — the player's position at fire time, no re-aiming after
   * launch.
   * @param {number} ox @param {number} oy  origin — the boss's own position
   * @param {number} tx @param {number} ty  player position at fire time
   */
  fire(ox, oy, tx, ty) {
    const angle = Math.atan2(ty - oy, tx - ox);
    fireBossBullet(this, ox, oy, angle, CFG.speed);
  }

  /** @param {number} dt */
  update(dt) {
    updateBossBullets(this, dt);
  }

  /** True while any bolt is still in flight — used by WaveManager.isDone. */
  get active() { return this._count > 0; }

  /** Instantly discards every in-flight bolt — used by the player's skill bomb (WaveManager.triggerSkillBomb). */
  clear() { this._count = 0; }

  /**
   * World position of both orbs for bolt `i`, offset perpendicular to its
   * own travel direction by `HALF_SPACING` each way — shared by `checkHit`
   * and `render` so the two always agree exactly.
   * @returns {[number, number, number, number]} [ax, ay, bx, by]
   */
  _orbPositions(i) {
    const vx = this._vx[i], vy = this._vy[i];
    const spd = Math.sqrt(vx * vx + vy * vy) || 1;
    const px = (-vy / spd) * HALF_SPACING, py = (vx / spd) * HALF_SPACING;
    const cx = this._x[i], cy = this._y[i];
    return [cx - px, cy - py, cx + px, cy + py];
  }

  /**
   * Test the connecting link between both orbs against the player. If it
   * lands, the whole bolt is removed (compact swap) and returns `true` —
   * same swap-remove-on-hit shape as EnemyBullets.checkHit, just against a
   * segment instead of a circle.
   * @param {number} px @param {number} py @param {number} hitRadius
   * @returns {boolean}
   */
  checkHit(px, py, hitRadius) {
    const rSum = CFG.halfWidth + hitRadius;
    for (let i = 0; i < this._count; i++) {
      const [ax, ay, bx, by] = this._orbPositions(i);
      if (distanceToSegment(px, py, ax, ay, bx, by) <= rSum) {
        this._count--;
        if (i < this._count) {
          this._x[i]  = this._x[this._count];  this._y[i]  = this._y[this._count];
          this._vx[i] = this._vx[this._count]; this._vy[i] = this._vy[this._count];
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Two glowing orbs per active bolt, linked by a connector redrawn with a
   * fresh random jitter every frame — a cheap "crackling electricity"
   * animation. Purely visual: `checkHit` always tests the clean orb-to-orb
   * line, not this jittered path.
   * @param {import('../core/Renderer.js').Renderer} renderer
   */
  render(renderer) {
    if (this._count === 0) return;

    for (let i = 0; i < this._count; i++) {
      const [ax, ay, bx, by] = this._orbPositions(i);
      const pts = this._pool[i].points;
      pts[0][0] = ax; pts[0][1] = ay;
      for (let s = 1; s <= JITTER_STEPS; s++) {
        const t = s / (JITTER_STEPS + 1);
        pts[s][0] = ax + (bx - ax) * t + (Math.random() - 0.5) * CFG.jitterAmount;
        pts[s][1] = ay + (by - ay) * t + (Math.random() - 0.5) * CFG.jitterAmount;
      }
      pts[JITTER_STEPS + 1][0] = bx; pts[JITTER_STEPS + 1][1] = by;
    }
    renderer.strokePaths(this._pool, this._style, this._count);

    for (let i = 0; i < this._count; i++) {
      const [ax, ay, bx, by] = this._orbPositions(i);
      renderer.fillEllipse(0, 0, CFG.sphereRadius, CFG.sphereRadius, { x: ax, y: ay, fillColor: CFG.color });
      renderer.fillEllipse(0, 0, CFG.sphereRadius, CFG.sphereRadius, { x: bx, y: by, fillColor: CFG.color });
      renderer.strokeCircle(ax, ay, CFG.sphereRadius, { color: CFG.color, lineWidth: 2, glowBlur: CFG.glowBlur, glowColor: CFG.color });
      renderer.strokeCircle(bx, by, CFG.sphereRadius, { color: CFG.color, lineWidth: 2, glowBlur: CFG.glowBlur, glowColor: CFG.color });
    }
  }
}
