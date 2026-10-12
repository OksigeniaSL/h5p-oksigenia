// Small DOM helpers shared by the games.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
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
