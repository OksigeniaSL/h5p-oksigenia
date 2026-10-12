// Packs the example content of each game, one .h5p per language, into dist/: h5p.json, content/ and the library
// folder from build/. Uploading one of them to a site installs the game. Run tools/build.mjs first.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { packages, ROOT, withTexts } from './packages.mjs';
import { zip } from './zip.mjs';

const out = join(ROOT, 'dist');
mkdirSync(out, { recursive: true });

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const entries = (dir, prefix) => walk(dir).map((path) => ({
  name: `${prefix}${relative(dir, path).split(sep).join('/')}`,
  data: readFileSync(path),
}));

for (const pkg of packages()) {
  const library = join(ROOT, 'build', pkg.folder);
  if (!existsSync(library)) {
    throw new Error(`${pkg.folder} is not built: run «npm run build» first`);
  }
  const contentBase = join(pkg.dir, 'content');
  for (const lang of existsSync(contentBase) ? readdirSync(contentBase) : []) {
    const dir = join(contentBase, lang);
    const content = withTexts(pkg.dir, JSON.parse(readFileSync(join(dir, 'content', 'content.json'), 'utf8')), lang);
    const files = [
      { name: 'h5p.json', data: readFileSync(join(dir, 'h5p.json')) },
      ...entries(join(dir, 'content'), 'content/').filter((f) => f.name !== 'content/content.json'),
      { name: 'content/content.json', data: Buffer.from(`${JSON.stringify(content, null, 2)}\n`) },
      ...entries(library, `${pkg.folder}/`),
    ];
    const file = join(out, `${pkg.name}-${pkg.version}-${lang}.h5p`);
    writeFileSync(file, zip(files));
    console.log(`packed ${relative(ROOT, file)} (${files.length} files)`);
  }
}
