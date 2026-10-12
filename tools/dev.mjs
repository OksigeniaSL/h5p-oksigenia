// Prepares the h5p-cli dev server in .h5p-dev/ and starts it: H5P core on the first run, then a copy (not a link:
// the h5p-cli export does not follow links) of each built game and its example content, one folder per language
// (alphabet-wheel-es…). The games are then at http://localhost:<port>/view/h5p-alphabet-wheel/alphabet-wheel-es.
//
//   node tools/dev.mjs [--port 8080] [--no-serve] [--no-watch]
//
// --no-watch turns off live reload, which always takes port 35729: the end-to-end tests use it so they can run
// next to a dev server that is already open.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packages, ROOT, withTexts } from './packages.mjs';

const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : process.env.PORT || '8080';
const dev = join(ROOT, '.h5p-dev');
const cli = join(ROOT, 'node_modules', '.bin', 'h5p');

mkdirSync(join(dev, 'content'), { recursive: true });
if (!existsSync(join(dev, 'libraries', 'h5p-php-library'))) {
  console.log('Setting up H5P core in .h5p-dev (first run)…');
  const r = spawnSync(cli, ['core'], { cwd: dev, stdio: 'inherit' });
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

for (const pkg of packages()) {
  const built = join(ROOT, 'build', pkg.folder);
  if (!existsSync(built)) {
    throw new Error(`${pkg.folder} is not built: run «npm run build» first`);
  }
  const lib = join(dev, 'libraries', pkg.folder);
  rmSync(lib, { recursive: true, force: true });
  cpSync(built, lib, { recursive: true });
  const contentBase = join(pkg.dir, 'content');
  for (const lang of existsSync(contentBase) ? readdirSync(contentBase) : []) {
    const target = join(dev, 'content', `${pkg.name}-${lang}`);
    rmSync(target, { recursive: true, force: true });
    cpSync(join(contentBase, lang, 'content'), target, { recursive: true });
    cpSync(join(contentBase, lang, 'h5p.json'), join(target, 'h5p.json'));
    const content = withTexts(pkg.dir, JSON.parse(readFileSync(join(target, 'content.json'), 'utf8')), lang);
    writeFileSync(join(target, 'content.json'), `${JSON.stringify(content, null, 2)}\n`);
  }
  console.log(`dev: ${pkg.folder} and its examples are in .h5p-dev`);
}

if (!args.includes('--no-serve')) {
  // h5p-cli reads config.js from its working folder instead of its own: the same settings, with or without watching.
  // It is CommonJS, and the repository is an ES module package.
  writeFileSync(join(dev, 'package.json'), '{ "type": "commonjs" }\n');
  writeFileSync(join(dev, 'config.js'), [
    '// Written by tools/dev.mjs.',
    `const config = require(${JSON.stringify(join(ROOT, 'node_modules', 'h5p-cli', 'config.js'))});`,
    `config.files.watch = ${!args.includes('--no-watch')};`,
    'module.exports = config;',
    '',
  ].join('\n'));
  const server = spawn(cli, ['server', port], { cwd: dev, stdio: 'inherit' });
  const stop = () => server.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', (code) => process.exit(code ?? 0));
}
