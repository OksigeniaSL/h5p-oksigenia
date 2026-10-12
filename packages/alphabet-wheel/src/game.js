// The rules of the alphabet wheel, without the screen: one player goes round the letters, answers or passes, and the
// passed letters come back in the next round until every letter is answered, the time is up or the player stops.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

export const STATE_VERSION = 1;

/**
 * @typedef {object} WheelItem
 * @property {string} letter
 * @property {'starts'|'contains'} kind
 * @property {string} clue
 * @property {string[]} answers The answer first, then the alternatives.
 */

export class WheelGame {
  /**
   * @param {WheelItem[]} items
   * @param {{matches: (given: string, accepted: string[]) => number}} matcher
   */
  constructor(items, matcher) {
    this.items = items;
    this.matcher = matcher;
    this.reset();
  }

  reset() {
    const n = this.items.length;
    /** @type {Array<'pending'|'passed'|'ok'|'bad'>} */
    this.status = new Array(n).fill('pending');
    /** @type {Array<string|null>} */
    this.given = new Array(n).fill(null);
    this.pos = 0;
    this.round = 1;
    /** @type {'intro'|'playing'|'finished'} */
    this.phase = 'intro';
    /** @type {'done'|'time'|'stopped'|null} */
    this.endReason = null;
  }

  start() {
    if (this.phase !== 'intro') {
      return;
    }
    this.phase = 'playing';
    this.pos = 0;
    if (!this.isOpen(0) && !this.advance()) {
      this.finish('done');
    }
  }

  isOpen(i) {
    return this.status[i] === 'pending' || this.status[i] === 'passed';
  }

  /** @returns {WheelItem|null} */
  get current() {
    return this.phase === 'playing' ? this.items[this.pos] : null;
  }

  /**
   * @param {string} text What the player typed.
   * @returns {{result: 'empty'|'ok'|'bad', index: number}}
   */
  answer(text) {
    const index = this.pos;
    if (this.phase !== 'playing') {
      return { result: 'empty', index };
    }
    if (!String(text ?? '').trim()) {
      return { result: 'empty', index };
    }
    const ok = this.matcher.matches(text, this.items[index].answers) >= 0;
    this.status[index] = ok ? 'ok' : 'bad';
    this.given[index] = String(text).trim();
    if (!this.advance()) {
      this.finish('done');
    }
    return { result: ok ? 'ok' : 'bad', index };
  }

  /** @returns {number} The index of the letter that was passed. */
  pass() {
    const index = this.pos;
    if (this.phase !== 'playing') {
      return index;
    }
    this.status[index] = 'passed';
    if (!this.advance()) {
      this.finish('done');
    }
    return index;
  }

  /**
   * Moves to the next open letter after the current one, going round. A new round starts when it goes past the end.
   * @returns {boolean} False if no letter is left.
   */
  advance() {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.pos + k) % n;
      if (this.isOpen(i)) {
        if (i <= this.pos) {
          this.round++;
        }
        this.pos = i;
        return true;
      }
    }
    return false;
  }

  /** @param {'done'|'time'|'stopped'} reason */
  finish(reason) {
    if (this.phase === 'finished') {
      return;
    }
    this.phase = 'finished';
    this.endReason = reason;
  }

  count(status) {
    return this.status.filter((s) => s === status).length;
  }

  get score() {
    return this.count('ok');
  }

  get maxScore() {
    return this.items.length;
  }

  /** Letters still to answer (never seen or passed). */
  get left() {
    return this.count('pending') + this.count('passed');
  }

  get answeredAny() {
    return this.given.some((g) => g !== null);
  }

  /** @returns {Object} What H5P keeps to resume the game. */
  toState() {
    return {
      v: STATE_VERSION,
      phase: this.phase,
      status: this.status.slice(),
      given: this.given.slice(),
      pos: this.pos,
      round: this.round,
      endReason: this.endReason,
    };
  }

  /**
   * @param {Object} state
   * @returns {boolean} Whether the state fitted this wheel and was restored.
   */
  restore(state) {
    const n = this.items.length;
    if (!state || state.v !== STATE_VERSION || !Array.isArray(state.status) || state.status.length !== n
      || !Array.isArray(state.given) || state.given.length !== n) {
      return false;
    }
    const valid = ['pending', 'passed', 'ok', 'bad'];
    if (!state.status.every((s) => valid.includes(s)) || !['intro', 'playing', 'finished'].includes(state.phase)) {
      return false;
    }
    this.status = state.status.slice();
    this.given = state.given.map((g) => (typeof g === 'string' ? g : null));
    this.pos = Number.isInteger(state.pos) && state.pos >= 0 && state.pos < n ? state.pos : 0;
    this.round = Number.isInteger(state.round) && state.round > 0 ? state.round : 1;
    this.phase = state.phase;
    this.endReason = state.endReason || null;
    if (this.phase === 'playing' && !this.isOpen(this.pos) && !this.advance()) {
      this.finish('done');
    }
    return true;
  }
}
