// Plays the Alphabet Wheel in a real Moodle as a fictitious student and checks what Moodle keeps: one attempt per
// game, with score = letters right, and the grade from the last one; a reload in the middle takes the game up again;
// a reload after the end starts a new game. Leaves screenshots for the test report.
//
// Usually through run.sh, which builds the throwaway site, runs setup.php in it (course, student alumno1 and the
// activity) and calls:
//
//   node tests/platforms/moodle/check.mjs --url http://localhost:8096 --cmid 2 --container h5p-moodle-moodle-1 \
//     --db h5p-moodle-db-1 --db-password … --admin-password … --shots <folder> [--games 10]
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string' }, cmid: { type: 'string' }, db: { type: 'string' }, 'admin-password': { type: 'string' },
    'db-password': { type: 'string' }, shots: { type: 'string' }, games: { type: 'string', default: '10' },
    student: { type: 'string', default: 'alumno1' }, 'student-password': { type: 'string', default: 'Alumno-1-ficticio' },
    container: { type: 'string' },
  },
});
mkdirSync(opt.shots, { recursive: true });
const games = Number(opt.games);
const items = JSON.parse(readFileSync(new URL('../../../packages/alphabet-wheel/content/es/content/content.json', import.meta.url), 'utf8')).items;
const answers = Object.fromEntries(items.map((i) => [i.letter, i.answer]));
const sql = (query) => execFileSync('docker', ['exec', opt.db, 'mariadb', '-umoodle', `-p${opt['db-password']}`, 'moodle',
  '-N', '-B', '-e', query], { encoding: 'utf8' }).trim();
const report = { moodle: '', games: [], checks: [] };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

// Muted: the games have sound, and these checks answer letter after letter.
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const login = async (user, password) => {
    await page.context().clearCookies();
    // Moodle's scripts redraw the password field when they load: typing before that loses the password.
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
  /**
   * Waits until the two nested frames of Moodle's player (Moodle's iframe and H5P's) have grown to the game's height,
   * with nothing cut off at the bottom. Returns the time it took, or null if they never did.
   */
  const fits = async (ms = 5000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const outer = await page.locator('iframe.h5p-player').boundingBox();
      const inner = await page.frameLocator('iframe.h5p-player').locator('iframe.h5p-iframe').boundingBox();
      const needed = await game().locator('.aw').evaluate((el) => el.getBoundingClientRect().height);
      if (outer && inner && inner.height + 1 >= needed && outer.height + 1 >= inner.height) {
        return Date.now() - started;
      }
      await page.waitForTimeout(100);
    }
    return null;
  };
  /** Answers `wrong` letters wrong (the first ones) and the rest right; returns when the results show. */
  const play = async (wrong) => {
    let n = 0;
    for (let turn = 0; turn < 60 && await game().locator('.aw-results').isHidden(); turn++) {
      const l = await letter();
      await game().locator('.aw-input').fill(n++ < wrong ? 'zzz' : answers[l]);
      await game().locator('.aw-input').press('Enter');
    }
    await game().locator('.aw-cheer-title').waitFor();
  };
  const attempts = () => sql(`SELECT a.attempt, a.rawscore, a.maxscore, a.completion FROM mdl_h5pactivity_attempts a
    JOIN mdl_user u ON u.id = a.userid WHERE u.username = '${opt.student}' ORDER BY a.attempt`)
    .split('\n').filter(Boolean).map((line) => line.split('\t').map(Number));

  await login(opt.student, opt['student-password']);
  report.moodle = sql("SELECT value FROM mdl_config WHERE name = 'release'");
  console.log(`Moodle ${report.moodle}`);
  check('the student starts with no attempts', attempts().length === 0);


  // Ten games, each one with a different number of wrong letters: 27, 26 … right.
  for (let g = 0; g < games; g++) {
    await openActivity();
    if (g === 0) {
      // A first load, with an empty browser cache: the frames take the height of the start screen, then of the game.
      const introFit = await fits();
      check('first load: the frames fit the start screen', introFit !== null, introFit === null ? 'cut off' : `${introFit} ms`);
    }
    await game().locator('.aw-intro button').click();
    if (g === 0) {
      const gameFit = await fits();
      check('after «Start», the frames grow to the whole game', gameFit !== null, gameFit === null ? 'cut off' : `${gameFit} ms`);
      const pass = await game().locator('.aw-row button.aw-secondary').boundingBox();
      const frame = await page.locator('iframe.h5p-player').boundingBox();
      check('the «Pass» button is inside the visible frame', pass && frame && pass.y + pass.height <= frame.y + frame.height);
      await page.screenshot({ path: `${opt.shots}/moodle-game.png` });
    }
    await play(g);
    const expected = items.length - g;
    // Moodle stores the attempt from the web service call that follows the result.
    await expect(() => attempts().length === g + 1, 15_000);
    if (g === 0) {
      await fits();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${opt.shots}/moodle-cheer.png` });
    }
    const [attempt, raw, max] = attempts()[g];
    report.games.push({ game: g + 1, attempt, raw, max, expected });
  }
  const all = attempts();
  check(`${games} games give ${games} attempts`, all.length === games, `${all.length} attempts`);
  check('each attempt has score = letters right, out of the number of letters',
    report.games.every((r) => r.raw === r.expected && r.max === items.length),
    report.games.map((r) => `${r.raw}/${r.max}`).join(' '));
  const last = report.games.at(-1);
  const grade = Number(sql(`SELECT g.finalgrade FROM mdl_grade_grades g JOIN mdl_grade_items i ON i.id = g.itemid
    JOIN mdl_user u ON u.id = g.userid WHERE i.itemmodule = 'h5pactivity' AND u.username = '${opt.student}'`));
  const expectedGrade = Math.round((10 * last.expected / items.length) * 100000) / 100000;
  check('the grade is max grade × right / letters, from the last attempt',
    Math.abs(grade - expectedGrade) < 0.001, `${grade} (expected ${expectedGrade.toFixed(5)})`);

  // A reload in the middle of a game takes it up again, paused (the example has a time limit).
  await openActivity();
  await game().locator('.aw-intro button').click();
  for (let i = 0; i < 3; i++) {
    await game().locator('.aw-input').fill(answers[await letter()]);
    await game().locator('.aw-input').press('Enter');
  }
  await game().locator('.aw-row button.aw-secondary').click();
  const before = await letter();
  await page.waitForTimeout(4500);
  await openActivity();
  const resumed = await game().locator('.aw-paused').isVisible();
  const okLetters = await game().locator('.aw-letter.aw-ok').count();
  const passed = await game().locator('.aw-letter.aw-passed').count();
  check('a reload in the middle takes the game up again, paused', resumed && okLetters === 3 && passed === 1,
    `paused: ${resumed}, right: ${okLetters}, passed: ${passed}`);
  await game().locator('.aw-pause').click();
  check('it goes on from the same letter', (await letter()) === before, before);
  await fits();
  await page.screenshot({ path: `${opt.shots}/moodle-resumed.png` });
  check('the resumed game made no attempt of its own', attempts().length === games);

  // After the end, a reload starts a new game: no stale state and no extra attempt.
  await play(0);
  await expect(() => attempts().length === games + 1, 15_000);
  await page.waitForTimeout(4000);
  await openActivity();
  check('after the end, a reload starts a new game', await game().locator('.aw-intro').isVisible());
  check('and makes no extra attempt', attempts().length === games + 1, `${attempts().length} attempts`);

  // What the teacher sees: the attempts report of the student, with the course index closed so it does not cover
  // the full-page screenshots.
  await login('admin', opt['admin-password']);
  const closeDrawer = async () => {
    const close = page.locator('.drawer.show [data-action="closedrawer"]').first();
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await page.waitForTimeout(400);
    }
  };
  const instance = sql(`SELECT instance FROM mdl_course_modules WHERE id = ${opt.cmid}`);
  const userid = sql(`SELECT id FROM mdl_user WHERE username = '${opt.student}'`);
  await page.goto(`${opt.url}/mod/h5pactivity/report.php?a=${instance}&userid=${userid}`);
  await closeDrawer();
  await page.screenshot({ path: `${opt.shots}/moodle-attempts.png`, fullPage: true });
  const firstAttempt = sql(`SELECT id FROM mdl_h5pactivity_attempts WHERE userid = ${userid} ORDER BY attempt DESC LIMIT 1 OFFSET 1`);
  await page.goto(`${opt.url}/mod/h5pactivity/report.php?a=${instance}&attemptid=${firstAttempt}`);
  await closeDrawer();
  // The heading of the results is the description of the statement: the title of the wheel, not every clue.
  const title = JSON.parse(readFileSync(new URL('../../../packages/alphabet-wheel/content/es/h5p.json', import.meta.url), 'utf8')).title;
  const heading = page.getByRole('heading', { name: title, exact: true });
  check('the report heads the attempt with the title of the wheel, not with every clue', await heading.count() === 1, title);
  const outcome = sql(`SELECT success FROM mdl_h5pactivity_attempts WHERE id = ${firstAttempt}`);
  check('no pass or fail for a game, only the score', outcome === 'NULL', `success: ${outcome}`);
  await page.screenshot({ path: `${opt.shots}/moodle-attempt-detail.png`, fullPage: true });
  const results = Number(sql(`SELECT COUNT(*) FROM mdl_h5pactivity_attempts_results WHERE attemptid = ${firstAttempt}
    AND interactiontype = 'fill-in'`));
  check('each attempt keeps one fill-in result with every letter', results === 1, `${results} result rows`);
} finally {
  await browser.close();
}

const failed = report.checks.filter((c) => !c.ok).length;
console.log(JSON.stringify({ moodle: report.moodle, games: report.games, failed }));
process.exit(failed ? 1 : 0);

/** Waits until `condition` is true or the time runs out (it is checked again at the end either way). */
async function expect(condition, ms) {
  const end = Date.now() + ms;
  while (!condition() && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 500));
  }
}
