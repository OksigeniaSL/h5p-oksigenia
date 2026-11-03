// A stylesheet as an old browser keeps it: Firefox 98, the browser of some classroom boards with Android 8, has no
// container queries, container units, color-mix(), oklch(), dynamic viewport units or :has(). This drops what it
// would drop and applies the @supports blocks it would apply, so the games can be checked in a current browser as
// that one would draw them. A simulation: the real browser is still the reference.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

const UNKNOWN_VALUE = /[0-9.]cq(?:w|h|i|b|min|max)\b|color-mix\(|oklch\(|[0-9.][dsl]v(?:h|w|i|b|min|max)\b/;
const UNKNOWN_PROPERTY = new Set(['container', 'container-type', 'container-name', 'text-wrap']);
// What Firefox 98 does not have, of the conditions of @supports used in the games.
const UNSUPPORTED = [/container-type/, /color-mix\(/, /oklch\(/, /:has\(/];

/**
 * Splits CSS into a tree of blocks and plain text, by braces only (the games use no braces in strings).
 * @param {string} css
 * @param {number} [start]
 * @returns {[Array<{head?: string, body?: Array<any>, text?: string}>, number]} The items, and where they end.
 */
function parse(css, start = 0) {
  const items = [];
  let text = '';
  let i = start;
  for (; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      const [body, end] = parse(css, i + 1);
      items.push({ head: text.trim(), body });
      text = '';
      i = end;
    } else if (c === '}') {
      break;
    } else {
      text += c;
      // A statement such as @import or @charset ends at its semicolon.
      if (c === ';' && text.trim().startsWith('@')) {
        items.push({ text: text.trim() });
        text = '';
      }
    }
  }
  if (text.trim()) {
    items.push({ text });
  }
  return [items, i];
}

function declarations(text) {
  return text.split(';').map((d) => d.trim()).filter((d) => {
    if (!d) {
      return false;
    }
    const property = d.split(':', 1)[0].trim();
    return !UNKNOWN_PROPERTY.has(property) && !UNKNOWN_VALUE.test(d);
  }).join(';');
}

/** True when Firefox 98 would apply a block with this @supports condition. */
function supports(condition) {
  const negated = /^not\s*\(/.test(condition.trim());
  const known = !UNSUPPORTED.some((feature) => feature.test(condition));
  return negated ? !known : known;
}

function emit(items) {
  return items.map((item) => {
    if (item.text !== undefined) {
      return item.text.trim().startsWith('@') ? item.text : declarations(item.text);
    }
    const { head, body } = item;
    if (head.startsWith('@container')) {
      return '';
    }
    if (head.startsWith('@supports')) {
      return supports(head.slice('@supports'.length)) ? emit(body) : '';
    }
    if (head.startsWith('@')) {
      return `${head}{${emit(body)}}`;
    }
    // A selector list with a selector the browser does not know is dropped whole.
    if (head.includes(':has(')) {
      return '';
    }
    return `${head}{${emit(body)}}`;
  }).join('\n');
}

/**
 * @param {string} css A stylesheet.
 * @returns {string} The stylesheet as Firefox 98 keeps it.
 */
export function oldBrowserCss(css) {
  const [items] = parse(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  return emit(items);
}
