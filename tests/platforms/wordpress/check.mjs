// Plays the Alphabet Wheel in a real WordPress with the official H5P plugin as a fictitious student: the admin uploads
// the example package (which installs the game), then each game leaves its score in the plugin's results; a reload
// in the middle takes the game up again, and a reload after the end starts a new one. Leaves screenshots.
//
// Usually through run.sh, which builds the throwaway site and calls:
//
//   node tests/platforms/wordpress/check.mjs --url http://localhost:8098 --container … --db … --db-password … \
//     --admin-password … --student-password … --package <file.h5p> --shots <folder>
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string' }, container: { type: 'string' }, db: { type: 'string' }, 'db-password': { type: 'string' },
    'admin-password': { type: 'string' }, 'student-password': { type: 'string' }, package: { type: 'string' },
    shots: { type: 'string' }, games: { type: 'string', default: '3' },
  },
});
mkdirSync(opt.shots, { recursive: true });
const items = JSON.parse(readFileSync(new URL('../../../packages/alphabet-wheel/content/es/content/content.json', import.meta.url), 'utf8')).items;
const answers = Object.fromEntries(items.map((i) => [i.letter, i.answer]));
const sql = (query) => execFileSync('docker', ['exec', opt.db, 'mariadb', '-uwordpress', `-p${opt['db-password']}`, 'wordpress',
  '-N', '-B', '-e', query], { encoding: 'utf8' }).trim();
const wp = (...args) => execFileSync('docker', ['exec', '-u', 'www-data', opt.container, 'wp', ...args], { encoding: 'utf8' }).trim();
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};
const until = async (condition, ms) => {
  const end = Date.now() + ms;
  while (!condition() && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 500));
  }
};

console.log(`WordPress ${wp('core', 'version')}, H5P plugin ${wp('plugin', 'get', 'h5p', '--field=version')}`);
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const login = async (user, password) => {
    await page.context().clearCookies();
    await page.goto(`${opt.url}/wp-login.php`, { waitUntil: 'networkidle' });
    await page.fill('#user_login', user);
    await page.fill('#user_pass', password);
    await page.click('#wp-submit');
    await page.waitForLoadState('networkidle');
  };

  // The admin uploads the example: that installs the game, as on any site.
  await login('admin', opt['admin-password']);
  await page.goto(`${opt.url}/wp-admin/admin.php?page=h5p_new`, { waitUntil: 'networkidle' });
  await page.check('input[name="action"][value="upload"]');
  await page.setInputFiles('#h5p-file', opt.package);
  await page.click('input[name="submit-button"]');
  await page.waitForLoadState('networkidle');
  const library = sql("SELECT CONCAT(major_version, '.', minor_version, '.', patch_version) FROM wp_h5p_libraries WHERE name = 'H5P.AlphabetWheel'");
  check('uploading the example installs the game', library !== '', `H5P.AlphabetWheel ${library}`);
  const content = sql('SELECT id FROM wp_h5p_contents ORDER BY id DESC LIMIT 1');
  const pageId = wp('post', 'create', '--post_type=page', '--post_status=publish', '--post_title=Rueda de letras',
    `--post_content=[h5p id="${content}"]`, '--porcelain');

  const game = () => page.frameLocator('iframe.h5p-iframe');
  const open = async () => {
    await page.goto(`${opt.url}/?page_id=${pageId}`);
    await game().locator('.aw').waitFor({ timeout: 60_000 });
  };
  const letter = () => game().locator('.aw-letter[aria-current] .aw-letter-text').textContent();
  const play = async (wrong) => {
    let n = 0;
    for (let turn = 0; turn < 60 && await game().locator('.aw-results').isHidden(); turn++) {
      const l = await letter();
      await game().locator('.aw-input').fill(n++ < wrong ? 'zzz' : answers[l]);
      await game().locator('.aw-input').press('Enter');
    }
    await game().locator('.aw-cheer-title').waitFor();
  };
  const result = () => sql(`SELECT r.score, r.max_score FROM wp_h5p_results r JOIN wp_users u ON u.ID = r.user_id
    WHERE u.user_login = 'alumno1' AND r.content_id = ${content}`).split('\n').filter(Boolean).map((l) => l.split('\t').map(Number));

  await login('alumno1', opt['student-password']);
  const games = Number(opt.games);
  const scores = [];
  for (let g = 0; g < games; g++) {
    await open();
    await game().locator('.aw-intro button').click();
    if (g === 0) {
      await page.screenshot({ path: `${opt.shots}/wordpress-game.png` });
    }
    await play(g);
    const expected = items.length - g;
    await until(() => (result()[0] || [])[0] === expected, 15_000);
    scores.push(result()[0] || []);
    if (g === 0) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${opt.shots}/wordpress-cheer.png` });
    }
  }
  check('each game leaves its score in the results, out of the number of letters',
    scores.every(([score, max], g) => score === items.length - g && max === items.length),
    scores.map(([s, m]) => `${s}/${m}`).join(' '));
  check('one result row per student and content, as the plugin keeps it', result().length === 1);

  await open();
  await game().locator('.aw-intro button').click();
  for (let i = 0; i < 3; i++) {
    await game().locator('.aw-input').fill(answers[await letter()]);
    await game().locator('.aw-input').press('Enter');
  }
  await game().locator('.aw-row button.aw-secondary').click();
  const before = await letter();
  await page.waitForTimeout(4500);
  await open();
  const paused = await game().locator('.aw-paused').isVisible();
  const right = await game().locator('.aw-letter.aw-ok').count();
  const passed = await game().locator('.aw-letter.aw-passed').count();
  check('a reload in the middle takes the game up again, paused', paused && right === 3 && passed === 1,
    `paused: ${paused}, right: ${right}, passed: ${passed}`);
  await game().locator('.aw-pause').click();
  check('it goes on from the same letter', (await letter()) === before, before);
  await page.screenshot({ path: `${opt.shots}/wordpress-resumed.png` });

  await play(0);
  await page.waitForTimeout(4000);
  await open();
  check('after the end, a reload starts a new game', await game().locator('.aw-intro').isVisible());

  await login('admin', opt['admin-password']);
  await page.goto(`${opt.url}/wp-admin/admin.php?page=h5p&task=results&id=${content}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${opt.shots}/wordpress-results.png`, fullPage: true });
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `${failed} checks failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
