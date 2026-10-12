// A countdown that can be paused (WCAG 2.2.1), measured with the monotonic clock so a slow tab does not gain time.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

export class Countdown {
  /**
   * @param {{seconds: number, onTick?: (left: number) => void, onEnd?: () => void, now?: () => number}} options
   *   The time left at the start; what to call when the whole second changes and when the time is up; the clock in
   *   milliseconds (for tests).
   */
  constructor({ seconds, onTick = () => {}, onEnd = () => {}, now = () => performance.now() }) {
    this.left = Math.max(0, seconds);
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.now = now;
    this.running = false;
    /** @type {any} */
    this.handle = 0;
    this.last = 0;
  }

  start() {
    if (this.running || this.left <= 0) {
      return;
    }
    this.running = true;
    this.last = this.now();
    this.handle = setInterval(() => this.update(), 250);
  }

  pause() {
    if (!this.running) {
      return;
    }
    this.update();
    this.running = false;
    clearInterval(this.handle);
  }

  /** Brings the time left up to date; called by the interval and before reading it. */
  update() {
    if (!this.running) {
      return;
    }
    const now = this.now();
    const before = Math.ceil(this.left);
    this.left = Math.max(0, this.left - (now - this.last) / 1000);
    this.last = now;
    if (Math.ceil(this.left) !== before) {
      this.onTick(Math.ceil(this.left));
    }
    if (this.left <= 0) {
      this.running = false;
      clearInterval(this.handle);
      this.onEnd();
    }
  }

  /** @returns {number} Whole seconds left, rounded up. */
  get seconds() {
    this.update();
    return Math.ceil(this.left);
  }
}

/**
 * @param {number} seconds
 * @returns {string} «m:ss»
 */
export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
