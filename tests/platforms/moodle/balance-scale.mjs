// Plays the Balance Scale in a real Moodle as an example student: one attempt with its score and one result per game
// with every round, the grade, a reload in the middle with what was already on the scale, the next step in view, the
// classroom boards and the dark mode. Usually through run.sh, on the site it builds for the Alphabet Wheel.
//
//   node tests/platforms/moodle/balance-scale.mjs --url http://localhost:8096 --cmid 4 --db h5p-moodle-db-1 \
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
  console.log(`${ok ? 'ok  ' : 'FAIL'} balance scale: ${name}${detail ? ` · ${detail}` : ''}`);
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
    await game.locator('.bs').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
  };
  const instance = sql(`SELECT instance FROM mdl_course_modules WHERE id = ${opt.cmid}`);
  const attempts = () => sql(`SELECT a.id, a.rawscore, a.maxscore FROM mdl_h5pactivity_attempts a JOIN mdl_user u ON u.id = a.userid
    WHERE u.username = '${opt.student}' AND a.h5pactivityid = ${instance} ORDER BY a.attempt`)
    .split('\n').filter(Boolean).map((line) => line.split('\t').map(Number));
  const current = () => game.locator('.bs').evaluate(() => {
    const g = H5P.instances[0].game;
    const r = g.current;
    return { number: g.number, target: r.target, tray: r.tray, left: r.left, right: r.right };
  });
  /** The weights of the tray that balance the round, the fewest. */
  const rightWeights = async () => {
    const r = await current();
    const weigh = (list) => list.reduce((s, t) => s + t.v, 0);
    let need = weigh(r[r.target === 'left' ? 'right' : 'left']) - weigh(r[r.target].filter((t) => t.fixed));
    const out = [];
    for (const w of [...r.tray].sort((x, y) => y - x)) {
      while (need >= w) {
        out.push(w);
        need -= w;
      }
    }
    return out;
  };
  const wrongWeight = async () => {
    const r = await current();
    const weigh = (list) => list.reduce((s, t) => s + t.v, 0);
    const need = weigh(r[r.target === 'left' ? 'right' : 'left']) - weigh(r[r.target].filter((t) => t.fixed));
    return r.tray.find((v) => v !== need);
  };
  const put = (value) => game.locator(`.bs-tray .bs-weight[data-value="${value}"]`).first().click();
  /** One round balanced without taking anything back, and on with «Next». */
  const playRight = async () => {
    // A person does not tap the instant a round appears.
    await page.waitForTimeout(650);
    for (const value of await rightWeights()) {
      await put(value);
    }
    await game.locator('.bs-next').waitFor();
    await page.waitForTimeout(650);
    await game.locator('.bs-next').click();
  };

  await open();
  check('the student starts with no attempts', attempts().length === 0);
  await game.locator('.bs-choice-equalities').click();
  await game.locator('.bs-scene.bs-painted canvas').waitFor();
  await page.screenshot({ path: `${opt.shots}/moodle-bs-game.png` });
  for (let i = 0; i < 6; i++) {
    await playRight();
  }
  await game.locator('.bs-cheer-title').waitFor();
  await page.screenshot({ path: `${opt.shots}/moodle-bs-end.png` });
  for (let i = 0; i < 30 && attempts().length === 0; i++) {
    await page.waitForTimeout(500);
  }
  const done = attempts();
  check('a game gives one attempt, with its score', done.length === 1 && done[0][1] === 12 && done[0][2] === 12,
    JSON.stringify(done.map(([, raw, max]) => [raw, max])));
  const grade = Number(sql(`SELECT g.finalgrade FROM mdl_grade_grades g JOIN mdl_grade_items i ON i.id = g.itemid
    JOIN mdl_user u ON u.id = g.userid WHERE i.itemmodule = 'h5pactivity' AND i.iteminstance = ${instance}
    AND u.username = '${opt.student}'`));
  check('the grade reaches the gradebook', Math.abs(grade - 10) < 0.001, String(grade));
  if (done.length) {
    const outcome = sql(`SELECT IFNULL(success, 'NULL') FROM mdl_h5pactivity_attempts WHERE id = ${done[0][0]}`);
    check('no pass or fail for a game, only the score', outcome === 'NULL', `success: ${outcome}`);
    const rows = sql(`SELECT response FROM mdl_h5pactivity_attempts_results WHERE attemptid = ${done[0][0]}
      AND interactiontype = 'fill-in'`).split('\n').filter(Boolean);
    check('the attempt keeps one fill-in result with every round', rows.length === 1 && rows[0].split('[,]').length === 6,
      `${rows.length} rows, ${rows[0] ? rows[0].split('[,]').length : 0} rounds`);
    await page.goto(`${opt.url}/mod/h5pactivity/report.php?a=${instance}&attemptid=${done[0][0]}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${opt.shots}/moodle-bs-attempt.png`, fullPage: true });
  }

  // After the end, a reload starts a new game; a reload in the middle takes it up again, with what is on the scale.
  await page.waitForTimeout(3000);
  await open();
  check('after the end, a reload starts a new game', await game.locator('.bs-choice-equalities').isVisible());
  await game.locator('.bs-choice-equalities').click();
  await playRight();
  await page.waitForTimeout(650);
  await put(await wrongWeight());
  const asked = await current();
  // H5P saves the state three seconds after the game says it has progressed.
  await page.waitForTimeout(4500);
  await open();
  const same = await current().catch(() => null);
  const mine = await game.locator('.bs-scene .bs-mine').count();
  check('a reload in the middle takes the game up again, with the same round and the weight put on it',
    !!same && same.number === asked.number && JSON.stringify(same.left.map((t) => t.v)) === JSON.stringify(asked.left.map((t) => t.v))
      && JSON.stringify(same.right.map((t) => t.v)) === JSON.stringify(asked.right.map((t) => t.v)) && mine === 1,
    same ? `round ${same.number}, ${mine} weight of the player` : 'no game');

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
    const choice = game.locator('.bs-choice-equalities');
    if (await choice.isVisible()) {
      await choice.click();
    }
    if (await game.locator('.bs-next').isVisible()) {
      const left = await inView(game.locator('.bs-next'), height);
      check(`at ${width}×${height}, a game taken up after a round has «Next» in view`, left.ok, left.where);
      await game.locator('.bs-next').click();
    }
    await page.waitForTimeout(650);
    const scale = await inView(game.locator('.bs-equality'), height);
    check(`at ${width}×${height}, the scale and its equality come into view`, scale.ok, scale.where);
    const tray = await inView(game.locator('.bs-tray .bs-weight').first(), height);
    check(`at ${width}×${height}, with the weights to put`, tray.ok, tray.where);
    if (await game.locator('.bs-scene .bs-mine').count()) {
      await game.locator('.bs-empty').click();
    }
    for (const value of await rightWeights()) {
      await put(value);
    }
    const next = await inView(game.locator('.bs-next'), height);
    check(`at ${width}×${height}, «Next» is in view after the round`, next.ok, next.where);
    await page.screenshot({ path: `${opt.shots}/moodle-bs-${width}x${height}.png` });
    await page.waitForTimeout(1500);
  }
  await page.setViewportSize({ width: 1200, height: 1000 });

  await boardChecks({
    page, game, root: '.bs', open, check, shots: opt.shots, name: 'bs',
    // Whatever the earlier checks left (a round over, the last one, the results): on to a round in play.
    start: async () => {
      for (let i = 0; i < 4; i++) {
        if (await game.locator('.bs-other').isVisible()) {
          await game.locator('.bs-other').click();
        } else if (await game.locator('.bs-choice-equalities').isVisible()) {
          await game.locator('.bs-choice-equalities').click();
        } else if (await game.locator('.bs-next').isVisible()) {
          await game.locator('.bs-next').click();
        } else {
          break;
        }
        await page.waitForTimeout(650);
      }
      if (await game.locator('.bs-scene .bs-mine').count()) {
        await game.locator('.bs-empty').click();
      }
    },
    answer: async () => {
      for (const value of await rightWeights()) {
        await put(value);
      }
      await game.locator('.bs-next').waitFor();
    },
    leave: async () => {
      await game.locator('.bs-next').click();
      await page.waitForTimeout(4500);
    },
  });

  // Run after the Alphabet Wheel's check, which leaves Moodle 5 in dark mode.
  await open();
  const mode = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  if (mode) {
    const background = (locator) => locator.evaluate((node) => getComputedStyle(node).backgroundColor);
    const inner = await background(game.locator('.bs'));
    const outer = await background(page.frameLocator('iframe.h5p-player').locator('body'));
    const dark = 'rgb(29, 33, 37)';
    check(`with Moodle in ${mode} mode, the game and the frame follow`, mode === 'dark' ? inner === dark && outer === dark : inner !== dark,
      `game ${inner}, frame ${outer}`);
    if (await game.locator('.bs-choice-equalities').isVisible()) {
      await game.locator('.bs-choice-equalities').click();
    } else if (await game.locator('.bs-next').isVisible()) {
      await game.locator('.bs-next').click();
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${opt.shots}/moodle-bs-dark.png` });
  }
} finally {
  await browser.close();
}
const failed = checks.filter((ok) => !ok).length;
console.log(failed ? `balance scale: ${failed} checks failed` : 'balance scale: all checks passed');
process.exit(failed ? 1 : 0);
