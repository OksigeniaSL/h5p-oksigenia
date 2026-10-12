// Checks a typed answer against the accepted ones, with the tolerance the author chose: capitals, accents and
// spacing can be ignored, but the letters of the language (the Ñ in Spanish, the Ä in German) always count.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { alphabetFor } from './alphabets.js';

const MARKS = /\p{M}/gu;
const EDGE_PUNCTUATION = /^[\p{P}\s]+|[\p{P}\s]+$/gu;

/**
 * @param {object} options
 * @param {string} [options.language] Language of the answers (key of ALPHABETS).
 * @param {string} [options.extraLetters] More letters that never count as another one.
 * @param {boolean} [options.ignoreCase=true]
 * @param {boolean} [options.ignoreAccents=true]
 * @returns {{normalize: (text: string) => string, matches: (given: string, accepted: string[]) => number}}
 */
export function createMatcher({ language = 'other', extraLetters = '', ignoreCase = true, ignoreAccents = true } = {}) {
  const { distinct, fold } = alphabetFor(language, extraLetters);
  const caseOf = (s) => (ignoreCase ? s.toLowerCase() : s);
  // Distinct letters and the fold table in both cases, so they work whether capitals count or not.
  const keep = new Set(distinct.flatMap((l) => [l, l.toLowerCase(), l.toUpperCase()]));
  const folds = new Map();
  Object.entries(fold).forEach(([from, to]) => {
    folds.set(from, to);
    folds.set(from.toLowerCase(), to.toLowerCase());
  });

  const foldChar = (c) => {
    if (keep.has(c)) {
      return c;
    }
    if (folds.has(c)) {
      return folds.get(c);
    }
    return c.normalize('NFD').replace(MARKS, '');
  };

  const normalize = (text) => {
    let s = String(text ?? '').normalize('NFC')
      .replace(/[‘’ʼ]/g, "'")
      .replace(EDGE_PUNCTUATION, '')
      .replace(/\s+/gu, ' ');
    if (ignoreAccents) {
      s = [...s].map(foldChar).join('');
    }
    return caseOf(s);
  };

  /**
   * @param {string} given What the player typed.
   * @param {string[]} accepted The answer and its alternatives.
   * @returns {number} Index of the accepted answer that matches, or -1.
   */
  const matches = (given, accepted) => {
    const g = normalize(given);
    if (!g) {
      return -1;
    }
    return accepted.findIndex((a) => normalize(a) === g);
  };

  return { normalize, matches };
}

/**
 * Splits the alternatives an author writes in one field («Gafas / anteojos / lentes»).
 * @param {string} text
 * @returns {string[]}
 */
export function splitAlternatives(text) {
  return String(text ?? '').split('/').map((s) => s.trim()).filter(Boolean);
}
