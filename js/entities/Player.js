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
 *
 * Health/damage: `health` is a plain public field (same convention as
 * `Barrier.health`) that WaveManager.checkPlayerHit drains via
 * `takeDamage`. A hit triggers a brief white flash plus an invulnerability
 * window (`Config.player.invulnDuration`) during which further damage is
 * ignored — GameplayScene reads `takeDamage`'s return value to know
 * whether a hit actually applied before triggering shake/hit-stop
 * feedback. Below `Config.player.lowHealth.threshold` the hull pulses
 * warning red, identical in shape to Barrier's own low-health pulse; a
 * short danger blip plays immediately on crossing into that state, then
 * repeats every `Config.player.lowHealth.warningInterval` seconds, capped
 * at `warningMaxRepeats` plays per danger episode (Barrier.js mirrors
 * this for its own health); and HUD's health bar shows a pulsing "!" icon
 * for as long as the danger persists (independent of the capped blip —
 * the icon isn't capped, only the sound is).
 */
import { Config } from '../core/Config.js';
import { easeOutCubic } from '../core/animation.js';
import { AudioPool } from '../core/AudioPool.js';

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
    this._minY = 132;                                   // below HUD health bar label (~y 106) — see Config.hud.health's comment
    this._maxY = Config.barrier.baseY - Config.barrier.arcHeight - halfH - 10; // above barrier arc

    // Pre-allocated flame triangle — only the tip's y-value changes each
    // frame (mutated in _renderFlame), so no new arrays are created on
    // the hot path.
    this._flame = [[-6, 38], [0, 38], [6, 38]];

    // Health/damage — see takeDamage. `_hitFlash` and `_invulnTimer` mirror
    // the enemy hit-flash convention (EnemyCombat.applyHit) and Barrier's
    // own damage-taking shape respectively; `_age` above already drives the
    // low-health pulse the same way it drives Barrier's.
    this.health = Config.player.maxHealth;
    this._hitFlash    = 0; // seconds remaining in the white hit-flash
    this._invulnTimer = 0; // seconds remaining of post-hit grace, during which takeDamage is a no-op

    // Low-health danger blip — see class doc.
    const { warningAudioSrc, warningVolume } = Config.player.lowHealth;
    this._warningAudio = new AudioPool(warningAudioSrc, 4, warningVolume);
    this._warningTimer = 0;   // seconds until the next blip; only ticks while low
    this._warningPlays = 0;   // blips played so far this danger episode — capped at warningMaxRepeats
    this._wasLowHealth = false; // edge-detects the moment danger starts, for an immediate first blip and a fresh play count
  }

  /** True once the entry animation has completed and the ship is controllable. */
  get ready() { return this._entryDone; }

  /** Collision radius — used by WaveManager's enemy-attack↔player hit tests. */
  get hitRadius() { return Config.player.hitRadius; }

  /**
   * Apply `amount` damage unless still within the post-hit grace window.
   * @param {number} amount
   * @returns {boolean} true if the damage actually applied (false while invulnerable)
   */
  takeDamage(amount) {
    if (this._invulnTimer > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this._hitFlash    = Config.player.hitFlashDuration;
    this._invulnTimer = Config.player.invulnDuration;
    return true;
  }

  /**
   * Move the ship to (x, y) in virtual coordinates, clamped to the play area.
   * Silently ignored while the entry animation is still running.
   */
  moveTo(x, y) {
    if (!this._entryDone) return;
    this._targetX = Math.max(this._minX, Math.min(this._maxX, x));
    this._targetY = Math.max(this._minY, Math.min(this._maxY, y));
  }

  /** Advance the entrance animation, thruster flicker, and damage timers by `dt` seconds. */
  update(dt) {
    this._age += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this._invulnTimer > 0) this._invulnTimer -= dt;
    this._updateLowHealthWarning(dt);

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

  /**
   * Draw the thruster flame, then the ship's neon wireframe on top of it.
   * Precedence when several damage-feedback states overlap: hit-flash
   * (pure white) beats low-health (warning red) beats normal color — the
   * same priority order Barrier and every enemy hull already use. While
   * invulnerable the whole ship blinks so the grace window is legible
   * rather than a silent free pass.
   */
  render(renderer) {
    const { lineWidth, glowBlur, scale } = Config.player;

    this._renderFlame(renderer);

    const flashing = this._hitFlash > 0;
    const low      = this._isLowHealth();
    const color    = flashing ? '#ffffff' : low ? Config.player.lowHealth.color : Config.player.color;
    const alpha    = this._invulnTimer > 0 ? this._invulnBlinkAlpha() : (low ? this._lowHealthPulseAlpha() : 1);

    renderer.strokePaths(
      [
        { points: SHIP_OUTLINE },
        { points: CANOPY },
        { points: SPINE, closed: false },
      ],
      { x: this.x, y: this.y, scale, color, lineWidth, glowBlur, alpha }
    );
  }

  // --- Health/damage ----------------------------------------------------------

  /** Latching (not just-crossed) — stays true all the way to 0, matching Barrier's own convention. */
  _isLowHealth() {
    return this.health <= Config.player.lowHealth.threshold;
  }

  /** Same "breathing alpha" formula as Barrier's low-health pulse and the UI's pulsing buttons. */
  _lowHealthPulseAlpha() {
    const { pulseSpeed, pulseDepth } = Config.player.lowHealth;
    return 1 - pulseDepth * (0.5 + 0.5 * Math.sin(this._age * pulseSpeed));
  }

  /** Fast on/off blink while `_invulnTimer` is counting down, so the grace window reads as a deliberate state. */
  _invulnBlinkAlpha() {
    return Math.floor(this._invulnTimer * 20) % 2 === 0 ? 1 : 0.35;
  }

  /**
   * Danger blip while low on health — plays immediately the instant
   * health crosses into the danger zone (edge-triggered via
   * `_wasLowHealth`), then every `warningInterval` seconds, up to
   * `warningMaxRepeats` total plays for this danger episode (not
   * indefinitely). Recovering above the threshold and dropping low again
   * resets the count, so a fresh emergency gets its own full set of
   * blips. Can never ring after death since GameplayScene stops calling
   * `update()` entirely once the game-over overlay takes over.
   */
  _updateLowHealthWarning(dt) {
    const low = this._isLowHealth();
    if (low) {
      if (!this._wasLowHealth) { this._warningTimer = 0; this._warningPlays = 0; } // just entered danger — blip right away, fresh count
      if (this._warningPlays < Config.player.lowHealth.warningMaxRepeats) {
        this._warningTimer -= dt;
        if (this._warningTimer <= 0) {
          this._warningAudio.play();
          this._warningPlays++;
          this._warningTimer = Config.player.lowHealth.warningInterval;
        }
      }
    }
    this._wasLowHealth = low;
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
