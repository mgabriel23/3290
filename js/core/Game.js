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
    // DEV: skip intro + prologue cinematic, boot straight to the title screen
    // To restore the full flow: replace this line with:
    //   this.scene = new IntroScene(this.renderer, { onContinue: () => this._startPrologue() });
    this.scene = new PrologueScene(this.renderer, { onContinue: () => this._startTutorial(), devSkipToTitle: true });
    this._lastTimestamp = 0;

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

  /** Swap the intro prompt out for the opening cinematic once the player swipes past it. */
  _startPrologue() {
    this.scene = new PrologueScene(this.renderer, { onContinue: () => this._startTutorial() });
  }

  /** Swap the cinematic out for the tutorial once the player taps PLAY on the title card. */
  _startTutorial() {
    this.scene = new TutorialScene(this.renderer, { onContinue: () => this._startGameplay() });
  }

  /** Swap the tutorial out for the gameplay scene once all hints are dismissed. */
  _startGameplay() {
    // Start background music here — we're inside the user-gesture call chain
    // (last tutorial hint tap → onContinue → here), so audio.play() is permitted.
    // The guard prevents a second play if _startGameplay is somehow called again.
    if (!this._themeAudio) {
      const { themeSrc, themeVolume, themeLoop } = Config.audio;
      this._themeAudio = new Audio(themeSrc);
      this._themeAudio.volume = themeVolume;
      this._themeAudio.loop = themeLoop;
      this._themeAudio.play().catch(() => {});
    }
    this.scene = new GameplayScene(this.renderer);
  }

  /**
   * The main loop: advance the scene by the elapsed time (in seconds),
   * render it, and schedule the next frame — keeping animation in step
   * with the display's refresh rate.
   * @param {number} timestamp  high-resolution time in ms, supplied by rAF
   */
  _tick(timestamp) {
    // Cap dt at 100 ms — safety net if visibilitychange didn't fire (some mobile
    // browsers, iframe embeds) or for ordinary frame-rate hiccups. At 100 ms max,
    // a bullet cooldown can only go −0.1 s negative → fires at most one extra shot.
    const raw = this._lastTimestamp ? (timestamp - this._lastTimestamp) / 1000 : 0;
    const dt  = Math.min(raw, 0.1);
    this._lastTimestamp = timestamp;

    this.scene.update(dt);
    this.scene.render();

    requestAnimationFrame(this._tick);
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
