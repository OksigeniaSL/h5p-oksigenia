// H5P.BalanceScale: the screen of the game and its contract with H5P (score, xAPI, resume). A two-pan balance where
// what is put on the scale is the answer, and the equality is written under it with =, < or >. The rules are in
// game.js and the drawing of the three views by age, in views.js.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import semantics from '../semantics.json';
import library from '../library.json';
import {
  Announcer, bringIntoView, el, exitFullScreenButton, fill, paintOuterFrames, plain, watchPageColourMode,
} from '../../shared/dom.js';
import { fillInDefinition, fillInResponse } from '../../shared/xapi.js';
import { cheerTier, confetti, reducedMotion, scoreRing } from '../../shared/cheer.js';
import { Sounds, volumeSlider } from '../../shared/sound.js';
import { BalanceGame, MAX_GUESS, POINTS, sizeOf } from './game.js';
import { View, VIEWS } from './views.js';
import '../../shared/dark.css';
import './balance-scale.css';

const H5P = window.H5P = window.H5P || {};

/** Defaults of a group of the semantics, so content saved by an older version still has every text. */
const defaultsOf = (name) => Object.fromEntries(
  semantics.find((f) => f.name === name).fields.map((f) => [f.name, f.default]),
);
const L10N = defaultsOf('l10n');
const BEHAVIOUR = defaultsOf('behaviour');
const TUNING = defaultsOf('tuning');

/** Name of the game when the content has no title, for xAPI and parents. */
const FALLBACK_TITLE = 'Balance Scale';
/** Remembers the scale chosen on this device, like the volume. */
const VIEW_KEY = 'h5p-oksigenia-scale';
/** The views, with the name of their text. */
const VIEW_NAMES = [['market', 'viewMarket'], ['laboratory', 'viewLaboratory'], ['notebook', 'viewNotebook']];
/** What can be chosen on the first screen: the topic, its texts and an example. */
const CHOICES = [
  ['equalities', 'topicEqualities', 'topicEqualitiesLine', '8 + 5 = 6 + ?'],
  ['groups', 'topicGroups', 'topicGroupsLine', '3 × 4 = ? × 6'],
  ['share', 'topicShare', 'topicShareLine', '7 · 5 · 4 · 2'],
  ['bag', 'topicBag', 'topicBagLine', '? + ? + 3 = 11'],
  ['free', 'topicFree', 'topicFreeLine', '5 + 5 = 10'],
];
/** Languages with the instructions recorded (Mira, a neutral voice of Spain, and Mira EN). */
const VOICES = ['es', 'en'];
/** The beam leans this much at most, on its stop. */
const MAX_ANGLE = 12;
/** The fixed bar of an LMS page, which stays over the game: the game fits under it. */
const BAR = 60;
/** The smallest the scene gets, so the scale and its numbers still read. */
const MIN_SCENE = 190;
/** From this width of the game on, the tray goes beside the scale: a Moodle page at 1100 px with its course index open
 * leaves the game about 670 px, and one above the other did not fit in the height left. */
const WIDE = 600;
/** One above the other, the page may also keep a bar at the bottom (Moodle's activity navigation, a phone's toolbar). */
const BOTTOM_BAR = 65;
/** A balanced scale swings a little before the round is told as won. */
const WIN_DELAY_MS = 520;
/** A wrong try stays on the scale a moment before doing it together. */
const TOGETHER_DELAY_MS = 1500;
/** Wait for the end bells, so they come after the sound of the last move. */
const CHEER_DELAY_MS = 500;
/** Confetti pieces by how the game went. */
const CONFETTI = { perfect: 90, great: 40 };

const ICONS = {
  ok: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.2 8.6l3 3 6.6-7" /></svg>',
  bad: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" /></svg>',
  half: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h10" /></svg>',
  hint: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 7v5M8 4.2v.1" /></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.6" /><path class="bs-fill" d="M6.6 5.4l4 2.6-4 2.6z" /></svg>',
  soundOn: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 6h2.6L8 3v10L4.6 10H2zM10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" /></svg>',
  soundOff: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 6h2.6L8 3v10L4.6 10H2zM10.6 6.2l3.4 3.6M14 6.2l-3.4 3.6" /></svg>',
  exitFull: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5" /></svg>',
};

/**
 * @param {keyof typeof ICONS} name
 * @returns {HTMLElement} A decorative icon, hidden from screen readers.
 */
const icon = (name) => {
  const span = el('span', { class: `bs-icon bs-icon-${name}`, 'aria-hidden': 'true' });
  span.innerHTML = ICONS[name];
  return span;
};

/**
 * @param {Object<string, *>} attrs
 * @returns {HTMLButtonElement}
 */
const btn = (attrs) => /** @type {HTMLButtonElement} */ (el('button', attrs));

const other = (side) => (side === 'left' ? 'right' : 'left');
const sum = (list) => list.reduce((s, x) => s + x, 0);

/** @typedef {import('./game.js').Thing} Thing */

let uid = 0;

export default class BalanceScale extends H5P.EventDispatcher {
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
    this.tuning = { ...TUNING, ...(params.tuning || {}) };
    this.title = plain(extras.metadata && extras.metadata.title);
    this.id = `h5p-bs-${++uid}-${Math.random().toString(36).slice(2, 8)}`;
    this.locale = plain(extras.metadata && extras.metadata.defaultLanguage) || document.documentElement.lang || undefined;
    this.topic = params.topic || 'choose';
    this.held = params.movement === 'held';
    /** Whether the player chooses the scale, or the author fixed one. */
    this.choosesView = !(params.view in VIEWS);
    this.viewName = this.choosesView ? this.savedView() : params.view;
    this.roundsWanted = params.rounds;
    this.sounds = new Sounds({ enabled: this.behaviour.enableSound !== false });
    const lang = String(this.locale || '').toLowerCase().split('-')[0];
    /** The language of the recorded instructions, or nothing: then there is no button to listen. */
    this.voice = this.behaviour.enableVoice !== false && VOICES.includes(lang) ? lang : null;
    /** @type {BalanceGame|null} */
    this.game = null;
    /** @type {Object<string, View>} */
    this.views = {};
    /** @type {{text: string, kind: string}|null} What happened with the last move. */
    this.message = null;
    /** The scale stays on its stops: the held option, until it is let go. */
    this.locked = false;
    /** @type {{left: Thing[], right: Thing[], tried: number|null}|null} What the scale shows while a move is still being told. */
    this.frozen = null;
    /** Something is being told (a balanced scale swinging, a round done together): taps wait. */
    this.busy = false;
    this.motion = { angle: 0, vel: 0, stop: 1, raf: 0, last: 0, side: 0, tickAt: 0 };
    /** @type {string|null} The thing that has just been put, which drops onto its pan. */
    this.fresh = null;
    /** @type {'left'|'right'|null} The pan a dragged weight would land in. */
    this.aim = null;
    /** How big the weights of the tray are drawn: smaller on a short board. */
    this.trayScale = 0.8;

    const state = extras.previousState;
    const saved = state && (this.topic === 'choose' ? state.topic : this.topic);
    if (saved && saved !== 'free') {
      const game = this.newGame(saved);
      if (game.restore(state)) {
        this.game = game;
        this.takenUp = true;
      }
    }
    if (!this.game && this.topic !== 'choose') {
      this.game = this.newGame(this.topic);
    }
  }

  /**
   * @param {string} topic
   * @returns {BalanceGame}
   */
  newGame(topic) {
    return new BalanceGame({
      topic, rounds: this.roundsWanted, held: this.held, startLevel: Number(this.tuning.startLevel) || 0,
    });
  }

  /** @returns {string} The scale last chosen on this device, or the market. */
  savedView() {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      return saved in VIEWS ? saved : 'market';
    } catch (e) {
      return 'market';
    }
  }

  /**
   * H5P core gives its isRoot to old-style prototypes only, so a class answers it itself, as other content types do.
   * @returns {boolean} Whether the game is the main content, not inside another one.
   */
  isRoot() {
    return !!this.extras.standalone;
  }

  /** @returns {string} Where the files of the library are. */
  libraryPath() {
    const folder = `${library.machineName}-${library.majorVersion}.${library.minorVersion}`;
    return typeof H5P.getLibraryPath === 'function' ? H5P.getLibraryPath(folder) : `libraries/${folder}`;
  }

  /** @returns {View} The view of the chosen scale, made once. */
  view() {
    if (!this.views[this.viewName]) {
      this.views[this.viewName] = new View(/** @type {any} */ (this.viewName), `${this.libraryPath()}/assets/views`, {
        root: this.root,
        dark: () => document.documentElement.classList.contains('h5p-oksigenia-dark'),
        reduced: reducedMotion,
        label: (thing, side) => fill(side === 'left' ? this.l10n.onLeftPan : this.l10n.onRightPan, { thing: this.thingName(thing) }),
      });
    }
    return this.views[this.viewName];
  }

  /**
   * @param {number} value
   * @returns {string} A number as it is written in the language of the content.
   */
  format(value) {
    return new Intl.NumberFormat(this.locale, { useGrouping: false, maximumFractionDigits: 0 }).format(value);
  }

  /** @param {Thing} thing @returns {string} «Weight of 5», «Bag of 4». */
  thingName(thing) {
    return fill(thing.kind === 'w' ? this.l10n.weightOf : this.l10n.bagOf, { value: this.format(thing.v) });
  }

  /** @param {string} side @returns {string} «left» or «right», in the words of the content. */
  sideWord(side) {
    return side === 'left' ? this.l10n.sideLeft : this.l10n.sideRight;
  }

  /**
   * Called by H5P to put the game on the page.
   * @param {Object} $container The jQuery element H5P gives.
   */
  attach($container) {
    const container = $container.get ? $container.get(0) : $container;
    container.classList.add('h5p-balance-scale');
    this.container = container;
    if (!this.root) {
      this.build();
    }
    container.replaceChildren(this.root);
    if (this.game && this.game.phase === 'playing') {
      this.openRound();
    }
    this.render();
    if (this.takenUp && this.isRoot() && this.game.phase === 'playing') {
      this.takenUp = false;
      bringIntoView(this.ask, { through: this.board });
    }
    // Inside another content type, the game keeps the colours of what is around it.
    if (this.isRoot() && !this.colourWatched) {
      this.colourWatched = true;
      watchPageColourMode((dark) => {
        document.documentElement.classList.toggle('h5p-oksigenia-dark', dark);
        paintOuterFrames(dark ? getComputedStyle(this.root).backgroundColor : '');
        Object.values(this.views).forEach((v) => v.ready && v.theme());
        if (this.game && this.game.phase === 'playing') {
          this.fillTray();
          this.paint();
        }
      });
    }
    if (!this.watching) {
      this.watching = true;
      let width = 0, room = 0, queued = 0;
      // Fits again on the next frame, once, whatever asked for it.
      const soon = () => {
        if (!queued) {
          queued = requestAnimationFrame(() => {
            queued = 0;
            this.fit();
          });
        }
      };
      // The room that counts is the width of the game and the height of the page's window, not the height of this
      // frame, which H5P grows and shrinks to the game: listening to that made an endless round of fits in Firefox.
      const check = () => {
        const w = this.root.clientWidth, h = this.viewHeight();
        if (Math.abs(w - width) >= 2 || Math.abs(h - room) >= 2) {
          width = w;
          room = h;
          soon();
        }
      };
      new ResizeObserver(check).observe(this.root);
      /** @type {Window} */
      let page = window;
      try {
        while (page.parent !== page && page.parent.document) {
          page = page.parent;
        }
      } catch (e) {
        // A frame of another site: its own window is the last one that can be read.
      }
      page.addEventListener('resize', check);
      if (page !== window) {
        window.addEventListener('resize', check);
      }
      // What is above and beside the scale changes height as a round goes on: the scale takes what is left.
      const around = new ResizeObserver(soon);
      [this.ask, this.messageLine, this.trayBox, this.actionsBox].forEach((node) => around.observe(node));
      // In and out of full screen the room changes at once; the game's own «resize» goes to H5P, not back here.
      this.on('enterFullScreen', () => setTimeout(() => this.fit(), 200));
      this.on('exitFullScreen', () => setTimeout(() => this.fit(), 200));
    }
  }

  /** Builds the three screens once: before, during and after the game. */
  build() {
    const t = this.l10n;
    this.announcer = new Announcer();
    this.intro = el('div', { class: 'bs-intro' });

    this.progress = el('div', { class: 'bs-progress', role: 'img' });
    this.levelText = el('span', { class: 'bs-level' });
    this.soundButton = btn({ type: 'button', class: 'bs-button bs-secondary bs-round-button bs-sound', onclick: () => this.toggleSound() });
    this.volume = volumeSlider(this.sounds, t.volume, 'bs-volume', () => this.paintSound());
    this.instructionText = el('span', { class: 'bs-instruction-text' });
    this.listenButton = btn({ type: 'button', class: 'bs-button bs-secondary bs-listen', onclick: () => this.listen() });
    this.listenButton.append(icon('play'), el('span', { text: t.listen }));
    this.ask = el('p', { class: 'bs-instruction' }, [this.instructionText, this.voice ? this.listenButton : '']);
    this.sceneText = el('p', { class: 'h5p-oksigenia-sr-only' });
    this.scene = el('div', { class: 'bs-scene' });
    this.leftSide = el('span', { class: 'bs-side' });
    this.relationBox = el('span', { class: 'bs-relation', 'aria-hidden': 'true', text: '?' });
    this.rightSide = el('span', { class: 'bs-side' });
    this.equality = el('div', { class: 'bs-equality' }, [this.leftSide, this.relationBox, this.rightSide]);
    this.reading = el('p', { class: 'h5p-oksigenia-sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.messageLine = el('p', { class: 'bs-message', role: 'status' });
    this.trayBox = el('div', { class: 'bs-tray' });
    this.actionsBox = el('div', { class: 'bs-actions' });
    this.board = el('div', { class: 'bs-board' }, [
      el('div', { class: 'bs-stage' }, [this.sceneText, this.scene, this.equality, this.reading]),
      el('div', { class: 'bs-side-panel' }, [this.messageLine, this.trayBox, this.actionsBox]),
    ]);
    this.gameView = el('div', { class: 'bs-game' }, [
      el('div', { class: 'bs-bar' }, [
        this.progress, this.levelText,
        this.sounds.enabled ? el('span', { class: 'bs-sound-group' }, [this.soundButton, this.volume]) : '',
      ]),
      this.ask, this.board,
    ]);

    this.ring = el('div', { class: 'bs-ring' });
    this.cheerTitle = el('p', { class: 'bs-cheer-title', id: `${this.id}-cheer` });
    this.resultTitle = el('p', { class: 'bs-result-title', id: `${this.id}-result` });
    this.cheerBox = el('div', {
      class: 'bs-cheer-text', role: 'group', tabindex: '-1', 'aria-labelledby': `${this.id}-cheer ${this.id}-result`,
    }, [this.cheerTitle, this.resultTitle]);
    this.cheer = el('div', { class: 'bs-cheer' }, [this.ring, this.cheerBox]);
    this.review = el('ol', { class: 'bs-review' });
    this.retryButton = btn({ type: 'button', class: 'bs-button bs-primary bs-retry', text: t.retry, onclick: () => this.retry() });
    this.otherButton = btn({ type: 'button', class: 'bs-button bs-secondary bs-other', text: t.otherTopic, onclick: () => this.chooseAgain() });
    this.results = el('div', { class: 'bs-results' }, [
      this.cheer, el('div', { class: 'bs-end-actions' }, [this.otherButton, this.retryButton]), this.review,
    ]);

    this.root = el('div', { class: 'bs' }, [
      this.intro, this.gameView, this.results, exitFullScreenButton('bs', icon('exitFull')), this.announcer.node,
    ]);
    this.scene.addEventListener('click', (e) => this.sceneClick(e));
    this.scene.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.sceneClick(e);
      }
    });
    this.fillIntro();
  }

  /**
   * The row to choose the scale, by its name and without any age: nobody wants to pick «the one for the little
   * ones», or to be told which one is theirs.
   * @returns {HTMLElement|string} Nothing if the author fixed one.
   */
  buildPicker() {
    if (!this.choosesView) {
      return '';
    }
    const t = this.l10n;
    this.pickButtons = VIEW_NAMES.map(([name, text]) => ({
      name,
      button: btn({ type: 'button', class: `bs-button bs-secondary bs-pick bs-pick-${name}`, text: t[text], onclick: () => this.pickView(name) }),
    }));
    this.picker = el('div', { class: 'bs-picker', role: 'group', 'aria-label': t.viewTitle }, [
      el('span', { class: 'bs-picker-title', text: t.viewTitle }), ...this.pickButtons.map(({ button }) => button),
    ]);
    this.paintPicker();
    return this.picker;
  }

  paintPicker() {
    (this.pickButtons || []).forEach(({ name, button }) => button.setAttribute('aria-pressed', String(name === this.viewName)));
  }

  /** @param {string} name The scale from now on, remembered on this device. */
  pickView(name) {
    this.viewName = name;
    try {
      window.localStorage.setItem(VIEW_KEY, name);
    } catch (e) {
      // Not remembered, but it still applies to this game.
    }
    this.paintPicker();
    this.view().load().catch(() => {});
  }

  /** The first screen: what can be chosen or, if the author chose, what it is about and «Start». */
  fillIntro() {
    const t = this.l10n;
    const title = this.title ? el('p', { class: 'bs-title', text: this.title }) : '';
    if (this.topic === 'choose') {
      this.intro.replaceChildren(title, this.buildPicker(), el('p', { class: 'bs-summary', text: t.chooseTitle }),
        el('div', { class: 'bs-choices' }, CHOICES.map(([name, text, line, sample]) => {
          const b = btn({ type: 'button', class: `bs-button bs-secondary bs-choice bs-choice-${name}`, onclick: () => this.choose(name) });
          b.append(el('span', { class: 'bs-choice-name', text: t[text] }), el('span', { class: 'bs-choice-sample', text: sample }),
            el('span', { class: 'bs-choice-line', text: t[line] }));
          return b;
        })));
      return;
    }
    const [, text, line] = CHOICES.find(([name]) => name === this.topic) || CHOICES[0];
    this.intro.replaceChildren(
      title,
      el('p', { class: 'bs-summary', text: t[text] }),
      el('p', { class: 'bs-help', text: this.topic === 'free' ? t[line] : fill(t.introSummary, { count: this.game.rounds }) }),
      this.buildPicker(),
      btn({ type: 'button', class: 'bs-button bs-primary bs-start', text: t.start, onclick: () => this.start() }),
    );
  }

  /** @returns {'intro'|'playing'|'finished'} The screen to show. */
  get phase() {
    return this.game ? this.game.phase : 'intro';
  }

  /** Shows the screen of the current phase. */
  render() {
    if (!this.root) {
      return;
    }
    const t = this.l10n, phase = this.phase, g = this.game;
    this.intro.hidden = phase !== 'intro';
    this.gameView.hidden = phase !== 'playing';
    this.results.hidden = phase !== 'finished';
    if (phase === 'playing') {
      this.paintProgress();
      this.levelText.textContent = g.free ? t.topicFree : [t.levelOne, t.levelTwo, t.levelThree][g.level];
      this.paintSound();
      const m = this.message;
      this.messageLine.className = `bs-message${m ? ` bs-message-${m.kind}` : ''}`;
      this.messageLine.replaceChildren(...(m ? [icon(m.kind === 'hint' ? 'hint' : m.kind === 'ok' ? 'ok' : 'bad'), el('span', { text: m.text })] : []));
      this.paintActions();
    }
    if (phase === 'finished') {
      this.renderResults();
    }
    this.trigger('resize');
  }

  paintProgress() {
    const g = this.game;
    if (g.free) {
      this.progress.replaceChildren();
      this.progress.removeAttribute('aria-label');
      return;
    }
    this.progress.replaceChildren(...Array.from({ length: g.rounds }, (_, k) => {
      const entry = g.log[k];
      const cls = entry ? (entry.got === POINTS ? 'bs-dot-full' : entry.got > 0 ? 'bs-dot-half' : 'bs-dot-none')
        : k + 1 === g.number ? 'bs-dot-now' : '';
      return el('i', { class: `bs-dot ${cls}` });
    }));
    this.progress.setAttribute('aria-label', fill(this.l10n.progress, { round: g.number, total: g.rounds, count: g.score }));
  }

  paintSound() {
    const t = this.l10n, off = this.sounds.muted || !this.sounds.volume;
    // An icon button: the speaker is known to everyone, and its name is there for screen readers.
    this.soundButton.replaceChildren(icon(off ? 'soundOff' : 'soundOn'));
    this.soundButton.setAttribute('aria-label', this.sounds.muted ? t.soundOn : t.soundOff);
    this.volume.style.setProperty('--bs-filled', `${Math.round(this.sounds.volume * 100)}%`);
    this.volume.setAttribute('aria-valuetext', `${Math.round(this.sounds.volume * 100)} %`);
  }

  /**
   * A choice on the first screen.
   * @param {string} topic
   */
  choose(topic) {
    this.sounds.wake();
    this.game = this.newGame(topic);
    this.start();
  }

  /** Back to the first screen, to practise something else. */
  chooseAgain() {
    this.game = null;
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
    if (typeof this.setActivityStarted === 'function' && !this.game.free) {
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

  /** The first thing to press in a round, focused, and the round in view. */
  focusRound() {
    const first = this.trayBox.querySelector('button:not(:disabled)');
    if (first) {
      /** @type {HTMLElement} */ (first).focus({ preventScroll: true });
    }
    bringIntoView(this.ask, { through: this.board });
  }

  /** Puts a new round on the screen. */
  openRound() {
    const g = this.game, t = this.l10n;
    this.message = null;
    this.frozen = null;
    this.busy = false;
    this.fresh = null;
    this.locked = g.held && !g.roundOver;
    const m = this.motion;
    m.vel = 0;
    m.stop = this.locked ? 0 : 1;
    m.angle = this.locked ? 0 : this.targetAngle();
    const said = this.instruction();
    this.instructionText.textContent = said.text;
    this.listenButton.hidden = !this.voice;
    this.drawScene();
    this.fillTray();
    this.writeEquality();
    this.render();
    this.fit();
    if (!this.view().ready) {
      this.view().load().then(() => {
        if (this.game === g && g.phase === 'playing') {
          this.drawScene();
          this.fillTray();
          this.fit();
        }
      }).catch(() => {
        this.instructionText.textContent = `${said.text} (${t.sceneHeld})`;
      });
    }
  }

  /** @returns {{text: string, keys: string[]}} The instruction: one of a few fixed lines, so it can be recorded. */
  instruction() {
    const t = this.l10n, r = this.game.current;
    let key;
    if (r.topic === 'equalities') {
      key = r.target === 'left' ? 'doEqualitiesLeft' : 'doEqualitiesRight';
    } else if (r.topic === 'groups') {
      key = r.trayBag ? 'doGroupsBags' : 'doGroupsWeights';
    } else if (r.topic === 'share') {
      key = 'doShare';
    } else if (r.topic === 'bag') {
      key = [...r.left, ...r.right].filter((x) => x.kind === 'mystery').length > 1 ? 'doBagMany' : 'doBagOne';
    } else {
      key = 'doFree';
    }
    const keys = [key];
    let text = t[key];
    if (this.game.held && r.topic !== 'bag') {
      keys.push('doRelease');
      text = `${text} ${t.doRelease}`;
    }
    return { text, keys };
  }

  /** «Listen»: the recorded instruction, at the volume of the game. */
  listen() {
    if (!this.voice || !this.game || !this.game.current) {
      return;
    }
    const files = { doEqualitiesRight: 'igualdades-der', doEqualitiesLeft: 'igualdades-izq', doGroupsWeights: 'grupos-pesas',
      doGroupsBags: 'grupos-bolsas', doShare: 'repartir', doBagOne: 'bolsa-una', doBagMany: 'bolsa-varias', doFree: 'libre',
      doRelease: 'soltar' };
    const queue = this.instruction().keys.map((k) => `${this.libraryPath()}/assets/voice/${this.voice}/${files[k]}.mp3`);
    if (this.audio) {
      this.audio.pause();
    }
    const next = () => {
      const src = queue.shift();
      if (!src) {
        return;
      }
      this.audio = new Audio(src);
      this.audio.volume = this.sounds.muted ? 0 : Math.max(0, Math.min(1, this.sounds.volume));
      this.audio.addEventListener('ended', next, { once: true });
      this.audio.play().catch(() => {});
    };
    next();
  }

  // --- The scale -----------------------------------------------------------------------------------------------------

  /** @returns {import('./views.js').Scene} What the view draws now. */
  sceneNow() {
    const g = this.game, r = g.current, shown = this.frozen || { left: r.left, right: r.right, tried: g.tried };
    return { angle: this.motion.angle, stop: this.motion.stop, left: shown.left, right: shown.right, tried: shown.tried, aim: this.aim };
  }

  /** @returns {number} Where the beam goes: level while it is held, towards the heavier side otherwise. */
  targetAngle() {
    const g = this.game;
    if (!g || !g.current || this.locked) {
      return 0;
    }
    const scene = this.frozen;
    const weigh = (side) => (scene
      ? sum(scene[side].map((x) => (x.kind === 'mystery' ? (scene.tried ?? g.current.x) : x.v))) : g.weight(side));
    const L = weigh('left'), R = weigh('right'), d = L - R;
    if (!d) {
      return 0;
    }
    const size = 4 + (MAX_ANGLE - 4) * Math.min(1, Math.abs(d) / Math.max(3, Math.max(L, R) * 0.3));
    return d > 0 ? -size : size;
  }

  /** Draws the scene again from scratch: after something was put on or taken off. */
  drawScene() {
    const v = this.view();
    if (!v.ready) {
      this.scene.replaceChildren();
      this.scene.classList.add('bs-loading');
      return;
    }
    this.scene.classList.remove('bs-loading');
    v.build(this.scene, this.sceneNow(), this.fresh);
    this.fresh = null;
    this.paintSceneText();
  }

  paint() {
    const v = this.view();
    if (v.ready && v.canvas && this.game && this.game.current) {
      v.paint(this.sceneNow());
    }
  }

  paintSceneText() {
    const t = this.l10n, rel = this.relationNow();
    this.sceneText.textContent = rel === '?' ? t.sceneHeld : rel === '=' ? t.sceneBalanced : rel === '>' ? t.sceneLeft : t.sceneRight;
  }

  /** @returns {'?'|'='|'<'|'>'} The relation shown: a question mark while the scale is held. */
  relationNow() {
    if (this.locked) {
      return '?';
    }
    if (this.frozen) {
      const target = this.targetAngle();
      return target === 0 ? '=' : target < 0 ? '>' : '<';
    }
    return this.game.relation();
  }

  /**
   * @param {number} [nudge] A push to the beam, in degrees a second: a weight dropping onto a pan.
   */
  kick(nudge = 0) {
    const m = this.motion;
    if (nudge && !reducedMotion()) {
      m.vel += nudge;
    }
    if (!m.raf) {
      m.last = performance.now();
      m.raf = requestAnimationFrame((now) => this.step(now));
    }
  }

  /** One frame of the beam: a damped spring towards where it goes, the stops, and the end of its travel. */
  step(now) {
    const m = this.motion, dt = Math.min(0.033, (now - m.last) / 1000);
    m.last = now;
    if (!this.game || !this.game.current) {
      m.raf = 0;
      return;
    }
    const target = this.targetAngle(), stopTarget = this.locked ? 0 : 1;
    if (reducedMotion()) {
      m.angle = target;
      m.vel = 0;
      m.stop = stopTarget;
    } else {
      const ds = stopTarget - m.stop;
      m.stop += Math.sign(ds) * Math.min(Math.abs(ds), dt * 4);
      m.vel += (-38 * (m.angle - target) - 4.6 * m.vel) * dt;
      m.angle += m.vel * dt;
      if (this.game.held) {
        const limit = MAX_ANGLE * m.stop + 0.0001;
        if (Math.abs(m.angle) > limit) {
          m.angle = Math.sign(m.angle) * limit;
          m.vel = 0;
        }
      }
      if (Math.abs(m.angle) > MAX_ANGLE) {
        if (Math.abs(m.vel) > 28) {
          this.sounds.play('thud');
        }
        m.angle = Math.sign(m.angle) * MAX_ANGLE;
        m.vel = -m.vel * 0.3;
      }
    }
    // The needle passing the middle: a soft tick, to hear the «almost».
    const sign = Math.sign(Math.round(m.angle * 10));
    if (sign && m.side && sign !== m.side && Math.abs(m.vel) > 4 && m.stop > 0.9 && now - m.tickAt > 140) {
      this.sounds.play('centre');
      m.tickAt = now;
    }
    if (sign) {
      m.side = sign;
    }
    this.paint();
    const v = this.view();
    const dropping = v.ready && v.dropping(now);
    if (Math.abs(m.angle - target) < 0.02 && Math.abs(m.vel) < 0.05 && m.stop === stopTarget && !dropping) {
      m.angle = target;
      m.vel = 0;
      this.paint();
      m.raf = 0;
      return;
    }
    m.raf = requestAnimationFrame((n) => this.step(n));
  }

  /** A balanced scale still swings a little, and settles. */
  wobble() {
    if (!reducedMotion()) {
      setTimeout(() => this.kick(10), this.game.held ? 280 : 0);
    }
  }

  // --- The equality ----------------------------------------------------------------------------------------------

  /**
   * @param {import('./game.js').Round} r
   * @param {'left'|'right'} side
   * @param {{html?: boolean, challenge?: boolean, tried?: number|null, list?: Thing[]}} [options]
   * @returns {string[]} The terms of one side: the numbers, «3 × 4» for bags, «?» for the gap.
   */
  terms(r, side, { html = false, challenge = false, tried = null, list = r[side] } = {}) {
    const hole = html ? '<span class="bs-gap">?</span>' : '?';
    const wrap = (text, id) => (html ? `<span class="bs-term"${id ? ` data-id="${id}"` : ''}>${text}</span>` : String(text));
    const out = [];
    if (r.topic === 'groups') {
      const bags = list.filter((x) => x.fixed && x.kind === 'bag');
      if (bags.length) {
        out.push(wrap(`${this.format(bags.length)} × ${this.format(bags[0].v)}`));
      }
      if (side === r.target) {
        const mine = challenge ? [] : list.filter((x) => !x.fixed);
        if (r.trayBag) {
          out.push(wrap(`${mine.length ? this.format(mine.length) : hole} × ${this.format(r.trayBag)}`, 'count'));
        } else {
          out.push(mine.length ? mine.map((x) => wrap(this.format(x.v), x.id)).join(' + ') : hole);
        }
      }
      return out;
    }
    for (const x of list) {
      if (!x.fixed && challenge) {
        continue;
      }
      if (x.kind === 'mystery') {
        out.push(tried !== null && tried !== undefined && !challenge ? wrap(this.format(tried), x.id) : hole);
      } else {
        out.push(wrap(this.format(x.v), x.fixed ? '' : x.id));
      }
    }
    const mineHere = !challenge && list.some((x) => !x.fixed);
    if ((side === r.target || (r.target === 'both' && r.topic === 'share')) && !mineHere) {
      out.push(hole);
    }
    if (!out.length) {
      out.push(wrap(this.format(0)));
    }
    return out;
  }

  /**
   * @param {import('./game.js').Round} r
   * @returns {string} What a round asks: «8 + 5 = 6 + ?», «Share out 7, 5, 4, 2».
   */
  challengeText(r) {
    if (r.topic === 'share') {
      return fill(this.l10n.reviewShare, { values: (r.pieces || []).map((v) => this.format(v)).join(', ') });
    }
    return `${this.terms(r, 'left', { challenge: true }).join(' + ')} = ${this.terms(r, 'right', { challenge: true }).join(' + ')}`;
  }

  /**
   * @param {import('./game.js').Round} r
   * @param {{left: Thing[], right: Thing[], tried: number|null}} a
   * @param {string} relation
   * @returns {string} An arrangement of the scale as an equality: «8 + 5 = 6 + 7».
   */
  arrangementText(r, a, relation) {
    const side = (s) => this.terms(r, s, { tried: a.tried, list: a[s] }).join(' + ');
    return `${side('left')} ${relation} ${side('right')}`;
  }

  writeEquality() {
    const g = this.game, r = g.current, shown = this.frozen || { left: r.left, right: r.right, tried: g.tried };
    this.leftSide.innerHTML = this.terms(r, 'left', { html: true, tried: shown.tried, list: shown.left }).join(' + ');
    this.rightSide.innerHTML = this.terms(r, 'right', { html: true, tried: shown.tried, list: shown.right }).join(' + ');
    const rel = this.relationNow();
    const was = this.relationBox.textContent;
    this.relationBox.textContent = rel;
    // While playing with the free balance, < and > are information, not a mistake: no red.
    const quiet = rel === '?' || g.free || (!g.held && !g.roundOver && r.topic !== 'bag');
    this.relationBox.className = `bs-relation${rel === '=' ? ' bs-relation-equal' : quiet ? '' : ' bs-relation-unequal'}${rel === '=' && was !== '=' ? ' bs-pop' : ''}`;
    // A moment later, as the Announcer does: when the focus moves in the same instant (sharing out takes the next weight
    // of the tray), a screen reader says the new focus first and would drop the equality.
    const said = this.arrangementText(r, shown, rel === '?' ? '?' : rel);
    clearTimeout(this.readingTimer);
    this.readingTimer = setTimeout(() => {
      this.reading.textContent = said;
    }, 150);
    this.paintSceneText();
  }

  /**
   * @param {string} text
   * @param {'ok'|'bad'|'hint'} kind
   */
  say(text, kind) {
    this.message = text ? { text, kind } : null;
    this.render();
  }

  // --- The tray and the buttons ------------------------------------------------------------------------------------

  /**
   * Draws the tray again (a new round, the scale's pictures arriving, another size) and keeps the focus where it was:
   * replacing the button in focus would drop it to the page, and the next Enter of a keyboard or a screen reader would
   * do nothing.
   */
  fillTray() {
    const active = /** @type {HTMLElement|null} */ (this.trayBox.contains(document.activeElement) ? document.activeElement : null);
    const was = active && {
      value: active.dataset.value, pool: active.dataset.pool,
      step: active.classList.contains('bs-less') ? '.bs-less' : active.classList.contains('bs-more') ? '.bs-more' : '',
    };
    this.drawTray();
    if (was) {
      const again = was.step ? this.trayBox.querySelector(was.step)
        : this.trayBox.querySelector(was.pool ? `.bs-weight[data-pool="${was.pool}"]` : `.bs-weight[data-value="${was.value}"]`);
      const target = /** @type {HTMLElement|null} */ (again || this.trayBox.querySelector('button:not(:disabled)'));
      if (target) {
        target.focus({ preventScroll: true });
      }
    }
  }

  drawTray() {
    const g = this.game, r = g.current, t = this.l10n;
    if (r.topic === 'bag') {
      this.guessOutput = el('output', { class: 'bs-guess', id: `${this.id}-guess`, text: g.guess === null || g.guess === undefined ? '?' : this.format(g.guess) });
      const change = (d) => {
        if (this.busy || g.roundOver) {
          return;
        }
        const value = Math.max(0, Math.min(MAX_GUESS, (g.guess ?? 0) + d));
        const tried = g.tried !== null;
        g.untry(value);
        this.guessOutput.textContent = this.format(value);
        this.sounds.play('tick');
        if (tried) {
          // The bags are unknown again until the next try.
          this.locked = g.held;
          this.message = null;
          this.drawScene();
          this.writeEquality();
          this.render();
          this.kick();
        }
      };
      this.trayBox.replaceChildren(
        el('span', { class: 'bs-tray-title', id: `${this.id}-guess-title`, text: t.bagWeighs }),
        el('div', { class: 'bs-stepper', role: 'group', 'aria-labelledby': `${this.id}-guess-title` }, [
          btn({ type: 'button', class: 'bs-button bs-secondary bs-step bs-less', 'aria-label': t.oneLess, text: '−', onclick: () => change(-1) }),
          this.guessOutput,
          btn({ type: 'button', class: 'bs-button bs-secondary bs-step bs-more', 'aria-label': t.oneMore, text: '+', onclick: () => change(1) }),
        ]),
      );
      this.guessOutput.setAttribute('aria-live', 'polite');
      return;
    }
    const title = el('span', { class: 'bs-tray-title', text: r.trayBag ? t.trayBags : t.trayWeights });
    let items;
    if (r.pool) {
      items = r.pool.length ? r.pool.map((x) => this.weightButton(x.v, 'w', x.id)) : [el('span', { class: 'bs-tray-empty', text: t.allPlaced })];
    } else if (r.trayBag) {
      items = [this.weightButton(r.trayBag, 'bag')];
    } else {
      items = r.tray.map((v) => this.weightButton(v, 'w'));
    }
    this.trayBox.replaceChildren(title, el('div', { class: 'bs-tray-items' }, items));
    if (g.roundOver || this.busy) {
      this.trayBox.querySelectorAll('button').forEach((b) => {
        /** @type {HTMLButtonElement} */ (b).disabled = true;
      });
    }
  }

  /**
   * @param {number} value
   * @param {'w'|'bag'} kind
   * @param {string} [poolId] Sharing out: the very weight of the tray.
   * @returns {HTMLButtonElement}
   */
  weightButton(value, kind, poolId) {
    const b = btn({
      type: 'button', class: `bs-weight bs-size-${kind === 'bag' ? 'bag' : sizeOf(value)}`,
      'aria-label': fill(kind === 'bag' ? this.l10n.bagOf : this.l10n.weightOf, { value: this.format(value) }),
      text: this.format(value),
    });
    b.dataset.value = String(value);
    b.dataset.kind = kind;
    if (poolId) {
      b.dataset.pool = poolId;
    }
    const v = this.view();
    if (v.ready) {
      v.face(b, value, kind, this.trayScale);
    }
    this.hookDrag(b);
    return b;
  }

  paintActions() {
    const g = this.game, t = this.l10n, r = g.current;
    // Once the round is over the tray is of no use: the message and «Next» take its place.
    this.trayBox.hidden = g.roundOver && !this.busy;
    const buttons = [];
    if (g.roundOver && !this.busy) {
      this.nextButton = btn({ type: 'button', class: 'bs-button bs-primary bs-next', text: g.lastRound ? t.seeResult : t.next, onclick: () => this.next() });
      buttons.push(this.nextButton);
    } else if (!g.roundOver) {
      if (r.topic === 'bag') {
        buttons.push(btn({ type: 'button', class: 'bs-button bs-primary bs-try', text: t.tryIt, onclick: () => this.release() }));
      } else if (g.held) {
        buttons.push(btn({ type: 'button', class: 'bs-button bs-primary bs-release', text: t.release, onclick: () => this.release() }));
      }
      if (r.topic !== 'bag') {
        buttons.push(btn({ type: 'button', class: 'bs-button bs-secondary bs-empty', text: g.twoSides ? t.emptyPans : t.emptyPan, onclick: () => this.clear() }));
      }
    }
    const focused = this.actionsBox.contains(document.activeElement) ? /** @type {HTMLElement} */ (document.activeElement).className : '';
    this.actionsBox.replaceChildren(...buttons);
    buttons.forEach((b) => {
      b.disabled = this.busy;
    });
    const again = focused && buttons.find((b) => b.className === focused);
    if (again) {
      again.focus({ preventScroll: true });
    }
  }

  // --- Moves -------------------------------------------------------------------------------------------------------

  /**
   * A weight or a bag from the tray onto a pan.
   * @param {'left'|'right'} side
   * @param {HTMLElement} from The tray button.
   */
  put(side, from) {
    const g = this.game;
    if (this.busy || !g || g.roundOver) {
      return;
    }
    const result = g.put(side, { value: Number(from.dataset.value), kind: /** @type {any} */ (from.dataset.kind), poolId: from.dataset.pool });
    if (result.refused === 'otherPan') {
      this.say(fill(this.l10n.otherPan, { side: this.sideWord(g.current.target) }), 'hint');
      return;
    }
    if (!result.thing) {
      return;
    }
    const thing = result.thing;
    this.fresh = thing.id;
    this.sounds.play('drop', thing.v);
    if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) {
      navigator.vibrate(10);
    }
    this.changed(side === 'left' ? -1 : 1, thing.v);
    if (g.current.pool) {
      this.fillTray();
      const first = /** @type {HTMLElement} */ (this.trayBox.querySelector('button'));
      (first || this.actionsBox.querySelector('button') || this.root).focus({ preventScroll: true });
    }
    if (thing.kind === 'bag') {
      const count = this.equality.querySelector('[data-id="count"]');
      if (count) {
        count.classList.add('bs-arrive');
      }
    } else {
      this.flyIn(thing);
    }
    this.afterChange();
  }

  /** @param {string} id A thing on a pan, back off it. */
  take(id) {
    const g = this.game;
    if (this.busy || !g || g.roundOver) {
      return;
    }
    const node = /** @type {HTMLElement} */ (this.scene.querySelector(`[data-id="${id}"]`));
    const term = /** @type {HTMLElement} */ (this.equality.querySelector(`[data-id="${id}"]`));
    const from = term && term.getBoundingClientRect(), to = node && node.getBoundingClientRect();
    const result = g.take(id);
    if (result.refused === 'fixed' || result.refused === 'mystery') {
      this.say(result.refused === 'mystery' ? this.l10n.bagsStay : this.l10n.comesWithScale, 'hint');
      return;
    }
    if (!result.thing) {
      return;
    }
    if (from && to) {
      this.fly(this.format(result.thing.v), from, to);
    }
    this.sounds.play('take');
    if (g.current.pool) {
      this.fillTray();
    }
    this.changed(result.side === 'left' ? 1 : -1, result.thing.v * 0.6);
    const next = /** @type {HTMLElement} */ (this.scene.querySelector('.bs-mine') || this.trayBox.querySelector('button') || this.actionsBox.querySelector('button'));
    if (next) {
      next.focus({ preventScroll: true });
    }
    this.afterChange();
  }

  /** «Empty the pan»: everything the player put, back. */
  clear() {
    const g = this.game;
    if (this.busy || !g || g.roundOver || !g.clear()) {
      return;
    }
    this.sounds.play('take');
    if (g.current.pool) {
      this.fillTray();
    }
    this.changed();
    this.afterChange();
  }

  /**
   * Draws the scale again after a change; on the held option the stops come back up.
   * @param {number} [dir] -1 or 1: the pan that gets a push.
   * @param {number} [push] How hard.
   */
  changed(dir = 0, push = 0) {
    const g = this.game;
    if (g.held && !this.locked) {
      this.locked = true;
    }
    if (g.held && this.message) {
      this.message = null;
    }
    this.drawScene();
    this.writeEquality();
    this.render();
    this.kick(dir && !this.locked ? dir * Math.min(26, 8 + push * 1.2) : 0);
  }

  /** The free balance after every change: it may have balanced, the usual mistake is explained at once. */
  afterChange() {
    const g = this.game, t = this.l10n;
    if (g.held || g.current.topic === 'bag') {
      return;
    }
    if (g.free) {
      this.say('', 'hint');
      return;
    }
    const before = g.arrangement();
    const result = g.afterChange();
    if (result.got !== undefined) {
      this.celebrate(result, () => {
        const none = g.backs === 0;
        const text = none ? t.balancedClean : result.got ? t.balancedOne : t.balancedZero;
        return text + (result.levelUp ? ` ${this.levelUpText()}` : '');
      }, WIN_DELAY_MS);
      return;
    }
    if (result.help) {
      this.together(before, result.help);
      return;
    }
    if (result.slip) {
      this.say(this.slipText(result.slip), 'hint');
    } else if (result.hint) {
      this.say(fill(t.allPlacedHint, { hint: this.hintText(result.hint) }), 'hint');
    } else {
      this.say('', 'hint');
    }
  }

  /** «Let go of the scale» (held option) or «Try» (the mystery bag). */
  release() {
    const g = this.game, t = this.l10n, r = g.current;
    if (this.busy || g.roundOver) {
      return;
    }
    const guess = r.topic === 'bag' ? g.guess : undefined;
    if (r.topic === 'bag' && (guess === null || guess === undefined)) {
      this.say(t.chooseFirst, 'hint');
      return;
    }
    const before = { ...g.arrangement(), tried: r.topic === 'bag' ? guess : g.tried };
    const result = g.release(guess);
    if (result.notReady) {
      const ready = { putFirst: () => fill(t.putFirst, { side: this.sideWord(r.target) }),
        placeAll: () => (r.pool.length === 1 ? t.placeOne : fill(t.placeMany, { count: this.format(r.pool.length) })),
        chooseFirst: () => t.chooseFirst };
      this.say((ready[result.notReady] || (() => ''))(), 'hint');
      return;
    }
    if (g.held) {
      this.sounds.play('clack');
    }
    this.locked = false;
    if (r.topic === 'bag') {
      this.flyGuess(before.tried);
    }
    if (result.balanced) {
      this.drawScene();
      this.writeEquality();
      this.kick();
      this.celebrate(result, () => {
        const first = g.log[g.log.length - 1].attempts === 0;
        const text = r.topic === 'bag' ? fill(first ? t.bagFirst : t.bagSecond, { value: this.format(g.tried) })
          : first ? t.balancedFirst : t.balancedSecond;
        return text + (result.levelUp ? ` ${this.levelUpText()}` : '');
      }, 0);
      return;
    }
    this.sounds.play('miss');
    const why = result.slip ? this.slipText(result.slip) : this.hintText(result.hint, before);
    if (result.help) {
      this.together(before, result.help, why);
      return;
    }
    this.frozen = null;
    this.drawScene();
    this.writeEquality();
    this.kick();
    this.say(r.topic === 'bag' ? why : `${why} ${t.letGoAgain}`, 'bad');
  }

  /**
   * A round won: the beam swings, the equal sign lights up, a chord sounds; then the message and «Next».
   * @param {{got?: number, levelUp?: boolean}} result
   * @param {() => string} text
   * @param {number} delay
   */
  celebrate(result, text, delay) {
    this.busy = true;
    this.render();
    this.fillTray();
    const done = () => {
      this.busy = false;
      this.view().ring();
      this.wobble();
      this.sounds.play('balanced', this.game.streak || (result.got ? 1 : 0));
      if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) {
        navigator.vibrate(25);
      }
      if (result.levelUp) {
        setTimeout(() => {
          this.sounds.play('levelUp');
          this.levelText.classList.remove('bs-level-up');
          void this.levelText.offsetWidth;
          this.levelText.classList.add('bs-level-up');
        }, 450);
      }
      this.say(text(), 'ok');
      this.announcer.say(text());
      this.focusNext();
    };
    if (delay && !reducedMotion()) {
      setTimeout(done, delay);
    } else {
      done();
    }
  }

  /**
   * «Let's do it together»: the wrong arrangement stays a moment, then the game puts what was missing.
   * @param {{left: Thing[], right: Thing[], tried: number|null}} before
   * @param {Object} done What the game did (see BalanceGame.together).
   * @param {string} [why] What was wrong with the last try.
   */
  together(before, done, why) {
    const t = this.l10n;
    this.busy = true;
    this.frozen = before;
    this.drawScene();
    this.writeEquality();
    this.kick();
    this.say(why ? `${why} ${t.together}` : t.together, why ? 'bad' : 'hint');
    this.fillTray();
    const show = () => {
      this.frozen = null;
      this.busy = false;
      this.drawScene();
      this.writeEquality();
      this.fillTray();
      if (this.guessOutput && this.game.current.topic === 'bag') {
        this.guessOutput.textContent = this.format(this.game.tried);
      }
      this.kick();
      this.wobble();
      this.view().ring();
      this.sounds.play('balanced', 0);
      const text = this.togetherText(done);
      this.say(text, 'hint');
      this.announcer.say(text);
      this.focusNext();
    };
    if (reducedMotion()) {
      show();
    } else {
      setTimeout(show, TOGETHER_DELAY_MS);
    }
  }

  focusNext() {
    this.render();
    if (this.nextButton && this.nextButton.isConnected) {
      this.nextButton.focus({ preventScroll: true });
      bringIntoView(this.nextButton);
    }
  }

  levelUpText() {
    const t = this.l10n, name = [t.levelOne, t.levelTwo, t.levelThree][this.game.level];
    return fill(t.levelUp, { level: name.toLocaleLowerCase(this.locale) });
  }

  // --- Texts -------------------------------------------------------------------------------------------------------

  /**
   * @param {{type: string, mine: number, already: number[], side: string, other: string}} slip
   * @returns {string} The usual mistake, explained: what is already on the pan.
   */
  slipText(slip) {
    const t = this.l10n, g = this.game;
    const already = slip.already.length === 1 ? fill(t.alreadyOne, { value: this.format(slip.already[0]) })
      : slip.already.map((v) => this.format(v)).join(' + ');
    const relation = `${this.format(g.weight('left'))} ${g.relation()} ${this.format(g.weight('right'))}`;
    return fill(slip.type === 'other' ? t.slipOther : t.slipAll, {
      mine: this.format(slip.mine), other: this.sideWord(slip.other), side: this.sideWord(slip.side), already, relation,
    });
  }

  /**
   * @param {Object} hint What is missing and where (see BalanceGame.hint).
   * @param {{left: Thing[], right: Thing[], tried: number|null}} [shown]
   * @returns {string}
   */
  hintText(hint, shown) {
    const t = this.l10n, g = this.game;
    const L = g.weight('left'), R = g.weight('right');
    const relation = `${this.format(L)} ${L === R ? '=' : L > R ? '>' : '<'} ${this.format(R)}`;
    if (hint.type === 'bag') {
      return fill(hint.smaller ? t.hintBagSmaller : t.hintBagBigger, { value: this.format((shown && shown.tried) ?? g.tried), relation });
    }
    if (hint.type === 'shareOdd') {
      return fill(t.hintShareOdd, { relation });
    }
    if (hint.type === 'share') {
      return fill(t.hintShare, { half: this.format(hint.half), heavy: this.sideWord(hint.heavy), weighs: this.format(hint.weighs),
        move: this.format(hint.move), light: this.sideWord(other(hint.heavy)) });
    }
    const amount = hint.bags ? (hint.bags === 1 ? fill(t.oneBag, { size: this.format(hint.size) })
      : fill(t.manyBags, { count: this.format(hint.bags), size: this.format(hint.size) })) : this.format(hint.amount);
    const one = hint.bags ? hint.bags === 1 : hint.amount === 1;
    const key = hint.extra ? (one ? 'hintExtraOne' : 'hintExtra') : (one ? 'hintMissingOne' : 'hintMissing');
    return fill(t[key], { side: this.sideWord(hint.side), amount, relation });
  }

  /** @param {Object} done @returns {string} What the game did together. */
  togetherText(done) {
    const t = this.l10n;
    if (done.topic === 'equalities') {
      return fill(t.togetherEqualities, { side: this.sideWord(done.side), amount: this.format(done.amount) });
    }
    if (done.topic === 'groups') {
      return done.total === undefined ? fill(t.togetherBags, { count: this.format(done.count), size: this.format(done.size) })
        : fill(t.togetherGroups, { count: this.format(done.count), size: this.format(done.size), total: this.format(done.total) });
    }
    if (done.topic === 'share') {
      return fill(t.togetherShare, { half: this.format(done.half) });
    }
    return fill(t.togetherBag, { value: this.format(done.value) });
  }

  // --- Touch, mouse and keyboard -----------------------------------------------------------------------------------

  sceneClick(e) {
    const thing = e.target && /** @type {HTMLElement} */ (e.target).closest && /** @type {HTMLElement} */ (e.target).closest('[data-id]');
    if (thing) {
      this.take(/** @type {HTMLElement} */ (thing).dataset.id);
    }
  }

  /** @param {HTMLElement} b A tray button: tapped, it goes to its pan or asks for the side. */
  activate(b) {
    const g = this.game;
    if (!g.twoSides) {
      this.put(/** @type {'left'|'right'} */ (g.current.target), b);
      return;
    }
    this.askSide(b);
  }

  /** @param {HTMLElement} b Which pan, for a weight that can go on either. */
  askSide(b) {
    this.closeAsk();
    const t = this.l10n;
    const go = (side) => {
      this.closeAsk();
      this.put(side, b);
    };
    const pop = el('div', { class: 'bs-ask-side', role: 'group', 'aria-label': fill(t.whichSide, { value: b.dataset.value }) }, [
      btn({ type: 'button', class: 'bs-button bs-secondary', text: `◀ ${t.toLeft}`, onclick: () => go('left') }),
      btn({ type: 'button', class: 'bs-button bs-secondary', text: `${t.toRight} ▶`, onclick: () => go('right') }),
    ]);
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAsk();
        b.focus();
      }
    });
    this.root.append(pop);
    const box = this.root.getBoundingClientRect(), at = b.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(box.width - pop.offsetWidth - 8, at.left - box.left + at.width / 2 - pop.offsetWidth / 2))}px`;
    pop.style.top = `${Math.max(4, at.top - box.top - pop.offsetHeight - 10)}px`;
    /** @type {HTMLElement} */ (pop.querySelector('button')).focus();
    this.outside = (e) => {
      if (!e.target.closest('.bs-ask-side')) {
        this.closeAsk();
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', this.outside), 0);
  }

  closeAsk() {
    const pop = this.root.querySelector('.bs-ask-side');
    if (pop) {
      pop.remove();
    }
    if (this.outside) {
      document.removeEventListener('pointerdown', this.outside);
    }
  }

  /**
   * Dragging a weight: it lifts, leans with the movement and lights the pan it would land in. Anywhere in a half of
   * the scene is that pan: young hands do not have to aim.
   * @param {HTMLButtonElement} b
   */
  hookDrag(b) {
    let start = null, ghost = null, moved = false, lastX = 0, lean = 0;
    b.addEventListener('click', () => {
      if (moved) {
        moved = false;
        return;
      }
      this.activate(b);
    });
    b.addEventListener('keydown', (e) => {
      moved = false;
      if (this.game && this.game.twoSides && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        this.put(e.key === 'ArrowLeft' ? 'left' : 'right', b);
      }
    });
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.busy) {
        return;
      }
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      lastX = e.clientX;
      lean = 0;
      b.setPointerCapture(e.pointerId);
    });
    b.addEventListener('pointermove', (e) => {
      if (!start) {
        return;
      }
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
        this.closeAsk();
        ghost = /** @type {HTMLElement} */ (b.cloneNode(true));
        ghost.classList.add('bs-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        // A copied canvas comes out blank: the picture is drawn again.
        const from = b.querySelector('canvas'), to = ghost.querySelector('canvas');
        if (from && to) {
          to.getContext('2d').drawImage(from, 0, 0);
        }
        this.root.append(ghost);
        moved = true;
      }
      if (ghost) {
        lean = lean * 0.7 + Math.max(-18, Math.min(18, (e.clientX - lastX) * 1.6)) * 0.3;
        lastX = e.clientX;
        ghost.style.left = `${e.clientX - ghost.offsetWidth / 2}px`;
        ghost.style.top = `${e.clientY - ghost.offsetHeight * 0.75}px`;
        ghost.style.transform = reducedMotion() ? 'none' : `rotate(${lean.toFixed(1)}deg) scale(1.12)`;
        const side = this.sideAt(e.clientX, e.clientY);
        if (side !== this.aim) {
          this.aim = side;
          this.paint();
        }
      }
    });
    const end = (e) => {
      if (!start) {
        return;
      }
      start = null;
      const side = ghost ? this.sideAt(e.clientX, e.clientY) : null;
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      if (this.aim) {
        this.aim = null;
        this.paint();
      }
      if (side) {
        this.put(side, b);
      }
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', () => {
      start = null;
      moved = false;
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      this.aim = null;
      this.paint();
    });
  }

  /** @returns {'left'|'right'|null} The pan under the pointer: a half of the scene. */
  sideAt(x, y) {
    const box = this.scene.getBoundingClientRect();
    if (y < box.top - 20 || y > box.bottom + 20 || x < box.left || x > box.right) {
      return null;
    }
    return x < box.left + box.width / 2 ? 'left' : 'right';
  }

  /**
   * A number flies from one place to another (from the scale to the equality, or back), so the two are one thing.
   * @param {string} text
   * @param {DOMRect} from
   * @param {DOMRect} to
   * @param {() => void} [done]
   */
  fly(text, from, to, done) {
    if (reducedMotion() || !from || !to) {
      if (done) {
        done();
      }
      return;
    }
    const n = el('span', { class: 'bs-flying', 'aria-hidden': 'true', text });
    const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
    n.style.left = `${fx}px`;
    n.style.top = `${fy}px`;
    this.root.append(n);
    n.getBoundingClientRect();
    n.style.transform = `translate(-50%, -50%) translate(${to.left + to.width / 2 - fx}px, ${to.top + to.height / 2 - fy}px)`;
    setTimeout(() => {
      n.remove();
      if (done) {
        done();
      }
    }, 470);
  }

  /** @param {Thing} thing Its number, from the pan to its place in the equality. */
  flyIn(thing) {
    const term = /** @type {HTMLElement} */ (this.equality.querySelector(`[data-id="${thing.id}"]`));
    if (!term || reducedMotion()) {
      return;
    }
    term.style.visibility = 'hidden';
    setTimeout(() => {
      const node = this.scene.querySelector(`[data-id="${thing.id}"]`);
      this.fly(this.format(thing.v), node && node.getBoundingClientRect(), term.getBoundingClientRect(), () => {
        term.style.visibility = '';
        term.classList.add('bs-arrive');
      });
    }, 230);
  }

  /** @param {number} value The number of the bags, from the dial to every bag in the equality. */
  flyGuess(value) {
    if (!this.guessOutput || reducedMotion()) {
      return;
    }
    const from = this.guessOutput.getBoundingClientRect();
    requestAnimationFrame(() => {
      this.equality.querySelectorAll('[data-id]').forEach((term) => {
        const id = /** @type {HTMLElement} */ (term).dataset.id;
        const thing = [...this.game.current.left, ...this.game.current.right].find((x) => x.id === id);
        if (thing && thing.kind === 'mystery') {
          /** @type {HTMLElement} */ (term).style.visibility = 'hidden';
          this.fly(this.format(value), from, term.getBoundingClientRect(), () => {
            /** @type {HTMLElement} */ (term).style.visibility = '';
            term.classList.add('bs-arrive');
          });
        }
      });
    });
  }

  // --- Fitting the board -------------------------------------------------------------------------------------------

  /** @returns {number} The height of what the player sees: the screen in full screen, the outermost window otherwise. */
  viewHeight() {
    if (this.container && this.container.closest('.h5p-fullscreen, .h5p-semi-fullscreen')) {
      return window.innerHeight;
    }
    let height = window.innerHeight;
    try {
      /** @type {Window} */
      let win = window;
      while (win.parent !== win && win.parent.document) {
        win = win.parent;
        height = win.innerHeight;
      }
    } catch (e) {
      // A frame of another site: the last one that could be read.
    }
    return height;
  }

  /**
   * The whole round fits on a classroom board under the bar of the page (1280×600, 960×540…): side by side on wide
   * screens, the scale takes the height that is left.
   */
  fit() {
    if (!this.root || this.gameView.hidden || !this.scene.isConnected) {
      return;
    }
    this.root.classList.toggle('bs-wide', this.root.clientWidth >= WIDE);
    const full = !!(this.container && this.container.closest('.h5p-fullscreen, .h5p-semi-fullscreen'));
    // On a short board the weights of the tray are drawn smaller, so it takes fewer rows.
    const scale = this.viewHeight() - (full ? 0 : BAR) < 600 ? 0.62 : 0.8;
    if (scale !== this.trayScale) {
      this.trayScale = scale;
      if (this.game && this.game.current && !this.game.roundOver) {
        this.fillTray();
      }
    }
    const wide = this.root.classList.contains('bs-wide');
    for (let k = 0; k < 3; k++) {
      const page = document.documentElement.scrollHeight;
      const used = page - this.scene.getBoundingClientRect().height;
      const room = this.viewHeight() - (full ? 0 : BAR + (wide ? 0 : BOTTOM_BAR)) - used - 10;
      const height = Math.round(Math.max(MIN_SCENE, Math.min(room, 560, this.scene.clientWidth / (wide ? 1.15 : 1.35))));
      const now = parseFloat(this.root.style.getPropertyValue('--bs-scene-h')) || 0;
      if (Math.abs(now - height) < 2) {
        break;
      }
      this.root.style.setProperty('--bs-scene-h', `${height}px`);
    }
    this.paint();
    this.trigger('resize');
  }

  // --- The end -----------------------------------------------------------------------------------------------------

  afterFinish() {
    this.render();
    this.trigger(this.answeredEvent());
    // H5P platforms such as Moodle stop saving the state once the score is sent: it is deleted instead, so a reload
    // starts a new game.
    if (this.isRoot() && H5P.deleteUserData && this.contentId !== undefined) {
      H5P.deleteUserData(this.contentId, 'state', 0);
    }
    this.cheerBox.focus();
    bringIntoView(this.cheer);
    const tier = cheerTier(this.game.score, this.game.maxScore);
    confetti(this.root, CONFETTI[tier] || 0);
    setTimeout(() => this.sounds.play(tier === 'perfect' || tier === 'great' ? 'cheer' : 'done'), CHEER_DELAY_MS);
  }

  /** The end screen: the cheer and what happened in each round. */
  renderResults() {
    const g = this.game, t = this.l10n;
    const tier = cheerTier(g.score, g.maxScore);
    this.cheer.className = `bs-cheer bs-cheer-${tier}`;
    this.ring.replaceChildren(scoreRing(g.score, g.maxScore));
    this.cheerTitle.textContent = { perfect: t.cheerPerfect, great: t.cheerGreat, good: t.cheerGood, keep: t.cheerKeep }[tier];
    this.resultTitle.textContent = fill(t.resultTitle, { score: g.score, total: g.maxScore });
    this.review.replaceChildren(...g.log.map((entry) => {
      const state = entry.got === POINTS ? 'ok' : entry.got > 0 ? 'half' : 'bad';
      return el('li', { class: `bs-review-item bs-${state}` }, [
        icon(state),
        el('div', { class: 'bs-review-body' }, [
          el('p', { class: 'bs-review-asked', text: this.askedText(entry) }),
          el('p', { class: 'bs-review-did', text: this.didText(entry) }),
        ]),
        el('p', { class: 'bs-review-points', text: fill(t.reviewPoints, { got: entry.got, of: POINTS }) }),
      ]);
    }));
    this.retryButton.hidden = !this.behaviour.enableRetry;
    this.otherButton.hidden = this.topic !== 'choose';
  }

  /** @param {Object} entry @returns {string} What a round asked, for the review. */
  askedText(entry) {
    return `${this.challengeText(entry.round)}${entry.review ? ` (${this.l10n.reviewAgain})` : ''}`;
  }

  /** @param {Object} entry @returns {string} How the round ended, and how it got there. */
  didText(entry) {
    const t = this.l10n, r = entry.round;
    const final = this.arrangementText(r, { left: r.left, right: r.right, tried: entry.tried }, '=');
    let how;
    if (entry.helped) {
      how = entry.tries.length
        ? fill(t.didTogether, { tries: entry.tries.map((a) => this.arrangementText(r, a, this.relationOf(r, a))).join('; ') })
        : fill(t.didTogetherBacks, { count: this.format(entry.backs) });
    } else if (r.topic === 'bag' || this.held) {
      how = entry.attempts === 0 ? t.didFirst
        : fill(t.didSecond, { try: this.arrangementText(r, entry.tries[0], this.relationOf(r, entry.tries[0])) });
    } else {
      how = entry.backs ? fill(t.didBacks, { count: this.format(entry.backs) }) : t.didClean;
    }
    return `${final}, ${how}`;
  }

  /** @returns {string} The relation of an arrangement saved in a round. */
  relationOf(r, a) {
    const weigh = (side) => sum(a[side].map((x) => (x.kind === 'mystery' ? (a.tried ?? r.x) : x.v)));
    const L = weigh('left'), R = weigh('right');
    return L === R ? '=' : L > R ? '>' : '<';
  }

  /** The speaker button: mutes or brings the sound back, and remembers it. */
  toggleSound() {
    this.sounds.setMuted(!this.sounds.muted);
    this.paintSound();
    this.announcer.say(this.sounds.muted ? this.l10n.soundMuted : this.l10n.soundUnmuted);
    this.sounds.play('tick');
  }

  /** «Play again»: a new game on the same topic, a new attempt. */
  retry() {
    this.resetTask({ sameTopic: true });
    this.start();
  }

  // --- The H5P contract (Question type) ----------------------------------------------------------------------------

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
    this.activityStartTime = undefined;
    this.message = null;
    this.busy = false;
    this.frozen = null;
    this.render();
  }

  /**
   * @returns {Object|undefined} What H5P saves to resume the game. Nothing before the first round, once it is over or
   *   on the free balance: H5P core would take a null for content that has changed, and show its «Data Reset» dialog.
   */
  getCurrentState() {
    return this.game && this.game.phase === 'playing' && !this.game.free ? this.game.toState() : undefined;
  }

  /**
   * @param {Object} entry
   * @returns {{accepted: string[], given: string}} A round for the report, with what it asked in its own text, because
   *   Moodle's table only shows the answers.
   */
  reportOf(entry) {
    const r = entry.round, asked = this.challengeText(r);
    const right = `${asked} → ${this.arrangementText(r, { left: r.left, right: r.right, tried: entry.tried }, '=')}`;
    if (entry.got > 0) {
      return { accepted: [right], given: right };
    }
    const tries = entry.tries.map((a) => this.arrangementText(r, a, this.relationOf(r, a))).join('; ');
    return { accepted: [right], given: `${asked} → ${tries || '—'}` };
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

H5P.BalanceScale = BalanceScale;
