/**
 * AudioPool.js
 * Plays short, frequently retriggered clips (typewriter blips, gunfire,
 * explosions) via the Web Audio API rather than pooling `<audio>` elements.
 *
 * The previous approach — cycle through a fixed pool of `Audio` elements,
 * rewinding each one (`currentTime = 0`) before replaying it — has a real,
 * well-documented cost on iOS Safari/WebKit specifically: repeatedly
 * seeking an already-loaded `<audio>` element back to the start is not a
 * free operation there, and at a rapid, continuous trigger rate (bullets
 * fire up to 9×/second the whole time the player is shooting) that cost
 * compounds into a steady background drain — this was the actual cause of
 * "the game lags as soon as the player starts shooting, even with no
 * enemies on screen" on an iPhone 11.
 *
 * The Web Audio API sidesteps this entirely: each source clip is decoded
 * ONCE into an `AudioBuffer` (shared across every pool requesting the same
 * `src` — `explosion.mp3` alone is reused by eight different enemy
 * types' pools, so this also cuts seven redundant fetch+decode round
 * trips), and every `play()` spawns a cheap, disposable
 * `AudioBufferSourceNode` that the browser garbage-collects once it
 * finishes — no shared mutable playback state to rewind, so overlapping
 * retriggers are natively free instead of needing a pool to manage them.
 * `poolSize` is kept in the constructor purely so no call site needs to
 * change; nothing internally still needs to size a pool.
 *
 * One shared `AudioContext` is used for the whole game (constructing one
 * per pool would be wasteful and each browser caps how many can exist) —
 * lazily created on first use, matching the original's "don't allocate
 * anything before a sound is actually needed" behavior.
 */
import { isMuted } from './AudioSettings.js';

let _sharedContext = null;
// Every pool requesting the same `src` shares one decode — keyed by src,
// so e.g. all eight enemy explosion pools reuse a single AudioBuffer.
const _bufferCache = new Map();

function _getContext() {
  if (!_sharedContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    _sharedContext = new AudioContextClass();
  }
  return _sharedContext;
}

/** Fetch + decode `src` once; every subsequent call for the same src reuses the in-flight or resolved promise. */
function _loadBuffer(src) {
  let promise = _bufferCache.get(src);
  if (!promise) {
    promise = fetch(src)
      .then((response) => response.arrayBuffer())
      .then((data) => _getContext().decodeAudioData(data))
      .catch(() => null); // degrade silently — same tolerance the old `.play().catch(() => {})` had
    _bufferCache.set(src, promise);
  }
  return promise;
}

export class AudioPool {
  /**
   * @param {string} src
   * @param {number} poolSize  unused internally (Web Audio needs no pool —
   *   see class doc) — kept so existing call sites don't need to change
   * @param {number} [volume]  fixed volume applied on every play; omit to
   *   set it per-play via `play(volume)` instead — e.g. an explosion pool
   *   shared across enemy types whose volumes differ
   */
  constructor(src, poolSize, volume) {
    this._src = src;
    this._volume = volume ?? 1;
    this._bufferPromise = null; // lazily kicked off on first play() — see class doc
  }

  /**
   * Play one instance of the clip. Overlapping retriggers are free (each
   * gets its own disposable playback node) — no round-robin bookkeeping.
   *
   * Wrapped end-to-end in try/catch: audio is a side effect, never a
   * gameplay dependency, and every step here touches a real browser API
   * (AudioContext construction, node creation) that this codebase has only
   * ever been able to verify in mocked Node tests, never a real device. If
   * any of it throws for a reason specific to some browser/device, that
   * exception must never be allowed to propagate into the caller — e.g.
   * Bullets._fire() calls this synchronously from inside Bullets.update(),
   * and an uncaught throw there aborts the rest of that update() call
   * before it ever reaches collision handling, silently breaking movement,
   * kills, and the screen-shake/hit-stop they trigger, with no visible
   * error and no plausible way to connect the symptom back to "audio."
   * @param {number} [volume]  overrides this instance's volume for this play only
   */
  play(volume) {
    try {
      if (isMuted()) return; // skip entirely — no fetch, no decode, no playback
      if (!this._bufferPromise) this._bufferPromise = _loadBuffer(this._src);

      const ctx = _getContext();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      this._bufferPromise.then((buffer) => {
        if (!buffer) return; // failed to load/decode — degrade silently
        try {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = volume !== undefined ? volume : this._volume;
          source.connect(gain).connect(ctx.destination);
          source.start();
        } catch {
          // Node creation/playback failed for some device/browser-specific
          // reason — degrade silently, same as a failed load above.
        }
      });
    } catch {
      // AudioContext construction (or anything else synchronous above)
      // failed — degrade silently rather than breaking the caller.
    }
  }
}
