// @ts-check
// Text helpers for the quiz.

/** @param {string} s */
export const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Russian Wikipedia marks stress with combining accents (Росси́йская), which
// would stop the region's name from matching, so they're stripped first.
/** @param {string} s */
export const plain = (s) =>
  s
    .normalize("NFD")
    .replace(/\u0301/g, "")
    .normalize("NFC");

/**
 * Hides a region's names (and their longer words) in a sentence, for the quiz.
 * @param {string} text
 * @param {(string | null | undefined)[]} names
 */
export function maskName(text, names) {
  const terms = [
    ...new Set(
      names
        .filter((n) => typeof n === "string" && n.length > 0)
        .map((n) => plain(/** @type {string} */ (n)))
        .flatMap((n) => [n, ...n.split(/[\s,()–-]+/).filter((w) => w.length >= 4)]),
    ),
  ].sort((a, b) => b.length - a.length);
  return terms.reduce((out, term) => out.replace(new RegExp(escRe(term), "gi"), "▁▁▁"), plain(text));
}

/** @param {string} text */
export const firstSentence = (text) => ((text.match(/^(.{40,}?[.!?])(\s|$)/) || [])[1] || text).slice(0, 240);
