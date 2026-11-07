// Plays the Balance Scale in a real WordPress with the official H5P plugin, on the site run.sh builds for the Alphabet
// Wheel: the upload with its pictures and recorded voice, the score in the results and a reload in the middle.
//
//   node tests/platforms/wordpress/balance-scale.mjs --url http://localhost:8098 --container … --db … --db-password … \
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
  console.log(`${ok ? 'ok  ' : 'FAIL'} balance scale: ${name}${detail ? ` · ${detail}` : ''}`);
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
  const library = sql("SELECT CONCAT(major_version, '.', minor_version, '.', patch_version) FROM wp_h5p_libraries WHERE name = 'H5P.BalanceScale'");
  check('uploading the example installs the game', library !== '', library);
  const assets = Number(execFileSync('docker', ['exec', opt.container, 'sh', '-c',
    'find /var/www/html/wp-content/uploads/h5p/libraries -path "*H5P.BalanceScale*/assets/*" -type f | wc -l'], { encoding: 'utf8' }).trim());
  check('its pictures and recorded voice are on the site', assets > 0, `${assets} files`);
  const content = sql('SELECT id FROM wp_h5p_contents ORDER BY id DESC LIMIT 1');
  const pageId = wp('post', 'create', '--post_type=page', '--post_status=publish', '--post_title=Balanza',
    `--post_content=[h5p id="${content}"]`, '--porcelain');

  await login('alumno1', opt['student-password']);
  const game = page.frameLocator('iframe.h5p-iframe');
  const open = async () => {
    await page.goto(`${opt.url}/?page_id=${pageId}`);
    await game.locator('.bs').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
  };
  const current = () => game.locator('.bs').evaluate(() => {
    const g = H5P.instances[0].game;
    return { number: g.number, target: g.current.target, tray: g.current.tray, left: g.current.left, right: g.current.right };
  });
  const need = async () => {
    const r = await current();
    const weigh = (list) => list.reduce((s, t) => s + t.v, 0);
    return { r, need: weigh(r[r.target === 'left' ? 'right' : 'left']) - weigh(r[r.target].filter((t) => t.fixed)) };
  };
  const put = (value) => game.locator(`.bs-tray .bs-weight[data-value="${value}"]`).first().click();
  const playRight = async () => {
    await page.waitForTimeout(650);
    const { r, need: n } = await need();
    let left = n;
    for (const w of [...r.tray].sort((x, y) => y - x)) {
      while (left >= w) {
        await put(w);
        left -= w;
      }
    }
    await game.locator('.bs-next').waitFor();
    await page.waitForTimeout(650);
    await game.locator('.bs-next').click();
  };
  await open();
  // A game at rest asks for nothing: no request keeps going in the background.
  const requests = [];
  const note = (request) => requests.push(request.url());
  page.on('request', note);
  await page.waitForTimeout(3000);
  page.off('request', note);
  check('at rest, the game makes no requests', requests.length === 0, requests.slice(0, 3).join(' '));
  // The painted scale loads its pictures from the library folder of the site.
  const pictures = [];
  page.on('response', (response) => {
    if (/H5P\.BalanceScale[^/]*\/assets\//.test(response.url())) {
      pictures.push(response.status());
    }
  });
  await game.locator('.bs-choice-equalities').click();
  await game.locator('.bs-scene.bs-painted canvas').waitFor();
  check('the painted scale loads its pictures from the site', pictures.length > 0 && pictures.every((s) => s === 200 || s === 304),
    `${pictures.length} pictures, ${[...new Set(pictures)].join(' ')}`);
  for (let i = 0; i < 6; i++) {
    await playRight();
  }
  await game.locator('.bs-cheer-title').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${opt.shots}/wordpress-bs-end.png` });
  const row = sql(`SELECT CONCAT(score, '/', max_score) FROM wp_h5p_results WHERE content_id = ${content}`);
  check('a game leaves its score in the results', row === '12/12', row);
  await page.waitForTimeout(3000);
  await open();
  await game.locator('.bs-choice-equalities').click();
  await playRight();
  await page.waitForTimeout(650);
  const { r, need: n } = await need();
  await put(r.tray.find((v) => v !== n));
  const asked = await current();
  // H5P saves the state three seconds after the game says it has progressed.
  await page.waitForTimeout(4500);
  await open();
  const same = await current().catch(() => null);
  const mine = await game.locator('.bs-scene .bs-mine').count();
  check('a reload in the middle takes the game up again, with the weight put on it',
    !!same && same.number === asked.number && JSON.stringify(same.left.map((t) => t.v)) === JSON.stringify(asked.left.map((t) => t.v))
      && mine === 1, same ? `round ${same.number}, ${mine} weight of the player` : 'no game');
  await page.screenshot({ path: `${opt.shots}/wordpress-bs-resumed.png` });
} finally {
  await browser.close();
}
const failed = checks.filter((ok) => !ok).length;
console.log(failed ? `balance scale: ${failed} checks failed` : 'balance scale: all checks passed');
process.exit(failed ? 1 : 0);
