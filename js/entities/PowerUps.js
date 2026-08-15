/**
 * PowerUps.js
 * Pool of collectible pickups left behind by a percentage of enemy kills
 * (see WaveManager.handleBulletHit/_maybeDropPowerUp) — small falling orbs
 * the player flies through to restore health, either their own or the
 * barrier's. Only two kinds exist, distinguished by color and a filled inner
 * icon badge: a "+" cross for a player-health pickup, the same diamond
 * emblem Barrier.js draws at its own peak for a shield pickup (see
 * Config.powerUps).
 *
 * Each pickup launches from its spawn point at a random angle/speed that
 * decays via drag (same burst-then-settle shape as Particles.js' spark
 * burst, see Config.powerUps.burstSpeedMin/Max/burstDrag) before settling
 * into the shared straight-down `fallSpeed` drift — reads as an "explosion"
 * scattering pickups outward from the kill, and keeps a same-frame gold
 * coin and PowerUp from spawning stacked on top of each other.
 *
 * Magnet pull: while a pickup sits within the player's `magnetRadius` (see
 * Player.magnetRadius/magnetPullAccel and Config.player.magnet), `update`
 * steers it toward the player by adding acceleration into the SAME vx/vy
 * used for the spawn burst above — it decays via the same `burstDrag`, so
 * the pull speed naturally settles at `pullAccel / burstDrag` rather than
 * needing its own separate cap. Same shape in GoldPickups.js.
 *
 * Same pre-allocated-typed-array pooling shape as EnemyBullet.js: swap-
 * remove on cull (falls off the bottom of the screen or outlives `maxLife`)
 * or on pickup. Owned by GameplayScene, not WaveManager, even though only
 * WaveManager spawns into/drains it — a fresh WaveManager is constructed
 * every level, but an uncollected pickup must survive that transition
 * rather than vanishing with the old one, so GameplayScene hands the same
 * pool instance to each new WaveManager (see WaveManager's constructor doc).
 *
 * A third kind, 'fireBoost', and a fourth, 'invincible', are temporary
 * buffs rather than an instant restore — this pool only spawns/falls/gets
 * collected like the other two; PowerUps.js itself has no notion of
 * "temporary," it's PowerUps-agnostic about what collecting one actually
 * does. fireBoost's icon is a filled lightning-bolt badge; invincible's is
 * a hexagon ring (deliberately left unfilled — see Config.powerUps.
 * iconFillColor), echoing the bubble shape it actually draws around the
 * player (see Player._renderInvincibleBubble) — both distinct from health's
 * cross and shield's diamond.
 */
import { Config } from '../core/Config.js';
import { diamondPath } from '../core/shapes.js';

const MAX = Config.powerUps.poolSize;

export class PowerUps {
  constructor() {
    this._x     = new Float32Array(MAX);
    this._y     = new Float32Array(MAX);
    this._vx    = new Float32Array(MAX); // burst velocity — decays to 0 via drag, see update()
    this._vy    = new Float32Array(MAX);
    this._age   = new Float32Array(MAX);
    this._type  = new Array(MAX).fill('health'); // 'health' | 'shield' | 'fireBoost' | 'invincible'
    this._count = 0;

    // Local-space icon paths, centered on the origin — repositioned onto
    // each pickup at render time via fillStrokePaths'/strokePaths' own
    // {x, y} transform. Cross/diamond/bolt are filled closed polygons (not
    // thin stroked lines) — a bold, solid glyph reads far better at the
    // small size these render at than an outline does, especially against
    // a busy starfield. See Config.powerUps.iconFillColor for why they all
    // share one fill tone.
    const d = Config.powerUps.radius * 0.45;
    // A filled plus/cross badge — the standard 12-point "medkit" cross outline.
    const t = d * 0.35; // half-thickness of each arm
    this._crossPath = {
      points: [
        [-t, -d], [t, -d], [t, -t],
        [d, -t], [d, t], [t, t],
        [t, d], [-t, d], [-t, t],
        [-d, t], [-d, -t], [-t, -t],
      ],
    };
    this._diamondPath = diamondPath(0, 0, Config.powerUps.radius * 0.5);
    // A filled lightning-bolt badge, top to bottom.
    this._boltPath = {
      points: [
        [d * 0.15, -d], [-d * 0.55, d * 0.05], [-d * 0.05, d * 0.05],
        [-d * 0.15, d], [d * 0.55, -d * 0.05], [d * 0.05, -d * 0.05],
      ],
    };
    // A small hexagon ring — six points evenly spaced around the origin.
    const hexPts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      hexPts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    this._hexPath = { points: hexPts, closed: true };

    // Wrapper arrays reused every pickup, every frame by render() instead of
    // allocating a fresh single-element array each call.
    this._crossPathArr   = [this._crossPath];
    this._diamondPathArr = [this._diamondPath];
    this._boltPathArr    = [this._boltPath];
    this._hexPathArr     = [this._hexPath];
  }

  /**
   * @param {number} x @param {number} y
   * @param {'health'|'shield'|'fireBoost'|'invincible'} type
   */
  spawn(x, y, type) {
    if (this._count >= MAX) return;
    const { burstSpeedMin, burstSpeedMax } = Config.powerUps;
    const i = this._count++;
    const angle = Math.random() * Math.PI * 2;
    const speed = burstSpeedMin + Math.random() * (burstSpeedMax - burstSpeedMin);
    this._x[i]    = x;
    this._y[i]    = y;
    this._vx[i]   = Math.cos(angle) * speed;
    this._vy[i]   = Math.sin(angle) * speed;
    this._age[i]  = 0;
    this._type[i] = type;
  }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY  magnet pull target — see class doc
   * @param {number} magnetRadius  vp — pickups within this distance of the player accelerate toward it
   * @param {number} magnetPullAccel  vp/sec^2 applied toward the player while inside magnetRadius
   */
  update(dt, playerX, playerY, magnetRadius, magnetPullAccel) {
    const { fallSpeed, maxLife, burstDrag } = Config.powerUps;
    const { height: vH } = Config.virtual;
    const drag = 1 - dt * burstDrag;
    const magnetR2 = magnetRadius * magnetRadius;
    let w = 0;
    for (let i = 0; i < this._count; i++) {
      const dx = playerX - this._x[i];
      const dy = playerY - this._y[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < magnetR2 && distSq > 1) {
        const dist = Math.sqrt(distSq);
        const pull = magnetPullAccel * dt;
        this._vx[i] += (dx / dist) * pull;
        this._vy[i] += (dy / dist) * pull;
      }
      this._x[i]   += this._vx[i] * dt;
      this._y[i]   += (fallSpeed + this._vy[i]) * dt;
      this._vx[i]  *= drag;
      this._vy[i]  *= drag;
      this._age[i] += dt;
      if (this._age[i] < maxLife && this._y[i] < vH + 30) {
        if (w !== i) {
          this._x[w] = this._x[i]; this._y[w] = this._y[i];
          this._vx[w] = this._vx[i]; this._vy[w] = this._vy[i];
          this._age[w] = this._age[i]; this._type[w] = this._type[i];
        }
        w++;
      }
    }
    this._count = w;
  }

  /** True while any pickup is still active. */
  get active() { return this._count > 0; }

  /**
   * Test every active pickup against a circle at `(px, py)` with radius
   * `radius`; removes and returns the FIRST one found (swap-remove-on-hit,
   * same shape as EnemyBullets.checkHit), or `null` if none overlap.
   * Callers loop this to collect several pickups overlapping the same frame
   * — see WaveManager.checkPowerUpPickup.
   * @param {number} px @param {number} py @param {number} radius
   * @returns {'health'|'shield'|'fireBoost'|'invincible'|null}
   */
  checkPickup(px, py, radius) {
    const r = Config.powerUps.hitRadius + radius;
    const r2 = r * r;
    for (let i = 0; i < this._count; i++) {
      const dx = this._x[i] - px;
      const dy = this._y[i] - py;
      if (dx * dx + dy * dy <= r2) {
        const type = this._type[i];
        this._count--;
        if (i < this._count) {
          this._x[i] = this._x[this._count]; this._y[i] = this._y[this._count];
          this._vx[i] = this._vx[this._count]; this._vy[i] = this._vy[this._count];
          this._age[i] = this._age[this._count]; this._type[i] = this._type[this._count];
        }
        return type;
      }
    }
    return null;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    if (this._count === 0) return;
    const { radius, lineWidth, glowBlur, pulseSpeed, pulseDepth, maxLife, expireFadeDuration, iconFillColor, health, shield, fireBoost, invincible } = Config.powerUps;
    for (let i = 0; i < this._count; i++) {
      const type  = this._type[i];
      const cfg   = type === 'shield' ? shield : type === 'fireBoost' ? fireBoost : type === 'invincible' ? invincible : health;
      const x = this._x[i], y = this._y[i];
      const pulseAlpha = 1 - pulseDepth * (0.5 + 0.5 * Math.sin(this._age[i] * pulseSpeed));
      // Fades to fully transparent over the last `expireFadeDuration` seconds
      // before despawn — a visible "about to vanish" cue instead of an
      // abrupt pop once `update` culls it at maxLife.
      const timeLeft = maxLife - this._age[i];
      const expireAlpha = timeLeft < expireFadeDuration ? Math.max(0, timeLeft / expireFadeDuration) : 1;
      const alpha = pulseAlpha * expireAlpha;

      renderer.fillEllipse(0, 0, radius, radius, { x, y, fillColor: cfg.fillColor, alpha });
      renderer.strokeCircle(x, y, radius, { color: cfg.color, lineWidth, glowBlur, alpha });

      if (type === 'shield') {
        renderer.fillStrokePaths(this._diamondPathArr, { x, y, fillColor: iconFillColor, strokeColor: cfg.color, lineWidth, alpha });
      } else if (type === 'fireBoost') {
        renderer.fillStrokePaths(this._boltPathArr, { x, y, fillColor: iconFillColor, strokeColor: cfg.color, lineWidth, alpha });
      } else if (type === 'invincible') {
        // Left as an outline-only ring (not filled, unlike the other three)
        // — see Config.powerUps.iconFillColor's own comment for why — with a
        // slightly bolder stroke + soft glow so it still reads with equal
        // visual weight next to the filled badges.
        renderer.strokePaths(this._hexPathArr, { x, y, color: cfg.color, lineWidth: lineWidth * 1.4, glowBlur: glowBlur * 0.5, alpha });
      } else {
        renderer.fillStrokePaths(this._crossPathArr, { x, y, fillColor: iconFillColor, strokeColor: cfg.color, lineWidth, alpha });
      }
    }
  }
}
