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
import { isMuted, onMutedChange, getVolume } from './AudioSettings.js';
import { AudioFader } from './AudioFader.js';
import { Renderer } from './Renderer.js';
import { SwipeInput } from './SwipeInput.js';
import { TapInput } from './TapInput.js';
import { DragInput } from './DragInput.js';
import { IntroScene } from '../scenes/IntroScene.js';
import { PrologueScene } from '../scenes/PrologueScene.js';
import { TutorialScene } from '../scenes/TutorialScene.js';
import { MissionSelectScene } from '../scenes/MissionSelectScene.js';
import { GameplayScene } from '../scenes/GameplayScene.js';
import { completeMission } from './MissionProgress.js';
import { hasSeenPrologue } from './PrologueProgress.js';
import { hasSeenTutorial, markTutorialSeen } from './TutorialProgress.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} stage  the element whose box defines available space
   * @param {{ announce?: (text: string) => void }} [options]  `announce`
   *   pushes a short status string into the one screen-reader-visible piece
   *   of DOM the page has (see main.js's `#sr-status` live region) — the
   *   only DOM access this class needs, so it's injected the same way every
   *   other Game dependency is rather than Game reaching for `document`
   *   itself. Defaults to a no-op so Game stays usable without it.
   */
  constructor(canvas, stage, { announce } = {}) {
    this.stage = stage;
    this._announce = announce || (() => {});
    this.renderer = new Renderer(canvas);
    this.scene = new IntroScene(this.renderer, {
      onContinue: () => this._startPrologue(hasSeenPrologue()),
      onSwipeDetected: () => this._startPrologueMusic(),
    });
    this._announce('Space Shooter. Swipe up to continue.');
    this._lastTimestamp = 0;
    this._consecutiveTickErrors = 0; // see _tick's doc — trips _showFatalError after too many in a row

    // Mission Mode's special-skill (bomb) cooldown, carried across separate
    // missions — see PlayerSkill.js's own class doc and `_startGameplay`'s
    // `skillCooldown` option. Lives here (like `_themeAudio`) because it
    // must outlive any single GameplayScene/mission: using the bomb near the
    // end of one mission should still leave it recharging at the start of
    // the next, not reset to ready just because a fresh GameplayScene was
    // constructed. Updated from GameplayScene's `onGameOver`/
    // `onMissionComplete` callbacks each time a mission-mode run ends,
    // whichever way it ends. Survival Mode never reads or writes this — its
    // own GameplayScene instance already persists its PlayerSkill across
    // level-ups on its own.
    this._missionSkillCooldown = 0;

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
   * @param {boolean} [devSkipToTitle]  forwarded to PrologueScene — starts
   *   straight on the title/mode-button card instead of playing the
   *   (unskippable) cinematic. Two call sites pass `true`: the constructor
   *   above, once `hasSeenPrologue()` says this player already sat through
   *   it on a previous visit, and `_startMissionSelect`'s "back" navigation
   *   (see MissionSelectScene), so returning to the title screen never
   *   replays the cinematic either. `false` (the default) is only ever
   *   actually reached the very first time a given player boots the game.
   */
  _startPrologue(devSkipToTitle = false) {
    try {
      this.scene = new PrologueScene(this.renderer, {
        onContinue: (mode) => {
          // Survival Mode has no level-select step of its own, so the
          // shared tutorial (if not seen yet, in EITHER mode — see
          // TutorialProgress.js) plays right here, same as always. Mission
          // Mode instead goes straight to the mission-select screen — its
          // shot at the tutorial comes when Level 1 is actually launched
          // (see `_startMissionLevel`), not before the player has even seen
          // the level list. Whichever mode the player picks first is the
          // one that ends up playing it.
          if (mode === 'survival') {
            this._startTutorial(() => this._startGameplay({ mode: 'survival' }));
          } else {
            this._startMissionSelect();
          }
        },
        devSkipToTitle,
        onMainMenuReached: () => {
          this._fadeOutPrologueMusic();
          this._announce('Title screen. Tap Play to begin.');
        },
      });
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
   * Ramp the prologue music down to silence, then pause it — passed to
   * `PrologueScene` as `onMainMenuReached`, so it fires the instant the
   * title/PLAY card ("the main menu") is reached, whether that's via the
   * full cinematic finishing or a `devSkipToTitle` boot starting there
   * directly. Optional-chained throughout since `_startPrologueMusic` may
   * have failed (or not run yet) — see its own try/catch.
   */
  _fadeOutPrologueMusic() {
    this._prologueFader?.rampTo(0, Config.audio.prologueFadeOutDuration, () => this._prologueAudio?.pause());
  }

  /**
   * Swap whatever's currently showing out for the tutorial — ONE global
   * flag (see TutorialProgress.js), not per-mode: Mission Mode and Survival
   * Mode are two on-ramps into the same hint sequence, so `hasSeenTutorial`
   * skips straight to `onDone` the instant either mode has ever played it,
   * rather than rebuilding a `TutorialScene` a second time for whichever
   * mode the player tries second. Two call sites: `_startPrologue`'s
   * `onContinue` (Survival Mode, right after the title card) and
   * `_startMissionLevel` (Mission Mode, right as Level 1 is launched from
   * mission-select — see that method's own doc for why it's gated there and
   * not earlier). `TutorialScene` itself has no back/skip path — only
   * `handleTap`/`handleSwipeUp`, both of which just advance — and
   * `_startGameplay` is only ever reached through `onDone` here or through
   * this same already-seen check, so once triggered the tutorial can't be
   * bypassed on its first, one-and-only playthrough.
   * @param {() => void} onDone  called once the tutorial finishes (or
   *   immediately, if already seen) — carries on to wherever this mode goes
   *   next (gameplay, in both current call sites).
   */
  _startTutorial(onDone) {
    if (hasSeenTutorial()) {
      onDone();
      return;
    }
    try {
      this.scene = new TutorialScene(this.renderer, {
        onContinue: () => {
          markTutorialSeen();
          onDone();
        },
      });
      this._announce('Tutorial. Follow the on-screen hints.');
    } catch (err) {
      console.error('Failed to start the tutorial:', err);
      this._showFatalError(err);
    }
  }

  /**
   * Mission Mode's level-select screen (see MissionSelectScene.js). No
   * gameplay bg-music here — same silence Tutorial/Prologue's title card
   * already sit in; `_startGameplay` is what actually starts the theme
   * track, same as it always has. "Back" returns to the title card without
   * replaying the cinematic (`devSkipToTitle: true` — see
   * `_startPrologue`'s own doc).
   */
  _startMissionSelect() {
    try {
      this.scene = new MissionSelectScene(this.renderer, {
        onSelectMission: (level) => this._startMissionLevel(level),
        onBack: () => this._startPrologue(true),
      });
      this._announce('Mission select.');
    } catch (err) {
      console.error('Failed to start mission select:', err);
      this._showFatalError(err);
    }
  }

  /**
   * Launches a chosen mission level, playing the shared tutorial first if
   * it hasn't been seen yet (in EITHER mode — see TutorialProgress.js).
   * Only Level 1 can ever hit that branch in practice — missions unlock
   * sequentially, so a first-time player has nothing else to pick on the
   * select screen — but checking `level === 1` rather than just
   * `!hasSeenTutorial()` keeps this tied to the actual requirement
   * (tutorial belongs to Level 1) rather than an incidental consequence of
   * unlock order.
   * @param {number} level
   */
  _startMissionLevel(level) {
    if (level === 1) {
      this._startTutorial(() => this._startGameplay({ mode: 'mission', level }));
    } else {
      this._startGameplay({ mode: 'mission', level });
    }
  }

  /**
   * Swap the tutorial out for the gameplay scene once all hints are
   * dismissed. Also reused verbatim as the "restart" path: GameplayScene's
   * `onGameOver` callback below is this same method, so a post-death tap
   * just calls this again — a fresh `GameplayScene` is by construction a
   * clean run (full health, zero score, and the same starting level the
   * previous attempt had — level 1 for Survival Mode, whichever mission
   * was chosen for Mission Mode, since `mode`/`level` are closed over) —
   * EXCEPT Mission Mode's special-skill cooldown, which deliberately is NOT
   * reset here; see `_missionSkillCooldown`'s own doc.
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
   *
   * @param {{ mode?: 'mission'|'survival', level?: number }} [options]
   *   `mode`/`level` default to Survival Mode's original always-level-1
   *   behavior, so every existing call site (and `onGameOver` below, which
   *   calls this method again) keeps working unchanged. Mission Mode passes
   *   its target level explicitly (from MissionSelectScene's tap, or from
   *   `onGameOver`'s own closure over the SAME values on a post-death
   *   restart, so a mission retry replays that same mission rather than
   *   dropping back to Survival Mode's level 1).
   */
  _startGameplay({ mode = 'survival', level = 1 } = {}) {
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
      this._announce(mode === 'mission' ? `Mission ${level} started.` : 'Survival mode started.');
      this.scene = new GameplayScene(this.renderer, {
        mode,
        level,
        announce: this._announce,
        // Mission Mode only (see `_missionSkillCooldown`'s own doc) — Survival
        // Mode's GameplayScene instance already persists its own PlayerSkill
        // across level-ups, so it never needs a hand-me-down value here.
        skillCooldown: mode === 'mission' ? this._missionSkillCooldown : 0,
        onGameOver: (skillCooldownRemaining) => {
          if (mode === 'mission') this._missionSkillCooldown = skillCooldownRemaining;
          this._startGameplay({ mode, level });
        },
        // Mission Mode only — fires once that single level's wave clears
        // (see GameplayScene._triggerMissionComplete). Persists the
        // completion (unlocking the next mission — see MissionProgress.js)
        // and returns to the select screen. Survival Mode never calls this.
        onMissionComplete: mode === 'mission' ? (skillCooldownRemaining) => {
          this._missionSkillCooldown = skillCooldownRemaining;
          completeMission(level);
          this._startMissionSelect();
        } : undefined,
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
        // Resumes the SAME theme track in place after a paid revive (see
        // GameplayScene._tryRevive) — unlike onGameOver above, this must NOT
        // construct a new GameplayScene (that would lose the current run's
        // level/score/combo state); it only undoes onMusicStop's fade-out.
        // Called from inside the revive tap's handler, so audio.play() is
        // still within the user-gesture chain the same way _startGameplay's
        // own call is (see that method's own doc).
        onMusicResume: () => {
          this._themeAudio?.play().catch(() => {});
          this._themeFader?.rampTo(1, Config.audio.themeFadeInDuration);
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
   * instead of lagging a frame behind. It also re-reads `AudioSettings`'s
   * `getVolume()` every frame rather than caching it, so the Settings
   * panel's volume slider takes effect on already-playing music live,
   * mid-drag — same reasoning as why `getVolume()` needs no change-listener
   * (see that module's own doc).
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
      this._prologueAudio.volume = Config.audio.prologueThemeVolume * this._prologueFader.update(dt) * getVolume();
    }
    if (this._themeAudio && this._themeFader) {
      this._themeAudio.volume = Config.audio.themeVolume * this._themeDuckMultiplier * this._themeFader.update(dt) * getVolume();
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
    this._announce(`Something went wrong: ${message}. Please reload the page.`);
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
