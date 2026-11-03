// The games as a classroom board shows them, in the h5p-cli dev server and at the sizes of board.mjs:
//   - the game in play fits in the height, with room for the fixed bar of an LMS page above it (BAR), and nothing
//     sticks out sideways;
//   - a sudden change of size in the middle of a game (an HDMI cable plugged in or pulled out) keeps the game as it was,
//     without a reload;
//   - the full-screen button of H5P puts the game on the whole screen.
// With --old, every stylesheet is first cut down to what Firefox 98 keeps (old-css.mjs), as on a board with Android 8.
// firefox98.mjs checks the same in that browser.
// Screenshots, with --shots <dir>, of what the board shows with the game scrolled up to just under that bar.
//
//   node tests/boards/boards.mjs [--old] [--shots dir] [--port 8094] [--game alphabet-wheel]
//
// Needs the built games (npm run build); it starts the dev server itself. Exits with 1 if a check fails.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { answers, barAt, serve, SIZES } from './board.mjs';
import { oldBrowserCss } from './old-css.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const old = args.includes('--old');
const shots = option('--shots', '');
const port = option('--port', '8094');
const only = option('--game', '');
const base = `http://localhost:${port}`;

let failures = 0;
const report = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  failures += ok ? 0 : 1;
};

const GAMES = {
  'alphabet-wheel': {
    root: '.aw',
    async start(frame) {
      await frame.locator('.aw-intro button').click();
      await frame.locator('.aw-input').waitFor();
    },
    /** One move: the right answer to the current letter. */
    async move(frame) {
      const letter = await frame.locator('.aw-letter[aria-current] .aw-letter-text').textContent();
      await frame.locator('.aw-input').fill(answers[letter]);
      await frame.locator('.aw-input').press('Enter');
    },
    state: (frame) => frame.evaluate(() => {
      const current = document.querySelector('.aw-letter[aria-current] .aw-letter-text');
      return [current && current.textContent, document.querySelector('.aw-counts').textContent].join(' | ');
    }),
    /** Sizes that only make sense if the stylesheet came through: the letters and the one in the middle. */
    shape: (frame) => frame.evaluate(() => {
      const letter = document.querySelector('.aw-letter').getBoundingClientRect();
      const wheel = document.querySelector('.aw-wheel').getBoundingClientRect();
      const hub = parseFloat(getComputedStyle(document.querySelector('.aw-hub-letter')).fontSize);
      return { wheel: Math.round(wheel.width), letter: Math.round(letter.width), hub: Math.round(hub),
        sideBySide: getComputedStyle(document.querySelector('.aw-game')).gridTemplateColumns.split(' ').length > 1 };
    }),
    shapeOk: (s) => s.letter >= 0.06 * s.wheel && s.hub >= 0.2 * s.wheel,
  },
  'number-line': {
    root: '.nl',
    async start(frame) {
      await frame.locator('.nl-choice-add20').click();
      await frame.locator('.nl-line').waitFor();
    },
    async move(frame) {
      await frame.locator('.nl-controls:not(.nl-extra) button:not(:disabled)').first().click();
    },
    /** Ends the round, right or wrong: the tallest moment of a round, with the message and «Next». */
    async answer(frame) {
      const round = await frame.evaluate(() => H5P.instances[0].game.current);
      if (round.mode === 'exact') {
        await frame.locator('.nl-count').first().click();
      } else if (round.mode === 'place') {
        await frame.evaluate((value) => H5P.instances[0].mark(value), round.value);
        await frame.locator('.nl-here').click();
      } else {
        for (let i = 0; i < 40 && await frame.locator('.nl-next').isHidden() && !await frame.locator('.nl-option').count(); i++) {
          await frame.locator('.nl-controls:not(.nl-extra) button:not(:disabled)').first().click();
        }
        if (await frame.locator('.nl-option').count()) {
          await frame.locator('.nl-option').first().click();
        }
      }
    },
    state: (frame) => frame.evaluate(() => {
      const game = H5P.instances[0].game;
      return JSON.stringify({ round: game.log.length, position: game.position, moves: game.moves });
    }),
    shape: (frame) => frame.evaluate(() => {
      const line = document.querySelector('.nl-line').getBoundingClientRect();
      return { line: Math.round(line.width), game: Math.round(document.querySelector('.nl').getBoundingClientRect().width) };
    }),
    shapeOk: (s) => s.line >= 0.6 * s.game,
  },
};

async function openGame(page, name) {
  await page.goto(`${base}/view/h5p-${name}/${name}-es?session=null`);
  const handle = await page.locator('iframe.h5p-iframe').elementHandle();
  const frame = await handle.contentFrame();
  await frame.waitForSelector(GAMES[name].root);
  return { frame, iframe: page.locator('iframe.h5p-iframe') };
}

/** How the game sits: its height against the board's, and anything wider than the frame. */
async function measure(page, frame, iframe) {
  const height = (await iframe.boundingBox()).height;
  const wide = await frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const size = page.viewportSize();
  return { height: Math.round(height), room: size.height - barAt(size.width), wide };
}

async function showAsBoard(page, iframe, file) {
  await iframe.evaluate((node, bar) => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - bar),
    barAt(page.viewportSize().width));
  if (shots) {
    await page.screenshot({ path: join(shots, file) });
  }
}

async function check(browser, name, [width, height]) {
  const game = GAMES[name];
  const label = `${name} ${width}×${height}${old ? ' (Firefox 98 styles)' : ''}`;
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: 'reduce',
    storageState: { cookies: [], origins: [{ origin: base, localStorage: [{ name: 'h5p-oksigenia-muted', value: '1' }] }] },
  });
  if (old) {
    // The stylesheets of the games; the core of H5P is not ours to check.
    await context.route(/\/dist\/[a-z-]+\.css(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: oldBrowserCss(await response.text()) });
    });
    // What the script of a game asks the browser, it answers as Firefox 98 would.
    await context.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...query) => (/container|color-mix|oklch|:has\(/.test(query.join(':')) ? false : supports(...query));
    });
  }
  const page = await context.newPage();
  const { frame, iframe } = await openGame(page, name);
  await game.start(frame);
  await page.waitForTimeout(800);

  const fit = await measure(page, frame, iframe);
  report(fit.height <= fit.room, `${label}: the game in play is ${fit.height} px high, ${fit.room} px of room`);
  report(fit.wide <= 0, `${label}: nothing sticks out sideways (${fit.wide} px)`);
  const shape = await game.shape(frame);
  report(game.shapeOk(shape), `${label}: drawn to size ${JSON.stringify(shape)}`);
  await showAsBoard(page, iframe, `${name}-${width}x${height}${old ? '-ff98' : ''}.png`);

  // A sudden change of size in the middle of a game, and back.
  await game.move(frame);
  await page.waitForTimeout(300);
  const before = await game.state(frame);
  // A mark on the page that a reload would wipe.
  await frame.evaluate(() => {
    document.documentElement.dataset.board = 'kept';
  });
  const [otherWidth, otherHeight] = SIZES.find(([w]) => w !== width);
  await page.setViewportSize({ width: otherWidth, height: otherHeight });
  await page.waitForTimeout(600);
  const during = await game.state(frame);
  const resized = await game.shape(frame);
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(600);
  const after = await game.state(frame);
  const kept = await frame.evaluate(() => document.documentElement.dataset.board === 'kept');
  report(kept && before === during && during === after,
    `${label}: a change of size to ${otherWidth}×${otherHeight} and back keeps the game (${after})`);
  report(game.shapeOk(resized), `${label}: redrawn at ${otherWidth}×${otherHeight} ${JSON.stringify(resized)}`);

  // After answering: the message, and the button to go on.
  if (game.answer) {
    await game.answer(frame);
  }
  await page.waitForTimeout(500);
  const answered = await measure(page, frame, iframe);
  report(answered.height <= answered.room, `${label}: answered, ${answered.height} px high, ${answered.room} px of room`);
  await showAsBoard(page, iframe, `${name}-${width}x${height}${old ? '-ff98' : ''}-answered.png`);

  // Full screen, from the button H5P puts on the game.
  const button = frame.locator('.h5p-enable-fullscreen');
  if (await button.count()) {
    await button.click();
    await page.waitForTimeout(800);
    const full = await frame.evaluate((root) => {
      const box = document.querySelector(root).getBoundingClientRect();
      return { on: !!document.querySelector('.h5p-fullscreen, .h5p-semi-fullscreen'), bottom: Math.round(box.bottom),
        screen: window.innerHeight };
    }, game.root);
    report(full.on && full.bottom <= full.screen + 1,
      `${label}: full screen puts the game on the whole screen (ends at ${full.bottom} of ${full.screen})`);
    // H5P hides its own buttons in full screen: the game shows one to come out, for a board without a keyboard.
    report(await frame.locator(`${game.root}-exit-full`).isVisible(), `${label}: a button to come out of full screen shows`);
    if (shots) {
      await page.screenshot({ path: join(shots, `${name}-${width}x${height}${old ? '-ff98' : ''}-full.png`) });
    }
  } else {
    report(false, `${label}: there is no full-screen button`);
  }
  await context.close();
}

if (shots) {
  mkdirSync(shots, { recursive: true });
}
const server = await serve(port);
try {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
  for (const name of Object.keys(GAMES).filter((n) => !only || n === only)) {
    for (const size of SIZES) {
      await check(browser, name, size);
    }
  }
  await browser.close();
} finally {
  server.kill();
}
console.log(failures ? `${failures} failed` : 'all ok');
process.exit(failures ? 1 : 0);
