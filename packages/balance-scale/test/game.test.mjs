// The rules of H5P.BalanceScale: the rounds of every topic and level, how they score on the free and the held balance,
// the usual mistake, what the hints say, the spaced review and taking a game up again.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BalanceGame, compose, sizeOf, BACKS_BEFORE_HELP, POINTS } from '../src/game.js';

/** A repeatable source of numbers from 0 to 1 (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sum = (list) => list.reduce((s, t) => s + t.v, 0);

/** Starts a game on a level. */
function game(topic, { level = 0, held = false, seed = 1, rounds = 6 } = {}) {
  const g = new BalanceGame({ topic, rounds, held, startLevel: level, random: seeded(seed) });
  g.start();
  return g;
}

/** Puts the right answer on the scale with the game's own moves. */
function solve(g) {
  const r = g.current;
  if (r.topic === 'equalities') {
    const other = r.target === 'left' ? 'right' : 'left';
    const need = sum(r[other]) - sum(r[r.target].filter((t) => t.fixed));
    for (const v of compose(need, r.tray)) {
      g.put(r.target, { value: v });
    }
  } else if (r.topic === 'groups') {
    if (r.trayBag) {
      for (let i = 0; i < r.missing; i++) {
        g.put('right', { value: r.trayBag });
      }
    } else {
      for (const v of compose(r.missing, r.tray)) {
        g.put('right', { value: v });
      }
    }
  } else if (r.topic === 'share') {
    for (const [k, side] of [[0, 'left'], [1, 'right']]) {
      for (const v of r.solution[k]) {
        g.put(side, { poolId: r.pool.find((t) => t.v === v).id });
      }
    }
  }
}

test('sizes of weights and the fewest weights for a number', () => {
  assert.deepEqual([1, 2, 3, 5, 6, 10, 11, 50].map(sizeOf), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(compose(37, [1, 2, 5, 10, 20]), [20, 10, 5, 2]);
  assert.deepEqual(compose(7, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), [7]);
});

test('every round of every topic and level can be balanced, with whole positive numbers', () => {
  for (const topic of ['equalities', 'groups', 'share', 'bag']) {
    for (let level = 0; level < 3; level++) {
      for (let seed = 1; seed <= 60; seed++) {
        const g = game(topic, { level, seed });
        const r = g.current;
        const all = [...r.left, ...r.right, ...(r.pool || [])];
        assert.ok(all.every((t) => Number.isInteger(t.v) && t.v >= 0), `${topic} ${level}: whole numbers`);
        if (topic === 'bag') {
          assert.ok(r.x >= 2 && r.x <= 9);
          g.untry(r.x);
          assert.equal(g.release(r.x).balanced, true, `${topic} ${level} seed ${seed}`);
        } else {
          solve(g);
          assert.equal(g.relation(), '=', `${topic} ${level} seed ${seed}`);
        }
      }
    }
  }
});

test('the levels of equalities follow the ladder: sum on the right first, then the gap on either side, then bigger numbers', () => {
  const forms = new Set(), sides = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    forms.add(game('equalities', { seed }).current.form);
    sides.add(game('equalities', { level: 1, seed }).current.target);
    const top = game('equalities', { level: 2, seed }).current;
    assert.ok(sum(top.left) + sum(top.right) <= 200 && top.tray.includes(50));
  }
  assert.deepEqual([...forms].sort(), ['sum', 'two']);
  assert.deepEqual([...sides].sort(), ['left', 'right']);
});

test('free balance: it ends by itself when it balances; 2 points without taking any off, 1 with one or two, help at the fourth', () => {
  const clean = game('equalities');
  solve(clean);
  assert.deepEqual(clean.afterChange(), { balanced: true, got: POINTS, levelUp: false });

  const once = game('equalities', { seed: 3 });
  const r = once.current;
  const { thing } = once.put(r.target, { value: 10 });
  once.afterChange();
  once.take(thing.id);
  solve(once);
  const result = once.afterChange();
  assert.equal(result.balanced, true);
  assert.equal(result.got, 1);

  const lost = game('equalities', { seed: 4 });
  let last;
  for (let i = 0; i < BACKS_BEFORE_HELP; i++) {
    const put = lost.put(lost.current.target, { value: 1 });
    lost.take(put.thing.id);
    last = lost.afterChange();
  }
  assert.ok(last.help);
  assert.equal(lost.roundOver, true);
  assert.equal(lost.log[0].got, 0);
  assert.equal(lost.relation(), '=');
});

test('free balance: the round does not end with nothing of the player on the scale, nor with weights left to share', () => {
  const g = game('share');
  const [first] = g.current.pool;
  g.put('left', { poolId: first.id });
  assert.equal(g.afterChange().got, undefined);
  assert.equal(g.notReady(), 'placeAll');
});

test('held balance: 2 points at the first go, 1 at the second, and after the second miss it is done together', () => {
  const right = game('equalities', { held: true });
  assert.deepEqual(right.release(), { notReady: 'putFirst' });
  solve(right);
  assert.equal(right.release().got, 2);

  const second = game('equalities', { held: true, seed: 2 });
  second.put(second.current.target, { value: 10 });
  second.put(second.current.target, { value: 10 });
  const miss = second.release();
  assert.equal(miss.balanced, false);
  assert.equal(second.attempts, 1);
  assert.equal(second.take(second.placed(second.current.target)[0].id).thing.v, 10);
  second.clear();
  solve(second);
  assert.equal(second.release().got, 1);

  const twice = game('equalities', { held: true, seed: 5 });
  twice.put(twice.current.target, { value: 10 });
  twice.put(twice.current.target, { value: 10 });
  twice.release();
  const help = twice.release();
  assert.ok(help.help);
  assert.equal(twice.log[0].got, 0);
  assert.equal(twice.log[0].tries.length, 2);
});

test('the mystery bag: try a number; the bags weigh it until it changes; 2 points at the first try', () => {
  const g = game('bag');
  const { x } = g.current;
  assert.equal(g.relation(), '=', 'the bags weigh their own weight until a number is tried');
  assert.deepEqual(g.release(), { notReady: 'chooseFirst' });
  const miss = g.release(x + 1);
  assert.equal(miss.balanced, false);
  assert.equal(miss.hint.type, 'bag');
  assert.equal(miss.hint.smaller, true);
  g.untry(x);
  assert.equal(g.tried, null);
  assert.equal(g.release(x).got, 1);
  assert.equal(game('bag', { seed: 9 }).release(game('bag', { seed: 9 }).current.x).got, 2);
});

test('the usual mistake: what the other side weighs, or every number added up', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = game('equalities', { seed });
    const r = g.current;
    const other = r.target === 'left' ? 'right' : 'left';
    const otherWeight = sum(r[other]);
    for (const v of compose(otherWeight, r.tray)) {
      g.put(r.target, { value: v });
    }
    const slip = g.slip();
    assert.equal(slip.type, 'other', `seed ${seed}`);
    assert.equal(slip.mine, otherWeight);
    assert.deepEqual(slip.already, r[r.target].filter((t) => t.fixed).map((t) => t.v));
  }
});

test('hints say what is missing and where', () => {
  const g = game('equalities', { held: true, seed: 7 });
  const r = g.current;
  const other = r.target === 'left' ? 'right' : 'left';
  const need = sum(r[other]) - sum(r[r.target].filter((t) => t.fixed));
  g.put(r.target, { value: 1 });
  const hint = g.hint();
  assert.equal(hint.type, 'side');
  assert.equal(hint.side, r.target);
  assert.equal(hint.extra, need < 1);
  assert.equal(hint.amount, Math.abs(need - 1));

  const s = game('share', { seed: 3 });
  for (const t of [...s.current.pool]) {
    s.put('left', { poolId: t.id });
  }
  const shareHint = s.hint();
  assert.equal(shareHint.type, 'share');
  assert.equal(shareHint.heavy, 'left');
  assert.equal(shareHint.move, shareHint.half);
});

test('only the right pan takes weights when the gap is there, and what came with the scale stays', () => {
  const g = game('equalities');
  const r = g.current;
  const wrong = r.target === 'left' ? 'right' : 'left';
  assert.deepEqual(g.put(wrong, { value: 3 }), { refused: 'otherPan' });
  assert.deepEqual(g.take(r[wrong][0].id), { refused: 'fixed' });
  assert.deepEqual(g.put(r.target, { value: 13 }), { refused: 'over' }, 'only what the tray offers');
  const bag = game('bag');
  assert.deepEqual(bag.take(bag.current.left[0].id), { refused: 'mystery' });
});

test('a round that does not go well comes back two rounds later, same kind and level, other numbers', () => {
  const g = game('equalities', { held: true, seed: 11 });
  const first = g.current;
  g.put(first.target, { value: 10 });
  g.put(first.target, { value: 10 });
  g.release();
  g.release();
  g.next();
  solve(g);
  g.release();
  g.next();
  assert.equal(g.review, true);
  assert.equal(g.current.form, first.form);
  assert.equal(g.current.level, first.level);
});

test('three good rounds in a row move on to the next level', () => {
  const g = game('groups', { seed: 2 });
  for (let i = 0; i < 3; i++) {
    solve(g);
    const result = g.afterChange();
    assert.equal(result.levelUp, i === 2);
    g.next();
  }
  assert.equal(g.level, 1);
  assert.ok(g.current.trayBag, 'the second level asks for bags');
});

test('a whole game scores rounds × 2 at most, and finishes after the last round', () => {
  const g = game('share', { rounds: 3 });
  for (let i = 0; i < 3; i++) {
    solve(g);
    g.afterChange();
    g.next();
  }
  assert.equal(g.phase, 'finished');
  assert.equal(g.score, 6);
  assert.equal(g.maxScore, 6);
});

test('the state takes the game up again with the same round and what was already on the scale', () => {
  const g = game('equalities', { seed: 21 });
  const r = g.current;
  g.put(r.target, { value: 1 });
  const saved = JSON.parse(JSON.stringify(g.toState()));
  const again = new BalanceGame({ topic: 'equalities', random: seeded(99) });
  assert.equal(again.restore(saved), true);
  assert.deepEqual(again.current, r);
  assert.equal(again.weight(r.target), g.weight(r.target));
  const added = again.put(r.target, { value: 2 }).thing;
  assert.ok(![...r.left, ...r.right].some((t) => t.id === added.id && t !== added), 'new things get new ids');
  assert.equal(new BalanceGame({ topic: 'share' }).restore(saved), false, 'not the state of another topic');
  assert.equal(new BalanceGame({ topic: 'equalities' }).restore({ phase: 'finished' }), false);
});

test('the free balance has no rounds and no points', () => {
  const g = game('free');
  assert.equal(g.maxScore, 0);
  g.put('left', { value: 5 });
  g.put('right', { value: 5 });
  assert.deepEqual(g.afterChange(), { balanced: true });
  assert.equal(g.log.length, 0);
});
