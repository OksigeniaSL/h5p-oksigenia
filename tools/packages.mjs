// The H5P libraries of the repository: every folder of packages/ with a library.json.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The example content with the interface texts of its language, as the H5P editor leaves them when an author
 * creates content in that language: the defaults of the l10n group, from language/<lang>.json.
 * @param {string} dir Folder of the game.
 * @param {Object} content The example content.json.
 * @param {string} lang
 * @returns {Object}
 */
export function withTexts(dir, content, lang) {
  const semantics = JSON.parse(readFileSync(join(dir, 'semantics.json'), 'utf8'));
  const file = join(dir, 'language', `${lang}.json`);
  const translated = JSON.parse(readFileSync(existsSync(file) ? file : join(dir, 'language', 'en.json'), 'utf8')).semantics;
  const index = semantics.findIndex((f) => f.name === 'l10n');
  if (index < 0) {
    return content;
  }
  const l10n = Object.fromEntries(semantics[index].fields.map((f, i) => [
    f.name, (translated[index].fields[i] || {}).default ?? f.default,
  ]));
  return { ...content, l10n: { ...l10n, ...(content.l10n || {}) } };
}

/**
 * @returns {Array<{name: string, dir: string, library: Object, folder: string, version: string}>}
 *   `folder` is the name H5P gives the library folder (H5P.AlphabetWheel-1.0).
 */
export function packages() {
  const base = join(ROOT, 'packages');
  return readdirSync(base)
    .filter((name) => existsSync(join(base, name, 'library.json')))
    .map((name) => {
      const dir = join(base, name);
      const library = JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'));
      return {
        name,
        dir,
        library,
        folder: `${library.machineName}-${library.majorVersion}.${library.minorVersion}`,
        version: `${library.majorVersion}.${library.minorVersion}.${library.patchVersion}`,
      };
    });
}
