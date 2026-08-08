/**
 * AudioPool.js
 * A small round-robin pool of `Audio` elements for short, frequently
 * retriggered clips (typewriter blips, gunfire, explosions). Cloning a new
 * `Audio` per play would create many short-lived DOM objects under rapid
 * fire, adding GC pressure on low-end devices — cycling through a fixed
 * pool and rewinding (`currentTime = 0`) avoids that, at the cost of
 * capping how many overlapping instances of the same clip can play at once
 * (the pool size is chosen per-caller to cover that).
 *
 * The underlying `Audio` elements aren't created until the first `play()`
 * call, so constructing a pool up front (e.g. in a scene's constructor)
 * doesn't front-load HTMLMediaElement allocations before a sound is ever
 * actually needed.
 */
export class AudioPool {
  /**
   * @param {string} src
   * @param {number} poolSize
   * @param {number} [volume]  fixed volume applied to every instance once,
   *   at creation; omit to leave each Audio's volume at its default (1.0)
   *   and set it per-play via `play(volume)` instead — e.g. an explosion
   *   pool shared across enemy types whose volumes differ.
   */
  constructor(src, poolSize, volume) {
    this._src = src;
    this._poolSize = poolSize;
    this._volume = volume;
    this._pool = null; // lazily created on first play()
    this._idx = 0;
  }

  /**
   * Play the next instance in round-robin order, restarting it from the top.
   * @param {number} [volume]  overrides this instance's volume for this play only
   */
  play(volume) {
    if (!this._pool) {
      this._pool = Array.from({ length: this._poolSize }, () => {
        const a = new Audio(this._src);
        if (this._volume !== undefined) a.volume = this._volume;
        return a;
      });
    }
    const a = this._pool[this._idx];
    this._idx = (this._idx + 1) % this._pool.length;
    if (volume !== undefined) a.volume = volume;
    a.currentTime = 0;
    a.play().catch(() => {});
  }
}
