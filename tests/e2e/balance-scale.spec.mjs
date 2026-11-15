// End-to-end tests of H5P.BalanceScale in the h5p-cli dev server, with its example content.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** What H5P does to plain text fields when a package is uploaded: htmlspecialchars, quotes included. */
const escapeAsH5P = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

// No animation: the beam settles at once, and a whole game takes seconds.
test.use({ reducedMotion: 'reduce' });

/** Opens the example and starts listening to its xAPI statements. `session` keeps the state between loads. */
async function open(page, lang = 'es', session = 'null') {
  await page.goto(`/view/h5p-balance-scale/balance-scale-${lang}?session=${session}`);
  const handle = await page.locator('iframe.h5p-iframe').elementHandle();
  const frame = await handle.contentFrame();
  await frame.waitForSelector('.bs');
  await frame.evaluate(() => {
    window.statements = [];
    H5P.externalDispatcher.on('xAPI', (e) => window.statements.push(e.data.statement));
  });
  return frame;
}

const answered = (frame) => frame.evaluate(() => window.statements.filter((s) => s.verb.id.endsWith('/answered')));
const round = (frame) => frame.evaluate(() => H5P.instances[0].game.current);
const game = (frame) => frame.evaluate(() => {
  const g = H5P.instances[0].game;
  return { log: g.log.map((e) => e.got), number: g.number, level: g.level, tried: g.tried };
});

/** The fewest weights of the tray for a number. */
const compose = (n, weights) => {
  const out = [];
  for (const w of [...weights].sort((a, b) => b - a)) {
    while (n >= w) {
      out.push(w);
      n -= w;
    }
  }
  return out;
};
const sum = (list) => list.reduce((s, t) => s + t.v, 0);

/** @returns {Promise<number>} A weight of the tray that does not balance the round, to put on and take off. */
async function wrongWeight(frame) {
  const r = await round(frame);
  const other = r.target === 'left' ? 'right' : 'left';
  const need = sum(r[other]) - sum(r[r.target].filter((t) => t.fixed));
  return r.tray.find((v) => v !== need);
}

/** Puts a weight of the tray on its pan with a tap, or on a side with the keyboard arrows when it can go on both. */
async function put(frame, value, side) {
  const button = frame.locator(`.bs-tray .bs-weight[data-value="${value}"]`).first();
  if (side) {
    await button.focus();
    await button.press(side === 'left' ? 'ArrowLeft' : 'ArrowRight');
  } else {
    await button.click();
  }
}

/** Plays one round well, through the buttons of the game, and goes on with «Next». */
async function playRound(page, frame) {
  await page.waitForTimeout(650);
  const r = await round(frame);
  if (r.topic === 'equalities') {
    const other = r.target === 'left' ? 'right' : 'left';
    for (const v of compose(sum(r[other]) - sum(r[r.target].filter((t) => t.fixed)), r.tray)) {
      await put(frame, v);
    }
  } else if (r.topic === 'groups') {
    const weights = r.trayBag ? Array(r.missing).fill(r.trayBag) : compose(r.missing, r.tray);
    for (const v of weights) {
      await put(frame, v);
    }
  } else if (r.topic === 'share') {
    for (const [k, side] of [[0, 'left'], [1, 'right']]) {
      for (const v of r.solution[k]) {
        await put(frame, v, side);
      }
    }
  } else {
    for (let i = 0; i < r.x; i++) {
      await frame.locator('.bs-more').click();
    }
    await frame.locator('.bs-try').click();
  }
  await expect(frame.locator('.bs-next')).toBeVisible();
  await frame.locator('.bs-next').click();
}

for (const topic of ['equalities', 'groups', 'share', 'bag']) {
  test(`${topic}: a whole game played well scores in full and sends one result`, async ({ page }) => {
    const frame = await open(page);
    await frame.locator(`.bs-choice-${topic}`).click();
    for (let i = 0; i < 6; i++) {
      await playRound(page, frame);
    }
    await expect(frame.locator('.bs-cheer-title')).toBeVisible({ timeout: 15_000 });
    await expect(frame.locator('.bs-review-item')).toHaveCount(6);
    const [statement, ...more] = await answered(frame);
    expect(more).toEqual([]);
    expect(statement.result.score.raw).toBe(12);
    expect(statement.result.score.max).toBe(12);
    expect(statement.object.definition.interactionType).toBe('fill-in');
    expect(statement.result.response.split('[,]')).toHaveLength(6);
  });
}

test('texts kept with entities by the platform show as text', async ({ page }) => {
  const frame = await open(page, 'en');
  const texts = await frame.evaluate((l10n) => {
    const scale = new H5P.BalanceScale({ l10n }, 999);
    return [scale.l10n.retry, scale.l10n.cheerKeep];
  }, { retry: escapeAsH5P('Play again & "win"'), cheerKeep: escapeAsH5P("Don't give up!") });
  expect(texts).toEqual(['Play again & "win"', "Don't give up!"]);
});

test('the scale is painted, and what is put on it flies to the equality written under it', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.bs-choice-equalities').click();
  await expect(frame.locator('.bs-scene.bs-painted canvas')).toBeVisible();
  await expect(frame.locator('.bs-relation')).not.toHaveText('?');
  const r = await round(frame);
  await put(frame, await wrongWeight(frame));
  await expect(frame.locator('.bs-scene .bs-mine')).toHaveCount(1);
  await expect(frame.locator('.bs-equality .bs-term[data-id]')).toHaveCount(1);
  // Taking it back: one weight taken off, and the round can only score 1 now.
  await frame.locator('.bs-scene .bs-mine').click();
  await expect(frame.locator('.bs-scene .bs-mine')).toHaveCount(0);
  const other = r.target === 'left' ? 'right' : 'left';
  for (const v of compose(sum(r[other]) - sum(r[r.target].filter((t) => t.fixed)), r.tray)) {
    await put(frame, v);
  }
  await expect(frame.locator('.bs-message-ok')).toContainText('+1');
  await expect(frame.locator('.bs-relation')).toHaveText('=');
  expect((await game(frame)).log).toEqual([1]);
});

test('the usual mistake is explained at once: what the other side weighs', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.bs-choice-equalities').click();
  // A round where putting what the other side weighs does not pass through the balance on the way.
  for (let i = 0; i < 6; i++) {
    const r = await round(frame);
    const other = r.target === 'left' ? 'right' : 'left';
    const weights = compose(sum(r[other]), r.tray);
    const need = sum(r[other]) - sum(r[r.target].filter((t) => t.fixed));
    const steps = weights.map((_, k) => weights.slice(0, k + 1).reduce((a, b) => a + b, 0));
    if (!steps.includes(need)) {
      for (const v of weights) {
        await put(frame, v);
      }
      await expect(frame.locator('.bs-message-hint')).toContainText('Has puesto');
      return;
    }
    await playRound(page, frame);
  }
  throw new Error('no round for the usual mistake in six');
});

test('the mystery bag: a wrong number says which way to go, and the bags weigh it until it changes', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.bs-choice-bag').click();
  const r = await round(frame);
  for (let i = 0; i < r.x + 1; i++) {
    await frame.locator('.bs-more').click();
  }
  await frame.locator('.bs-try').click();
  await expect(frame.locator('.bs-message-bad')).toContainText('más pequeño');
  expect((await game(frame)).tried).toBe(r.x + 1);
  await frame.locator('.bs-less').click();
  expect((await game(frame)).tried).toBe(null);
  await frame.locator('.bs-try').click();
  await expect(frame.locator('.bs-message-ok')).toContainText(`${r.x}`);
  expect((await game(frame)).log).toEqual([1]);
});

test('sharing out: the tap asks for the side, and Escape closes the question', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.bs-choice-share').click();
  await frame.locator('.bs-tray .bs-weight').first().click();
  await expect(frame.locator('.bs-ask-side')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(frame.locator('.bs-ask-side')).toHaveCount(0);
  await frame.locator('.bs-tray .bs-weight').first().click();
  await frame.locator('.bs-ask-side button').first().click();
  await expect(frame.locator('.bs-scene .bs-mine')).toHaveCount(1);
});

test('the scale: three to choose from, without ages, remembered on this device', async ({ page }) => {
  let frame = await open(page);
  await expect(frame.locator('.bs-pick')).toHaveCount(3);
  await frame.locator('.bs-pick-notebook').click();
  await expect(frame.locator('.bs-pick-notebook')).toHaveAttribute('aria-pressed', 'true');
  frame = await open(page);
  await expect(frame.locator('.bs-pick-notebook')).toHaveAttribute('aria-pressed', 'true');
  await frame.locator('.bs-choice-groups').click();
  await expect(frame.locator('.bs-scene.bs-painted')).toHaveAttribute('data-view', 'notebook');
});

/** A fingerprint of what a canvas shows, and how much of it is painted. */
const picture = (frame, selector) => frame.locator(selector).evaluate((canvas) => {
  const c = /** @type {HTMLCanvasElement} */ (canvas), data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let painted = 0, hash = 0;
  for (let i = 3; i < data.length; i += 4) {
    painted += data[i] > 0 ? 1 : 0;
    hash = (hash * 31 + data[i - 3] + data[i - 2] * 7 + data[i - 1] * 13) % 1000003;
  }
  return { painted: painted / (data.length / 4), hash, width: c.width };
});

test('the first screen shows each topic on its scale and each scale to choose, for those who do not read yet', async ({ page }) => {
  const frame = await open(page, 'fr');
  for (const topic of ['equalities', 'groups', 'share', 'bag', 'free']) {
    const canvas = `.bs-choice-${topic} .bs-choice-picture canvas`;
    await expect.poll(async () => (await picture(frame, canvas)).painted, topic).toBeGreaterThan(0.9);
    await expect(frame.locator(`.bs-choice-${topic} .bs-choice-picture`)).toHaveAttribute('aria-hidden', 'true');
  }
  // The name of a card is its text, and the picture adds nothing to it.
  await expect(frame.locator('.bs-choice-share')).toHaveAccessibleName(/^Répartir/);
  for (const view of ['market', 'laboratory', 'notebook']) {
    await expect.poll(async () => (await picture(frame, `.bs-pick-${view} canvas`)).painted, view).toBeGreaterThan(0.9);
  }
  // The pictures of the topics change with the scale chosen.
  const before = await picture(frame, '.bs-choice-bag canvas');
  await frame.locator('.bs-pick-laboratory').click();
  await expect.poll(async () => (await picture(frame, '.bs-choice-bag canvas')).hash).not.toBe(before.hash);
  // On a phone the three scales keep one row, and the pictures are drawn again at their new size.
  await page.setViewportSize({ width: 360, height: 640 });
  await expect.poll(async () => (await picture(frame, '.bs-choice-bag canvas')).width).not.toBe(before.width);
  const tops = await frame.locator('.bs-pick').evaluateAll((list) => list.map((b) => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(tops).size, 'one row').toBe(1);
  // Back from a game, the pictures are there again.
  await frame.locator('.bs-choice-free').click();
  await frame.evaluate(() => H5P.instances[0].chooseAgain());
  await expect.poll(async () => (await picture(frame, '.bs-choice-free canvas')).painted).toBeGreaterThan(0.9);
});

test('a teacher who sets the topic: the first screen shows its scale, with the numbers of its example', async ({ page }) => {
  const frame = await open(page, 'fr');
  await frame.evaluate(() => {
    const game = H5P.instances[0];
    game.topic = 'bag';
    game.game = game.newGame('bag');
    game.fillIntro();
    game.render();
  });
  await expect.poll(async () => (await picture(frame, '.bs-topic-picture canvas')).painted).toBeGreaterThan(0.9);
  await expect(frame.locator('.bs-start')).toBeVisible();
});

test('on a phone, the tray takes two rows and the scale keeps its room from the first round', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const frame = await open(page, 'fr');
  await frame.locator('.bs-choice-equalities').click();
  await page.waitForTimeout(650);
  const scene = await frame.locator('.bs-scene').boundingBox();
  expect(scene.height, 'the scale, not at its smallest').toBeGreaterThan(240);
  // Weights of different sizes in one row: a row starts where a weight begins below the bottom of the one before.
  const rows = await frame.locator('.bs-tray .bs-weight').evaluateAll((list) => {
    let count = 0, bottom = -Infinity;
    for (const r of list.map((b) => b.getBoundingClientRect())) {
      if (r.top >= bottom - 1) {
        count += 1;
      }
      bottom = Math.max(bottom, r.bottom);
    }
    return count;
  });
  expect(rows, 'rows of weights').toBeLessThanOrEqual(2);
  const bottom = await frame.locator('.bs-actions button:visible').last().evaluate((b) => b.getBoundingClientRect().bottom);
  expect(bottom, 'the last button above the bottom bar of a phone').toBeLessThan(915 - 65);
});

test('in the Moodle app, which measures the game before H5P shrinks its frame, the frame fits the game that starts', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const frame = await open(page, 'fr');
  await frame.evaluate(() => {
    window.measured = [];
    // As the embed page of the Moodle app does: on each resize, 0 ms later, the height of the body of the game's frame,
    // which H5P shrinks 1 ms after the resize.
    H5P.instances[0].on('resize', () => setTimeout(() => window.measured.push(document.body.scrollHeight), 0));
  });
  // The first screen is taller than a round on a phone: the frame has to shrink.
  await frame.locator('.bs-choice-free').click();
  await page.waitForTimeout(800);
  const { last, now } = await frame.evaluate(() => ({ last: window.measured[window.measured.length - 1], now: document.body.scrollHeight }));
  expect(last, 'the last height the app was told').toBe(now);
});

test('under a page bar taller than Moodle\'s, the whole round still fits under it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  const frame = await open(page, 'fr');
  // Two fixed bars, 104 px in all, as on campus.oksigenia.com, and a drawer fixed at the side, which is no bar.
  await page.evaluate(() => {
    const fixed = (css) => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;background:#333;z-index:9;${css}`;
      document.body.append(d);
    };
    fixed('left:0;right:0;top:0;height:60px');
    fixed('left:0;right:0;top:60px;height:44px');
    fixed('right:0;width:400px;top:104px;bottom:0;opacity:0.2');
    document.body.style.paddingTop = '104px';
  });
  await frame.locator('.bs-choice-equalities').click();
  await page.waitForTimeout(650);
  expect(await frame.evaluate(() => H5P.instances[0].topBar())).toBe(104);
  const game = await page.locator('iframe.h5p-iframe').boundingBox();
  const inner = await frame.locator('.bs').boundingBox();
  expect(inner.height, 'the game fits in what the bars leave').toBeLessThanOrEqual(600 - 104);
  expect(game.height).toBeGreaterThan(0);
});

/** The languages of the examples, with the folder of the recorded instructions of each. */
const VOICED = { es: 'es', en: 'en', fr: 'fr', de: 'de', it: 'it', nl: 'nl', 'pt-br': 'pt-br', sv: 'sv' };

test('the instruction can be heard in every language with a recorded voice, and there is no button in the others', async ({ page }) => {
  for (const [lang, folder] of Object.entries(VOICED)) {
    const frame = await open(page, lang);
    await frame.locator('.bs-choice-equalities').click();
    await expect(frame.locator('.bs-listen')).toBeVisible();
    const src = await frame.evaluate(() => {
      const sources = [];
      window.Audio = /** @type {any} */ (function Audio(url) {
        sources.push(url);
        return { play: () => Promise.resolve(), pause: () => {}, addEventListener: () => {}, volume: 1 };
      });
      /** @type {HTMLElement} */ (document.querySelector('.bs-listen')).click();
      return sources[0];
    });
    expect(src, lang).toMatch(new RegExp(`assets/voice/${folder}/igualdades-(der|izq)\\.mp3$`));
    expect((await page.request.get(src)).ok(), lang).toBe(true);
  }
  // A language without a voice, as a teacher's own translation: the sentence, without a button.
  const frame = await open(page, 'es');
  const voices = await frame.evaluate(() => ['pl', 'pt-BR', 'fr-CA'].map((lang) => new H5P.BalanceScale({}, 0, { metadata: { defaultLanguage: lang } }).voice));
  expect(voices).toEqual([null, 'pt-br', 'fr']);
});

test('a reload in the middle takes the game up again, with what was already on the scale', async ({ page }) => {
  const session = `bs-resume-${test.info().project.name}`;
  let frame = await open(page, 'es', session);
  await frame.locator('.bs-choice-equalities').click();
  await playRound(page, frame);
  await page.waitForTimeout(650);
  await put(frame, await wrongWeight(frame));
  const r = await round(frame);
  await frame.evaluate(() => {
    H5P.setUserData(H5P.instances[0].contentId, 'state', H5P.instances[0].getCurrentState(), { deleteOnChange: true });
  });
  await page.waitForTimeout(500);
  frame = await open(page, 'es', session);
  expect(await round(frame)).toEqual(r);
  expect((await game(frame)).number).toBe(2);
  await expect(frame.locator('.bs-scene .bs-mine')).toHaveCount(1);
});

test('it never saves a null state, the one H5P takes for changed content', async ({ page }) => {
  const frame = await open(page);
  expect(await frame.evaluate(() => H5P.instances[0].getCurrentState() === undefined)).toBe(true);
  await frame.locator('.bs-choice-share').click();
  expect(await frame.evaluate(() => typeof H5P.instances[0].getCurrentState())).toBe('object');
  await frame.evaluate(() => H5P.instances[0].chooseAgain());
  await frame.locator('.bs-choice-free').click();
  expect(await frame.evaluate(() => H5P.instances[0].getCurrentState() === undefined)).toBe(true);
});

test('in a frame of another site, whose page cannot be read, it follows the dark mode of the device', async ({ page, baseURL }) => {
  // The Moodle app's online player is like this: the game cannot see the app's colours (seen on a phone, 7 Nov 2026).
  await page.emulateMedia({ colorScheme: 'dark' });
  // The game, framed by a page of another origin (about:blank).
  await page.setContent(`<iframe src="${baseURL}/view/h5p-balance-scale/balance-scale-es?session=null" style="width:900px;height:700px"></iframe>`);
  const host = await (await page.locator('iframe').elementHandle()).contentFrame();
  const frame = await (await host.locator('iframe.h5p-iframe').elementHandle()).contentFrame();
  await frame.waitForSelector('.bs');
  await expect.poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.bs')).backgroundColor)).toBe('rgb(29, 33, 37)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.bs')).backgroundColor)).not.toBe('rgb(29, 33, 37)');
});

test('a title that is only the name of the library, as Moodle writes it in an exported package, is not shown', async ({ page }) => {
  const frame = await open(page);
  const titles = await frame.evaluate(() => {
    const Game = H5P.BalanceScale;
    const mk = (title) => new Game({}, 99, { metadata: { title } }).title;
    return [mk('Balance Scale'), mk('Balanza de 3.º A')];
  });
  expect(titles).toEqual(['', 'Balanza de 3.º A']);
});

test('under a hanging pan, a tall pile stays below the hook, clear of the beam and the chains', async ({ page }) => {
  const frame = await open(page);
  const heights = await frame.evaluate(() => {
    const view = H5P.instances[0].view();
    const big = (v) => ({ id: `t${v}`, kind: 'w', v, fixed: true });
    const mine = (v) => ({ id: `m${v}`, kind: 'w', v, fixed: false });
    // The pile seen on the phone: a 36 with a 5 on top; and a bigger one.
    return [[big(36), mine(5)], [big(36), big(40), mine(5), mine(10), mine(20)]].map((list) => {
      const out = view.arrange(list, 0, 0);
      const top = Math.min(...out.map((q) => q.y0));
      return { reach: -top, room: view.G.cuelgue };
    });
  });
  for (const { reach, room } of heights) {
    expect(reach).toBeLessThanOrEqual(room - 30);
  }
});

test('it changes along with the dark mode of the page, frame included', async ({ page }) => {
  const frame = await open(page);
  const background = () => frame.evaluate(() => getComputedStyle(document.querySelector('.bs')).backgroundColor);
  const light = await background();
  await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'dark'));
  await expect.poll(background).toBe('rgb(29, 33, 37)');
  await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'light'));
  await expect.poll(background).toBe(light);
});

for (const width of [320, 360, 412]) {
  test(`the full screen button of H5P covers nothing of the bar at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const frame = await open(page);
    await frame.locator('.bs-choice-groups').click();
    const corner = await frame.locator('.h5p-enable-fullscreen').boundingBox();
    for (const selector of ['.bs-progress', '.bs-level', '.bs-sound', '.bs-volume']) {
      const box = await frame.locator(selector).boundingBox();
      const apart = box.x + box.width <= corner.x || box.y >= corner.y + corner.height;
      expect(apart, `${selector} clear of the button`).toBe(true);
    }
  });
}

test('with the keyboard only: the focus stays on the tray while the scale is drawn, and Enter puts a weight', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.bs-choice-equalities').focus();
  await page.keyboard.press('Enter');
  await expect(frame.locator('.bs-scene.bs-painted canvas')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await frame.evaluate(() => document.activeElement.classList.contains('bs-weight')), 'a weight of the tray in focus').toBe(true);
  const before = await frame.locator('.bs-stage [aria-live]').textContent();
  await page.keyboard.press('Enter');
  await expect(frame.locator('.bs-scene .bs-mine')).toHaveCount(1);
  await expect(frame.locator('.bs-stage [aria-live]')).not.toHaveText(before);
});

test('on a phone, the button to listen stays beside the sentence, so the weights come into view with the scale', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const frame = await open(page);
  await frame.locator('.bs-choice-equalities').click();
  const text = await frame.locator('.bs-instruction-text').boundingBox();
  const listen = await frame.locator('.bs-listen').boundingBox();
  expect(listen.y, 'the button on the row of the sentence').toBeLessThan(text.y + text.height);
  expect(listen.x, 'beside it').toBeGreaterThanOrEqual(text.x + text.width - 1);
  await expect(frame.locator('.bs-listen')).toHaveAccessibleName(/./);
});

/** @type {Array<[number, boolean]>} */
const SCREENS = [[320, false], [1100, false], [320, true], [1100, true]];
for (const [width, dark] of SCREENS) {
  test(`no sideways scrolling and no axe violations at ${width} px${dark ? ', dark' : ''}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 900 });
    const frame = await open(page);
    if (dark) {
      await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'dark'));
      await expect.poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.bs')).backgroundColor)).toBe('rgb(29, 33, 37)');
    }
    const axe = async (step) => {
      const scroll = await frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll, `sideways scroll on ${step}`).toBeLessThanOrEqual(0);
      const report = await new AxeBuilder({ page })
        .include({ fromFrames: ['iframe.h5p-iframe', '.bs'] })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(report.violations.map((v) => `${step}: ${v.id} (${v.nodes.length})`)).toEqual([]);
    };
    await axe('choices');
    await frame.locator('.bs-choice-equalities').click();
    await axe('equality');
    await put(frame, await wrongWeight(frame));
    await axe('a weight on the scale');
    for (let i = 0; i < 6; i++) {
      if (i === 0) {
        await frame.locator('.bs-scene .bs-mine').click();
      }
      await playRound(page, frame);
    }
    await axe('results');
    await frame.locator('.bs-other').click();
    await frame.locator('.bs-choice-bag').click();
    await axe('bag');
    await frame.evaluate(() => H5P.instances[0].chooseAgain());
    await frame.locator('.bs-choice-share').click();
    await axe('share');
  });
}
