// H5P.AlphabetWheel: the screen of the alphabet wheel and its contract with H5P (score, xAPI, resume).
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import semantics from '../semantics.json';
import { createMatcher, splitAlternatives } from '../../shared/answer.js';
import { Countdown, formatTime } from '../../shared/timer.js';
import { Announcer, el, fill, plain } from '../../shared/dom.js';
import { fillInDefinition, fillInResponse } from '../../shared/xapi.js';
import { cheerTier, confetti, scoreRing } from '../../shared/cheer.js';
import { Sounds } from '../../shared/sound.js';
import { WheelGame } from './game.js';
import './alphabet-wheel.css';

const H5P = window.H5P = window.H5P || {};

/** Defaults of a group of the semantics, so content saved by an older version still has every text. */
const defaultsOf = (name) => Object.fromEntries(
  semantics.find((f) => f.name === name).fields.map((f) => [f.name, f.default]),
);
const L10N = defaultsOf('l10n');
const BEHAVIOUR = defaultsOf('behaviour');

/** Name of the game when the content has no title, for xAPI and parents. */
const FALLBACK_TITLE = 'Alphabet Wheel';
/** Distance of the letters from the centre, in % of the wheel. */
const RING_RADIUS = 41;
/** Largest size of a letter, in % of the wheel, and the budget shared by all the letters around the ring. */
const DOT_MAX = 9;
const DOT_BUDGET = 240;
/** Seconds left from which each second ticks, and the ones that are announced. */
const TICK_FROM = 5;
const ANNOUNCED = { 60: 'oneMinuteLeft', 10: 'tenSecondsLeft' };
/** Wait for the end bells, so they come after the sound of the last answer. */
const CHEER_DELAY_MS = 500;
/** Confetti pieces by how the game went. */
const CONFETTI = { perfect: 90, great: 40 };

const ICONS = {
  ok: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.2 8.6l3 3 6.6-7" /></svg>',
  bad: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" /></svg>',
  passed: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.8 8h9.4M8.8 4.4L12.4 8l-3.6 3.6" /></svg>',
  soundOn: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 6h2.6L8 3v10L4.6 10H2zM10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.6 3.6a6.2 6.2 0 0 1 0 8.8" /></svg>',
  soundOff: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 6h2.6L8 3v10L4.6 10H2zM10.6 6.2l3.6 3.6M14.2 6.2l-3.6 3.6" /></svg>',
};

/** @typedef {'ok'|'bad'|'passed'|'soundOn'|'soundOff'} IconName */

/**
 * @param {IconName} name
 * @returns {HTMLElement} A decorative icon, hidden from screen readers.
 */
const icon = (name) => {
  const span = el('span', { class: `aw-icon aw-icon-${name}`, 'aria-hidden': 'true' });
  span.innerHTML = ICONS[name];
  return span;
};

let uid = 0;

export default class AlphabetWheel extends H5P.EventDispatcher {
  /**
   * @param {Object} params Content of the wheel, as the editor saved it.
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
    this.id = `h5p-aw-${++uid}-${Math.random().toString(36).slice(2, 8)}`;

    this.items = (params.items || [])
      .map((it) => ({
        letter: plain(it.letter),
        kind: it.kind === 'contains' ? 'contains' : 'starts',
        clue: plain(it.clue),
        answers: [plain(it.answer), ...splitAlternatives(plain(it.alternatives))].filter(Boolean),
      }))
      .filter((it) => it.letter && it.clue && it.answers.length);

    this.game = new WheelGame(this.items, createMatcher({
      language: params.language,
      extraLetters: plain(params.extraLetters),
      ignoreCase: this.behaviour.ignoreCase !== false,
      ignoreAccents: this.behaviour.ignoreAccents !== false,
    }));

    this.sounds = new Sounds({ enabled: this.behaviour.enableSound !== false });
    this.timeLimit = Math.max(0, Math.floor(Number(params.timeLimit) || 0));
    this.paused = false;
    this.confirmingFinish = false;
    this.solutionsShown = false;
    this.feedback = null;

    let timeLeft = this.timeLimit;
    const state = extras.previousState;
    if (state && this.game.restore(state.game)) {
      if (this.timeLimit && Number.isFinite(state.timeLeft)) {
        timeLeft = Math.min(this.timeLimit, Math.max(0, state.timeLeft));
      }
      // A timed game comes back paused: the clock does not run while the page loads and the player looks.
      this.paused = this.game.phase === 'playing' && this.timeLimit > 0;
    }
    this.timer = this.timeLimit ? this.newTimer(timeLeft) : null;
  }

  /**
   * H5P core gives its isRoot to old-style prototypes only, so a class answers it itself, as other content types do.
   * @returns {boolean} Whether the wheel is the main content, not inside another one.
   */
  isRoot() {
    return !!this.extras.standalone;
  }

  /**
   * @param {number} seconds Time left.
   * @returns {Countdown} The clock of the game, with its ticks, announcements and end.
   */
  newTimer(seconds) {
    return new Countdown({
      seconds,
      onTick: (left) => {
        this.paintClock();
        if (left > 0 && left <= TICK_FROM) {
          this.sounds.play('tick');
        }
        if (ANNOUNCED[left]) {
          this.announcer.say(this.l10n[ANNOUNCED[left]]);
        }
      },
      onEnd: () => {
        this.sounds.play('timeUp');
        this.game.finish('time');
        this.afterFinish(this.l10n.timeUp);
      },
    });
  }

  /**
   * Called by H5P to put the game on the page.
   * @param {Object} $container The jQuery element H5P gives.
   */
  attach($container) {
    const container = $container.get ? $container.get(0) : $container;
    container.classList.add('h5p-alphabet-wheel');
    if (!this.root) {
      this.build();
    }
    container.replaceChildren(this.root);
    this.render();
    if (this.timer && !this.visibilityWatched) {
      this.visibilityWatched = true;
      // The clock stops when the player leaves the page, so the time is not lost while away.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.game.phase === 'playing' && !this.paused) {
          this.setPaused(true, false);
        }
      });
    }
  }

  /** Builds the three screens once: before, during and after the game. */
  build() {
    const t = this.l10n;
    const ids = {
      input: `${this.id}-input`, lastMove: `${this.id}-last`, cheer: `${this.id}-cheer`, result: `${this.id}-result`,
    };
    this.announcer = new Announcer();

    this.introButton = el('button', { type: 'button', class: 'aw-button aw-primary', text: t.start, onclick: () => this.start() });
    this.intro = el('div', { class: 'aw-intro' }, [
      // No heading tags: the game does not know at which level of the page it ends up.
      this.title ? el('p', { class: 'aw-title', text: this.title }) : '',
      el('p', { class: 'aw-summary', text: [
        fill(t.introLetters, { count: this.items.length }),
        this.timeLimit ? fill(t.introTime, { time: formatTime(this.timeLimit) }) : t.introNoTime,
      ].join(' · ') }),
      el('p', { class: 'aw-help', text: t.introHelp }),
      this.introButton,
    ]);

    const n = this.items.length;
    this.letters = this.items.map((it, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const li = el('li', { class: 'aw-letter' }, [
        el('span', { class: 'aw-letter-text', 'aria-hidden': 'true', text: it.letter }),
        el('span', { class: 'aw-badge', 'aria-hidden': 'true' }),
        el('span', { class: 'aw-letter-state h5p-oksigenia-sr-only' }),
      ]);
      li.style.left = `${50 + RING_RADIUS * Math.cos(angle)}%`;
      li.style.top = `${50 + RING_RADIUS * Math.sin(angle)}%`;
      // The badge goes outwards, so it never covers the next letter.
      li.style.setProperty('--aw-x', Math.cos(angle).toFixed(3));
      li.style.setProperty('--aw-y', Math.sin(angle).toFixed(3));
      return li;
    });
    this.hubLetter = el('span', { class: 'aw-hub-letter', 'aria-hidden': 'true' });
    this.wheel = el('div', { class: 'aw-wheel' }, [
      el('ol', { class: 'aw-letters', 'aria-label': t.wheel }, this.letters),
      el('div', { class: 'aw-hub', 'aria-hidden': 'true' }, [this.hubLetter]),
    ]);
    this.wheel.style.setProperty('--aw-dot', `${Math.min(DOT_MAX, DOT_BUDGET / Math.max(n, 1))}cqi`);

    this.round = el('span', { class: 'aw-round' });
    this.clockValue = el('span', { class: 'aw-clock-value' });
    this.clock = el('span', { class: 'aw-clock', role: 'timer', 'aria-label': t.timeLeft }, [
      el('span', { class: 'aw-clock-label', text: t.timeLeft }), this.clockValue,
    ]);
    this.pauseButton = el('button', { type: 'button', class: 'aw-button aw-secondary aw-pause', onclick: () => this.setPaused(!this.paused, true) });
    this.soundButton = el('button', { type: 'button', class: 'aw-button aw-secondary aw-sound', onclick: () => this.toggleSound() });
    this.kind = el('p', { class: 'aw-kind' });
    this.clue = el('p', { class: 'aw-clue' });
    this.input = /** @type {HTMLInputElement} */ (el('input', {
      id: ids.input, class: 'aw-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      // No description pointing at the clue: screen readers would read it again each time it changes, before the
      // result of the last letter. The clue is announced once, after that result (announceCurrent).
      enterkeyhint: 'done', maxlength: '100',
    }));
    this.passButton = el('button', { type: 'button', class: 'aw-button aw-secondary aw-pass', onclick: () => this.pass() }, [icon('passed'), t.pass]);
    const onsubmit = (e) => {
      e.preventDefault();
      this.check();
    };
    this.form = el('form', { class: 'aw-form', novalidate: true, onsubmit }, [
      el('label', { class: 'aw-label', for: ids.input, text: t.yourAnswer }),
      el('div', { class: 'aw-row' }, [
        this.input,
        el('button', { type: 'submit', class: 'aw-button aw-primary aw-check' }, [icon('ok'), t.check]),
        this.passButton,
      ]),
    ]);
    this.question = el('div', { class: 'aw-question' }, [this.kind, this.clue, this.form]);
    this.pausedNote = el('p', { class: 'aw-paused', text: t.paused });
    this.feedbackLine = el('p', { class: 'aw-feedback' });
    this.counts = el('p', { class: 'aw-counts' });
    this.finishButton = el('button', { type: 'button', class: 'aw-button aw-tertiary aw-finish', onclick: () => this.askFinish() });
    this.panel = el('div', { class: 'aw-panel' }, [
      el('div', { class: 'aw-bar' }, [
        this.round, this.timer ? this.clock : '', this.timer ? this.pauseButton : '', this.sounds.enabled ? this.soundButton : '',
      ]),
      this.question, this.pausedNote, this.feedbackLine, this.counts, this.finishButton,
    ]);
    this.gameView = el('div', { class: 'aw-game' }, [this.wheel, this.panel]);

    // After the game: a cheer that matches the score, then the review of every letter.
    this.ring = el('div', { class: 'aw-ring' });
    // The end takes the focus, and with it everything a screen reader has to say: what happened with the last letter,
    // the message and the score. A live announcement at that moment would be cut off by the focus.
    this.lastMove = el('span', { class: 'aw-last-move h5p-oksigenia-sr-only', id: ids.lastMove });
    this.cheerTitle = el('p', { class: 'aw-cheer-title', id: ids.cheer });
    this.resultTitle = el('p', { class: 'aw-result-title', id: ids.result });
    this.endReason = el('p', { class: 'aw-end-reason' });
    this.cheer = el('div', { class: 'aw-cheer' }, [
      this.ring,
      this.cheerBox = el('div', {
        class: 'aw-cheer-text', role: 'group', tabindex: '-1',
        'aria-labelledby': `${ids.lastMove} ${ids.cheer} ${ids.result}`,
      }, [this.lastMove, this.cheerTitle, this.resultTitle, this.endReason]),
    ]);
    this.review = el('ol', { class: 'aw-review' });
    this.solutionsButton = el('button', { type: 'button', class: 'aw-button aw-secondary aw-show-solutions', text: t.showSolutions, onclick: () => this.showSolutions() });
    this.retryButton = el('button', { type: 'button', class: 'aw-button aw-primary aw-retry', text: t.retry, onclick: () => this.retry() });
    this.results = el('div', { class: 'aw-results' }, [
      this.cheer, this.review,
      el('div', { class: 'aw-actions' }, [this.solutionsButton, this.retryButton]),
    ]);

    this.empty = el('p', { class: 'aw-empty', text: t.noItems });
    this.root = el('div', { class: 'aw' }, [this.empty, this.intro, this.gameView, this.results, this.announcer.node]);
  }

  /**
   * @param {string} letter
   * @param {string} status
   * @returns {string} «A: right», in the punctuation of the language.
   */
  letterStatus(letter, status) {
    return fill(this.l10n.letterStatus, { letter, status });
  }

  /**
   * @param {WheelItem} it
   * @returns {string} «Starts with A» or «Contains A».
   */
  kindText(it) {
    return fill(it.kind === 'contains' ? this.l10n.contains : this.l10n.startsWith, { letter: it.letter });
  }

  /** Shows the screen of the current phase, with the state of every letter. */
  render() {
    if (!this.root) {
      return;
    }
    const g = this.game, t = this.l10n, phase = g.phase;
    const none = !this.items.length;
    this.empty.hidden = !none;
    this.intro.hidden = none || phase !== 'intro';
    this.gameView.hidden = none || phase !== 'playing';
    this.results.hidden = none || phase !== 'finished';

    // The letters: colour, badge and spoken state, so nothing depends on colour alone.
    const spoken = { ok: t.statusCorrect, bad: t.statusWrong, passed: t.statusPassed, pending: t.statusPending };
    this.letters.forEach((li, i) => {
      const status = g.status[i];
      const current = phase === 'playing' && i === g.pos;
      li.className = `aw-letter aw-${status}${current ? ' aw-current' : ''}`;
      li.toggleAttribute('aria-current', current);
      li.querySelector('.aw-badge').replaceChildren(status in ICONS ? icon(/** @type {IconName} */ (status)) : '');
      li.querySelector('.aw-letter-state').textContent =
        this.letterStatus(this.items[i].letter, current ? t.statusCurrent : spoken[status]);
    });

    if (phase === 'playing') {
      const it = g.current;
      this.hubLetter.textContent = this.paused ? '' : it.letter;
      this.round.textContent = fill(t.round, { round: g.round });
      this.kind.textContent = this.kindText(it);
      this.clue.textContent = it.clue;
      this.question.hidden = this.paused;
      this.pausedNote.hidden = !this.paused;
      this.pauseButton.textContent = this.paused ? t.resume : t.pause;
      // An icon button: the speaker is known to everyone, and its name is there for screen readers.
      this.soundButton.replaceChildren(icon(this.sounds.muted ? 'soundOff' : 'soundOn'));
      this.soundButton.setAttribute('aria-label', this.sounds.muted ? t.soundOn : t.soundOff);
      this.paintClock();
      this.paintFeedback();
      this.counts.replaceChildren(
        el('span', { class: 'aw-count aw-count-ok' }, [icon('ok'), fill(t.countCorrect, { count: g.count('ok') })]),
        el('span', { class: 'aw-count aw-count-bad' }, [icon('bad'), fill(t.countWrong, { count: g.count('bad') })]),
        el('span', { class: 'aw-count aw-count-left' }, [fill(t.countLeft, { count: g.left })]),
      );
      this.finishButton.textContent = this.confirmingFinish ? t.finishConfirm : t.finish;
    }

    if (phase === 'finished') {
      this.renderResults();
    }
    this.trigger('resize');
  }

  /** Shows the time left, marked when little is left. */
  paintClock() {
    if (this.timer) {
      this.clockValue.textContent = formatTime(this.timer.seconds);
      this.clock.classList.toggle('aw-low', this.timer.seconds <= 10);
    }
  }

  /** Shows what happened with the last letter, with an icon as well as a colour. */
  paintFeedback() {
    const f = this.feedback;
    this.feedbackLine.className = `aw-feedback${f ? ` aw-feedback-${f.result}` : ''}`;
    if (!f) {
      this.feedbackLine.replaceChildren();
      return;
    }
    this.feedbackLine.replaceChildren(f.result in ICONS ? icon(/** @type {IconName} */ (f.result)) : '', f.text);
  }

  /** The end screen: the cheer and every letter with its answer. */
  renderResults() {
    const g = this.game, t = this.l10n;
    const tier = cheerTier(g.score, g.maxScore);
    this.cheer.className = `aw-cheer aw-cheer-${tier}`;
    this.ring.replaceChildren(scoreRing(g.score, g.maxScore));
    this.cheerTitle.textContent = this.cheerText(tier);
    this.resultTitle.textContent = fill(t.resultTitle, { score: g.score, total: g.maxScore });
    this.endReason.textContent = g.endReason === 'time' ? t.timeUp : '';
    this.endReason.hidden = g.endReason !== 'time';
    const label = { ok: t.statusCorrect, bad: t.statusWrong, passed: t.statusUnanswered, pending: t.statusUnanswered };
    this.review.replaceChildren(...this.items.map((it, i) => {
      const status = g.status[i];
      const shown = status === 'passed' || status === 'pending' ? 'passed' : status;
      const lines = [
        el('p', { class: 'aw-review-clue' }, [el('span', { class: 'aw-review-kind', text: `${this.kindText(it)}. ` }), it.clue]),
      ];
      if (g.given[i] !== null) {
        lines.push(el('p', { class: 'aw-review-given', text: fill(t.yourAnswerWas, { answer: g.given[i] }) }));
      }
      if (this.solutionsShown && status !== 'ok') {
        lines.push(el('p', { class: 'aw-review-solution', text: fill(t.solution, { answer: it.answers[0] }) }));
      }
      return el('li', { class: `aw-review-item aw-${shown}` }, [
        el('span', { class: 'aw-review-letter', 'aria-hidden': 'true', text: it.letter }),
        el('div', { class: 'aw-review-body' }, [
          el('p', { class: 'aw-review-status' }, [
            icon(shown), el('span', { class: 'aw-review-status-text', text: this.letterStatus(it.letter, label[status]) }),
          ]),
          ...lines,
        ]),
      ]);
    }));
    const anythingToShow = g.status.some((s) => s !== 'ok');
    this.solutionsButton.hidden = !this.behaviour.enableSolutionsButton || this.solutionsShown || !anythingToShow;
    this.retryButton.hidden = !this.behaviour.enableRetry;
  }

  /** «Start»: the clock runs and the first letter is asked. */
  start() {
    if (this.game.phase !== 'intro' || !this.items.length) {
      return;
    }
    if (typeof this.setActivityStarted === 'function') {
      this.setActivityStarted();
    }
    // The click on «Start» is the gesture the browser asks for before any sound.
    this.sounds.wake();
    this.game.start();
    this.feedback = null;
    if (this.timer) {
      this.timer.start();
    }
    this.render();
    this.input.focus();
    this.announceCurrent('');
  }

  /**
   * Reads out the current letter and its clue, after what happened with the previous one.
   * @param {string} before
   */
  announceCurrent(before) {
    const it = this.game.current;
    if (!it) {
      return;
    }
    this.announcer.say(`${before ? `${before} ` : ''}${this.kindText(it)}. ${it.clue}`);
  }

  /** «Check»: the answer typed for the current letter. */
  check() {
    if (this.game.phase !== 'playing' || this.paused) {
      return;
    }
    const t = this.l10n;
    const { result, index } = this.game.answer(this.input.value);
    if (result === 'empty') {
      this.feedback = { result: 'empty', text: t.emptyAnswer };
      this.render();
      this.announcer.say(t.emptyAnswer);
      this.input.focus();
      return;
    }
    const it = this.items[index];
    this.sounds.play(result === 'ok' ? 'ok' : 'bad');
    let text = this.letterStatus(it.letter, result === 'ok' ? t.correctFeedback : t.wrongFeedback);
    if (result === 'bad' && this.behaviour.showAnswerOnWrong) {
      text += ` ${fill(t.answerWas, { answer: it.answers[0] })}`;
    }
    this.feedback = { result, text };
    this.input.value = '';
    this.afterMove(text);
  }

  /** «Pass»: the letter comes back in the next round. */
  pass() {
    if (this.game.phase !== 'playing' || this.paused) {
      return;
    }
    const index = this.game.pass();
    this.sounds.play('pass');
    const text = fill(this.l10n.passedFeedback, { letter: this.items[index].letter });
    this.feedback = { result: 'passed', text };
    this.input.value = '';
    this.afterMove(text);
  }

  /**
   * After an answer or a pass: save, then go on or end.
   * @param {string} said What happened, to be read out before the next letter.
   */
  afterMove(said) {
    this.confirmingFinish = false;
    if (this.game.phase === 'finished') {
      this.afterFinish(said);
      return;
    }
    this.triggerXAPI('progressed');
    this.render();
    this.input.focus();
    this.announceCurrent(said);
  }

  /**
   * Stops or restarts the clock; the clue is hidden while paused.
   * @param {boolean} paused
   * @param {boolean} moveFocus Whether the player asked for it (focus goes to the button or back to the answer).
   */
  setPaused(paused, moveFocus) {
    if (!this.timer || this.game.phase !== 'playing') {
      return;
    }
    this.paused = paused;
    if (paused) {
      this.timer.pause();
    } else {
      this.timer.start();
    }
    this.render();
    if (paused) {
      if (moveFocus) {
        this.pauseButton.focus();
      }
      this.announcer.say(this.l10n.paused);
    } else {
      if (moveFocus) {
        this.input.focus();
      }
      this.announceCurrent('');
    }
  }

  /** «Finish»: asks once, ends on the second press. */
  askFinish() {
    if (this.game.phase !== 'playing') {
      return;
    }
    if (!this.confirmingFinish) {
      this.confirmingFinish = true;
      this.render();
      this.announcer.say(this.l10n.finishConfirm);
      return;
    }
    this.confirmingFinish = false;
    this.game.finish('stopped');
    this.afterFinish('');
  }

  /**
   * The game is over: stop the clock, send the score once and show the results.
   * @param {string} said What happened last, to be read out before the result.
   */
  afterFinish(said) {
    if (this.timer) {
      this.timer.pause();
    }
    this.paused = false;
    this.render();
    this.trigger(this.answeredEvent());
    // H5P platforms such as Moodle stop saving the state once the score is sent, so the last saved state would
    // bring back a game that is over. It is deleted instead: a reload starts a new game.
    if (this.isRoot() && H5P.deleteUserData && this.contentId !== undefined) {
      H5P.deleteUserData(this.contentId, 'state', 0);
    }
    this.lastMove.textContent = said;
    this.cheerBox.focus();
    const tier = cheerTier(this.game.score, this.game.maxScore);
    // Confetti only for a game that went well, and more of it for a full wheel. The bells come just after the sound of
    // the last answer; when the time ran out, its own sound already said so.
    confetti(this.root, CONFETTI[tier] || 0);
    if (this.game.endReason !== 'time') {
      setTimeout(() => this.sounds.play(tier === 'perfect' || tier === 'great' ? 'cheer' : 'done'), CHEER_DELAY_MS);
    }
  }

  /** The speaker button: mutes or brings the sound back, and remembers it. */
  toggleSound() {
    this.sounds.setMuted(!this.sounds.muted);
    this.render();
    this.announcer.say(this.sounds.muted ? this.l10n.soundMuted : this.l10n.soundUnmuted);
    this.sounds.play('tick');
  }

  /**
   * @param {'perfect'|'great'|'good'|'keep'} tier
   * @returns {string} The message that goes with the score.
   */
  cheerText(tier) {
    const t = this.l10n;
    return { perfect: t.cheerPerfect, great: t.cheerGreat, good: t.cheerGood, keep: t.cheerKeep }[tier];
  }

  /** «Retry»: a new game, a new attempt. */
  retry() {
    this.resetTask();
    this.start();
  }

  // --- The H5P contract (Question type) --------------------------------------------------------------------------

  /** @returns {number} Letters right. */
  getScore() {
    return this.game.score;
  }

  /** @returns {number} Letters of the wheel. */
  getMaxScore() {
    return this.game.maxScore;
  }

  /** @returns {boolean} Whether the player answered anything yet. */
  getAnswerGiven() {
    return this.game.answeredAny || this.game.phase === 'finished';
  }

  /** @returns {string} The title of the content, for parents and reports. */
  getTitle() {
    const title = this.title || FALLBACK_TITLE;
    return H5P.createTitle ? H5P.createTitle(title) : title;
  }

  /** Ends the game without a score message and shows every answer (parents such as a column call it). */
  showSolutions() {
    if (this.game.phase === 'intro') {
      this.game.start();
    }
    if (this.game.phase === 'playing') {
      this.game.finish('stopped');
      if (this.timer) {
        this.timer.pause();
      }
    }
    this.solutionsShown = true;
    this.render();
  }

  /** Back to the start, as a new attempt. */
  resetTask() {
    this.game.reset();
    if (this.lastMove) {
      this.lastMove.textContent = '';
    }
    // A new attempt: its duration in the xAPI result counts from its own start.
    this.activityStartTime = undefined;
    this.feedback = null;
    this.paused = false;
    this.confirmingFinish = false;
    this.solutionsShown = false;
    if (this.timer) {
      this.timer.pause();
      this.timer = this.newTimer(this.timeLimit);
    }
    this.render();
  }

  /** @returns {Object|undefined} What H5P saves to resume the game; nothing once it is over. */
  getCurrentState() {
    if (this.game.phase === 'finished') {
      return undefined;
    }
    return { game: this.game.toState(), timeLeft: this.timer ? this.timer.seconds : null };
  }

  /** @returns {Object} The single «answered» statement of a game, with a fill-in gap per letter. */
  answeredEvent() {
    const g = this.game;
    const event = this.createXAPIEventTemplate('answered');
    const definition = event.getVerifiedStatementValue(['object', 'definition']) || {};
    const gaps = this.items.map((it, i) => {
      const accepted = it.answers.slice();
      // An answer taken as right with the tolerances (no accents, other capitals) counts as accepted in the report.
      if (g.status[i] === 'ok' && !accepted.includes(g.given[i])) {
        accepted.push(g.given[i]);
      }
      return { accepted };
    });
    const fillIn = fillInDefinition({
      intro: this.title || FALLBACK_TITLE,
      gaps,
      caseSensitive: this.behaviour.ignoreCase === false,
    });
    event.data.statement.object.definition = {
      ...definition,
      ...fillIn,
      extensions: { ...(definition.extensions || {}), ...fillIn.extensions },
    };
    // No pass or fail: a game has a score, not a pass mark, and Moodle would show «Fail» for 26 letters out of 27.
    event.setScoredResult(g.score, g.maxScore, this, true, undefined);
    event.data.statement.result.response = fillInResponse(g.given);
    return event;
  }

  /** @returns {{statement: Object}} The final statement, as Moodle asks for it when the game is over. */
  getXAPIData() {
    return { statement: this.answeredEvent().data.statement };
  }
}

/** @typedef {import('./game.js').WheelItem} WheelItem */

H5P.AlphabetWheel = AlphabetWheel;
