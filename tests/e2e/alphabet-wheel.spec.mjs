// End-to-end tests of H5P.AlphabetWheel in the h5p-cli dev server, with the example wheels (fictitious content).
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const example = (lang) => JSON.parse(readFileSync(
  new URL(`../../packages/alphabet-wheel/content/${lang}/content/content.json`, import.meta.url), 'utf8',
));
const answersOf = (lang) => Object.fromEntries(example(lang).items.map((it) => [it.letter, it.answer]));

/** Opens an example wheel and starts listening to its xAPI statements. `session` keeps the state between loads. */
async function open(page, lang, session = 'null') {
  await page.goto(`/view/h5p-alphabet-wheel/alphabet-wheel-${lang}?session=${session}`);
  const handle = await page.locator('iframe.h5p-iframe').elementHandle();
  const frame = await handle.contentFrame();
  await frame.waitForSelector('.aw');
  await frame.evaluate(() => {
    window.statements = [];
    H5P.externalDispatcher.on('xAPI', (e) => window.statements.push(e.data.statement));
  });
  return frame;
}

const currentLetter = (frame) => frame.locator('.aw-letter[aria-current] .aw-letter-text').textContent();
const verbs = (frame) => frame.evaluate(() => window.statements.map((s) => s.verb.id.split('/').pop()));

async function startWithKeyboard(page, frame) {
  await frame.locator('.aw-intro button').focus();
  await page.keyboard.press('Enter');
  await expect(frame.locator('.aw-input')).toBeFocused();
}

test('a whole wheel played with the keyboard sends one result, with one point per letter', async ({ page }) => {
  const frame = await open(page, 'es');
  const answers = answersOf('es');
  await startWithKeyboard(page, frame);

  let passedE = false;
  for (let turn = 0; turn < 60 && await frame.locator('.aw-results').isHidden(); turn++) {
    const letter = await currentLetter(frame);
    if (letter === 'E' && !passedE) {
      passedE = true;
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(frame.locator('.aw-row button.aw-secondary')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(frame.locator('.aw-input')).toBeFocused();
      continue;
    }
    // Two wrong answers; the rest right, some typed without accents or the diaeresis.
    const typed = { C: 'caracola', K: 'kaki', P: 'pinguino', V: 'volcan' }[letter] ?? answers[letter];
    await page.keyboard.type(typed);
    await page.keyboard.press('Enter');
  }

  await expect(frame.locator('.aw-result-title')).toHaveText('25 de 27 letras acertadas');
  await expect(frame.locator('.aw-result-title')).toBeFocused();
  expect(passedE).toBe(true);

  const sent = await verbs(frame);
  expect(sent.filter((v) => v === 'answered')).toHaveLength(1);
  expect(sent.at(-1)).toBe('answered');
  expect(sent.slice(0, -1).every((v) => v === 'attempted' || v === 'progressed')).toBe(true);
  const result = await frame.evaluate(() => window.statements.at(-1).result);
  expect(result.score).toMatchObject({ raw: 25, max: 27 });
  expect(result.completion).toBe(true);
  expect(result.success).toBe(false);

  // What Moodle asks for when the game is over: the same score, as a fill-in with one gap per letter.
  const data = await frame.evaluate(() => H5P.instances[0].getXAPIData().statement);
  expect(data.verb.id).toBe('http://adlnet.gov/expapi/verbs/answered');
  expect(data.result.score).toMatchObject({ raw: 25, max: 27 });
  expect(data.object.definition.interactionType).toBe('fill-in');
  expect(data.result.response.split('[,]')).toHaveLength(27);
  expect(data.object.definition.extensions['http://h5p.org/x-api/h5p-local-content-id']).toBeDefined();
  // «pinguino» was taken as right, so the report counts it among the accepted answers of the P.
  const p = Object.keys(answers).indexOf('P');
  expect(data.object.definition.extensions['https://h5p.org/x-api/alternatives'][p]).toContain('pinguino');
});

test('the Ñ is not the N', async ({ page }) => {
  const frame = await open(page, 'es');
  await frame.locator('.aw-intro button').click();
  while (await currentLetter(frame) !== 'Ñ') {
    await frame.locator('.aw-row button.aw-secondary').click();
  }
  await frame.locator('.aw-input').fill('arana');
  await frame.locator('.aw-input').press('Enter');
  await expect(frame.locator('.aw-feedback')).toContainText('Era «Araña»');
});

test('a reload in the middle of the game takes it up again, paused', async ({ page }) => {
  const session = `resume-${Date.now()}`;
  let frame = await open(page, 'en', session);
  await frame.locator('.aw-intro button').click();
  await frame.locator('.aw-input').fill('apple');
  await frame.locator('.aw-input').press('Enter');
  await frame.locator('.aw-input').fill('car');
  await frame.locator('.aw-input').press('Enter');
  await frame.locator('.aw-row button.aw-secondary').click();
  // H5P saves the state three seconds after each move.
  await page.waitForTimeout(3500);

  await page.reload();
  frame = await open(page, 'en', session);
  await expect(frame.locator('.aw-game')).toBeVisible();
  await expect(frame.locator('.aw-paused')).toBeVisible();
  await expect(frame.locator('.aw-question')).toBeHidden();
  const states = await frame.locator('.aw-letter').evaluateAll((els) => els.slice(0, 4).map((e) => e.className));
  expect(states[0]).toContain('aw-ok');
  expect(states[1]).toContain('aw-bad');
  expect(states[2]).toContain('aw-passed');
  expect(states[3]).toContain('aw-current');
  await frame.locator('.aw-pause').click();
  await expect(frame.locator('.aw-clue')).toHaveText(example('en').items[3].clue);
});

test('the pause hides the clue and stops the clock', async ({ page }) => {
  const frame = await open(page, 'en');
  await frame.locator('.aw-intro button').click();
  await frame.locator('.aw-pause').click();
  await expect(frame.locator('.aw-question')).toBeHidden();
  await expect(frame.locator('.aw-hub-letter')).toHaveText('');
  const before = await frame.locator('.aw-clock-value').textContent();
  await page.waitForTimeout(2200);
  await expect(frame.locator('.aw-clock-value')).toHaveText(before);
  await frame.locator('.aw-pause').click();
  await expect(frame.locator('.aw-input')).toBeFocused();
  await page.waitForTimeout(2200);
  await expect(frame.locator('.aw-clock-value')).not.toHaveText(before);
});

test('finishing early asks twice and leaves the open letters without a point', async ({ page }) => {
  const frame = await open(page, 'en');
  await frame.locator('.aw-intro button').click();
  await frame.locator('.aw-input').fill('apple');
  await frame.locator('.aw-input').press('Enter');
  await frame.locator('.aw-finish').click();
  await expect(frame.locator('.aw-finish')).toHaveText('Finish now? Press again');
  await expect(frame.locator('.aw-game')).toBeVisible();
  await frame.locator('.aw-finish').click();
  await expect(frame.locator('.aw-result-title')).toHaveText('1 of 26 letters right');
  await expect(frame.locator('.aw-review-item.aw-passed')).toHaveCount(25);
  await frame.locator('.aw-actions button.aw-secondary').click();
  await expect(frame.locator('.aw-review-solution').first()).toHaveText('Answer: Bicycle');
  expect((await verbs(frame)).filter((v) => v === 'answered')).toHaveLength(1);
  await frame.locator('.aw-actions button.aw-primary').click();
  await expect(frame.locator('.aw-input')).toBeFocused();
  await expect(frame.locator('.aw-letter.aw-ok')).toHaveCount(0);
  // The retry is a new attempt, announced as such.
  expect((await verbs(frame)).filter((v) => v === 'attempted')).toHaveLength(2);
});

for (const width of [320, 1100]) {
  test(`no sideways scrolling and no axe violations at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const frame = await open(page, 'es');
    const axe = async (step) => {
      const scroll = await frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll, `sideways scroll on ${step}`).toBeLessThanOrEqual(0);
      const report = await new AxeBuilder({ page })
        .include({ fromFrames: ['iframe.h5p-iframe', '.aw'] })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(report.violations.map((v) => `${step}: ${v.id} (${v.nodes.length})`)).toEqual([]);
      // Proof that axe looked inside the game, not at an empty selection.
      const contrast = report.passes.find((p) => p.id === 'color-contrast');
      expect(contrast && contrast.nodes.length, `contrast checked on ${step}`).toBeGreaterThan(3);
    };
    await axe('intro');
    await frame.locator('.aw-intro button').click();
    await frame.locator('.aw-input').fill('abeja');
    await frame.locator('.aw-input').press('Enter');
    await frame.locator('.aw-input').fill('bote');
    await frame.locator('.aw-input').press('Enter');
    await frame.locator('.aw-row button.aw-secondary').click();
    await axe('game');
    await frame.locator('.aw-finish').click();
    await frame.locator('.aw-finish').click();
    await frame.locator('.aw-actions button.aw-secondary').click();
    await axe('results');
  });
}
