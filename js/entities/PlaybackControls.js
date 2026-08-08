/**
 * PlaybackControls.js
 * Two small always-visible buttons during gameplay, flanking the Enemy
 * Codex button in the same top-center HUD gap: mute and pause. Kept
 * together in one small entity since both are simple icon toggle buttons
 * that share the same hit-test/pulse/render shape (mirrors EnemyCodex's
 * button, without duplicating that class's own overlay logic).
 *
 * Mute never opens an overlay — it's a pure audio toggle via
 * core/AudioSettings.js, so it stays tappable regardless of what else is
 * open. Pause freezes gameplay and dims the screen, same technique as the
 * Enemy Codex's overlay (a frozen last frame behind a dim + text). Pause
 * and the Codex are mutually exclusive full-screen overlays — GameplayScene
 * (which owns both) is responsible for not opening one while the other is
 * up; this class only tracks its own `isPaused` state.
 */
import { Config } from '../core/Config.js';
import { isMuted, toggleMuted } from '../core/AudioSettings.js';

export class PlaybackControls {
  constructor() {
    this._paused = false;
    this._age = 0; // seconds — drives both buttons' idle pulse
  }

  get isPaused() { return this._paused; }

  update(dt) {
    this._age += dt;
  }

  /** @returns {boolean} true if (x, y) is inside the mute button's circular hit area. */
  isInsideMuteButton(x, y) {
    return this._insideCircle(x, y, Config.playbackControls.muteButton);
  }

  /** @returns {boolean} true if (x, y) is inside the pause button's circular hit area. */
  isInsidePauseButton(x, y) {
    return this._insideCircle(x, y, Config.playbackControls.pauseButton);
  }

  toggleMute() {
    toggleMuted();
  }

  togglePause() {
    this._paused = !this._paused;
  }

  resume() {
    this._paused = false;
  }

  _insideCircle(x, y, cfg) {
    const dx = x - cfg.x, dy = y - cfg.y;
    return dx * dx + dy * dy <= cfg.radius * cfg.radius;
  }

  render(renderer) {
    if (this._paused) this._renderOverlay(renderer);
    this._renderButton(renderer, Config.playbackControls.muteButton, isMuted() ? '🔇' : '🔊');
    this._renderButton(renderer, Config.playbackControls.pauseButton, this._paused ? '▶' : 'II');
  }

  _renderButton(renderer, cfg, glyph) {
    const pulse = 1 - cfg.pulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.pulseSpeed));
    renderer.strokeCircle(cfg.x, cfg.y, cfg.radius, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color, alpha: pulse,
    });
    renderer.drawText(glyph, cfg.x, cfg.y, {
      font: cfg.font, color: cfg.color, alpha: pulse,
    });
  }

  _renderOverlay(renderer) {
    const cfg = Config.playbackControls.overlay;
    const { width: vW, height: vH } = Config.virtual;
    const cx = vW / 2, cy = vH / 2;

    renderer.clear(Config.colors.void, cfg.dimAlpha);
    renderer.drawText('PAUSED', cx, cy, {
      font: cfg.titleFont, color: cfg.titleColor, glowBlur: cfg.titleGlowBlur, glowColor: cfg.titleColor,
    });
    renderer.drawText('TAP ⏸ TO RESUME', cx, cy + cfg.hintOffsetY, {
      font: cfg.hintFont, color: cfg.hintColor,
    });
  }
}
