// End-to-end tests of H5P.AlphabetWheel in the h5p-cli dev server, with the example wheels (example content).
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

/** What H5P does to plain text fields when a package is uploaded: htmlspecialchars, quotes included. */
const escapeAsH5P = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

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

/** After a move the buttons ignore taps for 400 ms (a double tap on a slow board): a person is never quicker. */
const PERSON_MS = 450;

/** Passes letters, at a person's pace, until the given one is asked. */
async function passTo(frame, letter) {
  while (await currentLetter(frame) !== letter) {
    await frame.locator('.aw-row button.aw-secondary').click();
    await frame.page().waitForTimeout(PERSON_MS);
  }
}

async function startWithKeyboard(page, frame, focused = '.aw-input') {
  await frame.locator('.aw-intro button').focus();
  await page.keyboard.press('Enter');
  await expect(frame.locator(focused).first()).toBeFocused();
}

/** A French wheel for the youngest, as a teacher made one: letter tiles instead of typing. */
const TILE_ITEMS = [
  { letter: 'A', kind: 'starts', clue: 'Insecte qui fabrique le miel.', answer: 'abeille' },
  { letter: 'C', kind: 'contains', clue: 'Les couleurs après la pluie.', answer: 'arc-en-ciel' },
  { letter: 'D', kind: 'starts', clue: 'Il saute hors de la mer.', answer: 'dauphin' },
];

/**
 * Opens the French example and puts in its place a wheel with letter tiles, in the same frame.
 * @param {import('@playwright/test').Page} page
 * @param {object[]} [items]
 */
async function openTiles(page, items = TILE_ITEMS) {
  const frame = await open(page, 'fr');
  // The French texts, as the editor fills them in and as the platform keeps them (escaped).
  const fr = JSON.parse(readFileSync(new URL('../../packages/alphabet-wheel/language/fr.json', import.meta.url), 'utf8'));
  const semantics = JSON.parse(readFileSync(new URL('../../packages/alphabet-wheel/semantics.json', import.meta.url), 'utf8'));
  const index = semantics.findIndex((f) => f.name === 'l10n');
  const l10n = Object.fromEntries(semantics[index].fields.map((f, i) => [f.name, escapeAsH5P(fr.semantics[index].fields[i].default)]));
  await frame.evaluate(([its, texts]) => {
    const old = H5P.instances[0];
    const box = /** @type {HTMLElement} */ (document.querySelector('.h5p-alphabet-wheel'));
    const wheel = new H5P.AlphabetWheel({ items: its, language: 'fr', letterTiles: true, l10n: texts },
      old.contentId, { standalone: true, metadata: { title: 'Alphabet des animaux' } });
    H5P.instances[0] = wheel;
    // The frame follows the height of the new wheel, as H5P makes it follow the one it started.
    wheel.on('resize', () => old.trigger('resize'));
    box.replaceChildren();
    wheel.attach(H5P.jQuery(box));
  }, [items, l10n]);
  await expect(frame.locator('.aw-help')).toContainText('Touche les lettres');
  return frame;
}

/** The letters of the free tiles, in the order of the rack. */
const freeTiles = (frame) => frame.locator('.aw-tile:not(.aw-tile-used)').allTextContents();
/** What the word shows, an empty place as «_». */
const word = (frame) => frame.locator('.aw-slot').evaluateAll((els) => els.map((e) => e.textContent || (e.classList.contains('aw-slot-space') ? ' ' : '_')).join(''));

/** Taps, in order, a free tile for each letter of the text. */
async function tapLetters(frame, text) {
  for (const letter of text) {
    await frame.locator('.aw-tile:not(.aw-tile-used)', { hasText: new RegExp(`^${letter}$`) }).first().click();
  }
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
      await page.waitForTimeout(PERSON_MS);
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
  await expect(frame.locator('.aw-cheer-text')).toBeFocused();
  // What a screen reader gets with the focus: the message and the score, once (checked with Orca, tests/platforms/orca).
  await expect(frame.locator('.aw-cheer-text')).toHaveAccessibleName(/¡Muy bien!\s+25 de 27 letras acertadas/);
  await expect(frame.locator('.aw-input')).not.toHaveAttribute('aria-describedby', /./);
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
  await expect(frame.locator('.aw-cheer-text')).toBeFocused();
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
  await page.waitForTimeout(PERSON_MS);
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

test('a picture can be the clue, alone or beside the text, in the middle of the wheel', async ({ page }) => {
  const frame = await open(page, 'en');
  const moon = example('en').items.find((it) => it.letter === 'M');
  await frame.locator('.aw-intro button').click();
  await passTo(frame, 'M');
  // The Moon: a picture and no text. The picture is in the middle, loaded, and the letter is a badge under it.
  await expect(frame.locator('.aw-wheel')).toHaveClass(/aw-with-picture/);
  const hubImage = frame.locator('.aw-hub-image');
  await expect(hubImage).toHaveCount(1);
  await expect.poll(() => hubImage.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBe(480);
  await expect(hubImage).toHaveAttribute('alt', '');
  await expect(frame.locator('.aw-hub-letter')).toHaveText('M');
  await expect(frame.locator('.aw-clue')).toBeHidden();
  // A screen reader finds what the picture shows in the panel, and hears it with the letter.
  await expect(frame.locator('.aw-clue-picture')).toHaveText(`Picture: ${moon.imageAlt}`);
  await expect(frame.locator('[aria-live]')).toHaveText(new RegExp(`Starts with M\\. Picture: ${moon.imageAlt}\\.$`));
  // The picture fits in the circle of the middle.
  const fit = await frame.evaluate(() => {
    const hub = document.querySelector('.aw-hub').getBoundingClientRect();
    const img = document.querySelector('.aw-hub-image').getBoundingClientRect();
    const r = hub.width / 2, cx = hub.left + r, cy = hub.top + r;
    return Math.max(...[[img.left, img.top], [img.right, img.top], [img.left, img.bottom], [img.right, img.bottom]]
      .map(([x, y]) => Math.hypot(x - cx, y - cy))) <= r + 1;
  });
  expect(fit).toBe(true);
  const axe = await new AxeBuilder({ page }).include({ fromFrames: ['iframe.h5p-iframe', '.aw'] })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);

  await frame.locator('.aw-input').fill('moon');
  await frame.locator('.aw-input').press('Enter');
  // The next letter has no picture: the big letter again.
  await expect(frame.locator('.aw-wheel')).not.toHaveClass(/aw-with-picture/);
  await expect(frame.locator('.aw-hub-image')).toHaveCount(0);
  await expect(frame.locator('.aw-hub-letter')).toHaveText('N');
  await expect(frame.locator('.aw-clue-picture')).toHaveText('');

  // The Sun: the picture and the text.
  await passTo(frame, 'S');
  const sun = example('en').items.find((it) => it.letter === 'S');
  await expect(frame.locator('.aw-wheel')).toHaveClass(/aw-with-picture/);
  await expect(frame.locator('.aw-clue')).toHaveText(sun.clue);
  await expect(frame.locator('.aw-clue-picture')).toHaveText(`Picture: ${sun.imageAlt}`);

  // At the end, each clue with its picture, described.
  await frame.locator('.aw-finish').click();
  await frame.locator('.aw-finish').click();
  await expect(frame.locator('.aw-review-image')).toHaveCount(2);
  await expect(frame.locator('.aw-review-item.aw-ok .aw-review-image')).toHaveAttribute('alt', moon.imageAlt);
});

test('pictures: paused, they hide with the clue; a letter with neither text nor picture is left out', async ({ page }) => {
  const frame = await open(page, 'en');
  const result = await frame.evaluate(() => {
    const contentId = H5P.instances[0].contentId;
    const box = document.createElement('div');
    document.body.append(box);
    const sun = { path: 'images/sun.png', mime: 'image/png', width: 480, height: 480 };
    const wheel = new H5P.AlphabetWheel({
      items: [
        { letter: 'S', kind: 'starts', image: sun, answer: 'Sun' },
        { letter: 'T', kind: 'starts', answer: 'Tree' },
        { letter: 'U', kind: 'starts', clue: 'Under the rain', answer: 'Umbrella' },
      ],
      timeLimit: 60,
    }, contentId);
    wheel.attach(H5P.jQuery(box));
    wheel.start();
    const letters = box.querySelectorAll('.aw-letter').length;
    const withPicture = box.querySelectorAll('.aw-with-picture .aw-hub-image').length;
    wheel.setPaused(true, false);
    const paused = box.querySelectorAll('.aw-with-picture, .aw-hub-image').length;
    wheel.setPaused(false, false);
    // A right answer makes its letter jump once.
    wheel.input.value = 'sun';
    wheel.check();
    const jump = box.querySelector('.aw-letter').classList.contains('aw-flash-ok');
    wheel.timer.pause();
    return { letters, withPicture, paused, jump, streak: wheel.streak };
  });
  expect(result).toEqual({ letters: 2, withPicture: 1, paused: 0, jump: true, streak: 1 });
});

test('a package exported by Moodle, titled with the name of the library, shows no title', async ({ page }) => {
  const frame = await open(page, 'en');
  const titles = await frame.evaluate(() => ['Alphabet Wheel', 'Christmas alphabet'].map((title) => {
    const box = document.createElement('div');
    document.body.append(box);
    const wheel = new H5P.AlphabetWheel({ items: [{ letter: 'A', kind: 'starts', clue: 'A', answer: 'Apple' }] }, 999,
      { metadata: { title } });
    wheel.attach(H5P.jQuery(box));
    return box.querySelectorAll('.aw-title').length;
  }));
  expect(titles).toEqual([0, 1]);
});

test('a double tap on a button does not count twice', async ({ page }) => {
  const frame = await open(page, 'en');
  await frame.locator('.aw-intro button').click();
  // Two taps on «Pass» at once pass one letter.
  await frame.evaluate(() => {
    const pass = /** @type {HTMLElement} */ (document.querySelector('.aw-row button.aw-secondary'));
    pass.click();
    pass.click();
  });
  await expect(frame.locator('.aw-letter.aw-passed')).toHaveCount(1);
  await expect(frame.locator('.aw-letter[aria-current] .aw-letter-text')).toHaveText('B');
  // A right answer and, at once, an empty one: the result of the right answer stays.
  await frame.locator('.aw-input').fill('bicycle');
  await frame.evaluate(() => {
    const form = /** @type {HTMLFormElement} */ (document.querySelector('.aw-form'));
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(frame.locator('.aw-feedback')).toHaveClass(/aw-feedback-ok/);
  // At a person's pace, both buttons work.
  await frame.page().waitForTimeout(PERSON_MS);
  await frame.locator('.aw-row button.aw-secondary').click();
  await expect(frame.locator('.aw-letter.aw-passed')).toHaveCount(2);
});

test('texts kept with entities by the platform show as text, and the French end screen reads well', async ({ page }) => {
  const frame = await open(page, 'fr');
  const fr = JSON.parse(readFileSync(new URL('../../packages/alphabet-wheel/language/fr.json', import.meta.url), 'utf8'));
  const semantics = JSON.parse(readFileSync(new URL('../../packages/alphabet-wheel/semantics.json', import.meta.url), 'utf8'));
  const index = semantics.findIndex((f) => f.name === 'l10n');
  const l10n = Object.fromEntries(semantics[index].fields.map((f, i) => [f.name, escapeAsH5P(fr.semantics[index].fields[i].default)]));
  const shown = await frame.evaluate((texts) => {
    const box = document.createElement('div');
    document.body.append(box);
    const wheel = new H5P.AlphabetWheel({ items: [
      { letter: 'A', kind: 'starts', clue: 'Fruit', answer: 'Abricot' },
      { letter: 'B', kind: 'starts', clue: 'Couleur', answer: 'Bleu' },
      { letter: 'C', kind: 'starts', clue: 'Animal', answer: 'Chat' },
    ], l10n: texts }, 999);
    wheel.attach(H5P.jQuery(box));
    wheel.start();
    wheel.input.value = 'abricot';
    wheel.check();
    wheel.game.finish('stopped');
    wheel.afterFinish('');
    return [box.querySelector('.aw-cheer-title').textContent, box.querySelector('.aw-result-title').textContent];
  }, l10n);
  const french = (name) => fr.semantics[index].fields[semantics[index].fields.findIndex((f) => f.name === name)].default;
  expect(l10n.cheerKeep).toContain('&#039;');
  // French puts a thin space before «!»: the texts are compared with the language file, unescaped.
  expect(shown).toEqual([french('cheerKeep'), french('resultTitle').replace('@score', '1').replace('@total', '3')]);
  expect(shown[0]).toMatch(/^Continue à t'entraîner\s!$/);
  expect(shown[1]).toBe('Lettres trouvées : 1 sur 3');
});

test('the Ñ is not the N', async ({ page }) => {
  const frame = await open(page, 'es');
  await frame.locator('.aw-intro button').click();
  await passTo(frame, 'Ñ');
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
  await page.waitForTimeout(PERSON_MS);
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

test('a game taken up again has the focus where it goes on, unless it is inside another content', async ({ page }) => {
  const frame = await open(page, 'es');
  const focused = await frame.evaluate(() => {
    const params = { items: [
      { letter: 'A', kind: 'starts', clue: 'Insecto que fabrica miel', answer: 'Abeja' },
      { letter: 'B', kind: 'starts', clue: 'Vehículo de dos ruedas', answer: 'Bici' },
    ] };
    const place = () => {
      const box = document.createElement('div'); document.body.append(box); return H5P.jQuery(box); 
    };
    const first = new H5P.AlphabetWheel(params, 999);
    first.attach(place());
    first.start();
    first.input.value = 'Abeja';
    first.check();
    const previousState = first.getCurrentState();
    /** @type {HTMLElement} */ (document.activeElement).blur();
    const inside = new H5P.AlphabetWheel(params, 999, { previousState });
    inside.attach(place());
    const stayed = document.activeElement === inside.input;
    const back = new H5P.AlphabetWheel(params, 999, { previousState, standalone: true });
    back.attach(place());
    return { stayed, back: document.activeElement === back.input };
  });
  expect(focused).toEqual({ stayed: false, back: true });
});

test('when the time runs out, the game sends one result, not two', async ({ page }) => {
  const frame = await open(page, 'en');
  const sent = await frame.evaluate(async () => {
    const box = document.createElement('div');
    document.body.append(box);
    const wheel = new H5P.AlphabetWheel({ items: [
      { letter: 'A', kind: 'starts', clue: 'Insect that makes honey', answer: 'Bee' },
      { letter: 'B', kind: 'starts', clue: 'Two wheels and pedals', answer: 'Bicycle' },
    ], timeLimit: 2 }, H5P.instances[0].contentId, { standalone: true });
    // Errors inside the clock's callbacks would cut the second ending short and hide it: none are expected.
    const errors = [];
    window.addEventListener('error', (e) => errors.push(e.message));
    let answered = 0;
    wheel.on('xAPI', (e) => {
      answered += e.data.statement.verb.id.endsWith('/answered') ? 1 : 0;
    });
    wheel.attach(H5P.jQuery(box));
    wheel.start();
    await new Promise((resolve) => setTimeout(resolve, 3500));
    return { answered, phase: wheel.game.phase, reason: wheel.game.endReason, errors };
  });
  expect(sent).toEqual({ answered: 1, phase: 'finished', reason: 'time', errors: [] });
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

for (const [width, height] of [[1100, 540], [360, 640]]) {
  test(`the next step comes into view at ${width}×${height}, below the header of a page`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const frame = await open(page, 'es');
    // As the header of a Moodle page does: the game starts low on the page.
    await page.evaluate(() => document.body.prepend(Object.assign(document.createElement('div'), { style: 'height: 500px' })));
    const shows = (selector) => expect.poll(async () => {
      const box = await frame.locator(selector).boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= height;
    }, { message: `${selector} in view` }).toBe(true);
    await frame.locator('.aw-intro button').click();
    await shows('.aw-input');
    await frame.locator('.aw-finish').click();
    await frame.locator('.aw-finish').click();
    await shows('.aw-cheer-title');
    await shows('.aw-retry');
  });
}

test('letter tiles: the answer is made by tapping, a letter goes back, the key erases, and a word with gaps is not checked', async ({ page }) => {
  const frame = await openTiles(page);
  await frame.locator('.aw-intro button').click();
  // No field: nothing to type on, and no keyboard on a tablet. The focus is on the first tile.
  await expect(frame.locator('.aw-input')).toHaveCount(0);
  await expect(frame.locator('.aw-tile').first()).toBeFocused();
  const tiles = await freeTiles(frame);
  expect(tiles.slice().sort().join('')).toBe([...'abeille'].sort().join(''));
  expect(tiles.join('')).not.toBe('abeille');
  await expect.poll(() => word(frame)).toBe('_______');
  await expect(frame.locator('.aw-slot').first()).toHaveClass(/aw-slot-next/);
  await expect(frame.locator('.aw-erase')).toHaveAttribute('aria-disabled', 'true');

  // A tile goes to the first place, and leaves its outline in the rack.
  await tapLetters(frame, 'ab');
  await expect.poll(() => word(frame)).toBe('ab_____');
  await expect(frame.locator('.aw-tile.aw-tile-used')).toHaveCount(2);
  await expect(frame.locator('.aw-slot').nth(2)).toHaveClass(/aw-slot-next/);
  await expect(frame.locator('[aria-live]')).toHaveText("Ta réponse pour l'instant\u00a0: a b");
  // «Check» with places still empty: a note, and the letter is not lost.
  await frame.locator('.aw-check').click();
  await expect(frame.locator('.aw-feedback')).toHaveText('Mets chaque lettre à sa place, ou passe.');
  await expect(frame.locator('.aw-letter.aw-bad')).toHaveCount(0);
  await expect(frame.locator('.aw-letter[aria-current] .aw-letter-text')).toHaveText('A');
  // A letter of the word, tapped, goes back to its tile; the next tile fills that place, and the note goes.
  await frame.locator('.aw-slot').first().click();
  await expect.poll(() => word(frame)).toBe('_b_____');
  await expect(frame.locator('.aw-feedback')).toHaveText('');
  await tapLetters(frame, 'a');
  await expect.poll(() => word(frame)).toBe('ab_____');
  // The key that erases takes the last letter back.
  await frame.locator('.aw-erase').click();
  await expect.poll(() => word(frame)).toBe('a______');
  await tapLetters(frame, 'beille');
  await expect.poll(() => word(frame)).toBe('abeille');
  // The word complete, the next step is «Check».
  await expect(frame.locator('.aw-check')).toBeFocused();
  await expect(frame.locator('.aw-tile:not(.aw-tile-used)')).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).include({ fromFrames: ['iframe.h5p-iframe', '.aw'] })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
  await frame.locator('.aw-check').click();
  await expect(frame.locator('.aw-letter.aw-ok')).toHaveCount(1);

  // Hyphens are in their place already: only the letters are tiles.
  await expect.poll(() => word(frame)).toBe('___-__-____');
  await expect(frame.locator('.aw-tile')).toHaveCount(9);
  await expect(frame.locator('.aw-slot.aw-slot-fixed')).toHaveCount(2);
  await page.waitForTimeout(PERSON_MS);
  await frame.locator('.aw-pass').click();
  // A wrong order is a wrong answer, with the right one shown.
  await page.waitForTimeout(PERSON_MS);
  await tapLetters(frame, 'dauphni');
  await frame.locator('.aw-check').click();
  await expect(frame.locator('.aw-feedback')).toContainText('dauphin');
  await expect(frame.locator('.aw-letter.aw-bad')).toHaveCount(1);
  // The passed letter comes back with all its tiles free, jumbled again.
  await expect(frame.locator('.aw-letter[aria-current] .aw-letter-text')).toHaveText('C');
  await expect(frame.locator('.aw-tile.aw-tile-used')).toHaveCount(0);
  await page.waitForTimeout(PERSON_MS);
  await tapLetters(frame, 'arcenciel');
  await expect.poll(() => word(frame)).toBe('arc-en-ciel');
  await frame.locator('.aw-check').click();
  await expect(frame.locator('.aw-results')).toBeVisible();
  const result = await frame.evaluate(() => window.statements.filter((s) => s.verb.id.endsWith('/answered'))
    .map((s) => [s.result.score.raw, s.result.score.max, s.result.response]));
  expect(result).toEqual([[2, 3, 'abeille[,]arc-en-ciel[,]dauphni']]);
});

test('letter tiles with a keyboard: a letter key takes its tile, without minding capitals or accents, and the backspace erases', async ({ page }) => {
  const frame = await openTiles(page, [{ letter: 'H', kind: 'starts', clue: 'Petit animal couvert de piquants.', answer: 'Hérisson' }]);
  await startWithKeyboard(page, frame, '.aw-tile');
  await page.keyboard.type('herix');
  // The x has no tile: nothing happens.
  await expect.poll(() => word(frame)).toBe('Héri____');
  await page.keyboard.press('Backspace');
  await expect.poll(() => word(frame)).toBe('Hér_____');
  await page.keyboard.type('isson');
  await expect(frame.locator('.aw-check')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(frame.locator('.aw-results')).toBeVisible();
  await expect(frame.locator('.aw-review-item.aw-ok')).toHaveCount(1);
});

test('letter tiles: a reload in the middle takes the game up again, paused, with the tiles of the letter', async ({ page }) => {
  const session = `tiles-${Date.now()}`;
  const url = `/view/h5p-alphabet-wheel/alphabet-wheel-tiles-en?session=${session}`;
  const answers = answersOf('en');
  await page.goto(url);
  let frame = await (await page.locator('iframe.h5p-iframe').elementHandle()).contentFrame();
  await frame.locator('.aw-intro button').click();
  await tapLetters(frame, answers.A);
  await frame.locator('.aw-check').click();
  await page.waitForTimeout(PERSON_MS);
  await tapLetters(frame, answers.B.slice(0, 2));
  // H5P saves the state three seconds after each move.
  await page.waitForTimeout(3500);
  await page.reload();
  frame = await (await page.locator('iframe.h5p-iframe').elementHandle()).contentFrame();
  await expect(frame.locator('.aw-paused')).toBeVisible();
  await expect(frame.locator('.aw-letter.aw-ok')).toHaveCount(1);
  await frame.locator('.aw-pause').click();
  // The letter goes on with all its tiles free: what was put and not checked is not kept.
  await expect(frame.locator('.aw-letter[aria-current] .aw-letter-text')).toHaveText('B');
  await expect(frame.locator('.aw-tile')).toHaveCount(answers.B.length);
  await expect(frame.locator('.aw-tile.aw-tile-used')).toHaveCount(0);
  await expect(frame.locator('.aw-tile').first()).toBeFocused();
});

test('letter tiles: a double tap after a move does not put a letter of the next word', async ({ page }) => {
  const frame = await openTiles(page);
  await frame.locator('.aw-intro button').click();
  await tapLetters(frame, 'abeille');
  // «Check» and, at once, a tap on a tile of the next word, as a slow board gives a double tap.
  await frame.locator('.aw-check').click();
  await frame.evaluate(() => {
    const tile = /** @type {HTMLElement} */ (document.querySelector('.aw-tile'));
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  });
  await expect(frame.locator('.aw-tile.aw-tile-used')).toHaveCount(0);
  await page.waitForTimeout(PERSON_MS);
  await frame.locator('.aw-tile').first().click();
  await expect(frame.locator('.aw-tile.aw-tile-used')).toHaveCount(1);
});

test.describe('on a touch screen', () => {
  // The Moodle app does not resize its page for the keyboard, which covers the lower part of the screen.
  const height = 844;
  test.use({ viewport: { width: 390, height }, hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');

  test('the clue and the field go to the upper part, before the keyboard covers them', async ({ page }) => {
    const frame = await open(page, 'es');
    // A page with more above and below the game, as a Moodle page has, so there is room to scroll.
    await page.evaluate(() => {
      const spacer = () => Object.assign(document.createElement('div'), { style: 'height: 500px' });
      document.body.prepend(spacer());
      document.body.append(spacer());
    });
    const clear = () => expect.poll(async () => {
      const clue = await frame.locator('.aw-clue').boundingBox();
      const field = await frame.locator('.aw-input').boundingBox();
      return !!clue && !!field && clue.y >= 0 && field.y + field.height <= height * 0.6;
    }, { message: 'clue and field above the keyboard' }).toBe(true);
    await frame.locator('.aw-intro button').tap();
    await clear();
    await frame.locator('.aw-pause').tap();
    await frame.locator('.aw-pause').tap();
    await clear();
  });

  test('a picture goes beside the clue, above the field, and they come back to the upper part after each move', async ({ page }) => {
    const frame = await open(page, 'en');
    await page.evaluate(() => {
      const spacer = () => Object.assign(document.createElement('div'), { style: 'height: 500px' });
      document.body.prepend(spacer());
      document.body.append(spacer());
    });
    await frame.locator('.aw-intro button').tap();
    await passTo(frame, 'M');
    // The wheel keeps the big letter; the picture is in the panel, loaded, beside where the clue goes.
    await expect(frame.locator('.aw-hub-picture')).toBeHidden();
    await expect(frame.locator('.aw-hub-letter')).toHaveText('M');
    const picture = frame.locator('.aw-clue-image');
    await expect(picture).toBeVisible();
    await expect.poll(() => picture.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBe(480);
    expect((await picture.boundingBox()).height).toBeGreaterThan(70);
    const clear = () => expect.poll(async () => {
      const box = await picture.boundingBox();
      const field = await frame.locator('.aw-input').boundingBox();
      return !!box && !!field && box.y >= 0 && field.y + field.height <= height * 0.6;
    }, { message: 'picture and field above the keyboard' }).toBe(true);
    await clear();

    // The page scrolled away, as when the frames around grow after a move: an answer brings the field and the picture
    // of the next clue back. The Sun comes after passing to it.
    await passTo(frame, 'R');
    await page.waitForTimeout(PERSON_MS);
    await page.evaluate(() => window.scrollTo(0, 0));
    await frame.locator('.aw-input').fill('rainbow');
    await frame.locator('.aw-input').press('Enter');
    await expect(frame.locator('.aw-letter[aria-current] .aw-letter-text')).toHaveText('S');
    await clear();
  });

  test('letter tiles open no keyboard: the clue, the word, the tiles and «Check» stay in view as they are tapped', async ({ page }) => {
    const frame = await openTiles(page);
    await page.evaluate(() => {
      const spacer = () => Object.assign(document.createElement('div'), { style: 'height: 500px' });
      document.body.prepend(spacer());
      document.body.append(spacer());
    });
    const inView = () => expect.poll(async () => {
      const clue = await frame.locator('.aw-clue').boundingBox();
      const check = await frame.locator('.aw-check').boundingBox();
      return !!clue && !!check && clue.y >= 0 && check.y + check.height <= height;
    }, { message: 'clue and «Check» in view' }).toBe(true);
    await frame.locator('.aw-intro button').tap();
    await inView();
    for (const letter of 'abeille') {
      await frame.locator('.aw-tile:not(.aw-tile-used)', { hasText: new RegExp(`^${letter}$`) }).first().tap();
    }
    await expect.poll(() => word(frame)).toBe('abeille');
    await frame.locator('.aw-check').tap();
    await inView();
    // Big enough for a finger: every tile at least 44 px. The places of a long word narrow, but not below 24 px.
    const smallest = (selector) => frame.locator(selector).evaluateAll((els) => Math.min(...els.map((e) => {
      const box = e.getBoundingClientRect();
      return Math.min(box.width, box.height);
    })));
    expect(await smallest('.aw-tile')).toBeGreaterThanOrEqual(44);
    expect(await smallest('.aw-slot:not(.aw-slot-fixed)')).toBeGreaterThanOrEqual(24);
    // The word stays on one line, with the key that erases right after it.
    const middles = await frame.locator('.aw-word > *').evaluateAll((els) => els.map((e) => {
      const box = e.getBoundingClientRect();
      return box.top + box.height / 2;
    }));
    expect(Math.max(...middles) - Math.min(...middles)).toBeLessThan(10);
  });
});

test('the game changes along with the dark mode of the page, and stays light without it', async ({ page }) => {
  const frame = await open(page, 'es');
  const background = () => frame.evaluate(() => getComputedStyle(document.querySelector('.aw')).backgroundColor);
  const light = await background();
  await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'dark'));
  await expect.poll(background).toBe('rgb(29, 33, 37)');
  await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'light'));
  await expect.poll(background).toBe(light);
});

/** @type {Array<[number, string]>} */
const SCREENS = [[320, 'core'], [1100, 'core'], [320, 'dark'], [1100, 'dark'], [320, 'page'], [1100, 'page']];
for (const [width, theme] of SCREENS) {
  test(`no sideways scrolling and no axe violations at ${width} px, ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const frame = await open(page, 'es');
    if (theme === 'page') {
      // The dark mode of the page around the frames, the way Moodle 5.3 marks it.
      await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'dark'));
      await expect.poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.aw')).backgroundColor))
        .toBe('rgb(29, 33, 37)');
    } else {
      // The theme buttons of the dev server set the H5P core 1.28 theme variables inside the game.
      await page.evaluate((name) => /** @type {HTMLElement} */ (document.querySelector(`.button-theme-color.${name}`)).click(), theme);
    }
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
    await page.waitForTimeout(PERSON_MS);
    await frame.locator('.aw-row button.aw-secondary').click();
    await axe('game');
    await frame.locator('.aw-finish').click();
    await frame.locator('.aw-finish').click();
    await frame.locator('.aw-actions button.aw-secondary').click();
    await axe('results');
  });
}
