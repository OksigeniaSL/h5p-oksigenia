// End-to-end tests of H5P.BalanceScale in the h5p-cli dev server, with its example content.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

test('the instruction can be heard in Spanish and English, and there is no button in other languages', async ({ page }) => {
  let frame = await open(page);
  await frame.locator('.bs-choice-equalities').click();
  await expect(frame.locator('.bs-listen')).toBeVisible();
  const src = await frame.evaluate(() => {
    const sources = [];
    window.Audio = /** @type {any} */ (function Audio(url) {
      sources.push(url);
      return { play: () => Promise.resolve(), pause: () => {}, addEventListener: () => {}, volume: 1 };
    });
    document.querySelector('.bs-listen').click();
    return sources[0];
  });
  expect(src).toMatch(/assets\/voice\/es\/igualdades-(der|izq)\.mp3$/);
  expect((await page.request.get(src)).ok()).toBe(true);
  frame = await open(page, 'de');
  await frame.locator('.bs-choice-equalities').click();
  await expect(frame.locator('.bs-listen')).toBeHidden();
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
