// The Alphabet Wheel in the H5P engine of Lumi Desktop 1.0.3: @lumieducation/h5p-server 9.3.3 with Lumi's settings
// (core API 1.27, its file whitelists, no saved state) and the H5P core files Lumi ships. The desktop window itself is
// not opened: this checks that Lumi accepts and installs the package, refuses one that asks for core 1.28, and that
// the game plays and scores on core 1.27.
//
//   node tests/platforms/lumi/check.mjs [--shots <folder>]
//
// The core files are taken once from Lumi's repository (tag v1.0.3) into $H5P_PLATFORM_DIR/lumi-1.0.3.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import * as LumiH5P from '@lumieducation/h5p-server';
import { h5pAjaxExpressRouter } from '@lumieducation/h5p-express';
import express from 'express';
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { zip } from '../../../tools/zip.mjs';
import { packages, ROOT } from '../../../tools/packages.mjs';

const LUMI = 'v1.0.3';
const { values: opt } = parseArgs({ options: { shots: { type: 'string' } } });
const base = process.env.H5P_PLATFORM_DIR || join(homedir(), '.cache', 'h5p-oksigenia');
const shots = opt.shots || join(base, 'report-lumi');
mkdirSync(shots, { recursive: true });
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

// The H5P core files of Lumi Desktop 1.0.3, from its repository (only that folder).
const lumi = join(base, `lumi-${LUMI.slice(1)}`);
const core = join(lumi, 'assets', 'h5p', 'core');
if (!existsSync(join(core, 'js', 'h5p.js'))) {
  rmSync(lumi, { recursive: true, force: true });
  execFileSync('git', ['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', LUMI,
    'https://github.com/Lumieducation/Lumi.git', lumi]);
  execFileSync('git', ['-C', lumi, 'sparse-checkout', 'set', 'assets/h5p/core']);
}

const wheel = packages().find((p) => p.name === 'alphabet-wheel');
const packageFile = join(ROOT, 'dist', `alphabet-wheel-${wheel.version}-es.h5p`);
const work = mkdtempSync(join(tmpdir(), 'h5p-lumi-'));
const config = new LumiH5P.H5PConfig(undefined, {
  coreApiVersion: { major: 1, minor: 27 },
  h5pVersion: '1.27',
  contentUserStateSaveInterval: false,
  libraryWhitelist: 'js css',
  contentWhitelist: 'json png jpg jpeg gif bmp tif tiff svg eot ttf woff woff2 otf webm mp4 ogg mp3 m4a wav txt pdf rtf doc docx xls xlsx ppt pptx odt ods odp xml csv diff patch swf md textile vtt webvtt gltf glb',
  baseUrl: '/h5p',
});
const editor = LumiH5P.fs(config, join(work, 'libraries'), join(work, 'tmp'), join(work, 'content'));
const user = { id: '1', name: 'Lucía Pruebas', email: 'alumno1@example.org', type: 'local',
  canInstallRecommended: true, canUpdateAndInstallLibraries: true, canCreateRestricted: true };

let server;
// Muted: the games have sound, and these checks answer letter after letter.
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true, args: ['--mute-audio'] });
try {
  // The same package, asking for core 1.28: Lumi must refuse it, which proves the check below means something.
  const unzip = (file) => {
    const dir = mkdtempSync(join(work, 'unzip-'));
    execFileSync('unzip', ['-q', file, '-d', dir]);
    return dir;
  };
  const files = (dir, prefix = '') => readdirRecursive(dir).map((rel) => ({ name: prefix + rel, data: readFileSync(join(dir, rel)) }));
  const copy = unzip(packageFile);
  const newer = files(copy).map((f) => {
    if (f.name === `${wheel.folder}/library.json`) {
      const lib = JSON.parse(f.data.toString());
      lib.coreApi = { majorVersion: 1, minorVersion: 28 };
      return { name: f.name, data: Buffer.from(JSON.stringify(lib)) };
    }
    return f;
  });
  let refused = '';
  try {
    await editor.uploadPackage(zip(newer), user);
  } catch (e) {
    refused = e.errorId || (e.clientErrorId) || e.message;
    if (e.errors) {
      refused = e.errors.map((x) => x.errorId).join(', ');
    }
  }
  check('a copy that asks for core 1.28 is refused, as Lumi refuses the new official types', /api-version/.test(refused), refused);

  const { metadata, parameters } = await editor.uploadPackage(readFileSync(packageFile), user);
  check('the example package is accepted and installs the game on core 1.27', metadata.mainLibrary === 'H5P.AlphabetWheel',
    `${metadata.title}`);
  const contentId = await editor.saveOrUpdateContent(undefined, parameters, metadata, `H5P.AlphabetWheel ${wheel.library.majorVersion}.${wheel.library.minorVersion}`, user);
  const player = new LumiH5P.H5PPlayer(editor.libraryStorage, editor.contentStorage, config);

  const app = express();
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/h5p', h5pAjaxExpressRouter(editor, core, join(core, '..', 'editor')));
  app.get('/play', async (req, res) => res.send(await player.render(contentId, user, 'es')));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}/play`;

  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const failedRequests = [];
  page.on('response', (r) => {
    if (r.status() >= 400) {
      failedRequests.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
    }
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  // The default player of h5p-server puts the content in the page itself; in an iframe it would be in .h5p-iframe.
  const framed = await page.locator('iframe.h5p-iframe').count() > 0;
  const frame = framed ? page.frameLocator('iframe.h5p-iframe') : page.locator('body');
  try {
    await frame.locator('.aw').waitFor({ timeout: 30_000 });
  } catch (e) {
    await page.screenshot({ path: join(shots, 'lumi-failure.png') });
    console.log(`page errors: ${errors.join(' | ')}\nfailed requests: ${failedRequests.join(' | ')}`);
    throw e;
  }
  const inner = framed ? await (await page.locator('iframe.h5p-iframe').elementHandle()).contentFrame() : page.mainFrame();
  await inner.evaluate(() => {
    window.statements = [];
    H5P.externalDispatcher.on('xAPI', (e) => window.statements.push(e.data.statement));
  });
  const answers = Object.fromEntries(parameters.items.map((i) => [i.letter, i.answer]));
  await frame.locator('.aw-intro button').click();
  await page.screenshot({ path: join(shots, 'lumi-game.png') });
  let n = 0;
  for (let turn = 0; turn < 60 && await frame.locator('.aw-results').isHidden(); turn++) {
    const letter = await frame.locator('.aw-letter[aria-current] .aw-letter-text').textContent();
    await frame.locator('.aw-input').fill(n++ < 2 ? 'zzz' : answers[letter]);
    await frame.locator('.aw-input').press('Enter');
  }
  await frame.locator('.aw-cheer-title').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(shots, 'lumi-cheer.png') });
  const verbs = await inner.evaluate(() => window.statements.map((s) => s.verb.id.split('/').pop()));
  const score = await inner.evaluate(() => window.statements.at(-1).result.score);
  check('the game plays to the end and sends one result', verbs.filter((v) => v === 'answered').length === 1,
    `${verbs.join(' → ').replace(/(progressed → )+/g, 'progressed… → ')}`);
  check('with one point per letter', score.raw === parameters.items.length - 2 && score.max === parameters.items.length,
    `${score.raw}/${score.max}`);
  check('no script errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  if (server) {
    server.close();
  }
  rmSync(work, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `${failed} checks failed` : 'all checks passed');
process.exit(failed ? 1 : 0);

function readdirRecursive(dir, prefix = '') {
  return execFileSync('find', ['.', '-type', 'f'], { cwd: dir, encoding: 'utf8' })
    .split('\n').filter(Boolean).map((p) => prefix + p.replace(/^\.\//, ''));
}
