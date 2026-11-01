// The pieces of H5P.NumberLine, for different ages: a round face on a spring, a rocket with a porthole and a plain die.
// Each is drawn by code on every frame and goes in its own way. Same signature for all:
//   draw(group, svg, x, foot, flying)
// group is the <g> to append to, svg the helper of line.js, foot the y it stands on (the jump already subtracted) and
// flying null, or { t, dir } with t from 0 to 1 and dir -1 or 1.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

function face(group, svg, x, cy, { apart, r, pupil, look, mouth, smile }) {
  [-apart, apart].forEach((dx) => {
    group.append(svg('circle', { class: 'nl-piece-eye', cx: x + dx, cy, r }));
    group.append(svg('circle', { class: 'nl-piece-pupil', cx: x + dx + look, cy, r: pupil }));
  });
  group.append(svg('path', { class: 'nl-piece-mouth', d: `M${x - smile} ${cy + mouth}q${smile} ${smile * 0.8} ${smile * 2} 0` }));
}

// The spring, for the youngest: a round face that stretches in the air.
function muelle(group, svg, x, foot, flying) {
  const coil = 7.4 * (flying ? 1 + 0.5 * Math.sin(Math.PI * flying.t) : 1);
  const cy = foot - coil - 9.6;
  group.append(svg('rect', { class: 'nl-piece-foot', x: x - 5.5, y: foot - 1.6, width: 11, height: 3, rx: 1.5 }));
  const step = (coil - 0.4) / 5;
  let d = `M${x} ${foot - 1}`;
  [-4, 4, -4, 4].forEach((dx, i) => {
    d += `L${x + dx} ${foot - 1 - step * (i + 1)}`; 
  });
  group.append(svg('path', { class: 'nl-piece-spring', d: `${d}L${x} ${foot - 1 - coil}` }));
  group.append(svg('path', { class: 'nl-piece-tick', d: `M${x} ${cy - 9.5}v-3` }));
  group.append(svg('circle', { class: 'nl-piece-body', cx: x, cy, r: 9.6 }));
  face(group, svg, x, cy - 2, { apart: 4.1, r: 3.1, pupil: 1.5, look: flying ? flying.dir : 0, mouth: 5.4, smile: 2.8 });
}

// The rocket, for the middle years: no mouth, one eye behind a porthole. It leans towards where it goes, lights up in
// the air and lands upright.
function cohete(group, svg, x, foot, flying) {
  const arc = flying ? Math.sin(Math.PI * flying.t) : 0;
  const dir = flying ? flying.dir : 0;
  const rocket = svg('g', { transform: `rotate(${dir * 38 * arc} ${x} ${foot - 14})` });
  if (flying) {
    const flame = 11 * Math.sqrt(arc) * (0.86 + 0.14 * Math.sin(flying.t * 44));
    rocket.append(svg('path', { class: 'nl-piece-flame', d: `M${x - 3.2} ${foot - 2.6}Q${x} ${foot + flame * 0.4} ${x} ${foot - 2.6 + flame}Q${x} ${foot + flame * 0.4} ${x + 3.2} ${foot - 2.6}Z` }));
  }
  rocket.append(svg('path', { class: 'nl-piece-fin', d: `M${x - 6} ${foot - 15}L${x - 12.5} ${foot - 0.8}L${x - 5} ${foot - 5}Z` }));
  rocket.append(svg('path', { class: 'nl-piece-fin', d: `M${x + 6} ${foot - 15}L${x + 12.5} ${foot - 0.8}L${x + 5} ${foot - 5}Z` }));
  rocket.append(svg('rect', { class: 'nl-piece-fin', x: x - 3.6, y: foot - 6.4, width: 7.2, height: 4, rx: 1 }));
  rocket.append(svg('path', { class: 'nl-piece-body', d: `M${x} ${foot - 31}C${x + 7} ${foot - 25} ${x + 8.6} ${foot - 16} ${x + 7.2} ${foot - 5.4}H${x - 7.2}C${x - 8.6} ${foot - 16} ${x - 7} ${foot - 25} ${x} ${foot - 31}Z` }));
  rocket.append(svg('circle', { class: 'nl-piece-window', cx: x, cy: foot - 18, r: 4.6 }));
  rocket.append(svg('circle', { class: 'nl-piece-pupil', cx: x + dir * 1.3, cy: foot - 18, r: 2 }));
  group.append(rocket);
}

// The die, sober, for the oldest and for adults: no face. It rolls once in the air, showing other faces on the way, and
// lands a little squashed.
const PIPS = {
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  2: [[-1, -1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function dado(group, svg, x, foot, flying) {
  const t = flying ? flying.t : 0;
  const dir = flying ? flying.dir : 0;
  const edge = flying ? Math.max(0, 1 - Math.min(t, 1 - t) / 0.14) : 0;     // 1 at take-off and landing, 0 in the air
  const h = 23 * (1 - 0.14 * edge);
  const w = 23 * (1 + 0.1 * edge);
  const cy = foot - 0.8 - h / 2;
  const eased = t * t * (3 - 2 * t);
  const die = svg('g', { transform: `rotate(${dir * 360 * eased} ${x} ${cy})` });
  die.append(svg('rect', { class: 'nl-piece-body', x: x - w / 2, y: cy - h / 2, width: w, height: h, rx: 5 }));
  const shown = !flying ? 5 : [5, 2, 6, 5][Math.min(3, Math.floor(eased * 4))];
  PIPS[shown].forEach(([a, b]) => {
    die.append(svg('circle', { class: 'nl-piece-pip', cx: x + a * (w / 2 - 5.6), cy: cy + b * (h / 2 - 5.6), r: 2.2 }));
  });
  group.append(die);
}

export const PIECES = { muelle, cohete, dado };
