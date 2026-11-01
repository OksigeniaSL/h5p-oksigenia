// Plays the Number Line in a real WordPress with the official H5P plugin, on the site run.sh builds for the Alphabet Wheel.
//
//   node tests/platforms/wordpress/number-line.mjs --url http://localhost:8098 --container … --db … --db-password … \
//     --admin-password … --student-password … --package <file.h5p> --shots <folder>
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string' }, container: { type: 'string' }, db: { type: 'string' }, 'db-password': { type: 'string' },
    'admin-password': { type: 'string' }, 'student-password': { type: 'string' }, package: { type: 'string' },
    shots: { type: 'string' },
  },
});
mkdirSync(opt.shots, { recursive: true });
const sql = (query) => execFileSync('docker', ['exec', opt.db, 'mariadb', '-uwordpress', `-p${opt['db-password']}`, 'wordpress',
  '-N', '-B', '-e', query], { encoding: 'utf8' }).trim();
const wp = (...args) => execFileSync('docker', ['exec', '-u', 'www-data', opt.container, 'wp', ...args], { encoding: 'utf8' }).trim();
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
  const login = async (user, password) => {
    await page.context().clearCookies();
    await page.goto(`${opt.url}/wp-login.php`, { waitUntil: 'networkidle' });
    await page.fill('#user_login', user);
    await page.fill('#user_pass', password);
    await page.click('#wp-submit');
    await page.waitForLoadState('networkidle');
  };
  await login('admin', opt['admin-password']);
  await page.goto(`${opt.url}/wp-admin/admin.php?page=h5p_new`, { waitUntil: 'networkidle' });
  await page.check('input[name="action"][value="upload"]');
  await page.setInputFiles('#h5p-file', opt.package);
  await page.click('input[name="submit-button"]');
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);
  const library = sql("SELECT CONCAT(major_version, '.', minor_version, '.', patch_version) FROM wp_h5p_libraries WHERE name = 'H5P.NumberLine'");
  check('uploading the example installs the game', library !== '', library);
  const content = sql('SELECT id FROM wp_h5p_contents ORDER BY id DESC LIMIT 1');
  const pageId = wp('post', 'create', '--post_type=page', '--post_status=publish', '--post_title=Recta numérica',
    `--post_content=[h5p id="${content}"]`, '--porcelain');

  await login('alumno1', opt['student-password']);
  const game = page.frameLocator('iframe.h5p-iframe');
  const open = async () => {
    await page.goto(`${opt.url}/?page_id=${pageId}`);
    await game.locator('.nl').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
  };
  const current = () => game.locator('.nl').evaluate(() => H5P.instances[0].game.current);
  const playRight = async () => {
    const r = await current();
    await game.locator('.nl-count', { hasText: new RegExp(`^${r.times}$`) }).click();
    await game.locator('.nl-next').click();
  };
  await open();
  // A game at rest asks for nothing: no request keeps going in the background.
  const requests = [];
  const note = (request) => requests.push(request.url());
  page.on('request', note);
  await page.waitForTimeout(3000);
  page.off('request', note);
  check('at rest, the game makes no requests', requests.length === 0, requests.slice(0, 3).join(' '));
  await game.locator('.nl-choice-tables').click();
  for (let i = 0; i < 6; i++) {
    await playRight();
  }
  await game.locator('.nl-cheer-title').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${opt.shots}/wordpress-nl-end.png` });
  const row = sql(`SELECT CONCAT(score, '/', max_score) FROM wp_h5p_results WHERE content_id = ${content}`);
  check('a game leaves its score in the results', row === '6/6', row);
  await page.waitForTimeout(3000);
  await open();
  await game.locator('.nl-choice-tables').click();
  await playRight();
  const asked = await current();
  await page.waitForTimeout(1500);
  await open();
  const same = await current().catch(() => null);
  check('a reload in the middle takes the game up again', !!same && same.target === asked.target && same.size === asked.size);
} finally {
  await browser.close();
}
const failed = checks.filter((ok) => !ok).length;
console.log(failed ? `number line: ${failed} checks failed` : 'number line: all checks passed');
process.exit(failed ? 1 : 0);
