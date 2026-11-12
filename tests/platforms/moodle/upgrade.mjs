// A wheel made with the previous release, after the new one is installed on the site: Moodle keeps one copy of the
// library, now the new one, and the old activity plays with it. This is what a hosted site and any teacher who uploads
// a new package get.
//
// Through run.sh with H5P_PREVIOUS=<previous package.h5p>, which installs it first, makes an activity with it and then
// installs the new one:
//
//   node tests/platforms/moodle/upgrade.mjs --url http://localhost:8096 --cmid 3 --db h5p-moodle-db-1 --db-password …
//     --version 1.0.4
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string' }, cmid: { type: 'string' }, db: { type: 'string' }, 'db-password': { type: 'string' },
    version: { type: 'string' }, student: { type: 'string', default: 'alumno1' },
    'student-password': { type: 'string', default: 'Alumno-1-ficticio' },
  },
});
const sql = (query) => execFileSync('docker', ['exec', opt.db, 'mariadb', '-umoodle', `-p${opt['db-password']}`, 'moodle',
  '-N', '-B', '-e', query], { encoding: 'utf8' }).trim();
const items = JSON.parse(readFileSync(new URL('../../../packages/alphabet-wheel/content/es/content/content.json', import.meta.url), 'utf8')).items;
let failed = 0;
const check = (name, ok, detail) => {
  failed += ok ? 0 : 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

const rows = sql(`SELECT CONCAT(majorversion, '.', minorversion, '.', patchversion), semantics LIKE '%imageAlt%'
  FROM mdl_h5p_libraries WHERE machinename = 'H5P.AlphabetWheel'`).split('\n').filter(Boolean).map((r) => r.split('\t'));
check('one copy of the library, the new one, with the new fields', rows.length === 1 && rows[0][0] === opt.version && rows[0][1] === '1',
  rows.map((r) => r.join(' ')).join(', '));

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${opt.url}/login/index.php`, { waitUntil: 'networkidle' });
  await page.fill('#username', opt.student);
  await page.fill('#password', opt['student-password']);
  await page.click('#loginbtn');
  await page.waitForLoadState('networkidle');
  await page.goto(`${opt.url}/mod/h5pactivity/view.php?id=${opt.cmid}`);
  const game = page.frameLocator('iframe.h5p-player').frameLocator('iframe.h5p-iframe');
  await game.locator('.aw').waitFor({ timeout: 60_000 });
  // The middle of the wheel has room for a picture only from the new version on.
  check('the old activity runs the new code', await game.locator('.aw-hub-picture').count() === 1);
  await game.locator('.aw-intro button').click();
  const first = items[0];
  await game.locator('.aw-input').fill(first.answer);
  await game.locator('.aw-input').press('Enter');
  await game.locator('.aw-letter.aw-ok').first().waitFor({ timeout: 10_000 });
  check('and it plays: the first letter is right', await game.locator('.aw-letter.aw-ok').count() === 1);
  check('without errors on the page', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
