/**
 * PulsorBoss.js
 * Boss #7 — "Pulsor". Spawned by WaveManager on every 7th boss-level
 * encounter (level 49, 98, ... — see Config.boss.roster and WaveManager's
 * boss-selection lookup in its constructor). The first CIRCULAR hull (see
 * `_renderHull` below — a plain stroked+filled circle via Renderer's
 * `fillEllipse`/`strokeCircle` primitives, not a polygon, so unlike every
 * other boss/enemy it can't reuse EnemyCombat.js's `renderHull`), patrolling
 * a slow bouncing path around the upper arena — same DVD-logo bounce
 * technique as TetraBoss/NovaBoss's own `_updatePatrol`. A small bright
 * marker dot orbits the rim at radius `size` along `_angle` — during phase 1
 * it points at the player (an aim indicator, same idea as Nova's hull
 * vertex), during phase 2 it's the visible tell for the boss's own
 * continuous spin, since a plain circle's rotation would otherwise be
 * invisible.
 *
 * Fires "pulses," not ordinary bullets — both phases share one pooled-bullet
 * class (PulsorBullets.js) tuned as short, thick, heavily-glowing orbs
 * rather than streaks.
 *
 * A repeating TIMED loop between two phases (`_phase`/`_phaseAge`), same
 * shape as TetraBoss's/NovaBoss's own phase1/phase2 loops:
 *
 *   phase 1 (`phase1Duration` seconds) — an expanding "C-shaped" wave: every
 *   `wave.interval` seconds, `wave.count` pulses fire simultaneously, evenly
 *   spaced around all but a `wave.gapAngle`-wide slice of the circle — a
 *   full ring with one bite taken out. Every pulse in a wave launches at the
 *   same instant and the same `wave.speed`, so they stay in ring formation
 *   as they travel outward (see `_fireWave`) — no curved-path math needed,
 *   same "launch parameters correlate, physics does the rest" principle
 *   Spiral/Nova's own patterns already use. The gap is centered on the
 *   direction AWAY from the player at that instant, so the bulk of the wave
 *   converges around wherever they're standing — dodging means moving
 *   THROUGH the expanding wall toward the opening on the far side.
 *
 *   phase 2 (`phase2Duration` seconds) — the hull spins continuously
 *   (`ring.rotationSpeed`) and every `ring.interval` seconds fires a FULL
 *   circular pulse (`ring.count` bullet slots around the entire circle)
 *   with `ring.gapCount` evenly-spaced narrow gaps carved out (see
 *   `_fireRing`). Each gap's angular position is `this._angle + <fixed
 *   offset>`, so because the hull keeps spinning between pulses, every new
 *   ring's safe lanes land somewhere different from the last one's — the
 *   same "rotate so the safe gaps keep sweeping past" language Tetra's laser
 *   already uses. A short `ring.windUp` delay before the first ring of each
 *   phase-2 visit lets the spin-up itself read as a telegraph.
 *
 * Hit/death-flash/entry-glide rendering reuse the shared EnemyCombat.js
 * functions that apply (tickDeathState/stepEntryGlide/applyHit) — not
 * `renderHull`, see above.
 */
import { Config } from '../core/Config.js';
import { applyHit, tickDeathState, stepEntryGlide } from './EnemyCombat.js';

const NS = Config.boss.pulsor.size;

export class PulsorBoss {
  /**
   * @param {number} [healthBonus]  added to Config.boss.pulsor.health —
   *   WaveManager scales this by level, same convention as every regular enemy
   */
  constructor(healthBonus = 0) {
    const { width: vW } = Config.virtual;
    this._cfg = Config.boss.pulsor;

    this.x = vW / 2;
    this.y = -NS;
    this.alive = true;

    this._type = 'boss';
    this._spawnX = vW / 2;
    this._restX  = vW / 2;
    this._restY  = this._cfg.restY;

    this._maxHealth = this._cfg.health + healthBonus;
    this._health    = this._maxHealth;
    this._hitFlash  = 0;
    this._dying     = false;

    this._angle = 0;
    this._state    = 'entering'; // 'entering' -> 'combat'
    this._stateAge = 0;

    this._phase    = 1; // 1 (C-wave) or 2 (rotating ring) — loops, see update()
    this._phaseAge = 0; // seconds since the CURRENT phase began

    this._waveTimer = 0;
    this._ringTimer = 0;

    // Continuous bouncing patrol velocity — real direction rolled once entry
    // finishes (see update()'s 'entering' branch).
    this._vx = 0;
    this._vy = 0;
  }

  get type()       { return this._type; }
  get angle()      { return this._angle; }
  get hitRadius()  { return this._cfg.hitRadius; }
  /** 0-1 remaining health fraction — read by WaveManager for the boss health bar. */
  get healthFrac() { return Math.max(0, this._health) / this._maxHealth; }
  get maxHealth()  { return this._maxHealth; } // see WaveManager._applySkillBombToBoss
  get name()  { return this._cfg.name; }
  get color() { return this._cfg.color; }

  /**
   * @param {number} dt
   * @param {number} playerX @param {number} playerY
   * @param {{ firePulsorBullet: (ox:number,oy:number,angle:number,speed:number)=>void }} fire
   */
  update(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._stateAge += dt;
    if (tickDeathState(this, dt)) return;

    if (this._state === 'entering') {
      // Marker points at the player during entry too — looks natural flying in.
      this._angle = Math.atan2(playerY - this.y, playerX - this.x);
      stepEntryGlide(this, cfg, dt, 'combat');
      if (this._state === 'combat') {
        this._waveTimer = 0; // fire soon after arrival
        const a = Math.random() * Math.PI * 2;
        this._vx = Math.cos(a) * cfg.moveSpeed;
        this._vy = Math.sin(a) * cfg.moveSpeed;
      }
      return;
    }

    this._updatePatrol(dt);
    this._phaseAge += dt;

    if (this._phase === 1) this._updateWavePhase(dt, playerX, playerY, fire);
    else                   this._updateRingPhase(dt, fire);
  }

  /** Phase 1 — marker tracks the player, fires a C-wave on a cooldown, loops into phase 2 after `phase1Duration`. */
  _updateWavePhase(dt, playerX, playerY, fire) {
    const cfg = this._cfg;
    this._angle = Math.atan2(playerY - this.y, playerX - this.x);

    this._waveTimer -= dt;
    if (this._waveTimer <= 0) {
      this._fireWave(fire);
      this._waveTimer += cfg.wave.interval;
    }

    if (this._phaseAge >= cfg.phase1Duration) {
      this._phase = 2;
      this._phaseAge = 0;
      this._ringTimer = cfg.ring.windUp;
    }
  }

  /** Phase 2 — spins continuously, fires full-ring pulses on a cooldown, loops back to phase 1 after `phase2Duration`. */
  _updateRingPhase(dt, fire) {
    const cfg = this._cfg;
    this._angle += dt * cfg.ring.rotationSpeed;

    this._ringTimer -= dt;
    if (this._ringTimer <= 0) {
      this._fireRing(fire);
      this._ringTimer += cfg.ring.interval;
    }

    if (this._phaseAge >= cfg.phase2Duration) {
      this._phase = 1;
      this._phaseAge = 0;
      this._waveTimer = 0; // fire the next wave promptly on returning to phase 1
    }
  }

  /**
   * Fires `wave.count` pulses at once, evenly spaced around every angle
   * EXCEPT a `wave.gapAngle`-wide slice centered on the direction away from
   * the player (`this._angle` already points AT the player, kept current by
   * `_updateWavePhase` — see class doc for why the gap sits opposite it).
   */
  _fireWave(fire) {
    const w = this._cfg.wave;
    const gapCenter = this._angle + Math.PI; // opposite the player
    const arcSpan  = Math.PI * 2 - w.gapAngle;
    const arcStart = gapCenter + w.gapAngle / 2; // one edge of the solid arc
    for (let k = 0; k < w.count; k++) {
      const a  = arcStart + (arcSpan * k) / (w.count - 1); // evenly spaced, both edges included
      const ox = this.x + Math.cos(a) * NS;
      const oy = this.y + Math.sin(a) * NS;
      fire.firePulsorBullet(ox, oy, a, w.speed);
    }
  }

  /**
   * Fires up to `ring.count` pulses evenly spaced around the FULL circle,
   * skipping any slot that falls inside one of `ring.gapCount` evenly-spaced
   * `ring.gapWidth`-wide windows. Slot angles are offset by `this._angle`
   * (continuously advancing in phase 2), so the gaps themselves rotate to a
   * new position every time this fires — see class doc.
   */
  _fireRing(fire) {
    const r = this._cfg.ring;
    const gapSpacing = (Math.PI * 2) / r.gapCount;
    for (let slot = 0; slot < r.count; slot++) {
      const localAngle = slot * (Math.PI * 2 / r.count);

      let inGap = false;
      for (let g = 0; g < r.gapCount; g++) {
        const gapCenter = g * gapSpacing;
        let diff = (localAngle - gapCenter) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        else if (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= r.gapWidth / 2) { inGap = true; break; }
      }
      if (inGap) continue;

      const worldAngle = this._angle + localAngle;
      const ox = this.x + Math.cos(worldAngle) * NS;
      const oy = this.y + Math.sin(worldAngle) * NS;
      fire.firePulsorBullet(ox, oy, worldAngle, r.speed);
    }
  }

  /** Slow constant-velocity patrol, bouncing off the arena bounds like a DVD-logo — never stops, through both phases. */
  _updatePatrol(dt) {
    const cfg = this._cfg;
    const { width: vW } = Config.virtual;
    const xLo = cfg.boundMarginX, xHi = vW - cfg.boundMarginX;
    const yLo = cfg.boundYMin,    yHi = cfg.boundYMax;

    this.x += this._vx * dt;
    this.y += this._vy * dt;

    if      (this.x < xLo) { this.x = xLo; this._vx = Math.abs(this._vx); }
    else if (this.x > xHi) { this.x = xHi; this._vx = -Math.abs(this._vx); }
    if      (this.y < yLo) { this.y = yLo; this._vy = Math.abs(this._vy); }
    else if (this.y > yHi) { this.y = yHi; this._vy = -Math.abs(this._vy); }
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /** Hull, then the rim marker, then the pulsing core. WaveManager calls this directly (see `_renderIndividualEnemies`) since only one boss is ever on screen at once. */
  render(renderer) {
    this._renderHull(renderer);
    this._renderMarker(renderer);
    this._renderCore(renderer);
  }

  /**
   * A plain filled+stroked circle — unlike every other boss/enemy this
   * isn't a polygon, so it can't go through EnemyCombat.js's `renderHull`;
   * this replicates that same fill-then-glowing-stroke-with-white-hit-flash
   * shape by hand with Renderer's `fillEllipse`/`strokeCircle` primitives.
   */
  _renderHull(renderer) {
    const cfg   = this._cfg;
    const flash = this._hitFlash > 0;
    renderer.fillEllipse(0, 0, cfg.size, cfg.size, {
      x: this.x, y: this.y, fillColor: flash ? '#ffffff' : cfg.fillColor,
    });
    renderer.strokeCircle(this.x, this.y, cfg.size, {
      color: flash ? '#ffffff' : cfg.color,
      lineWidth: cfg.lineWidth,
      glowBlur: flash ? cfg.hitGlowBlur : cfg.glowBlur,
      glowColor: flash ? '#ffffff' : cfg.color,
    });
  }

  /** Small bright dot orbiting the rim along `_angle` — see class doc. */
  _renderMarker(renderer) {
    const cfg = this._cfg;
    const mx = this.x + Math.cos(this._angle) * cfg.size;
    const my = this.y + Math.sin(this._angle) * cfg.size;
    renderer.strokeCircle(mx, my, cfg.markerRadius, {
      color: cfg.color, lineWidth: cfg.markerLineWidth, glowBlur: cfg.markerGlowBlur, glowColor: cfg.color,
    });
  }

  /** Pulsing core-ring glow at the center — stands in for an engine flame, same reasoning as Spiral/Tetra/Nova's own core glow. */
  _renderCore(renderer) {
    const cfg   = this._cfg;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._stateAge * cfg.coreGlowPulseSpeed));
    renderer.strokeCircle(this.x, this.y, cfg.coreRadius, {
      color: cfg.color, lineWidth: cfg.coreGlowLineWidth, glowBlur: cfg.coreGlowBlur, glowColor: cfg.color, alpha: pulse,
    });
  }
}
