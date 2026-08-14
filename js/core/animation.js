/**
 * animation.js
 * Small, stateless animation-curve helpers reused across entities and
 * scenes — kept here rather than duplicated per-file so a tuning change to
 * the shared "feel" of an easing or flicker only needs to happen once.
 */

/** Ease-out cubic: brisk start, gentle settle toward t=1. */
export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** Ease-in cubic: gentle start, sudden brisk finish toward t=1 — a "kicks into gear" curve. */
export function easeInCubic(t) {
  return t ** 3;
}

/**
 * Ease-out back: overshoots past 1 before settling — a "pop" a plain
 * ease-out reads as flat, used for reveal/celebration UI (e.g. a reward
 * card scaling in) rather than gameplay motion. Standard easings.net
 * formula; `overshoot` controls how far past 1 the curve swings before
 * settling back.
 */
export function easeOutBack(t, overshoot = 1.7) {
  const c3 = overshoot + 1;
  return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

/**
 * Three incommensurate sine/cosine waves summed together — their
 * interference produces quasi-random "signal-drop" dips without any
 * per-frame randomness (deterministic given `t`, so no extra state is
 * needed, and it looks identical on replay). Used for the "weak
 * transmission" flicker on the year-card and level-intro text.
 * @param {number} t  elapsed seconds
 * @param {[number, number, number]} freqs  angular frequencies of the 3 waves
 * @param {[number, number]} phases  phase offsets for waves 2 and 3 (wave 1 has none)
 * @param {number} base  center alpha before the noise term is applied
 * @param {number} depth  how far the noise term can push alpha away from `base`
 * @param {number} [min]  floor so the flicker never fully vanishes
 */
export function flickerAlpha(t, freqs, phases, base, depth, min = 0.08) {
  const [f1, f2, f3] = freqs;
  const [p2, p3] = phases;
  const noise = (Math.sin(t * f1) + Math.sin(t * f2 + p2) + Math.cos(t * f3 + p3)) / 3;
  return Math.max(min, Math.min(1, base + noise * depth));
}
