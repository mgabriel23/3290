/**
 * Game.js
 * Owns the application lifecycle: responsive sizing, forwarding input to
 * the active scene, switching between scenes, and driving the main loop
 * that advances and renders whichever scene is current. Still deliberately
 * contains no gameplay logic of its own (entities, physics) — scenes own
 * their content; Game just owns *which* scene is running and feeds it
 * time and gestures.
 */
import { Config } from './Config.js';
import { isMuted, onMutedChange } from './AudioSettings.js';
import { AudioFader } from './AudioFader.js';
import { Renderer } from './Renderer.js';
import { SwipeInput } from './SwipeInput.js';
import { TapInput } from './TapInput.js';
import { DragInput } from './DragInput.js';
import { IntroScene } from '../scenes/IntroScene.js';
import { PrologueScene } from '../scenes/PrologueScene.js';
import { TutorialScene } from '../scenes/TutorialScene.js';
import { GameplayScene } from '../scenes/GameplayScene.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} stage  the element whose box defines available space
   */
  constructor(canvas, stage) {
    this.stage = stage;
    this.renderer = new Renderer(canvas);
    this.scene = new IntroScene(this.renderer, {
      onContinue: () => this._startPrologue(),
      onSwipeDetected: () => this._startPrologueMusic(),
    });
    this._lastTimestamp = 0;
    this._consecutiveTickErrors = 0; // see _tick's doc — trips _showFatalError after too many in a row

    this._tick = this._tick.bind(this);

    // Forward gestures to whichever scene is currently active — the
    // lookup is dynamic (`this.scene.handle...?.()`) so this keeps working
    // as `this.scene` is swapped out, and scenes that don't care about a
    // given gesture simply don't implement its handler.
    new SwipeInput(stage, {
      thresholdPx: Config.intro.swipeThresholdPx,
      onSwipeUp: () => this.scene.handleSwipeUp?.(),
    });
    new TapInput(stage, {
      onTap: (clientX, clientY) => {
        const { x, y } = this.renderer.toVirtualCoords(clientX, clientY);
        this.scene.handleTap?.(x, y);
      },
    });
    new DragInput(stage, {
      onPointerDown: (clientX, clientY) => {
        const { x, y } = this.renderer.toVirtualCoords(clientX, clientY);
        this.scene.handlePointerDown?.(x, y);
      },
      onPointerMove: (clientX, clientY) => {
        const { x, y } = this.renderer.toVirtualCoords(clientX, clientY);
        this.scene.handlePointerMove?.(x, y);
      },
      onPointerUp: () => this.scene.handlePointerUp?.(),
    });
  }

  /** Perform the first layout + paint, and start the loop. Global listeners (resize, visibilitychange) are main.js's job — see resize()/resumeFromBackground(). */
  start() {
    this._onResize();
    requestAnimationFrame(this._tick);
  }

  /** Call on window resize — re-fits the stage and repaints once. */
  resize() {
    this._onResize();
  }

  /**
   * Call when the tab returns from background — discards the accumulated
   * idle time so the next tick gets dt=0 rather than however long the tab
   * was hidden. Without this, _lastTimestamp could be minutes behind,
   * producing a massive dt that causes bullet bursts, enemy teleports, and
   * particle pop-ins.
   */
  resumeFromBackground() {
    this._lastTimestamp = 0;
  }

  /**
   * Swap the intro prompt out for the opening cinematic once the player
   * swipes past it. Wrapped in try/catch, like every `_start*` transition —
   * if constructing the next scene throws, the outgoing scene's own
   * `onContinue` caller (a tap/swipe handler, not `_tick`) is where the
   * exception would otherwise surface uncaught; catching it here means
   * `this.scene` is simply left as whatever it already was, rather than
   * the whole page silently breaking. Without `_showFatalError`, though,
   * "left as whatever it already was" means a scene that already
   * considers itself finished (e.g. TutorialScene after its last hint,
   * `_done` already true) — its own `update`/`render`/`handleTap` are all
   * now deliberate no-ops, so the outgoing scene doesn't just keep
   * rendering its last frame, it appears to hang: no visible change, taps
   * do nothing, with only a console.error (invisible on a phone with no
   * devtools attached) to say why. `_showFatalError` replaces `this.scene`
   * with a minimal always-inert one that draws the actual error on-screen
   * instead, so a transition failure reads as "something broke" rather
   * than "the game froze."
   */
  _startPrologue() {
    try {
      this.scene = new PrologueScene(this.renderer, { onContinue: () => this._startTutorial() });
    } catch (err) {
      console.error('Failed to start the prologue:', err);
      this._showFatalError(err);
    }
  }

  /**
   * Start the prologue's own background music — called from IntroScene's
   * `onSwipeDetected`, which fires synchronously from the real swipe
   * gesture (see IntroScene's class doc for why that timing matters,
   * unlike `onContinue` which fires later from an `update()` tick). The
   * `!this._prologueAudio` guard mirrors `_startGameplay`'s own theme-audio
   * guard, in case this is somehow reached more than once. Starts silent
   * and ramps up via `_prologueFader` (advanced every frame in `_tick`)
   * instead of jumping straight to full volume — see AudioFader's own doc.
   */
  _startPrologueMusic() {
    if (this._prologueAudio) return;
    try {
      const { prologueThemeSrc, prologueThemeLoop, prologueFadeInDuration } = Config.audio;
      this._prologueAudio = new Audio(prologueThemeSrc);
      this._prologueAudio.volume = 0;
      this._prologueAudio.loop = prologueThemeLoop;
      this._prologueAudio.muted = isMuted();
      onMutedChange((muted) => { this._prologueAudio.muted = muted; });
      this._prologueFader = new AudioFader();
      this._prologueFader.rampTo(1, prologueFadeInDuration);
      this._prologueAudio.play().catch(() => {});
    } catch (err) {
      console.error('Failed to start the prologue music:', err);
      // Deliberately no _showFatalError here — losing background music
      // is not worth interrupting the player's swipe into the prologue.
    }
  }

  /**
   * Swap the cinematic out for the tutorial once the player taps PLAY on
   * the title card. The prologue's own music has been playing continuously
   * since the intro swipe, straight through the cinematic AND the
   * title/PLAY card ("the main menu") — this is where it finally stops,
   * right as PLAY's tap actually lands (`onContinue` fires once the title
   * card's exit-fade finishes — see PrologueScene._updateExitFade), so it
   * doesn't keep playing underneath the entire tutorial too. Ramps out
   * smoothly (see `_prologueFader`/`_tick`) rather than an abrupt `.pause()`
   * — the fader's own `onComplete` is what actually pauses the element,
   * once it's already faded down to silence.
   */
  _startTutorial() {
    this._prologueFader?.rampTo(0, Config.audio.prologueFadeOutDuration, () => this._prologueAudio?.pause());
    try {
      this.scene = new TutorialScene(this.renderer, { onContinue: () => this._startGameplay() });
    } catch (err) {
      console.error('Failed to start the tutorial:', err);
      this._showFatalError(err);
    }
  }

  /**
   * Swap the tutorial out for the gameplay scene once all hints are
   * dismissed. Also reused verbatim as the "restart" path: GameplayScene's
   * `onGameOver` callback below is this same method, so a post-death tap
   * just calls this again — a fresh `GameplayScene` is by construction a
   * clean run (full health, level 1, zero score).
   *
   * `_themeAudio`/`_themeFader` construction is guarded (only ever built
   * once), but `.play()` and the fade-in ramp both run every time this
   * method does, not just the first — restarting must actually RESUME the
   * music, since GameplayScene's `onMusicStop` callback (see its own doc)
   * fades it out (then pauses it) the instant the player dies. We're inside
   * the user-gesture call chain either way (first launch: last tutorial
   * hint tap → onContinue → here; restart: the restart tap → onGameOver →
   * here), so audio.play() is permitted both times.
   *
   * `_themeDuckMultiplier` (GameplayScene's per-level ducking) and
   * `_themeFader.value` (this fade-in/out ramp) are two independent 0-1
   * factors — `_tick`'s `_updateAudioFades` is what actually multiplies
   * them together onto `.volume` each frame, rather than either one here
   * fighting to be the last writer of `.volume`.
   */
  _startGameplay() {
    try {
      if (!this._themeAudio) {
        const { themeSrc, themeLoop } = Config.audio;
        this._themeAudio = new Audio(themeSrc);
        this._themeAudio.volume = 0;
        this._themeAudio.loop = themeLoop;
        this._themeAudio.muted = isMuted();
        // The mute toggle (in GameplayScene, via PlaybackControls) lives far
        // from this Audio element — it only talks to AudioSettings, never to
        // Game directly — so this subscription is how a live toggle actually
        // reaches the already-playing element's `.muted` property.
        onMutedChange((muted) => { this._themeAudio.muted = muted; });
        this._themeFader = new AudioFader();
        this._themeDuckMultiplier = 1; // GameplayScene's per-level duck — see onMusicDuck below
      }
      this._themeAudio.play().catch(() => {});
      this._themeFader.rampTo(1, Config.audio.themeFadeInDuration);
      this.scene = new GameplayScene(this.renderer, {
        onGameOver: () => this._startGameplay(),
        // GameplayScene ducks this multiplier during each level's indicator
        // (see its own _updateMusicDuck) but doesn't own _themeAudio itself
        // — it persists across restarts, so Game.js has to be the one that
        // actually applies it to `.volume` (see _updateAudioFades).
        onMusicDuck: (multiplier) => { this._themeDuckMultiplier = multiplier; },
        // Fade out (not an abrupt stop) the instant death triggers — see
        // GameplayScene._triggerGameOver. The fader's onComplete is what
        // actually pauses the element once it's faded down to silence.
        // Resumed (played + faded back in) above on the next
        // _startGameplay() call, whether that's a fresh launch or a restart.
        onMusicStop: () => {
          this._themeFader?.rampTo(0, Config.audio.themeFadeOutDuration, () => this._themeAudio?.pause());
        },
      });
    } catch (err) {
      console.error('Failed to start gameplay:', err);
      this._showFatalError(err);
    }
  }

  /**
   * The main loop: advance the scene by the elapsed time (in seconds),
   * render it, and schedule the next frame — keeping animation in step
   * with the display's refresh rate.
   *
   * update()/render() are wrapped in try/catch so a single bad frame (a bug
   * in one scene, a transient browser API hiccup) can never permanently
   * kill the loop the way an uncaught throw inside a requestAnimationFrame
   * callback normally would (it silently prevents the next rAF from ever
   * being scheduled — the whole game just freezes on that frame with no
   * visible error). Logging + continuing means the game recovers on the
   * next frame wherever possible instead of dying outright — but if the
   * SAME scene throws on every single frame (not a one-off hiccup, an
   * actual bug), "recovers next frame" never actually happens: the loop
   * just silently fails and retries forever, which looks identical to a
   * hang from the outside. `_consecutiveTickErrors` catches that case —
   * once a run of failures crosses the threshold, `_showFatalError` takes
   * over instead of continuing to fail silently.
   *
   * `_updateAudioFades` runs right after `scene.update(dt)` (inside the same
   * try/catch, so a scene bug can't leave audio fades permanently stuck) —
   * after, not before, so this frame's `onMusicDuck` call (fired from
   * GameplayScene's own `update()`) is already reflected the same frame
   * instead of lagging a frame behind.
   * @param {number} timestamp  high-resolution time in ms, supplied by rAF
   */
  _tick(timestamp) {
    // Cap dt at 100 ms — safety net if visibilitychange didn't fire (some mobile
    // browsers, iframe embeds) or for ordinary frame-rate hiccups. At 100 ms max,
    // a bullet cooldown can only go −0.1 s negative → fires at most one extra shot.
    const raw = this._lastTimestamp ? (timestamp - this._lastTimestamp) / 1000 : 0;
    const dt  = Math.min(raw, 0.1);
    this._lastTimestamp = timestamp;

    try {
      this.scene.update(dt);
      this._updateAudioFades(dt);
      this.scene.render();
      this._consecutiveTickErrors = 0;
    } catch (err) {
      console.error('Game loop error (frame skipped, loop continues):', err);
      this._consecutiveTickErrors++;
      if (this._consecutiveTickErrors >= 5) this._showFatalError(err);
    }

    requestAnimationFrame(this._tick);
  }

  /**
   * Advance whichever background-music fades are currently active
   * (prologue, gameplay theme — either or both may not exist yet, e.g.
   * before the intro swipe or before gameplay has ever started) and apply
   * the result to each Audio element's `.volume`. The gameplay theme's
   * final volume is its configured base volume times TWO independent 0-1
   * factors multiplied together — `_themeDuckMultiplier` (GameplayScene's
   * per-level ducking) and `_themeFader.value` (this fade-in/out ramp) —
   * see `_startGameplay`'s doc for why those stay separate rather than one
   * of them writing `.volume` directly.
   * @param {number} dt seconds
   */
  _updateAudioFades(dt) {
    if (this._prologueAudio && this._prologueFader) {
      this._prologueAudio.volume = Config.audio.prologueThemeVolume * this._prologueFader.update(dt);
    }
    if (this._themeAudio && this._themeFader) {
      this._themeAudio.volume = Config.audio.themeVolume * this._themeDuckMultiplier * this._themeFader.update(dt);
    }
  }

  /**
   * Last-resort visible failure display — see the doc comments above for
   * why this exists (a caught-but-silent error reads as a plain hang on a
   * device with no attached console). Replaces `this.scene` with a
   * minimal, permanently-inert one whose `update` is a true no-op (so it
   * can never itself throw and re-trigger this same path) and whose
   * `render` draws the error directly via the renderer's own primitives —
   * still going through the Renderer seam, never the raw canvas context.
   * @param {unknown} err
   */
  _showFatalError(err) {
    const message = String(err?.message ?? err ?? 'Unknown error').slice(0, 70);
    const { renderer } = this;
    this.scene = {
      update() {},
      render() {
        const { width: vW, height: vH } = Config.virtual;
        renderer.clear('#1a0000');
        renderer.drawText('SOMETHING WENT WRONG', vW / 2, vH / 2 - 40, {
          font: '400 22px "Audiowide", "Courier New", monospace', color: '#ff3b3b',
        });
        renderer.drawText(message, vW / 2, vH / 2, {
          font: '400 13px "Courier New", monospace', color: '#ffffff',
        });
        renderer.drawText('Please reload the page', vW / 2, vH / 2 + 40, {
          font: '400 15px "Audiowide", "Courier New", monospace', color: '#aab4d4',
        });
      },
    };
  }

  /**
   * Compute the largest rectangle that fits the available space while
   * preserving the virtual aspect ratio (letterboxing). This keeps gameplay
   * dimensions constant, avoids distortion, and prevents stretching on
   * large screens.
   */
  _onResize() {
    const { width: vW, height: vH } = Config.virtual;
    const aspect = vW / vH;

    const availW = this.stage.clientWidth;
    const availH = this.stage.clientHeight;

    let cssW = availW;
    let cssH = cssW / aspect;
    if (cssH > availH) {
      cssH = availH;
      cssW = cssH * aspect;
    }

    this.renderer.resize(cssW, cssH);
    this.scene.render();
  }
}
