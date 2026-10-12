// H5P.AlphabetWheel: the screen of the alphabet wheel and its contract with H5P (score, xAPI, resume).
//
// Written as a constructor with prototype methods, not as a class: H5P core copies the prototype with jQuery.extend,
// which does not see class methods.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import semantics from '../semantics.json';
import { createMatcher, splitAlternatives } from '../../shared/answer.js';
import { Countdown, formatTime } from '../../shared/timer.js';
import { Announcer, el, fill, plain } from '../../shared/dom.js';
import { fillInDefinition, fillInResponse } from '../../shared/xapi.js';
import { cheerTier, confetti, scoreRing } from '../../shared/cheer.js';
import { WheelGame } from './game.js';
import './alphabet-wheel.css';

const H5P = window.H5P = window.H5P || {};

/** Defaults of a group of the semantics, so content saved by an older version still has every text. */
const defaultsOf = (name) => Object.fromEntries(
  semantics.find((f) => f.name === name).fields.map((f) => [f.name, f.default]),
);
const L10N = defaultsOf('l10n');
const BEHAVIOUR = defaultsOf('behaviour');

const ICONS = {
  ok: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.2 8.6l3 3 6.6-7" /></svg>',
  bad: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" /></svg>',
  passed: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.8 8h9.4M8.8 4.4L12.4 8l-3.6 3.6" /></svg>',
};
const icon = (name) => {
  const span = el('span', { class: `aw-icon aw-icon-${name}`, 'aria-hidden': 'true' });
  span.innerHTML = ICONS[name];
  return span;
};

let uid = 0;

/**
 * @param {Object} params Content of the wheel, as the editor saved it.
 * @param {number} contentId
 * @param {Object} [extras] H5P extras: metadata, previousState, parent.
 */
function AlphabetWheel(params, contentId, extras = {}) {
  H5P.EventDispatcher.call(this);
  this.contentId = contentId;
  this.extras = extras;
  this.l10n = { ...L10N, ...((params && params.l10n) || {}) };
  this.behaviour = { ...BEHAVIOUR, ...((params && params.behaviour) || {}) };
  this.title = plain(extras.metadata && extras.metadata.title);
  this.id = `h5p-aw-${++uid}`;

  this.items = ((params && params.items) || [])
    .map((it) => ({
      letter: plain(it.letter),
      kind: it.kind === 'contains' ? 'contains' : 'starts',
      clue: plain(it.clue),
      answers: [plain(it.answer), ...splitAlternatives(plain(it.alternatives))].filter(Boolean),
    }))
    .filter((it) => it.letter && it.clue && it.answers.length);

  this.game = new WheelGame(this.items, createMatcher({
    language: params && params.language,
    extraLetters: plain(params && params.extraLetters),
    ignoreCase: this.behaviour.ignoreCase !== false,
    ignoreAccents: this.behaviour.ignoreAccents !== false,
  }));

  this.timeLimit = Math.max(0, Math.floor(Number(params && params.timeLimit) || 0));
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

AlphabetWheel.prototype = Object.create(H5P.EventDispatcher ? H5P.EventDispatcher.prototype : Object.prototype);
AlphabetWheel.prototype.constructor = AlphabetWheel;

AlphabetWheel.prototype.newTimer = function (seconds) {
  return new Countdown({
    seconds,
    onTick: (left) => {
      this.paintClock();
      if (left === 60) {
        this.announcer.say(this.l10n.oneMinuteLeft);
      } else if (left === 10) {
        this.announcer.say(this.l10n.tenSecondsLeft);
      }
    },
    onEnd: () => {
      this.game.finish('time');
      this.afterFinish(this.l10n.timeUp);
    },
  });
};

/**
 * Called by H5P to put the game on the page.
 * @param {Object} $container The jQuery element H5P gives.
 */
AlphabetWheel.prototype.attach = function ($container) {
  const container = $container.get ? $container.get(0) : $container;
  container.classList.add('h5p-alphabet-wheel');
  if (!this.root) {
    this.build();
  }
  container.replaceChildren(this.root);
  this.render();
  if (this.timer && !this.visibilityWatched) {
    this.visibilityWatched = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.phase === 'playing' && !this.paused) {
        this.setPaused(true, false);
      }
    });
  }
};

AlphabetWheel.prototype.build = function () {
  const t = this.l10n;
  const ids = { clue: `${this.id}-clue`, kind: `${this.id}-kind`, input: `${this.id}-input` };
  this.announcer = new Announcer();

  // Before the game.
  this.introButton = el('button', { type: 'button', class: 'aw-button aw-primary', text: t.start, onclick: () => this.start() });
  this.intro = el('div', { class: 'aw-intro' }, [
    this.title ? el('h2', { class: 'aw-title', text: this.title }) : '',
    el('p', { class: 'aw-summary', text: [
      fill(t.introLetters, { count: this.items.length }),
      this.timeLimit ? fill(t.introTime, { time: formatTime(this.timeLimit) }) : t.introNoTime,
    ].join(' · ') }),
    el('p', { class: 'aw-help', text: t.introHelp }),
    this.introButton,
  ]);

  // The wheel.
  const n = this.items.length;
  const dot = Math.min(9, 240 / Math.max(n, 1));
  this.letters = this.items.map((it, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const li = el('li', { class: 'aw-letter' }, [
      el('span', { class: 'aw-letter-text', 'aria-hidden': 'true', text: it.letter }),
      el('span', { class: 'aw-badge', 'aria-hidden': 'true' }),
      el('span', { class: 'h5p-oksigenia-sr-only' }),
    ]);
    li.style.left = `${50 + 41 * Math.cos(angle)}%`;
    li.style.top = `${50 + 41 * Math.sin(angle)}%`;
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
  this.wheel.style.setProperty('--aw-dot', `${dot}cqi`);

  // The panel: clock, clue, answer and counts.
  this.round = el('span', { class: 'aw-round' });
  this.clockValue = el('span', { class: 'aw-clock-value' });
  this.clock = el('span', { class: 'aw-clock', role: 'timer', 'aria-label': t.timeLeft }, [
    el('span', { class: 'aw-clock-label', text: t.timeLeft }), this.clockValue,
  ]);
  this.pauseButton = el('button', { type: 'button', class: 'aw-button aw-secondary aw-pause', onclick: () => this.setPaused(!this.paused, true) });
  this.kind = el('p', { class: 'aw-kind', id: ids.kind });
  this.clue = el('p', { class: 'aw-clue', id: ids.clue });
  this.input = el('input', {
    id: ids.input, class: 'aw-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'done', maxlength: '100', 'aria-describedby': `${ids.kind} ${ids.clue}`,
  });
  this.passButton = el('button', { type: 'button', class: 'aw-button aw-secondary', onclick: () => this.pass() }, [icon('passed'), t.pass]);
  this.form = el('form', { class: 'aw-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); this.check(); } }, [
    el('label', { class: 'aw-label', for: ids.input, text: t.yourAnswer }),
    el('div', { class: 'aw-row' }, [
      this.input,
      el('button', { type: 'submit', class: 'aw-button aw-primary' }, [icon('ok'), t.check]),
      this.passButton,
    ]),
  ]);
  this.question = el('div', { class: 'aw-question' }, [this.kind, this.clue, this.form]);
  this.pausedNote = el('p', { class: 'aw-paused', text: t.paused });
  this.feedbackLine = el('p', { class: 'aw-feedback' });
  this.counts = el('p', { class: 'aw-counts' });
  this.finishButton = el('button', { type: 'button', class: 'aw-button aw-tertiary aw-finish', onclick: () => this.askFinish() });
  this.panel = el('div', { class: 'aw-panel' }, [
    el('div', { class: 'aw-bar' }, [this.round, this.timer ? this.clock : '', this.timer ? this.pauseButton : '']),
    this.question, this.pausedNote, this.feedbackLine, this.counts, this.finishButton,
  ]);
  this.gameView = el('div', { class: 'aw-game' }, [this.wheel, this.panel]);

  // After the game: a cheer that matches the score, then the review of every letter.
  this.ring = el('div', { class: 'aw-ring' });
  this.cheerTitle = el('h2', { class: 'aw-cheer-title', tabindex: '-1' });
  this.resultTitle = el('p', { class: 'aw-result-title' });
  this.endReason = el('p', { class: 'aw-end-reason' });
  this.cheer = el('div', { class: 'aw-cheer' }, [
    this.ring,
    el('div', { class: 'aw-cheer-text' }, [this.cheerTitle, this.resultTitle, this.endReason]),
  ]);
  this.review = el('ol', { class: 'aw-review' });
  this.solutionsButton = el('button', { type: 'button', class: 'aw-button aw-secondary', text: t.showSolutions, onclick: () => this.showSolutions() });
  this.retryButton = el('button', { type: 'button', class: 'aw-button aw-primary', text: t.retry, onclick: () => this.retry() });
  this.results = el('div', { class: 'aw-results' }, [
    this.cheer, this.review,
    el('div', { class: 'aw-actions' }, [this.solutionsButton, this.retryButton]),
  ]);

  this.empty = el('p', { class: 'aw-empty', text: t.noItems });
  this.root = el('div', { class: 'aw' }, [this.empty, this.intro, this.gameView, this.results, this.announcer.node]);
};

AlphabetWheel.prototype.render = function () {
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
    const badge = li.querySelector('.aw-badge');
    badge.replaceChildren(status in ICONS ? icon(status) : '');
    li.querySelector('.h5p-oksigenia-sr-only').textContent =
      `${this.items[i].letter}: ${current ? t.statusCurrent : spoken[status]}`;
  });

  if (phase === 'playing') {
    const it = g.current;
    this.hubLetter.textContent = this.paused ? '' : it.letter;
    this.round.textContent = fill(t.round, { round: g.round });
    this.kind.textContent = fill(it.kind === 'contains' ? t.contains : t.startsWith, { letter: it.letter });
    this.clue.textContent = it.clue;
    this.question.hidden = this.paused;
    this.pausedNote.hidden = !this.paused;
    this.pauseButton.textContent = this.paused ? t.resume : t.pause;
    this.paintClock();
    this.paintFeedback();
    this.counts.replaceChildren(
      el('span', { class: 'aw-count aw-count-ok' }, [icon('ok'), `${t.countCorrect}: ${g.count('ok')}`]),
      el('span', { class: 'aw-count aw-count-bad' }, [icon('bad'), `${t.countWrong}: ${g.count('bad')}`]),
      el('span', { class: 'aw-count' }, [`${t.countLeft}: ${g.left}`]),
    );
    this.finishButton.textContent = this.confirmingFinish ? t.finishConfirm : t.finish;
  }

  if (phase === 'finished') {
    this.renderResults();
  }
  this.trigger('resize');
};

AlphabetWheel.prototype.paintClock = function () {
  if (this.timer) {
    this.clockValue.textContent = formatTime(this.timer.seconds);
    this.clock.classList.toggle('aw-low', this.timer.seconds <= 10);
  }
};

AlphabetWheel.prototype.paintFeedback = function () {
  const f = this.feedback, t = this.l10n;
  this.feedbackLine.className = `aw-feedback${f ? ` aw-feedback-${f.result}` : ''}`;
  if (!f) {
    this.feedbackLine.replaceChildren();
    return;
  }
  this.feedbackLine.replaceChildren(f.result in ICONS ? icon(f.result) : '', f.text);
};

AlphabetWheel.prototype.renderResults = function () {
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
      el('p', { class: 'aw-review-clue' }, [
        el('span', { class: 'aw-review-kind', text: `${fill(it.kind === 'contains' ? t.contains : t.startsWith, { letter: it.letter })}. ` }),
        it.clue,
      ]),
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
        el('p', { class: 'aw-review-status' }, [icon(shown), el('span', { text: `${it.letter}: ${label[status]}` })]),
        ...lines,
      ]),
    ]);
  }));
  const anythingToShow = g.status.some((s) => s !== 'ok');
  this.solutionsButton.hidden = !this.behaviour.enableSolutionsButton || this.solutionsShown || !anythingToShow;
  this.retryButton.hidden = !this.behaviour.enableRetry;
};

// --- Playing -----------------------------------------------------------------------------------------------------

AlphabetWheel.prototype.start = function () {
  if (this.game.phase !== 'intro' || !this.items.length) {
    return;
  }
  if (typeof this.setActivityStarted === 'function') {
    this.setActivityStarted();
  }
  this.game.start();
  this.feedback = null;
  if (this.timer) {
    this.timer.start();
  }
  this.render();
  this.input.focus();
  this.announceCurrent('');
};

AlphabetWheel.prototype.announceCurrent = function (before) {
  const it = this.game.current;
  if (!it) {
    return;
  }
  const kind = fill(it.kind === 'contains' ? this.l10n.contains : this.l10n.startsWith, { letter: it.letter });
  this.announcer.say(`${before ? `${before} ` : ''}${kind}. ${it.clue}`);
};

AlphabetWheel.prototype.check = function () {
  if (this.game.phase !== 'playing' || this.paused) {
    return;
  }
  const t = this.l10n;
  const typed = this.input.value;
  const { result, index } = this.game.answer(typed);
  if (result === 'empty') {
    this.feedback = { result: 'empty', text: t.emptyAnswer };
    this.render();
    this.announcer.say(t.emptyAnswer);
    this.input.focus();
    return;
  }
  const it = this.items[index];
  let text = `${it.letter}: ${result === 'ok' ? t.correctFeedback : t.wrongFeedback}`;
  if (result === 'bad' && this.behaviour.showAnswerOnWrong) {
    text += ` ${fill(t.answerWas, { answer: it.answers[0] })}`;
  }
  this.feedback = { result, text };
  this.input.value = '';
  this.afterMove(text);
};

AlphabetWheel.prototype.pass = function () {
  if (this.game.phase !== 'playing' || this.paused) {
    return;
  }
  const index = this.game.pass();
  const text = fill(this.l10n.passedFeedback, { letter: this.items[index].letter });
  this.feedback = { result: 'passed', text };
  this.input.value = '';
  this.afterMove(text);
};

/** After an answer or a pass: save, then go on or end. */
AlphabetWheel.prototype.afterMove = function (said) {
  this.confirmingFinish = false;
  if (this.game.phase === 'finished') {
    this.afterFinish(said);
    return;
  }
  this.triggerXAPI('progressed');
  this.render();
  this.input.focus();
  this.announceCurrent(said);
};

AlphabetWheel.prototype.setPaused = function (paused, moveFocus) {
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
};

AlphabetWheel.prototype.askFinish = function () {
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
};

/** The game is over: stop the clock, send the score once and show the results. */
AlphabetWheel.prototype.afterFinish = function (said) {
  if (this.timer) {
    this.timer.pause();
  }
  this.paused = false;
  this.render();
  this.trigger(this.answeredEvent());
  // H5P platforms such as Moodle stop saving the state once the score is sent, so the last saved state would
  // bring back a game that is over. It is deleted instead: a reload starts a new game.
  if (this.isRoot && this.isRoot() && H5P.deleteUserData && this.contentId !== undefined) {
    H5P.deleteUserData(this.contentId, 'state', 0);
  }
  this.cheerTitle.focus();
  const tier = cheerTier(this.game.score, this.game.maxScore);
  // Confetti only for a game that went well, and more of it for a full wheel.
  confetti(this.root, { perfect: 90, great: 40 }[tier] || 0);
  const result = fill(this.l10n.resultTitle, { score: this.game.score, total: this.game.maxScore });
  this.announcer.say(`${said ? `${said} ` : ''}${this.cheerText(tier)} ${result}`);
};

/** @param {'perfect'|'great'|'good'|'keep'} tier */
AlphabetWheel.prototype.cheerText = function (tier) {
  const t = this.l10n;
  return { perfect: t.cheerPerfect, great: t.cheerGreat, good: t.cheerGood, keep: t.cheerKeep }[tier];
};

AlphabetWheel.prototype.retry = function () {
  this.resetTask();
  this.start();
};

// --- The H5P contract (Question type) ----------------------------------------------------------------------------

AlphabetWheel.prototype.getScore = function () {
  return this.game.score;
};

AlphabetWheel.prototype.getMaxScore = function () {
  return this.game.maxScore;
};

AlphabetWheel.prototype.getAnswerGiven = function () {
  return this.game.answeredAny || this.game.phase === 'finished';
};

AlphabetWheel.prototype.getTitle = function () {
  return H5P.createTitle ? H5P.createTitle(this.title || 'Alphabet Wheel') : (this.title || 'Alphabet Wheel');
};

AlphabetWheel.prototype.showSolutions = function () {
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
};

AlphabetWheel.prototype.resetTask = function () {
  this.game.reset();
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
};

/** @returns {object|undefined} What H5P saves to resume the game; nothing once it is over. */
AlphabetWheel.prototype.getCurrentState = function () {
  if (this.game.phase === 'finished') {
    return undefined;
  }
  return { game: this.game.toState(), timeLeft: this.timer ? this.timer.seconds : null };
};

AlphabetWheel.prototype.answeredEvent = function () {
  const g = this.game, t = this.l10n;
  const event = this.createXAPIEventTemplate('answered');
  const definition = event.getVerifiedStatementValue(['object', 'definition']) || {};
  const gaps = this.items.map((it, i) => {
    const kind = fill(it.kind === 'contains' ? t.contains : t.startsWith, { letter: it.letter });
    const accepted = it.answers.slice();
    // An answer taken as right with the tolerances (no accents, other capitals) counts as accepted in the report.
    if (g.status[i] === 'ok' && !accepted.includes(g.given[i])) {
      accepted.push(g.given[i]);
    }
    return { prompt: `${kind}: ${it.clue}`, accepted };
  });
  const fillIn = fillInDefinition({
    intro: this.title || 'Alphabet Wheel',
    gaps,
    caseSensitive: this.behaviour.ignoreCase === false,
  });
  event.data.statement.object.definition = {
    ...definition,
    ...fillIn,
    extensions: { ...(definition.extensions || {}), ...fillIn.extensions },
  };
  event.setScoredResult(g.score, g.maxScore, this, true, g.score === g.maxScore);
  event.data.statement.result.response = fillInResponse(g.given);
  return event;
};

/** @returns {{statement: object}} The final statement, as Moodle asks for it when the game is over. */
AlphabetWheel.prototype.getXAPIData = function () {
  return { statement: this.answeredEvent().data.statement };
};

H5P.AlphabetWheel = AlphabetWheel;
