// The end of a game: a ring that fills up to the score, a message by how well it went and, when it went well,
// confetti. No animation when the system asks for reduced motion.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { el } from './dom.js';
import './cheer.css';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {number} score
 * @param {number} max
 * @returns {'perfect'|'great'|'good'|'keep'}
 */
export function cheerTier(score, max) {
  if (max > 0 && score >= max) {
    return 'perfect';
  }
  const ratio = max > 0 ? score / max : 0;
  if (ratio >= 0.8) {
    return 'great';
  }
  return ratio >= 0.5 ? 'good' : 'keep';
}

export const reducedMotion = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A ring that fills up to score / max, with the score in the middle and a star when it is full.
 * @param {number} score
 * @param {number} max
 * @returns {SVGSVGElement}
 */
export function scoreRing(score, max) {
  const r = 42;
  const length = 2 * Math.PI * r;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'h5p-oksigenia-ring');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const circle = (cls) => {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', String(r));
    c.setAttribute('class', cls);
    return c;
  };
  const track = circle('h5p-oksigenia-ring-track');
  const fill = circle('h5p-oksigenia-ring-fill');
  const done = max > 0 ? Math.min(1, score / max) : 0;
  fill.style.setProperty('--ring-length', String(length));
  fill.style.setProperty('--ring-left', String(length * (1 - done)));
  svg.append(track, fill);
  if (done >= 1) {
    const star = document.createElementNS(SVG, 'path');
    star.setAttribute('class', 'h5p-oksigenia-ring-star');
    star.setAttribute('d', 'M50 18l4.2 8.6 9.4 1.4-6.8 6.6 1.6 9.4L50 39.6 41.6 44l1.6-9.4-6.8-6.6 9.4-1.4z');
    svg.append(star);
  }
  const text = document.createElementNS(SVG, 'text');
  text.setAttribute('x', '50');
  text.setAttribute('y', done >= 1 ? '66' : '58');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'h5p-oksigenia-ring-text');
  text.textContent = `${score}/${max}`;
  svg.append(text);
  return svg;
}

/**
 * Throws confetti over a box for a few seconds. The pieces are decorative and hidden from screen readers.
 * @param {HTMLElement} box Positioned element to cover.
 * @param {number} pieces
 */
export function confetti(box, pieces) {
  if (reducedMotion() || pieces <= 0) {
    return;
  }
  const layer = el('div', { class: 'h5p-oksigenia-confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < pieces; i++) {
    const piece = el('span', { class: `h5p-oksigenia-confetti-piece h5p-oksigenia-confetti-${i % 5}` });
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
    piece.style.setProperty('--spin', `${Math.round(360 + Math.random() * 720)}deg`);
    piece.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 80)}px`);
    layer.append(piece);
  }
  box.append(layer);
  setTimeout(() => layer.remove(), 4000);
}
