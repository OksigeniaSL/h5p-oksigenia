// Small DOM helpers shared by the games.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

/**
 * Creates an element with attributes and children. Text children are always set as text, never as markup.
 * @param {string} tag
 * @param {Object<string, *>} [attrs] `class`, `text`, `on<event>` handlers, booleans and other attributes.
 * @param {Array<Node|string>} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) {
      return;
    }
    if (key === 'class') {
      node.className = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  });
  children.forEach((child) => node.append(child));
  return node;
}

/**
 * H5P stores plain text fields with HTML entities («&amp;»). Turns them back into text, to be set with textContent.
 * @param {string} value
 * @returns {string}
 */
export function plain(value) {
  const box = document.createElement('textarea');
  box.innerHTML = String(value ?? '');
  return box.value.trim();
}

/**
 * The texts of a game: its defaults, with those of the content on top. Once a package is uploaded, H5P keeps plain text
 * fields with entities («t&#039;entraîner»), so each one is turned back into text, to be set with textContent.
 * @param {Object<string, string>} defaults
 * @param {Object<string, string>} [given]
 * @returns {Object<string, string>}
 */
export function texts(defaults, given) {
  return Object.fromEntries(Object.entries({ ...defaults, ...(given || {}) }).map(([key, value]) => [key, plain(value)]));
}

/**
 * Replaces @placeholders in a translated text.
 * @param {string} text
 * @param {Object<string, string|number>} values
 * @returns {string}
 */
export function fill(text, values) {
  return String(text ?? '').replace(/@(\w+)/g, (match, key) => (key in values ? String(values[key]) : match));
}

/**
 * A polite live region for screen readers. The same message twice is announced twice.
 */
export class Announcer {
  constructor() {
    this.node = el('div', { class: 'h5p-oksigenia-sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    /** @type {any} */
    this.handle = 0;
  }

  /** @param {string} text */
  say(text) {
    clearTimeout(this.handle);
    this.node.textContent = '';
    this.handle = setTimeout(() => {
      this.node.textContent = text;
    }, 100);
  }
}

/** Room kept at the top and the bottom of the window: pages keep bars there (the header and footer of Moodle). */
const VIEW_MARGIN = 80;

/**
 * In real full screen H5P hides its own buttons and leaves only the Esc key to come out, and a board has no keyboard. This
 * button, shown by the styles of each game only then, goes where the button to go in was, with the platform's own words.
 * In the semi full screen of browsers without the full-screen API, H5P puts its own.
 * @param {string} prefix The class prefix of the game (`aw`, `nl`).
 * @param {Node} glyph Its icon.
 * @returns {HTMLButtonElement}
 */
export function exitFullScreenButton(prefix, glyph) {
  const label = H5P.t('disableFullscreen');
  return /** @type {HTMLButtonElement} */ (el('button', {
    type: 'button', class: `${prefix}-button ${prefix}-secondary ${prefix}-exit-full`, title: label, 'aria-label': label,
    onclick: () => {
      if (typeof H5P.exitFullScreen === 'function') {
        H5P.exitFullScreen();
      }
    },
  }, [glyph]));
}

/**
 * @returns {boolean} Whether the browser has container queries. Firefox has them from version 110 (2023); some classroom
 *   boards with Android 8 bring Firefox 98, and there the styles that need them are left out.
 */
export function containerQueries() {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('container-type', 'inline-size');
}

/**
 * The windows around this frame that can be read, from this one outwards. A frame of another site ends the list.
 * @returns {Window[]}
 */
function readableWindows() {
  /** @type {Window[]} */
  const list = [window];
  try {
    /** @type {Window} */
    let win = window;
    while (win.parent !== win && win.parent.document) {
      win = win.parent;
      list.push(win);
    }
  } catch (e) {
    // A frame of another site: nothing beyond it can be read.
  }
  return list;
}

/**
 * @param {Element} node
 * @returns {boolean} Whether the element shows in the outermost window that can be read, clear of its bars.
 */
function inView(node) {
  const { top, height, room } = placeOf(node);
  // Below the bars at the top of the page, which may be taller than Moodle's.
  return top >= Math.max(VIEW_MARGIN, pageBar() + BAR_GAP) && top + height <= room - VIEW_MARGIN;
}

/**
 * @param {Element} node
 * @returns {boolean} Whether nothing of the element shows in the outermost window that can be read: no one can be about
 *   to press it.
 */
function outOfSight(node) {
  const { top, height, room } = placeOf(node);
  return top >= room || top + height <= 0;
}

/**
 * @param {Element} node
 * @returns {{top: number, height: number, room: number}} Where the element is in the outermost window that can be read,
 *   and the height of that window.
 */
function placeOf(node) {
  const box = node.getBoundingClientRect();
  const windows = readableWindows();
  let top = box.top;
  windows.slice(0, -1).forEach((win) => {
    const frame = win.frameElement;
    top += frame ? frame.getBoundingClientRect().top : 0;
  });
  return { top, height: box.height, room: windows[windows.length - 1].innerHeight };
}

/** Moodle's fixed bar: the least there is over a game in the page of a platform. */
const LMS_BAR = 60;
/** Room between the bars at the top of the page and what is brought into view under them. */
const BAR_GAP = 20;

/**
 * @returns {number} The bars fixed at the top of the outermost page that can be read, which stay over the game:
 *   Moodle's 60 px at least, and more where a site stacks more (campus.oksigenia.com has 104 px, and covered the dots of
 *   the rounds of the Balance Scale at 1280 × 600). A bar is wide and low; a drawer at the side (Moodle's course index)
 *   or a dialog is not.
 */
export function pageBar() {
  let bottom = 0;
  const windows = readableWindows(), win = windows[windows.length - 1];
  if (win !== window) {
    const doc = win.document;
    const isBar = (r) => r.width >= win.innerWidth / 2 && r.height < win.innerHeight / 3 && r.top <= bottom + 4;
    // Down the stack of bars: each fixed or sticky one under the last, at three points across the page.
    for (let k = 0; k < 4; k++) {
      const before = bottom;
      for (const x of [0.25, 0.5, 0.75]) {
        for (let n = doc.elementFromPoint(win.innerWidth * x, bottom + 2); n && n !== doc.body && n !== doc.documentElement; n = n.parentElement) {
          const position = win.getComputedStyle(n).position;
          if (position === 'fixed' || position === 'sticky') {
            const r = n.getBoundingClientRect();
            if (isBar(r)) {
              bottom = Math.max(bottom, r.bottom);
            }
            break;
          }
        }
      }
      if (bottom <= before) {
        break;
      }
    }
  }
  return Math.max(LMS_BAR, Math.round(bottom));
}

/**
 * @returns {number} The height a step can take and still be in view whole, clear of the bars of the page (see `inView`);
 *   0 when the outermost window cannot be read: what can be read is then a frame as tall as the game, and a game that grew
 *   with it would never stop growing.
 */
export function roomInView() {
  const windows = readableWindows(), win = windows[windows.length - 1];
  return win === window.top ? Math.max(0, win.innerHeight - pageBar() - BAR_GAP - VIEW_MARGIN) : 0;
}

/**
 * Calls back whenever the outermost window that can be read changes size (a cable plugged into a board, full screen, a
 * tablet turned round). The frames around a game only tell it about the width.
 * @param {() => void} onChange
 */
export function watchRoom(onChange) {
  const windows = readableWindows();
  windows[windows.length - 1].addEventListener('resize', onChange);
}

/**
 * The room above a step brought into view: its own `scroll-margin-top`, or more if the bars of the page are taller.
 * @param {Element} node
 */
function clearOfBars(node) {
  const style = /** @type {HTMLElement} */ (node).style;
  if (!style) {
    return;
  }
  style.scrollMarginTop = '';
  const own = parseFloat(getComputedStyle(node).scrollMarginTop) || 0, want = pageBar() + BAR_GAP;
  if (want > own) {
    style.scrollMarginTop = `${want}px`;
  }
}

/** After a resize, the time H5P's own resize of the inner frame takes (1 ms), and some. */
const RESIZE_AGAIN_MS = 120;

/**
 * Tells H5P the game changed screen (from the first screen to the game, from the game to its end), and again a moment
 * later. The Moodle app measures the game 0 ms after a resize and H5P shrinks the inner frame 1 ms after it, so a game
 * that got shorter was measured at its old height, and the app's frame shrank only at the next resize: the first tap
 * after «Start» moved the whole game (seen with the Balance Scale on a phone, 15 November 2026). Moodle in a browser
 * waits 150 ms and is not affected. Only on a change of screen: a second resize after every move came with clicks lost
 * now and then in Firefox.
 * @param {any} instance The game, an H5P.EventDispatcher.
 */
export function resizeFrames(instance) {
  instance.trigger('resize');
  clearTimeout(instance.resizeAgain);
  instance.resizeAgain = setTimeout(() => instance.trigger('resize'), RESIZE_AGAIN_MS);
}

/**
 * Brings the next step of a game into view when it is out of it, at the top of the window; `scroll-margin-top` in the
 * styles of each element keeps room above it. The frames around H5P content grow a moment after the content does, and
 * only then is its place known, so it looks more than once. It jumps instead of gliding, so it also suits those who ask
 * for less motion.
 *
 * On a slow machine (a board, a site under load) Moodle's frames were seen to grow after the first 600 ms, and leave the
 * next step below the window. Two later looks, at one and two seconds, rescue it, but only when nothing of it shows:
 * a jump while a player is about to press something in view would put the press somewhere else (seen in a test that
 * tapped tiles at once).
 *
 * On a touch screen, a field goes to the top even if it shows now: the keyboard is about to cover the lower half, and
 * the page is not always told (the Moodle app does not resize its page for the keyboard). A press on the page stops the
 * looks still to come.
 * @param {Element} node
 * @param {{keyboard?: boolean, through?: Element|null}} [options] `keyboard`: a text field that has just taken the focus.
 *   `through`: the last thing the next step needs on screen, so what is in view is not only its beginning.
 */
export function bringIntoView(node, { keyboard = false, through = null } = {}) {
  const touch = keyboard && matchMedia('(pointer: coarse)').matches;
  // Once the player presses something, the page stays where it is: a late jump between pressing and letting go would
  // move the button away from under the finger, and the press would be lost (seen on a slow machine).
  let pressed = false;
  const press = () => {
    pressed = true;
  };
  document.addEventListener('pointerdown', press, { capture: true, once: true });
  const looks = [50, 250, 600, 1200, 2000];
  looks.forEach((ms, i) => setTimeout(() => {
    const due = ms > 600 ? outOfSight(node) : touch || !inView(node) || (through && !inView(through));
    if (!pressed && due) {
      clearOfBars(node);
      node.scrollIntoView({ block: 'start' });
    }
    if (i === looks.length - 1) {
      document.removeEventListener('pointerdown', press, { capture: true });
    }
  }, ms));
}

/**
 * Paints the frames between the game and the page, so their edges do not show around a game in dark mode: their
 * documents have no colours of their own (the Moodle app leaves the default margin of a white page). The outermost page
 * is not touched.
 * @param {string} colour A CSS colour, or empty to give them back their own.
 */
export function paintOuterFrames(colour) {
  readableWindows().slice(1, -1).forEach((win) => {
    win.document.documentElement.style.backgroundColor = colour;
    if (win.document.body) {
      win.document.body.style.backgroundColor = colour;
    }
  });
}

/** The colour scheme of the device, for a game whose page cannot be read. */
const deviceDark = matchMedia('(prefers-color-scheme: dark)');

/**
 * @param {Window[]} windows
 * @returns {boolean} Whether the page is in dark mode: `data-bs-theme` in Moodle and other Bootstrap sites, the class
 *   `dark` in the Moodle app. The outermost window decides, because it is the one the player can change. When none says
 *   and the page around cannot be read (a frame of another site, as in the Moodle app's online player), the device's
 *   colour scheme; a page that can be read and says nothing is light, as Moodle 4.5.
 */
function pageIsDark(windows) {
  for (const win of [...windows].reverse()) {
    const html = win.document.documentElement;
    const mode = html.getAttribute('data-bs-theme');
    if (mode || html.classList.contains('dark')) {
      return mode ? mode === 'dark' : true;
    }
  }
  return windows[windows.length - 1] !== window.top && deviceDark.matches;
}

/**
 * The frames of H5P do not inherit the colour mode of the page around them: this reads it from there, now and whenever
 * it changes.
 * @param {(dark: boolean) => void} onChange
 */
export function watchPageColourMode(onChange) {
  const windows = readableWindows();
  const update = () => onChange(pageIsDark(windows));
  update();
  if (windows[windows.length - 1] !== window.top) {
    deviceDark.addEventListener('change', update);
  }
  windows.forEach((win) => {
    new MutationObserver(update).observe(win.document.documentElement, {
      attributes: true, attributeFilter: ['data-bs-theme', 'class'],
    });
  });
}
