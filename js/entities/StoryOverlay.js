/**
 * StoryOverlay.js
 * A skippable story beat shown over the gameplay scene's opening moments:
 * a paragraph reveals itself with a classic "typewriter" effect — one
 * character at a time, each non-space character punctuated by a short
 * blip — near the top of the screen, while the starfield fades in and
 * the player's ship launches into position underneath it. A "SKIP"
 * control sits in the top-right corner for players who'd rather jump
 * straight into the action.
 *
 * Composed into GameplayScene exactly like Player — its own
 * `update(dt)` / `render(renderer)`, called unconditionally every frame
 * (and `handleTap`, forwarded the same optional-handler way Game forwards
 * gestures to scenes). Once it finishes — or is skipped — it simply stops
 * drawing itself; there's no scene transition involved, so no completion
 * callback either.
 *
 * This is a first sample of the *mechanism* with placeholder lore text —
 * the actual story content/structure is still to be planned; `Config.story`
 * is where those tunables will grow.
 */
import { Config } from '../core/Config.js';

export class StoryOverlay {
  /** @param {import('../core/Renderer.js').Renderer} renderer */
  constructor(renderer) {
    // Word-wrapped once up front (the text and font never change), then
    // flattened into the exact character sequence that gets rendered —
    // the reveal counter and the blips both walk *this* sequence rather
    // than the pre-wrap string, so they can never drift out of sync with
    // what's actually on screen (wrapping drops the line-breaking spaces).
    this._lines = this._wrapText(renderer);
    this._lineOffsets = this._computeLineOffsets(this._lines);
    this._revealText = this._lines.join('');

    this._revealedCount = 0;
    this._holdAge = 0;
    this._finished = false;
    this._blipTemplate = null;
  }

  /** Advance the typewriter reveal, then — once it's done — a brief hold before retiring for good. */
  update(dt) {
    if (this._finished) return;

    const { charsPerSecond, holdDuration } = Config.story;

    if (this._revealedCount < this._revealText.length) {
      const previous = Math.floor(this._revealedCount);
      this._revealedCount = Math.min(this._revealedCount + charsPerSecond * dt, this._revealText.length);
      this._playBlipsBetween(previous, Math.floor(this._revealedCount));
      return;
    }

    this._holdAge += dt;
    if (this._holdAge >= holdDuration) this._finished = true;
  }

  /** Route taps to the skip control — the only interactive element this overlay has. */
  handleTap(x, y) {
    if (this._finished) return;
    if (this._isInsideSkipButton(x, y)) this._finished = true;
  }

  /** Draw the paragraph (mid-reveal) and the skip button on top of whatever's beneath. */
  render(renderer) {
    if (this._finished) return;

    this._renderParagraph(renderer);
    this._renderSkipButton(renderer);
  }

  // --- Paragraph layout & typewriter reveal ---------------------------------

  /** Greedy word-wrap, using real glyph metrics so lines never overrun the margins. */
  _wrapText(renderer) {
    const { text, font, sideMargin } = Config.story;
    const { width: vW } = Config.virtual;
    const maxWidth = vW - sideMargin * 2;

    const words = text.split(' ');
    const lines = [];
    let line = '';

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && renderer.measureText(candidate, font).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    return lines;
  }

  /** Each line's starting index within the flattened `_revealText` — for mapping the reveal count back to lines. */
  _computeLineOffsets(lines) {
    const offsets = [];
    let offset = 0;
    for (const line of lines) {
      offsets.push(offset);
      offset += line.length;
    }
    return offsets;
  }

  _renderParagraph(renderer) {
    const { font, textColor, lineHeight, sideMargin, topMargin } = Config.story;
    const revealed = Math.floor(this._revealedCount);

    for (let i = 0; i < this._lines.length; i++) {
      const line = this._lines[i];
      const visibleLength = Math.max(0, Math.min(line.length, revealed - this._lineOffsets[i]));
      if (visibleLength === 0) continue;

      renderer.drawText(line.slice(0, visibleLength), sideMargin, topMargin + i * lineHeight, {
        font,
        color: textColor,
        align: 'left',
      });
    }
  }

  /** Play one blip per non-space character newly revealed since the last frame. */
  _playBlipsBetween(fromIndex, toIndex) {
    for (let i = fromIndex; i < toIndex; i++) {
      if (this._revealText[i] !== ' ') this._playBlip();
    }
  }

  // --- Skip control -----------------------------------------------------------

  _skipButtonBounds() {
    const { width: vW } = Config.virtual;
    const { width, height, marginTop, marginRight } = Config.story.skipButton;
    const right = vW - marginRight;
    return { left: right - width, top: marginTop, right, bottom: marginTop + height };
  }

  _isInsideSkipButton(x, y) {
    const { left, top, right, bottom } = this._skipButtonBounds();
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  _renderSkipButton(renderer) {
    const { label, font, color, lineWidth, glowBlur } = Config.story.skipButton;
    const { left, top, right, bottom } = this._skipButtonBounds();

    renderer.strokePaths(
      [{ points: [[left, top], [right, top], [right, bottom], [left, bottom]] }],
      { color, lineWidth, glowBlur }
    );
    renderer.drawText(label, (left + right) / 2, (top + bottom) / 2, { font, color });
  }

  // --- Audio -------------------------------------------------------------------

  /**
   * Each blip is a clone of a lazily-created template `Audio` element —
   * letters can reveal faster than a single clip's playback finishes, so
   * cloning lets overlapping plays layer cleanly instead of cutting each
   * other off.
   */
  _playBlip() {
    const { src, volume } = Config.story.blip;
    if (!this._blipTemplate) this._blipTemplate = new Audio(src);

    const blip = this._blipTemplate.cloneNode();
    blip.volume = volume;
    blip.play().catch(() => {});
  }
}
