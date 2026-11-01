// The rules of H5P.NumberLine.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NumberLineGame, parseNumbers, plan, shortestPath, TOPICS } from '../src/game.js';

/** The same numbers on every run: a small generator with a seed. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** @returns {any} A game, loose in its types: the tests reach into each kind of round. */
const game = (topic, rounds = 8, tuning = {}, seed = 7) =>
  new NumberLineGame({ topic, rounds, tuning, random: seeded(seed) });

test('the shortest way is found, and it stays on the line', () => {
  assert.equal(shortestPath(0, 12, 20, [1, 5, 10]).length, 3);
  assert.equal(shortestPath(0, 12, 20, [1, 5, 10]).reduce((a, b) => a + b, 0), 12);
  assert.deepEqual(shortestPath(3, 27, 50, [1, 5, 10, -1]).length, 4);
  assert.equal(shortestPath(0, 3, 20, [2]), null);
  // Going past the end of the line is not a way: from 19 to 18 with +5 and −1 it is one jump back.
  assert.deepEqual(shortestPath(19, 18, 20, [5, -1]), [-1]);
});

test('authors can write their numbers in any way', () => {
  assert.deepEqual(parseNumbers('2, 5 y 10'), [2, 5, 10]);
  assert.deepEqual(parseNumbers('+1 +5 -1 −10'), [1, 5, -1, -10]);
  assert.deepEqual(parseNumbers(''), []);
  assert.deepEqual(parseNumbers(undefined), []);
  assert.deepEqual(parseNumbers('2 2 2'), [2]);
});

test('what an author fine-tunes makes a single level, and what makes no sense is left out', () => {
  assert.equal(plan('tables', { tables: '7, 8' }).levels.length, 1);
  assert.deepEqual(plan('tables', { tables: '7, 8' }).levels[0].tables, [7, 8]);
  assert.deepEqual(plan('tables', { tables: 'none' }), TOPICS.tables);
  assert.deepEqual(plan('tables', { tables: '1, 0' }), TOPICS.tables);
  assert.equal(plan('add100', { jumps: '+2 +3', maxNumber: 30 }).levels[0].max, 30);
  assert.deepEqual(plan('add100', { jumps: '+2 +3', maxNumber: 30 }).levels[0].jumps, [2, 3]);
  // Only backwards: it could never get anywhere.
  assert.deepEqual(plan('add100', { jumps: '-1 -2' }), TOPICS.add100);
  assert.deepEqual(plan('add100', { jumps: '+2 +3 -1' }).levels[0].sizes, [2, 3]);
  assert.equal(plan('place1000', { maxNumber: 200 }).levels[0].max, 200);
  assert.deepEqual(plan('fractions', { denominators: '6' }).levels[0].denominators, [6]);
  assert.deepEqual(plan('nothing'), TOPICS.add100);
});

test('sums: every round can be done, and in more than one jump when it is about getting to the flag', () => {
  for (const topic of ['add20', 'add100']) {
    for (let seed = 1; seed <= 40; seed++) {
      const g = game(topic, 12, {}, seed);
      g.start();
      while (g.phase === 'playing') {
        const r = g.current;
        if (r.mode === 'goal') {
          assert.ok(r.best.length >= 2, `${topic}: from ${r.start} to ${r.target}`);
          r.best.forEach((j) => assert.ok(g.jump(j)));
        } else {
          assert.ok(r.target >= 0 && r.target <= r.max && r.start >= 0 && r.start <= r.max, `${r.start} ${r.amount}`);
          assert.ok(r.options.includes(r.target));
          assert.ok(g.jump(r.amount));
          assert.equal(g.answer(r.target).got, 2);
        }
        g.next();
      }
      assert.equal(g.score, g.maxScore);
    }
  }
});

test('sums: the rounds take turns, a real sum first', () => {
  const g = game('add100');
  g.start();
  assert.equal(g.current.mode, 'land');
  g.jump(g.current.amount);
  g.answer(g.current.target);
  g.next();
  assert.equal(g.current.mode, 'goal');
});

test('«where do you land»: the jumps add up to the sum, then the number; a wrong number still gets a point', () => {
  const g = game('add100', 4, {}, 11);
  g.start();
  const r = g.current;
  const sign = Math.sign(r.amount);
  assert.equal(g.canJump(-sign), false, 'not the other way');
  assert.equal(g.answer(r.target), null, 'not before the jumps');
  g.jump(sign);
  assert.equal(g.answering, false);
  g.jump(r.amount - sign);
  assert.equal(g.answering, true);
  assert.equal(g.canJump(sign), false, 'no more jumps');
  const wrong = r.options.find((n) => n !== r.target);
  assert.deepEqual(g.answer(wrong), { right: false, got: 1, levelUp: false });
  assert.equal(g.roundOver, true);
});

test('«where do you land»: going past it asks to start again, and doing it together scores nothing', () => {
  const g = game('add100', 4, {}, 11);
  g.start();
  const r = g.current;
  const out = g.jump(r.amount + Math.sign(r.amount));
  assert.equal(out.over, true);
  assert.equal(g.canJump(Math.sign(r.amount)), false);
  assert.equal(g.canHelp, true);
  const path = g.together();
  assert.equal(path.reduce((a, b) => a + b, 0), r.amount);
  assert.equal(Math.abs(path[0]), Math.abs(r.amount) >= 10 ? 10 : Math.abs(r.amount), 'tens first');
  assert.equal(g.position, r.start);
  path.forEach((j) => assert.ok(g.jump(j)));
  assert.equal(g.answer(r.target).got, 0);
});

test('«get to the flag»: starting again leaves one point, and going round in circles offers help', () => {
  const g = game('add100');
  g.start();
  g.jump(g.current.amount);
  g.answer(g.current.target);
  g.next();
  const r = g.current;
  g.restart();
  r.best.forEach((j) => g.jump(j));
  assert.equal(g.log[1].got, 1);
  g.next();
  g.jump(g.current.amount);
  g.answer(g.current.target);
  g.next();
  const again = g.current;
  const forth = again.jumps.find((j) => j > 0), back = again.jumps.find((j) => j === -forth);
  for (let i = 0; i < again.best.length + 3; i++) {
    g.jump(i % 2 ? (back ?? -1) : forth);
  }
  assert.equal(g.canHelp, true);
  g.together().forEach((j) => g.jump(j));
  assert.equal(g.log[3].got, 0);
});

test('«get to the flag»: two points with the fewest jumps, one with more, and it stays on the line', () => {
  const g = game('add20');
  g.start();
  g.answering = true;
  g.answer(g.current.target);
  g.next();
  const r = g.current;
  assert.equal(g.current.mode, 'goal');
  assert.equal(g.jump(100), null);
  assert.equal(g.moves.length, 0);
  // One jump forth and back first, whichever fits: then the fewest jumps are no longer possible.
  const forth = r.jumps.find((j) => g.canJump(j) && j !== r.target - r.start);
  g.jump(forth);
  const path = shortestPath(g.position, r.target, r.max, r.jumps);
  let last;
  path.forEach((j) => {
    last = g.jump(j); 
  });
  assert.equal(last.reached, true);
  const expected = 1 + path.length <= r.best.length ? 2 : 1;
  assert.equal(last.got, expected);
  assert.equal(g.jump(1), null, 'no more jumps after the flag');
});

test('«how many jumps»: a point only at the first try, and the round goes on until the flag', () => {
  const g = game('tables');
  g.start();
  const { times, size, target } = g.current;
  const wrong = times === 1 ? 2 : times - 1;
  const first = g.tryJumps(wrong);
  assert.equal(first.right, false);
  assert.equal(first.landed, wrong * size);
  assert.equal(g.roundOver, false);
  const second = g.tryJumps(times);
  assert.equal(second.right, true);
  assert.equal(second.landed, target);
  assert.equal(second.got, 0);
  g.next();
  assert.equal(g.tryJumps(g.current.times).got, 1);
  assert.equal(g.score, 1);
  assert.equal(g.maxScore, 8);
});

test('«how many jumps»: after two wrong tries, the game shows it', () => {
  const g = game('tables');
  g.start();
  const { times } = g.current;
  g.tryJumps(times + 1);
  const out = g.tryJumps(times + 2);
  assert.equal(out.right, false);
  assert.equal(out.shown, true);
  assert.equal(g.roundOver, true);
  assert.equal(out.got, 0);
});

test('on the first level, getting there at all counts for moving on; later, only in full', () => {
  const g = game('add100', 20);
  g.start();
  const play = () => {
    const r = g.current;
    if (r.mode === 'land') {
      g.jump(r.amount);
      const out = g.answer(r.options.find((n) => n !== r.target));
      g.next();
      return out;
    }
    g.restart();
    let out;
    r.best.forEach((j) => {
      out = g.jump(j); 
    });
    g.next();
    return out;
  };
  play();
  play();
  assert.equal(play().levelUp, true, 'one point in each round is enough on the first level');
  assert.equal(g.level, 1);
  play();
  play();
  play();
  assert.equal(g.level, 1, 'one point is not enough on the second one');
});

test('«place it»: the points go by how close it is, as a share of the line', () => {
  const g = game('place1000', 8, { maxNumber: 1000 });
  g.start();
  const at = (off) => g.current.value + off;
  assert.equal(g.place(at(30)).got, 2);
  g.next();
  assert.equal(g.place(at(80)).got, 1);
  g.next();
  assert.equal(g.place(at(81) > 1000 ? g.current.value - 81 : at(81)).got, 0);
  assert.equal(g.log[2].got, 0);
});

test('fractions are proper places on the line, never a whole number on the first levels', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = game('fractions', 8, {}, seed);
    g.start();
    const { value, shown, max } = g.current;
    const [n, d] = shown.split('/').map(Number);
    assert.equal(value, n / d);
    assert.ok(value > 0 && value < max, shown);
    assert.ok(value !== 1, shown);
  }
});

test('three good rounds in a row move on a level, and a slip starts the count again', () => {
  const g = game('tables', 12);
  g.start();
  const full = () => {
    const out = g.tryJumps(g.current.times); g.next(); return out; 
  };
  full();
  full();
  assert.equal(g.level, 0);
  assert.equal(full().levelUp, true);
  assert.equal(g.level, 1);
  full();
  full();
  const { times } = g.current;
  g.tryJumps(times + 1);
  g.tryJumps(times);
  g.next();
  assert.equal(g.level, 1);
  assert.equal(g.streak, 0);
});

test('only the first level of the tables marks the jumps', () => {
  assert.deepEqual(TOPICS.tables.levels.map((l) => l.ticks), [true, false, false]);
});

test('a round is not the same as the one before', () => {
  const g = game('tables', 30, { tables: '2' }, 3);
  g.start();
  for (let i = 0; i < 25; i++) {
    const { times } = g.current;
    g.tryJumps(times);
    g.next();
    assert.notEqual(g.current.times, times);
  }
});

test('the end comes after the last round, and a new game starts clean', () => {
  const g = game('tables', 2);
  g.start();
  g.tryJumps(g.current.times);
  assert.equal(g.lastRound, false);
  g.next();
  g.tryJumps(g.current.times);
  assert.equal(g.lastRound, true);
  g.next();
  assert.equal(g.phase, 'finished');
  assert.equal(g.score, 2);
  g.reset();
  assert.equal(g.phase, 'intro');
  assert.equal(g.score, 0);
  assert.equal(g.level, 0);
});

test('the state takes the game up again, with the same numbers', () => {
  const g = game('add100');
  g.start();
  g.jump(g.current.amount);
  g.answer(g.current.target);
  g.next();
  g.jump(g.current.jumps[0]);
  const saved = JSON.parse(JSON.stringify(g.toState()));
  assert.equal(saved.topic, 'add100');

  const back = game('add100', 8, {}, 99);
  assert.equal(back.restore(saved), true);
  assert.equal(back.number, 2);
  assert.equal(back.score, 2);
  assert.deepEqual(back.current, g.current);
  // The open round goes on from where it was, with its jumps.
  assert.equal(back.position, g.position);
  assert.deepEqual(back.moves, g.moves);
  assert.equal(back.roundOver, false);
});

test('coming back does not give another try: a wrong try stays counted, and a sum stays where it was', () => {
  const g = game('tables');
  g.start();
  g.tryJumps(g.current.times + 1);
  const back = game('tables');
  back.restore(JSON.parse(JSON.stringify(g.toState())));
  assert.equal(back.moves.length, 1);
  assert.equal(back.tryJumps(back.current.times).got, 0);

  const sum = game('add100', 4);
  sum.start();
  sum.jump(sum.current.amount);
  const again = game('add100', 4);
  again.restore(JSON.parse(JSON.stringify(sum.toState())));
  assert.equal(again.answering, true);
  assert.equal(again.answer(again.current.target).got, 2);
});

test('moves that do not fit the round are left out', () => {
  const g = game('add100');
  g.start();
  const state = JSON.parse(JSON.stringify(g.toState()));
  const back = game('add100');
  assert.equal(back.restore({ ...state, moves: [100000] }), true);
  assert.equal(back.position, back.current.start);
  assert.equal(back.moves.length, 0);
  const other = game('add100');
  assert.equal(other.restore({ ...state, moves: ['x'] }), true);
  assert.equal(other.moves.length, 0);
});

test('a game does not ask the same thing twice, and 2/4 counts as 1/2', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = game('fractions', 5, {}, seed);
    g.start();
    const values = [];
    while (g.phase === 'playing') {
      values.push(g.current.value);
      g.place(0);
      g.next();
    }
    assert.equal(new Set(values).size, values.length, `seed ${seed}: ${values}`);
  }
  for (const topic of ['add20', 'add100', 'tables', 'place1000']) {
    const g = game(topic, 6);
    g.start();
    const seen = [];
    while (g.phase === 'playing') {
      const { current: r } = g;
      seen.push(JSON.stringify(r));
      if (r.mode === 'goal') {
        r.best.forEach((j) => g.jump(j));
      } else if (r.mode === 'land') {
        g.jump(r.amount);
        g.answer(r.target);
      } else if (r.mode === 'exact') {
        g.tryJumps(r.times);
      } else {
        g.place(r.value);
      }
      g.next();
    }
    assert.equal(new Set(seen).size, seen.length, topic);
  }
});

test('a state that does not fit is left out', () => {
  const g = game('add100');
  assert.equal(g.restore(null), false);
  assert.equal(g.restore({}), false);
  assert.equal(g.restore({ phase: 'finished' }), false);
  const other = game('tables');
  other.start();
  assert.equal(g.restore(other.toState()), false, 'the author changed the topic');
  const shorter = game('add100', 8);
  shorter.start();
  const state = shorter.toState();
  assert.equal(game('add100', 8).restore({ ...state, number: 9 }), false);
  assert.equal(game('add100', 8).restore({ ...state, level: 7 }), false);
  assert.equal(g.phase, 'intro');
});

test('a round saved once it was over goes on to the next one', () => {
  const g = game('tables', 4);
  g.start();
  g.tryJumps(g.current.times);
  const back = game('tables', 4);
  assert.equal(back.restore(JSON.parse(JSON.stringify(g.toState()))), true);
  assert.equal(back.roundOver, true);
  back.next();
  assert.equal(back.number, 2);
  assert.equal(back.log.length, 1);
});
