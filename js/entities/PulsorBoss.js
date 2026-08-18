/**
 * PulsorBoss.js
 * Boss #7 — "Pulsor". Spawned by WaveManager on every 7th boss-level
 * encounter (level 49, 98, ... under Survival Mode's canonical schedule —
 * see Config.bossSchedule[mode].roster and WaveManager's boss-selection
 * lookup in its constructor). The first CIRCULAR hull (see
 * `_renderHull` below — a plain stroked+filled circle via Renderer's
 * `fillEllipse`/`strokeCircle` primitives, not a polygon, so unlike every
 * other boss/enemy it can't reuse EnemyCombat.js's `renderHull`), patrolling
 * a slow bouncing path around the upper arena — same DVD-logo bounce
 * technique as NovaBoss's own `_updatePatrol`.
 *
 * Ringed with cannon barrels rather than a plain smooth rim: `_renderCannons`
 * draws one stubby barrel at every angle `_fireWave`/`_fireRing` will
 * actually launch a pulse from THIS FRAME, via the shared
 * `_forEachWaveAngle`/`_forEachRingAngle` helpers both the firing code and
 * the rendering code call — so the barrel ring is a live preview of the
 * pattern about to fire, not independent decoration, and every pulse
 * visibly leaves from a muzzle instead of appearing out of open rim. Phase 1
 * shows the C-shaped arc (with its gap), phase 2 shows the full ring (with
 * its rotating gaps) — both re-derived every frame since `this._angle` keeps
 * moving.
 *
 * An unblinking eye sits at the core (`_renderEye`, `this._eyeAngle` kept
 * current every frame regardless of phase/state — the one part of this
 * thing that never stops watching): the pupil offsets within the sclera
 * toward the player and dilates as the next attack approaches
 * (`_threatLevel`), a readable tell for when a wave/ring is about to fire.
 * `_breathScale` gives the whole hull a subtle "breathing" pulse (Config's
 * `pulse.amp/speed`) instead of a rigid fixed radius. Hull/bullet color is
 * acid chartreuse (`Config.boss.pulsor.color`) — a sickly, toxic hue, and
 * the one hue gap left in the boss roster (see that field's own comment).
 * The cannons and hull flash white on a hit; the eye is skipped entirely
 * while flashing (see `render`) so the hit reads as a clean white flash
 * rather than clashing with its own color.
 *
 * Fires "pulses," not ordinary bullets — both phases share one pooled-bullet
 * class (PulsorBullets.js) tuned as short, thick, heavily-glowing orbs
 * rather than streaks.
 *
 * A repeating TIMED loop between two phases (`_phase`/`_phaseAge`), same
 * overall shape as NovaBoss's own phase1/phase2 loops:
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
 *   same "rotate so the safe gaps keep sweeping past" language Spiral's own
 *   phase-2 laser sweep already uses. A short `ring.windUp` delay before the first ring of each
 *   phase-2 visit lets the spin-up itself read as a telegraph.
 *
 * Hit/death-flash/entry-glide rendering reuse the shared EnemyCombat.js
 * functions that apply (tickDeathState/stepEntryGlide/applyHit) — not
 * `renderHull`, see above.
 */
import { Config } from '../core/Config.js';
import { applyHit, tickDeathState, stepEntryGlide } from './EnemyCombat.js';

const NS = Config.boss.pulsor.size;

// Cannon-path pool sized to the busier of the two phases' pulse counts —
// phase 1 draws `wave.count` barrels, phase 2 up to `ring.count` (minus
// whatever falls in a gap) — pre-allocated once and reused every frame
// (`_placeCannon` mutates in place), never reallocated. See `_renderCannons`.
const CANNON_POOL_SIZE = Math.max(Config.boss.pulsor.wave.count, Config.boss.pulsor.ring.count);

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

    this._angle    = 0;
    this._eyeAngle = 0; // always points at the player — see class doc
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

    // Pre-allocated, mutated in place each frame — never reallocated (same
    // pattern as DrifterEnemy's `_tentaclePaths`). Each entry is a 4-point
    // barrel quad — see `_placeCannon`.
    this._cannonPaths = Array.from({ length: CANNON_POOL_SIZE }, () => ({
      points: [[0, 0], [0, 0], [0, 0], [0, 0]], closed: true,
    }));
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

    // The eye always tracks the player, independent of phase/state — the
    // one part of this creature that never stops watching, even while the
    // hull itself is spinning through phase 2's ring attack (which
    // repurposes `_angle` as the spin angle instead of "toward player").
    this._eyeAngle = Math.atan2(playerY - this.y, playerX - this.x);

    if (this._state === 'entering') {
      // Cannon ring points at the player during entry too — looks natural flying in.
      this._angle = this._eyeAngle;
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

  /** Phase 1 — cannon ring tracks the player, fires a C-wave on a cooldown, loops into phase 2 after `phase1Duration`. */
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
   * Invokes `cb(angle)` once for each phase-1 wave pulse's launch angle —
   * `wave.count` angles evenly spaced around every angle EXCEPT a
   * `wave.gapAngle`-wide slice centered on the direction away from the
   * player (`this._angle` already points AT the player, kept current by
   * `_updateWavePhase` — see class doc for why the gap sits opposite it).
   * Shared by `_fireWave` (actually firing) and `_renderCannons` (drawing
   * the barrel that will fire it), so the visual pattern can never drift
   * from the real one.
   */
  _forEachWaveAngle(cb) {
    const w = this._cfg.wave;
    const gapCenter = this._angle + Math.PI; // opposite the player
    const arcSpan  = Math.PI * 2 - w.gapAngle;
    const arcStart = gapCenter + w.gapAngle / 2; // one edge of the solid arc
    for (let k = 0; k < w.count; k++) {
      cb(arcStart + (arcSpan * k) / (w.count - 1)); // evenly spaced, both edges included
    }
  }

  /**
   * Invokes `cb(angle)` once for each phase-2 ring pulse's launch angle:
   * up to `ring.count` angles evenly spaced around the FULL circle, skipping
   * any slot that falls inside one of `ring.gapCount` evenly-spaced
   * `ring.gapWidth`-wide windows. Slot angles are offset by `this._angle`
   * (continuously advancing in phase 2), so the gaps themselves rotate to a
   * new position every time this fires — see class doc. Shared by
   * `_fireRing` and `_renderCannons`, same reasoning as `_forEachWaveAngle`.
   */
  _forEachRingAngle(cb) {
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

      cb(this._angle + localAngle);
    }
  }

  /** Fires one pulse from each angle `_forEachWaveAngle` yields — see that method's doc. */
  _fireWave(fire) {
    const speed = this._cfg.wave.speed;
    this._forEachWaveAngle((a) => {
      const ox = this.x + Math.cos(a) * NS;
      const oy = this.y + Math.sin(a) * NS;
      fire.firePulsorBullet(ox, oy, a, speed);
    });
  }

  /** Fires one pulse from each angle `_forEachRingAngle` yields — see that method's doc. */
  _fireRing(fire) {
    const speed = this._cfg.ring.speed;
    this._forEachRingAngle((a) => {
      const ox = this.x + Math.cos(a) * NS;
      const oy = this.y + Math.sin(a) * NS;
      fire.firePulsorBullet(ox, oy, a, speed);
    });
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
   * 0-1 — rises toward 1 as the next wave/ring fire grows imminent, resets
   * to 0 right after firing. Purely cosmetic (drives the eye's pupil
   * dilation, `_renderEye`) — not a gameplay hook.
   */
  _threatLevel() {
    if (this._state !== 'combat') return 0;
    const cfg = this._cfg;
    const frac = this._phase === 1
      ? this._waveTimer / cfg.wave.interval
      : this._ringTimer / cfg.ring.interval;
    return 1 - Math.max(0, Math.min(1, frac));
  }

  /** Subtle hull "breathing" scale factor — see Config's `pulse.amp/speed`. */
  _breathScale() {
    const p = this._cfg.pulse;
    return 1 + Math.sin(this._stateAge * p.speed) * p.amp;
  }

  /**
   * Register one bullet hit. Returns true if the hit was fatal.
   * @param {number} [damage]  health points removed — scales with player level
   * @returns {boolean}
   */
  hit(damage = 1) {
    return applyHit(this, damage);
  }

  /**
   * Cannon barrels behind the hull (so their bases tuck under it, same
   * "draw the trailing bits first" trick DrifterEnemy uses for its
   * tentacles), then the hull itself, then the tracking eye on top.
   * WaveManager calls this directly (see `_renderIndividualEnemies`) since
   * only one boss is ever on screen at once.
   */
  render(renderer) {
    const flash = this._hitFlash > 0;
    this._renderCannons(renderer, flash);
    this._renderHull(renderer, flash);
    if (!flash) this._renderEye(renderer);
  }

  /**
   * A plain filled+stroked circle — unlike every other boss/enemy this
   * isn't a polygon, so it can't go through EnemyCombat.js's `renderHull`;
   * this replicates that same fill-then-glowing-stroke-with-white-hit-flash
   * shape by hand with Renderer's `fillEllipse`/`strokeCircle` primitives.
   */
  _renderHull(renderer, flash) {
    const cfg = this._cfg;
    const r   = cfg.size * this._breathScale();
    renderer.fillEllipse(0, 0, r, r, {
      x: this.x, y: this.y, fillColor: flash ? '#ffffff' : cfg.fillColor,
    });
    renderer.strokeCircle(this.x, this.y, r, {
      color: flash ? '#ffffff' : cfg.color,
      lineWidth: cfg.lineWidth,
      glowBlur: flash ? cfg.hitGlowBlur : cfg.glowBlur,
      glowColor: flash ? '#ffffff' : cfg.color,
    });
  }

  /**
   * Cannon barrels at the EXACT angles this frame's phase will actually fire
   * from — see class doc and `_forEachWaveAngle`/`_forEachRingAngle`. A live
   * preview of the pattern, not decoration: whichever barrels are visible
   * right before a fire tick are exactly where the pulses appear.
   */
  _renderCannons(renderer, flash) {
    const cfg = this._cfg;
    const r   = cfg.size * this._breathScale();
    let n = 0;
    const place = (angle) => { n = this._placeCannon(angle, r, n); };

    if (this._phase === 1) this._forEachWaveAngle(place);
    else                   this._forEachRingAngle(place);

    renderer.fillStrokePaths(this._cannonPaths, {
      fillColor:   flash ? '#ffffff' : cfg.fillColor,
      strokeColor: flash ? '#ffffff' : cfg.color,
      lineWidth:   cfg.cannon.lineWidth,
      glowBlur:    flash ? cfg.hitGlowBlur : cfg.cannon.glowBlur,
      glowColor:   flash ? '#ffffff' : cfg.color,
      singleStroke: true,
    }, n);
  }

  /**
   * Writes one barrel quad (tapering slightly wider at the muzzle) into
   * `this._cannonPaths[idx]`, from the hull rim (`baseR`) outward along
   * `angle`. Returns `idx + 1` so callers can chain/count in one pass.
   */
  _placeCannon(angle, baseR, idx) {
    const c = this._cfg.cannon;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const perpX = -dirY, perpY = dirX;

    const innerX = this.x + dirX * baseR, innerY = this.y + dirY * baseR;
    const outerX = this.x + dirX * (baseR + c.len), outerY = this.y + dirY * (baseR + c.len);

    const pts = this._cannonPaths[idx].points;
    pts[0][0] = innerX - perpX * c.baseHalfWidth; pts[0][1] = innerY - perpY * c.baseHalfWidth;
    pts[1][0] = innerX + perpX * c.baseHalfWidth; pts[1][1] = innerY + perpY * c.baseHalfWidth;
    pts[2][0] = outerX + perpX * c.tipHalfWidth;  pts[2][1] = outerY + perpY * c.tipHalfWidth;
    pts[3][0] = outerX - perpX * c.tipHalfWidth;  pts[3][1] = outerY - perpY * c.tipHalfWidth;
    return idx + 1;
  }

  /**
   * An unblinking eye at the core: the pupil offsets within the sclera
   * toward the player (`this._eyeAngle`, always current — see `update`) and
   * dilates as the next attack approaches (`_threatLevel`) — a readable
   * tell for when a wave/ring is about to fire. Skipped while hit-flashing,
   * see `render`.
   */
  _renderEye(renderer) {
    const cfg    = this._cfg;
    const e      = cfg.eye;
    const threat = this._threatLevel();
    const pupilR = e.pupilMinRadius + (e.pupilMaxRadius - e.pupilMinRadius) * threat;
    const lookX  = this.x + Math.cos(this._eyeAngle) * e.lookOffset;
    const lookY  = this.y + Math.sin(this._eyeAngle) * e.lookOffset;

    renderer.fillEllipse(0, 0, e.scleraRadius, e.scleraRadius, { x: this.x, y: this.y, fillColor: e.scleraColor });
    renderer.strokeCircle(this.x, this.y, e.scleraRadius, {
      color: e.irisColor, lineWidth: 2, glowBlur: e.glowBlur, glowColor: e.irisColor, alpha: 0.6 + 0.4 * threat,
    });
    renderer.fillEllipse(0, 0, pupilR, pupilR, { x: lookX, y: lookY, fillColor: e.pupilColor });
  }
}
