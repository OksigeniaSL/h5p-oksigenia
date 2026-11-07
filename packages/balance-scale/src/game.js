// The rules of H5P.BalanceScale, without any screen: what each round puts on the scale, what each weight does and what
// a round scores. The equal sign is a balance: what is on each pan has to weigh the same.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

/** What can be practised. «free» is the balance for the board, with no rounds and no points. */
export const TOPICS = ['equalities', 'groups', 'share', 'bag', 'free'];
/** Points of a round at the first go. */
export const POINTS = 2;
/** Good rounds in a row to move on to the next level. */
export const STREAK_TO_LEVEL_UP = 3;
/** Levels of every topic: featherweight, middleweight and heavyweight. */
export const LEVELS = 3;
/** Free balance: weights taken back before the game does it together. */
export const BACKS_BEFORE_HELP = 4;
/** Held balance and the mystery bag: misses before the game does it together. */
export const TRIES_BEFORE_HELP = 2;
/** A round that did not go well comes back this many rounds later, with other numbers (spaced review). */
export const REVIEW_AFTER = 2;
/** The bag number goes from 0 to this. */
export const MAX_GUESS = 30;

const ONE_TO_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TRAY_MID = [1, 2, 5, 10, 20];
const TRAY_BIG = [1, 2, 5, 10, 20, 50];

/**
 * @param {number} value
 * @returns {number} Size of a weight, as in a real set: 0 for 1–2, 1 for 3–5, 2 for 6–10 and 3 for more.
 */
export const sizeOf = (value) => (value <= 2 ? 0 : value <= 5 ? 1 : value <= 10 ? 2 : 3);

/**
 * @param {number} n
 * @param {number[]} weights
 * @returns {number[]} The fewest of those weights that make n (the tray has as many of each as needed).
 */
export function compose(n, weights) {
  const out = [];
  let left = n;
  for (const w of [...weights].sort((a, b) => b - a)) {
    while (left >= w) {
      out.push(w);
      left -= w;
    }
  }
  return out;
}

const total = (list) => list.reduce((sum, x) => sum + x, 0);

/** @typedef {{id: string, v: number, kind: 'w'|'bag'|'mystery', fixed: boolean}} Thing */
/**
 * @typedef {{topic: string, level: number, form: string, left: Thing[], right: Thing[], target: 'left'|'right'|'both'|'none',
 *   tray: number[], trayBag?: number, pool?: Thing[], pieces?: number[], solution?: number[][], bags?: {n: number, a: number},
 *   missing?: number, x?: number}} Round
 */
/** @typedef {{left: Thing[], right: Thing[], tried: number|null}} Arrangement */

export class BalanceGame {
  /**
   * @param {object} options
   * @param {string} options.topic
   * @param {number} [options.rounds]
   * @param {boolean} [options.held] The scale stays on its stops until it is let go («held»), instead of leaning at once.
   * @param {number} [options.startLevel] 0, 1 or 2.
   * @param {() => number} [options.random] A source of numbers from 0 to 1, for the tests.
   */
  constructor({ topic, rounds = 6, held = false, startLevel = 0, random = Math.random }) {
    this.topic = TOPICS.includes(topic) ? topic : 'equalities';
    this.free = this.topic === 'free';
    this.rounds = this.free ? 1 : Math.max(1, Math.min(30, Math.floor(Number(rounds)) || 6));
    this.held = !!held && !this.free;
    this.startLevel = Math.max(0, Math.min(LEVELS - 1, Math.floor(Number(startLevel)) || 0));
    this.random = random;
    this.reset();
  }

  /** Back to before the first round. */
  reset() {
    /** @type {'intro'|'playing'|'finished'} */
    this.phase = 'intro';
    this.number = 0;
    this.level = this.startLevel;
    this.streak = 0;
    /** @type {Round|null} */
    this.current = null;
    /**
     * @type {Array<{round: Round, got: number, backs: number, attempts: number, tries: Arrangement[], tried: number|null,
     *   helped: boolean, review: boolean}>}
     */
    this.log = [];
    /** @type {Array<{due: number, level: number, form: string}>} Rounds to come back to. */
    this.again = [];
    this.ids = 0;
    this.clearRound();
  }

  /** What belongs to the round being played. */
  clearRound() {
    this.attempts = 0;
    this.backs = 0;
    /** @type {Arrangement[]} */
    this.tries = [];
    this.roundOver = false;
    this.helped = false;
    this.review = false;
    /** @type {number|null} The mystery bag: the number being tried, which the bags weigh until it changes. */
    this.tried = null;
    /** @type {number|null} The mystery bag: the number in the dial, before it is tried. */
    this.guess = null;
  }

  get score() {
    return this.log.reduce((sum, entry) => sum + entry.got, 0);
  }

  get maxScore() {
    return this.free ? 0 : this.rounds * POINTS;
  }

  get lastRound() {
    return this.number >= this.rounds;
  }

  /** @returns {boolean} Whether the player did anything yet. */
  get answeredAny() {
    const r = this.current;
    return this.log.length > 0 || this.attempts > 0 || this.backs > 0
      || !!(r && (r.left.some((t) => !t.fixed) || r.right.some((t) => !t.fixed)));
  }

  /** The first round. */
  start() {
    if (this.phase === 'intro') {
      this.phase = 'playing';
      this.next();
    }
  }

  /** The next round (a round to review if one is due), or the end after the last one. */
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
    const due = this.again.findIndex((a) => a.due <= this.number);
    let level = this.level, form = null;
    if (due >= 0) {
      ({ level, form } = this.again[due]);
      this.again.splice(due, 1);
    }
    this.clearRound();
    this.current = this.newRound(level, form);
    this.review = due >= 0;
  }

  /** Ends the game where it is (parents such as a column ask for the solutions). */
  finish() {
    this.phase = 'finished';
    this.current = null;
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

  /**
   * @param {number} s
   * @param {number} k
   * @param {number} min
   * @returns {number[]} s split into k parts of at least min, or [s] if it cannot be done.
   */
  split(s, k, min = 1) {
    for (let tries = 0; tries < 200; tries++) {
      const cuts = Array.from({ length: k - 1 }, () => this.between(min, s - min)).sort((a, b) => a - b);
      const parts = [];
      let prev = 0;
      for (const c of cuts) {
        parts.push(c - prev);
        prev = c;
      }
      parts.push(s - prev);
      if (parts.every((p) => p >= min)) {
        return parts;
      }
    }
    return [s];
  }

  /**
   * @template T
   * @param {T[]} list
   * @returns {T[]} The same list, shuffled.
   */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.between(0, i);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  /**
   * @param {number} v
   * @param {'w'|'bag'|'mystery'} [kind]
   * @param {boolean} [fixed] Put by the game: it cannot be taken off.
   * @returns {Thing}
   */
  thing(v, kind = 'w', fixed = true) {
    this.ids += 1;
    return { id: `t${this.ids}`, v, kind, fixed };
  }

  /**
   * @param {number} level
   * @param {string|null} form For a review: the same kind of round, with other numbers.
   * @returns {Round}
   */
  newRound(level, form) {
    const base = { topic: this.topic, level, left: [], right: [], target: 'right', tray: [] };
    const make = { equalities: () => this.equalities(level, form), groups: () => this.groups(level), share: () => this.share(level),
      bag: () => this.bag(level), free: () => this.freeRound() }[this.topic];
    return /** @type {Round} */ ({ ...base, ...make() });
  }

  /**
   * Equalities in the order of Rittle-Johnson et al. (2011): the sum on the right, then sums on both sides, then the gap
   * on either side and three numbers, and at the top numbers where comparing is easier than adding (28 + 15 = 30 + ?).
   * @param {number} level
   * @param {string|null} form
   */
  equalities(level, form) {
    const sides = (f, given, other, target, tray) => (target === 'right'
      ? { form: f, left: given.map((v) => this.thing(v)), right: [this.thing(other)], target, tray }
      : { form: f, left: [this.thing(other)], right: given.map((v) => this.thing(v)), target, tray });
    if (level === 0) {
      const f = form || (this.random() < 0.4 ? 'sum' : 'two');
      const a = this.between(2, 9), b = this.between(2, 9), s = a + b;
      if (f === 'sum') {
        const known = this.between(Math.max(1, s - 10), s - 1);
        return { form: f, left: [this.thing(s)], right: [this.thing(known)], target: 'right', tray: ONE_TO_TEN };
      }
      const missing = this.between(1, Math.min(10, s - 1));
      return sides(f, [a, b], s - missing, 'right', ONE_TO_TEN);
    }
    for (;;) {
      if (level === 1) {
        const f = form || `${this.random() < 0.4 ? 'three' : 'two'}-${this.random() < 0.5 ? 'right' : 'left'}`;
        const [kind, target] = f.split('-');
        const given = kind === 'three'
          ? [this.between(3, 15), this.between(3, 15), this.between(3, 15)] : [this.between(4, 22), this.between(4, 22)];
        const s = total(given);
        if (s > 50) {
          continue;
        }
        const missing = this.between(3, Math.min(30, s - 2));
        return sides(f, given, s - missing, target, TRAY_MID);
      }
      const f = form || `close-${this.random() < 0.5 ? 'right' : 'left'}`;
      const target = f.split('-')[1];
      const a = this.between(14, 48), b = this.between(8, 40), s = a + b;
      if (s > 100) {
        continue;
      }
      let c = Math.round(a / 10) * 10;
      if (c === a || this.random() < 0.3) {
        c = a + this.pick([-3, -2, -1, 1, 2, 3]);
      }
      if (s - c >= 1) {
        return sides(f, [a, b], c, target, TRAY_BIG);
      }
    }
  }

  /**
   * Equal groups: bags that weigh the same. First how much they weigh, with weights; then how many bags of another
   * size weigh the same, which is dividing.
   * @param {number} level
   */
  groups(level) {
    if (level === 0) {
      const n = this.between(2, 5), a = this.between(2, 5);
      return { form: 'g0', left: Array.from({ length: n }, () => this.thing(a, 'bag')), bags: { n, a }, missing: n * a,
        target: 'right', tray: [1, 2, 5, 10] };
    }
    const top = level === 1 ? 50 : 90;
    for (;;) {
      const b = level === 1 ? this.between(2, 10) : this.between(6, 10);
      const k = this.between(2, level === 1 ? 5 : 9);
      const p = b * k;
      if (p > top) {
        continue;
      }
      const sizes = [];
      for (let a = 2; a <= 10; a++) {
        if (a !== b && p % a === 0 && p / a >= 2 && p / a <= 6) {
          sizes.push(a);
        }
      }
      if (sizes.length) {
        const a = this.pick(sizes), n = p / a;
        return { form: `g${level}`, left: Array.from({ length: n }, () => this.thing(a, 'bag')), bags: { n, a }, missing: k,
          trayBag: b, target: 'right', tray: [] };
      }
    }
  }

  /**
   * Share out: every weight on the scale, and the same on both sides. Any way that balances is good.
   * @param {number} level
   */
  share(level) {
    const [onLeft, onRight, low, high, min] = [[2, 2, 6, 12, 1], [2, 3, 12, 25, 1], [3, 3, 20, 45, 2]][level];
    for (;;) {
      const s = this.between(low, high);
      const a = this.split(s, onLeft, min), b = this.split(s, onRight, min);
      if (a.length !== onLeft || b.length !== onRight || Math.max(...a, ...b) > 20) {
        continue;
      }
      if ([...a].sort().join() === [...b].sort().join()) {
        continue;
      }
      const pieces = this.shuffle(a.concat(b));
      return { form: `s${level}`, pool: pieces.map((v) => this.thing(v, 'w', false)), pieces, solution: [a, b], target: 'both',
        tray: [] };
    }
  }

  /**
   * The mystery bag: the bags weigh the same and the scale is balanced; how much does each one weigh? Only whole
   * numbers and sums, as the balance model asks (no □ + 5 = 3).
   * @param {number} level
   */
  bag(level) {
    const x = this.between(2, 9);
    let lm, lc, rm, rc;
    if (level === 0) {
      lm = 1; lc = this.between(1, 9); rm = 0; rc = x + lc;
    } else if (level === 1) {
      lm = this.between(2, 3); lc = this.between(1, 9); rm = 0; rc = lm * x + lc;
    } else {
      for (;;) {
        lm = this.between(2, 4); rm = this.between(1, lm - 1); lc = this.between(0, 6); rc = (lm - rm) * x + lc;
        if (rc >= 1) {
          break;
        }
      }
    }
    const left = Array.from({ length: lm }, () => this.thing(0, 'mystery'));
    if (lc) {
      left.push(this.thing(lc));
    }
    const right = Array.from({ length: rm }, () => this.thing(0, 'mystery'));
    (rc > 20 && level ? [Math.ceil(rc / 2), Math.floor(rc / 2)] : [rc]).forEach((v) => right.push(this.thing(v)));
    return { form: `b${level}`, left, right, x, target: 'none', tray: [] };
  }

  freeRound() {
    return { form: 'free', target: 'both', tray: TRAY_BIG };
  }

  // --- What is on the scale ------------------------------------------------------------------------------------------

  /** @returns {boolean} Whether things can go on both pans (share out and the free balance). */
  get twoSides() {
    return !!this.current && this.current.target === 'both';
  }

  /**
   * @param {'left'|'right'} side
   * @returns {number} What a pan weighs; a mystery bag weighs the number being tried, or its own weight.
   */
  weight(side) {
    const r = this.current;
    return r ? total(r[side].map((t) => (t.kind === 'mystery' ? (this.tried ?? r.x) : t.v))) : 0;
  }

  /** @returns {'='|'<'|'>'} The left pan against the right one. */
  relation() {
    const L = this.weight('left'), R = this.weight('right');
    return L === R ? '=' : L > R ? '>' : '<';
  }

  /**
   * @param {'left'|'right'} side
   * @returns {Thing[]} What the player put on a pan.
   */
  placed(side) {
    return this.current ? this.current[side].filter((t) => !t.fixed) : [];
  }

  /** @returns {Arrangement} A copy of what is on the scale now. */
  arrangement() {
    const r = this.current;
    return { left: r.left.map((t) => ({ ...t })), right: r.right.map((t) => ({ ...t })), tried: this.tried };
  }

  /**
   * @returns {'putFirst'|'placeAll'|'chooseFirst'|null} What is missing before the scale can be checked: nothing on the
   *   player's pan, weights still to place, or no number for the bags.
   */
  notReady() {
    const r = this.current;
    if (r.topic === 'bag') {
      return this.tried == null ? 'chooseFirst' : null;
    }
    if (r.topic === 'share') {
      return r.pool.length ? 'placeAll' : null;
    }
    return this.placed(/** @type {'left'|'right'} */ (r.target)).length ? null : 'putFirst';
  }

  /**
   * A weight or a bag from the tray onto a pan.
   * @param {'left'|'right'} side
   * @param {{value?: number, kind?: 'w'|'bag', poolId?: string}} what
   * @returns {{thing?: Thing, refused?: 'otherPan'|'over'}} What went on, or why it could not.
   */
  put(side, { value, kind = 'w', poolId }) {
    const r = this.current;
    if (!r || this.roundOver || r.topic === 'bag' || (side !== 'left' && side !== 'right')) {
      return { refused: 'over' };
    }
    if (!this.twoSides && side !== r.target) {
      return { refused: 'otherPan' };
    }
    let thing;
    if (r.pool) {
      const k = r.pool.findIndex((t) => t.id === poolId);
      if (k < 0) {
        return { refused: 'over' };
      }
      [thing] = r.pool.splice(k, 1);
    } else {
      const v = Math.floor(Number(value));
      const offered = r.trayBag ? [r.trayBag] : r.tray;
      if (!offered.includes(v)) {
        return { refused: 'over' };
      }
      thing = this.thing(v, r.trayBag ? 'bag' : (kind === 'bag' ? 'bag' : 'w'), false);
    }
    r[side].push(thing);
    return { thing };
  }

  /**
   * A thing back off its pan. On the free balance, it counts as taken back.
   * @param {string} id
   * @returns {{thing?: Thing, side?: 'left'|'right', refused?: 'fixed'|'mystery'|'over'}}
   */
  take(id) {
    const r = this.current;
    if (!r || this.roundOver) {
      return { refused: 'over' };
    }
    for (const side of /** @type {Array<'left'|'right'>} */ (['left', 'right'])) {
      const k = r[side].findIndex((t) => t.id === id);
      if (k < 0) {
        continue;
      }
      const thing = r[side][k];
      if (thing.fixed) {
        return { refused: thing.kind === 'mystery' ? 'mystery' : 'fixed' };
      }
      r[side].splice(k, 1);
      if (r.pool) {
        r.pool.push(thing);
      }
      if (!this.held && !this.free) {
        this.backs += 1;
      }
      return { thing, side };
    }
    return { refused: 'over' };
  }

  /** @returns {number} How many things came off: everything the player put, at once (one taking back). */
  clear() {
    const r = this.current;
    if (!r || this.roundOver) {
      return 0;
    }
    let removed = 0;
    for (const side of /** @type {Array<'left'|'right'>} */ (['left', 'right'])) {
      const mine = r[side].filter((t) => !t.fixed);
      removed += mine.length;
      r[side] = r[side].filter((t) => t.fixed);
      if (r.pool) {
        r.pool.push(...mine);
      }
    }
    if (removed && !this.held && !this.free) {
      this.backs += 1;
    }
    return removed;
  }

  /**
   * The mystery bag: a number in the dial. The bags go back to being unknown until it is tried.
   * @param {number} value
   */
  untry(value) {
    this.guess = Math.max(0, Math.min(MAX_GUESS, Math.floor(Number(value)) || 0));
    this.tried = null;
  }

  // --- Checking --------------------------------------------------------------------------------------------------

  /**
   * After every change on the free balance: the round ends by itself when it balances (with everything placed, and
   * something of the player's on the scale). The usual mistake is explained at once. At the fourth taking back, the
   * game does it together.
   * @returns {{balanced: boolean, got?: number, levelUp?: boolean, help?: Object, slip?: Object|null, hint?: Object|null}}
   */
  afterChange() {
    const r = this.current;
    if (!r || this.roundOver || this.held || this.free || r.topic === 'bag') {
      return { balanced: !!r && this.relation() === '=' };
    }
    const balanced = this.relation() === '=';
    if (balanced && !this.notReady()) {
      const got = this.backs === 0 ? POINTS : this.backs <= 2 ? 1 : 0;
      return { balanced, ...this.close(got) };
    }
    if (this.backs >= BACKS_BEFORE_HELP) {
      return { balanced, help: this.together() };
    }
    const slip = !balanced ? this.slip() : null;
    const hint = r.topic === 'share' && !r.pool.length && !balanced ? this.hint() : null;
    return { balanced, slip, hint };
  }

  /**
   * «Let go of the scale» (held option) or «Try» (the mystery bag): 2 points at the first go, 1 at the second, and after
   * the second miss the game does it together.
   * @param {number} [guess] The mystery bag: the number to try.
   * @returns {{notReady?: string, balanced?: boolean, got?: number, levelUp?: boolean, help?: Object, slip?: Object|null,
   *   hint?: Object|null}}
   */
  release(guess) {
    const r = this.current;
    if (!r || this.roundOver) {
      return { notReady: 'over' };
    }
    if (r.topic === 'bag' && guess !== undefined) {
      this.tried = Math.max(0, Math.min(MAX_GUESS, Math.floor(Number(guess)) || 0));
    }
    const missing = this.notReady();
    if (missing) {
      return { notReady: missing };
    }
    if (this.relation() === '=') {
      return { balanced: true, ...this.close(this.attempts === 0 ? POINTS : 1) };
    }
    this.attempts += 1;
    this.tries.push(this.arrangement());
    const slip = this.slip(), hint = this.hint();
    if (this.attempts >= TRIES_BEFORE_HELP) {
      return { balanced: false, slip, hint, help: this.together() };
    }
    return { balanced: false, slip, hint };
  }

  /**
   * Ends the round and keeps what it scored. On the first level, getting there at all counts for moving on.
   * @param {number} got
   * @returns {{got: number, levelUp: boolean}}
   */
  close(got) {
    const r = this.current;
    this.log.push({ round: r, got, backs: this.backs, attempts: this.attempts, tries: this.tries, tried: this.tried,
      helped: this.helped, review: this.review });
    this.roundOver = true;
    if (got < POINTS && r.form && !this.free) {
      this.again.push({ due: this.number + REVIEW_AFTER, level: r.level, form: r.form });
    }
    const good = this.level === 0 ? got > 0 : got === POINTS;
    this.streak = good ? this.streak + 1 : 0;
    let levelUp = false;
    if (this.streak >= STREAK_TO_LEVEL_UP && this.level < LEVELS - 1) {
      this.level += 1;
      this.streak = 0;
      levelUp = true;
    }
    return { got, levelUp };
  }

  /**
   * «Let's do it together»: the game puts what was missing, and the round scores nothing.
   * @returns {{topic: string, side?: string, amount?: number, count?: number, size?: number, total?: number, half?: number,
   *   value?: number}} What it did, for the message.
   */
  together() {
    const r = this.current;
    this.helped = true;
    let done;
    if (r.topic === 'equalities') {
      const target = /** @type {'left'|'right'} */ (r.target), other = target === 'left' ? 'right' : 'left';
      const need = total(r[other].map((t) => t.v)) - total(r[target].filter((t) => t.fixed).map((t) => t.v));
      r[target] = r[target].filter((t) => t.fixed).concat(compose(need, r.tray).map((v) => this.thing(v, 'w', false)));
      done = { topic: r.topic, side: target, amount: need };
    } else if (r.topic === 'groups') {
      r.right = r.trayBag ? Array.from({ length: r.missing }, () => this.thing(r.trayBag, 'bag', false))
        : compose(r.missing, r.tray).map((v) => this.thing(v, 'w', false));
      done = r.trayBag ? { topic: r.topic, count: r.missing, size: r.trayBag }
        : { topic: r.topic, count: r.bags.n, size: r.bags.a, total: r.missing };
    } else if (r.topic === 'share') {
      const all = r.left.concat(r.right, r.pool);
      const takeOut = (vals) => vals.map((v) => all.splice(all.findIndex((t) => t.v === v), 1)[0]);
      r.left = takeOut(r.solution[0]);
      r.right = takeOut(r.solution[1]);
      r.pool = [];
      done = { topic: r.topic, half: total(r.solution[0]) };
    } else {
      this.tried = r.x;
      this.guess = r.x;
      done = { topic: r.topic, value: r.x };
    }
    this.close(0);
    return done;
  }

  /**
   * The usual mistake with 8 + 5 = 6 + ?: putting what the other side weighs (13), or adding every number (19).
   * @returns {{type: 'other'|'all', mine: number, already: number[], side: string, other: string}|null}
   */
  slip() {
    const r = this.current;
    if (r.topic !== 'equalities') {
      return null;
    }
    const here = /** @type {'left'|'right'} */ (r.target), other = here === 'left' ? 'right' : 'left';
    const mine = total(this.placed(here).map((t) => t.v));
    const already = r[here].filter((t) => t.fixed).map((t) => t.v);
    const otherWeight = total(r[other].map((t) => t.v));
    if (!already.length || !mine) {
      return null;
    }
    if (mine === otherWeight) {
      return { type: 'other', mine, already, side: here, other };
    }
    if (mine === otherWeight + total(already)) {
      return { type: 'all', mine, already, side: here, other };
    }
    return null;
  }

  /**
   * What is missing and where, not the symptom (shared/diseno-por-edades.md of Oksigenia): the weight to add to or take
   * off the player's pan, what each side has to weigh when sharing out, or which way to move the number of the bags.
   * @returns {{type: 'bag', smaller: boolean}|{type: 'share', half: number, heavy: string, weighs: number, move: number}
   *   |{type: 'shareOdd'}|{type: 'side', side: string, extra: boolean, amount: number, bags: number, size?: number}}
   */
  hint() {
    const r = this.current, L = this.weight('left'), R = this.weight('right');
    if (r.topic === 'bag') {
      const count = (list) => list.filter((t) => t.kind === 'mystery').length;
      const bagsLeft = count(r.left) - count(r.right);
      return { type: 'bag', smaller: bagsLeft > 0 ? L > R : R > L };
    }
    if (r.topic === 'share') {
      const half = (L + R) / 2;
      if (!Number.isInteger(half)) {
        return { type: 'shareOdd' };
      }
      return { type: 'share', half, heavy: L > R ? 'left' : 'right', weighs: Math.max(L, R), move: Math.max(L, R) - half };
    }
    const side = r.target === 'left' ? 'left' : 'right';
    const mine = side === 'left' ? L : R, other = side === 'left' ? R : L, d = Math.abs(L - R);
    const bags = r.trayBag && d % r.trayBag === 0 ? d / r.trayBag : 0;
    return { type: 'side', side, extra: mine > other, amount: d, bags, size: r.trayBag };
  }

  // --- Saving ------------------------------------------------------------------------------------------------------

  /** @returns {Object} What is saved to take the game up again where it was, with what is on the scale. */
  toState() {
    return {
      topic: this.topic, held: this.held, phase: this.phase, number: this.number, level: this.level, streak: this.streak,
      current: this.current, log: this.log, again: this.again, ids: this.ids, attempts: this.attempts, backs: this.backs,
      tries: this.tries, tried: this.tried, guess: this.guess, review: this.review, roundOver: this.roundOver,
    };
  }

  /**
   * @param {*} state
   * @returns {boolean} Whether the state was usable.
   */
  restore(state) {
    const r = state && state.current;
    const things = (list) => Array.isArray(list) && list.every((t) => t && typeof t.id === 'string' && Number.isFinite(t.v));
    if (!state || state.phase !== 'playing' || !r || r.topic !== this.topic || this.free || !Array.isArray(state.log)
      || !things(r.left) || !things(r.right) || (r.pool && !things(r.pool))
      || !(state.number >= 1 && state.number <= this.rounds) || !(state.level >= 0 && state.level < LEVELS)) {
      return false;
    }
    this.phase = 'playing';
    this.number = state.number;
    this.level = state.level;
    this.streak = Number(state.streak) || 0;
    this.current = r;
    this.log = state.log;
    this.again = Array.isArray(state.again) ? state.again : [];
    this.ids = Math.max(Number(state.ids) || 0, ...[...r.left, ...r.right, ...(r.pool || [])].map((t) => Number(t.id.slice(1)) || 0));
    this.clearRound();
    this.attempts = Number(state.attempts) || 0;
    this.backs = Number(state.backs) || 0;
    this.tries = Array.isArray(state.tries) ? state.tries : [];
    this.tried = Number.isFinite(state.tried) ? state.tried : null;
    this.guess = Number.isFinite(state.guess) ? state.guess : null;
    this.review = !!state.review;
    // A round that was over when it was saved: on to the next one.
    this.roundOver = this.log.length >= this.number;
    return true;
  }
}
