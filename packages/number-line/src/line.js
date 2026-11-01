// The number line of H5P.NumberLine, drawn in SVG to the width it is given: ticks, labels, the arcs of the jumps that
// stay drawn, the flag and the piece that jumps. Colours come from the styles, so it follows the theme without redrawing.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { reducedMotion } from '../../shared/cheer.js';
import { PIECES } from './pieces.js';

const SVG = 'http://www.w3.org/2000/svg';
const PADDING = 26;
const HEIGHT = 190;
const BASELINE = 130;
/** The steps labels can go by: the first one that leaves them room. */
const LABEL_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const LABEL_ROOM = 26;
/** On a big screen the whole line grows with its width, up to this, so it can be seen from the back of a classroom. */
const MAX_SCALE = 2;
const SCALE_FROM_WIDTH = 800;
/** How close to the piece a drawn arc can start, in pixels of the line and as a share of its width. */
const GRAB_MIN = 28;
const GRAB_SHARE = 0.055;
/** Below this many pixels per unit, the small ticks would only make a smudge. */
const TICK_ROOM = 4;

/**
 * @param {string} tag
 * @param {Object<string, string|number>} attributes
 * @param {string} [text]
 * @returns {SVGElement}
 */
export function svg(tag, attributes, text) {
  const node = document.createElementNS(SVG, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export class Line {
  /**
   * @param {object} options
   * @param {number} options.max The end of the line; it starts at 0.
   * @param {(value: number) => string} options.format How a number is written.
   * @param {number[]} [options.ticks] Where the ticks go; without them, by the width (see drawScale).
   * @param {number[]|null} [options.labels] What is written under the line; null, by the width.
   * @param {number|null} [options.labelEvery] Writes only every so many, whatever the width, and leaves more to work out.
   * @param {boolean} [options.units] Whether every whole number gets a tick when there is room.
   * @param {string} [options.character] Which piece jumps (pieces.js).
   */
  constructor({ max, format, ticks = [], labels = null, labelEvery = null, units = false, character = 'muelle' }) {
    this.character = character;
    this.max = max;
    this.format = format;
    this.ticks = ticks;
    this.labels = labels;
    this.labelEvery = labelEvery;
    this.units = units;
    this.scale = 1;
    /** @type {{from: number, to: number}|null} The arc being drawn with the finger. */
    this.drawing = null;
    /** @type {Array<{from: number, to: number, text: string|null, off: boolean}>} */
    this.arcs = [];
    /** @type {number|null} Where the piece is. */
    this.piece = null;
    /** @type {{at: number, lift: number, t: number, dir: number}|null} The piece in the middle of a jump. */
    this.flying = null;
    /** @type {number|null} */
    this.flag = null;
    /** @type {string|null} What the flag says, when it is not the number itself. */
    this.flagText = null;
    /** @type {number|null} Where the player put the mark. */
    this.mark = null;
    /** @type {number|null} Where the number really was. */
    this.solution = null;
    /** @type {string|null} */
    this.solutionText = null;
    this.node = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (svg('svg', { class: 'nl-line' })));
    this.width = 0;
    this.observer = new ResizeObserver(() => this.fit());
  }

  /** Draws it now that it is on the page, and again whenever its width changes. */
  show() {
    this.observer.observe(this.node.parentElement);
    this.fit();
  }

  /** Stops following the width, when the round is over and the line goes away. */
  remove() {
    this.observer.disconnect();
    this.node.remove();
  }

  fit() {
    const width = this.node.parentElement ? this.node.parentElement.clientWidth : 0;
    if (width > 0 && width !== this.pixels) {
      this.pixels = width;
      this.scale = Math.max(1, Math.min(MAX_SCALE, width / SCALE_FROM_WIDTH));
      this.width = width / this.scale;
      this.draw();
    }
  }

  /**
   * @param {MouseEvent} e
   * @returns {number} The value under the pointer, inside the line.
   */
  valueAtEvent(e) {
    this.fit();
    return this.valueAt((e.clientX - this.node.getBoundingClientRect().left) / this.scale);
  }

  /**
   * Lets the player draw a jump from the piece with a finger or the mouse: it starts near the piece and ends on the
   * nearest whole number, so it needs no precision. A tap on the line elsewhere is a tap, if that is any use. A second
   * finger cancels, because it is usually a palm on an interactive whiteboard.
   * @param {object} handlers
   * @param {(to: number) => void} handlers.onDraw
   * @param {(at: number) => void} [handlers.onTap]
   */
  enableDrawing({ onDraw, onTap }) {
    this.node.classList.add('nl-line-draw');
    /** @type {{id: number, drawing: boolean}|null} */
    let active = null;
    this.node.addEventListener('pointerdown', (e) => {
      if (active) {
        active = null;
        this.drawing = null;
        this.draw();
        return;
      }
      if (e.button !== 0 || this.piece === null) {
        return;
      }
      const grab = Math.max(GRAB_MIN, this.width * GRAB_SHARE);
      const near = Math.abs(this.x(this.valueAtEvent(e)) - this.x(this.piece)) <= grab;
      active = { id: e.pointerId, drawing: near };
      this.node.setPointerCapture(e.pointerId);
    });
    this.node.addEventListener('pointermove', (e) => {
      if (!active || !active.drawing || e.pointerId !== active.id) {
        return;
      }
      const to = Math.round(this.valueAtEvent(e));
      this.drawing = to === this.piece ? null : { from: this.piece, to };
      this.draw();
    });
    this.node.addEventListener('pointerup', (e) => {
      if (!active || e.pointerId !== active.id) {
        return;
      }
      const drawn = active.drawing && this.drawing ? this.drawing.to : null;
      const wasDrawing = active.drawing;
      active = null;
      this.drawing = null;
      this.draw();
      if (drawn !== null) {
        onDraw(drawn);
      } else if (!wasDrawing && onTap) {
        onTap(Math.round(this.valueAtEvent(e)));
      }
    });
    this.node.addEventListener('pointercancel', () => {
      active = null;
      this.drawing = null;
      this.draw();
    });
  }

  /**
   * @param {number} value
   * @returns {number} Its place, in pixels from the left of the line's box.
   */
  x(value) {
    return PADDING + (value / this.max) * (this.width - 2 * PADDING);
  }

  /**
   * @param {number} pixels From the left of the line's box.
   * @returns {number} The value at that place, inside the line.
   */
  valueAt(pixels) {
    const value = ((pixels - PADDING) / (this.width - 2 * PADDING)) * this.max;
    return Math.max(0, Math.min(this.max, value));
  }

  /** Ticks and labels by the width: every whole number when there is room, and labels that do not touch. */
  drawScale() {
    const room = (this.width - 2 * PADDING) / this.max;
    const ticks = this.ticks.slice();
    if (this.units && room >= TICK_ROOM) {
      for (let value = 0; value <= this.max; value++) {
        ticks.push(value);
      }
    }
    ticks.forEach((value) => {
      this.node.append(svg('line', {
        class: 'nl-tick', x1: this.x(value), x2: this.x(value), y1: BASELINE - 7, y2: BASELINE + 7,
      }));
    });
    let labels = this.labels;
    if (!labels) {
      const fits = LABEL_STEPS.find((s) => s * room >= LABEL_ROOM) || this.max;
      const step = Math.max(fits, this.labelEvery || 0);
      labels = [];
      for (let value = 0; value <= this.max; value += step) {
        labels.push(value);
      }
    }
    labels.forEach((value) => {
      this.node.append(svg('line', {
        class: 'nl-tick-major', x1: this.x(value), x2: this.x(value), y1: BASELINE - 10, y2: BASELINE + 10,
      }));
      // A label under the flag would be written over by the flag's own.
      if (value !== this.flag && value !== this.solution) {
        this.node.append(svg('text', {
          class: 'nl-label', x: this.x(value), y: BASELINE + 30, 'text-anchor': 'middle',
        }, this.format(value)));
      }
    });
  }

  /**
   * @param {number} from
   * @param {number} to
   * @returns {number} How high a jump goes: more for a longer one.
   */
  rise(from, to) {
    return Math.min(70, 16 + Math.abs(this.x(to) - this.x(from)) * 0.45);
  }

  /** @param {{from: number, to: number, text: string|null, off: boolean}} arc */
  drawArc({ from, to, text, off }) {
    const start = this.x(from), end = this.x(to), middle = (start + end) / 2, rise = this.rise(from, to);
    // A step back goes dashed, so the direction does not depend on the colour.
    this.node.append(svg('path', {
      class: `nl-arc${off ? ' nl-arc-off' : ''}${to < from ? ' nl-arc-back' : ''}`,
      d: `M ${start} ${BASELINE} Q ${middle} ${BASELINE - rise * 2} ${end} ${BASELINE}`,
    }));
    if (text) {
      this.node.append(svg('text', {
        class: `nl-arc-text${off ? ' nl-arc-off-text' : ''}`, x: middle, y: BASELINE - rise - 5, 'text-anchor': 'middle',
      }, text));
    }
  }

  drawFlag() {
    const x = this.x(this.flag);
    this.node.append(svg('line', { class: 'nl-flag-pole', x1: x, x2: x, y1: BASELINE, y2: BASELINE - 62 }));
    this.node.append(svg('path', { class: 'nl-flag', d: `M ${x} ${BASELINE - 62} l 22 8 l -22 8 z` }));
    this.node.append(svg('text', {
      class: 'nl-flag-text', x, y: BASELINE + 30, 'text-anchor': 'middle',
    }, this.flagText ?? this.format(this.flag)));
  }

  drawSolution() {
    const x = this.x(this.solution);
    this.node.append(svg('path', { class: 'nl-solution', d: `M ${x} ${BASELINE - 6} l -9 -16 h 18 z` }));
    this.node.append(svg('text', {
      class: 'nl-solution-text', x, y: BASELINE + 30, 'text-anchor': 'middle',
    }, this.solutionText ?? this.format(this.solution)));
  }

  drawMark() {
    this.node.append(svg('circle', { class: 'nl-mark', cx: this.x(this.mark), cy: BASELINE, r: 11 }));
  }

  /** The piece on the line, or in the middle of a jump: each one goes in its own way (pieces.js). */
  drawPiece() {
    const at = this.flying ? this.flying.at : this.piece;
    const lift = this.flying ? this.flying.lift : 0;
    const group = svg('g', { class: 'nl-piece' });
    (PIECES[this.character] || PIECES.muelle)(group, svg, this.x(at), BASELINE - 1 - lift, this.flying);
    this.node.append(group);
  }

  draw() {
    if (!this.width) {
      return;
    }
    this.node.setAttribute('viewBox', `0 0 ${this.width} ${HEIGHT}`);
    this.node.setAttribute('width', String(this.pixels));
    this.node.setAttribute('height', String(HEIGHT * this.scale));
    this.node.replaceChildren(svg('line', {
      class: 'nl-axis', x1: this.x(0), x2: this.x(this.max), y1: BASELINE, y2: BASELINE,
    }));
    this.drawScale();
    this.arcs.forEach((arc) => this.drawArc(arc));
    if (this.drawing) {
      const { from, to } = this.drawing;
      this.drawArc({ from, to, text: `${to > from ? '+' : '−'}${Math.abs(to - from)}`, off: false });
    }
    if (this.flag !== null) {
      this.drawFlag();
    }
    if (this.solution !== null) {
      this.drawSolution();
    }
    if (this.mark !== null) {
      this.drawMark();
    }
    if (this.piece !== null) {
      this.drawPiece();
    }
  }

  /**
   * The piece jumps to a place along an arc, which stays drawn.
   * @param {number} to
   * @param {object} [options]
   * @param {string|null} [options.text] What the arc says.
   * @param {boolean} [options.off] Whether this way does not get to the flag.
   * @param {number} [options.ms] How long the jump takes.
   * @returns {Promise<void>}
   */
  hop(to, { text = null, off = false, ms = 420 } = {}) {
    const from = this.piece;
    const land = () => {
      this.piece = to;
      this.flying = null;
      this.arcs.push({ from, to, text, off });
      this.draw();
    };
    if (reducedMotion() || !this.width) {
      land();
      return Promise.resolve();
    }
    const rise = this.rise(from, to);
    return new Promise((done) => {
      const started = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - started) / ms);
        this.flying = { at: from + (to - from) * t, lift: 4 * rise * t * (1 - t), t, dir: Math.sign(to - from) };
        this.draw();
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          land();
          done();
        }
      };
      requestAnimationFrame(step);
    });
  }
}
