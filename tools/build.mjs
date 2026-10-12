// Builds each game into build/<MachineName>-<major>.<minor>/, the folder H5P installs: library.json, semantics.json,
// icon.svg, language/ and dist/ with the bundled script and styles (the shared code goes inside each game).
//
// With --watch it keeps rebuilding on every change and copies each build into the dev server (.h5p-dev), whose live
// reload shows it.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { packages, ROOT } from './packages.mjs';

const watch = process.argv.includes('--watch');

const out = join(ROOT, 'build');
mkdirSync(out, { recursive: true });

// The games import semantics.json only for the defaults of their texts and settings: the bundle gets the names and
// defaults, without the labels and descriptions of the editor.
const slimSemantics = {
  name: 'slim-semantics',
  setup(b) {
    b.onLoad({ filter: /semantics\.json$/ }, (args) => {
      const slim = (field) => ({
        name: field.name,
        default: field.default,
        ...(Array.isArray(field.fields) ? { fields: field.fields.map(slim) } : {}),
      });
      const semantics = JSON.parse(readFileSync(args.path, 'utf8'));
      return { contents: JSON.stringify(semantics.map(slim)), loader: 'json' };
    });
  },
};

for (const pkg of packages()) {
  const target = join(out, pkg.folder);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const file of ['library.json', 'semantics.json', 'icon.svg']) {
    if (existsSync(join(pkg.dir, file))) {
      cpSync(join(pkg.dir, file), join(target, file));
    }
  }
  // language/.en.json is the template for translators: H5P core refuses a package that carries it.
  cpSync(join(pkg.dir, 'language'), join(target, 'language'), {
    recursive: true,
    filter: (src) => !basename(src).startsWith('.'),
  });
  const toDev = {
    name: 'to-dev-server',
    setup(b) {
      b.onEnd((result) => {
        const dev = join(ROOT, '.h5p-dev', 'libraries');
        if (watch && !result.errors.length && existsSync(dev)) {
          cpSync(target, join(dev, pkg.folder), { recursive: true });
          console.log(`rebuilt ${pkg.folder} into the dev server`);
        }
      });
    },
  };
  const ctx = await context({
    entryPoints: [join(pkg.dir, 'src', `${pkg.name}.js`)],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    banner: {
      js: `/*! ${pkg.library.machineName} ${pkg.version} | MIT | (c) 2026 Oksigenia | https://github.com/OksigeniaSL/h5p-oksigenia */`,
      css: `/*! ${pkg.library.machineName} ${pkg.version} | MIT | (c) 2026 Oksigenia */`,
    },
    outdir: join(target, 'dist'),
    plugins: [slimSemantics, toDev],
    logLevel: 'warning',
  });
  await ctx.rebuild();
  console.log(`built ${pkg.folder} (${pkg.version})`);
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.dispose();
  }
}
