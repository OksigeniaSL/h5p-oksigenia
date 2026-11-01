// End-to-end tests of H5P.NumberLine in the h5p-cli dev server, with its example content.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// No animation: the jumps land at once, and a whole game takes seconds.
test.use({ reducedMotion: 'reduce' });

/** Opens the example and starts listening to its xAPI statements. `session` keeps the state between loads. */
async function open(page, lang = 'es', session = 'null') {
  await page.goto(`/view/h5p-number-line/number-line-${lang}?session=${session}`);
  const handle = await page.locator('iframe.h5p-iframe').elementHandle();
  const frame = await handle.contentFrame();
  await frame.waitForSelector('.nl');
  await frame.evaluate(() => {
    window.statements = [];
    H5P.externalDispatcher.on('xAPI', (e) => window.statements.push(e.data.statement));
  });
  return frame;
}

const answered = (frame) => frame.evaluate(() => window.statements.filter((s) => s.verb.id.endsWith('/answered')));
const round = (frame) => frame.evaluate(() => H5P.instances[0].game.current);

/** The largest jump that does not go past what is left, in the rounds played by jumping. */
async function jumpOnce(frame, left) {
  const texts = await frame.locator('.nl-controls:not(.nl-extra) .nl-jump:not(:disabled)').allTextContents();
  const jumps = texts.map((t) => (t.startsWith('−') ? -Number(t.slice(1)) : Number(t)));
  const fit = jumps.filter((j) => Math.sign(j) === Math.sign(left) && Math.abs(j) <= Math.abs(left))
    .sort((a, b) => Math.abs(b) - Math.abs(a))[0];
  const jump = fit ?? jumps.filter((j) => Math.sign(j) === Math.sign(left)).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  await frame.locator('.nl-jump', { hasText: new RegExp(`^${jump > 0 ? '\\+' : '−'}${Math.abs(jump)}$`) }).click();
}

/** Plays one round well: the fewest jumps, the right count, the right place. */
async function playRound(page, frame) {
  const r = await round(frame);
  if (r.mode === 'goal') {
    for (const jump of r.best) {
      await frame.locator('.nl-jump', { hasText: new RegExp(`^${jump > 0 ? '\\+' : '−'}${Math.abs(jump)}$`) }).click();
    }
  } else if (r.mode === 'land') {
    for (let i = 0; i < 40 && !(await frame.locator('.nl-option').count()); i++) {
      const position = await frame.evaluate(() => H5P.instances[0].game.position);
      await jumpOnce(frame, r.target - position);
    }
    await frame.locator('.nl-option', { hasText: new RegExp(`^${r.target}$`) }).click();
  } else if (r.mode === 'exact') {
    await frame.locator('.nl-count', { hasText: new RegExp(`^${r.times}$`) }).click();
  } else {
    // The round comes into view a moment after it opens, and the place to click moves with it.
    await page.waitForTimeout(700);
    const box = await frame.locator('.nl-line').boundingBox();
    const padding = 26 * (box.width / await frame.evaluate(() => H5P.instances[0].line.width));
    await page.mouse.click(box.x + padding + (r.value / r.max) * (box.width - 2 * padding), box.y + box.height / 2);
    await frame.locator('.nl-here').click();
  }
  await frame.locator('.nl-next').click();
}

const TOPICS = ['add20', 'add100', 'tables', 'place1000', 'fractions'];
for (const topic of TOPICS) {
  test(`${topic}: a whole game played well scores in full and sends one result`, async ({ page }) => {
    const frame = await open(page);
    await frame.locator(`.nl-choice-${topic}`).click();
    for (let i = 0; i < 6; i++) {
      await playRound(page, frame);
    }
    await expect(frame.locator('.nl-cheer-title')).toBeVisible();
    await expect(frame.locator('.nl-review-item')).toHaveCount(6);
    const [statement, ...more] = await answered(frame);
    expect(more).toEqual([]);
    const max = topic === 'tables' ? 6 : 12;
    expect(statement.result.score.raw).toBe(max);
    expect(statement.result.score.max).toBe(max);
    expect(statement.object.definition.interactionType).toBe('fill-in');
    expect(statement.result.response.split('[,]')).toHaveLength(6);
  });
}

test('the first screen offers every topic, and there is a way back from the end', async ({ page }) => {
  const frame = await open(page);
  await expect(frame.locator('.nl-choice')).toHaveCount(6);
  await frame.locator('.nl-choice-tables').click();
  for (let i = 0; i < 6; i++) {
    await playRound(page, frame);
  }
  await frame.locator('.nl-other').click();
  await expect(frame.locator('.nl-choice')).toHaveCount(6);
  await frame.locator('.nl-choice-fractions').click();
  await expect(frame.locator('.nl-challenge')).toContainText('/');
});

test('the piece: three to choose from, without ages, remembered on this device', async ({ page }) => {
  let frame = await open(page);
  await expect(frame.locator('.nl-pick')).toHaveCount(3);
  await expect(frame.locator('.nl-pick-muelle')).toHaveAttribute('aria-pressed', 'true');
  await frame.locator('.nl-pick-dado').click();
  await expect(frame.locator('.nl-pick-dado')).toHaveAttribute('aria-pressed', 'true');
  await expect(frame.locator('.nl-pick-muelle')).toHaveAttribute('aria-pressed', 'false');
  await frame.locator('.nl-choice-free').click();
  expect(await frame.locator('.nl-piece-pip').count()).toBeGreaterThan(0);
  expect(await frame.locator('.nl-line .nl-piece-mouth').count()).toBe(0);
  frame = await open(page);
  await expect(frame.locator('.nl-pick-dado')).toHaveAttribute('aria-pressed', 'true');
  await frame.locator('.nl-pick-cohete').click();
  await frame.locator('.nl-choice-free').click();
  expect(await frame.locator('.nl-line .nl-piece-window').count()).toBe(1);
});

test('«how many jumps»: a wrong try shows where it landed, and two wrong tries show the way', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.nl-choice-tables').click();
  const r = await round(frame);
  const wrong = r.times === 2 ? 3 : 2;
  await frame.locator('.nl-count', { hasText: new RegExp(`^${wrong}$`) }).click();
  await expect(frame.locator('.nl-message')).toContainText(String(wrong * r.size));
  await expect(frame.locator('.nl-next')).toBeHidden();
  const other = r.times === 12 ? 11 : r.times + 1;
  await frame.locator('.nl-count', { hasText: new RegExp(`^${other}$`) }).click();
  await expect(frame.locator('.nl-next')).toBeVisible();
  await expect(frame.locator('.nl-message')).toContainText(String(r.target));
  expect(await frame.evaluate(() => H5P.instances[0].game.score)).toBe(0);
});

test('a sum: going too far asks to start again, and it can be done together, without points', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.nl-choice-add100').click();
  // A draw with room on the line to go one past the target.
  let r = await round(frame);
  while (r.target + Math.sign(r.amount) < 0 || r.target + Math.sign(r.amount) > r.max) {
    await frame.evaluate(() => H5P.instances[0].chooseAgain());
    await frame.locator('.nl-choice-add100').click();
    r = await round(frame);
  }
  expect(r.mode).toBe('land');
  await expect(frame.locator('.nl-challenge')).toContainText(`${r.start} ${r.amount > 0 ? '+' : '−'} ${Math.abs(r.amount)} = ?`);
  await expect(frame.locator('.nl-together')).toBeHidden();
  await frame.evaluate((jump) => H5P.instances[0].jump(jump), r.amount + Math.sign(r.amount));
  await expect(frame.locator('.nl-message-bad')).toBeVisible();
  await frame.locator('.nl-together').click();
  await frame.locator('.nl-option', { hasText: new RegExp(`^${r.target}$`) }).click();
  await expect(frame.locator('.nl-next')).toBeVisible();
  expect(await frame.evaluate(() => H5P.instances[0].game.score)).toBe(0);
});

test('a sum: the jump can be drawn from the piece with the mouse, and it lands on a whole number', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.nl-choice-add100').click();
  const r = await round(frame);
  const box = await frame.locator('.nl-line').boundingBox();
  const line = () => frame.evaluate(() => {
    const { line: l } = H5P.instances[0];
    return { scale: l.scale, xStart: l.x(l.piece), xTarget: l.x(H5P.instances[0].game.current.target) };
  });
  const at = await line();
  await page.mouse.move(box.x + at.xStart * at.scale, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + at.xTarget * at.scale, box.y + 100, { steps: 6 });
  await page.mouse.up();
  await expect(frame.locator('.nl-option')).not.toHaveCount(0);
  expect(await frame.evaluate(() => H5P.instances[0].game.position)).toBe(r.target);
});

test('the free line: jumps, a drawn jump, undo and another range, without points', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.nl-choice-free').click();
  await expect(frame.locator('.nl-message')).toContainText('0');
  await frame.locator('.nl-jump', { hasText: /^\+5$/ }).click();
  await expect(frame.locator('.nl-message')).toContainText('5');
  await frame.locator('.nl-jump', { hasText: /^\+2$/ }).click();
  await expect(frame.locator('.nl-message')).toContainText('7');
  await frame.locator('.nl-undo').click();
  await expect(frame.locator('.nl-message')).toContainText('5');
  await frame.locator('.nl-range', { hasText: '100' }).click();
  await expect(frame.locator('.nl-jump', { hasText: /^\+10$/ })).toBeVisible();
  expect(await answered(frame)).toEqual([]);
});

test('placing with the keyboard: the arrows move the mark and Enter says that is the place', async ({ page }) => {
  const frame = await open(page);
  await frame.locator('.nl-choice-place1000').click();
  await expect(frame.locator('.nl-line')).toBeFocused();
  await expect(frame.locator('.nl-line')).toHaveAttribute('role', 'slider');
  await expect(frame.locator('.nl-here')).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(frame.locator('.nl-here')).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(frame.locator('.nl-next')).toBeFocused();
});

test('a reload in the middle takes the game up again, with the same numbers', async ({ page }) => {
  const session = `nl-resume-${test.info().project.name}`;
  let frame = await open(page, 'es', session);
  await frame.locator('.nl-choice-tables').click();
  await playRound(page, frame);
  const r = await round(frame);
  await frame.evaluate(() => {
    H5P.setUserData(H5P.instances[0].contentId, 'state', H5P.instances[0].getCurrentState(), { deleteOnChange: true });
  });
  await page.waitForTimeout(500);
  frame = await open(page, 'es', session);
  await expect(frame.locator('.nl-challenge')).toContainText(`${r.target}`);
  await expect(frame.locator('.nl-round')).toContainText('2');
  expect((await round(frame)).target).toBe(r.target);
});

test('it never saves a null state, the one H5P takes for changed content', async ({ page }) => {
  const frame = await open(page);
  expect(await frame.evaluate(() => H5P.instances[0].getCurrentState() === undefined)).toBe(true);
  await frame.locator('.nl-choice-tables').click();
  expect(await frame.evaluate(() => typeof H5P.instances[0].getCurrentState())).toBe('object');
  expect(await frame.evaluate(() => H5P.instances[0].getCurrentState() === null)).toBe(false);
});

test('it changes along with the dark mode of the page, frame included', async ({ page }) => {
  const frame = await open(page);
  const background = () => frame.evaluate(() => getComputedStyle(document.querySelector('.nl')).backgroundColor);
  const light = await background();
  await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'dark'));
  await expect.poll(background).toBe('rgb(29, 33, 37)');
  await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'light'));
  await expect.poll(background).toBe(light);
});

for (const [width, height] of [[1100, 540], [360, 640]]) {
  test(`the round and the next step come into view at ${width}×${height}, below the header of a page`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const frame = await open(page);
    await page.evaluate(() => document.body.prepend(Object.assign(document.createElement('div'), { style: 'height: 500px' })));
    const shows = (selector) => expect.poll(async () => {
      const box = await frame.locator(selector).boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= height;
    }, { message: `${selector} in view` }).toBe(true);
    await frame.locator('.nl-choice-tables').click();
    await shows('.nl-challenge');
    const r = await round(frame);
    await frame.locator('.nl-count', { hasText: new RegExp(`^${r.times}$`) }).click();
    await shows('.nl-next');
  });
}

/** @type {Array<[number, boolean]>} */
const SCREENS = [[320, false], [1100, false], [320, true], [1100, true]];
for (const [width, dark] of SCREENS) {
  test(`no sideways scrolling and no axe violations at ${width} px${dark ? ', dark' : ''}`, async ({ page }) => {
    // Six scans and a whole game: more than the usual time on a busy machine.
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 900 });
    const frame = await open(page);
    if (dark) {
      await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'dark'));
      await expect.poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.nl')).backgroundColor)).toBe('rgb(29, 33, 37)');
    }
    const axe = async (step) => {
      const scroll = await frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll, `sideways scroll on ${step}`).toBeLessThanOrEqual(0);
      const report = await new AxeBuilder({ page })
        .include({ fromFrames: ['iframe.h5p-iframe', '.nl'] })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(report.violations.map((v) => `${step}: ${v.id} (${v.nodes.length})`)).toEqual([]);
    };
    await axe('choices');
    await frame.locator('.nl-choice-add100').click();
    await axe('sum');
    for (let i = 0; i < 2; i++) {
      await playRound(page, frame);
    }
    await axe('goal');
    for (let i = 0; i < 4; i++) {
      await playRound(page, frame);
    }
    await axe('results');
    await frame.locator('.nl-other').click();
    await frame.locator('.nl-choice-place1000').click();
    await axe('place');
    await frame.evaluate(() => H5P.instances[0].chooseAgain());
    await frame.locator('.nl-choice-free').click();
    await axe('free');
  });
}
