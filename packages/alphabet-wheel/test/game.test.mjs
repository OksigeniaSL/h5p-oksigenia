// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WheelGame } from '../src/game.js';
import { createMatcher } from '../../shared/answer.js';

/** @type {import('../src/game.js').WheelItem[]} */
const items = [
  { letter: 'A', kind: 'starts', clue: 'Insect that makes honey', answers: ['Bee'] },
  { letter: 'B', kind: 'starts', clue: 'Two wheels and pedals', answers: ['Bicycle', 'bike'] },
  { letter: 'C', kind: 'starts', clue: 'Orange vegetable', answers: ['Carrot'] },
];
const newGame = () => new WheelGame(items, createMatcher({ language: 'en' }));

test('a game played to the end, with a pass that comes back in the next round', () => {
  const g = newGame();
  assert.equal(g.phase, 'intro');
  g.start();
  assert.equal(g.current.letter, 'A');
  assert.deepEqual(g.answer('bee'), { result: 'ok', index: 0 });
  assert.equal(g.pass(), 1);
  assert.equal(g.current.letter, 'C');
  assert.deepEqual(g.answer('pumpkin'), { result: 'bad', index: 2 });
  assert.equal(g.round, 2);
  assert.equal(g.current.letter, 'B');
  assert.deepEqual(g.answer('BIKE'), { result: 'ok', index: 1 });
  assert.equal(g.phase, 'finished');
  assert.equal(g.endReason, 'done');
  assert.equal(g.score, 2);
  assert.equal(g.maxScore, 3);
  assert.deepEqual(g.given, ['bee', 'BIKE', 'pumpkin']);
});

test('an empty answer changes nothing', () => {
  const g = newGame();
  g.start();
  assert.deepEqual(g.answer('   '), { result: 'empty', index: 0 });
  assert.equal(g.status[0], 'pending');
  assert.equal(g.current.letter, 'A');
});

test('passing every letter keeps the game going round', () => {
  const g = newGame();
  g.start();
  g.pass();
  g.pass();
  g.pass();
  assert.equal(g.phase, 'playing');
  assert.equal(g.current.letter, 'A');
  assert.equal(g.round, 2);
  assert.equal(g.left, 3);
});

test('stopping or running out of time leaves the open letters without a point', () => {
  const g = newGame();
  g.start();
  g.answer('bee');
  g.finish('time');
  assert.equal(g.phase, 'finished');
  assert.equal(g.endReason, 'time');
  assert.equal(g.score, 1);
  assert.equal(g.answer('bike').result, 'empty');
});

test('the state survives a reload, and a state from another wheel is refused', () => {
  const g = newGame();
  g.start();
  g.answer('bee');
  g.pass();
  const saved = JSON.parse(JSON.stringify(g.toState()));
  const h = newGame();
  assert.equal(h.restore(saved), true);
  assert.equal(h.phase, 'playing');
  assert.equal(h.current.letter, 'C');
  assert.deepEqual(h.status, ['ok', 'passed', 'pending']);
  const other = new WheelGame(items.slice(0, 2), createMatcher());
  assert.equal(other.restore(saved), false);
  assert.equal(newGame().restore({ ...saved, v: 99 }), false);
  assert.equal(newGame().restore(null), false);
});
