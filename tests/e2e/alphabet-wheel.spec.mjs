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
  await expect(frame.locator('.aw-cheer-title')).toHaveText('¡Muy bien!');
  await expect(frame.locator('.aw-cheer-title')).toBeFocused();
  expect(passedE).toBe(true);

  const sent = await verbs(frame);
  expect(sent.filter((v) => v === 'answered')).toHaveLength(1);
  expect(sent.at(-1)).toBe('answered');
  expect(sent.slice(0, -1).every((v) => v === 'attempted' || v === 'progressed')).toBe(true);
  const result = await frame.evaluate(() => window.statements.at(-1).result);
  expect(result.score).toMatchObject({ raw: 25, max: 27 });
  expect(result.completion).toBe(true);
  expect(result.success).toBeUndefined();

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

/** Answers every letter of an example wheel right, straight through the form. */
async function playPerfect(frame, lang) {
  const answers = answersOf(lang);
  await frame.locator('.aw-intro button').click();
  for (let turn = 0; turn < 40 && await frame.locator('.aw-results').isHidden(); turn++) {
    await frame.locator('.aw-input').fill(answers[await currentLetter(frame)]);
    await frame.locator('.aw-input').press('Enter');
  }
}

test('a full wheel is celebrated, with confetti', async ({ page }) => {
  const frame = await open(page, 'en');
  await playPerfect(frame, 'en');
  await expect(frame.locator('.aw-cheer-title')).toHaveText('Perfect wheel!');
  await expect(frame.locator('.aw-cheer-title')).toBeFocused();
  await expect(frame.locator('.aw-result-title')).toHaveText('26 of 26 letters right');
  await expect(frame.locator('.h5p-oksigenia-ring-star')).toHaveCount(1);
  await expect(frame.locator('.h5p-oksigenia-ring-text')).toHaveText('26/26');
  await expect(frame.locator('.h5p-oksigenia-confetti')).toHaveCount(1);
  await expect(frame.locator('.h5p-oksigenia-confetti')).toHaveAttribute('aria-hidden', 'true');
  // The list of letters is still there, under the cheer.
  await expect(frame.locator('.aw-review-item.aw-ok')).toHaveCount(26);
});

test('without motion when the system asks for it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const frame = await open(page, 'en');
  await playPerfect(frame, 'en');
  await expect(frame.locator('.aw-cheer-title')).toHaveText('Perfect wheel!');
  await expect(frame.locator('.h5p-oksigenia-confetti')).toHaveCount(0);
});

/**
 * Counts the oscillators the game creates (a sound is a handful of them) and sends the sound to a zero gain, so the
 * test is silent on any browser.
 */
const countSounds = (frame) => frame.evaluate(() => {
  const proto = window.AudioContext.prototype;
  const original = proto.createOscillator;
  window.oscillators = 0;
  proto.createOscillator = function () {
    window.oscillators++;
    return original.call(this);
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode) {
      const silence = this.context.createGain();
      silence.gain.value = 0;
      connect.call(silence, target);
      return connect.call(this, silence, ...rest);
    }
    return connect.call(this, target, ...rest);
  };
});
const oscillators = (frame) => frame.evaluate(() => window.oscillators);

test('answers sound, and the mute button silences them and is remembered', async ({ page }) => {
  // The tests start muted (playwright.config.mjs): the speaker button brings the sound.
  let frame = await open(page, 'es');
  await countSounds(frame);
  await frame.locator('.aw-intro button').click();
  await expect(frame.locator('.aw-sound')).toHaveAttribute('aria-label', 'Activar el sonido');
  await frame.locator('.aw-sound').click();
  await expect(frame.locator('.aw-sound')).toHaveAttribute('aria-label', 'Silenciar');
  await frame.locator('.aw-input').fill('abeja');
  await frame.locator('.aw-input').press('Enter');
  await expect.poll(() => oscillators(frame)).toBeGreaterThan(0);

  await page.reload();
  frame = await open(page, 'es');
  await countSounds(frame);
  await frame.locator('.aw-intro button').click();
  await expect(frame.locator('.aw-sound')).toHaveAttribute('aria-label', 'Silenciar');
  await frame.locator('.aw-sound').click();
  await expect(frame.locator('.aw-sound')).toHaveAttribute('aria-label', 'Activar el sonido');
  const before = await oscillators(frame);
  await frame.locator('.aw-input').fill('bote');
  await frame.locator('.aw-input').press('Enter');
  await frame.locator('.aw-row button.aw-secondary').click();
  await page.waitForTimeout(300);
  expect(await oscillators(frame)).toBe(before);
});

test('authors can leave the sounds out', async ({ page }) => {
  const frame = await open(page, 'es');
  const button = await frame.evaluate(() => {
    const box = document.createElement('div');
    document.body.append(box);
    const wheel = new H5P.AlphabetWheel({
      items: [{ letter: 'A', kind: 'starts', clue: 'Insecto que fabrica miel', answer: 'Abeja' }],
      behaviour: { enableSound: false },
    }, 999);
    wheel.attach(H5P.jQuery(box));
    wheel.start();
    return box.querySelectorAll('.aw-sound').length;
  });
  expect(button).toBe(0);
});

const START = { es: 'Empezar', en: 'Start', de: 'Starten', fr: 'Commencer', it: 'Inizia', nl: 'Beginnen', 'pt-br': 'Começar', sv: 'Starta' };
for (const [lang, start] of Object.entries(START)) {
  test(`the ${lang} example plays in its own language`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const frame = await open(page, lang);
    await expect(frame.locator('.aw-intro button')).toHaveText(start);
    await frame.locator('.aw-intro button').click();
    const first = example(lang).items[0];
    await expect(frame.locator('.aw-letter[aria-current] .aw-letter-text')).toHaveText(first.letter);
    await frame.locator('.aw-input').fill(first.answer.toLowerCase());
    await frame.locator('.aw-input').press('Enter');
    await expect(frame.locator('.aw-letter.aw-ok')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('odd content: no letters, very long text, encoded characters and markup in a clue', async ({ page }) => {
  const frame = await open(page, 'es');
  const result = await frame.evaluate(() => {
    const mount = (params) => {
      const box = document.createElement('div');
      box.style.width = '320px';
      document.body.append(box);
      const wheel = new H5P.AlphabetWheel(params, 990);
      wheel.attach(H5P.jQuery(box));
      return { box, wheel };
    };
    // Saved with nothing but a title.
    const empty = mount({});
    // H5P stores plain text fields with entities; a platform might also hand over raw markup.
    const odd = mount({
      items: [
        { letter: 'A', kind: 'starts', clue: 'L&#039;été &amp; l&#039;automne', answer: 'Automne' },
        { letter: 'B', kind: 'starts', clue: '<img src="x" onerror="window.injected = 1">', answer: 'Bien' },
        { letter: 'C', kind: 'contains', clue: 'Muy larga '.repeat(30), answer: 'Cosa' },
      ],
    });
    odd.wheel.start();
    const clue1 = odd.box.querySelector('.aw-clue').textContent;
    odd.wheel.pass();
    const clue2 = odd.box.querySelector('.aw-clue').textContent;
    const images = odd.box.querySelectorAll('img').length;
    odd.wheel.pass();
    const wide = odd.box.querySelector('.aw').scrollWidth - odd.box.querySelector('.aw').clientWidth;
    return {
      emptyShown: !/** @type {HTMLElement} */ (empty.box.querySelector('.aw-empty')).hidden,
      emptyIntro: !/** @type {HTMLElement} */ (empty.box.querySelector('.aw-intro')).hidden,
      clue1, clue2, images, injected: /** @type {any} */ (window).injected, wide,
    };
  });
  expect(result.emptyShown).toBe(true);
  expect(result.emptyIntro).toBe(false);
  expect(result.clue1).toBe("L'été & l'automne");
  expect(result.clue2).toBe('<img src="x" onerror="window.injected = 1">');
  expect(result.images).toBe(0);
  expect(result.injected).toBeUndefined();
  expect(result.wide).toBeLessThanOrEqual(0);
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

test('the size of the H5P theme changes the text and the wheel', async ({ page }) => {
  const frame = await open(page, 'es');
  await frame.locator('.aw-intro button').click();
  const measure = () => frame.evaluate(() => ({
    text: parseFloat(getComputedStyle(document.querySelector('.aw-clue')).fontSize),
    wheel: document.querySelector('.aw-wheel').getBoundingClientRect().width,
  }));
  const size = (name) => page.evaluate((n) => /** @type {HTMLElement} */ (document.querySelector(`.button-theme-size.${n}`)).click(), name);
  await size('small');
  const small = await measure();
  await size('large');
  await expect.poll(async () => (await measure()).wheel).toBeGreaterThan(small.wheel * 1.2);
  expect((await measure()).text).toBeGreaterThan(small.text);
});

/** @type {Array<[number, string]>} */
const SCREENS = [[320, 'core'], [1100, 'core'], [320, 'dark'], [1100, 'dark']];
for (const [width, theme] of SCREENS) {
  test(`no sideways scrolling and no axe violations at ${width} px, ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const frame = await open(page, 'es');
    // The theme buttons of the dev server set the H5P core 1.28 theme variables inside the game.
    await page.evaluate((name) => /** @type {HTMLElement} */ (document.querySelector(`.button-theme-color.${name}`)).click(), theme);
    if (theme === 'dark') {
      await expect.poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.aw')).backgroundColor))
        .toBe('rgb(0, 0, 0)');
    }
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
