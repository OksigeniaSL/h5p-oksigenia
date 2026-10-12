// Every text and setting of the editor is used by the game, and the game uses no text the editor does not offer.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const semantics = JSON.parse(readFileSync(new URL('../semantics.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/alphabet-wheel.js', import.meta.url), 'utf8');
const group = (name) => semantics.find((f) => f.name === name).fields.map((f) => f.name);

test('no unused interface text', () => {
  const unused = group('l10n').filter((name) => !new RegExp(`\\b(t|l10n)\\.${name}\\b|'${name}'`).test(source));
  assert.deepEqual(unused, []);
});

test('no interface text used without a field in the editor', () => {
  const offered = new Set(group('l10n'));
  const used = [...source.matchAll(/\b(?:t|this\.l10n)\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(used.filter((name) => !offered.has(name)))], []);
});

test('no unused behaviour setting', () => {
  const unused = group('behaviour').filter((name) => !source.includes(`behaviour.${name}`));
  assert.deepEqual(unused, []);
});
