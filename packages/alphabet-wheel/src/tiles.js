// Letter tiles: the letters of the answer, jumbled, for players who cannot type it yet. They tap the tiles in order and
// each one goes to the first empty place of the word. Spaces, hyphens and apostrophes are not tiles: they are already
// in their place, so the word keeps its shape.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

const LETTER = /^[\p{L}\p{N}]$/u;
const MARKS = /\p{M}/gu;

/** @param {string} c @returns {string} The letter without accents and in small letters, to match a key pressed. */
const bare = (c) => c.normalize('NFD').replace(MARKS, '').toLowerCase();

/**
 * @typedef {object} Slot
 * @property {string|null} fixed A character that is not a tile (a space, a hyphen), or null for a letter.
 * @property {number|null} tile The tile put in this place, or null while it is empty.
 */

export class TileBoard {
  /**
   * @param {string} answer The answer as the author wrote it: the tiles keep its capitals and accents.
   * @param {() => number} [random] Source of the jumble (tests give their own).
   */
  constructor(answer, random = Math.random) {
    const chars = [...String(answer ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ')];
    /** @type {Slot[]} */
    this.slots = chars.map((c) => ({ fixed: LETTER.test(c) ? null : c, tile: null }));
    const letters = chars.filter((c) => LETTER.test(c));
    /** @type {{letter: string, used: boolean}[]} */
    this.tiles = jumble(letters, random).map((letter) => ({ letter, used: false }));
  }

  /** @returns {Slot[]} The places of the letters, without the fixed characters. */
  get letterSlots() {
    return this.slots.filter((s) => s.fixed === null);
  }

  /** @returns {boolean} Whether every letter is in a place. */
  get full() {
    return this.letterSlots.every((s) => s.tile !== null);
  }

  /** @returns {boolean} Whether no letter has been put yet. */
  get empty() {
    return this.letterSlots.every((s) => s.tile === null);
  }

  /** @returns {number} The first empty place, where the next tile goes, or -1 when the word is full. */
  get next() {
    return this.slots.findIndex((s) => s.fixed === null && s.tile === null);
  }

  /** @returns {string} The word as it stands: the fixed characters and the letters put, empty places left out. */
  get text() {
    return this.slots.map((s) => (s.fixed !== null ? s.fixed : s.tile !== null ? this.tiles[s.tile].letter : '')).join('');
  }

  /** @returns {string[]} The letters put so far, in the order of the word, for a screen reader to spell them. */
  get spelled() {
    return this.letterSlots.filter((s) => s.tile !== null).map((s) => this.tiles[/** @type {number} */ (s.tile)].letter);
  }

  /**
   * @param {number} slot
   * @returns {string} What a place shows: its fixed character, its letter or nothing.
   */
  shown(slot) {
    const s = this.slots[slot];
    return s.fixed !== null ? s.fixed : s.tile !== null ? this.tiles[s.tile].letter : '';
  }

  /**
   * Puts a tile in the first empty place.
   * @param {number} tile
   * @returns {number} The place it went to, or -1 if the tile was used or the word is full.
   */
  place(tile) {
    const t = this.tiles[tile];
    const slot = this.next;
    if (!t || t.used || slot < 0) {
      return -1;
    }
    t.used = true;
    this.slots[slot].tile = tile;
    return slot;
  }

  /**
   * Gives the letter of a place back to its tile.
   * @param {number} slot
   * @returns {number} The tile that came back, or -1 if the place had none.
   */
  takeBack(slot) {
    const s = this.slots[slot];
    if (!s || s.tile === null) {
      return -1;
    }
    const tile = s.tile;
    this.tiles[tile].used = false;
    s.tile = null;
    return tile;
  }

  /** @returns {number} The tile of the last letter of the word that came back, as a backspace does, or -1. */
  eraseLast() {
    for (let i = this.slots.length - 1; i >= 0; i--) {
      if (this.slots[i].tile !== null) {
        return this.takeBack(i);
      }
    }
    return -1;
  }

  /**
   * @param {string} key A key pressed on a keyboard.
   * @returns {number} A free tile with that letter: the same one first, then without minding capitals, then without
   *   minding accents. -1 if there is none.
   */
  tileForKey(key) {
    if (!LETTER.test(key)) {
      return -1;
    }
    const free = this.tiles.map((t, i) => ({ t, i })).filter(({ t }) => !t.used);
    const tests = [(l) => l === key, (l) => l.toLowerCase() === key.toLowerCase(), (l) => bare(l) === bare(key)];
    for (const test of tests) {
      const found = free.find(({ t }) => test(t.letter));
      if (found) {
        return found.i;
      }
    }
    return -1;
  }

  /** Every tile back to the tray. */
  clear() {
    this.slots.forEach((s) => {
      s.tile = null;
    });
    this.tiles.forEach((t) => {
      t.used = false;
    });
  }
}

/**
 * @param {string[]} letters
 * @param {() => number} random
 * @returns {string[]} The letters in another order: never the order of the answer, unless no other order exists
 *   (one letter, or the same letter every time).
 */
export function jumble(letters, random) {
  const out = letters.slice();
  if (new Set(letters).size < 2) {
    return out;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.join('\u0000') !== letters.join('\u0000')) {
      return out;
    }
  }
  // A source of chance that keeps giving the same order (a test): the first letter goes to the end.
  return [...letters.slice(1), letters[0]];
}
