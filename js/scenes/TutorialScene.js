/**
 * TutorialScene.js
 * Tutorial overlay that plays once between the title screen and the player's
 * first gameplay session. The full gameplay backdrop — starfield, barrier
 * (with its permanent SHIELD health readout), HUD (score/gold/health), the
 * Enemy Codex button, and the mute/pause buttons — is visible behind a
 * dimming overlay, so every hint highlights the real UI element it
 * describes rather than a mock diagram. Codex/PlaybackControls are
 * constructed here purely as inert display chrome — their `_open`/`_paused`
 * state never gets touched (this scene never forwards taps into them), so
 * they only ever render their idle always-visible button, never an overlay.
 *
 * Seven sequential hints advance on tap or swipe-up. The first tap/swipe
 * during a still-typing hint fast-forwards the typewriter to completion;
 * the second advances to the next hint. After the last hint `onContinue`
 * fires and GameplayScene takes over, which starts the normal player fly-in.
 *
 * Typewriter reveal + blip pool: the same word-at-a-time pattern as
 * PrologueScene's briefing beat — see that file for the design rationale.
 *
 * Highlight geometry: each hint that targets a real piece of UI gets a
 * pulsing 4-corner bracket frame (the same `cornerBracketPath` motif used
 * throughout the game's chrome — HUD panels, title screen, Enemy Codex)
 * drawn around that UI element's bounding box, PLUS a spotlight cutout — the
 * dim overlay is punched out in a padded window around that same box (see
 * `_renderDimOverlay`) so the target reads as lit up rather than sitting
 * under the same flat dark veil as the rest of the screen. Both the bracket
 * and the cutout frame are built once in the constructor from static box
 * literals (only alpha animates per frame). Hints with no specific
 * on-screen target (the movement hint, which uses the orbiting hand demo
 * instead) simply carry `highlight: null` and fall back to a plain
 * full-screen dim.
 */
import { Config } from '../core/Config.js';
import { Barrier } from '../entities/Barrier.js';
import { HUD } from '../entities/HUD.js';
import { Starfield } from '../entities/Starfield.js';
import { EnemyCodex } from '../entities/EnemyCodex.js';
import { PlaybackControls } from '../entities/PlaybackControls.js';
import { wrapText, computeWordOffsets } from '../core/textLayout.js';
import { AudioPool } from '../core/AudioPool.js';
import { cornerBracketPath } from '../core/shapes.js';

/** A filled axis-aligned rectangle path, for the dim overlay's spotlight cutout frame. */
function rectPath(x0, y0, x1, y1) {
  return { points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true };
}

// Highlight bounding boxes — each computed from the real Config values that
// position the UI element being described, plus a small hand-authored
// padding constant, so the bracket frame tracks the actual chrome instead of
// a hand-guessed rectangle that could silently drift out of sync with it.
// Padding is kept symmetric around each element's real anchor point/axis so
// the bracket (and spotlight cutout) reads as centered on it.
const { width: V_W, height: V_H } = Config.virtual;
const { margin: HUD_MARGIN, health: HUD_HEALTH } = Config.hud;
const BARRIER_PEAK_Y = Config.barrier.baseY - Config.barrier.arcHeight;
const CODEX_BTN = Config.codex.button;
const MUTE_BTN = Config.playbackControls.muteButton;
const PAUSE_BTN = Config.playbackControls.pauseButton;

const SCORE_BOX = { left: HUD_MARGIN - 8, top: HUD_MARGIN - 8, right: HUD_MARGIN + 150, bottom: HUD_MARGIN + 72 };
const GOLD_BOX  = { left: V_W - HUD_MARGIN - 150, top: HUD_MARGIN - 8, right: V_W - HUD_MARGIN + 8, bottom: HUD_MARGIN + 56 };
// Symmetric padding on both sides of the bar's true center (HUD_HEALTH.x) —
// wide enough to cover the low-health "!" icon (which only ever appears on
// the left) without making the box itself lean off-center.
const HEALTH_SIDE_PAD = HUD_HEALTH.iconOffsetX + 12;
const HEALTH_BOX = {
  left: HUD_HEALTH.x - HUD_HEALTH.width / 2 - HEALTH_SIDE_PAD,
  top: HUD_HEALTH.y - 14,
  right: HUD_HEALTH.x + HUD_HEALTH.width / 2 + HEALTH_SIDE_PAD,
  bottom: HUD_HEALTH.y + HUD_HEALTH.height + 40,
};
const BARRIER_BOX = { left: V_W / 2 - 70, top: BARRIER_PEAK_Y + 16, right: V_W / 2 + 70, bottom: BARRIER_PEAK_Y + 66 };
// A smaller outer pad than SCORE/GOLD/HEALTH use — the buttons themselves
// are already large (radius 28vp, see Config.playbackControls' comment), so
// less extra room is needed for the bracket to read clearly, and it keeps
// this box from creeping into the SCORE/GOLD panels' own estimated bounds.
const CODEX_BOX = {
  left: CODEX_BTN.x - CODEX_BTN.radius - 3, top: CODEX_BTN.y - CODEX_BTN.radius - 3,
  right: CODEX_BTN.x + CODEX_BTN.radius + 3, bottom: CODEX_BTN.y + CODEX_BTN.radius + 3,
};
const PLAYBACK_BOX = {
  left: MUTE_BTN.x - MUTE_BTN.radius - 3, top: MUTE_BTN.y - MUTE_BTN.radius - 3,
  right: PAUSE_BTN.x + PAUSE_BTN.radius + 3, bottom: PAUSE_BTN.y + PAUSE_BTN.radius + 3,
};

/**
 * Static hint definitions.
 *   text      — sentence to typewrite word by word
 *   textCY    — virtual y center of the text block (chosen so text never
 *               sits on top of the UI element being highlighted)
 *   highlight — {left, top, right, bottom} box to frame with a pulsing
 *               corner-bracket highlight; null = no highlight (e.g. the
 *               movement hint, which uses the orbiting hand demo instead)
 */
const HINTS = [
  {
    text: 'Destroy enemies to earn SCORE. It increases with each kill.',
    textCY: 420,
    highlight: SCORE_BOX,
  },
  {
    text: 'Defeating enemies earns GOLD too — it\'s credited automatically, no need to collect it.',
    textCY: 420,
    highlight: GOLD_BOX,
  },
  {
    text: 'This is your ship\'s HEALTH. Taking hits drains it — watch for the red pulse and warning beep when it\'s critical.',
    textCY: 420,
    highlight: HEALTH_BOX,
  },
  {
    text: 'The barrier shields Earth. Protect it — if its HEALTH reaches zero, the game is over.',
    textCY: 380,
    highlight: BARRIER_BOX,
  },
  {
    text: 'Drag to steer your ship. It follows your finger anywhere on screen.',
    textCY: 480,
    highlight: null, // orbiting hand demo used instead — see _renderControlsDemo
  },
  {
    text: 'Tap this icon anytime to open the Enemy Codex — a quick reference for every enemy you\'ll face.',
    textCY: 420,
    highlight: CODEX_BOX,
  },
  {
    text: 'These icons pause the action or mute the sound — handy whenever you need a breather.',
    textCY: 420,
    highlight: PLAYBACK_BOX,
  },
];

// Controls-demo constants — the orbiting hand icon shown on the movement hint (index 4)
const DEMO_CX     = 270;  // virtual x — center of the orbit (screen center)
const DEMO_CY     = 660;  // virtual y — below the hint text, above the barrier
const DEMO_RADIUS = 32;   // virtual px orbit radius
const DEMO_SPEED  = 1.4;  // radians / second

export class TutorialScene {
  /**
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {{ onContinue: () => void }} options  fired once the last hint is dismissed
   */
  constructor(renderer, { onContinue }) {
    this.renderer = renderer;
    this.onContinue = onContinue;

    this._starfield = new Starfield();
    this._barrier = new Barrier();
    this._hud = new HUD();
    this._codex = new EnemyCodex();
    this._playback = new PlaybackControls();

    this._age = 0;       // seconds since scene start — drives starfield fade-in
    this._hintIndex = 0;
    this._hintAge = 0;   // seconds on the current hint — drives highlight pulse + tap blink
    this._revealedWordCount = 0;
    this._tapReady = false; // true once the current hint's typewriter is fully revealed
    // Set right before firing onContinue (see _advance) and checked first in
    // every method below — a safety net for the handoff to GameplayScene:
    // if onContinue's chain throws for any reason, Game.scene never gets
    // reassigned, and without this guard the NEXT tick would call render()
    // with _hintIndex already past the end of HINTS, throwing inside the
    // requestAnimationFrame callback and permanently killing the game loop.
    // With it, this scene just goes inert instead — no crash, no re-throw.
    this._done = false;
    this._blipPool = new AudioPool(Config.tutorial.blip.src, 8, Config.tutorial.blip.volume);
    this._blipTimer = 0;

    this._initHints();        // wraps text + pre-allocates highlight bracket geometry
    this._initControlsDemo(); // pre-allocates hand icon + orbit path for the movement hint
  }

  update(dt) {
    if (this._done) return; // onContinue has already fired — see the constructor's _done doc
    this._age += dt;
    this._starfield.update(dt);
    this._codex.update(dt);
    this._playback.update(dt);
    // Don't advance hint state during the intro delay — hints haven't appeared yet.
    // _hintAge only starts counting once hints are actually visible so its fade-in
    // and blink timings stay relative to when the first hint is shown, not scene start.
    if (this._age < Config.tutorial.hintStartDelay) return;
    this._hintAge += dt;
    this._updateTypewriter(dt);
  }

  render() {
    if (this._done) return; // leaves the last frame on screen rather than touching now-out-of-range hint state
    const { renderer } = this;
    const { fadeInDuration, hintStartDelay, overlayAlpha } = Config.tutorial;

    renderer.clear(Config.colors.void);
    // Gameplay backdrop — real elements so highlights frame the actual UI.
    // Stars fade in alongside the black veil so the reveal feels like one motion.
    const starAlpha = Math.min(this._age / fadeInDuration, 1);
    this._starfield.render(renderer, starAlpha);
    this._barrier.render(renderer);
    // No real Player exists in this scene — this HUD is a preview of the
    // real gameplay chrome the hints point at, so it shows a nominal full
    // health bar rather than an undefined/NaN one.
    this._hud.render(renderer, Config.player.maxHealth);
    // Codex/PlaybackControls only ever render their idle button here — see
    // the class doc for why their overlay/pause state is never touched.
    this._codex.render(renderer);
    this._playback.render(renderer);

    // Fade in from black — covers the cut from PrologueScene's black fade-out
    if (this._age < fadeInDuration) {
      renderer.clear(Config.colors.void, 1 - this._age / fadeInDuration);
      return;
    }

    // Breathing room: backdrop fully lit, no hints yet
    if (this._age < hintStartDelay) return;

    // Dimming overlay fades in over 0.3 s as hints begin — avoids a jarring pop
    this._renderDimOverlay(Math.min((this._age - hintStartDelay) / 0.3, 1) * overlayAlpha);

    this._renderHint();
    this._renderHighlight();
    this._renderControlsDemo();
    this._renderTapPrompt();
  }

  /** First tap/swipe fast-forwards typewriter; second tap/swipe advances. */
  handleTap(_x, _y) { if (!this._done) this._advance(); }
  handleSwipeUp()   { if (!this._done) this._advance(); }

  // ---------------------------------------------------------------------------

  _advance() {
    if (this._age < Config.tutorial.hintStartDelay) return; // ignore taps during breathing room
    if (!this._tapReady) {
      // Fast-forward: reveal all words instantly so the second tap can advance
      this._revealedWordCount = this._hintTotalWords[this._hintIndex];
      this._tapReady = true;
      return;
    }
    this._hintIndex++;
    if (this._hintIndex >= HINTS.length) {
      // Set before calling out — if onContinue's chain throws, this scene
      // must not be left in a state where a later tick could touch
      // _hintIndex again (it's already past the end of HINTS at this point).
      this._done = true;
      this.onContinue();
      return;
    }
    this._hintAge = 0;
    this._revealedWordCount = 0;
    this._tapReady = false;
    this._blipTimer = 0;
  }

  _updateTypewriter(dt) {
    const totalWords = this._hintTotalWords[this._hintIndex];
    if (this._revealedWordCount >= totalWords) {
      this._tapReady = true;
      return;
    }
    const { wordsPerSecond } = Config.tutorial;
    this._revealedWordCount = Math.min(
      this._revealedWordCount + wordsPerSecond * dt,
      totalWords,
    );
    this._advanceBlips(dt);
  }

  _advanceBlips(dt) {
    const interval = 1 / Config.tutorial.blip.perSecond;
    this._blipTimer += dt;
    while (this._blipTimer >= interval) {
      this._blipTimer -= interval;
      this._playBlip();
    }
  }

  _playBlip() {
    this._blipPool.play();
  }

  _renderHint() {
    const idx = this._hintIndex;
    const hint = HINTS[idx];
    const lineWords = this._hintLineWords[idx];
    const wordOffsets = this._hintLineWordOffsets[idx];
    const { textFont, textColor, lineHeight, progressFont, progressColor } = Config.tutorial;
    const { width: vW } = Config.virtual;

    const lineCount = lineWords.length;
    const topLineY = hint.textCY - ((lineCount - 1) * lineHeight) / 2;
    const revealed = Math.floor(this._revealedWordCount);
    const fadeIn = Math.min(this._hintAge / 0.3, 1);

    // Progress indicator (e.g. "2 / 7") above the text block
    this.renderer.drawText(`${idx + 1} / ${HINTS.length}`, vW / 2, topLineY - 24, {
      font: progressFont, color: progressColor, alpha: fadeIn * 0.45,
    });

    // Hint text — word-by-word typewriter reveal.
    // Fully-revealed lines use the pre-joined string to avoid per-frame slice+join allocations.
    const fullLines = this._hintFullLines[idx];
    for (let i = 0; i < lineCount; i++) {
      const words = lineWords[i];
      const visible = Math.max(0, Math.min(words.length, revealed - wordOffsets[i]));
      if (visible === 0) continue;
      const text = visible >= words.length
        ? fullLines[i]
        : words.slice(0, visible).join(' ');
      this.renderer.drawText(text, vW / 2, topLineY + i * lineHeight, {
        font: textFont, color: textColor,
      });
    }
  }

  /**
   * Dim veil behind the hint text. When the current hint highlights a
   * specific UI element, the dim is punched out around it — four rectangles
   * covering everything EXCEPT a padded spotlight window around the
   * highlight box (pre-built in _initHints) — so that element renders at
   * full brightness instead of sitting under the same flat dark overlay as
   * the rest of the screen. Hints with no highlight (the movement hint)
   * fall back to the original full-screen dim.
   */
  _renderDimOverlay(alpha) {
    const frame = this._hintDimFrames[this._hintIndex];
    if (!frame) {
      this.renderer.clear(Config.colors.void, alpha);
      return;
    }
    this.renderer.fillStrokePaths(frame, {
      fillColor: Config.colors.void, strokeColor: Config.colors.void, lineWidth: 1, alpha, singleStroke: true,
    });
  }

  /**
   * Pulsing 4-corner bracket frame around the current hint's target UI
   * element (null for hints with no specific on-screen target, e.g. the
   * movement hint). The box itself is static — pre-built in _initHints —
   * only the fade-in and breathing-pulse alpha change per frame.
   */
  _renderHighlight() {
    const brackets = this._hintHighlights[this._hintIndex];
    if (!brackets) return;

    const { highlightColor, highlightGlowBlur, highlightLineWidth, highlightPulseSpeed, highlightPulseDepth } = Config.tutorial;
    const fadeIn = Math.min(this._hintAge / 0.5, 1);
    const pulse = 1 - highlightPulseDepth * (0.5 + 0.5 * Math.sin(this._hintAge * highlightPulseSpeed));

    this.renderer.strokePaths(brackets, {
      color: highlightColor, lineWidth: highlightLineWidth, glowBlur: highlightGlowBlur, alpha: fadeIn * pulse,
    });
  }

  _renderTapPrompt() {
    if (!this._tapReady) return;
    const { tapFont, tapColor } = Config.tutorial;
    const { width: vW } = Config.virtual;
    const promptY = this._hintTapPromptY[this._hintIndex];
    const blink = 0.55 + 0.45 * Math.sin(this._hintAge * 3.8);
    this.renderer.drawText('TAP TO CONTINUE', vW / 2, promptY, {
      font: tapFont, color: tapColor, alpha: blink,
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * For each hint: greedy word-wrap the text into lines (same technique as
   * PrologueScene._wrapBriefing), compute per-line word offsets for the
   * typewriter, and pre-build both the highlight bracket paths (four corner
   * ticks around the target's static bounding box) and the dim-overlay's
   * spotlight cutout frame (four rectangles surrounding a padded version of
   * that same box — see _renderDimOverlay).
   */
  _initHints() {
    const { textFont, lineHeight, textMaxWidth, highlightCornerSize, spotlightPadding } = Config.tutorial;

    this._hintLineWords = [];
    this._hintLineWordOffsets = [];
    this._hintTotalWords = [];
    this._hintFullLines = [];  // pre-joined strings — avoids slice+join allocations on fully-revealed lines
    this._hintHighlights = [];
    this._hintDimFrames = [];
    this._hintTapPromptY = [];

    for (const hint of HINTS) {
      const rawLines = wrapText(hint.text, textMaxWidth, (candidate) => this.renderer.measureText(candidate, textFont));

      // Split lines into word arrays + compute running word offsets
      const lineWordArrays = rawLines.map(l => l.split(' '));
      const offsets = computeWordOffsets(lineWordArrays);
      const totalWords = lineWordArrays.reduce((sum, words) => sum + words.length, 0);

      this._hintLineWords.push(lineWordArrays);
      this._hintLineWordOffsets.push(offsets);
      this._hintTotalWords.push(totalWords);
      // Pre-join each line's full text — used by _renderHint when the line is
      // completely revealed so the hot path skips slice() + join() allocations.
      this._hintFullLines.push(lineWordArrays.map(lw => lw.join(' ')));

      // Text bounding box half-height — the TAP prompt sits just below it
      const lineCount = lineWordArrays.length;
      const textHalfH = ((lineCount - 1) * lineHeight) / 2 + 16;
      this._hintTapPromptY.push(hint.textCY + textHalfH + lineHeight + 22);

      if (!hint.highlight) {
        this._hintHighlights.push(null);
        this._hintDimFrames.push(null);
        continue;
      }
      const { left, top, right, bottom } = hint.highlight;
      this._hintHighlights.push([
        cornerBracketPath(left, top, 1, 1, highlightCornerSize),
        cornerBracketPath(right, top, -1, 1, highlightCornerSize),
        cornerBracketPath(right, bottom, -1, -1, highlightCornerSize),
        cornerBracketPath(left, bottom, 1, -1, highlightCornerSize),
      ]);

      // Spotlight cutout: the highlight box padded outward, clamped to the
      // screen, then the dim overlay's complement — four rects tiling
      // everything OUTSIDE that padded window with no gaps/overlaps.
      const sLeft   = Math.max(0, left - spotlightPadding);
      const sTop    = Math.max(0, top - spotlightPadding);
      const sRight  = Math.min(V_W, right + spotlightPadding);
      const sBottom = Math.min(V_H, bottom + spotlightPadding);
      this._hintDimFrames.push([
        rectPath(0, 0, V_W, sTop),            // above the window
        rectPath(0, sBottom, V_W, V_H),       // below the window
        rectPath(0, sTop, sLeft, sBottom),    // left of the window
        rectPath(sRight, sTop, V_W, sBottom), // right of the window
      ]);
    }
  }

  /**
   * Pre-allocate the hand-icon geometry for the controls hint (index 4).
   * The finger body is authored at local (0,0) facing upward; strokePaths
   * rotates it each frame via its `rotation` parameter so no point mutation
   * is needed — only x/y change. The orbit circle is fully static.
   */
  _initControlsDemo() {
    // Capsule-shaped finger, pointing "up" (−y) in local space
    this._fingerPaths = [{
      points: [
        [0, -15], [7, -11], [7, 9], [0, 13], [-7, 9], [-7, -11],
      ],
      closed: true,
    }];

    // Dim circle showing the drag orbit (32 segments, fully static)
    const orbitPoints = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      orbitPoints.push([
        DEMO_CX + Math.cos(a) * DEMO_RADIUS,
        DEMO_CY + Math.sin(a) * DEMO_RADIUS,
      ]);
    }
    this._orbitPath = [{ points: orbitPoints, closed: false }];
  }

  /** Orbiting hand icon — only drawn on the movement hint (index 4). */
  _renderControlsDemo() {
    if (this._hintIndex !== 4) return;

    const { highlightColor, highlightGlowBlur } = Config.tutorial;
    const fadeIn = Math.min(this._hintAge / 0.5, 1);
    const angle  = this._hintAge * DEMO_SPEED;

    // Dim orbit ring — gives the circular drag path context
    this.renderer.strokePaths(this._orbitPath, {
      color: highlightColor, lineWidth: 1, glowBlur: 0, alpha: fadeIn * 0.3,
    });

    // Finger icon orbiting the ring, rotated tangent to the direction of motion
    this.renderer.strokePaths(this._fingerPaths, {
      x: DEMO_CX + Math.cos(angle) * DEMO_RADIUS,
      y: DEMO_CY + Math.sin(angle) * DEMO_RADIUS,
      rotation: angle + Math.PI / 2, // tangent to orbit so finger "points" where it's going
      color: highlightColor, lineWidth: 2, glowBlur: highlightGlowBlur, alpha: fadeIn,
    });
  }
}
