// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TileBoard, jumble } from '../src/tiles.js';

/** A source of chance that repeats the given numbers, so the jumble is known. */
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/** @param {TileBoard} b @returns {string} The letters of the tray, in their order. */
const tray = (b) => b.tiles.map((t) => t.letter).join('');

test('the tiles are the letters of the answer, never in its own order', () => {
  for (let k = 0; k < 200; k++) {
    const b = new TileBoard('abeille');
    assert.notEqual(tray(b), 'abeille');
    assert.equal([...tray(b)].sort().join(''), [...'abeille'].sort().join(''));
  }
});

test('a source of chance that always gives the same order still jumbles', () => {
  assert.deepEqual(jumble([...'chat'], () => 0.9999), [...'hatc']);
  assert.deepEqual(jumble([...'aaa'], Math.random), [...'aaa']);
  assert.deepEqual(jumble(['a'], Math.random), ['a']);
});

test('tiles fill the word in order, and the letters keep their capitals and accents', () => {
  const b = new TileBoard('Éléphant');
  assert.equal(b.slots.length, 8);
  const order = [...'Éléphant'].map((c) => b.tiles.findIndex((t, i) => t.letter === c
    && !b.slots.some((s) => s.tile === i)));
  assert.equal(b.empty, true);
  order.forEach((tile, n) => {
    assert.equal(b.place(tile), n);
  });
  assert.equal(b.full, true);
  assert.equal(b.text, 'Éléphant');
  assert.equal(b.next, -1);
  assert.equal(b.place(0), -1, 'a used tile, or a full word, takes nothing');
});

test('spaces, hyphens and apostrophes are already in their place', () => {
  const b = new TileBoard("  arc-en-ciel  d'or ");
  assert.equal(b.slots.map((s) => s.fixed ?? '_').join(''), "___-__-____ _'__");
  assert.equal(b.tiles.length, 12);
  assert.equal(b.next, 0);
  b.tiles.forEach((_, i) => b.place(i));
  assert.equal(b.full, true);
  assert.equal(b.text.length, "arc-en-ciel d'or".length);
  assert.equal(b.text[3], '-');
  assert.equal(b.text[11], ' ');
});

test('a letter given back leaves its place for the next tile; erasing takes the last letter of the word', () => {
  const b = new TileBoard('chat', seq(0.1, 0.5, 0.9));
  const [first, second, third] = [0, 1, 2];
  b.place(first);
  b.place(second);
  b.place(third);
  assert.equal(b.takeBack(1), second);
  assert.equal(b.tiles[second].used, false);
  assert.equal(b.next, 1);
  assert.equal(b.place(second), 1);
  assert.equal(b.eraseLast(), third);
  assert.equal(b.spelled.length, 2);
  assert.equal(b.takeBack(3), -1, 'an empty place gives nothing back');
  b.clear();
  assert.equal(b.empty, true);
  assert.equal(b.tiles.every((t) => !t.used), true);
  assert.equal(b.eraseLast(), -1);
});

test('a key picks a free tile: the same letter first, then without capitals or accents', () => {
  const b = new TileBoard('Ée e');
  const tile = (key) => b.tileForKey(key);
  const capital = b.tiles.findIndex((t) => t.letter === 'É');
  const small = b.tiles.findIndex((t) => t.letter === 'e');
  assert.equal(tile('É'), capital);
  assert.equal(tile('é'), capital);
  assert.equal(tile('e'), small);
  b.place(small);
  const other = b.tiles.findIndex((t, i) => t.letter === 'e' && i !== small);
  assert.equal(tile('e'), other);
  b.place(other);
  assert.equal(tile('e'), capital, 'with no plain e left, the É');
  b.place(capital);
  assert.equal(tile('e'), -1);
  assert.equal(tile(' '), -1);
  assert.equal(tile('Enter'), -1);
});
