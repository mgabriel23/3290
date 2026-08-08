/**
 * textLayout.js
 * Word-wrap helpers for canvas text, which has no native line-breaking —
 * shared by every scene that reveals a paragraph word-by-word (typewriter
 * dialogue, tutorial hints).
 */

/**
 * Greedy word-wrap: split `text` into lines no wider than `maxWidth`.
 * @param {string} text
 * @param {number} maxWidth
 * @param {(candidateLine: string) => { width: number }} measureText  e.g. `(s) => renderer.measureText(s, font)`
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, measureText) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  return lines;
}

/**
 * Each line's starting index in the whole-paragraph word sequence — maps a
 * reveal word-count back to which line it falls on, for word-at-a-time
 * typewriter reveals.
 * @param {string[][]} lineWordArrays  each line already split into words
 * @returns {number[]}
 */
export function computeWordOffsets(lineWordArrays) {
  const offsets = [];
  let offset = 0;
  for (const words of lineWordArrays) {
    offsets.push(offset);
    offset += words.length;
  }
  return offsets;
}
