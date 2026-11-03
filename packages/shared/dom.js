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
  const box = node.getBoundingClientRect();
  const windows = readableWindows();
  let top = box.top;
  windows.slice(0, -1).forEach((win) => {
    const frame = win.frameElement;
    top += frame ? frame.getBoundingClientRect().top : 0;
  });
  return top >= VIEW_MARGIN && top + box.height <= windows[windows.length - 1].innerHeight - VIEW_MARGIN;
}

/**
 * Brings the next step of a game into view when it is out of it, at the top of the window; `scroll-margin-top` in the
 * styles of each element keeps room above it. The frames around H5P content grow a moment after the content does, and
 * only then is its place known, so it looks more than once. It jumps instead of gliding, so it also suits those who ask
 * for less motion.
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
  const looks = [50, 250, 600];
  looks.forEach((ms, i) => setTimeout(() => {
    if (!pressed && (touch || !inView(node) || (through && !inView(through)))) {
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

/**
 * @param {Window[]} windows
 * @returns {boolean} Whether the page is in dark mode: `data-bs-theme` in Moodle and other Bootstrap sites, the class
 *   `dark` in the Moodle app. The outermost window decides, because it is the one the player can change.
 */
function pageIsDark(windows) {
  for (const win of [...windows].reverse()) {
    const html = win.document.documentElement;
    const mode = html.getAttribute('data-bs-theme');
    if (mode || html.classList.contains('dark')) {
      return mode ? mode === 'dark' : true;
    }
  }
  return false;
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
  windows.forEach((win) => {
    new MutationObserver(update).observe(win.document.documentElement, {
      attributes: true, attributeFilter: ['data-bs-theme', 'class'],
    });
  });
}
