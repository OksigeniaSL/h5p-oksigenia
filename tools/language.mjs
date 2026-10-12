// Writes the H5P language files of each game (language/*.json) from its semantics and a dictionary per language
// (i18n/<lang>.json: English text → translation, plus defaults that are not texts). With --check it only says
// whether the files are up to date, for the CI.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { packages } from './packages.mjs';

const TEXT_KEYS = ['label', 'description', 'placeholder', 'entity', 'example'];
const check = process.argv.includes('--check');
let stale = 0;
let missing = 0;

/** Keeps only what a translator changes, in the same shape as the semantics. */
function translate(field, dict, lang) {
  const out = {};
  for (const key of TEXT_KEYS) {
    if (typeof field[key] === 'string') {
      out[key] = word(field[key], dict, lang);
    }
  }
  if (field.type === 'text' && typeof field.default === 'string') {
    out.default = word(field.default, dict, lang);
  }
  if (dict.defaults && field.name in dict.defaults) {
    out.default = dict.defaults[field.name];
  }
  if (Array.isArray(field.options)) {
    out.options = field.options.map((o) => ({ label: word(o.label, dict, lang) }));
  }
  if (Array.isArray(field.fields)) {
    out.fields = field.fields.map((f) => translate(f, dict, lang));
  }
  if (field.field) {
    out.field = translate(field.field, dict, lang);
  }
  return out;
}

function word(text, dict, lang) {
  if (lang === 'en') {
    return text;
  }
  if (!(text in (dict.strings || {}))) {
    missing++;
    console.warn(`  ${lang}: no translation for «${text}»`);
    return text;
  }
  return dict.strings[text];
}

for (const pkg of packages()) {
  const semantics = JSON.parse(readFileSync(join(pkg.dir, 'semantics.json'), 'utf8'));
  const i18n = join(pkg.dir, 'i18n');
  const langs = ['en', ...(existsSync(i18n) ? readdirSync(i18n).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [])];
  const outDir = join(pkg.dir, 'language');
  mkdirSync(outDir, { recursive: true });
  for (const lang of langs) {
    const dict = lang === 'en' ? {} : JSON.parse(readFileSync(join(i18n, `${lang}.json`), 'utf8'));
    const text = `${JSON.stringify({ semantics: semantics.map((f) => translate(f, dict, lang)) }, null, 2)}\n`;
    const names = lang === 'en' ? ['.en.json', 'en.json'] : [`${lang}.json`];
    for (const name of names) {
      const file = join(outDir, name);
      const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
      if (before === text) {
        continue;
      }
      if (check) {
        stale++;
        console.error(`  ${pkg.name}/language/${name} is not up to date: run «npm run lang»`);
      } else {
        writeFileSync(file, text);
        console.log(`  ${pkg.name}/language/${name}`);
      }
    }
  }
}

if (stale || (check && missing)) {
  process.exit(1);
}
