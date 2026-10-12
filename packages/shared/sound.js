// Sounds made in the browser with Web Audio, without audio files: the same bells and clicks as the classroom board of
// Oksigenia Classtools. Players can mute them (remembered in this browser) and authors can leave them out.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

const STORAGE_KEY = 'h5p-oksigenia-muted';

/** A soft bell: the fundamental and three partials that die out sooner. */
function bell(a, out, f, when, vol, dur) {
  const t = a.currentTime + when;
  [[1, 1, dur], [2, 0.32, dur * 0.6], [3.01, 0.12, dur * 0.35], [4.2, 0.05, dur * 0.2]].forEach(([m, v, d]) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = f * m;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + d + 0.05);
  });
}

function click(a, out, f, when = 0, vol = 0.12) {
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'triangle';
  o.frequency.value = f;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.06);
}

/** @type {Object<string, (a: AudioContext, out: AudioNode) => void>} */
const SOUNDS = {
  ok: (a, out) => {
    bell(a, out, 880, 0, 0.35, 1.2);
    bell(a, out, 1318.51, 0.12, 0.35, 1.6);
  },
  bad: (a, out) => {
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.45);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.55);
  },
  pass: (a, out) => {
    click(a, out, 900, 0, 0.1);
    click(a, out, 1200, 0.08, 0.1);
  },
  tick: (a, out) => click(a, out, 1500),
  timeUp: (a, out) => {
    bell(a, out, 523.25, 0, 0.4, 1.4);
    bell(a, out, 392, 0.28, 0.4, 1.6);
    bell(a, out, 261.63, 0.56, 0.45, 2.4);
  },
  cheer: (a, out) => [0, 1.5].forEach((r) => [[783.99, 0], [1046.5, 0.22], [1318.51, 0.44]]
    .forEach(([f, d]) => bell(a, out, f, r + d, 0.45, 2.2))),
  done: (a, out) => bell(a, out, 659.25, 0, 0.3, 1.4),
};

export class Sounds {
  /** @param {{enabled?: boolean}} [options] `enabled` false: the author left the sounds out. */
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.muted = false;
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      // No storage (private mode, blocked): the sound starts on.
    }
    /** @type {AudioContext|null} */
    this.context = null;
    /** @type {AudioNode|null} */
    this.output = null;
  }

  get on() {
    return this.enabled && !this.muted;
  }

  /** @param {boolean} muted */
  setMuted(muted) {
    this.muted = muted;
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch (e) {
      // Not remembered, but it still applies to this game.
    }
  }

  /** Browsers only let a page sound after a gesture: call this from a click or a key. */
  wake() {
    if (!this.on) {
      return null;
    }
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) {
      return null;
    }
    if (!this.context) {
      this.context = new AC();
      const master = this.context.createGain();
      master.gain.value = 0.5;
      const compressor = this.context.createDynamicsCompressor();
      master.connect(compressor);
      compressor.connect(this.context.destination);
      this.output = master;
    }
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    return this.context;
  }

  /** @param {'ok'|'bad'|'pass'|'tick'|'timeUp'|'cheer'|'done'} name */
  play(name) {
    const a = this.wake();
    if (!a || !SOUNDS[name]) {
      return;
    }
    try {
      SOUNDS[name](a, this.output);
    } catch (e) {
      // A device without audio output: the game goes on in silence.
    }
  }
}
