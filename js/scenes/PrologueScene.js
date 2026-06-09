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

    this._yearRevealedCount = 0; // fractional char count — drives letter-by-letter reveal
    this._yearHoldAge = 0;       // accumulates AFTER the text is fully typed (hold + fade-out)

    this._starfield = new Starfield();
    this._portals = this._createPortals();

    // Wrapped up front (text and font never change), then split into
    // per-line word lists with each line's starting word-index recorded —
    // the reveal counter walks *words*, not characters, so the typewriter
    // unveils a whole word at a time (see _updateBriefing/_drawBriefingText).
    this._briefingLines = this._wrapBriefing(renderer);
    this._briefingLineWords = this._briefingLines.map((line) => line.split(' '));
    this._briefingLineWordOffsets = this._computeWordOffsets(this._briefingLineWords);
    this._briefingWordCount = this._briefingLineWords.reduce((sum, words) => sum + words.length, 0);
    this._revealedWordCount = 0;
    this._briefingHoldAge = 0;
    this._blipTimer = 0; // ticks on its own faster clock — see _advanceBlips for why it's decoupled from the word reveal
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
      case 'yearCard': return this._updateYearCard(dt);
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

  _updateYearCard(dt) {
    const { text, charsPerSecond, holdDuration, fadeOutDuration } = Config.prologue.yearCard;

    // Phase 1 — type letters in one by one; play a blip on each non-space char.
    if (this._yearRevealedCount < text.length) {
      const previous = Math.floor(this._yearRevealedCount);
      this._yearRevealedCount = Math.min(this._yearRevealedCount + charsPerSecond * dt, text.length);
      const current = Math.floor(this._yearRevealedCount);
      for (let i = previous; i < current; i++) {
        if (text[i] !== ' ') this._playBlip();
      }
      return;
    }

    // Phase 2 — hold then fade out; beat ends once both are done.
    this._yearHoldAge += dt;
    if (this._yearHoldAge >= holdDuration + fadeOutDuration) this._advanceBeat('portals');
  }

  _renderYearCard() {
    const { text, font, textColor, holdDuration, fadeOutDuration } = Config.prologue.yearCard;
    const { width: vW, height: vH } = Config.virtual;

    // Fade-out alpha: only kicks in after hold is done, ramps 1 → 0.
    let fadeAlpha = 1;
    if (this._yearRevealedCount >= text.length) {
      const inFadeOut = Math.max(0, this._yearHoldAge - holdDuration);
      fadeAlpha = Math.max(0, 1 - inFadeOut / fadeOutDuration);
    }

    // Signal-interference flicker layered on top — the whole line
    // randomly dips toward transparent as if the transmission is weak.
    const alpha = fadeAlpha * this._yearCardFlickerAlpha(this._beatAge);
    const visible = text.slice(0, Math.floor(this._yearRevealedCount));

    this.renderer.clear(Config.colors.void);
    this.renderer.drawText(visible, vW / 2, vH * 0.46, { font, color: textColor, alpha });
  }

  /**
   * Three incommensurate sine waves summed together — their interference
   * pattern produces signal-drop moments that feel quasi-random without
   * being literally random (consistent flicker shape from any given t,
   * no state needed). Frequencies chosen to create dips at a cinematic
   * 1–3 Hz rather than a 60 fps frame-by-frame strobe.
   */
  _yearCardFlickerAlpha(t) {
    const noise = (Math.sin(t * 7.3) + Math.sin(t * 11.7 + 2.0) + Math.cos(t * 19.1 + 0.8)) / 3;
    return Math.max(0.08, Math.min(1, 0.8 + noise * 0.85));
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

  /** Each line's starting index in the whole-paragraph word sequence — maps the reveal count back to lines (the word equivalent of the old per-character line-offsets). */
  _computeWordOffsets(lineWords) {
    const offsets = [];
    let offset = 0;
    for (const words of lineWords) {
      offsets.push(offset);
      offset += words.length;
    }
    return offsets;
  }

  _updateBriefing(dt) {
    const { wordsPerSecond, holdDuration } = Config.prologue.briefing;

    if (this._revealedWordCount < this._briefingWordCount) {
      this._revealedWordCount = Math.min(this._revealedWordCount + wordsPerSecond * dt, this._briefingWordCount);
      this._advanceBlips(dt);
      return;
    }

    this._briefingHoldAge += dt;
    if (this._briefingHoldAge >= holdDuration) this._advanceBeat('fadeOut');
  }

  /**
   * Fire blips on their own fixed-rate clock (`blip.perSecond`) rather
   * than once per revealed word — deliberately faster than the word
   * reveal, so the "typing" sounds like a busy teletype clattering
   * underneath the calmer pace the words actually pop up at. A `while`
   * loop (not `if`) covers any frame slow enough to cross more than one
   * tick at once, so the cadence holds steady regardless of frame rate.
   */
  _advanceBlips(dt) {
    const interval = 1 / Config.prologue.briefing.blip.perSecond;
    this._blipTimer += dt;
    while (this._blipTimer >= interval) {
      this._blipTimer -= interval;
      this._playBlip();
    }
  }

  /** The portals stay on screen, still churning above, while the commander's voice plays out below them. */
  _renderBriefing() {
    this.renderer.clear(Config.colors.void);
    this._starfield.render(this.renderer);
    for (const portal of this._portals) portal.render(this.renderer);
    this._drawBriefingText(Math.floor(this._revealedWordCount));
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
  _drawBriefingText(revealedWordCount) {
    const { font, textColor, lineHeight, maxVisibleLines } = Config.prologue.briefing;
    const { width: vW } = Config.virtual;
    const anchorY = this._briefingAnchorY();
    const currentLine = this._currentBriefingLine(revealedWordCount);
    const firstVisibleLine = Math.max(0, currentLine - maxVisibleLines + 1);

    for (let i = firstVisibleLine; i <= currentLine; i++) {
      const words = this._briefingLineWords[i];
      const visibleWordCount = Math.max(0, Math.min(words.length, revealedWordCount - this._briefingLineWordOffsets[i]));
      if (visibleWordCount === 0) continue;

      const y = anchorY - (currentLine - i) * lineHeight;
      this.renderer.drawText(words.slice(0, visibleWordCount).join(' '), vW / 2, y, {
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

  /** Index of the line the reveal is currently inside (or resting on, once finished). `_briefingLineWordOffsets` is ascending, so the last one at or before `revealedWordCount` wins. */
  _currentBriefingLine(revealedWordCount) {
    let index = 0;
    for (let i = 0; i < this._briefingLineWordOffsets.length; i++) {
      if (this._briefingLineWordOffsets[i] <= revealedWordCount) index = i;
    }
    return index;
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
    this._drawBriefingText(this._briefingWordCount);

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
}
