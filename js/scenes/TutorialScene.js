/**
 * TutorialScene.js
 * Tutorial overlay that plays once between the title screen and the player's
 * first gameplay session. The full gameplay backdrop — starfield, barrier
 * (with its permanent SHIELD health readout), and HUD — is visible behind a
 * dimming overlay, so every animated arrow points at the real UI element it
 * describes rather than a mock diagram.
 *
 * Five sequential hints advance on tap or swipe-up. The first tap/swipe
 * during a still-typing hint fast-forwards the typewriter to completion;
 * the second advances to the next hint. After the last hint `onContinue`
 * fires and GameplayScene takes over, which starts the normal player fly-in.
 *
 * Typewriter reveal + blip pool: the same word-at-a-time pattern as
 * PrologueScene's briefing beat — see that file for the design rationale.
 *
 * Arrow geometry: all point arrays are pre-allocated once in the constructor
 * and mutated in place per frame (just the bobbing tip and arrowhead base),
 * so render produces zero per-frame allocations.
 */
import { Config } from '../core/Config.js';
import { Barrier } from '../entities/Barrier.js';
import { HUD } from '../entities/HUD.js';
import { Starfield } from '../entities/Starfield.js';
import { wrapText, computeWordOffsets } from '../core/textLayout.js';
import { AudioPool } from '../core/AudioPool.js';

/**
 * Static hint definitions.
 *   text      — sentence to typewrite word by word
 *   textCY    — virtual y center of the text block (chosen so text never
 *               sits on top of the UI element the arrow is pointing at)
 *   arrowToX/Y — virtual coords the animated arrow points AT; null = no arrow
 */
const HINTS = [
  {
    text: 'Destroy enemies to earn SCORE. It increases with each kill.',
    textCY: 620,
    arrowToX: 70,  arrowToY: 55,   // score panel, top-left
  },
  {
    text: 'Enemies drop GOLD when defeated. Fly through it to collect.',
    textCY: 620,
    arrowToX: 468, arrowToY: 55,   // gold panel, top-right
  },
  {
    text: 'The barrier shields Earth. Protect it — if its HEALTH reaches zero, the game is over.',
    textCY: 380,
    arrowToX: 270, arrowToY: 922,  // barrier SHIELD health readout (peakY + 52)
  },
  {
    text: 'Drag to steer your ship. It follows your finger anywhere on screen.',
    textCY: 480,
    arrowToX: null, arrowToY: null, // orbiting hand demo used instead — see _renderControlsDemo
  },
  {
    text: 'Defeated enemies sometimes drop POWERUPS. Fly through them to gain a temporary edge.',
    textCY: 480,
    arrowToX: null, arrowToY: null, // general tip — no specific UI target
  },
];

// Controls-demo constants — the orbiting hand icon shown on hint 4
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

    this._age = 0;       // seconds since scene start — drives starfield fade-in
    this._hintIndex = 0;
    this._hintAge = 0;   // seconds on the current hint — drives arrow bob + tap blink
    this._revealedWordCount = 0;
    this._tapReady = false; // true once the current hint's typewriter is fully revealed
    this._blipPool = new AudioPool(Config.tutorial.blip.src, 8, Config.tutorial.blip.volume);
    this._blipTimer = 0;

    this._initHints();         // wraps text + pre-allocates arrow geometry
    this._initControlsDemo(); // pre-allocates hand icon + orbit path for hint 4
  }

  update(dt) {
    this._age += dt;
    this._starfield.update(dt);
    // Don't advance hint state during the intro delay — hints haven't appeared yet.
    // _hintAge only starts counting once hints are actually visible so its fade-in
    // and blink timings stay relative to when the first hint is shown, not scene start.
    if (this._age < Config.tutorial.hintStartDelay) return;
    this._hintAge += dt;
    this._updateTypewriter(dt);
  }

  render() {
    const { renderer } = this;
    const { fadeInDuration, hintStartDelay, overlayAlpha } = Config.tutorial;

    renderer.clear(Config.colors.void);
    // Gameplay backdrop — real elements so arrows point at the actual UI.
    // Stars fade in alongside the black veil so the reveal feels like one motion.
    const starAlpha = Math.min(this._age / fadeInDuration, 1);
    this._starfield.render(renderer, starAlpha);
    this._barrier.render(renderer);
    this._hud.render(renderer);

    // Fade in from black — covers the cut from PrologueScene's black fade-out
    if (this._age < fadeInDuration) {
      renderer.clear(Config.colors.void, 1 - this._age / fadeInDuration);
      return;
    }

    // Breathing room: backdrop fully lit, no hints yet
    if (this._age < hintStartDelay) return;

    // Dimming overlay fades in over 0.3 s as hints begin — avoids a jarring pop
    renderer.clear(Config.colors.void, Math.min((this._age - hintStartDelay) / 0.3, 1) * overlayAlpha);

    this._renderHint();
    this._renderArrow();
    this._renderControlsDemo();
    this._renderTapPrompt();
  }

  /** First tap/swipe fast-forwards typewriter; second tap/swipe advances. */
  handleTap(_x, _y) { this._advance(); }
  handleSwipeUp()   { this._advance(); }

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

    // Progress indicator (e.g. "2 / 5") above the text block
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

  _renderArrow() {
    const arrowData = this._hintArrows[this._hintIndex];
    if (!arrowData) return;

    const { arrowColor, arrowGlowBlur } = Config.tutorial;
    const fadeIn = Math.min(this._hintAge / 0.5, 1);

    const { nx, ny, staticToX, staticToY } = arrowData;

    // Arrowhead geometry: tip at the static target position — no animation
    const HEAD = 12; // half-width of arrowhead base
    const NECK = 18; // shaft length from tip to arrowhead base
    const px = -ny, py = nx; // perpendicular axis
    const baseMidX = staticToX - nx * NECK;
    const baseMidY = staticToY - ny * NECK;

    // Mutate pre-allocated point arrays in place — zero allocation per frame
    const sp = arrowData.shaftPoints;
    sp[1][0] = baseMidX; sp[1][1] = baseMidY;

    const hp = arrowData.headPoints;
    hp[0][0] = staticToX;                   hp[0][1] = staticToY;
    hp[1][0] = baseMidX + px * HEAD;        hp[1][1] = baseMidY + py * HEAD;
    hp[2][0] = baseMidX - px * HEAD;        hp[2][1] = baseMidY - py * HEAD;

    this.renderer.strokePaths(arrowData.paths, {
      color: arrowColor, lineWidth: 3, glowBlur: arrowGlowBlur, alpha: fadeIn,
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
   * typewriter, and pre-allocate the arrow path arrays with mutable point
   * slots so _renderArrow can update them in place.
   */
  _initHints() {
    const { textFont, lineHeight, textMaxWidth } = Config.tutorial;
    const { width: vW } = Config.virtual;
    const textCX = vW / 2; // 270

    this._hintLineWords = [];
    this._hintLineWordOffsets = [];
    this._hintTotalWords = [];
    this._hintFullLines = [];  // pre-joined strings — avoids slice+join allocations on fully-revealed lines
    this._hintArrows = [];
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

      // Text bounding box half-height — needed for both arrow-free and arrow hints
      const lineCount = lineWordArrays.length;
      const textHalfH = ((lineCount - 1) * lineHeight) / 2 + 16;

      // No arrow for this hint — TAP prompt goes one line below the text box
      if (hint.arrowToX == null) {
        this._hintArrows.push(null);
        this._hintTapPromptY.push(hint.textCY + textHalfH + lineHeight + 22);
        continue;
      }

      const textHalfW = textMaxWidth / 2;

      // Unit vector from text center toward arrow target
      const dx = hint.arrowToX - textCX;
      const dy = hint.arrowToY - hint.textCY;
      const dist = Math.hypot(dx, dy);
      const nx = dx / dist;
      const ny = dy / dist;

      // Exit point of the direction ray on the text bounding box
      const tExit = Math.min(
        Math.abs(nx) > 1e-6 ? textHalfW / Math.abs(nx) : Infinity,
        Math.abs(ny) > 1e-6 ? textHalfH / Math.abs(ny) : Infinity,
      );

      // Larger gap so arrows read as clearly separate from the hint text
      const gap = ny > 0.5 ? tExit + 75 : tExit + 35;
      const fromX = textCX + nx * gap;
      const fromY = hint.textCY + ny * gap;

      // Cap shaft at SHAFT_MAX so arrows stay short and don't crowd the target chrome
      const SHAFT_MAX = 160; // virtual px
      const distToTarget = Math.hypot(hint.arrowToX - fromX, hint.arrowToY - fromY);
      const shaftLen = Math.min(distToTarget - 18, SHAFT_MAX);
      const staticToX = fromX + nx * shaftLen;
      const staticToY = fromY + ny * shaftLen;

      // TAP prompt: for downward arrows fits in the gap between text and shaft;
      // for upward/diagonal arrows sits one line-height below the last text line
      this._hintTapPromptY.push(
        ny > 0.5
          ? hint.textCY + textHalfH + lineHeight * 0.5 + 8
          : hint.textCY + textHalfH + lineHeight + 22,
      );

      // Pre-allocate mutable point slots — updated in _renderArrow each frame
      const shaftPoints = [[fromX, fromY], [0, 0]];
      const headPoints  = [[0, 0], [0, 0], [0, 0]];

      this._hintArrows.push({
        nx, ny,
        staticToX, staticToY,
        shaftPoints, headPoints,
        paths: [
          { points: shaftPoints, closed: false },
          { points: headPoints,  closed: true  },
        ],
      });
    }
  }

  /**
   * Pre-allocate the hand-icon geometry for the controls hint (index 3).
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

  /** Orbiting hand icon — only drawn on hint index 3 (controls hint). */
  _renderControlsDemo() {
    if (this._hintIndex !== 3) return;

    const { arrowColor, arrowGlowBlur } = Config.tutorial;
    const fadeIn = Math.min(this._hintAge / 0.5, 1);
    const angle  = this._hintAge * DEMO_SPEED;

    // Dim orbit ring — gives the circular drag path context
    this.renderer.strokePaths(this._orbitPath, {
      color: arrowColor, lineWidth: 1, glowBlur: 0, alpha: fadeIn * 0.3,
    });

    // Finger icon orbiting the ring, rotated tangent to the direction of motion
    this.renderer.strokePaths(this._fingerPaths, {
      x: DEMO_CX + Math.cos(angle) * DEMO_RADIUS,
      y: DEMO_CY + Math.sin(angle) * DEMO_RADIUS,
      rotation: angle + Math.PI / 2, // tangent to orbit so finger "points" where it's going
      color: arrowColor, lineWidth: 2, glowBlur: arrowGlowBlur, alpha: fadeIn,
    });
  }
}
