// The rules of H5P.NumberLine, without any screen: what each round asks, what each move does and what it scores.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

/**
 * What can be practised. Each topic has its ways of playing, taken in turns, and three levels. Labels go by the width of
 * the line on the first level and get fewer later on, so the player has to work out more of the numbers.
 * @type {Object<string, {modes: Array<'goal'|'land'|'exact'|'place'>, points: number, levels: Object[]}>}
 */
export const TOPICS = {
  add20: { modes: ['land', 'goal'], points: 2, levels: [
    { max: 20, jumps: [1, 2, 5, -1, -5], sizes: [1, 2, 5], back: false, labelEvery: null },
    { max: 20, jumps: [2, 3, 5, -1, -5], sizes: [1, 2, 5], back: true, labelEvery: 5 },
    { max: 20, jumps: [3, 4, 7, -1, -2], sizes: [1, 2, 5], back: true, labelEvery: 10 },
  ] },
  add100: { modes: ['land', 'goal'], points: 2, levels: [
    { max: 50, jumps: [1, 5, 10, -1, -10], sizes: [1, 2, 5, 10], back: false, labelEvery: 5 },
    { max: 100, jumps: [1, 5, 10, -1, -10], sizes: [1, 2, 5, 10], back: true, labelEvery: 10 },
    { max: 100, jumps: [2, 5, 20, -1, -10], sizes: [1, 2, 5, 10], back: true, labelEvery: 50 },
  ] },
  tables: { modes: ['exact'], points: 1, levels: [
    // Only the first level marks the jumps: with marks up to the flag, it would be enough to count them.
    { tables: [2, 5, 10], ticks: true }, { tables: [3, 4, 6], ticks: false }, { tables: [7, 8, 9], ticks: false },
  ] },
  place1000: { modes: ['place'], points: 2, levels: [
    { max: 100, ticks: 10 }, { max: 500, ticks: 5 }, { max: 1000, ticks: 0 },
  ] },
  fractions: { modes: ['place'], points: 2, levels: [
    { max: 1, denominators: [2, 4], ticks: 'denominator' },
    { max: 1, denominators: [3, 4, 5, 8], ticks: 0 },
    { max: 2, denominators: [2, 3, 4], ticks: 0 },
  ] },
};

/** What can be chosen, in the order it is offered. */
export const TOPIC_NAMES = Object.keys(TOPICS);
/** How far from the place still counts, as a share of the line: for full points and for half of them. */
export const TOLERANCE = { full: 0.03, half: 0.08 };
/** Good rounds in a row to move on to the next level. */
export const STREAK_TO_LEVEL_UP = 3;
/** The most jumps offered in a «how many jumps» round, and so the length of its line. */
const MAX_TIMES = 12;
/** Wrong tries in a «how many jumps» round before the game shows it. */
const TRIES_BEFORE_SHOWING = 2;
/** Extra jumps before the game offers to do it together. */
const EXTRA_BEFORE_HELP = 3;

/**
 * @param {*} text A list of numbers typed by an author: «2, 5, 10» or «+1 +5 -1».
 * @returns {number[]} The whole numbers in it, without repeats.
 */
export function parseNumbers(text) {
  const found = String(text ?? '').match(/[-−]?\d+/g) || [];
  return [...new Set(found.map((n) => Number(n.replace('−', '-'))))];
}

/**
 * The levels of a topic with what an author fine-tuned. Anything tuned makes a single level: the author said what to
 * practise, so the game does not move on to something else. What does not make sense is left out.
 * @param {string} topic
 * @param {{maxNumber?: *, jumps?: *, tables?: *, denominators?: *}} [tuning]
 * @returns {{modes: Array<'goal'|'land'|'exact'|'place'>, points: number, levels: Object[]}}
 */
export function plan(topic, tuning = {}) {
  const base = TOPICS[topic] || TOPICS.add100;
  const max = Math.floor(Number(tuning.maxNumber));
  const validMax = Number.isFinite(max) && max > 0 ? max : null;
  const single = (level) => ({ ...base, levels: [level] });
  if (topic === 'tables') {
    const tables = parseNumbers(tuning.tables).filter((t) => t >= 2 && t <= 100);
    return tables.length ? single({ tables, ticks: true }) : base;
  }
  if (topic === 'fractions') {
    const denominators = parseNumbers(tuning.denominators).filter((d) => d >= 2 && d <= 100);
    return denominators.length
      ? single({ max: validMax && validMax <= 10 ? validMax : 1, denominators, ticks: 0 })
      : base;
  }
  if (topic === 'place1000') {
    return validMax && validMax >= 10 ? single({ max: validMax, ticks: 0 }) : base;
  }
  const jumps = parseNumbers(tuning.jumps).filter((j) => j !== 0);
  const steps = jumps.some((j) => j > 0) ? jumps : null;
  const longEnough = validMax && validMax >= 5;
  if (!steps && !longEnough) {
    return base;
  }
  const last = base.levels[base.levels.length - 1];
  return single({
    max: longEnough ? validMax : last.max,
    jumps: steps || last.jumps,
    sizes: steps ? steps.filter((j) => j > 0) : last.sizes,
    back: true,
    labelEvery: null,
  });
}

/**
 * The shortest way from one number to another inside the line, breadth first.
 * @param {number} from
 * @param {number} to
 * @param {number} max
 * @param {number[]} jumps
 * @returns {number[]|null} The jumps, or null if it cannot be done.
 */
export function shortestPath(from, to, max, jumps) {
  const came = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    if (at === to) {
      const path = [];
      for (let step = came.get(at); step; step = came.get(step.from)) {
        path.unshift(step.jump);
      }
      return path;
    }
    for (const jump of jumps) {
      const next = at + jump;
      if (next >= 0 && next <= max && !came.has(next)) {
        came.set(next, { from: at, jump });
        queue.push(next);
      }
    }
  }
  return null;
}

/** @typedef {{mode: 'goal', start: number, target: number, best: number[], jumps: number[], max: number, labelEvery: number|null}} GoalRound */
/** @typedef {{mode: 'land', start: number, amount: number, target: number, sizes: number[], options: number[], max: number, labelEvery: number|null}} LandRound */
/** @typedef {{mode: 'exact', size: number, times: number, target: number, max: number, ticks: boolean}} ExactRound */
/** @typedef {{mode: 'place', value: number, shown: string, max: number, ticks: number[]}} PlaceRound */
/** @typedef {GoalRound|LandRound|ExactRound|PlaceRound} Round */

export class NumberLineGame {
  /**
   * @param {object} options
   * @param {string} options.topic
   * @param {number} options.rounds
   * @param {Object} [options.tuning] What the author fine-tuned (see plan).
   * @param {() => number} [options.random] A source of numbers from 0 to 1, for the tests.
   */
  constructor({ topic, rounds, tuning = {}, random = Math.random }) {
    this.topic = topic in TOPICS ? topic : 'add100';
    this.plan = plan(this.topic, tuning);
    this.rounds = Math.max(1, Math.min(30, Math.floor(Number(rounds)) || 6));
    this.random = random;
    this.reset();
  }

  /** Back to before the first round. */
  reset() {
    /** @type {'intro'|'playing'|'finished'} */
    this.phase = 'intro';
    this.number = 0;
    this.level = 0;
    this.streak = 0;
    /** @type {Round|null} */
    this.current = null;
    /** @type {Array<{round: Round, moves: number[], placed: number|null, got: number}>} */
    this.log = [];
    this.clearRound();
  }

  /** What belongs to the round being played. */
  clearRound() {
    /** @type {number} Where the player is, when the round is played by jumping. */
    this.position = this.current && 'start' in this.current ? this.current.start : 0;
    /** @type {number[]} The moves of the round: jumps, or how many jumps was each try. */
    this.moves = [];
    this.roundOver = false;
    /** Played by jumping: started again, or was shown the way, so it can no longer score in full. */
    this.restarted = false;
    this.helped = false;
    /** «Where do you land»: the jumps went past the amount, and it has to start again. */
    this.over = false;
    /** «Where do you land»: the jumps are done, and it is time to say the number. */
    this.answering = false;
  }

  get score() {
    return this.log.reduce((sum, entry) => sum + entry.got, 0);
  }

  get maxScore() {
    return this.rounds * this.plan.points;
  }

  /** @returns {boolean} Whether this is the last round. */
  get lastRound() {
    return this.number >= this.rounds;
  }

  /** The first round. */
  start() {
    if (this.phase === 'intro') {
      this.phase = 'playing';
      this.next();
    }
  }

  /** The next round, or the end after the last one. */
  next() {
    if (this.phase !== 'playing') {
      return;
    }
    if (this.number >= this.rounds) {
      this.phase = 'finished';
      this.current = null;
      return;
    }
    this.number += 1;
    this.current = this.newRound();
    this.clearRound();
  }

  /**
   * @param {number} from
   * @param {number} to
   * @returns {number} A whole number between both, included.
   */
  between(from, to) {
    return from + Math.floor(this.random() * (to - from + 1));
  }

  /**
   * @template T
   * @param {T[]} list
   * @returns {T}
   */
  pick(list) {
    return list[this.between(0, list.length - 1)];
  }

  /** @returns {Round} A new round of the current level, different from the one before. */
  newRound() {
    const mode = this.plan.modes[(this.number - 1) % this.plan.modes.length];
    const make = { goal: () => this.goalRound(), land: () => this.landRound(), exact: () => this.exactRound(), place: () => this.placeRound() }[mode];
    const last = this.log.length ? this.log[this.log.length - 1].round : null;
    let round;
    for (let tries = 0; tries < 20; tries++) {
      round = make();
      if (!last || JSON.stringify(round) !== JSON.stringify(last)) {
        break;
      }
    }
    return round;
  }

  /** @returns {GoalRound} */
  goalRound() {
    const { max, jumps, labelEvery } = this.plan.levels[this.level];
    let fallback = null;
    for (let tries = 0; tries < 60; tries++) {
      const start = this.between(0, Math.floor(max / 3));
      const target = this.between(Math.floor(max / 2), max);
      const best = start === target ? null : shortestPath(start, target, max, jumps);
      if (best && best.length >= 2) {
        return { mode: 'goal', start, target, best, jumps, max, labelEvery };
      }
      fallback = best ? { mode: 'goal', start, target, best, jumps, max, labelEvery } : fallback;
    }
    // With jumps an author chose there may be no longer way: any way there will do, and the line always has one.
    const size = Math.min(max, Math.min(...jumps.filter((j) => j > 0)));
    return fallback || { mode: 'goal', start: 0, target: size, best: [size], jumps, max, labelEvery };
  }

  /** @returns {LandRound} A sum or a subtraction: the jumps add up to it, and then the player says where they landed. */
  landRound() {
    const { max, sizes, back, labelEvery } = this.plan.levels[this.level];
    const small = max <= 20;
    const low = this.between(small ? 2 : 10, small ? max - 5 : Math.floor(max * 0.65));
    const amount = this.between(small ? 2 : 11, Math.max(small ? 2 : 11, Math.min(small ? 9 : Math.floor(max * 0.4), max - low)));
    // A subtraction starts from where the sum ends, and goes back.
    const backwards = back && this.random() < 0.5;
    const start = backwards ? low + amount : low;
    const target = backwards ? low : low + amount;
    const near = [target - 1, target + 1, target - 10, target + 10, target - 2, target + 2].filter((n) => n >= 0 && n <= max);
    const options = [target];
    while (options.length < 4 && near.length) {
      options.push(near.splice(this.between(0, near.length - 1), 1)[0]);
    }
    return {
      mode: 'land', start, amount: backwards ? -amount : amount, target, sizes: sizes.map((size) => (backwards ? -size : size)),
      options: options.sort((x, y) => x - y), max, labelEvery,
    };
  }

  /** @returns {ExactRound} */
  exactRound() {
    const { tables, ticks } = this.plan.levels[this.level];
    const size = this.pick(tables);
    const times = this.between(2, 10);
    return { mode: 'exact', size, times, target: size * times, max: size * MAX_TIMES, ticks };
  }

  /** @returns {PlaceRound} */
  placeRound() {
    const conf = this.plan.levels[this.level];
    if (conf.denominators) {
      const denominator = this.pick(conf.denominators);
      let numerator;
      do {
        numerator = this.between(1, denominator * conf.max - 1);
      } while (numerator === denominator && denominator * conf.max > 2);
      const ticks = [];
      if (conf.ticks === 'denominator') {
        for (let i = 1; i < denominator * conf.max; i++) {
          ticks.push(i / denominator);
        }
      }
      return { mode: 'place', value: numerator / denominator, shown: `${numerator}/${denominator}`, max: conf.max, ticks };
    }
    const margin = Math.max(1, Math.round(conf.max * 0.05));
    const step = conf.max > 100 ? Math.round(conf.max / 100) * 5 : 1;
    const value = Math.round(this.between(margin, conf.max - margin) / step) * step;
    const ticks = [];
    for (let i = 1; i < conf.ticks; i++) {
      ticks.push((conf.max * i) / conf.ticks);
    }
    return { mode: 'place', value, shown: String(value), max: conf.max, ticks };
  }

  /**
   * Ends the round and keeps what it scored. On the first level, getting there at all counts for moving on: someone
   * starting out does not find the shortest way, and would stay there for ever.
   * @param {number} got
   * @param {number|null} placed
   * @returns {{got: number, levelUp: boolean}}
   */
  close(got, placed) {
    this.log.push({ round: this.current, moves: this.moves.slice(), placed, got });
    this.roundOver = true;
    const good = this.level === 0 ? got > 0 : got === this.plan.points;
    this.streak = good ? this.streak + 1 : 0;
    let levelUp = false;
    if (this.streak >= STREAK_TO_LEVEL_UP && this.level < this.plan.levels.length - 1) {
      this.level += 1;
      this.streak = 0;
      levelUp = true;
    }
    return { got, levelUp };
  }

  /**
   * @param {number} jump
   * @returns {boolean} Whether that jump can be made now: it stays on the line and goes the way the round asks.
   */
  canJump(jump) {
    const round = this.current;
    if (!round || this.roundOver || !('start' in round) || !Number.isInteger(jump) || jump === 0) {
      return false;
    }
    const to = this.position + jump;
    if (to < 0 || to > round.max) {
      return false;
    }
    if (round.mode === 'goal') {
      return round.jumps.includes(jump);
    }
    return !this.over && !this.answering && Math.sign(jump) === Math.sign(round.amount);
  }

  /**
   * One more jump, in the rounds played by jumping. Getting to the flag scores one point and, with the fewest jumps, two.
   * In a sum or a subtraction, the jumps have to add up to it, and the round goes on with saying where they landed.
   * @param {number} jump
   * @returns {{position: number, reached: boolean, over: boolean, got: number, levelUp: boolean}|null} Null if it cannot
   *   be done.
   */
  jump(jump) {
    if (!this.canJump(jump)) {
      return null;
    }
    this.position += jump;
    this.moves.push(jump);
    const round = /** @type {GoalRound|LandRound} */ (this.current);
    const reached = this.position === round.target;
    if (round.mode === 'land') {
      this.answering = reached;
      this.over = Math.sign(round.target - this.position) === -Math.sign(round.amount);
      return { position: this.position, reached, over: this.over, got: 0, levelUp: false };
    }
    if (!reached) {
      return { position: this.position, reached, over: false, got: 0, levelUp: false };
    }
    const full = !this.restarted && !this.helped && this.moves.length <= round.best.length;
    const { got, levelUp } = this.close(this.helped ? 0 : full ? 2 : 1, null);
    return { position: this.position, reached, over: false, got, levelUp };
  }

  /** Back to the first number of the round. It can still be done, but no longer in the fewest jumps. */
  restart() {
    const round = this.current;
    if (!round || this.roundOver || !('start' in round)) {
      return;
    }
    this.position = round.start;
    this.moves = [];
    this.over = false;
    this.answering = false;
    this.restarted = true;
  }

  /** @returns {boolean} Whether the player has gone round in circles enough for the game to offer doing it together. */
  get canHelp() {
    const round = this.current;
    if (!round || this.roundOver || this.helped || this.answering || !('start' in round)) {
      return false;
    }
    if (round.mode === 'land') {
      return this.over || this.restarted;
    }
    return this.moves.length >= round.best.length + EXTRA_BEFORE_HELP;
  }

  /**
   * «Let's do it together»: from the first number, tens first and then what is left. It does not count as getting it.
   * @returns {number[]} The jumps to make.
   */
  together() {
    const round = /** @type {GoalRound|LandRound} */ (this.current);
    this.restart();
    this.helped = true;
    if (round.mode === 'goal') {
      return shortestPath(round.start, round.target, round.max, round.jumps) || [];
    }
    const sign = Math.sign(round.amount), left = Math.abs(round.amount);
    const path = Array(Math.floor(left / 10)).fill(sign * 10);
    return left % 10 ? [...path, sign * (left % 10)] : path;
  }

  /**
   * «Where do you land»: the number the player says. At the first go it scores in full; if not, the round ends showing
   * it, with a point for the jumps. After doing it together, it scores nothing.
   * @param {number} value
   * @returns {{right: boolean, got: number, levelUp: boolean}|null}
   */
  answer(value) {
    const round = this.current;
    if (!round || round.mode !== 'land' || !this.answering || this.roundOver) {
      return null;
    }
    const right = value === round.target;
    const { got, levelUp } = this.close(this.helped ? 0 : right ? 2 : 1, value);
    return { right, got, levelUp };
  }

  /**
   * «How many jumps»: a try. It scores only at the first try. After too many wrong ones, the round ends showing it.
   * @param {number} times
   * @returns {{landed: number, right: boolean, shown: boolean, got: number, levelUp: boolean}|null}
   */
  tryJumps(times) {
    const round = this.current;
    if (!round || round.mode !== 'exact' || this.roundOver) {
      return null;
    }
    this.moves.push(times);
    const landed = times * round.size;
    const right = landed === round.target;
    if (!right && this.moves.length < TRIES_BEFORE_SHOWING) {
      return { landed, right, shown: false, got: 0, levelUp: false };
    }
    const { got, levelUp } = this.close(right && this.moves.length === 1 ? this.plan.points : 0, null);
    return { landed, right, shown: !right, got, levelUp };
  }

  /**
   * «Place it»: where the player put it. It scores by how close it is, as a share of the line.
   * @param {number} at
   * @returns {{got: number, levelUp: boolean}|null}
   */
  place(at) {
    const round = this.current;
    if (!round || round.mode !== 'place' || this.roundOver) {
      return null;
    }
    const off = Math.abs(at - round.value) / round.max;
    return this.close(off <= TOLERANCE.full ? 2 : off <= TOLERANCE.half ? 1 : 0, at);
  }

  /** Ends the game as it is, for parents that ask for the solutions. */
  finish() {
    this.phase = 'finished';
    this.current = null;
  }

  /** @returns {boolean} Whether the player did anything yet. */
  get answeredAny() {
    return this.log.length > 0 || this.moves.length > 0;
  }

  /** @returns {Object} What is saved to take the game up again. An open round starts again, with the same numbers. */
  toState() {
    return {
      topic: this.topic, phase: this.phase, number: this.number, level: this.level, streak: this.streak,
      current: this.current, log: this.log,
    };
  }

  /**
   * @param {*} state
   * @returns {boolean} Whether the state was usable.
   */
  restore(state) {
    if (!state || state.phase !== 'playing' || !state.current || !Array.isArray(state.log)
      || !this.plan.modes.includes(state.current.mode) || !(state.number >= 1 && state.number <= this.rounds)
      || !(state.level >= 0 && state.level < this.plan.levels.length)) {
      return false;
    }
    this.phase = 'playing';
    this.number = state.number;
    this.level = state.level;
    this.streak = Number(state.streak) || 0;
    this.current = state.current;
    this.log = state.log;
    this.clearRound();
    // A round that was over when it was saved: on to the next one.
    this.roundOver = this.log.length >= this.number;
    return true;
  }
}
