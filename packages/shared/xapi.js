// The xAPI definition of a game made of gaps (one per letter or per word), as H5P Fill in the Blanks sends it, so
// the Moodle report shows each gap with the player's answer and the accepted ones.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

export const XAPI_ALTERNATIVES = 'https://h5p.org/x-api/alternatives';
export const XAPI_CASE_SENSITIVITY = 'https://h5p.org/x-api/case-sensitivity';
const GAP = '__________';
const SEPARATOR = '[,]';

// The xAPI response format uses «[,]» between gaps and «[.]» and «[:]» inside them.
const clean = (s) => String(s ?? '').replace(/\[[,.:]\]/g, ' ').replace(/_{10,}/g, '_________');

/**
 * @param {object} options
 * @param {string} options.intro Text before the gaps (the title of the game).
 * @param {Array<{prompt: string, accepted: string[]}>} options.gaps One line per gap, with the accepted answers.
 * @param {boolean} options.caseSensitive
 * @returns {Object} The `object.definition` of the statement.
 */
export function fillInDefinition({ intro, gaps, caseSensitive }) {
  const lines = gaps.map((g) => `${clean(g.prompt)} ${GAP}`);
  return {
    description: { 'en-US': `<p>${clean(intro)}</p>${lines.map((l) => `<p>${l}</p>`).join('')}` },
    type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    interactionType: 'fill-in',
    correctResponsesPattern: [`{case_matters=${caseSensitive}}` + gaps.map((g) => clean(g.accepted[0])).join(SEPARATOR)],
    extensions: {
      [XAPI_CASE_SENSITIVITY]: caseSensitive,
      [XAPI_ALTERNATIVES]: gaps.map((g) => g.accepted.map(clean)),
    },
  };
}

/**
 * @param {Array<string|null>} answers What the player typed in each gap (null if nothing).
 * @returns {string}
 */
export function fillInResponse(answers) {
  return answers.map((a) => clean(a)).join(SEPARATOR);
}
