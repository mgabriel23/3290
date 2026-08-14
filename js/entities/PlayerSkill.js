/**
 * PlayerSkill.js
 * The player's single special skill button: a "bomb" that instantly kills
 * every regular enemy currently on screen, deals a heavy but capped
 * (never-lethal) hit to a boss instead, and wipes every enemy projectile
 * on screen (see WaveManager.triggerSkillBomb/_clearEnemyProjectiles),
 * sitting bottom-right just above the barrier, on a flat cooldown after
 * use — see Config.playerSkill.
 *
 * This class owns only the button itself — the cooldown timer, its hit-test,
 * and its own render (an idle "ready" pulse, or a dim inert ring plus a
 * whole-seconds countdown while recharging) — the same shape
 * PlaybackControls' mute/pause buttons already use. It has no idea what
 * tapping it actually DOES; GameplayScene decides that (calling
 * WaveManager.triggerSkillBomb and its own screen-shake/hit-stop), the same
 * division of responsibility GameplayScene already has with
 * PlaybackControls' toggleMute/togglePause.
 */
import { Config } from '../core/Config.js';

export class PlayerSkill {
  constructor() {
    this._cooldownTimer = 0; // seconds remaining before it can be used again, 0 = ready
    this._age = 0; // seconds — drives the idle-ready pulse
  }

  /** True once the cooldown has fully elapsed. */
  get ready() { return this._cooldownTimer <= 0; }

  /** @param {number} dt */
  update(dt) {
    this._age += dt;
    if (this._cooldownTimer > 0) this._cooldownTimer = Math.max(0, this._cooldownTimer - dt);
  }

  /** Start the flat cooldown — called by GameplayScene once the bomb actually fires. */
  use() {
    this._cooldownTimer = Config.playerSkill.cooldown;
  }

  /** @returns {boolean} true if (x, y) is inside the button's circular hit area. */
  isInsideButton(x, y) {
    const cfg = Config.playerSkill;
    const dx = x - cfg.x, dy = y - cfg.y;
    return dx * dx + dy * dy <= cfg.radius * cfg.radius;
  }

  /** @param {import('../core/Renderer.js').Renderer} renderer */
  render(renderer) {
    const cfg = Config.playerSkill;
    if (this.ready) {
      const pulse = 1 - cfg.pulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.pulseSpeed));
      renderer.strokeCircle(cfg.x, cfg.y, cfg.radius, {
        color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color, alpha: pulse,
      });
      renderer.drawText(cfg.glyph, cfg.x, cfg.y, {
        font: cfg.font, color: cfg.color, alpha: pulse,
      });
    } else {
      renderer.strokeCircle(cfg.x, cfg.y, cfg.radius, {
        color: cfg.cooldownColor, lineWidth: cfg.lineWidth, alpha: 0.5,
      });
      renderer.drawText(`${Math.ceil(this._cooldownTimer)}`, cfg.x, cfg.y, {
        font: cfg.cooldownFont, color: cfg.cooldownColor, alpha: 0.85,
      });
    }
  }
}
