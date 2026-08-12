/**
 * BouncerPrimalBoss.js
 * Boss #3 — "Bouncer Primal". Spawned by WaveManager on every 3rd boss-level
 * encounter (level 21, 49, ... — see Config.boss.roster and WaveManager's
 * boss-selection lookup in its constructor). A giant reskin of the Splitter
 * Bouncer variant — same wireframe hexagon silhouette, same physics — unlike
 * Boss #1/#2, which hold position or orbit, this one drops in and bounces
 * around the ENTIRE arena for the whole fight, reusing BouncerEnemy.js's own
 * exported `stepBouncePhysics` (gravity/wall/top/barrier bounces) at this
 * boss's own much bigger radius/gravity/speed numbers rather than
 * duplicating that math.
 *
 * Attack is passive/reactive rather than something it fires: a player
 * bullet that lands has a `summonChance` chance (once `summonCooldown` has
 * elapsed — an initial "too many, way too fast" pass had this fire on
 * EVERY eligible hit, which spawned a small crowd within seconds; the
 * chance roll on top of the cooldown was added specifically to thin that
 * out) to provoke a fresh regular Bouncer summon — health randomly rolled
 * `summonHealthMin`-`summonHealthMax`, and that rolled health is ALSO
 * deducted from THIS boss's own health, on top of the bullet's own damage
 * (see `hit`). Provoking a summon is therefore itself a real source of
 * damage, and the newly summoned Bouncer becomes a normal, independent
 * hazard/target the instant it's queued — it bounces, deals barrier/
 * contact damage, and must be killed like any other enemy before the wave
 * can clear, same as a Splitter's fragments already work. `drainSummons`
 * is how WaveManager actually collects the queue and adds it to the live
 * enemy list (see WaveManager.handleBulletHit).
 *
 * Independently, every hit also has a separate `powerUpDropChance` chance
 * to queue a PowerUp drop (`drainPowerUpDrops`, collected by that same
 * handleBulletHit call) — deliberately higher than the flat
 * Config.powerUps.dropChance every other enemy's kill rolls against, since
 * a fight this long and this "super tanky" deserves steady loot along the
 * way, not just a single roll at the very end.
 *
 * No top-of-screen health bar (`hideHealthBar` — see
 * WaveManager.renderBossHealthBar's check): given how "super tanky" this
 * fight is by design, the remaining health is drawn directly on the hull
 * instead, as a big compact number (`_formatHealth`) — the exact same
 * "number on the hull" language every regular Bouncer already uses for its
 * own health (see BouncerEnemy.render), just abbreviated (e.g. "12.0K")
 * since the raw digit count would otherwise be unreadable at a glance.
 */
import { Config } from '../core/Config.js';
import { BouncerEnemy, stepBouncePhysics } from './BouncerEnemy.js';
import { applyHit, tickDeathState } from './EnemyCombat.js';

/** "12345" -> "12.3K"; anything under 1000 is shown as a plain integer, matching a regular Bouncer's own number style. */
function formatHealth(n) {
  const v = Math.max(0, Math.ceil(n));
  if (v < 1000) return String(v);
  return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
}

export class BouncerPrimalBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.bouncerPrimal.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.bouncerPrimal;

    this._type   = 'boss';
    this._radius = this._cfg.radius;

    this.x  = this._radius + Math.random() * (vW - this._radius * 2);
    this.y  = -this._radius; // drops in from above, same as a regular Bouncer — no separate entry-glide state needed, gravity does the work
    this.vx = (this._cfg.speedMin + Math.random() * (this._cfg.speedMax - this._cfg.speedMin)) * (Math.random() < 0.5 ? -1 : 1);
    this.vy = 0;
    this._angle = Math.random() * Math.PI * 2;
    this.alive = true;

    this._maxHealth = this._cfg.health + healthBonus;
    this._health    = this._maxHealth;
    this._hitFlash  = 0;
    this._dying     = false;

    this._summonCooldown = 0; // seconds remaining before the next hit can even roll a summon
    this._pendingSummons = []; // drained by WaveManager.handleBulletHit — see class doc
    this._pendingPowerUpDrops = 0; // count queued by hit(), drained by WaveManager.handleBulletHit

    this._hull = { points: Array.from({ length: this._cfg.sides }, () => [0, 0]), closed: true };
  }

  get type()      { return this._type; }
  get hitRadius() { return this._radius; }
  get contactDamage() { return this._cfg.contactDamage; } // opts this boss into WaveManager.checkPlayerHit's contact-damage check, same as a regular Bouncer
  get hideHealthBar() { return true; } // see WaveManager.renderBossHealthBar
  get healthFrac()    { return Math.max(0, this._health) / this._maxHealth; } // no health bar of its own, but still needed generically by WaveManager._applySkillBombToBoss
  get maxHealth()      { return this._maxHealth; } // see WaveManager._applySkillBombToBoss
  get name()  { return this._cfg.name; }
  get color() { return this._cfg.color; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY  unused — Bouncer Primal never aims at anything, kept only so every boss class shares the same generic update() signature
   * @param {{ barrierSurfaceY: (x:number)=>number, onBarrierHit: (x:number,damage:number)=>void }} ctx
   */
  update(dt, playerX, playerY, ctx) {
    this._summonCooldown = Math.max(0, this._summonCooldown - dt);
    if (tickDeathState(this, dt)) return;

    stepBouncePhysics(
      this, dt, this._radius,
      ctx.barrierSurfaceY, ctx.onBarrierHit,
      this._cfg.barrierDamage, this._cfg.spinFactor, this._cfg.gravity,
    );
  }

  /**
   * Register one bullet hit. As long as this isn't already dying: once
   * `_summonCooldown` has elapsed, there's a `summonChance` chance the hit
   * also provokes a fresh Bouncer summon (its randomly rolled health is
   * deducted from `damage` here too, so the combined hit removes
   * `damage + summonHealth` from this boss's own health in one go — see
   * class doc), and independently a `powerUpDropChance` chance it also
   * queues a PowerUp drop. Returns true if the hit was fatal.
   * @param {number} [damage]
   * @returns {boolean}
   */
  hit(damage = 1) {
    if (this._dying) return false;
    const cfg = this._cfg;

    let summonHealth = 0;
    if (this._summonCooldown <= 0 && Math.random() < cfg.summonChance) {
      summonHealth = Math.round(cfg.summonHealthMin + Math.random() * (cfg.summonHealthMax - cfg.summonHealthMin));
      this._summonCooldown = cfg.summonCooldown;
      this._pendingSummons.push(new BouncerEnemy({
        x: this.x, y: this.y,
        health: summonHealth,
      }));
    }

    // Independent roll — a hit can provoke a summon, a PowerUp drop, both,
    // or neither. Higher than the flat kill-time Config.powerUps.dropChance
    // every other enemy uses, since a fight this long deserves more loot
    // along the way, not just one drop at the very end.
    if (Math.random() < cfg.powerUpDropChance) this._pendingPowerUpDrops++;

    return applyHit(this, damage + summonHealth, cfg.flashDuration);
  }

  /** Drains and returns any Bouncers queued by `hit` since the last drain — see WaveManager.handleBulletHit. */
  drainSummons() {
    // WaveManager.update() calls this unconditionally every frame for the
    // whole encounter; the queue is only ever non-empty right after a hit
    // rolls a summon, so skip allocating a fresh empty array on every other
    // frame rather than churning garbage the entire fight.
    if (this._pendingSummons.length === 0) return this._pendingSummons;
    const summons = this._pendingSummons;
    this._pendingSummons = [];
    return summons;
  }

  /** Drains and returns how many PowerUp drops `hit` queued since the last drain — see WaveManager.handleBulletHit. */
  drainPowerUpDrops() {
    const n = this._pendingPowerUpDrops;
    this._pendingPowerUpDrops = 0;
    return n;
  }

  render(renderer) {
    const cfg   = this._cfg;
    const flash = this._hitFlash > 0;
    const c = Math.cos(this._angle), s = Math.sin(this._angle);
    const pts = this._hull.points;
    for (let i = 0; i < cfg.sides; i++) {
      const a  = (i / cfg.sides) * Math.PI * 2;
      const lx = Math.cos(a) * this._radius;
      const ly = Math.sin(a) * this._radius;
      pts[i][0] = this.x + c * lx - s * ly;
      pts[i][1] = this.y + s * lx + c * ly;
    }

    renderer.strokePaths([this._hull], {
      color: flash ? '#ffffff' : cfg.color,
      lineWidth: cfg.lineWidth,
      glowBlur: flash ? cfg.hitGlowBlur : cfg.glowBlur,
      glowColor: flash ? '#ffffff' : cfg.color,
    });

    if (flash) return;
    renderer.drawText(formatHealth(this._health), this.x, this.y, {
      font: cfg.numberFont, color: cfg.numberColor,
    });
  }
}
