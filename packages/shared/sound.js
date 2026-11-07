// Sounds made in the browser with Web Audio, without audio files: the same bells and clicks as the classroom board of
// Oksigenia Classtools. Players can mute them (remembered in this browser) and authors can leave them out.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

const STORAGE_KEY = 'h5p-oksigenia-muted';
const VOLUME_KEY = 'h5p-oksigenia-volume';
/** Low from the start: a classroom can have thirty of these sounding at once. */
const DEFAULT_VOLUME = 0.25;

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

/** @type {Object<string, (a: AudioContext, out: AudioNode, value?: number) => void>} */
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
  // H5P.BalanceScale. A weight sounds lower the more it weighs.
  drop: (a, out, weight = 1) => {
    const f = 700 / (1 + 0.33 * Math.log2(Math.max(1, weight)));
    glide(a, out, f, f * 0.78, 0.16, 0.3, 'triangle');
    click(a, out, 3200, 0, 0.05);
  },
  take: (a, out) => glide(a, out, 520, 760, 0.09, 0.12, 'sine'),
  // The stops of the held balance going down.
  clack: (a, out) => {
    click(a, out, 1700, 0, 0.2);
    click(a, out, 240, 0.01, 0.08);
  },
  // The heavy pan knocking against the end of its travel.
  thud: (a, out) => glide(a, out, 120, 62, 0.22, 0.4, 'sine'),
  // Balanced: a chord, a semitone higher for every right answer in a row.
  balanced: (a, out, streak = 0) => {
    const base = 523.25 * 2 ** (Math.min(7, streak) / 12);
    [0, 4, 7].forEach((n, k) => bell(a, out, base * 2 ** (n / 12), k * 0.07, 0.22, 0.9));
  },
  miss: (a, out) => {
    glide(a, out, 330, 330, 0.18, 0.2, 'triangle');
    glide(a, out, 262, 262, 0.26, 0.2, 'triangle', 0.14);
  },
  levelUp: (a, out) => [0, 4, 7, 12].forEach((n, k) => bell(a, out, 587.33 * 2 ** (n / 12), k * 0.08, 0.2, 0.8)),
  // The needle passing the middle: the «almost».
  centre: (a, out) => click(a, out, 1320, 0, 0.05),
};

/** A tone that slides from one pitch to another and dies out. */
function glide(a, out, from, to, dur, vol, type, when = 0) {
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) {
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export class Sounds {
  /** @param {{enabled?: boolean}} [options] `enabled` false: the author left the sounds out. */
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.muted = false;
    /** @type {number} From 0 to 1; the same for every game of this device, because it is set once. */
    this.volume = DEFAULT_VOLUME;
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === '1';
      const saved = Number.parseFloat(window.localStorage.getItem(VOLUME_KEY));
      if (saved >= 0 && saved <= 1) {
        this.volume = saved;
      }
    } catch (e) {
      // No storage (private mode, blocked): the sound starts on, and low.
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

  /** @param {number} volume From 0 to 1. */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) {
      this.master.gain.value = this.volume;
    }
    try {
      window.localStorage.setItem(VOLUME_KEY, String(this.volume));
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
      master.gain.value = this.volume;
      this.master = master;
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

  /**
   * @param {'ok'|'bad'|'pass'|'tick'|'timeUp'|'cheer'|'done'|'drop'|'take'|'clack'|'thud'|'balanced'|'miss'|'levelUp'|'centre'} name
   * @param {number} [value] What some sounds depend on: the weight that drops, the right answers in a row.
   */
  play(name, value) {
    const a = this.wake();
    if (!a || !SOUNDS[name]) {
      return;
    }
    try {
      SOUNDS[name](a, this.output, value);
    } catch (e) {
      // A device without audio output: the game goes on in silence.
    }
  }
}

/**
 * The volume control that goes next to the speaker button. Moving it brings the sound back if it was muted.
 * @param {Sounds} sounds
 * @param {string} label The name screen readers give it.
 * @param {string} className
 * @param {() => void} onChange Called when it changes, to repaint the speaker.
 * @returns {HTMLInputElement}
 */
export function volumeSlider(sounds, label, className, onChange) {
  const input = document.createElement('input');
  input.type = 'range';
  input.className = className;
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.value = String(sounds.volume);
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => {
    sounds.setVolume(Number(input.value));
    if (sounds.muted) {
      sounds.setMuted(false);
    }
    onChange();
  });
  // One sound to hear how loud it is, when the player lets go.
  input.addEventListener('change', () => sounds.play('tick'));
  return input;
}
