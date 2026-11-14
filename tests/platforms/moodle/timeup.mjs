// The time of the Alphabet Wheel running out in a real Moodle: one attempt, not two. Before 1.0.9 the last tick of the
// clock ended the game twice and Moodle kept two attempts in the same second (seen on a phone on 14 November 2026).
// An activity made from the Spanish example with a time limit of a few seconds; the example student starts it and
// leaves it alone.
//
// Usually through run.sh:
//
//   node tests/platforms/moodle/timeup.mjs --url http://localhost:8096 --cmid 6 --db h5p-moodle-db-1 --db-password …
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string' }, cmid: { type: 'string' }, db: { type: 'string' }, 'db-password': { type: 'string' },
    student: { type: 'string', default: 'alumno1' }, 'student-password': { type: 'string', default: 'Alumno-1-ficticio' },
  },
});
const sql = (query) => execFileSync('docker', ['exec', opt.db, 'mariadb', '-umoodle', `-p${opt['db-password']}`, 'moodle',
  '-N', '-B', '-e', query], { encoding: 'utf8' }).trim();
const activity = sql(`SELECT instance FROM mdl_course_modules WHERE id = ${Number(opt.cmid)}`);
const attempts = () => Number(sql(`SELECT COUNT(*) FROM mdl_h5pactivity_attempts a JOIN mdl_user u ON u.id = a.userid
  WHERE u.username = '${opt.student}' AND a.h5pactivityid = ${activity}`));
let failed = 0;
const check = (name, ok, detail) => {
  failed += ok ? 0 : 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} time up: ${name}${detail ? ` · ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true, args: ['--mute-audio'] });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('h5p-oksigenia-muted', '1'));
  const page = await context.newPage();
  await page.goto(`${opt.url}/login/index.php`, { waitUntil: 'networkidle' });
  await page.fill('#username', opt.student);
  await page.fill('#password', opt['student-password']);
  await page.click('#loginbtn');
  await page.waitForLoadState('networkidle');
  const game = page.frameLocator('iframe.h5p-player').frameLocator('iframe.h5p-iframe');
  const before = attempts();
  await page.goto(`${opt.url}/mod/h5pactivity/view.php?id=${opt.cmid}`);
  await game.locator('.aw-intro button').click();
  // The game answers nothing: the clock runs out on its own.
  await game.locator('.aw-end-reason').waitFor({ timeout: 30_000 });
  for (let i = 0; i < 30 && attempts() === before; i++) {
    await page.waitForTimeout(500);
  }
  // Time for a second result to arrive, if one were sent.
  await page.waitForTimeout(8000);
  const made = attempts() - before;
  check('when the time runs out, Moodle keeps one attempt', made === 1, `${made} attempts`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
