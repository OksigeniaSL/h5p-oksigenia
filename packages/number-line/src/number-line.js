// H5P.NumberLine: the screen of the game and its contract with H5P (score, xAPI, resume). The number line is not a
// question before the game: the jumps are the answer. The rules are in game.js and the drawing, in line.js.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import semantics from '../semantics.json';
import { Announcer, bringIntoView, el, fill, paintOuterFrames, plain, watchPageColourMode } from '../../shared/dom.js';
import { fillInDefinition, fillInResponse } from '../../shared/xapi.js';
import { cheerTier, confetti, scoreRing } from '../../shared/cheer.js';
import { Sounds, volumeSlider } from '../../shared/sound.js';
import { NumberLineGame } from './game.js';
import { Line, svg } from './line.js';
import { PIECES } from './pieces.js';
import '../../shared/dark.css';
import './number-line.css';

const H5P = window.H5P = window.H5P || {};

/** Defaults of a group of the semantics, so content saved by an older version still has every text. */
const defaultsOf = (name) => Object.fromEntries(
  semantics.find((f) => f.name === name).fields.map((f) => [f.name, f.default]),
);
const L10N = defaultsOf('l10n');
const BEHAVIOUR = defaultsOf('behaviour');
const TUNING = defaultsOf('tuning');

/** Name of the game when the content has no title, for xAPI and parents. */
const FALLBACK_TITLE = 'Number Line';
/** How long each jump of a «how many jumps» try takes, so a long try does not drag on. */
const QUICK_JUMP_MS = 170;
/** How long a wrong try stays on the line before the game shows the right one. */
const SHOW_WRONG_MS = 1200;
/** Remembers the piece chosen on this device, like the volume. */
const PIECE_KEY = 'h5p-oksigenia-piece';
/** The pieces, with the name of their text. */
const PIECE_NAMES = [['muelle', 'pieceSpring'], ['cohete', 'pieceRocket'], ['dado', 'pieceDice']];
/** What can be chosen on the first screen, with the name of its text. */
const CHOICES = [
  ['add20', 'topicAdd20'], ['add100', 'topicAdd100'], ['tables', 'topicTables'], ['place1000', 'topicPlace'],
  ['fractions', 'topicFractions'], ['free', 'topicFree'],
];
/**
 * The lines of the free mode, and the jumps each one offers.
 * @type {Array<[number, number[]]>}
 */
const FREE_RANGES = [[10, [1, 2]], [20, [1, 2, 5]], [50, [1, 2, 5, 10]], [100, [1, 2, 5, 10]]];
/** Wait for the end bells, so they come after the sound of the last move. */
const CHEER_DELAY_MS = 500;
/** Confetti pieces by how the game went. */
const CONFETTI = { perfect: 90, great: 40 };
/** How many of the 100 parts of the line an arrow key moves the mark, and how many with Page Up or Page Down. */
const KEY_STEP = 1, KEY_BIG_STEP = 5;

const ICONS = {
  ok: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.2 8.6l3 3 6.6-7" /></svg>',
  bad: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" /></svg>',
  half: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h10" /></svg>',
  soundOn: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 6h2.6L8 3v10L4.6 10H2zM10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" /></svg>',
  soundOff: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 6h2.6L8 3v10L4.6 10H2zM10.6 6.2l3.4 3.6M14 6.2l-3.4 3.6" /></svg>',
};

/**
 * @param {keyof typeof ICONS} name
 * @returns {HTMLElement} A decorative icon, hidden from screen readers.
 */
const icon = (name) => {
  const span = el('span', { class: `nl-icon nl-icon-${name}`, 'aria-hidden': 'true' });
  span.innerHTML = ICONS[name];
  return span;
};

/** @param {number} jump @returns {string} «+10» or «−1», with a real minus sign. */
const signed = (jump) => (jump > 0 ? `+${jump}` : `−${-jump}`);

/**
 * @param {Object<string, *>} attrs
 * @returns {HTMLButtonElement}
 */
const btn = (attrs) => /** @type {HTMLButtonElement} */ (el('button', attrs));

/** @param {number} ms @returns {Promise<void>} */
const wait = (ms) => new Promise((done) => {
  setTimeout(done, ms); 
});

let uid = 0;

export default class NumberLine extends H5P.EventDispatcher {
  /**
   * @param {Object} params Content of the game, as the editor saved it.
   * @param {number} contentId
   * @param {Object} [extras] H5P extras: metadata, previousState, standalone, parent.
   */
  constructor(params, contentId, extras = {}) {
    super();
    params = params || {};
    this.contentId = contentId;
    this.extras = extras;
    this.l10n = { ...L10N, ...(params.l10n || {}) };
    this.behaviour = { ...BEHAVIOUR, ...(params.behaviour || {}) };
    this.title = plain(extras.metadata && extras.metadata.title);
    this.id = `h5p-nl-${++uid}-${Math.random().toString(36).slice(2, 8)}`;
    this.locale = plain(extras.metadata && extras.metadata.defaultLanguage) || document.documentElement.lang || undefined;
    this.topic = params.topic || 'choose';
    /** Whether the player chooses the piece, or the author fixed one. */
    this.choosesPiece = !(params.character in PIECES);
    this.character = this.choosesPiece ? this.savedPiece() : params.character;
    this.roundsWanted = params.rounds;
    this.tuning = { ...TUNING, ...(params.tuning || {}) };
    this.sounds = new Sounds({ enabled: this.behaviour.enableSound !== false });
    /** @type {NumberLineGame|null} The game being played: none on the first screen if the player has to choose. */
    this.game = null;
    /** @type {{max: number, jumps: number[], moves: number[], start: number}|null} The free line, when it is on. */
    this.free = null;
    /** Something is on the move on the line: taps wait until it lands. */
    this.busy = false;
    /** @type {{text: string, kind: string}|null} What happened with the last move. */
    this.message = null;
    /** @type {Line|null} */
    this.line = null;

    const state = extras.previousState;
    const saved = state && (this.topic === 'choose' ? state.topic : this.topic);
    if (saved) {
      const game = this.newGame(saved);
      if (game.restore(state)) {
        this.game = game;
      }
    }
    if (!this.game && this.topic !== 'choose' && this.topic !== 'free') {
      this.game = this.newGame(this.topic);
    }
  }

  /**
   * @param {string} topic
   * @returns {NumberLineGame}
   */
  newGame(topic) {
    return new NumberLineGame({ topic, rounds: this.roundsWanted, tuning: this.tuning });
  }

  /** @returns {string} The piece last chosen on this device, or the first one. */
  savedPiece() {
    try {
      const saved = window.localStorage.getItem(PIECE_KEY);
      return saved in PIECES ? saved : 'muelle';
    } catch (e) {
      return 'muelle';
    }
  }

  /**
   * The row to choose the piece, by its drawing and its name, without any age: nobody wants to pick «the one for the
   * older ones», or to be told which one is theirs.
   * @returns {HTMLElement|string} Nothing if the author fixed one.
   */
  buildPicker() {
    if (!this.choosesPiece) {
      return '';
    }
    const t = this.l10n;
    this.pickButtons = PIECE_NAMES.map(([name, text]) => {
      const drawing = svg('svg', { class: 'nl-pick-icon', viewBox: '-15 -33 30 36', 'aria-hidden': 'true', focusable: 'false' });
      const group = svg('g', { class: 'nl-piece' });
      PIECES[name](group, svg, 0, 0, null);
      drawing.append(group);
      const button = btn({ type: 'button', class: `nl-button nl-secondary nl-pick nl-pick-${name}`, onclick: () => this.pick(name) });
      button.append(drawing, t[text]);
      return { name, button };
    });
    this.picker = el('div', { class: 'nl-picker', role: 'group', 'aria-label': t.pieceTitle }, [
      el('span', { class: 'nl-picker-title', text: t.pieceTitle }), ...this.pickButtons.map(({ button }) => button),
    ]);
    this.paintPicker();
    return this.picker;
  }

  paintPicker() {
    this.pickButtons.forEach(({ name, button }) => button.setAttribute('aria-pressed', String(name === this.character)));
  }

  /** @param {string} name The piece that jumps from now on, remembered on this device. */
  pick(name) {
    this.character = name;
    try {
      window.localStorage.setItem(PIECE_KEY, name);
    } catch (e) {
      // Not remembered, but it still applies to this game.
    }
    this.paintPicker();
    if (this.line) {
      this.line.character = name;
      this.line.draw();
    }
  }

  /**
   * H5P core gives its isRoot to old-style prototypes only, so a class answers it itself, as other content types do.
   * @returns {boolean} Whether the game is the main content, not inside another one.
   */
  isRoot() {
    return !!this.extras.standalone;
  }

  /**
   * @param {number} value
   * @returns {string} A number as it is written in the language of the content, without thousands separators.
   */
  format(value) {
    return new Intl.NumberFormat(this.locale, { useGrouping: false, maximumFractionDigits: 2 }).format(value);
  }

  /**
   * Called by H5P to put the game on the page.
   * @param {Object} $container The jQuery element H5P gives.
   */
  attach($container) {
    const container = $container.get ? $container.get(0) : $container;
    container.classList.add('h5p-number-line');
    if (!this.root) {
      this.build();
    }
    container.replaceChildren(this.root);
    if (this.game && this.game.phase === 'playing') {
      this.openRound();
    }
    this.render();
    // Inside another content type, the game keeps the colours of what is around it.
    if (this.isRoot() && !this.colourWatched) {
      this.colourWatched = true;
      watchPageColourMode((dark) => {
        document.documentElement.classList.toggle('h5p-oksigenia-dark', dark);
        paintOuterFrames(dark ? getComputedStyle(this.root).backgroundColor : '');
      });
    }
  }

  /** Builds the three screens once: before, during and after the game. */
  build() {
    const t = this.l10n;
    this.announcer = new Announcer();

    this.intro = el('div', { class: 'nl-intro' });

    this.roundText = el('span', { class: 'nl-round' });
    this.levelText = el('span', { class: 'nl-level' });
    this.pointsText = el('span', { class: 'nl-points' });
    this.soundButton = btn({ type: 'button', class: 'nl-button nl-secondary nl-sound', onclick: () => this.toggleSound() });
    this.challenge = el('p', { class: 'nl-challenge' });
    this.hint = el('p', { class: 'nl-hint' });
    this.lineBox = el('div', { class: 'nl-line-box' });
    this.controls = el('div', { class: 'nl-controls' });
    this.extraControls = el('div', { class: 'nl-controls nl-extra' });
    this.messageLine = el('p', { class: 'nl-message' });
    this.nextButton = btn({ type: 'button', class: 'nl-button nl-primary nl-next', onclick: () => this.next() });
    this.gameView = el('div', { class: 'nl-game' }, [
      el('div', { class: 'nl-bar' }, [
        this.roundText, this.levelText, this.pointsText,
        this.sounds.enabled ? el('span', { class: 'nl-sound-group' }, [
          this.soundButton, volumeSlider(this.sounds, t.volume, 'nl-volume', () => this.render()),
        ]) : '',
      ]),
      this.challenge, this.hint, this.lineBox, this.controls, this.extraControls, this.nextButton, this.messageLine,
    ]);

    // After the game: a cheer that matches the score, the buttons and the review of every round.
    this.ring = el('div', { class: 'nl-ring' });
    this.cheerTitle = el('p', { class: 'nl-cheer-title', id: `${this.id}-cheer` });
    this.resultTitle = el('p', { class: 'nl-result-title', id: `${this.id}-result` });
    this.cheerBox = el('div', {
      class: 'nl-cheer-text', role: 'group', tabindex: '-1', 'aria-labelledby': `${this.id}-cheer ${this.id}-result`,
    }, [this.cheerTitle, this.resultTitle]);
    this.cheer = el('div', { class: 'nl-cheer' }, [this.ring, this.cheerBox]);
    this.review = el('ol', { class: 'nl-review' });
    this.retryButton = btn({ type: 'button', class: 'nl-button nl-primary nl-retry', text: t.retry, onclick: () => this.retry() });
    this.otherButton = btn({ type: 'button', class: 'nl-button nl-secondary nl-other', text: t.otherTopic, onclick: () => this.chooseAgain() });
    this.results = el('div', { class: 'nl-results' }, [
      this.cheer, el('div', { class: 'nl-actions' }, [this.otherButton, this.retryButton]), this.review,
    ]);

    this.root = el('div', { class: 'nl' }, [this.intro, this.gameView, this.results, this.announcer.node]);
    this.fillIntro();
    if (this.topic === 'free') {
      this.openFree(FREE_RANGES[1][0]);
    }
  }

  /** The first screen: what can be chosen or, if the author chose, what it is about and «Start». */
  fillIntro() {
    const t = this.l10n;
    // No heading tags: the game does not know at which level of the page it ends up.
    const title = this.title ? el('p', { class: 'nl-title', text: this.title }) : '';
    if (this.topic === 'choose') {
      this.intro.replaceChildren(title, this.buildPicker(), el('p', { class: 'nl-summary', text: t.chooseTitle }), el('div', { class: 'nl-choices' },
        CHOICES.map(([name, text]) => btn({
          type: 'button', class: `nl-button nl-secondary nl-choice nl-choice-${name}`, text: t[text], onclick: () => this.choose(name),
        }))));
      return;
    }
    if (this.topic === 'free') {
      return;
    }
    const mode = this.game.plan.modes[0];
    const help = mode === 'exact' ? t.introTables : mode === 'place' ? t.introPlace : t.introSums;
    this.intro.replaceChildren(
      title,
      el('p', { class: 'nl-summary', text: fill(t.introSummary, { count: this.game.rounds }) }),
      el('p', { class: 'nl-help', text: help }),
      this.buildPicker(),
      btn({ type: 'button', class: 'nl-button nl-primary nl-start', text: t.start, onclick: () => this.start() }),
    );
  }

  /** @returns {'intro'|'playing'|'finished'|'free'} The screen to show. */
  get phase() {
    if (this.free) {
      return 'free';
    }
    return this.game ? this.game.phase : 'intro';
  }

  /** Shows the screen of the current phase. */
  render() {
    if (!this.root) {
      return;
    }
    const t = this.l10n, phase = this.phase, g = this.game;
    this.intro.hidden = phase !== 'intro';
    this.gameView.hidden = phase !== 'playing' && phase !== 'free';
    this.results.hidden = phase !== 'finished';

    if (phase === 'playing' || phase === 'free') {
      const playing = phase === 'playing';
      this.roundText.textContent = playing ? fill(t.round, { round: g.number, total: g.rounds }) : '';
      const levels = [t.levelOne, t.levelTwo, t.levelThree];
      this.levelText.textContent = playing && g.plan.levels.length > 1 ? levels[g.level] : '';
      this.pointsText.textContent = playing ? fill(t.points, { count: g.score }) : '';
      // An icon button: the speaker is known to everyone, and its name is there for screen readers.
      this.soundButton.replaceChildren(icon(this.sounds.muted ? 'soundOff' : 'soundOn'));
      this.soundButton.setAttribute('aria-label', this.sounds.muted ? t.soundOn : t.soundOff);
      const m = this.message;
      this.messageLine.className = `nl-message${m ? ` nl-message-${m.kind}` : ''}`;
      this.messageLine.textContent = m ? m.text : '';
      this.nextButton.hidden = !playing || !g.roundOver;
      this.nextButton.textContent = playing && g.lastRound ? t.seeResult : t.next;
    }
    if (phase === 'finished') {
      this.renderResults();
    }
    // The line measures itself once its screen shows.
    if (this.line && !this.gameView.hidden) {
      this.line.fit();
    }
    this.trigger('resize');
  }

  /**
   * A choice on the first screen.
   * @param {string} topic
   */
  choose(topic) {
    this.sounds.wake();
    if (topic === 'free') {
      this.openFree(FREE_RANGES[1][0]);
      this.render();
      bringIntoView(this.lineBox);
      this.controls.querySelector('button').focus({ preventScroll: true });
      return;
    }
    this.game = this.newGame(topic);
    this.start();
  }

  /** Back to the first screen, to practise something else. */
  chooseAgain() {
    this.game = null;
    this.free = null;
    this.message = null;
    this.activityStartTime = undefined;
    this.render();
    const first = this.intro.querySelector('button');
    if (first) {
      first.focus({ preventScroll: true });
    }
    bringIntoView(this.intro);
  }

  /** «Start»: the first round. */
  start() {
    if (!this.game || this.game.phase !== 'intro') {
      return;
    }
    if (typeof this.setActivityStarted === 'function') {
      this.setActivityStarted();
    }
    // The click on «Start» is the gesture the browser asks for before any sound.
    this.sounds.wake();
    this.game.start();
    this.openRound();
    this.render();
    this.focusRound();
  }

  /** «Next»: the next round, or the end. */
  next() {
    if (this.busy || !this.game.roundOver) {
      return;
    }
    this.game.next();
    if (this.game.phase === 'finished') {
      this.afterFinish();
      return;
    }
    this.triggerXAPI('progressed');
    this.openRound();
    this.render();
    this.focusRound();
  }

  /**
   * Puts a new line on the screen in place of the last one.
   * @param {{max: number, ticks?: number[], labels?: number[]|null, labelEvery?: number|null, units?: boolean}} options
   * @returns {Line}
   */
  newLine(options) {
    if (this.line) {
      this.line.remove();
    }
    this.line = new Line({ ...options, format: (v) => this.format(v), character: this.character });
    this.lineBox.replaceChildren(this.line.node);
    return this.line;
  }

  /** Puts the numbers of the current round on the screen. */
  openRound() {
    const round = this.game.current;
    this.message = null;
    this.busy = false;
    this.controls.replaceChildren();
    this.extraControls.replaceChildren();
    if (round.mode === 'goal') {
      this.openGoal(round);
    } else if (round.mode === 'land') {
      this.openLand(round);
    } else if (round.mode === 'exact') {
      this.openExact(round);
    } else {
      this.openPlace(round);
    }
    this.line.show();
    if ((round.mode === 'goal' || round.mode === 'land') && this.game.moves.length) {
      this.takeUpJumps(round);
    }
    if (this.game.roundOver) {
      // The game was taken up again after this round was over: only «Next» is left.
      [...this.controls.children, ...this.extraControls.children].forEach((b) => {
        /** @type {HTMLButtonElement} */ (b).disabled = true; 
      });
    }
  }

  /**
   * The buttons of a round played by jumping, and the two ways out of a tangle.
   * @param {number[]} jumps
   */
  jumpControls(jumps) {
    const t = this.l10n;
    this.jumpButtons = jumps.map((jump) => {
      const button = btn({
        type: 'button', class: 'nl-button nl-secondary nl-jump', text: signed(jump),
        'aria-label': fill(jump > 0 ? t.jumpForward : t.jumpBack, { count: Math.abs(jump) }),
        onclick: () => this.jump(jump),
      });
      this.controls.append(button);
      return { jump, button };
    });
    this.startAgainButton = btn({ type: 'button', class: 'nl-button nl-tertiary nl-again', text: t.startAgain, onclick: () => this.startAgain() });
    this.togetherButton = btn({ type: 'button', class: 'nl-button nl-tertiary nl-together', text: t.together, onclick: () => this.playTogether() });
    this.extraControls.replaceChildren(this.startAgainButton, this.togetherButton);
    this.paintJumps();
  }

  /** @param {import('./game.js').GoalRound} round */
  openGoal(round) {
    this.challenge.textContent = `${this.format(round.start)} → ${this.format(round.target)}`;
    this.hint.textContent = this.l10n.goalHint;
    const line = this.newLine({ max: round.max, units: true, labelEvery: round.labelEvery });
    line.piece = round.start;
    line.flag = round.target;
    this.jumpControls(round.jumps);
  }

  /**
   * @param {import('./game.js').LandRound} round
   * @returns {string} «23 + 14» or «37 − 14».
   */
  sumText(round) {
    return `${this.format(round.start)} ${round.amount > 0 ? '+' : '−'} ${this.format(Math.abs(round.amount))}`;
  }

  /** @param {import('./game.js').LandRound} round */
  openLand(round) {
    this.challenge.textContent = `${this.sumText(round)} = ?`;
    this.hint.textContent = this.l10n.landHint;
    const line = this.newLine({ max: round.max, units: true, labelEvery: round.labelEvery });
    line.piece = round.start;
    line.enableDrawing({ onDraw: (to) => this.jump(to - this.game.position) });
    this.jumpControls(round.sizes);
  }

  /**
   * The game was taken up again in the middle of this round: the jumps already made go back on the line.
   * @param {import('./game.js').GoalRound|import('./game.js').LandRound} round
   */
  takeUpJumps(round) {
    const g = this.game, t = this.l10n;
    let at = round.start;
    this.line.arcs = g.moves.map((jump) => {
      const arc = { from: at, to: at + jump, text: signed(jump), off: false };
      at += jump;
      return arc;
    });
    this.line.piece = at;
    this.line.draw();
    this.paintJumps();
    if (g.answering && round.mode === 'land') {
      this.askWhere(round, false);
    } else if (g.over && round.mode === 'land') {
      this.line.arcs[this.line.arcs.length - 1].off = true;
      this.line.draw();
      this.message = { text: fill(t.landOver, { position: this.format(at), amount: this.format(Math.abs(round.amount)) }), kind: 'bad' };
    }
  }

  /** The jumps that cannot be made are off, and the help shows when it is due. Focus does not stay on a button that went off. */
  paintJumps() {
    const g = this.game;
    let lostFocus = false;
    this.jumpButtons.forEach(({ jump, button }) => {
      const can = g.canJump(jump);
      lostFocus = lostFocus || (!can && document.activeElement === button);
      button.disabled = !can;
    });
    this.startAgainButton.hidden = g.roundOver || !g.moves.length;
    this.togetherButton.hidden = !g.canHelp;
    if (lostFocus) {
      const first = this.jumpButtons.find(({ button }) => !button.disabled);
      (first ? first.button : this.startAgainButton).focus();
    }
  }

  /**
   * One more jump, from a button or drawn on the line.
   * @param {number} jump
   */
  async jump(jump) {
    if (this.busy || this.game.roundOver) {
      return;
    }
    const t = this.l10n;
    const round = /** @type {import('./game.js').GoalRound|import('./game.js').LandRound} */ (this.game.current);
    const result = this.game.jump(jump);
    if (!result) {
      if (round.mode === 'land' && jump !== 0 && !this.game.over && !this.game.answering) {
        this.say({ text: t.landWrongWay, kind: 'bad' });
      }
      return;
    }
    this.busy = true;
    this.sounds.play('tick');
    await this.line.hop(result.position, { text: signed(jump), off: result.over });
    this.busy = false;
    this.afterJump(result, round);
  }

  /**
   * @param {{position: number, reached: boolean, over: boolean, got: number, levelUp: boolean}} result
   * @param {import('./game.js').GoalRound|import('./game.js').LandRound} round
   */
  afterJump(result, round) {
    const t = this.l10n, g = this.game;
    if (round.mode === 'land') {
      if (result.reached) {
        this.askWhere(round);
        return;
      }
      this.paintJumps();
      const position = this.format(result.position), amount = this.format(Math.abs(round.amount));
      if (result.over) {
        this.sounds.play('bad');
        this.say({ text: fill(t.landOver, { position, amount }), kind: 'bad' });
        return;
      }
      const done = this.format(Math.abs(result.position - round.start));
      this.say({ text: fill(t.landNow, { position, done, amount }), kind: 'plain' });
      return;
    }
    if (!result.reached) {
      this.paintJumps();
      this.say({ text: fill(t.youAreAt, { position: this.format(result.position), target: this.format(round.target) }), kind: 'plain' });
      return;
    }
    this.paintJumps();
    if (g.helped) {
      this.afterRound(t.goalTogether, 'plain', 'pass', result.levelUp);
    } else if (result.got === 2) {
      this.afterRound(t.goalBest, 'ok', 'ok', result.levelUp);
    } else {
      this.afterRound(fill(t.goalReached, { used: g.moves.length, best: round.best.length }), 'half', 'pass', result.levelUp);
    }
  }

  /** «Start again»: back to the first number of the round. */
  startAgain() {
    if (this.busy) {
      return;
    }
    this.game.restart();
    this.line.piece = this.game.position;
    this.line.arcs = [];
    this.line.draw();
    this.message = null;
    this.paintJumps();
    this.render();
    const first = this.jumpButtons.find(({ button }) => !button.disabled);
    if (first) {
      first.button.focus();
    }
  }

  /** «Let's do it together»: the game makes the jumps, tens first, and the player sees how. */
  async playTogether() {
    if (this.busy) {
      return;
    }
    const round = /** @type {import('./game.js').GoalRound|import('./game.js').LandRound} */ (this.game.current);
    const path = this.game.together();
    this.busy = true;
    this.line.piece = this.game.position;
    this.line.arcs = [];
    this.line.draw();
    this.message = null;
    this.render();
    let result = null;
    for (const jump of path) {
      result = this.game.jump(jump);
      this.sounds.play('tick');
      await this.line.hop(result.position, { text: signed(jump) });
    }
    this.busy = false;
    this.afterJump(result, round);
  }

  /**
   * The jumps are done: now to say where they landed.
   * @param {import('./game.js').LandRound} round
   * @param {boolean} [moveFocus] Not when the game is taken up again and the page has only just opened.
   */
  askWhere(round, moveFocus = true) {
    const t = this.l10n;
    this.hint.textContent = t.landAsk;
    this.extraControls.replaceChildren();
    this.controls.replaceChildren(...round.options.map((value) => btn({
      type: 'button', class: 'nl-button nl-secondary nl-option', text: this.format(value), onclick: () => this.answer(value),
    })));
    this.message = null;
    this.render();
    if (moveFocus) {
      this.controls.querySelector('button').focus();
      this.announcer.say(t.landAsk);
    }
  }

  /** @param {number} value The number the player says. */
  answer(value) {
    const t = this.l10n, g = this.game;
    const round = /** @type {import('./game.js').LandRound} */ (g.current);
    const helped = g.helped;
    const result = g.answer(value);
    if (!result) {
      return;
    }
    [...this.controls.children].forEach((b) => {
      /** @type {HTMLButtonElement} */ (b).disabled = true; 
    });
    const target = this.format(round.target);
    if (result.right && !helped) {
      this.afterRound(fill(t.landRight, { target }), 'ok', 'ok', result.levelUp);
    } else {
      this.afterRound(fill(helped ? t.landTogether : t.landWrong, { target }), helped ? 'plain' : 'half', 'pass', result.levelUp);
    }
  }

  /** @param {import('./game.js').ExactRound} round */
  openExact(round) {
    const t = this.l10n;
    this.challenge.textContent = `? × ${this.format(round.size)} = ${this.format(round.target)}`;
    this.hint.textContent = fill(t.exactHint, { size: this.format(round.size) });
    const ticks = [];
    if (round.ticks) {
      for (let value = 0; value <= round.max; value += round.size) {
        ticks.push(value);
      }
    }
    const line = this.newLine({ max: round.max, ticks, labels: [0, round.max] });
    line.piece = 0;
    line.flag = round.target;
    const times = Math.floor(round.max / round.size);
    for (let count = 1; count <= times; count++) {
      this.controls.append(btn({
        type: 'button', class: 'nl-button nl-secondary nl-count', text: String(count),
        'aria-label': fill(t.countJumps, { count }),
        onclick: () => this.tryJumps(count),
      }));
    }
  }

  /**
   * The piece makes that many jumps from the start of the line.
   * @param {number} count
   * @param {number} size
   * @param {boolean} off Whether this way does not get to the flag.
   */
  async hopFromStart(count, size, off) {
    this.line.piece = 0;
    this.line.arcs = [];
    this.line.draw();
    for (let i = 1; i <= count; i++) {
      this.sounds.play('tick');
      await this.line.hop(i * size, { off, ms: QUICK_JUMP_MS });
    }
  }

  /**
   * «How many jumps»: the piece makes them all, and where it lands says the rest. After two wrong tries, the game shows it.
   * @param {number} count
   */
  async tryJumps(count) {
    if (this.busy) {
      return;
    }
    const t = this.l10n;
    const result = this.game.tryJumps(count);
    if (!result) {
      return;
    }
    const round = /** @type {import('./game.js').ExactRound} */ (this.game.current);
    const sum = { times: round.times, size: this.format(round.size), target: this.format(round.target) };
    this.busy = true;
    await this.hopFromStart(count, round.size, !result.right);
    const wrong = fill(t.exactWrong, { count, landed: this.format(result.landed), target: this.format(round.target) });
    if (!result.right) {
      this.sounds.play('bad');
      this.say({ text: wrong, kind: 'bad' });
    }
    if (result.shown) {
      [...this.controls.children].forEach((b) => {
        /** @type {HTMLButtonElement} */ (b).disabled = true; 
      });
      await wait(SHOW_WRONG_MS);
      await this.hopFromStart(round.times, round.size, false);
      this.busy = false;
      this.afterRound(fill(t.exactShown, sum), 'plain', 'pass', result.levelUp);
      return;
    }
    this.busy = false;
    if (result.right) {
      [...this.controls.children].forEach((b) => {
        /** @type {HTMLButtonElement} */ (b).disabled = true; 
      });
      this.afterRound(fill(result.got ? t.exactRight : t.exactLater, sum), 'ok', result.got ? 'ok' : 'pass', result.levelUp);
    }
  }

  /** @param {import('./game.js').PlaceRound} round */
  openPlace(round) {
    const t = this.l10n;
    this.challenge.textContent = this.placeText(round);
    this.hint.textContent = t.placeHint;
    const line = this.newLine({ max: round.max, ticks: round.ticks, labels: [0, round.max] });
    const node = line.node;
    node.setAttribute('role', 'slider');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', fill(t.lineLabel, { max: this.format(round.max), number: this.placeText(round) }));
    node.setAttribute('aria-valuemin', '0');
    node.setAttribute('aria-valuemax', String(round.max));
    node.setAttribute('aria-valuetext', t.notPlaced);
    node.classList.add('nl-line-place');
    node.addEventListener('click', (e) => this.mark(line.valueAtEvent(e)));
    node.addEventListener('keydown', (e) => this.markKey(e, round));
    this.hereButton = btn({
      type: 'button', class: 'nl-button nl-primary nl-here', text: t.here, disabled: true, onclick: () => this.place(),
    });
    this.controls.append(this.hereButton);
  }

  /**
   * @param {import('./game.js').PlaceRound} round
   * @returns {string} The number to place, in the language of the content: a fraction goes as it is.
   */
  placeText(round) {
    return round.shown.includes('/') ? round.shown : this.format(round.value);
  }

  /** @param {number} value Puts the mark there. */
  mark(value) {
    if (this.busy || this.game.roundOver) {
      return;
    }
    this.line.mark = value;
    this.line.draw();
    this.line.node.setAttribute('aria-valuenow', String(value));
    this.line.node.setAttribute('aria-valuetext', this.format(value));
    this.hereButton.disabled = false;
  }

  /**
   * The keys of the line: the same as a slider, and Enter to say that is the place.
   * @param {KeyboardEvent} e
   * @param {import('./game.js').PlaceRound} round
   */
  markKey(e, round) {
    const part = round.max / 100;
    const moves = {
      ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP,
      PageUp: KEY_BIG_STEP, PageDown: -KEY_BIG_STEP,
    };
    let value = null;
    if (e.key in moves) {
      // The first key starts from the middle of the line.
      value = (this.line.mark ?? round.max / 2) + moves[e.key] * part;
    } else if (e.key === 'Home') {
      value = 0;
    } else if (e.key === 'End') {
      value = round.max;
    } else if (e.key === 'Enter' && !this.hereButton.disabled) {
      e.preventDefault();
      this.place();
      return;
    }
    if (value !== null) {
      e.preventDefault();
      this.mark(Math.max(0, Math.min(round.max, value)));
    }
  }

  /** «Here»: that is the place. It shows where it really was. */
  place() {
    if (this.busy || this.line.mark === null) {
      return;
    }
    const t = this.l10n;
    const round = /** @type {import('./game.js').PlaceRound} */ (this.game.current);
    const result = this.game.place(this.line.mark);
    if (!result) {
      return;
    }
    this.line.solution = round.value;
    this.line.solutionText = this.placeText(round);
    this.line.draw();
    this.line.node.classList.remove('nl-line-place');
    this.line.node.removeAttribute('tabindex');
    this.hereButton.hidden = true;
    const text = result.got === 2 ? t.placeClose : result.got === 1 ? t.placeNear : t.placeFar;
    const kind = result.got === 2 ? 'ok' : result.got === 1 ? 'half' : 'bad';
    this.afterRound(text, kind, result.got === 2 ? 'ok' : result.got === 1 ? 'pass' : 'bad', result.levelUp);
  }

  /**
   * A round is over: what it scored, and on to «Next».
   * @param {string} text
   * @param {string} kind
   * @param {'ok'|'pass'|'bad'} sound
   * @param {boolean} levelUp
   */
  afterRound(text, kind, sound, levelUp) {
    const t = this.l10n;
    const levels = [t.levelOne, t.levelTwo, t.levelThree];
    this.sounds.play(sound);
    const said = levelUp ? `${text} ${fill(t.levelUp, { place: levels[this.game.level] })}` : text;
    this.message = { text: said, kind };
    this.render();
    this.nextButton.focus();
    bringIntoView(this.nextButton);
    this.announcer.say(said);
  }

  /**
   * Shows and reads what happened, in the middle of a round.
   * @param {{text: string, kind: string}} message
   */
  say(message) {
    this.message = message;
    this.render();
    this.announcer.say(message.text);
  }

  /** The focus goes to where the round is played, and the round comes into view. */
  focusRound() {
    const round = this.game.current;
    const first = round.mode === 'place' ? this.line.node : this.controls.querySelector('button:not(:disabled)');
    if (first) {
      /** @type {HTMLElement} */ (first).focus({ preventScroll: true });
    }
    bringIntoView(this.challenge);
    this.announcer.say(`${this.challenge.textContent}. ${this.hint.textContent}`);
  }

  // --- The free line: no rounds and no points, for the board or for trying things out ------------------------------

  /** @param {number} max Opens the free line, up to that number. */
  openFree(max) {
    const t = this.l10n;
    const [, sizes] = FREE_RANGES.find(([end]) => end === max);
    this.free = { max, moves: [], start: 0, jumps: [...sizes, ...sizes.map((size) => -size)] };
    this.message = null;
    this.challenge.textContent = '';
    this.hint.textContent = t.freeHelp;
    const line = this.newLine({ max, units: true });
    line.piece = 0;
    line.enableDrawing({
      onDraw: (to) => this.freeJump(to - line.piece),
      // A tap goes there straight away, with no jump: to set up an example.
      onTap: (at) => {
        if (!this.busy) {
          this.free.start = at;
          this.free.moves = [];
          line.piece = at;
          line.arcs = [];
          line.draw();
          this.paintFree();
        }
      },
    });
    this.freeButtons = this.free.jumps.map((jump) => {
      const button = btn({
        type: 'button', class: 'nl-button nl-secondary nl-jump', text: signed(jump),
        'aria-label': fill(jump > 0 ? t.jumpForward : t.jumpBack, { count: Math.abs(jump) }),
        onclick: () => this.freeJump(jump),
      });
      return { jump, button };
    });
    this.controls.replaceChildren(...this.freeButtons.map(({ button }) => button));
    this.undoButton = btn({ type: 'button', class: 'nl-button nl-tertiary nl-undo', text: t.undo, onclick: () => this.freeUndo() });
    this.freeAgainButton = btn({ type: 'button', class: 'nl-button nl-tertiary nl-again', text: t.startAgain, onclick: () => this.freeAgain() });
    const ranges = FREE_RANGES.map(([end]) => btn({
      type: 'button', class: `nl-button nl-tertiary nl-range${end === max ? ' nl-range-on' : ''}`, 'aria-pressed': String(end === max),
      text: fill(t.freeRange, { max: this.format(end) }), onclick: () => {
        this.openFree(end); this.render(); 
      },
    }));
    const back = this.topic === 'choose'
      ? [btn({ type: 'button', class: 'nl-button nl-tertiary nl-other', text: t.otherTopic, onclick: () => this.chooseAgain() })]
      : [];
    this.extraControls.replaceChildren(this.undoButton, this.freeAgainButton, ...ranges, ...back);
    // With the free line as the only thing on the page, there is no first screen to choose the piece on.
    if (this.topic === 'free') {
      this.extraControls.append(this.picker || this.buildPicker());
    }
    line.show();
    this.paintFree();
  }

  /** What can be done on the free line, and where the piece is. */
  paintFree() {
    const t = this.l10n;
    let lostFocus = false;
    this.freeButtons.forEach(({ jump, button }) => {
      const to = this.line.piece + jump;
      const can = to >= 0 && to <= this.free.max;
      lostFocus = lostFocus || (!can && document.activeElement === button);
      button.disabled = !can;
    });
    this.undoButton.disabled = !this.free.moves.length;
    this.freeAgainButton.disabled = !this.free.moves.length;
    if (lostFocus) {
      const first = this.freeButtons.find(({ button }) => !button.disabled);
      if (first) {
        first.button.focus();
      }
    }
    this.message = { text: fill(t.freeAt, { position: this.format(this.line.piece) }), kind: 'plain' };
    this.render();
  }

  /** @param {number} jump One more jump on the free line. */
  async freeJump(jump) {
    const to = this.line.piece + jump;
    if (this.busy || jump === 0 || to < 0 || to > this.free.max) {
      return;
    }
    this.busy = true;
    this.sounds.play('tick');
    this.free.moves.push(jump);
    await this.line.hop(to, { text: signed(jump) });
    this.busy = false;
    this.paintFree();
    this.announcer.say(this.message.text);
  }

  /** «Undo»: the last jump of the free line. */
  freeUndo() {
    if (this.busy || !this.free.moves.length) {
      return;
    }
    const jump = this.free.moves.pop();
    this.line.piece -= jump;
    this.line.arcs.pop();
    this.line.draw();
    this.paintFree();
    this.announcer.say(this.message.text);
  }

  /** «Start again» on the free line: back to where it started, with the arcs gone. */
  freeAgain() {
    if (this.busy) {
      return;
    }
    this.free.moves = [];
    this.line.piece = this.free.start;
    this.line.arcs = [];
    this.line.draw();
    this.paintFree();
  }

  // --- The end ---------------------------------------------------------------------------------------------------

  /** The game is over: the score goes out once, and the results show. */
  afterFinish() {
    this.render();
    this.trigger(this.answeredEvent());
    // H5P platforms such as Moodle stop saving the state once the score is sent, so the last saved state would
    // bring back a game that is over. It is deleted instead: a reload starts a new game.
    if (this.isRoot() && H5P.deleteUserData && this.contentId !== undefined) {
      H5P.deleteUserData(this.contentId, 'state', 0);
    }
    this.cheerBox.focus();
    bringIntoView(this.cheer);
    const tier = cheerTier(this.game.score, this.game.maxScore);
    // Confetti only for a game that went well, and more of it for a perfect one.
    confetti(this.root, CONFETTI[tier] || 0);
    setTimeout(() => this.sounds.play(tier === 'perfect' || tier === 'great' ? 'cheer' : 'done'), CHEER_DELAY_MS);
  }

  /** The end screen: the cheer and what happened in each round. */
  renderResults() {
    const g = this.game, t = this.l10n;
    const tier = cheerTier(g.score, g.maxScore);
    this.cheer.className = `nl-cheer nl-cheer-${tier}`;
    this.ring.replaceChildren(scoreRing(g.score, g.maxScore));
    this.cheerTitle.textContent = { perfect: t.cheerPerfect, great: t.cheerGreat, good: t.cheerGood, keep: t.cheerKeep }[tier];
    this.resultTitle.textContent = fill(t.resultTitle, { score: g.score, total: g.maxScore });
    this.review.replaceChildren(...g.log.map((entry) => {
      const of = g.plan.points;
      const state = entry.got === of ? 'ok' : entry.got > 0 ? 'half' : 'bad';
      return el('li', { class: `nl-review-item nl-${state}` }, [
        icon(state),
        el('div', { class: 'nl-review-body' }, [
          el('p', { class: 'nl-review-asked', text: this.askedText(entry.round) }),
          el('p', { class: 'nl-review-did', text: this.didText(entry) }),
        ]),
        el('p', { class: 'nl-review-points', text: fill(t.reviewPoints, { got: entry.got, of }) }),
      ]);
    }));
    this.retryButton.hidden = !this.behaviour.enableRetry;
    this.otherButton.hidden = this.topic !== 'choose';
  }

  /**
   * @param {import('./game.js').Round} round
   * @returns {string} What a round asked, for the review.
   */
  askedText(round) {
    const t = this.l10n;
    if (round.mode === 'goal') {
      return fill(t.reviewGoal, { start: this.format(round.start), target: this.format(round.target) });
    }
    if (round.mode === 'land') {
      return fill(t.reviewLand, { sum: `${this.sumText(round)} = ${this.format(round.target)}` });
    }
    if (round.mode === 'exact') {
      return fill(t.reviewExact, { size: this.format(round.size), target: this.format(round.target) });
    }
    return fill(t.reviewPlace, { number: this.placeText(round) });
  }

  /**
   * @param {{round: import('./game.js').Round, moves: number[], placed: number|null}} entry
   * @returns {string} What the player did in a round, for the review.
   */
  didText({ round, moves, placed }) {
    const t = this.l10n;
    if (round.mode === 'goal') {
      return fill(t.reviewDidGoal, { path: moves.map(signed).join(' '), best: round.best.length, used: moves.length });
    }
    if (round.mode === 'land') {
      return fill(t.reviewDidLand, { path: moves.map(signed).join(' '), value: this.format(placed) });
    }
    if (round.mode === 'exact') {
      return moves.map((n) => `${n} → ${this.format(n * round.size)}`).join('; ');
    }
    return fill(t.reviewDidPlace, { value: this.format(placed) });
  }

  /** The speaker button: mutes or brings the sound back, and remembers it. */
  toggleSound() {
    this.sounds.setMuted(!this.sounds.muted);
    this.render();
    this.announcer.say(this.sounds.muted ? this.l10n.soundMuted : this.l10n.soundUnmuted);
    this.sounds.play('tick');
  }

  /** «Play again»: a new game on the same topic, a new attempt. */
  retry() {
    this.resetTask({ sameTopic: true });
    this.start();
  }

  // --- The H5P contract (Question type) --------------------------------------------------------------------------

  /** @returns {number} Points of the rounds played. */
  getScore() {
    return this.game ? this.game.score : 0;
  }

  /** @returns {number} The most that can be scored. */
  getMaxScore() {
    return this.game ? this.game.maxScore : 0;
  }

  /** @returns {boolean} Whether the player did anything yet. */
  getAnswerGiven() {
    return !!this.game && (this.game.answeredAny || this.game.phase === 'finished');
  }

  /** @returns {string} The title of the content, for parents and reports. */
  getTitle() {
    const title = this.title || FALLBACK_TITLE;
    return H5P.createTitle ? H5P.createTitle(title) : title;
  }

  /** Ends the game without a score message and shows what was played (parents such as a column call it). */
  showSolutions() {
    if (this.game && this.game.phase !== 'finished') {
      this.game.finish();
    }
    this.render();
  }

  /**
   * Back to the start, as a new attempt.
   * @param {{sameTopic?: boolean}} [options]
   */
  resetTask({ sameTopic = false } = {}) {
    if (this.game) {
      if (this.topic === 'choose' && !sameTopic) {
        this.game = null;
      } else {
        this.game.reset();
      }
    }
    // A new attempt: its duration in the xAPI result counts from its own start.
    this.activityStartTime = undefined;
    this.message = null;
    this.busy = false;
    this.render();
  }

  /**
   * @returns {Object|undefined} What H5P saves to resume the game. Nothing before the first round or once it is over:
   *   H5P core would take a null for content that has changed, and show its «Data Reset» dialog.
   */
  getCurrentState() {
    return this.game && this.game.phase === 'playing' ? this.game.toState() : undefined;
  }

  /**
   * @param {{round: import('./game.js').Round, moves: number[], placed: number|null, got: number}} entry
   * @returns {{accepted: string[], given: string}} A round for the report, with what it asked in its own text, because
   *   Moodle's table only shows the answers.
   */
  reportOf(entry) {
    const { round, moves, placed, got } = entry;
    if (round.mode === 'goal') {
      const way = `${this.format(round.start)} → ${this.format(round.target)}:`;
      const given = `${way} ${moves.map(signed).join(' ')}`;
      const best = `${way} ${round.best.map(signed).join(' ')}`;
      return { accepted: got === 2 ? [best, given] : [best], given };
    }
    if (round.mode === 'land') {
      const sum = this.sumText(round);
      return { accepted: [`${sum} = ${this.format(round.target)}`], given: `${sum} = ${this.format(placed)}` };
    }
    if (round.mode === 'exact') {
      const product = (n) => `${n} × ${this.format(round.size)} = ${this.format(n * round.size)}`;
      return { accepted: [product(round.times)], given: moves.map(product).join('; ') };
    }
    const text = this.placeText(round);
    const right = `${text} → ${this.format(round.value)}`;
    const given = `${text} → ${this.format(placed)}`;
    return { accepted: got > 0 ? [right, given] : [right], given };
  }

  /** @returns {Object} The single «answered» statement of a game, with a fill-in gap per round. */
  answeredEvent() {
    const g = this.game;
    const event = this.createXAPIEventTemplate('answered');
    const definition = event.getVerifiedStatementValue(['object', 'definition']) || {};
    const rounds = g.log.map((entry) => this.reportOf(entry));
    const fillIn = fillInDefinition({
      intro: this.title || FALLBACK_TITLE, gaps: rounds.map((r) => ({ accepted: r.accepted })), caseSensitive: false,
    });
    event.data.statement.object.definition = {
      ...definition,
      ...fillIn,
      extensions: { ...(definition.extensions || {}), ...fillIn.extensions },
    };
    // No pass or fail: a game has a score, not a pass mark.
    event.setScoredResult(g.score, g.maxScore, this, true, undefined);
    event.data.statement.result.response = fillInResponse(rounds.map((r) => r.given));
    return event;
  }

  /** @returns {{statement: Object}} The final statement, as Moodle asks for it when the game is over. */
  getXAPIData() {
    return { statement: this.answeredEvent().data.statement };
  }
}

H5P.NumberLine = NumberLine;
