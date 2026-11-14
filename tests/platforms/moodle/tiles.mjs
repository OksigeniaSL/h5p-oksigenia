// The Alphabet Wheel with letter tiles in a real Moodle, as the youngest play it: an activity made from the Spanish
// example with «Letter tiles instead of typing» on. As an example student: two letters right with the tiles, one with
// its letters in a wrong order, one passed, and «Finish»; Moodle keeps one attempt with score 2 and the grade from it.
// The box is ticked in the editor; the game fits on the boards and on a phone, with no answer field and no keyboard;
// and, in Moodle 5, it goes dark with the page.
//
// Usually through run.sh, which makes the activity with setup.php and calls:
//
//   node tests/platforms/moodle/tiles.mjs --url http://localhost:8096 --cmid 5 --container h5p-moodle-moodle-1 \
//     --db h5p-moodle-db-1 --db-password … --admin-password … --shots <folder>
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { boardChecks } from './boards.mjs';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string' }, cmid: { type: 'string' }, db: { type: 'string' }, 'admin-password': { type: 'string' },
    'db-password': { type: 'string' }, shots: { type: 'string' }, container: { type: 'string' },
    student: { type: 'string', default: 'alumno1' }, 'student-password': { type: 'string', default: 'Alumno-1-ficticio' },
  },
});
mkdirSync(opt.shots, { recursive: true });
const items = JSON.parse(readFileSync(new URL('../../../packages/alphabet-wheel/content/es/content/content.json', import.meta.url), 'utf8')).items;
const answers = Object.fromEntries(items.map((i) => [i.letter, i.answer]));
const sql = (query) => execFileSync('docker', ['exec', opt.db, 'mariadb', '-umoodle', `-p${opt['db-password']}`, 'moodle',
  '-N', '-B', '-e', query], { encoding: 'utf8' }).trim();
const activity = () => sql(`SELECT instance FROM mdl_course_modules WHERE id = ${Number(opt.cmid)}`);
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} tiles: ${name}${detail ? ` · ${detail}` : ''}`);
};
/** After a move the buttons ignore taps for 400 ms (a double tap on a slow board): a person is never quicker. */
const PERSON_MS = 450;

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true, args: ['--mute-audio'] });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('h5p-oksigenia-muted', '1'));
  const page = await context.newPage();
  const login = async (user, password) => {
    await page.context().clearCookies();
    await page.goto(`${opt.url}/login/index.php`, { waitUntil: 'networkidle' });
    await page.fill('#username', user);
    await page.fill('#password', password);
    await page.click('#loginbtn');
    await page.waitForLoadState('networkidle');
  };
  const game = () => page.frameLocator('iframe.h5p-player').frameLocator('iframe.h5p-iframe');
  const openActivity = async () => {
    await page.goto(`${opt.url}/mod/h5pactivity/view.php?id=${opt.cmid}`);
    await game().locator('.aw').waitFor({ timeout: 60_000 });
  };
  const letter = () => game().locator('.aw-letter[aria-current] .aw-letter-text').textContent();
  /** Taps, in order, a free tile for each letter of the text (capitals apart). */
  const tap = async (text, frame = game()) => {
    for (const l of text) {
      await frame.locator('.aw-tile:not(.aw-tile-used)', { hasText: new RegExp(`^${l}$`) }).first().click();
    }
  };
  const attempts = () => sql(`SELECT a.rawscore, a.maxscore FROM mdl_h5pactivity_attempts a
    JOIN mdl_user u ON u.id = a.userid WHERE u.username = '${opt.student}' AND a.h5pactivityid = ${activity()}
    ORDER BY a.attempt`).split('\n').filter(Boolean).map((line) => line.split('\t').map(Number));

  // The teacher's side: the box is there in the editor, and ticked.
  // Moodle's player links to its H5P editor (h5p/edit.php) for those who can change the content.
  await login('admin', opt['admin-password']);
  await page.goto(`${opt.url}/mod/h5pactivity/view.php?id=${opt.cmid}`);
  const edit = page.locator('a[href*="/h5p/edit.php"]').first();
  await edit.waitFor({ timeout: 60_000 });
  await page.goto(/** @type {string} */ (await edit.getAttribute('href')));
  const editor = page.frameLocator('iframe.h5p-editor-iframe');
  const box = editor.locator('.field-name-letterTiles input[type="checkbox"]');
  await box.waitFor({ timeout: 60_000 });
  check('the editor has the box «Letter tiles instead of typing», ticked', await box.isChecked(),
    (await editor.locator('.field-name-letterTiles').innerText()).trim().split('\n')[0]);
  await editor.locator('.field-name-letterTiles').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${opt.shots}/moodle-tiles-editor.png` });

  await login(opt.student, opt['student-password']);
  const before = attempts().length;
  await openActivity();
  await game().locator('.aw-intro button').click();
  await game().locator('.aw-tile').first().waitFor();
  check('no answer field: the answer is made with the tiles', await game().locator('.aw-input').count() === 0);
  await page.screenshot({ path: `${opt.shots}/moodle-tiles-game.png` });
  // Two letters right.
  for (let i = 0; i < 2; i++) {
    await tap(answers[await letter()]);
    await game().locator('.aw-check').click();
    await page.waitForTimeout(PERSON_MS);
  }
  // One with its letters in another order: the first one last.
  const wrong = answers[await letter()];
  await tap(wrong.slice(1) + wrong[0]);
  await game().locator('.aw-check').click();
  await page.waitForTimeout(PERSON_MS);
  // One passed, then «Finish», asked twice.
  await game().locator('.aw-pass').click();
  await page.waitForTimeout(PERSON_MS);
  await game().locator('.aw-finish').click();
  await game().locator('.aw-finish').click();
  await game().locator('.aw-cheer-title').waitFor();
  for (let i = 0; i < 30 && attempts().length === before; i++) {
    await page.waitForTimeout(500);
  }
  const last = attempts().at(-1);
  check('Moodle keeps one attempt, with the letters right out of all of them', attempts().length === before + 1
    && last[0] === 2 && last[1] === items.length, last ? `${last[0]}/${last[1]}` : 'no attempt');
  const grade = Number(sql(`SELECT g.finalgrade FROM mdl_grade_grades g JOIN mdl_grade_items i ON i.id = g.itemid
    JOIN mdl_user u ON u.id = g.userid WHERE i.itemmodule = 'h5pactivity' AND i.iteminstance = ${activity()}
    AND u.username = '${opt.student}'`));
  check('the grade is 10 × 2 / letters', Math.abs(grade - (10 * 2) / items.length) < 0.001, String(grade));
  await page.screenshot({ path: `${opt.shots}/moodle-tiles-end.png` });
  await page.waitForTimeout(4000);

  await boardChecks({
    page, game: game(), root: '.aw', open: openActivity, check, shots: opt.shots, name: 'aw-tiles',
    start: async () => {
      await game().locator('.aw-intro button').click();
      await game().locator('.aw-tile').first().waitFor();
    },
    answer: async () => {
      await tap(answers[await letter()]);
      await game().locator('.aw-check').click();
    },
    leave: async () => {
      await game().locator('.aw-finish').click();
      await game().locator('.aw-finish').click();
      await game().locator('.aw-cheer-title').waitFor();
      await page.waitForTimeout(4000);
    },
  });

  // A phone: no field, so no keyboard; the clue, the word and «Check» stay in view, and the tiles are a finger wide.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    storageState: { cookies: await page.context().cookies(), origins: [] } });
  await phone.addInitScript(() => localStorage.setItem('h5p-oksigenia-muted', '1'));
  const touch = await phone.newPage();
  const touchGame = touch.frameLocator('iframe.h5p-player').frameLocator('iframe.h5p-iframe');
  await touch.goto(`${opt.url}/mod/h5pactivity/view.php?id=${opt.cmid}`);
  await touchGame.locator('.aw-intro button').tap();
  await touchGame.locator('.aw-tile').first().waitFor();
  let clue = null, button = null;
  for (let i = 0; i < 25; i++) {
    clue = await touchGame.locator('.aw-clue').boundingBox();
    button = await touchGame.locator('.aw-check').boundingBox();
    if (clue && button && clue.y >= 60 && button.y + button.height <= 844) {
      break;
    }
    await touch.waitForTimeout(100);
  }
  check('on a phone, the clue and «Check» are in view', clue && button && clue.y >= 60 && button.y + button.height <= 844,
    `clue from y ${Math.round(clue.y)}, «Check» down to y ${Math.round(button.y + button.height)}, of 844`);
  const smallest = await touchGame.locator('.aw-tile').evaluateAll((els) => Math.min(...els.map((e) => {
    const r = e.getBoundingClientRect();
    return Math.min(r.width, r.height);
  })));
  check('on a phone, every tile is at least 44 px', smallest >= 44, `${Math.round(smallest)} px`);
  await touch.screenshot({ path: `${opt.shots}/moodle-tiles-touch.png` });
  await phone.close();

  if (opt.container && sql("SELECT value FROM mdl_config WHERE name = 'release'").startsWith('5.')) {
    execFileSync('docker', ['exec', '-u', 'www-data', opt.container, 'php', '-r', 'define("CLI_SCRIPT", 1); '
      + 'require "/var/www/moodle/config.php"; set_config("enablecolourmodes", 1, "theme_boost"); '
      + 'set_config("defaultcolourmode", "dark", "theme_boost"); purge_all_caches();']);
    await page.waitForTimeout(4000);
    await openActivity();
    await game().locator('.aw-intro button').click();
    await game().locator('.aw-tile').first().waitFor();
    await page.waitForTimeout(1000);
    const tile = await game().locator('.aw-tile').first().evaluate((node) => getComputedStyle(node).backgroundColor);
    check('with Moodle in dark mode, the tiles are dark too', tile !== 'rgb(255, 255, 255)', tile);
    await page.screenshot({ path: `${opt.shots}/moodle-tiles-dark.png` });
    execFileSync('docker', ['exec', '-u', 'www-data', opt.container, 'php', '-r', 'define("CLI_SCRIPT", 1); '
      + 'require "/var/www/moodle/config.php"; set_config("defaultcolourmode", "light", "theme_boost"); purge_all_caches();']);
  }
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(JSON.stringify({ tiles: checks.length, failed }));
process.exit(failed ? 1 : 0);
