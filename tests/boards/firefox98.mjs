// The games in a real Firefox 98, the browser of some classroom boards with Android 8, at their ×1.5: what boards.mjs
// checks in Chrome, here by WebDriver and with real clicks and keys. boards.mjs --old only simulates this browser.
//
//   docker run -d --rm --name h5p-ff98 --network host --shm-size=1g --memory=2g --cpus=4 -e SE_OPTS="--port 4492" \
//     -e SE_START_VNC=false -e SE_RECORD_VIDEO=false -e VIDEO_READY_PORT=9092 -e DISPLAY_NUM=92 -e DISPLAY=:92 \
//     -e SE_EVENT_BUS_PUBLISH_PORT=4483 -e SE_EVENT_BUS_SUBSCRIBE_PORT=4484 -e SE_SCREEN_WIDTH=2400 \
//     -e SE_SCREEN_HEIGHT=1500 selenium/standalone-firefox:98.0-20261010
//   node tests/boards/firefox98.mjs [--shots dir] [--port 8094] [--driver http://127.0.0.1:4492]
//   docker stop h5p-ff98
//
// Needs the built games (npm run build); it starts the dev server itself. Exits with 1 if a check fails.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { answers, barAt, serve, SIZES } from './board.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const shots = option('--shots', '');
const port = option('--port', '8094');
const driver = option('--driver', 'http://127.0.0.1:4492');
const base = `http://127.0.0.1:${port}`;
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const ENTER = '';

let failures = 0;
const report = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  failures += ok ? 0 : 1;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let session = '';

async function call(method, path, body) {
  const response = await fetch(`${driver}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const { value } = await response.json();
  if (value && value.error) {
    throw new Error(`${value.error}: ${value.message}`);
  }
  return value;
}

const inSession = (method, path, body) => call(method, `/session/${session}${path}`, body);
const js = (script, ...values) => inSession('POST', '/execute/sync', { script, args: values });
const find = async (selector) => (await inSession('POST', '/element', { using: 'css selector', value: selector }))[ELEMENT];
const click = async (selector) => inSession('POST', `/element/${await find(selector)}/click`, {});
const shown = (selector) => js('var n = document.querySelector(arguments[0]); return !!n && n.getClientRects().length > 0;', selector);

async function until(selector) {
  for (let i = 0; i < 150; i++) {
    if (await shown(selector)) {
      return;
    }
    await sleep(200);
  }
  throw new Error(`${selector} never showed`);
}

/** Sets what the page sees by correcting the window, whose bars count against it. */
async function size(width, height) {
  for (let i = 0; i < 4; i++) {
    const [innerWidth, innerHeight] = await js('return [top.innerWidth, top.innerHeight];');
    if (innerWidth === width && innerHeight === height) {
      return;
    }
    const rect = await inSession('GET', '/window/rect');
    await inSession('POST', '/window/rect', { width: rect.width + width - innerWidth, height: rect.height + height - innerHeight });
    await sleep(400);
  }
}

async function shot(file) {
  if (shots) {
    writeFileSync(join(shots, file), Buffer.from(await inSession('GET', '/screenshot'), 'base64'));
  }
}

const GAMES = {
  'alphabet-wheel': {
    root: '.aw',
    async start() {
      await click('.aw-intro button');
      await until('.aw-input');
    },
    async move() {
      const letter = await js("return document.querySelector('.aw-letter[aria-current] .aw-letter-text').textContent;");
      const input = await find('.aw-input');
      await inSession('POST', `/element/${input}/clear`, {});
      await inSession('POST', `/element/${input}/value`, { text: `${answers[letter]}${ENTER}` });
    },
    state: `var current = document.querySelector('.aw-letter[aria-current] .aw-letter-text');
      return [current && current.textContent, document.querySelector('.aw-counts').textContent].join(' | ');`,
    shape: `var letter = document.querySelector('.aw-letter').getBoundingClientRect();
      var wheel = document.querySelector('.aw-wheel').getBoundingClientRect();
      var hub = parseFloat(getComputedStyle(document.querySelector('.aw-hub-letter')).fontSize);
      return { wheel: Math.round(wheel.width), letter: Math.round(letter.width), hub: Math.round(hub) };`,
    shapeOk: (s) => s.letter >= 0.06 * s.wheel && s.hub >= 0.2 * s.wheel,
  },
  'number-line': {
    root: '.nl',
    async start() {
      await click('.nl-choice-add20');
      await until('.nl-line');
    },
    async move() {
      await click('.nl-controls:not(.nl-extra) button:not(:disabled)');
    },
    /** Ends the round, right or wrong: the tallest moment of a round, with the message and «Next». */
    async answer() {
      const round = await js('var r = H5P.instances[0].game.current; return { mode: r.mode, value: r.value };');
      if (round.mode === 'exact') {
        await click('.nl-count');
      } else if (round.mode === 'place') {
        await js('H5P.instances[0].mark(arguments[0]);', round.value);
        await click('.nl-here');
      } else {
        for (let i = 0; i < 40 && !await shown('.nl-next') && !await shown('.nl-option'); i++) {
          await click('.nl-controls:not(.nl-extra) button:not(:disabled)');
          await sleep(300);
        }
        if (await shown('.nl-option')) {
          await click('.nl-option');
        }
      }
    },
    state: `var game = H5P.instances[0].game;
      return JSON.stringify({ round: game.log.length, position: game.position, moves: game.moves });`,
    shape: `var line = document.querySelector('.nl-line').getBoundingClientRect();
      return { line: Math.round(line.width), game: Math.round(document.querySelector('.nl').getBoundingClientRect().width) };`,
    shapeOk: (s) => s.line >= 0.6 * s.game,
  },
};

async function open(name) {
  await inSession('POST', '/frame', { id: null });
  await inSession('POST', '/url', { url: `${base}/view/h5p-${name}/${name}-es?session=null` });
  await inSession('POST', '/frame', { id: { [ELEMENT]: await find('iframe.h5p-iframe') } });
  await until(GAMES[name].root);
  await js(`window.boardErrors = [];
    window.addEventListener('error', function (e) {
      // A note from the browser, not a failure: what an observer changed is measured again on the next frame.
      if (!/^ResizeObserver loop/.test(e.message)) { window.boardErrors.push(e.message); }
    });
    window.addEventListener('unhandledrejection', function (e) { window.boardErrors.push(String(e.reason)); });`);
}

/** How the game sits: the height of its frame, and anything wider than the frame. */
const measure = () => js(`var root = document.documentElement;
  return { height: Math.round(window.frameElement.getBoundingClientRect().height), wide: root.scrollWidth - root.clientWidth };`);

async function check(name, [width, height]) {
  const game = GAMES[name];
  const label = `${name} ${width}×${height}`;
  const room = height - barAt(width);
  await inSession('POST', '/frame', { id: null });
  await size(width, height);
  await open(name);
  await game.start();
  await sleep(800);

  const fit = await measure();
  report(fit.height <= room, `${label}: the game in play is ${fit.height} px high, ${room} px of room`);
  report(fit.wide <= 0, `${label}: nothing sticks out sideways (${fit.wide} px)`);
  const shape = await js(game.shape);
  report(game.shapeOk(shape), `${label}: drawn to size ${JSON.stringify(shape)}`);
  await js('window.parent.scrollTo(0, window.frameElement.getBoundingClientRect().top + window.parent.scrollY - arguments[0]);', barAt(width));
  await shot(`${name}-${width}x${height}.png`);

  // A sudden change of size in the middle of a game, and back.
  await game.move();
  await sleep(300);
  const before = await js(game.state);
  await js("document.documentElement.dataset.board = 'kept';");
  const [otherWidth, otherHeight] = SIZES.find(([w]) => w !== width);
  await size(otherWidth, otherHeight);
  await sleep(600);
  const during = await js(game.state);
  const resized = await js(game.shape);
  await size(width, height);
  await sleep(600);
  const after = await js(game.state);
  const kept = await js("return document.documentElement.dataset.board === 'kept';");
  report(kept && before === during && during === after, `${label}: a change of size to ${otherWidth}×${otherHeight} and back keeps the game (${after})`);
  report(game.shapeOk(resized), `${label}: redrawn at ${otherWidth}×${otherHeight} ${JSON.stringify(resized)}`);

  // After answering: the message, and the button to go on.
  if (game.answer) {
    await game.answer();
  }
  await sleep(700);
  const answered = await measure();
  report(answered.height <= room, `${label}: answered, ${answered.height} px high, ${room} px of room`);
  await shot(`${name}-${width}x${height}-answered.png`);

  // Full screen, with a real click, and out with the game's own button. It is the frame that goes full screen, so the
  // browser reports it in the page around the game.
  await click('.h5p-enable-fullscreen');
  await sleep(1500);
  const full = await js(`var box = document.querySelector(arguments[0]).getBoundingClientRect();
    return { real: !!top.document.fullscreenElement, on: !!document.querySelector('.h5p-fullscreen'), bottom: Math.round(box.bottom), screen: window.innerHeight };`, game.root);
  report(full.real && full.on && full.bottom <= full.screen + 1, `${label}: full screen holds the whole game (ends at ${full.bottom} of ${full.screen})`);
  await shot(`${name}-${width}x${height}-full.png`);
  await click(`${game.root}-exit-full`);
  await sleep(1500);
  report(await js("return !top.document.fullscreenElement && !document.querySelector('.h5p-fullscreen');"), `${label}: the game's own button leaves full screen`);
  const errors = await js('return window.boardErrors;');
  report(!errors.length, `${label}: no errors ${errors.join(' | ')}`);
}

if (shots) {
  mkdirSync(shots, { recursive: true });
}
const server = await serve(port);
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await call('GET', '/status')).ready) {
        break;
      }
    } catch {
      // Not up yet.
    }
    await sleep(2000);
  }
  ({ sessionId: session } = await call('POST', '/session', { capabilities: { alwaysMatch: {
    browserName: 'firefox',
    'moz:firefoxOptions': { prefs: { 'layout.css.devPixelsPerPx': '1.5', 'media.volume_scale': '0.0' } },
  } } }));
  await inSession('POST', '/url', { url: `${base}/view/h5p-alphabet-wheel/alphabet-wheel-es?session=null` });
  const browser = await js("return { agent: navigator.userAgent, ratio: devicePixelRatio, containers: CSS.supports('container-type: inline-size') };");
  report(/Firefox\/98/.test(browser.agent) && !browser.containers, `the browser is ${browser.agent} at ×${browser.ratio}, without container queries`);
  for (const name of Object.keys(GAMES)) {
    for (const board of SIZES) {
      try {
        await check(name, board);
      } catch (error) {
        report(false, `${name} ${board.join('×')}: ${error.message}`);
      }
    }
  }
} finally {
  if (session) {
    await call('DELETE', `/session/${session}`);
  }
  server.kill();
}
console.log(failures ? `${failures} failed` : 'all ok');
process.exit(failures ? 1 : 0);
