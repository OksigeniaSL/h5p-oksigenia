// The three views of the scale, by age, painted by Gaudí (Oksigenia's art director): a market stall up to 4th grade, a
// precision scale for 5th and 6th, and a pencil drawing on squared paper from secondary school on. Each view is a set of
// pictures (assets/views/<view>/) and their geometry (<view>.json). The game gives the angle, the stops and what is on
// each pan; the view draws it on a canvas, and puts a transparent box on top of every thing on the pans, to touch it,
// to focus it and to fly its number. The numbers are text, crisp at any size.
//
// Two kinds: painted (market, precision: a painting behind, and the border of «yours» in the theme colour, from the
// alpha of the piece) and drawn on squared paper (notebook: the grid by code, every piece tinted pencil, «yours» tinted
// in the theme colour, and paper under each thing so the grid does not run through it).
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import market from '../assets/views/puesto/puesto.json';
import laboratory from '../assets/views/precision/precision.json';
import notebook from '../assets/views/cuaderno/cuaderno.json';
import { sizeOf } from './game.js';

/**
 * The views, by the name the content saves, with the folder of their pictures and their geometry.
 * @type {Object<string, [string, any]>}
 */
export const VIEWS = { market: ['puesto', market], laboratory: ['precision', laboratory], notebook: ['cuaderno', notebook] };

const D2R = Math.PI / 180;

/** @typedef {import('./game.js').Thing} Thing */
/**
 * @typedef {{angle: number, stop: number, left: Thing[], right: Thing[], tried: number|null, aim: 'left'|'right'|null}} Scene
 *   `stop`: 0 with the stops up (held), 1 down. `aim`: the pan a dragged weight would land in.
 */

const load = (src) => new Promise((ok, ko) => {
  const image = new Image();
  image.onload = () => ok(image);
  image.onerror = ko;
  image.src = src;
});

/**
 * A piece in one colour, keeping its alpha: the halo behind the beam, the border of «yours», the pencil.
 * @param {HTMLImageElement|HTMLCanvasElement} image
 * @param {string} colour
 * @returns {HTMLCanvasElement}
 */
function silhouette(image, colour) {
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  const x = c.getContext('2d');
  x.drawImage(image, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = colour;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export class View {
  /**
   * @param {'market'|'laboratory'|'notebook'} name
   * @param {string} base Where the pictures of the library are (H5P.getLibraryPath + /assets/views).
   * @param {{root: HTMLElement, dark: () => boolean, reduced: () => boolean, label: (thing: Thing, side: string) => string}} host
   */
  constructor(name, base, host) {
    const [folder, geometry] = VIEWS[name] || VIEWS.market;
    this.name = name in VIEWS ? name : 'market';
    /** @type {any} The geometry of the view (<view>.json). */
    this.G = geometry;
    this.base = `${base}/${folder}/`;
    this.host = host;
    this.paper = !!geometry.cuadricula;
    this.ready = false;
    /** @type {Promise<void>|null} */
    this.loading = null;
    /** @type {Object<string, HTMLImageElement>} */
    this.img = {};
    /** @type {Object<string, HTMLCanvasElement>} */
    this.tint = {};
    /** @type {Object<string, HTMLCanvasElement>} */
    this.border = {};
    /** @type {Map<string, HTMLElement>} */
    this.boxes = new Map();
    /** @type {{id: string, t0: number}|null} */
    this.drop = null;
    this.canvas = null;
    this.ctx = null;
    this.layer = null;
    this.cam = { s: 1, vx: 0, vy: 0, W: 0, H: 0, dpr: 1 };
  }

  /** @returns {Promise<void>} The pictures, loaded once. */
  load() {
    if (!this.loading) {
      const names = [...Object.keys(this.G.piezas), ...Object.keys(this.G.cosas)];
      const files = {};
      names.forEach((n) => {
        const file = this.geo(n).archivo;
        files[file] = files[file] || load(this.base + file);
      });
      this.loading = Promise.all(names.map(async (n) => {
        this.img[n] = await files[this.geo(n).archivo];
      })).then(() => {
        this.theme();
        this.ready = true;
      });
    }
    return this.loading;
  }

  /** @param {string} n @returns {Object} The geometry of a piece or a thing. */
  geo(n) {
    return this.G.piezas[n] || this.G.cosas[n];
  }

  /** @param {Thing} t @returns {string} The picture of a thing: its kind, whose it is and, for a weight, its size. */
  key(t) {
    const kind = t.kind === 'w' ? 'pesa' : t.kind === 'bag' ? 'bolsa' : 'misteriosa';
    return `${kind}-${t.fixed ? 'puesta' : 'tuya'}${t.kind === 'w' ? `-${sizeOf(t.v) + 1}` : ''}`;
  }

  /** The colours that depend on the theme and on dark mode: call it again when they change. */
  theme() {
    const main = getComputedStyle(this.host.root).getPropertyValue('--bs-main').trim() || '#006fbf';
    if (this.paper) {
      this.C = this.G.colores[this.host.dark() ? 'oscuro' : 'claro'];
      this.host.root.style.setProperty('--bs-pencil', this.C.lapiz);
      Object.keys(this.img).forEach((n) => {
        this.tint[n] = silhouette(this.img[n], this.geo(n).trazo === 'tema' ? main : this.C.lapiz);
      });
    } else {
      this.halo = silhouette(this.img.brazo, 'rgba(255,246,226,1)');
      Object.keys(this.G.cosas).filter((n) => /-tuya(-\d)?$/.test(n)).forEach((n) => {
        this.border[n] = silhouette(this.img[n], main);
      });
    }
  }

  /** @param {string} n @returns {HTMLImageElement|HTMLCanvasElement} */
  art(n) {
    return this.paper ? this.tint[n] : this.img[n];
  }

  /**
   * Puts the canvas and the boxes of the things in the scene box.
   * @param {HTMLElement} box
   * @param {Scene} scene
   * @param {string|null} fresh The thing that has just been put, which drops onto its pan.
   */
  build(box, scene, fresh) {
    box.classList.add('bs-painted');
    box.dataset.view = this.name;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.layer = document.createElement('div');
    this.layer.className = 'bs-layer';
    box.replaceChildren(this.canvas, this.layer);
    this.ctx = this.canvas.getContext('2d');
    this.boxes.clear();
    for (const side of ['left', 'right']) {
      for (const t of scene[side]) {
        const d = document.createElement('div');
        d.className = `bs-thing${t.fixed ? '' : ' bs-mine'}`;
        d.dataset.id = t.id;
        const n = document.createElement('span');
        n.className = `bs-num bs-num-${this.G.cosas[this.key(t)].tinta}`;
        n.textContent = t.kind === 'mystery' ? (scene.tried !== null && scene.tried !== undefined ? String(scene.tried) : '?') : String(t.v);
        d.append(n);
        if (t.fixed) {
          d.setAttribute('aria-hidden', 'true');
        } else {
          d.setAttribute('role', 'button');
          d.tabIndex = 0;
          d.setAttribute('aria-label', this.host.label(t, side));
        }
        this.layer.append(d);
        this.boxes.set(t.id, d);
      }
    }
    this.drop = fresh ? { id: fresh, t0: performance.now() } : null;
    this.paint(scene);
  }

  /** Fits the core of the view in the box, and shows as much of the rest as the box allows. */
  frame() {
    const r = this.canvas.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, r.width), H = Math.max(1, r.height), N = this.G.nucleo, E = this.G.escena;
    const s = Math.min(W / N.w, H / N.h), vw = W / s, vh = H / s, cx = N.x + N.w / 2, cy = N.y + N.h / 2;
    const clamp = (c, v, len) => (v >= len ? (len - v) / 2 : Math.min(Math.max(c - v / 2, 0), len - v));
    this.cam = { s, W, H, dpr, vx: clamp(cx, vw, E.w), vy: clamp(cy, vh, E.h) };
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
  }

  /** @param {number} x @param {number} y @returns {number[]} A point of the scene, in px of the box. */
  toScreen(x, y) {
    return [(x - this.cam.vx) * this.cam.s, (y - this.cam.vy) * this.cam.s];
  }

  /** Squared paper over the whole box, lines one device pixel wide, snapped so they stay crisp. */
  paperGrid() {
    const { ctx, cam, canvas } = this, Q = this.G.cuadricula, p = Q.paso, k = cam.s * cam.dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.C.papel;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = this.C.linea;
    const x0 = Q.origen.x + Math.floor((cam.vx - Q.origen.x) / p) * p, y0 = Q.origen.y + Math.floor((cam.vy - Q.origen.y) / p) * p;
    const lw = Math.max(1, Math.round(Q.grosor_px * cam.dpr));
    for (let x = x0; (x - cam.vx) * k < canvas.width; x += p) {
      ctx.fillRect(Math.round((x - cam.vx) * k), 0, lw, canvas.height);
    }
    for (let y = y0; (y - cam.vy) * k < canvas.height; y += p) {
      ctx.fillRect(0, Math.round((y - cam.vy) * k), canvas.width, lw);
    }
    ctx.restore();
  }

  /**
   * Where the box is wider or taller than the painting: the painting mirrored around its edges, fading into a colour.
   * @returns {boolean} Whether there was any of that.
   */
  fill() {
    const { ctx, cam } = this, E = this.G.escena, vw = cam.W / cam.s, vh = cam.H / cam.s;
    if (cam.vx >= 0 && cam.vy >= 0 && cam.vx + vw <= E.w && cam.vy + vh <= E.h) {
      return false;
    }
    ctx.fillStyle = this.G.relleno.color;
    ctx.fillRect(cam.vx, cam.vy, vw, vh);
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        if (dx || dy) {
          ctx.save();
          ctx.translate(dx > 0 ? 2 * E.w : 0, dy > 0 ? 2 * E.h : 0);
          ctx.scale(dx ? -1 : 1, dy ? -1 : 1);
          ctx.drawImage(this.img.fondo, 0, 0, E.w, E.h);
          ctx.restore();
        }
      }
    }
    return true;
  }

  fade() {
    const { ctx, cam } = this, E = this.G.escena, vw = cam.W / cam.s, vh = cam.H / cam.s, pave = this.G.relleno.color, F = 60;
    const band = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgba(pave, 0));
      g.addColorStop(Math.min(1, F / Math.hypot(x1 - x0, y1 - y0)), rgba(pave, 0.4));
      g.addColorStop(1, rgba(pave, 0.97));
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    };
    const L = Math.max(-cam.vx, 0), R = Math.max(cam.vx + vw - E.w, 0), T = Math.max(-cam.vy, 0), B = Math.max(cam.vy + vh - E.h, 0);
    if (L) {
      band(F, 0, -L, 0, -L, cam.vy, L + F, vh);
    }
    if (R) {
      band(E.w - F, 0, E.w + R, 0, E.w - F, cam.vy, R + F, vh);
    }
    if (T) {
      band(0, F, 0, -T, cam.vx, -T, vw, T + F);
    }
    if (B) {
      band(0, E.h - F, 0, E.h + B, cam.vx, E.h - F, vw, B + F);
    }
  }

  shadow(x, y, rx, ry, a) {
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(40,22,8,${a})`);
    g.addColorStop(1, 'rgba(40,22,8,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rx, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  piece(n, x, y) {
    const p = this.G.piezas[n];
    this.ctx.drawImage(this.art(n), x - p.ancla.x, y - p.ancla.y, p.w, p.h);
  }

  /**
   * Things in rows as wide as the pan allows, each row on the tallest of the one below; with many, a little smaller so
   * there are two rows at most and they stay in view.
   */
  rowsOf(things, k) {
    const A = this.G.apilar, rows = [];
    let row = [], width = 0;
    for (const f of things) {
      const w = f.c.w * k;
      if (row.length && width + A.hueco * k + w > A.ancho_fila) {
        rows.push(row);
        row = [];
        width = 0;
      }
      width += (row.length ? A.hueco * k : 0) + w;
      row.push(f);
    }
    if (row.length) {
      rows.push(row);
    }
    return rows;
  }

  arrange(list, hx, floorY) {
    const A = this.G.apilar, things = list.map((t) => ({ t, c: this.G.cosas[this.key(t)] }));
    let k = 1, rows = this.rowsOf(things, k);
    while (rows.length > 2 && k > 0.5) {
      k -= 0.05;
      rows = this.rowsOf(things, k);
    }
    const out = [];
    let floor = floorY;
    for (const row of rows) {
      const width = row.reduce((t, f) => t + f.c.w * k, 0) + A.hueco * k * (row.length - 1);
      let x = hx - width / 2, tall = 0;
      for (const f of row) {
        out.push({ ...f, k, x0: x, y0: floor - f.c.apoyo.y * k });
        x += f.c.w * k + A.hueco * k;
        tall = Math.max(tall, f.c.apila * k);
      }
      floor -= tall;
    }
    return out;
  }

  /** On squared paper, a thing first gets the paper colour under its outline, so the grid does not run through it. */
  underlay(c, x0, y0, k, mine) {
    if (!this.paper || !c.contorno) {
      return;
    }
    const { ctx } = this;
    ctx.beginPath();
    c.contorno.forEach(([px, py], j) => (j ? ctx.lineTo(x0 + px * k, y0 + py * k) : ctx.moveTo(x0 + px * k, y0 + py * k)));
    ctx.closePath();
    ctx.fillStyle = mine ? this.C.tuya : this.C.puesta;
    ctx.fill();
  }

  /** @param {Scene} scene */
  paint(scene) {
    if (!this.canvas || !this.ready) {
      return;
    }
    this.frame();
    const { ctx, cam, G } = this, s = cam.s, P = G.pivote, L = G.brazo.largo, now = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.paper) {
      this.paperGrid();
    }
    ctx.setTransform(cam.dpr * s, 0, 0, cam.dpr * s, -cam.vx * cam.dpr * s, -cam.vy * cam.dpr * s);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const veil = !this.paper && this.host.dark();
    if (!this.paper) {
      const mirrored = this.fill();
      ctx.drawImage(this.img.fondo, 0, 0, G.escena.w, G.escena.h);
      if (mirrored) {
        this.fade();
      }
      if (veil) {
        ctx.fillStyle = 'rgba(12,16,26,0.30)';
        ctx.fillRect(cam.vx, cam.vy, cam.W / s, cam.H / s);
      }
    }
    // The stops: up while the scale is held, down when it is free.
    const T = G.topes, top = T.arriba_y + (T.abajo_y - T.arriba_y) * scene.stop;
    for (const x of T.x) {
      if (!this.paper) {
        this.shadow(x, T.base_y, 34, 9, 0.35);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 60, top - 10, 120, T.base_y - top + 10 + T.hundido);
      ctx.clip();
      this.piece('tope', x, top);
      ctx.restore();
    }
    if (!this.paper) {
      const SB = G.sombra_base || { x: P.x, y: G.base_apoyo_y, rx: 92, ry: 16, a: 0.42 };
      this.shadow(SB.x, SB.y, SB.rx, SB.ry, SB.a);
    }
    this.piece('base', P.x, P.y);
    // A positive angle lowers the right pan.
    const a = scene.angle * D2R, ca = Math.cos(a), sa = Math.sin(a);
    const hooks = { left: [P.x - L * ca, P.y - L * sa], right: [P.x + L * ca, P.y + L * sa] };
    for (const side of ['left', 'right']) {
      const [hx, hy] = hooks[side], name = `platillo-${side === 'left' ? 'izq' : 'der'}`;
      if (scene.aim === side) {
        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = getComputedStyle(this.host.root).getPropertyValue('--bs-main').trim() || '#006fbf';
        ctx.beginPath();
        ctx.ellipse(hx, hy + G.cuelgue - 30, 110, 70, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
      this.piece(name, hx, hy);
      for (const q of this.arrange(scene[side], hx, hy + G.cuelgue)) {
        const { c } = q, w = c.w * q.k, h = c.h * q.k, n = this.key(q.t);
        let dy = 0;
        if (this.drop && this.drop.id === q.t.id && !this.host.reduced()) {
          const p = Math.min(1, (now - this.drop.t0) / 320);
          dy = -46 * (1 - p) * (1 - p);
        }
        const x0 = q.x0, y0 = q.y0 + dy;
        this.underlay(c, x0, y0, q.k, !q.t.fixed);
        if (!this.paper && this.border[n]) {
          const r = 2.6 / s;
          for (let j = 0; j < 12; j++) {
            const t = (j * Math.PI) / 6;
            ctx.drawImage(this.border[n], x0 + r * Math.cos(t), y0 + r * Math.sin(t), w, h);
          }
        }
        ctx.drawImage(this.art(n), x0, y0, w, h);
        const box = this.boxes.get(q.t.id);
        if (box) {
          const [sx, sy] = this.toScreen(x0, y0), nb = c.numero;
          box.style.left = `${sx}px`;
          box.style.top = `${sy}px`;
          box.style.width = `${w * s}px`;
          box.style.height = `${h * s}px`;
          const num = /** @type {HTMLElement} */ (box.firstChild);
          num.style.left = `${(nb.x + nb.w / 2) * q.k * s}px`;
          num.style.top = `${(nb.y + nb.h / 2) * q.k * s}px`;
          num.style.fontSize = `${Math.max(12, Math.min(26, nb.h * q.k * s * 0.95)).toFixed(1)}px`;
        }
      }
      const pan = G.piezas[name];
      if (pan.labio) {
        const lip = pan.labio;
        ctx.drawImage(this.art(name), lip.x, lip.y, lip.w, lip.h, hx - pan.ancla.x + lip.x, hy - pan.ancla.y + lip.y, lip.w, lip.h);
      }
    }
    // The beam; in the painted views with a soft light halo, so it reads from the back of the room.
    const B = G.piezas.brazo;
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(a);
    if (!this.paper) {
      ctx.globalAlpha = veil ? 0.55 : 0.75;
      ctx.filter = `blur(${(3 / s).toFixed(2)}px)`;
      ctx.drawImage(this.halo, -B.ancla.x - 3, -B.ancla.y - 3, B.w + 6, B.h + 6);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.art('brazo'), -B.ancla.x, -B.ancla.y, B.w, B.h);
    ctx.restore();
  }

  /** @param {number} now @returns {boolean} Whether a thing is still dropping onto its pan. */
  dropping(now) {
    return !!this.drop && now - this.drop.t0 < 340;
  }

  /** A ring from the pivot when the scale balances. */
  ring() {
    if (!this.layer || this.host.reduced()) {
      return;
    }
    const [x, y] = this.toScreen(this.G.pivote.x, this.G.pivote.y);
    const d = document.createElement('span');
    d.className = 'bs-halo';
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    this.layer.append(d);
    setTimeout(() => d.remove(), 950);
  }

  /**
   * A tray button that shows the same thing that lands on the pan, with its number on it.
   * @param {HTMLElement} button
   * @param {number} value
   * @param {'w'|'bag'} kind
   * @param {number} [k] How big, against the size of the thing on the scale.
   */
  face(button, value, kind, k = 0.8) {
    const key = kind === 'w' ? `pesa-tuya-${sizeOf(value) + 1}` : 'bolsa-tuya', c = this.G.cosas[key];
    const w = Math.round(c.w * k), h = Math.round(c.h * k), nb = c.numero, dpr = window.devicePixelRatio || 1;
    const picture = document.createElement('canvas');
    picture.width = Math.round(w * dpr);
    picture.height = Math.round(h * dpr);
    picture.style.width = `${w}px`;
    picture.style.height = `${h}px`;
    picture.setAttribute('aria-hidden', 'true');
    const x = picture.getContext('2d');
    x.scale(k * dpr, k * dpr);
    if (this.paper && c.contorno) {
      x.beginPath();
      c.contorno.forEach(([px, py], j) => (j ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.closePath();
      x.fillStyle = this.C.tuya;
      x.fill();
    }
    x.drawImage(this.art(key), 0, 0, c.w, c.h);
    const n = document.createElement('span');
    n.className = `bs-num bs-num-${c.tinta}`;
    n.setAttribute('aria-hidden', 'true');
    n.textContent = String(value);
    n.style.left = `${((nb.x + nb.w / 2) * k).toFixed(1)}px`;
    n.style.top = `${((nb.y + nb.h / 2) * k).toFixed(1)}px`;
    n.style.fontSize = `${Math.max(15, nb.h * k * 0.95).toFixed(1)}px`;
    button.classList.add('bs-face');
    button.style.width = `${w}px`;
    button.style.height = `${h}px`;
    button.replaceChildren(picture, n);
  }
}
