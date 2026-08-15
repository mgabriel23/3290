/**
 * SettingsPanel.js
 * A ⚙ button + full-screen overlay, composed into PrologueScene's 'title'
 * beat ONLY — settings are deliberately not reachable mid-run (mute/pause
 * stay PlaybackControls' job during gameplay). Same "one button toggles
 * open/closed" shape as EnemyCodex (⚙ ↔ ✕), same "dimmed background is
 * inert" convention as Shop — every tap while open is either consumed by a
 * control or swallowed, never falls through to the mode buttons underneath.
 *
 * Five fixed rows (not a data-driven list — each row is a genuinely
 * different control type, so a shared list abstraction would buy nothing):
 * VOLUME and SHIP RESPONSE (sliders, reading/writing core/AudioSettings.js's
 * volume and core/Settings.js's sensitivity), HAPTICS and COLORBLIND MODE
 * (toggle switches), TEXT SIZE (a 3-way segmented control). All five persist
 * immediately on every change via their own module, so there's nothing to
 * save/cancel here — this panel only reads current values to render and
 * writes new ones on interaction.
 *
 * No slider/toggle primitive exists on Renderer, so both are built from
 * primitives it already exposes: a slider is a `fillStrokePaths` rect track
 * + a same-shape value-width fill (identical technique to HUD's own health
 * bar) plus a `fillEllipse`/`strokeCircle` knob; a toggle is a smaller
 * version of the same track+knob shape. The segmented control instead uses
 * plain corner-bracket frames (`cornerBracketPath`), matching every other
 * button/card in this game's stroke-only wireframe language, since (unlike
 * a slider/toggle, which are meters) it's genuinely three buttons.
 *
 * Sliders need drag, so this panel implements `handlePointerDown/Move/Up`
 * (forwarded from PrologueScene the same way GameplayScene already forwards
 * them to ship-drag) — each hit-tests its own track and, while dragging,
 * recomputes the value from the pointer's x every move. Toggles/segmented
 * options are tap-only, handled in `handleTap`.
 */
import { Config } from '../core/Config.js';
import { cornerBracketPath } from '../core/shapes.js';
import { getVolume, setVolume } from '../core/AudioSettings.js';
import {
  getSensitivity, setSensitivity,
  getHapticsEnabled, setHapticsEnabled,
  getColorblindEnabled, setColorblindEnabled,
  getTextSize, setTextSize,
} from '../core/Settings.js';

const ROW_VOLUME = 0;
const ROW_SENSITIVITY = 1;
const ROW_HAPTICS = 2;
const ROW_COLORBLIND = 3;
const ROW_TEXT_SIZE = 4;

export class SettingsPanel {
  constructor() {
    this._open = false;
    this._age = 0; // seconds — drives the ⚙ button's idle pulse
    this._overlayAge = 0; // seconds since opened — drives the overlay fade-in
    this._draggingVolume = false;
    this._draggingSensitivity = false;
  }

  get isOpen() { return this._open; }

  update(dt) {
    this._age += dt;
    if (this._open) this._overlayAge += dt;
  }

  /** @returns {boolean} true if (x, y) is inside the ⚙ toggle button's circular hit area. */
  isInsideButton(x, y) {
    const { x: bx, y: by, radius } = Config.settings.button;
    const dx = x - bx, dy = y - by;
    return dx * dx + dy * dy <= radius * radius;
  }

  /** The button always wins first (opens/closes); while open, a toggle row or a segmented option; any other tap while open is swallowed. */
  handleTap(x, y) {
    if (this.isInsideButton(x, y)) {
      this._open = !this._open;
      this._overlayAge = 0;
      return;
    }
    if (!this._open) return;
    if (this._isInsideToggle(x, y, ROW_HAPTICS)) { setHapticsEnabled(!getHapticsEnabled()); return; }
    if (this._isInsideToggle(x, y, ROW_COLORBLIND)) { setColorblindEnabled(!getColorblindEnabled()); return; }
    const segment = this._segmentedIndexAt(x, y, ROW_TEXT_SIZE);
    if (segment !== -1) setTextSize(segment);
  }

  handlePointerDown(x, y) {
    if (!this._open) return;
    if (this._isInsideSliderTrack(x, y, ROW_VOLUME)) { this._draggingVolume = true; this._setVolumeFromX(x); return; }
    if (this._isInsideSliderTrack(x, y, ROW_SENSITIVITY)) { this._draggingSensitivity = true; this._setSensitivityFromX(x); }
  }

  handlePointerMove(x, y) {
    if (this._draggingVolume) this._setVolumeFromX(x);
    else if (this._draggingSensitivity) this._setSensitivityFromX(x);
  }

  handlePointerUp() {
    this._draggingVolume = false;
    this._draggingSensitivity = false;
  }

  // --- Row layout (shared by hit-testing and render) --------------------------

  _rowLabelY(rowIndex) {
    const { contentStartY, rowSpacing } = Config.settings.overlay;
    return contentStartY + rowIndex * rowSpacing;
  }

  _rowControlY(rowIndex) {
    return this._rowLabelY(rowIndex) + Config.settings.overlay.controlOffsetY;
  }

  _sliderBounds(rowIndex) {
    const { width: vW } = Config.virtual;
    const { trackWidth } = Config.settings.slider;
    const left = vW / 2 - trackWidth / 2;
    return { left, right: left + trackWidth, cy: this._rowControlY(rowIndex) };
  }

  _isInsideSliderTrack(x, y, rowIndex) {
    const { left, right, cy } = this._sliderBounds(rowIndex);
    const { trackHeight, hitPaddingY } = Config.settings.slider;
    return x >= left && x <= right && Math.abs(y - cy) <= trackHeight / 2 + hitPaddingY;
  }

  _setVolumeFromX(x) {
    const { left, right } = this._sliderBounds(ROW_VOLUME);
    setVolume((x - left) / (right - left));
  }

  _setSensitivityFromX(x) {
    const { left, right } = this._sliderBounds(ROW_SENSITIVITY);
    setSensitivity((x - left) / (right - left));
  }

  _toggleBounds(rowIndex) {
    const { width: vW } = Config.virtual;
    const { width, height } = Config.settings.toggle;
    const cy = this._rowControlY(rowIndex);
    return { left: vW / 2 - width / 2, right: vW / 2 + width / 2, top: cy - height / 2, bottom: cy + height / 2, cy };
  }

  _isInsideToggle(x, y, rowIndex) {
    const b = this._toggleBounds(rowIndex);
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }

  _segmentedBounds(rowIndex) {
    const { width: vW } = Config.virtual;
    const { optionWidth, height, gap, options } = Config.settings.segmented;
    const totalWidth = options.length * optionWidth + (options.length - 1) * gap;
    return { startX: vW / 2 - totalWidth / 2, optionWidth, gap, height, cy: this._rowControlY(rowIndex), count: options.length };
  }

  /** @returns {number} the option index at (x, y), or -1 if outside every option. */
  _segmentedIndexAt(x, y, rowIndex) {
    const b = this._segmentedBounds(rowIndex);
    if (y < b.cy - b.height / 2 || y > b.cy + b.height / 2) return -1;
    for (let i = 0; i < b.count; i++) {
      const left = b.startX + i * (b.optionWidth + b.gap);
      if (x >= left && x <= left + b.optionWidth) return i;
    }
    return -1;
  }

  // --- Render -------------------------------------------------------------------

  /** Draws the ⚙ button always, on top of everything (including the overlay) — the same button toggles both open and closed, same convention as EnemyCodex. */
  render(renderer) {
    if (this._open) this._renderOverlay(renderer);
    this._renderButton(renderer);
  }

  _renderButton(renderer) {
    const cfg = Config.settings.button;
    const pulse = 1 - cfg.pulseDepth * (0.5 + 0.5 * Math.sin(this._age * cfg.pulseSpeed));
    renderer.strokeCircle(cfg.x, cfg.y, cfg.radius, {
      color: cfg.color, lineWidth: cfg.lineWidth, glowBlur: cfg.glowBlur, glowColor: cfg.color, alpha: pulse,
    });
    renderer.drawText(this._open ? '✕' : '⚙', cfg.x, cfg.y, {
      font: cfg.font, color: cfg.color, alpha: pulse,
    });
  }

  _renderOverlay(renderer) {
    const cfg = Config.settings.overlay;
    const { width: vW } = Config.virtual;
    const alpha = Math.min(this._overlayAge / cfg.fadeInDuration, 1);

    renderer.clear(Config.colors.void, cfg.dimAlpha * alpha);
    renderer.drawText('SETTINGS', vW / 2, cfg.titleY, {
      font: cfg.titleFont, color: cfg.titleColor, alpha,
    });

    const sensitivity = getSensitivity();
    this._renderSliderRow(renderer, ROW_VOLUME, 'VOLUME', `${Math.round(getVolume() * 100)}%`, getVolume(), alpha);
    this._renderSliderRow(renderer, ROW_SENSITIVITY, 'SHIP RESPONSE',
      sensitivity <= 0 ? 'INSTANT' : `${Math.round(sensitivity * 100)}%`, sensitivity, alpha);
    this._renderToggleRow(renderer, ROW_HAPTICS, 'HAPTICS', getHapticsEnabled(), alpha);
    this._renderToggleRow(renderer, ROW_COLORBLIND, 'COLORBLIND MODE', getColorblindEnabled(), alpha);
    this._renderSegmentedRow(renderer, ROW_TEXT_SIZE, 'TEXT SIZE', getTextSize(), alpha);

    renderer.drawText(cfg.footerText, vW / 2, cfg.footerY, {
      font: cfg.footerFont, color: cfg.footerColor, alpha: alpha * 0.6,
    });
  }

  _renderSliderRow(renderer, rowIndex, label, valueText, value, alpha) {
    const cfg = Config.settings.overlay;
    const { width: vW } = Config.virtual;
    renderer.drawText(label, vW / 2, this._rowLabelY(rowIndex), {
      font: cfg.labelFont, color: cfg.labelColor, alpha,
    });
    this._renderSlider(renderer, rowIndex, value, alpha);
    renderer.drawText(valueText, vW / 2, this._rowControlY(rowIndex) + 22, {
      font: cfg.valueFont, color: cfg.valueColor, alpha: alpha * 0.85,
    });
  }

  _renderSlider(renderer, rowIndex, value, alpha) {
    const s = Config.settings.slider;
    const { left, right, cy } = this._sliderBounds(rowIndex);
    const top = cy - s.trackHeight / 2, bottom = cy + s.trackHeight / 2;

    renderer.fillStrokePaths([{ points: [[left, top], [right, top], [right, bottom], [left, bottom]], closed: true }], {
      fillColor: s.trackColor, strokeColor: s.trackColor, lineWidth: 1, alpha,
    });

    const clamped = Math.max(0, Math.min(1, value));
    const fillRight = left + clamped * (right - left);
    if (fillRight > left) {
      renderer.fillStrokePaths([{ points: [[left, top], [fillRight, top], [fillRight, bottom], [left, bottom]], closed: true }], {
        fillColor: s.fillColor, strokeColor: s.fillColor, lineWidth: 1, alpha,
      });
    }

    renderer.fillEllipse(0, 0, s.knobRadius, s.knobRadius, { x: fillRight, y: cy, fillColor: s.knobColor, alpha });
    renderer.strokeCircle(fillRight, cy, s.knobRadius, {
      color: s.knobColor, lineWidth: s.knobLineWidth, glowBlur: s.glowBlur, glowColor: s.fillColor, alpha,
    });
  }

  _renderToggleRow(renderer, rowIndex, label, on, alpha) {
    const cfg = Config.settings.overlay;
    const { width: vW } = Config.virtual;
    renderer.drawText(label, vW / 2, this._rowLabelY(rowIndex), {
      font: cfg.labelFont, color: cfg.labelColor, alpha,
    });
    this._renderToggle(renderer, rowIndex, on, alpha);
  }

  _renderToggle(renderer, rowIndex, on, alpha) {
    const t = Config.settings.toggle;
    const b = this._toggleBounds(rowIndex);
    const color = on ? t.onColor : t.offColor;

    renderer.fillStrokePaths([{ points: [[b.left, b.top], [b.right, b.top], [b.right, b.bottom], [b.left, b.bottom]], closed: true }], {
      fillColor: color, strokeColor: color, lineWidth: 1, alpha: alpha * (on ? 0.35 : 0.25),
    });

    const knobRadius = t.height / 2 - 3;
    const knobX = on ? b.right - t.height / 2 : b.left + t.height / 2;
    renderer.fillEllipse(0, 0, knobRadius, knobRadius, { x: knobX, y: b.cy, fillColor: t.knobColor, alpha });
    renderer.strokeCircle(knobX, b.cy, knobRadius, { color, lineWidth: 1.5, alpha });

    renderer.drawText(on ? t.labelOnText : t.labelOffText, b.right + 28, b.cy, {
      font: t.font, color, alpha, align: 'left',
    });
  }

  _renderSegmentedRow(renderer, rowIndex, label, activeIndex, alpha) {
    const cfg = Config.settings.overlay;
    const { width: vW } = Config.virtual;
    renderer.drawText(label, vW / 2, this._rowLabelY(rowIndex), {
      font: cfg.labelFont, color: cfg.labelColor, alpha,
    });
    this._renderSegmented(renderer, rowIndex, activeIndex, alpha);
  }

  _renderSegmented(renderer, rowIndex, activeIndex, alpha) {
    const s = Config.settings.segmented;
    const b = this._segmentedBounds(rowIndex);
    const top = b.cy - b.height / 2, bottom = b.cy + b.height / 2;

    for (let i = 0; i < b.count; i++) {
      const left  = b.startX + i * (b.optionWidth + b.gap);
      const right = left + b.optionWidth;
      const active = i === activeIndex;
      const color  = active ? s.activeColor : s.inactiveColor;

      renderer.strokePaths([
        cornerBracketPath(left, top, 1, 1, s.legSize),
        cornerBracketPath(right, top, -1, 1, s.legSize),
        cornerBracketPath(left, bottom, 1, -1, s.legSize),
        cornerBracketPath(right, bottom, -1, -1, s.legSize),
      ], {
        color, lineWidth: active ? 2 : 1, glowBlur: active ? 6 : 0, glowColor: color, alpha,
      });
      renderer.drawText(s.options[i], (left + right) / 2, b.cy, { font: s.font, color, alpha });
    }
  }
}
