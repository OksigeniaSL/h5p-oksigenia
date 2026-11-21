// End-to-end tests of H5P.NumberLine in the h5p-cli dev server, with its example content.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** What H5P does to plain text fields when a package is uploaded: htmlspecialchars, quotes included. */
const escapeAsH5P = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

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
  // A new round brings itself into view at 50, 250 and 600 ms, once the frames have grown, and may move the page under
  // a click: a person takes longer than that to reach for the first button, a test does not. The same for «Next».
  await page.waitForTimeout(650);
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
    // The round comes into view a moment after it opens, and the place to click moves with it: on a busy machine, later.
    await page.waitForTimeout(700);
    for (let i = 0; i < 5 && await frame.locator('.nl-here').isDisabled(); i++) {
      const box = await frame.locator('.nl-line').boundingBox();
      const padding = 26 * (box.width / await frame.evaluate(() => H5P.instances[0].line.width));
      await page.mouse.click(box.x + padding + (r.value / r.max) * (box.width - 2 * padding), box.y + box.height / 2);
      await page.waitForTimeout(200);
    }
    await frame.evaluate((value) => H5P.instances[0].mark(value), r.value);
    await frame.locator('.nl-here').click();
  }
  await page.waitForTimeout(650);
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
    await expect(frame.locator('.nl-cheer-title')).toBeVisible({ timeout: 15_000 });
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

test('texts kept with entities by the platform show as text', async ({ page }) => {
  const frame = await open(page, 'fr');
  const texts = await frame.evaluate((l10n) => {
    const line = new H5P.NumberLine({ l10n }, 999);
    return [line.l10n.retry, line.l10n.cheerKeep];
  }, { retry: escapeAsH5P('Rejouer l\'exercice & «gagner»'), cheerKeep: escapeAsH5P('Continue à t\'entraîner !') });
  expect(texts).toEqual(["Rejouer l'exercice & «gagner»", "Continue à t'entraîner !"]);
});

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
  await page.waitForTimeout(650);
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
  // The round comes into view a moment after it opens: the line moves with it.
  await page.waitForTimeout(700);
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
  // The line comes into view a moment after it opens: the buttons move with it.
  await page.waitForTimeout(700);
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
  await expect(frame.locator('.nl-count').first()).toBeFocused();
});

test('the player chooses how many rounds, from 5 to 10, when the teacher lets them; kept on a reload', async ({ page }) => {
  let frame = await open(page, 'fr');
  await expect(frame.locator('.nl-rounds')).toHaveCount(0);
  const session = `nl-rounds-${test.info().project.name}`;
  frame = await open(page, 'rounds-fr', session);
  await expect(frame.locator('.nl-rounds-pick')).toHaveCount(6);
  await expect(frame.locator('.nl-rounds')).toHaveAccessibleName('Combien de manches ?');
  await expect(frame.locator('.nl-rounds-pick[aria-pressed="true"]')).toHaveText('6');
  const eight = frame.locator('.nl-rounds-pick', { hasText: /^8$/ });
  await expect(eight).toHaveAccessibleName('8 manches');
  await eight.click();
  await expect(frame.locator('.nl-rounds-pick[aria-pressed="true"]')).toHaveText('8');
  await frame.locator('.nl-choice-add20').click();
  await expect(frame.locator('.nl-round')).toHaveText('Manche 1 sur 8');
  await frame.evaluate(() => {
    H5P.setUserData(H5P.instances[0].contentId, 'state', H5P.instances[0].getCurrentState(), { deleteOnChange: true });
  });
  await page.waitForTimeout(500);
  frame = await open(page, 'rounds-fr', session);
  await expect(frame.locator('.nl-round')).toHaveText('Manche 1 sur 8');
  expect(await frame.evaluate(() => H5P.instances[0].getMaxScore())).toBe(16);
  // With the topic set by the teacher, «Start» takes the number chosen, and the first screen says it.
  const fixed = await frame.evaluate(() => {
    const box = document.createElement('div');
    document.body.append(box);
    const game = new H5P.NumberLine({ topic: 'add20', rounds: 7, chooseRounds: true }, 0, {});
    game.attach(box);
    const pressed = box.querySelector('.nl-rounds-pick[aria-pressed="true"]').textContent;
    /** @type {HTMLElement} */ ([...box.querySelectorAll('.nl-rounds-pick')].find((b) => b.textContent === '9')).click();
    const result = { pressed, summary: box.querySelector('.nl-summary').textContent, rounds: game.game.rounds };
    box.remove();
    return result;
  });
  expect(fixed).toEqual({ pressed: '7', summary: 'Rounds: 9. No clock.', rounds: 9 });
  await frame.evaluate(() => H5P.deleteUserData(H5P.instances[0].contentId, 'state', 0));
});

for (const [width, height] of [[1280, 600], [360, 640]]) {
  test(`«Where did you land?» goes with its cards once the jumps are made, at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const frame = await open(page, 'fr');
    await frame.locator('.nl-choice-add20').click();
    await page.waitForTimeout(650);
    await expect(frame.locator('.nl-where-ask')).toHaveCount(0);
    const lineAt = () => frame.locator('.nl-line').evaluate((n) => Math.round(n.getBoundingClientRect().top));
    const before = await lineAt();
    const r = await round(frame);
    for (let i = 0; i < 40 && !(await frame.locator('.nl-option').count()); i++) {
      const position = await frame.evaluate(() => H5P.instances[0].game.position);
      await jumpOnce(frame, r.target - position);
    }
    await expect(frame.locator('.nl-where')).toHaveAccessibleName('Où es-tu tombé ?');
    // Up with the sum the hint of the jumps goes, but keeps its room: the line does not move while the player looks at it.
    await expect(frame.locator('.nl-hint')).toBeHidden();
    expect(await lineAt(), 'the line where it was').toBe(before);
    // Both measured in the frame of the game.
    const ask = await frame.locator('.nl-where-ask').evaluate((p) => {
      const box = p.getBoundingClientRect();
      return { x: box.x, y: box.y, height: box.height };
    });
    const cards = await frame.locator('.nl-option').evaluateAll((list) => list.map((b) => {
      const box = b.getBoundingClientRect();
      return { x: box.x, y: box.y };
    }));
    expect(new Set(cards.map((c) => Math.round(c.y))).size, 'the cards in one row').toBe(1);
    if (width > 600) {
      expect(ask.x, 'beside the cards, before them').toBeLessThan(cards[0].x);
      expect(ask.y + ask.height, 'on their row').toBeGreaterThan(cards[0].y);
    } else {
      expect(ask.y + ask.height, 'above the cards').toBeLessThanOrEqual(cards[0].y + 1);
    }
  });
}

test('the label of a short jump that lands next to the piece goes over the piece, not under it', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const frame = await open(page, 'fr');
  await frame.locator('.nl-choice-add20').click();
  await page.waitForTimeout(650);
  const overlap = await frame.evaluate(() => {
    const line = H5P.instances[0].line;
    line.arcs = [{ from: 14, to: 19, text: '+5', off: false }, { from: 19, to: 20, text: '+1', off: false }];
    line.piece = 20;
    line.draw();
    const label = [...document.querySelectorAll('.nl-arc-text')].find((t) => t.textContent === '+1').getBoundingClientRect();
    const piece = document.querySelector('.nl-piece').getBoundingClientRect();
    return label.bottom > piece.top + 1 && label.right > piece.left && label.left < piece.right;
  });
  expect(overlap, '«+1» clear of the piece').toBe(false);
});

test('the labels of short jumps in a row do not touch on a narrow line', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const frame = await open(page, 'fr');
  await frame.locator('.nl-choice-add20').click();
  await page.waitForTimeout(650);
  const boxes = await frame.evaluate(() => {
    const line = H5P.instances[0].line;
    line.arcs = [3, 4, 5, 6].map((from) => ({ from, to: from + 1, text: '+1', off: false }));
    line.piece = 18;
    line.draw();
    return [...document.querySelectorAll('.nl-arc-text')].map((t) => {
      const r = t.getBoundingClientRect();
      return { left: r.left, right: r.right, y: Number(t.getAttribute('y')) * line.scale };
    });
  });
  expect(boxes).toHaveLength(4);
  // Apart side by side, or one over the other by more than the height of the figures (13 px): the box of a text is
  // taller than its ink in Firefox. Up and down by turns, not a staircase.
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1], b = boxes[i];
    const apart = b.left - a.right >= 2 || Math.abs(b.y - a.y) >= 14;
    expect(apart, `label ${i + 1} clear of label ${i}`).toBe(true);
  }
  expect(boxes[0].y, 'the third label down again').toBeCloseTo(boxes[2].y, 1);
  expect(boxes[1].y, 'the fourth label up again').toBeCloseTo(boxes[3].y, 1);
});

for (const width of [320, 360, 412]) {
  test(`on a phone, the bar has the round and its level above, and the points and the sound below, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const frame = await open(page, 'fr');
    await frame.locator('.nl-choice-add20').click();
    for (const level of [0, 1, 2]) {
      const box = await frame.evaluate((n) => {
        const game = H5P.instances[0];
        game.game.level = n;
        game.render();
        const of = (selector) => document.querySelector(selector).getBoundingClientRect();
        const middle = (r) => r.top + r.height / 2;
        const [round, name, points, sound, bar] = ['.nl-round', '.nl-level', '.nl-points', '.nl-sound-group', '.nl-bar'].map(of);
        return {
          // Beside the round, or on a line of its own on the narrowest phones.
          firstLine: Math.min(Math.abs(round.top - name.top), Math.abs(name.left - bar.left)),
          secondLine: Math.abs(middle(points) - middle(sound)),
          below: points.top - Math.max(round.bottom, name.bottom), pointsStart: points.left - bar.left,
          // As tall as the points, which are one line of the same text.
          roundOneLine: round.height <= points.height + 2,
          soundEnd: bar.right - parseFloat(getComputedStyle(document.querySelector('.nl-bar')).paddingInlineEnd) - sound.right,
        };
      }, level);
      expect(box.firstLine, `level ${level + 1}: the level beside the round, or at the start of its own line`).toBeLessThan(4);
      expect(box.roundOneLine, `level ${level + 1}: the round in one line`).toBe(true);
      expect(box.secondLine, `level ${level + 1}: the points and the sound on one line`).toBeLessThan(4);
      expect(box.below, `level ${level + 1}: the points below the level`).toBeGreaterThanOrEqual(0);
      expect(box.pointsStart, `level ${level + 1}: the points at the start`).toBeLessThan(2);
      expect(Math.abs(box.soundEnd), `level ${level + 1}: the sound at the end`).toBeLessThan(2);
    }
  });
}

test('on a board, the bar stays on one line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  const frame = await open(page, 'fr');
  await frame.locator('.nl-choice-add20').click();
  const middles = await frame.evaluate(() => {
    const game = H5P.instances[0];
    game.game.level = 0;
    game.render();
    return ['.nl-round', '.nl-level', '.nl-points', '.nl-sound-group'].map((selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return r.top + r.height / 2;
    });
  });
  expect(Math.max(...middles) - Math.min(...middles)).toBeLessThan(6);
});

test('in the Moodle app, which measures the game before H5P shrinks its frame, the frame fits the round that starts', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const frame = await open(page, 'fr');
  await frame.evaluate(() => {
    window.measured = [];
    // As the embed page of the Moodle app does: on each resize, 0 ms later, the height of the body of the game's frame,
    // which H5P shrinks 1 ms after the resize.
    H5P.instances[0].on('resize', () => setTimeout(() => window.measured.push(document.body.scrollHeight), 0));
  });
  // The first screen is taller than a round on a phone: the frame has to shrink.
  await frame.locator('.nl-choice-add20').click();
  await page.waitForTimeout(800);
  const { last, now } = await frame.evaluate(() => ({ last: window.measured[window.measured.length - 1], now: document.body.scrollHeight }));
  expect(last, 'the last height the app was told').toBe(now);
});

test('a reload in the middle of a sum keeps the jumps already made', async ({ page }) => {
  const session = `nl-jumps-${test.info().project.name}`;
  let frame = await open(page, 'es', session);
  await frame.locator('.nl-choice-add100').click();
  await page.waitForTimeout(650);
  await frame.locator('.nl-jump').first().click();
  const before = await frame.evaluate(() => H5P.instances[0].game.position);
  await frame.evaluate(() => {
    H5P.setUserData(H5P.instances[0].contentId, 'state', H5P.instances[0].getCurrentState(), { deleteOnChange: true });
  });
  await page.waitForTimeout(500);
  frame = await open(page, 'es', session);
  expect(await frame.evaluate(() => H5P.instances[0].game.position)).toBe(before);
  expect(await frame.evaluate(() => H5P.instances[0].line.piece)).toBe(before);
  expect(await frame.locator('.nl-arc').count()).toBe(1);
  await expect(frame.locator('.nl-again')).toBeVisible();
});

for (const width of [320, 360, 412]) {
  test(`the full screen button of H5P covers nothing of the bar at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const frame = await open(page);
    await frame.locator('.nl-choice-tables').click();
    // All at the same moment, once the round has come into view: the page scrolls meanwhile.
    await page.waitForTimeout(650);
    const apart = await frame.evaluate(() => {
      const corner = document.querySelector('.h5p-enable-fullscreen').getBoundingClientRect();
      return Object.fromEntries(['.nl-round', '.nl-level', '.nl-points', '.nl-sound', '.nl-volume'].map((selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [selector, box.right <= corner.left || box.top >= corner.bottom];
      }));
    });
    for (const [selector, clear] of Object.entries(apart)) {
      expect(clear, `${selector} clear of the button`).toBe(true);
    }
  });
}

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
    await shows('.nl-line');
    await shows('.nl-count >> nth=11');
    // The first look of the game, at 50 ms, can still be moving the page: see playRound.
    await page.waitForTimeout(650);
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
