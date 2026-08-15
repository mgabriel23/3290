/**
 * PrologueScene.js
 * The game's opening cinematic — plays once, between the intro prompt
 * and gameplay, and ends by handing control to the player. It's
 * authored as a fixed sequence of "beats", each owning its own slice of
 * update/render and deciding for itself when to hand off to the next:
 *
 *   yearCard  → a stark "EARTH — YEAR 3290" title card types in, then a
 *               quiet second line fades in beneath it before both hold and fade out
 *   portals   → the sky reveals itself (Starfield, fading in alongside) and
 *               three wireframe "tears" burst into it, one by one — they
 *               need an actual sky to tear open in for the visual to read.
 *               Once a portal finishes tearing open, it starts emitting a
 *               small stream of real sample enemies — one of the four
 *               Drifter-family variants, picked at random per spawn (see
 *               _spawnCreature/_updateCreatures) — fading in, facing
 *               straight down, and drifting slowly toward (and off) the
 *               bottom of the screen, giving physical proof to the
 *               briefing's "things are already coming through them"
 *   briefing  → the commander's voice cuts in over comms — a typewriter-
 *               revealed briefing over that same sky
 *   fadeOut   → the assembled scene — sky, text, and all — dissolves to black
 *   title     → "3290" — the game's name, deliberately doubling as the
 *               year the story is set in — appears with a PLAY button,
 *               which is the actual gate into gameplay
 *
 * The full cinematic (`yearCard` → `fadeOut`) is deliberately unskippable —
 * no SKIP control exists on any beat — but per core/PrologueProgress.js it
 * only ever plays once per player: `_updateFadeOut` calls `markPrologueSeen`
 * the moment the cinematic finishes, and every later `Game._startPrologue`
 * call reads that flag and boots straight to `title` instead (the same
 * `devSkipToTitle` constructor option "back" navigation from
 * MissionSelectScene already used for a different reason — see its own doc
 * below). So a returning player never sees these beats again at all, rather
 * than seeing them with an escape hatch to tap through.
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
 * uses for its own handoff. The `devSkipToTitle` constructor option jumps
 * straight to the title beat, skipping the cinematic entirely — `Game.js`
 * passes it whenever `core/PrologueProgress.js` says this player has
 * already sat through the cinematic once before (see the class doc above),
 * so the full `yearCard` → `fadeOut` sequence plays exactly once per player,
 * ever, rather than replaying on every launch.
 *
 * The prologue's own background music (started by Game the instant the
 * player swipes past the intro prompt) plays continuously through this
 * entire scene — cinematic AND the title/PLAY card ("the main menu") —
 * with no stop point in here at all; `Game._startGameplay` is what stops
 * it, once gameplay's own separate theme is ready to take over.
 */
import { Config } from '../core/Config.js';
import { Portal } from '../entities/Portal.js';
import { Starfield } from '../entities/Starfield.js';
import { DrifterEnemy, createDrifterPath, createSweeperPath, createDiverPath, createWeaverPath } from '../entities/DrifterEnemy.js';
import { flickerAlpha } from '../core/animation.js';
import { wrapText, computeWordOffsets } from '../core/textLayout.js';
import { cornerBracketPath, diamondPath } from '../core/shapes.js';
import { AudioPool } from '../core/AudioPool.js';
import { DailyRewardPanel } from '../entities/DailyRewardPanel.js';
import { previewNextReward } from '../core/DailyReward.js';
import { markPrologueSeen } from '../core/PrologueProgress.js';

/** One path-factory per spawnable portal-creature variant — see _spawnCreature. */
const _CREATURE_PATH_FACTORIES = {
  drifter: createDrifterPath,
  sweeper: createSweeperPath,
  diver:   createDiverPath,
  weaver:  createWeaverPath,
};

export class PrologueScene {
  /**
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {{ onContinue: (mode: 'mission'|'survival') => void, devSkipToTitle?: boolean }} options
   *   `onContinue` fires once a mode button is tapped, passed which one —
   *   see `_renderModeButtons`/handleTap. `devSkipToTitle` starts straight
   *   on the title/mode-button card instead of the cinematic — Game.js
   *   passes it once `core/PrologueProgress.js` says this player has already
   *   seen the cinematic, and also for its own "back" navigation from
   *   MissionSelectScene (see its own doc).
   */
  constructor(renderer, { onContinue, devSkipToTitle = false }) {
    this.renderer = renderer;
    this.onContinue = onContinue;

    this._beat = devSkipToTitle ? 'title' : 'yearCard';
    this._beatAge = 0;
    this._chosenMode = null; // 'mission' | 'survival' — set on a mode-button tap, read by _updateExitFade

    this._yearRevealedCount = 0; // fractional char count — drives letter-by-letter reveal
    this._yearHoldAge = 0;       // accumulates AFTER the text is fully typed (hold + fade-out)

    this._starfield = new Starfield();
    this._portals = this._createPortals();
    // One spawner per portal — each produces a small stream of creatures
    // (not just one) over the cinematic, each independently rolling a
    // random species from Config.prologue.portals.creatures.species at the
    // moment it spawns (see _updateCreatures) rather than a portal being
    // "the Weaver portal" forever. `active` holds the ones currently on
    // screen (fading in / drifting down / not yet culled).
    this._creatures = this._portals.map((portal) => ({
      portal,
      spawnTimer: 0,   // counts down to the next spawn; 0 = spawn as soon as the portal is ready
      spawnCount: 0,   // how many this portal has produced so far, capped at maxSpawnsPerPortal
      active: [],      // [{ instance, age }] — age drives the fade-in
    }));

    // Wrapped up front (text and font never change), then split into
    // per-line word lists with each line's starting word-index recorded —
    // the reveal counter walks *words*, not characters, so the typewriter
    // unveils a whole word at a time (see _updateBriefing/_renderBriefingText).
    this._briefingLines = this._wrapBriefing(renderer);
    this._briefingLineWords = this._briefingLines.map((line) => line.split(' '));
    this._briefingLineWordOffsets = computeWordOffsets(this._briefingLineWords);
    this._briefingWordCount = this._briefingLineWords.reduce((sum, words) => sum + words.length, 0);
    this._revealedWordCount = 0;
    this._briefingHoldAge = 0;
    this._blipTimer = 0; // ticks on its own faster clock — see _advanceBlips for why it's decoupled from the word reveal
    this._blipPool = new AudioPool(Config.prologue.briefing.blip.src, 8, Config.prologue.briefing.blip.volume);

    this._initTitleGeometry(); // pre-allocate all title-beat paths and bounds — see _initTitleGeometry

    // Once-a-day reward popup, gated to the 'title' beat below (see
    // update/handleTap/render's 'title' cases) — constructed up front like
    // every other piece of this scene rather than lazily on first reaching
    // that beat, so a devSkipToTitle boot sees it immediately. Its own
    // `isOpen` is false from construction if today's reward is already
    // claimed, so this is a no-op on every visit after the first.
    this._dailyRewardPanel = new DailyRewardPanel(renderer);
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
      this._updateCreatures(dt);
    }

    switch (this._beat) {
      case 'yearCard': return this._updateYearCard(dt);
      case 'portals': return this._updatePortals();
      case 'briefing': return this._updateBriefing(dt);
      case 'fadeOut': return this._updateFadeOut();
      // Waits for a tap on PLAY (or the daily-reward CLAIM button, if one is
      // showing) — see handleTap. The panel only has anything to animate
      // (its fade-in/CLAIM pulse) while it's actually open.
      case 'title': return this._dailyRewardPanel.update(dt);
      case 'exitFade': return this._updateExitFade();
    }
  }

  /**
   * The two mode buttons are the only interactive elements once the title
   * beat arrives — EXCEPT while the daily-reward popup is still open, which
   * sits on top of them and must claim the tap itself (same "explicit
   * button only" dismissal Shop.js uses) rather than letting it fall
   * through to a mode button underneath. No beat before `title` has
   * anything tappable — the cinematic is deliberately unskippable (see the
   * class doc above).
   */
  handleTap(x, y) {
    if (this._beat !== 'title') return;
    if (this._dailyRewardPanel.isOpen) { this._dailyRewardPanel.handleTap(x, y); return; }
    let mode = null;
    if (this._isInsideMissionButton(x, y)) mode = 'mission';
    else if (this._isInsideSurvivalButton(x, y)) mode = 'survival';
    if (mode) {
      // Save the current beat age so the exit-fade can hold the title frozen
      // at the exact frame the tap landed, rather than restarting its animation.
      this._frozenTitleAge = this._beatAge;
      this._chosenMode = mode;
      this._advanceBeat('exitFade');
    }
  }

  render() {
    switch (this._beat) {
      case 'yearCard': return this._renderYearCard();
      case 'portals':  return this._renderPortals();
      case 'briefing': return this._renderBriefing();
      case 'fadeOut':  return this._renderFadeOut();
      // Mutually exclusive with the title/mode buttons — see
      // DailyRewardPanel's class doc for why this is its own full screen
      // rather than a modal drawn on top of them. Once claimed (this
      // session or a previous one today), the title renders normally plus
      // a small reminder that a fresh reward is waiting tomorrow.
      case 'title':
        if (this._dailyRewardPanel.isOpen) return this._dailyRewardPanel.render(this.renderer);
        this._renderTitle();
        return this._renderDailyRewardBadge();
      case 'exitFade': return this._renderExitFade();
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
    const cfg = Config.prologue.yearCard;
    const { text, font, textColor, holdDuration, fadeOutDuration } = cfg;
    const { width: vW, height: vH } = Config.virtual;

    // Fade-out alpha: only kicks in after hold is done, ramps 1 → 0.
    let fadeAlpha = 1;
    const typingDone = this._yearRevealedCount >= text.length;
    if (typingDone) {
      const inFadeOut = Math.max(0, this._yearHoldAge - holdDuration);
      fadeAlpha = Math.max(0, 1 - inFadeOut / fadeOutDuration);
    }

    // Signal-interference flicker layered on top — the whole line randomly
    // dips toward transparent as if the transmission is weak. Frequencies
    // chosen to create dips at a cinematic 1–3 Hz, not a 60fps strobe.
    const alpha = fadeAlpha * flickerAlpha(this._beatAge, [7.3, 11.7, 19.1], [2.0, 0.8], 0.8, 0.85);
    const visible = text.slice(0, Math.floor(this._yearRevealedCount));

    this.renderer.clear(Config.colors.void);
    this.renderer.drawText(visible, vW / 2, vH * 0.46, { font, color: textColor, alpha });

    // A quiet second line, only once the headline has finished typing —
    // reuses the same flicker alpha rather than owning a separate fade, so
    // it reads as part of the same weak transmission, not a new one.
    if (typingDone) {
      this.renderer.drawText(cfg.subtitleText, vW / 2, vH * 0.46 + cfg.subtitleOffsetY, {
        font: cfg.subtitleFont, color: cfg.subtitleColor, alpha,
      });
    }
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
    this._renderCreatures();
  }

  /**
   * Build one real DrifterEnemy instance for a portal, pinned at that
   * portal's position rather than wherever its formation path would
   * normally start it. `species` picks which of the four variants (each
   * just needs its own real path-factory to get the right `_palette`/
   * body-shape-adjacent config — see DrifterEnemy's variant system) —
   * `_updateCreatures` never actually advances it along that path, so the
   * path's own starting point is irrelevant, only its `variant` matters.
   * Angle is fixed at `Math.PI`: local -y (the body's dome/"face") maps to
   * world +y at that angle, i.e. facing straight down — the direction
   * these creatures drift, not away from it.
   */
  _spawnCreature(species, x, y) {
    const path = _CREATURE_PATH_FACTORIES[species]();
    const d = new DrifterEnemy(path, 0, 0);
    d.x = x; d.y = y; d._angle = Math.PI; d._cosA = -1; d._sinA = 0;
    return d;
  }

  /**
   * Each portal spawns a small stream of creatures (not just one) once it
   * finishes tearing open: a new one every `spawnInterval`, up to
   * `maxSpawnsPerPortal` — each independently rolling a random variant from
   * `creatures.species` at the moment it spawns, so a single portal isn't
   * "the Weaver portal" forever. Their real update() (which would fly them
   * off along their own formation path) is deliberately never called —
   * only `_age` advances, which is all their idle tentacle-wave/eye-pulse
   * animation needs — and every creature also drifts straight down at a
   * fixed `driftSpeed`, independent of that path. Once a creature drifts
   * past the bottom edge (plus a margin) it's dropped from `active` — same
   * in-place compaction WaveManager itself uses for its enemy list.
   */
  _updateCreatures(dt) {
    const { appearDuration, creatures } = Config.prologue.portals;
    const { height: vH } = Config.virtual;
    const { species, spawnInterval, maxSpawnsPerPortal, driftSpeed, offscreenMarginY } = creatures;
    const cullY = vH + offscreenMarginY;

    for (const spawner of this._creatures) {
      const portalReady = spawner.portal._age - spawner.portal.delay >= appearDuration;
      if (portalReady && spawner.spawnCount < maxSpawnsPerPortal) {
        spawner.spawnTimer -= dt;
        if (spawner.spawnTimer <= 0) {
          const pick = species[Math.floor(Math.random() * species.length)];
          spawner.active.push({
            instance: this._spawnCreature(pick, spawner.portal.x, spawner.portal.y),
            age: 0,
          });
          spawner.spawnCount++;
          spawner.spawnTimer = spawnInterval;
        }
      }

      let w = 0;
      for (let i = 0; i < spawner.active.length; i++) {
        const entry = spawner.active[i];
        const inst  = entry.instance;
        entry.age += dt;
        if (inst.alive) {
          inst._age += dt; // idle tentacle-wave/eye-pulse animation only — see _spawnCreature
          inst.y += driftSpeed * dt;
        }
        if (inst.alive && inst.y < cullY) {
          if (w !== i) spawner.active[w] = entry;
          w++;
        }
      }
      spawner.active.length = w;
    }
  }

  _renderCreatures() {
    const { fadeInDuration } = Config.prologue.portals.creatures;
    for (const spawner of this._creatures) {
      for (const entry of spawner.active) {
        const inst = entry.instance;
        if (!inst.alive) continue;
        const alpha = Math.min(entry.age / fadeInDuration, 1);
        inst.renderBody(this.renderer, alpha);
        inst.render(this.renderer, alpha);
      }
    }
  }

  // --- Beat 3: briefing ---------------------------------------------------------

  /** Greedy word-wrap using real glyph metrics — same technique the typewriter overlay this superseded used. */
  _wrapBriefing(renderer) {
    const { text, font, sideMargin } = Config.prologue.briefing;
    const { width: vW } = Config.virtual;
    const maxWidth = vW - sideMargin * 2;
    return wrapText(text, maxWidth, (candidate) => renderer.measureText(candidate, font));
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
    this._renderCreatures();
    this._renderBriefingText(Math.floor(this._revealedWordCount));
  }

  /**
   * Centered, in a small fixed-size "subtitle window" anchored near the
   * bottom edge: the line currently being revealed always sits at
   * `_briefingAnchorY`, with up to `maxVisibleLines - 1` finished lines
   * stacked above it. Once a new line begins, the oldest visible one
   * simply stops being drawn — so a long briefing never grows taller
   * than the window, it just keeps scrolling its newest line into a
   * fixed slot (unlike the corner-anchored overlay this superseded,
   * which had to fit its whole paragraph on screen at once). Drawn AFTER
   * `_renderCreatures()` in both `_renderBriefing`/`_renderFadeOut` — that
   * draw order, not screen position, is what keeps the text legible on
   * top of the portal creatures rather than being covered by them.
   */
  _renderBriefingText(revealedWordCount) {
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

  /**
   * Blips fire at up to ~12/sec (year card) or ~7/sec (briefing) — AudioPool
   * cycles a fixed pool of 8 Audio elements rather than cloning a new one
   * per blip, which would create hundreds of short-lived DOM objects during
   * the prologue. 8 covers the maximum number of clips that can overlap at
   * once (blip clip length × rate) with headroom, so rewinding a slot never
   * audibly cuts off a still-playing instance.
   */
  _playBlip() {
    this._blipPool.play();
  }

  // --- Beat 4: fade to black -----------------------------------------------------

  _updateFadeOut() {
    if (this._beatAge >= Config.prologue.fadeOutDuration) {
      // The cinematic has now played in full — record it so every future
      // Game._startPrologue call boots straight to `title` instead (see the
      // class doc above and core/PrologueProgress.js).
      markPrologueSeen();
      this._advanceBeat('title');
    }
  }

  /** Redraw the briefing's final frame — sky, portals, and all — then lay an ever-darkening overlay on top — see Renderer.clear's alpha. */
  _renderFadeOut() {
    this.renderer.clear(Config.colors.void);
    this._starfield.render(this.renderer);
    for (const portal of this._portals) portal.render(this.renderer);
    this._renderCreatures();
    this._renderBriefingText(this._briefingWordCount);

    const overlayAlpha = Math.min(this._beatAge / Config.prologue.fadeOutDuration, 1);
    this.renderer.clear(Config.colors.void, overlayAlpha);
  }

  // --- Beat 5: title + PLAY --------------------------------------------------------

  /**
   * Pre-bake all title-beat geometry into flat path arrays. All positions are
   * pure constants (config values + virtual dimensions) so they never change
   * after construction — baking here gives zero per-frame allocations and lets
   * the entire chrome layer render as a single `strokePaths` call.
   *
   * Geometry produced:
   *   _chromePaths     — 10 paths: two HRules (3 each) + 4 corner bracket
   *                      ticks, all sharing the same color/lineWidth/glowBlur
   *                      so they batch into one shadow-blur pass
   *   _missionButtonPaths / _survivalButtonPaths — 4 L-bracket corner paths each
   *   _missionButtonBounds / _survivalButtonBounds — hit-test rects (used by
   *                      _isInsideMissionButton/_isInsideSurvivalButton)
   *   _buttonCX        — shared button center X (both are centered)
   *   _missionButtonCY / _survivalButtonCY — each button's center Y
   */
  _initTitleGeometry() {
    const { width: vW, height: vH } = Config.virtual;
    const ty = vH * 0.40; // must match _titleY()
    const cx = vW / 2;
    const gap = 18, dSize = 4, lx = 52, rx = vW - 52;

    const r1y = ty - 68; // HRule above title
    const r2y = ty + 82; // HRule below subtitle

    // Title corner bracket frame
    const bx1 = cx - 112, bx2 = cx + 112;
    const by1 = ty - 40,  by2 = ty + 28;
    const leg = 12;

    this._chromePaths = [
      // HRule 1 (above title): two line segments + diamond
      { points: [[lx, r1y], [cx - gap, r1y]], closed: false },
      { points: [[cx + gap, r1y], [rx, r1y]], closed: false },
      diamondPath(cx, r1y, dSize),
      // HRule 2 (below subtitle): same pattern
      { points: [[lx, r2y], [cx - gap, r2y]], closed: false },
      { points: [[cx + gap, r2y], [rx, r2y]], closed: false },
      diamondPath(cx, r2y, dSize),
      // Corner bracket ticks enclosing the title glyph
      cornerBracketPath(bx1, by1, 1, 1, leg),
      cornerBracketPath(bx2, by1, -1, 1, leg),
      cornerBracketPath(bx1, by2, 1, -1, leg),
      cornerBracketPath(bx2, by2, -1, -1, leg),
    ];

    const btn = Config.prologue.title.modeButtons;
    const bl = btn.cornerSize;
    this._buttonCX = cx;

    this._missionButtonCY = ty + btn.firstOffsetBelowTitle;
    this._survivalButtonCY = this._missionButtonCY + btn.height + btn.gap;

    const btnL = cx - btn.width / 2, btnR = cx + btn.width / 2;
    const halfH = btn.height / 2;

    const missionT = this._missionButtonCY - halfH, missionB = this._missionButtonCY + halfH;
    this._missionButtonPaths = [
      cornerBracketPath(btnL, missionT, 1, 1, bl),
      cornerBracketPath(btnR, missionT, -1, 1, bl),
      cornerBracketPath(btnL, missionB, 1, -1, bl),
      cornerBracketPath(btnR, missionB, -1, -1, bl),
    ];
    this._missionButtonBounds = { left: btnL, top: missionT, right: btnR, bottom: missionB };

    const survivalT = this._survivalButtonCY - halfH, survivalB = this._survivalButtonCY + halfH;
    this._survivalButtonPaths = [
      cornerBracketPath(btnL, survivalT, 1, 1, bl),
      cornerBracketPath(btnR, survivalT, -1, 1, bl),
      cornerBracketPath(btnL, survivalB, 1, -1, bl),
      cornerBracketPath(btnR, survivalB, -1, -1, bl),
    ];
    this._survivalButtonBounds = { left: btnL, top: survivalT, right: btnR, bottom: survivalB };
  }

  _renderTitle() {
    const alpha = Math.min(this._beatAge / Config.prologue.title.fadeInDuration, 1);
    this.renderer.clear(Config.colors.void);
    this._renderTitleChrome(alpha);
    this._renderTitleText(alpha);
    this._renderModeButtons(alpha);
  }

  _titleY() {
    return Config.virtual.height * 0.40;
  }

  /**
   * The title glyph flickers with the exact same signal-interference
   * effect `_renderYearCard` uses for "EARTH — YEAR 3290" (same
   * frequencies/phases/base/depth — see Config.prologue.title's own
   * doc for why these are hardcoded here rather than Config-driven,
   * matching that precedent) — `alpha` here is still the beat's overall
   * fade-in, multiplied by the flicker exactly like the year card
   * multiplies its own fade alpha by it.
   */
  _renderTitleText(alpha) {
    const { text, font, textColor, glowBlur, subtitleText, subtitleFont, subtitleColor } =
      Config.prologue.title;
    const { width: vW } = Config.virtual;
    const ty = this._titleY();

    const flicker = flickerAlpha(this._beatAge, [7.3, 11.7, 19.1], [2.0, 0.8], 0.8, 0.85);
    this.renderer.drawText(text, vW / 2, ty, { font, color: textColor, alpha: alpha * flicker, glowBlur });
    this.renderer.drawText(subtitleText, vW / 2, ty + 55, {
      font: subtitleFont,
      color: subtitleColor,
      alpha: alpha * 0.85,
    });
  }

  /** All chrome batched into one strokePaths call — one shadow-blur pass for the entire decorative layer. */
  _renderTitleChrome(alpha) {
    const { chromeColor, chromeLineWidth, chromeGlowBlur, taglineFont, taglineColor } =
      Config.prologue.title;
    const { width: vW } = Config.virtual;
    const ty = this._titleY();

    this.renderer.strokePaths(this._chromePaths, {
      color: chromeColor, lineWidth: chromeLineWidth, glowBlur: chromeGlowBlur, alpha: alpha * 0.48,
    });
    this.renderer.drawText('LAST DEFENSE PROTOCOL', vW / 2, ty - 89, {
      font: taglineFont, color: taglineColor, alpha: alpha * 0.35,
    });
    // Pushed down from ty+200 (which fit under the old single PLAY button)
    // to ty+260 — clears the two-button stack's lower (SURVIVAL MODE)
    // button, whose bottom edge now sits at ty+~241 (see _initTitleGeometry).
    this.renderer.drawText('SYSTEM: ONLINE  ·  SECTOR SOL', vW / 2, ty + 260, {
      font: taglineFont, color: taglineColor, alpha: alpha * 0.28,
    });
  }

  _isInsideMissionButton(x, y) {
    const { left, top, right, bottom } = this._missionButtonBounds;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  _isInsideSurvivalButton(x, y) {
    const { left, top, right, bottom } = this._survivalButtonBounds;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  _renderModeButtons(alpha) {
    const { font, color, lineWidth, glowBlur, pulseSpeed, pulseDepth, missionLabel, survivalLabel } =
      Config.prologue.title.modeButtons;
    const pulse = 1 - pulseDepth * (0.5 + 0.5 * Math.sin(this._beatAge * pulseSpeed));
    const btnAlpha = alpha * pulse;

    this.renderer.strokePaths(this._missionButtonPaths, { color, lineWidth, glowBlur, alpha: btnAlpha });
    this.renderer.drawText(missionLabel, this._buttonCX, this._missionButtonCY, { font, color, alpha: btnAlpha });

    this.renderer.strokePaths(this._survivalButtonPaths, { color, lineWidth, glowBlur, alpha: btnAlpha });
    this.renderer.drawText(survivalLabel, this._buttonCX, this._survivalButtonCY, { font, color, alpha: btnAlpha });
  }

  /**
   * Small always-dim reminder that today's reward is already claimed —
   * without this, a returning player who claimed earlier today would have
   * no on-screen sign the daily-reward system exists at all until
   * tomorrow's popup happens to catch them. Drawn UNDER the mode buttons'
   * own vertical space (see Config.dailyReward.claimedBadge.y), low alpha
   * so it reads as a footnote, not a competing control.
   *
   * A second line beneath it names TOMORROW's reward (DailyReward.js's
   * previewNextReward(), which resolves through the streak calendar) in
   * that reward's own color — the actual "come back" hook, not just a
   * confirmation that today is done.
   */
  _renderDailyRewardBadge() {
    const cfg = Config.dailyReward.claimedBadge;
    const { width: vW } = Config.virtual;
    this.renderer.drawText(cfg.text, vW / 2, cfg.y, { font: cfg.font, color: cfg.color, alpha: cfg.alpha });

    const next = previewNextReward();
    this.renderer.drawText(`${cfg.nextPrefix}${next.name}`, vW / 2, cfg.nextY, {
      font: cfg.nextFont, color: next.color, alpha: cfg.nextAlpha,
    });
  }

  // --- Beat 6: exit fade (a mode button tapped → black → onContinue) -----------------

  _updateExitFade() {
    if (this._beatAge >= Config.prologue.title.exitFadeDuration) this.onContinue(this._chosenMode);
  }

  /**
   * Hold the title frozen at the moment PLAY was tapped, then raise a
   * black veil over it. Temporarily swapping `_beatAge` back to the saved
   * value lets `_renderTitle` reuse its own alpha and pulse math without
   * any duplication here — the swap is invisible to callers since it's
   * restored before this method returns.
   */
  _renderExitFade() {
    const { exitFadeDuration } = Config.prologue.title;
    const overlayAlpha = Math.min(this._beatAge / exitFadeDuration, 1);

    const liveAge = this._beatAge;
    this._beatAge = this._frozenTitleAge;
    this._renderTitle();
    this._beatAge = liveAge;

    this.renderer.clear(Config.colors.void, overlayAlpha);
  }
}
