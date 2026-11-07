// Plays the Number Line in a real Moodle as an example student: one attempt with its score, the grade, a reload in the
// middle, the next step in view and the dark mode. Usually through run.sh, on the site it builds for the Alphabet Wheel.
//
//   node tests/platforms/moodle/number-line.mjs --url http://localhost:8096 --cmid 3 --db h5p-moodle-db-1 \
//     --db-password … --shots <folder>
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { boardChecks } from './boards.mjs';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string' }, cmid: { type: 'string' }, db: { type: 'string' }, 'db-password': { type: 'string' },
    shots: { type: 'string' }, student: { type: 'string', default: 'alumno1' },
    'student-password': { type: 'string', default: 'Alumno-1-ficticio' },
  },
});
mkdirSync(opt.shots, { recursive: true });
const sql = (query) => execFileSync('docker', ['exec', opt.db, 'mariadb', '-umoodle', `-p${opt['db-password']}`, 'moodle',
  '-N', '-B', '-e', query], { encoding: 'utf8' }).trim();
const checks = [];
const check = (name, ok, detail) => {
  checks.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} number line: ${name}${detail ? ` · ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true, args: ['--mute-audio'] });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('h5p-oksigenia-muted', '1'));
  const page = await context.newPage();
  await page.goto(`${opt.url}/login/index.php`, { waitUntil: 'networkidle' });
  await page.fill('#username', opt.student);
  await page.fill('#password', opt['student-password']);
  await page.click('#loginbtn');
  await page.waitForLoadState('networkidle');

  const game = page.frameLocator('iframe.h5p-player').frameLocator('iframe.h5p-iframe');
  const open = async () => {
    await page.goto(`${opt.url}/mod/h5pactivity/view.php?id=${opt.cmid}`);
    await game.locator('.nl').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
  };
  const instance = sql(`SELECT instance FROM mdl_course_modules WHERE id = ${opt.cmid}`);
  const attempts = () => sql(`SELECT a.rawscore, a.maxscore FROM mdl_h5pactivity_attempts a JOIN mdl_user u ON u.id = a.userid
    WHERE u.username = '${opt.student}' AND a.h5pactivityid = ${instance} ORDER BY a.attempt`)
    .split('\n').filter(Boolean).map((line) => line.split('\t').map(Number));
  const current = () => game.locator('.nl').evaluate(() => H5P.instances[0].game.current);
  const playRight = async () => {
    const r = await current();
    await game.locator('.nl-count', { hasText: new RegExp(`^${r.times}$`) }).click();
    await game.locator('.nl-next').click();
  };

  await open();
  check('the student starts with no attempts', attempts().length === 0);
  await game.locator('.nl-choice-tables').click();
  await page.screenshot({ path: `${opt.shots}/moodle-nl-game.png` });
  for (let i = 0; i < 6; i++) {
    await playRight();
  }
  await game.locator('.nl-cheer-title').waitFor();
  await page.screenshot({ path: `${opt.shots}/moodle-nl-end.png` });
  for (let i = 0; i < 30 && attempts().length === 0; i++) {
    await page.waitForTimeout(500);
  }
  check('a game gives one attempt, with its score', attempts().length === 1 && attempts()[0][0] === 6 && attempts()[0][1] === 6,
    JSON.stringify(attempts()));
  const grade = Number(sql(`SELECT g.finalgrade FROM mdl_grade_grades g JOIN mdl_grade_items i ON i.id = g.itemid
    JOIN mdl_user u ON u.id = g.userid WHERE i.itemmodule = 'h5pactivity' AND i.iteminstance = ${instance}
    AND u.username = '${opt.student}'`));
  check('the grade reaches the gradebook', Math.abs(grade - 10) < 0.001, String(grade));

  // After the end, a reload starts a new game; a reload in the middle takes it up again.
  await page.waitForTimeout(3000);
  await open();
  check('after the end, a reload starts a new game', await game.locator('.nl-choice-tables').isVisible());
  await game.locator('.nl-choice-tables').click();
  await playRight();
  const asked = await current();
  // H5P saves the state three seconds after the game says it has progressed.
  await page.waitForTimeout(4500);
  await open();
  const round = await game.locator('.nl-round').textContent().catch(() => '');
  const same = await current().catch(() => null);
  check('a reload in the middle takes the game up again, with the same numbers',
    /2/.test(round) && same && same.target === asked.target && same.size === asked.size, round);

  // The next step in view without scrolling by hand, clear of Moodle's fixed bars.
  const inView = async (locator, height) => {
    let box = null;
    for (let i = 0; i < 25; i++) {
      box = await locator.boundingBox();
      if (box && box.y >= 60 && box.y + box.height <= height - 65) {
        return { ok: true, where: `y ${Math.round(box.y)}-${Math.round(box.y + box.height)}` };
      }
      await page.waitForTimeout(100);
    }
    return { ok: false, where: box ? `y ${Math.round(box.y)}-${Math.round(box.y + box.height)}` : 'not shown' };
  };
  for (const [width, height] of [[1366, 768], [1100, 540], [1024, 768], [800, 600], [360, 640]]) {
    await page.setViewportSize({ width, height });
    await open();
    const start = game.locator('.nl-choice-tables');
    if (await start.isVisible()) {
      await start.click();
    }
    // Reloaded after a round that was over, only «Next» is left.
    if (await game.locator('.nl-next').isVisible()) {
      const left = await inView(game.locator('.nl-next'), height);
      check(`at ${width}×${height}, a game taken up after a round has «Next» in view`, left.ok, left.where);
      await game.locator('.nl-next').click();
    }
    const challenge = await inView(game.locator('.nl-challenge'), height);
    check(`at ${width}×${height}, the round comes into view`, challenge.ok, challenge.where);
    const buttons = await inView(game.locator('.nl-controls').first(), height);
    check(`at ${width}×${height}, with its buttons`, buttons.ok, buttons.where);
    const r = await current();
    await game.locator('.nl-count', { hasText: new RegExp(`^${r.times}$`) }).click();
    const next = await inView(game.locator('.nl-next'), height);
    check(`at ${width}×${height}, «Next» is in view after the round`, next.ok, next.where);
    await page.screenshot({ path: `${opt.shots}/moodle-nl-${width}x${height}.png` });
    await page.waitForTimeout(1500);
  }
  await page.setViewportSize({ width: 1200, height: 1000 });

  await boardChecks({
    page, game, root: '.nl', open, check, shots: opt.shots, name: 'nl',
    // Whatever the earlier checks left (a round over, the last one, the results): on to a round in play.
    start: async () => {
      for (let i = 0; i < 4; i++) {
        if (await game.locator('.nl-results .nl-other').isVisible()) {
          await game.locator('.nl-results .nl-other').click();
        } else if (await game.locator('.nl-choice-add20').isVisible()) {
          await game.locator('.nl-choice-add20').click();
        } else if (await game.locator('.nl-next').isVisible()) {
          await game.locator('.nl-next').click();
        } else {
          break;
        }
        await page.waitForTimeout(600);
      }
    },
    answer: async () => {
      const r = await current();
      if (r.mode === 'exact') {
        await game.locator('.nl-count').first().click();
      } else if (r.mode === 'place') {
        await game.locator('.nl').evaluate((node, value) => H5P.instances[0].mark(value), r.value);
        await game.locator('.nl-here').click();
      } else {
        for (let i = 0; i < 40 && await game.locator('.nl-next').isHidden() && !await game.locator('.nl-option').count(); i++) {
          await game.locator('.nl-controls:not(.nl-extra) button:not(:disabled)').first().click();
          // A press while the piece is in the air counts for nothing.
          await page.waitForTimeout(250);
        }
        if (await game.locator('.nl-option').count()) {
          await game.locator('.nl-option').first().click();
        } else if (await game.locator('.nl-next').isHidden() && await game.locator('.nl-together').isVisible()) {
          // Always pressing the first button can go round and round (6 → 15 with jumps of 2 ends up between 18 and 20):
          // the game does it together, as a player stuck would ask it to.
          await game.locator('.nl-together').click();
          await game.locator('.nl-next').waitFor({ state: 'visible', timeout: 15000 });
        }
      }
    },
    leave: async () => {
      await game.locator('.nl-next').click();
      await page.waitForTimeout(4500);
    },
  });

  // Run after the Alphabet Wheel's check, which leaves Moodle 5 in dark mode.
  await open();
  const mode = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  if (mode) {
    const background = (locator) => locator.evaluate((node) => getComputedStyle(node).backgroundColor);
    const inner = await background(game.locator('.nl'));
    const outer = await background(page.frameLocator('iframe.h5p-player').locator('body'));
    const dark = 'rgb(29, 33, 37)';
    check(`with Moodle in ${mode} mode, the game and the frame follow`, mode === 'dark' ? inner === dark && outer === dark : inner !== dark,
      `game ${inner}, frame ${outer}`);
    await page.screenshot({ path: `${opt.shots}/moodle-nl-dark.png` });
  }
} finally {
  await browser.close();
}
const failed = checks.filter((ok) => !ok).length;
console.log(failed ? `number line: ${failed} checks failed` : 'number line: all checks passed');
process.exit(failed ? 1 : 0);
