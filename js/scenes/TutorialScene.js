/**
 * TutorialScene.js
 * Tutorial overlay that plays once between the title screen and the player's
 * first gameplay session. The full gameplay backdrop — starfield, barrier
 * (with its permanent SHIELD readout), HUD (score/gold/health), the Enemy
 * Codex button, the mute/pause buttons, and the special-skill button — is
 * visible behind a dimming overlay, so every hint highlights the real UI
 * element it describes rather than a mock diagram. Codex/PlaybackControls/
 * PlayerSkill are constructed here purely as inert display chrome — their
 * `_open`/`_paused`/cooldown state never gets touched (this scene never
 * forwards taps into them, and PlayerSkill's `.use()` is never called), so
 * they only ever render their idle always-visible/always-ready button, never
 * an overlay or a mid-cooldown state.
 *
 * Nine sequential hints — movement/auto-fire, score/combo, health, the
 * barrier's shield, earning gold, spending it in the Shop, rarer power-up
 * drops, the Enemy Codex + mute/pause row (merged into one hint — they're
 * three buttons in a single adjacent row, see UTILITY_BOX below), and the
 * special-skill bomb last — advance on tap or swipe-up, but only once a
 * hint's text has fully finished typing out; taps/swipes while it's still
 * revealing are ignored outright (see `_advance`), so the player can't blow
 * past a line before ever reading it. The very first hint additionally
 * suppresses swipe-up entirely (see `handleSwipeUp`) — its own copy invites
 * an exploratory "drag anywhere," and an upward drag is a likely first thing
 * to try, which would otherwise silently self-advance the tutorial the
 * instant that hint finishes typing. After the last hint `onContinue` fires
 * and GameplayScene takes over, which starts the normal player fly-in.
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
 * under the same flat dark veil as the rest of the screen. A second, much
 * softer glow (`_renderSpotlightGlow`) is traced along that same cutout
 * boundary, with a bigger blur and a deeper/faster pulse than the brackets
 * use, so the spotlight itself reads as an obviously animated, glowing
 * highlight rather than a static hole in the dim. All three (bracket, dim
 * cutout, glow) are built once in the constructor from static box literals
 * (only alpha animates per frame). Hints with no specific on-screen target
 * (movement and power-ups, which use small demo animations instead — see
 * `_renderDemo`) simply carry `highlight: null` and fall back to a plain
 * full-screen dim.
 */
import { Config } from '../core/Config.js';
import { Barrier } from '../entities/Barrier.js';
import { HUD } from '../entities/HUD.js';
import { Starfield } from '../entities/Starfield.js';
import { EnemyCodex } from '../entities/EnemyCodex.js';
import { PlaybackControls } from '../entities/PlaybackControls.js';
import { PlayerSkill } from '../entities/PlayerSkill.js';
import { wrapText, computeWordOffsets } from '../core/textLayout.js';
import { AudioPool } from '../core/AudioPool.js';
import { cornerBracketPath, crossPath, diamondPath, boltPath, hexPath } from '../core/shapes.js';

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
const MUTE_BTN = Config.playbackControls.muteButton;
const PAUSE_BTN = Config.playbackControls.pauseButton;

// Right/bottom edges sized to the panels' real worst-case text extent (a
// 5-6 digit score/gold value plus the "BEST" line, in the wide Audiowide
// display font) rather than a flat oversized guess — tight enough to read
// as "framing this content" instead of "framing this general area", while
// still leaving a visible few-px pad on every edge. SCORE_BOX and GOLD_BOX
// are deliberately the same width AND height (mirrored left/right off their
// shared top edge) even though the gold panel's own content is shorter (no
// "BEST" line) — matching dimensions read as "these two panels are peers"
// at a glance, rather than the asymmetry of a tight per-content fit.
const SCORE_BOX = { left: HUD_MARGIN - 6, top: HUD_MARGIN - 6, right: HUD_MARGIN + 110, bottom: HUD_MARGIN + 70 };
// Also the Shop's own tap target (HUD.isInsideGoldPanel opens it) — reused
// verbatim by the SHOP hint below, so the same spotlight covers both
// "here's where gold shows up" and "here's where you spend it."
const GOLD_BOX  = { left: V_W - HUD_MARGIN - 110, top: HUD_MARGIN - 6, right: V_W - HUD_MARGIN + 6, bottom: HUD_MARGIN + 70 };
// Symmetric padding on both sides of the bar's true center (HUD_HEALTH.x).
// No need to reserve extra room for the low-health "!" icon here — this
// scene always renders the HUD preview at full health (see render()'s own
// note), so that icon never actually appears; the pad is just breathing
// room around the bar and its label.
const HEALTH_PAD = 14;
const HEALTH_BOX = {
  left: HUD_HEALTH.x - HUD_HEALTH.width / 2 - HEALTH_PAD,
  top: HUD_HEALTH.y - 8,
  right: HUD_HEALTH.x + HUD_HEALTH.width / 2 + HEALTH_PAD,
  bottom: HUD_HEALTH.y + HUD_HEALTH.height + 26,
};
const BARRIER_BOX = { left: V_W / 2 - 70, top: BARRIER_PEAK_Y + 16, right: V_W / 2 + 70, bottom: BARRIER_PEAK_Y + 66 };
// Spans the mute/Codex/pause row in one box (all three sit at the same y,
// evenly spaced — see Config.playbackControls/Config.codex) rather than a
// separate box per button — one bracket around one zone of adjacent,
// related controls reads clearly; the old CODEX_BOX this used to also cover
// on its own sat entirely inside these same bounds anyway.
const UTILITY_BOX = {
  left: MUTE_BTN.x - MUTE_BTN.radius - 3, top: MUTE_BTN.y - MUTE_BTN.radius - 3,
  right: PAUSE_BTN.x + PAUSE_BTN.radius + 3, bottom: PAUSE_BTN.y + PAUSE_BTN.radius + 3,
};
const SKILL_BTN = Config.playerSkill;
const SKILL_BOX = {
  left: SKILL_BTN.x - SKILL_BTN.radius - 3, top: SKILL_BTN.y - SKILL_BTN.radius - 3,
  right: SKILL_BTN.x + SKILL_BTN.radius + 3, bottom: SKILL_BTN.y + SKILL_BTN.radius + 3,
};

/**
 * Static hint definitions.
 *   text      — sentence(s) to typewrite word by word
 *   textCY    — virtual y center of the text block (chosen so text never
 *               sits on top of the UI element being highlighted)
 *   highlight — {left, top, right, bottom} box to frame with a pulsing
 *               corner-bracket highlight; null = no fixed on-screen target
 *   demo      — 'controls' | 'powerups' | undefined — which small demo
 *               animation to show in place of a highlight (see _renderDemo);
 *               undefined for every hint that has a real `highlight` box
 */
const HINTS = [
  {
    text: 'Drag anywhere to steer your ship — it follows your finger. Your cannon fires automatically.',
    textCY: 480,
    highlight: null,
    demo: 'controls',
  },
  {
    text: 'Destroy enemies to earn SCORE. Chain kills without taking damage for a COMBO multiplier.',
    textCY: 420,
    highlight: SCORE_BOX,
  },
  {
    text: 'This is your ship\'s HEALTH. Taking hits drains it — watch for the red pulse and warning beep when it\'s critical.',
    textCY: 420,
    highlight: HEALTH_BOX,
  },
  {
    text: 'This is the barrier\'s SHIELD, protecting Earth. If it falls, your run ends.',
    textCY: 380,
    highlight: BARRIER_BOX,
  },
  {
    text: 'Kills also drop GOLD — fly through it to collect.',
    textCY: 420,
    highlight: GOLD_BOX,
  },
  {
    text: 'Tap here to open the SHOP and spend gold upgrading your wings, engine, cannon, magnet, and missiles.',
    textCY: 420,
    highlight: GOLD_BOX,
  },
  {
    text: 'Rare pickups fall too — green restores your HEALTH, cyan repairs the barrier\'s SHIELD. Gold and white grant a brief combat boost.',
    textCY: 480,
    highlight: null,
    demo: 'powerups',
  },
  {
    text: 'Tap ? anytime for the Enemy Codex — a reference for every enemy you\'ll face. These icons pause the action or mute the sound.',
    textCY: 420,
    highlight: UTILITY_BOX,
  },
  {
    text: 'This is your special attack — it clears the screen and hits bosses hard. It needs time to recharge after use.',
    textCY: 420,
    highlight: SKILL_BOX,
  },
];

// Controls-demo constants — the orbiting hand icon shown on the movement hint
const DEMO_CX     = 270;  // virtual x — center of the orbit (screen center)
const DEMO_CY     = 660;  // virtual y — below the hint text, above the barrier
const DEMO_RADIUS = 32;   // virtual px orbit radius
const DEMO_SPEED  = 1.4;  // radians / second

// Power-ups-demo constants — four static icons in a row at the SAME anchor
// the controls demo uses (DEMO_CX/DEMO_CY) — only one demo is ever visible
// at a time, so there's no reason to reserve a second region of screen for it.
const POWERUP_DEMO_OFFSETS = [-75, -25, 25, 75]; // x offsets from DEMO_CX, one per icon below
const POWERUP_DEMO_BOB_SPEED = 2.2;  // radians/second — gentle vertical bob
const POWERUP_DEMO_BOB_AMOUNT = 5;   // virtual px
const POWERUP_DEMO_PHASE = 1.4;      // radians of stagger between each icon, so they don't bob in lockstep

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
    this._playerSkill = new PlayerSkill();

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

    this._initHints(); // wraps text + pre-allocates highlight bracket geometry
    this._initDemos(); // pre-allocates the controls hand-icon + power-ups icon geometry
  }

  update(dt) {
    if (this._done) return; // onContinue has already fired — see the constructor's _done doc
    this._age += dt;
    this._starfield.update(dt);
    this._codex.update(dt);
    this._playback.update(dt);
    this._playerSkill.update(dt);
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
    this._hud.render(renderer, Config.player.engine.levels[0].maxHealth);
    // Codex/PlaybackControls/PlayerSkill only ever render their idle button
    // here — see the class doc for why their overlay/pause/cooldown state
    // is never touched (PlayerSkill's cooldown timer starts at 0 and is
    // never advanced by a real `.use()` call in this scene, so it always
    // renders its "ready" pulse).
    this._codex.render(renderer);
    this._playback.render(renderer);
    this._playerSkill.render(renderer);

    // Fade in from black — covers the cut from PrologueScene's black fade-out
    if (this._age < fadeInDuration) {
      renderer.clear(Config.colors.void, 1 - this._age / fadeInDuration);
      return;
    }

    // Breathing room: backdrop fully lit, no hints yet
    if (this._age < hintStartDelay) return;

    // Dimming overlay fades in over 0.3 s as hints begin — avoids a jarring pop
    this._renderDimOverlay(Math.min((this._age - hintStartDelay) / 0.3, 1) * overlayAlpha);

    this._renderSpotlightGlow();
    this._renderHint();
    this._renderHighlight();
    this._renderDemo();
    this._renderTapPrompt();
  }

  /**
   * Tap advances to the next hint, but only once the current one has fully
   * typed out — see `_advance`. Swipe-up does the same, EXCEPT on the
   * movement hint (see class doc) — its own copy invites "drag anywhere,"
   * and an upward drag is exactly what a first-time player is likely to try
   * first, which must not double as "skip this hint."
   */
  handleTap(_x, _y) { if (!this._done) this._advance(); }
  handleSwipeUp() {
    if (this._done) return;
    if (HINTS[this._hintIndex].demo === 'controls') return;
    this._advance();
  }

  // ---------------------------------------------------------------------------

  _advance() {
    if (this._age < Config.tutorial.hintStartDelay) return; // ignore taps during breathing room
    if (!this._tapReady) return; // ignore taps while the typewriter is still revealing — no skipping unread text
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

    // Progress indicator (e.g. "2 / 9") above the text block
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
   * the rest of the screen. Hints with no highlight (movement, power-ups)
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
   * Soft, pulsing glow traced along the spotlight cutout's own boundary —
   * drawn between the dim veil and the crisp corner brackets, so the lit
   * window itself visibly glows rather than just "the dim doesn't cover
   * this part." Much bigger glowBlur and a deeper/faster pulse than the
   * brackets use (see Config.tutorial's spotlightGlow* fields), on purpose —
   * this is meant to be the obviously-animated part of the highlight.
   */
  _renderSpotlightGlow() {
    const glow = this._hintSpotlightGlow[this._hintIndex];
    if (!glow) return;

    const { highlightColor, spotlightGlowLineWidth, spotlightGlowBlur, spotlightGlowPulseSpeed, spotlightGlowPulseDepth } = Config.tutorial;
    const fadeIn = Math.min(this._hintAge / 0.5, 1);
    const pulse = 1 - spotlightGlowPulseDepth * (0.5 + 0.5 * Math.sin(this._hintAge * spotlightGlowPulseSpeed));

    this.renderer.strokePaths(glow, {
      color: highlightColor, lineWidth: spotlightGlowLineWidth,
      glowBlur: spotlightGlowBlur, glowColor: highlightColor, alpha: fadeIn * pulse,
    });
  }

  /**
   * Pulsing 4-corner bracket frame around the current hint's target UI
   * element (null for hints with no specific on-screen target). The box
   * itself is static — pre-built in _initHints — only the fade-in and
   * breathing-pulse alpha change per frame.
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
    this._hintSpotlightGlow = [];
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
        this._hintSpotlightGlow.push(null);
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

      // Glow ring traced along that exact cutout boundary — see _renderSpotlightGlow.
      this._hintSpotlightGlow.push([rectPath(sLeft, sTop, sRight, sBottom)]);
    }
  }

  /**
   * Pre-allocate geometry for both no-highlight demo animations (see
   * `_renderDemo`). The finger body is authored at local (0,0) facing
   * upward; strokePaths rotates it each frame via its `rotation` parameter
   * so no point mutation is needed — only x/y change. The orbit circle is
   * fully static. The power-up icons reuse the exact same path helpers
   * (and the same `d` size formula) PowerUps.js itself builds its real
   * pickups from — see core/shapes.js — so this preview matches real drops
   * shape-for-shape and color-for-color, not an approximation.
   */
  _initDemos() {
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

    // Power-up icons — local-space, origin-centered, repositioned per-icon
    // at render time via each strokePaths/fillStrokePaths call's own {x, y}.
    const d = Config.powerUps.radius * 0.45;
    this._powerUpCrossPathArr   = [crossPath(0, 0, d)];
    this._powerUpDiamondPathArr = [diamondPath(0, 0, Config.powerUps.radius * 0.5)];
    this._powerUpBoltPathArr    = [boltPath(0, 0, d)];
    this._powerUpHexPathArr     = [hexPath(0, 0, d)];
  }

  /** Dispatches to whichever demo (if any) the current hint calls for — see HINTS' own `demo` field doc. */
  _renderDemo() {
    const demo = HINTS[this._hintIndex].demo;
    if (demo === 'controls') this._renderControlsDemo();
    else if (demo === 'powerups') this._renderPowerUpsDemo();
  }

  /** Orbiting hand icon — the movement hint's demo. */
  _renderControlsDemo() {
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

  /**
   * Four gently-bobbing pickup icons — the power-ups hint's demo. Rendered
   * with the exact same "colored ring + glyph" layering PowerUps.render
   * uses for the real pickups (fillEllipse backdrop, strokeCircle ring,
   * filled icon glyph — invincible's hex stays outline-only, same
   * convention Config.powerUps.iconFillColor's own comment establishes) and
   * the same alpha-breathing pulse (Config.powerUps.pulseSpeed/pulseDepth),
   * so recognizing these transfers directly into recognizing real drops.
   */
  _renderPowerUpsDemo() {
    const { renderer } = this;
    const { radius, lineWidth, glowBlur, pulseSpeed, pulseDepth, iconFillColor, health, shield, fireBoost, invincible } = Config.powerUps;
    const fadeIn = Math.min(this._hintAge / 0.5, 1);
    const pulseAlpha = 1 - pulseDepth * (0.5 + 0.5 * Math.sin(this._hintAge * pulseSpeed));
    const alpha = fadeIn * pulseAlpha;

    const icons = [
      { cfg: health,     pathArr: this._powerUpCrossPathArr },
      { cfg: shield,     pathArr: this._powerUpDiamondPathArr },
      { cfg: fireBoost,  pathArr: this._powerUpBoltPathArr },
      { cfg: invincible, pathArr: this._powerUpHexPathArr, outline: true },
    ];

    for (let i = 0; i < icons.length; i++) {
      const { cfg, pathArr, outline } = icons[i];
      const x = DEMO_CX + POWERUP_DEMO_OFFSETS[i];
      const y = DEMO_CY + Math.sin(this._hintAge * POWERUP_DEMO_BOB_SPEED + i * POWERUP_DEMO_PHASE) * POWERUP_DEMO_BOB_AMOUNT;

      renderer.fillEllipse(0, 0, radius, radius, { x, y, fillColor: cfg.fillColor, alpha });
      renderer.strokeCircle(x, y, radius, { color: cfg.color, lineWidth, glowBlur, alpha });
      if (outline) {
        renderer.strokePaths(pathArr, { x, y, color: cfg.color, lineWidth: lineWidth * 1.4, glowBlur: glowBlur * 0.5, alpha });
      } else {
        renderer.fillStrokePaths(pathArr, { x, y, fillColor: iconFillColor, strokeColor: cfg.color, lineWidth, alpha });
      }
    }
  }
}
