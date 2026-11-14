// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Countdown, formatTime } from '../timer.js';

/** A clock the test moves by hand, and a countdown that runs on it without its interval. */
function clocked(seconds, callbacks) {
  let ms = 0;
  const timer = new Countdown({ seconds, now: () => ms, ...callbacks });
  timer.start();
  clearInterval(timer.handle);
  const advance = (by) => {
    ms += by;
    timer.update();
  };
  return { timer, advance };
}

test('the time running out ends the game once, even when the last tick reads the time left', () => {
  // As the wheel does: each tick paints the clock, and painting it reads `seconds`, which brings the countdown up to date.
  let ends = 0;
  const ticks = [];
  const { timer, advance } = clocked(2, {
    onTick: (left) => {
      ticks.push(left);
      assert.equal(timer.seconds, left);
    },
    onEnd: () => {
      ends++;
    },
  });
  advance(1000);
  advance(1000);
  assert.deepEqual(ticks, [1, 0]);
  assert.equal(ends, 1);
  assert.equal(timer.running, false);
  advance(1000);
  assert.equal(ends, 1, 'nothing more once it is over');
});

test('a paused countdown keeps its time, and goes on from it', () => {
  const { timer, advance } = clocked(10, {});
  advance(3500);
  timer.pause();
  advance(5000);
  assert.equal(timer.seconds, 7);
  assert.equal(formatTime(timer.seconds), '0:07');
});
