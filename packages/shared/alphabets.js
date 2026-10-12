// Letters that never count as another one when answers are compared, per language of the answers, and the few
// equivalences that removing accents does not give by itself. Taken from the content packs of Oksigenia Classtools.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const ALPHABETS = {
  es: { distinct: LATIN + 'Ñ' },
  // Catalan keeps the Ç apart: «plaça» and «placa» are different words.
  ca: { distinct: LATIN + 'Ç' },
  eu: { distinct: LATIN + 'Ñ' },
  gl: { distinct: LATIN + 'Ñ' },
  en: { distinct: LATIN },
  de: { distinct: LATIN + 'ÄÖÜß', fold: { 'ẞ': 'ß' } },
  fr: { distinct: LATIN, fold: { 'Æ': 'AE', 'Œ': 'OE' } },
  it: { distinct: LATIN },
  nl: { distinct: LATIN, fold: { 'Ĳ': 'IJ' } },
  pt: { distinct: LATIN },
  sv: { distinct: LATIN + 'ÅÄÖ', fold: { 'Ü': 'Y', 'Æ': 'Ä', 'Ø': 'Ö' } },
  other: { distinct: '' },
};

/**
 * The comparison rules of a language, with extra distinct letters written by the author (any separator).
 * @param {string} language Key of ALPHABETS; unknown keys behave as «other».
 * @param {string} [extra] More letters that never count as another one.
 * @returns {{distinct: string[], fold: Object<string, string>}}
 */
export function alphabetFor(language, extra = '') {
  const base = ALPHABETS[language] || ALPHABETS.other;
  const letters = [...base.distinct, ...[...String(extra).normalize('NFC')].filter((c) => /\p{L}/u.test(c))];
  return { distinct: [...new Set(letters)], fold: { ...(base.fold || {}) } };
}
