/**
 * PrologueScene.js
 * The game's opening cinematic — plays once, between the intro prompt
 * and gameplay, and ends by handing control to the player. It's
 * authored as a fixed sequence of "beats", each owning its own slice of
 * update/render and deciding for itself when to hand off to the next:
 *
 *   yearCard  → a stark "EARTH — YEAR 3290" title card fades in, holds, fades out
 *   portals   → the sky reveals itself (Starfield, fading in alongside) and
 *               three wireframe "tears" burst into it, one by one — they
 *               need an actual sky to tear open in for the visual to read
 *   briefing  → the commander's voice cuts in over comms — a mandatory
 *               typewriter-revealed briefing over that same sky (deliberately
 *               no skip control: unlike the sample paragraph this superseded,
 *               this part of the story always plays)
 *   fadeOut   → the assembled scene — sky, text, and all — dissolves to black
 *   title     → "3290" — the game's name, deliberately doubling as the
 *               year the story is set in — appears with a PLAY button,
 *               which is the actual gate into gameplay
 *
 * The starfield is the same Starfield entity GameplayScene composes —
 * shared rather than duplicated since both scenes need the identical
 * drifting sky — but it only renders from "portals" onward: the year
 * card and title beats are deliberately plain void, framed like title
 * cards rather than views into space.
 *
 * `_beat` + `_beatAge` track where the sequence is; beats with a fixed
 * duration call `_advanceBeat` themselves once their time is up, while
 * `title` simply waits for `handleTap` to land on PLAY and fire
 * `onContinue` — the constructor-injected completion callback `Game`
 * uses to swap in GameplayScene, following the same shape IntroScene
 * uses for its own handoff.
 */
import { Config } from '../core/Config.js';
import { Portal } from '../entities/Portal.js';
import { Starfield } from '../entities/Starfield.js';

export class PrologueScene {
  /**
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {{ onContinue: () => void }} options  called once PLAY is tapped
   */
  constructor(renderer, { onContinue }) {
    this.renderer = renderer;
    this.onContinue = onContinue;

    this._beat = 'yearCard';
    this._beatAge = 0;

    this._starfield = new Starfield();
    this._portals = this._createPortals();

    // Wrapped + flattened up front, exactly like the typewriter overlay
    // this superseded — the reveal counter and blips both walk the
    // flattened sequence so they can never drift from what's on screen.
    this._briefingLines = this._wrapBriefing(renderer);
    this._briefingLineOffsets = this._computeLineOffsets(this._briefingLines);
    this._briefingRevealText = this._briefingLines.join('');
    this._revealedCount = 0;
    this._briefingHoldAge = 0;
    this._nonSpaceRevealCount = 0; // walks alongside the reveal — see _playBlipsBetween for why it's not 1:1 with characters
    this._blipTemplate = null;
  }

  /** Advance whichever beat is current; each one decides for itself when it's done. */
  update(dt) {
    this._beatAge += dt;
    this._starfield.update(dt); // always scrolling underneath, whether or not the current beat draws it

    // The portals stay alive (and on screen — see _renderBriefing/_renderFadeOut)
    // through every beat from their entrance onward, not just their own —
    // gated here rather than always-on so their staggered appear timers don't
    // start ticking (and finish) before "portals" actually begins to draw them.
    if (this._beat !== 'yearCard') {
      for (const portal of this._portals) portal.update(dt);
    }

    switch (this._beat) {
      case 'yearCard': return this._updateYearCard();
      case 'portals': return this._updatePortals();
      case 'briefing': return this._updateBriefing(dt);
      case 'fadeOut': return this._updateFadeOut();
      case 'title': return; // waits for a tap on PLAY — see handleTap
    }
  }

  /** PLAY is the only interactive element here, and only once the title beat arrives. */
  handleTap(x, y) {
    if (this._beat !== 'title') return;
    if (this._isInsidePlayButton(x, y)) this.onContinue();
  }

  render() {
    switch (this._beat) {
      case 'yearCard': return this._renderYearCard();
      case 'portals': return this._renderPortals();
      case 'briefing': return this._renderBriefing();
      case 'fadeOut': return this._renderFadeOut();
      case 'title': return this._renderTitle();
    }
  }

  _advanceBeat(next) {
    this._beat = next;
    this._beatAge = 0;
  }

  // --- Beat 1: year card ------------------------------------------------------

  _updateYearCard() {
    const { fadeInDuration, holdDuration, fadeOutDuration } = Config.prologue.yearCard;
    if (this._beatAge >= fadeInDuration + holdDuration + fadeOutDuration) this._advanceBeat('portals');
  }

  _renderYearCard() {
    const { text, font, textColor, fadeInDuration, holdDuration, fadeOutDuration } = Config.prologue.yearCard;
    const { width: vW, height: vH } = Config.virtual;
    const alpha = this._inOutAlpha(this._beatAge, fadeInDuration, holdDuration, fadeOutDuration);

    this.renderer.clear(Config.colors.void);
    this.renderer.drawText(text, vW / 2, vH * 0.46, { font, color: textColor, alpha });
  }

  // --- Beat 2: portals ---------------------------------------------------------

  _createPortals() {
    const { positions, staggerDelay } = Config.prologue.portals;
    const { width: vW, height: vH } = Config.virtual;
    return positions.map(({ xRatio, yRatio }, i) => new Portal({
      x: vW * xRatio,
      y: vH * yRatio,
      delay: i * staggerDelay,
    }));
  }

  _updatePortals() {
    // The portals themselves are advanced centrally in `update` (they stay
    // alive through later beats too) — this just watches for the moment to
    // hand off to the briefing beat.
    const { appearDuration, staggerDelay, holdDuration } = Config.prologue.portals;
    const lastAppearEnd = (this._portals.length - 1) * staggerDelay + appearDuration;
    if (this._beatAge >= lastAppearEnd + holdDuration) this._advanceBeat('briefing');
  }

  /** The sky fades in alongside the portals — synced to their own appear timing so both reveal as one moment. */
  _renderPortals() {
    const { appearDuration } = Config.prologue.portals;
    const skyAlpha = Math.min(this._beatAge / appearDuration, 1);

    this.renderer.clear(Config.colors.void);
    this._starfield.render(this.renderer, skyAlpha);
    for (const portal of this._portals) portal.render(this.renderer);
  }

  // --- Beat 3: briefing ---------------------------------------------------------

  /** Greedy word-wrap using real glyph metrics — same technique the typewriter overlay this superseded used. */
  _wrapBriefing(renderer) {
    const { text, font, sideMargin } = Config.prologue.briefing;
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

  /** Each line's starting index within the flattened reveal text — maps the reveal count back to lines. */
  _computeLineOffsets(lines) {
    const offsets = [];
    let offset = 0;
    for (const line of lines) {
      offsets.push(offset);
      offset += line.length;
    }
    return offsets;
  }

  _updateBriefing(dt) {
    const { charsPerSecond, holdDuration } = Config.prologue.briefing;

    if (this._revealedCount < this._briefingRevealText.length) {
      const previous = Math.floor(this._revealedCount);
      this._revealedCount = Math.min(this._revealedCount + charsPerSecond * dt, this._briefingRevealText.length);
      this._playBlipsBetween(previous, Math.floor(this._revealedCount));
      return;
    }

    this._briefingHoldAge += dt;
    if (this._briefingHoldAge >= holdDuration) this._advanceBeat('fadeOut');
  }

  /** The portals stay on screen, still churning above, while the commander's voice plays out below them. */
  _renderBriefing() {
    this.renderer.clear(Config.colors.void);
    this._starfield.render(this.renderer);
    for (const portal of this._portals) portal.render(this.renderer);
    this._drawBriefingText(Math.floor(this._revealedCount));
  }

  /**
   * Centered, in a small fixed-size "subtitle window" anchored near the
   * bottom edge: the line currently being revealed always sits at
   * `_briefingAnchorY`, with up to `maxVisibleLines - 1` finished lines
   * stacked above it. Once a new line begins, the oldest visible one
   * simply stops being drawn — so a long briefing never grows taller
   * than the window, it just keeps scrolling its newest line into a
   * fixed slot (unlike the corner-anchored overlay this superseded,
   * which had to fit its whole paragraph on screen at once).
   */
  _drawBriefingText(revealedCount) {
    const { font, textColor, lineHeight, maxVisibleLines } = Config.prologue.briefing;
    const { width: vW } = Config.virtual;
    const anchorY = this._briefingAnchorY();
    const currentLine = this._currentBriefingLine(revealedCount);
    const firstVisibleLine = Math.max(0, currentLine - maxVisibleLines + 1);

    for (let i = firstVisibleLine; i <= currentLine; i++) {
      const line = this._briefingLines[i];
      const visibleLength = Math.max(0, Math.min(line.length, revealedCount - this._briefingLineOffsets[i]));
      if (visibleLength === 0) continue;

      const y = anchorY - (currentLine - i) * lineHeight;
      this.renderer.drawText(line.slice(0, visibleLength), vW / 2, y, {
        font,
        color: textColor,
        align: 'center',
      });
    }
  }

  /** The fixed baseline the most-recently-revealed line always sits at — `bottomMargin` above the bottom edge, regardless of how long the briefing runs. */
  _briefingAnchorY() {
    return Config.virtual.height - Config.prologue.briefing.bottomMargin;
  }

  /** Index of the line the reveal is currently inside (or resting on, once finished). `_briefingLineOffsets` is ascending, so the last one at or before `revealedCount` wins. */
  _currentBriefingLine(revealedCount) {
    let index = 0;
    for (let i = 0; i < this._briefingLineOffsets.length; i++) {
      if (this._briefingLineOffsets[i] <= revealedCount) index = i;
    }
    return index;
  }

  /**
   * One blip per `everyNChars`-th newly-revealed non-space character —
   * not every single one (see Config.prologue.briefing.blip for why:
   * one-per-letter at a readable pace piles overlapping clips into a
   * stutter rather than a smooth cadence).
   */
  _playBlipsBetween(fromIndex, toIndex) {
    const { everyNChars } = Config.prologue.briefing.blip;

    for (let i = fromIndex; i < toIndex; i++) {
      if (this._briefingRevealText[i] === ' ') continue;
      this._nonSpaceRevealCount++;
      if (this._nonSpaceRevealCount % everyNChars === 0) this._playBlip();
    }
  }

  /** Each blip clones a lazily-created template `Audio` so overlapping plays layer instead of cutting each other off. */
  _playBlip() {
    const { src, volume } = Config.prologue.briefing.blip;
    if (!this._blipTemplate) this._blipTemplate = new Audio(src);

    const blip = this._blipTemplate.cloneNode();
    blip.volume = volume;
    blip.play().catch(() => {});
  }

  // --- Beat 4: fade to black -----------------------------------------------------

  _updateFadeOut() {
    if (this._beatAge >= Config.prologue.fadeOutDuration) this._advanceBeat('title');
  }

  /** Redraw the briefing's final frame — sky, portals, and all — then lay an ever-darkening overlay on top — see Renderer.clear's alpha. */
  _renderFadeOut() {
    this.renderer.clear(Config.colors.void);
    this._starfield.render(this.renderer);
    for (const portal of this._portals) portal.render(this.renderer);
    this._drawBriefingText(this._briefingRevealText.length);

    const overlayAlpha = Math.min(this._beatAge / Config.prologue.fadeOutDuration, 1);
    this.renderer.clear(Config.colors.void, overlayAlpha);
  }

  // --- Beat 5: title + PLAY --------------------------------------------------------

  _renderTitle() {
    const { text, font, textColor, fadeInDuration } = Config.prologue.title;
    const { width: vW } = Config.virtual;
    const alpha = Math.min(this._beatAge / fadeInDuration, 1);

    this.renderer.clear(Config.colors.void);
    this.renderer.drawText(text, vW / 2, this._titleY(), { font, color: textColor, alpha });
    this._renderPlayButton(alpha);
  }

  _titleY() {
    return Config.virtual.height * 0.42;
  }

  _playButtonBounds() {
    const { width, height, offsetBelowTitle } = Config.prologue.title.playButton;
    const centerX = Config.virtual.width / 2;
    const centerY = this._titleY() + offsetBelowTitle;
    return {
      left: centerX - width / 2,
      top: centerY - height / 2,
      right: centerX + width / 2,
      bottom: centerY + height / 2,
    };
  }

  _isInsidePlayButton(x, y) {
    const { left, top, right, bottom } = this._playButtonBounds();
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  _renderPlayButton(alpha) {
    const { label, font, color, lineWidth, glowBlur } = Config.prologue.title.playButton;
    const { left, top, right, bottom } = this._playButtonBounds();

    this.renderer.strokePaths(
      [{ points: [[left, top], [right, top], [right, bottom], [left, bottom]] }],
      { color, lineWidth, glowBlur, alpha }
    );
    this.renderer.drawText(label, (left + right) / 2, (top + bottom) / 2, { font, color, alpha });
  }

  // --- Shared helpers -----------------------------------------------------------------

  /** Fade in over `fadeIn`, hold at full opacity for `hold`, then fade out over `fadeOut` — drives the year card. */
  _inOutAlpha(age, fadeIn, hold, fadeOut) {
    if (age < fadeIn) return age / fadeIn;
    if (age < fadeIn + hold) return 1;
    return Math.max(0, 1 - (age - fadeIn - hold) / fadeOut);
  }
}
