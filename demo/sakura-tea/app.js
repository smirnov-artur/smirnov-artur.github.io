// Hanamizu — воксельная долина сакуры, построенная кодом. Прокрутка ведёт камеру: мост → пагода → вода.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import Lenis from 'lenis';

const qs = new URLSearchParams(location.search);
const TOUCH = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HQ = qs.get('q') ? qs.get('q') === 'hi' : !TOUCH;
const Q = HQ
  ? { cell: 1.5, far: 5, treeVox: 0.46, cedarVox: 0.85, sakura: 64, cedar: 130, round: 26, tufts: 950, rocks: 90, petals: 380, floaters: 260, flies: 150, koi: 9, refl: 0.5, shadow: 4096, msaa: 4, lights: true, dpr: 1.25, seg: [1.5, 3], reflEvery: 1 }
  : { cell: 2.5, far: 12, treeVox: 0.6, cedarVox: 1.0, sakura: 34, cedar: 70, round: 10, tufts: 200, rocks: 36, petals: 120, floaters: 90, flies: 50, koi: 5, refl: 0.3, shadow: 1024, msaa: 2, lights: false, dpr: 1.5, seg: [99, 99], reflEvery: 2 };
if (qs.get('dpr')) Q.dpr = +qs.get('dpr');

const $ = s => document.querySelector(s);
const loadBar = $('#load .bar i');
const tick = p => { loadBar.style.width = (p * 100).toFixed(0) + '%'; return new Promise(r => setTimeout(r, 0)); };

// ---------- числа и шум ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function h2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function h3(x, y, z) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440670441) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
const sm = t => t * t * (3 - 2 * t);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => sm(clamp((x - a) / (b - a), 0, 1));
function vn2(x, y) { const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi); const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function vn3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const x00 = l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), x10 = l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u);
  const x01 = l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), x11 = l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u);
  return l(l(x00, x10, v), l(x01, x11, v), w);
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vn2(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x, y, o = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { const v = 1 - Math.abs(2 * vn2(x * f + i * 5.7, y * f - i * 3.1) - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.1; } return s / n; }

// ---------- цвета (sRGB hex) ----------
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const hk = (c, k) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k);
const hm = (a, b, t) => (Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t)) << 16) | (Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)) << 8) | Math.round(lerp(a & 255, b & 255, t));
const J = (c, x, y, z, a = 0.08) => hk(c, 1 - a + h3(x, y, z) * a * 2);
const P = {
  grassA: 0x619350, grassB: 0x74a25a, grassC: 0x507c47, grassD: 0x88ad63, moss: 0x55784a,
  soil: 0x6a5444, soilD: 0x4f3f35, rock: 0x6b6c72, rockD: 0x55575f, rockL: 0x85868b,
  sand: 0x8b8474, pebble: 0x5c605d, bed: 0x3c4847, wet: 0x4a5249,
  path: 0x9a9183, pathL: 0xb3ab9c, snow: 0xe8eef6, snowB: 0xc6d2e2,
  forest: 0x3a5a3a, forestD: 0x2e4832, petalG: 0xe6b7c6,
  bark: 0x4d3e3b, barkD: 0x3a2f2e, barkL: 0x6d5a52,
  pink1: 0xf7cdd9, pink2: 0xf0b5c7, pink3: 0xe39cb4, pink4: 0xd4849f, pinkW: 0xfce6ec,
  cedar1: 0x2d4b35, cedar2: 0x3a5d40, cedar3: 0x24402d, leaf1: 0x4f7a44, leaf2: 0x62904f, leaf3: 0x3f6a3c,
  woodD: 0x3a2a22, wood: 0x5a4131, woodL: 0x8d6d4f, plank: 0x7d5c42,
  plaster: 0xe7dfcf, earth: 0xb49c7d, paper: 0xffb35e, paperL: 0xffc47e,
  tile: 0x353b49, tileL: 0x464d5d, tileD: 0x282c37,
  shu: 0xc23b2c, shuD: 0x98291f, gold: 0xc4a35e, bronze: 0x6f6a4c,
  stone: 0x8b8b87, stoneD: 0x6f6f6c, stoneL: 0xa5a5a0,
  thatch: 0x7f6f50, thatchD: 0x625640, indigo: 0x2c395d, red: 0xc8392f, black: 0x1f1c1c,
  tatami: 0xc4b68a, tatamiD: 0x3b3f35, lacquer: 0x2a1d1c,
  koiO: 0xf06a2a, koiW: 0xf4efe6, koiB: 0x1e1e22,
};

// ---------- воксельная сетка и сборка граней ----------
class VG {
  constructor(w, h, d, s) { this.w = w; this.h = h; this.d = d; this.s = s; this.a = new Uint32Array(w * h * d); this.yOff = 0; }
  set(x, y, z, c, g) { x = Math.floor(x); y = Math.floor(y); z = Math.floor(z); if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.h || z >= this.d) return; this.a[(y * this.d + z) * this.w + x] = (c & 0xffffff) | (g ? 0x3000000 : 0x1000000); }
  get(x, y, z) { if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.h || z >= this.d) return 0; return this.a[(y * this.d + z) * this.w + x]; }
  box(x0, y0, z0, x1, y1, z1, c, g) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (typeof c === 'function') { const r = c(x, y, z); if (r !== null && r !== undefined) this.set(x, y, z, r, g); } else this.set(x, y, z, c, g);
    }
  }
}

class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.g = []; this.f = []; }
  quad(q, nx, ny, nz, col, glow, flip) {
    for (let k = 0; k < 4; k++) { this.p.push(q[k * 3], q[k * 3 + 1], q[k * 3 + 2]); this.n.push(nx, ny, nz); this.c.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); this.g.push(glow); }
    this.f.push(flip ? 1 : 0);
  }
  build(lamps) {
    const nv = this.p.length / 3;
    const pos = new Float32Array(this.p), nor = new Float32Array(this.n);
    const lamp = new Float32Array(nv);
    if (lamps && lamps.length) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < nv; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const near = lamps.filter(L => L[0] + L[3] > x0 && L[0] - L[3] < x1 && L[1] + L[3] > y0 && L[1] - L[3] < y1 && L[2] + L[3] > z0 && L[2] - L[3] < z1);
      if (near.length) for (let i = 0; i < nv; i++) {
        let s = 0; const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        for (const L of near) {
          const dx = L[0] - x, dy = L[1] - y, dz = L[2] - z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < L[3] * L[3]) { const d = Math.sqrt(d2) + 1e-4, a = 1 - d / L[3], nd = (dx * nor[i * 3] + dy * nor[i * 3 + 1] + dz * nor[i * 3 + 2]) / d; s += L[4] * a * a * (0.25 + 0.75 * Math.max(nd, 0)); }
        }
        lamp[i] = Math.min(s, 2.2);
      }
    }
    const nq = this.f.length, idx = nv > 65535 ? new Uint32Array(nq * 6) : new Uint16Array(nq * 6);
    for (let q = 0; q < nq; q++) {
      const b = q * 4, o = q * 6;
      if (this.f[q]) { idx[o] = b + 1; idx[o + 1] = b + 2; idx[o + 2] = b + 3; idx[o + 3] = b + 1; idx[o + 4] = b + 3; idx[o + 5] = b; }
      else { idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(this.g), 1));
    geo.setAttribute('aLamp', new THREE.BufferAttribute(lamp, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

// n, u, v, base; u × v = n
const FACES = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0], [-1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0], [0, -1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, -1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
];
const CORN = [0, 0, 1, 0, 1, 1, 0, 1];
const AOV = [0.42, 0.64, 0.83, 1];
const _q = new Array(12), _c = new Array(12), _ao = [0, 0, 0, 0];
// пустоты, до которых не дойти снаружи (комнаты, полости кроны): их грани не видны, не строим
function outsideAir(G) {
  const { w, h, d, a } = G, out = new Uint8Array(w * h * d), q = new Int32Array(w * h * d);
  let n = 0;
  const push = i => { if (!a[i] && !out[i]) { out[i] = 1; q[n++] = i; } };
  for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || z === 0 || x === w - 1 || y === h - 1 || z === d - 1) push((y * d + z) * w + x);
  for (let k = 0; k < n; k++) {
    const i = q[k], x = i % w, z = ((i - x) / w) % d, y = (i - x - z * w) / (w * d);
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (z > 0) push(i - w); if (z < d - 1) push(i + w); if (y > 0) push(i - w * d); if (y < h - 1) push(i + w * d);
  }
  return out;
}
function meshVG(G, geo, T = {}) {
  const { w, h, d, a } = G, sc = (T.sc || 1) * G.s, cr = Math.cos(T.rot || 0), sr = Math.sin(T.rot || 0);
  const out = outsideAir(G);
  const tx = T.x || 0, ty = (T.y || 0) - G.yOff * sc, tz = T.z || 0, ox = w / 2, oz = d / 2;
  for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const v = a[(y * d + z) * w + x]; if (!v) continue;
    const rgb = v & 0xffffff, glow = (v >>> 25) & 1;
    const r = S2L[rgb >>> 16], g = S2L[(rgb >>> 8) & 255], b = S2L[rgb & 255];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], nx = F[0], ny = F[1], nz = F[2];
      const xn = x + nx, yn = y + ny, zn = z + nz;
      if (xn >= 0 && yn >= 0 && zn >= 0 && xn < w && yn < h && zn < d && !out[(yn * d + zn) * w + xn]) continue;
      if (ny === -1 && y === 0 && !T.bottom) continue;
      const bx = x + nx, by = y + ny, bz = z + nz;
      for (let k = 0; k < 4; k++) {
        const cu = CORN[k * 2], cv = CORN[k * 2 + 1], su = cu ? 1 : -1, sv = cv ? 1 : -1;
        const s1 = G.get(bx + su * F[3], by + su * F[4], bz + su * F[5]) ? 1 : 0;
        const s2 = G.get(bx + sv * F[6], by + sv * F[7], bz + sv * F[8]) ? 1 : 0;
        const c3 = G.get(bx + su * F[3] + sv * F[6], by + su * F[4] + sv * F[7], bz + su * F[5] + sv * F[8]) ? 1 : 0;
        const o = s1 && s2 ? 0 : 3 - s1 - s2 - c3; _ao[k] = o;
        const lx = x + F[9] + cu * F[3] + cv * F[6], ly = y + F[10] + cu * F[4] + cv * F[7], lz = z + F[11] + cu * F[5] + cv * F[8];
        const px = (lx - ox) * sc, pz = (lz - oz) * sc;
        _q[k * 3] = tx + px * cr + pz * sr; _q[k * 3 + 1] = ty + ly * sc; _q[k * 3 + 2] = tz - px * sr + pz * cr;
        const m = glow ? 1 : AOV[o];
        _c[k * 3] = r * m; _c[k * 3 + 1] = g * m; _c[k * 3 + 2] = b * m;
      }
      geo.quad(_q, nx * cr + nz * sr, ny, -nx * sr + nz * cr, _c, glow, _ao[0] + _ao[2] < _ao[1] + _ao[3]);
    }
  }
  return geo;
}
function toWorld(G, T, vx, vy, vz) {
  const sc = (T.sc || 1) * G.s, cr = Math.cos(T.rot || 0), sr = Math.sin(T.rot || 0);
  const px = (vx - G.w / 2) * sc, pz = (vz - G.d / 2) * sc;
  return [T.x + px * cr + pz * sr, T.y + (vy - G.yOff) * sc, T.z - px * sr + pz * cr];
}

// стены по периметру: fn(вдоль, высота, сторона, длина) → [цвет, свечение]
function walls(G, x0, x1, z0, z1, y0, y1, fn) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
    let side, a, len;
    if (z === z0) { side = 0; a = x - x0; len = x1 - x0; } else if (z === z1) { side = 2; a = x - x0; len = x1 - x0; }
    else if (x === x1) { side = 1; a = z - z0; len = z1 - z0; } else { side = 3; a = z - z0; len = z1 - z0; }
    const r = fn(a, y - y0, side, len, x, z); if (r) G.set(x, y, z, r[0], r[1]);
  }
}
function ring(G, x0, x1, z0, z1, y, fn) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) G.set(x, y, z, fn(x + z)); }
// вальмовая крыша: слои по вокселю вверх, сжатие sx/sz на слой; ряды черепицы полосами, бороздки вдоль ската
function roofHip(G, x0, x1, z0, z1, y, sx, sz, cA, cB, o = {}) {
  const max = o.levels || 99;
  for (let l = 0; l < max; l++) {
    const ax0 = Math.round(x0 + l * sx), ax1 = Math.round(x1 - l * sx), az0 = Math.round(z0 + l * sz), az1 = Math.round(z1 - l * sz);
    if (ax1 < ax0 || az1 < az0) break;
    const bx0 = Math.round(x0 + (l + 1) * sx), bx1 = Math.round(x1 - (l + 1) * sx), bz0 = Math.round(z0 + (l + 1) * sz), bz1 = Math.round(z1 - (l + 1) * sz);
    const last = l === max - 1 || bx1 < bx0 || bz1 < bz0;
    for (let z = az0; z <= az1; z++) for (let x = ax0; x <= ax1; x++) {
      if (!last && x > bx0 && x < bx1 && z > bz0 && z < bz1) continue;
      let c;
      if (o.thatch) c = hk(h3(x, y + l, z) > 0.5 ? cA : cB, 0.86 + vn3(x * 0.5, (y + l) * 1.5, z * 0.5) * 0.28);
      else {
        const dz = Math.min(z - az0, az1 - z), dx = Math.min(x - ax0, ax1 - x);
        const groove = dz <= dx ? (x & 1) : (z & 1);
        c = hk(l % 2 ? cA : cB, groove ? 0.9 : 1.05);
        if (l === 0) c = hk(cA, 0.78);
      }
      G.set(x, y + l, z, c);
    }
    if (l === 0 && o.curl) for (const [cx, cz, dx, dz] of [[ax0, az0, -1, -1], [ax1, az0, 1, -1], [ax0, az1, -1, 1], [ax1, az1, 1, 1]]) {
      G.set(cx, y + 1, cz, hk(cA, 0.8)); G.set(cx + dx, y + 1, cz + dz, hk(cA, 0.8)); G.set(cx + dx, y + 2, cz + dz, o.tip || hk(cA, 0.7));
    }
    if (last) {
      if (o.ridge !== false) for (let x = ax0; x <= ax1; x++) for (let z = az0; z <= az1; z++) if (az1 - az0 <= 2 || ax1 - ax0 <= 2) G.set(x, y + l + 1, z, o.ridgeC || P.tileD);
      if (o.ridge !== false && ax1 - ax0 > 2) { G.set(ax0, y + l + 2, (az0 + az1) >> 1, o.ridgeC || P.tileD); G.set(ax1, y + l + 2, (az0 + az1) >> 1, o.ridgeC || P.tileD); }
      break;
    }
  }
}
function lanternRed(G, x, y, z) {
  G.box(x - 1, y, z - 1, x + 1, y + 2, z + 1, P.red, 1);
  G.set(x, y - 1, z, P.black); G.set(x, y + 3, z, P.black); G.set(x, y + 4, z, P.woodD);
}

// ---------- долина: река, пруд, рельеф ----------
const WL = 1.5;
const riverX = z => 5.5 * Math.sin(z * 0.024 + 0.5) + 3.2 * Math.sin(z * 0.061 - 1.2) + 1.5;
const riverW = z => 4.4 + 0.9 * Math.sin(z * 0.07 + 1) + 1.6 * sstep(70, 100, z);
const PZ = -100, PX = riverX(PZ), PRX = 24, PRZ = 17;
const WFX = PX + 4, WFZ = PZ - PRZ + 0.6;   // водопад
const X0 = -150, X1 = 150, Z0 = -215, Z1 = 116;
function waterN(x, z) {
  let d = 9;
  if (z > PZ - 2) d = Math.abs(x - riverX(z)) / riverW(z);
  const px = (x - PX) / PRX, pz = (z - PZ) / PRZ, a = Math.atan2(pz, px);
  const wob = 1 + 0.1 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5 - 2);
  return Math.min(d, Math.hypot(px, pz) / wob);
}
function Hbase(x, z) {
  let h = 2.7 + (fbm(x * 0.045, z * 0.045, 3) - 0.5) * 2.4 + Math.max(0, -z - 20) * 0.01;
  const cx = riverX(z) * 0.5;
  const dv = Math.abs(x - cx) + (fbm(x * 0.02 + 7, z * 0.02, 3) - 0.5) * 26;
  const w = sstep(20, 88, dv);
  h += w * (40 + 44 * fbm(x * 0.011 + 3, z * 0.011 - 5, 4)) + w * w * ridged(x * 0.035, z * 0.035) * 18;
  const cl = sstep(PZ - PRZ + 1, PZ - PRZ - 5, z);
  if (cl > 0) {
    let top = 21 + fbm(x * 0.05, z * 0.05, 2) * 6 + Math.max(0, -z - 125) * 0.16 + 9 * sstep(26, 6, Math.abs(x - WFX));
    if (Math.abs(x - WFX) < 2.6) top -= 2.5;
    h = Math.max(h, lerp(h, top, cl));
  }
  return h;
}
const PEAKS = [[-4, -470, 205, 150], [-230, -400, 125, 120], [215, -430, 140, 130], [370, -260, 96, 110], [-370, -250, 100, 110]];
function Hfar(x, z) {
  let h = Hbase(x, z);
  if (z < -200) h += (-z - 200) * 0.12;
  h += (vn2(x * 0.07, z * 0.07) - 0.5) * 16 * clamp((h - 40) / 100, 0, 1);
  for (const [px, pz, ph, pr] of PEAKS) {
    const d = Math.hypot(x - px, z - pz);
    if (d < pr) { const t = 1 - d / pr; h = Math.max(h, ph * Math.pow(t, 2.1) * (0.8 + 0.35 * ridged(x * 0.016 + 1, z * 0.016)) + ph * 0.16 * t * ridged(x * 0.05, z * 0.05)); }
  }
  return h;
}

// ---------- раскладка мира ----------
const PADS = [], PATHS = [], LAMPS = [];
const L = {};
function padAdd(x, z, r, h, f = 3) { PADS.push({ x, z, r, h, f }); }
function segD(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
function pathD(x, z) { let d = 99; for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) { const q = segD(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]); if (q < d) d = q; } return d; }
function H0(x, z) {
  let h = Hbase(x, z);
  const wn = waterN(x, z);
  if (wn < 1) h = WL - 0.4 - 1.6 * (1 - wn * wn);
  else if (wn < 1.9) h = Math.min(h, lerp(WL + 0.2, h, sstep(1, 1.9, wn)));
  return h;
}
function H(x, z) {
  let h = H0(x, z);
  for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + p.f) h = lerp(h, p.h, sstep(p.r + p.f, p.r, d)); }
  return h;
}
function layout() {
  const q = v => Math.round(v * 2) / 2;
  // мост
  const bz = 16, bx = riverX(bz), slope = (riverX(bz + 0.5) - riverX(bz - 0.5));
  L.bridge = { x: bx, z: bz, rot: Math.atan(slope) };
  const ax = Math.cos(L.bridge.rot), az = -Math.sin(L.bridge.rot);
  L.bridgeW = [bx - ax * 8.6, bz - az * 8.6]; L.bridgeE = [bx + ax * 8.6, bz + az * 8.6];
  padAdd(L.bridgeW[0], L.bridgeW[1], 2.6, 2.75, 3); padAdd(L.bridgeE[0], L.bridgeE[1], 2.6, 2.75, 3);
  // ресторан на восточном берегу, лицом к реке
  const rz = 1, rx = riverX(rz) + 17.5;
  L.rest = { x: rx, z: rz, h: q(Math.max(2.8, H0(rx, rz))), rot: -Math.PI / 2 };
  padAdd(rx, rz, 11, L.rest.h, 5);
  // пагода на западном склоне: ищем точку высотой около 14
  const pz = -58; let px = riverX(pz) - 22;
  for (let x = riverX(pz) - 22; x > -95; x -= 0.5) if (H0(x, pz) >= 13.5) { px = x; break; }
  L.pagoda = { x: px, z: pz, h: q(H0(px, pz)) };
  padAdd(px, pz, 9, L.pagoda.h, 6);
  L.tea = { x: px + 11, z: pz + 7, h: q(H0(px + 11, pz + 7)) }; padAdd(L.tea.x, L.tea.z, 5, L.tea.h, 4);
  L.torii = { x: riverX(-22) - 13, z: -22 }; L.torii.h = q(H0(L.torii.x, L.torii.z)); padAdd(L.torii.x, L.torii.z, 3, L.torii.h, 3);
  // деревня по восточному берегу
  L.houses = [
    { k: 'machiya', z: -24, dx: 18, lit: 1 }, { k: 'minka', z: -44, dx: 24, lit: 1 }, { k: 'kura', z: -63, dx: 15, lit: 0 },
    { k: 'machiya', z: -80, dx: 22, lit: 0 }, { k: 'minka', z: -8, dx: -19, lit: 1 },
  ].map(o => { const x = riverX(o.z) + o.dx, h = q(Math.max(2.6, H0(x, o.z))); padAdd(x, o.z, 5.5, h, 4); return { ...o, x, h, rot: o.dx > 0 ? -Math.PI / 2 : Math.PI / 2 }; });
  // помост над прудом
  L.deck = { x: PX + PRX * 0.72, z: PZ + 3, rot: -Math.PI / 2 };
  // тропы
  const E = L.bridgeE, W = L.bridgeW, R = L.rest;
  PATHS.push([[E[0] + 1, E[1]], [R.x - 7.5, R.z + 5], [R.x - 7, R.z - 8], ...L.houses.filter(h => h.dx > 0).map(h => [h.x - 5.5, h.z]), [L.deck.x + 6, L.deck.z + 8]]);
  PATHS.push([[W[0] - 1, W[1]], [L.torii.x + 1, L.torii.z + 4], [L.torii.x, L.torii.z - 4], [lerp(L.torii.x, px, 0.5) + 5, lerp(L.torii.z, pz, 0.5)], [px + 6, pz + 9], [L.tea.x, L.tea.z + 4]]);
  // каменные фонари
  L.lanterns = [
    [E[0] + 2.2, E[1] - 2.2], [W[0] - 2.2, W[1] + 2.2], [R.x - 8.5, R.z + 7.5], [R.x - 8.5, R.z - 7.5],
    [L.torii.x + 3, L.torii.z + 2.5], [L.torii.x - 3, L.torii.z + 2.5], [px + 5, pz + 6.5], [px - 5, pz + 6.5], [L.tea.x - 3.5, L.tea.z + 3],
    [PX - 12, PZ + 12], [PX + 6, PZ + 14.5], [PX - 17, PZ - 3], [riverX(-40) + 6.5, -40], [PX - 20, PZ - 11], [PX + 21, PZ - 9],
  ];
  L.lanterns.forEach(l => { l[2] = q(H0(l[0], l[1])); padAdd(l[0], l[1], 0.8, l[2], 1); });
}

// ---------- постройки ----------
function makeRestaurant() {
  const G = new VG(76, 50, 60, 0.25), X0 = 10, X1 = 65, Z0 = 10, Z1 = 47, lamps = [];
  G.box(X0 - 2, 0, Z0 - 2, X1 + 2, 1, Z1 + 2, (x, y, z) => J(P.stone, x, y, z, 0.12));
  G.box(X0 - 4, 2, Z1 + 1, X1 + 4, 2, Z1 + 7, (x, y, z) => hk(P.plank, x % 4 === 0 ? 0.82 : 0.96 + h3(x, 1, z) * 0.08));
  for (let x = X0 - 4; x <= X1 + 4; x += 8) G.box(x, 0, Z1 + 7, x, 1, Z1 + 7, P.woodD);
  for (const x of [X0 - 4, X0 + 14, X1 - 14, X1 + 4]) G.box(x, 3, Z1 + 7, x, 14, Z1 + 7, P.woodD);
  walls(G, X0, X1, Z0, Z1, 3, 14, (a, yy, side, len) => {
    if (a % 8 === 0 || a === len) return [P.woodD];
    if (yy === 11) return [P.woodD];
    if (yy > 11) return [J(P.plaster, a, yy, side, 0.04)];
    if (yy < 2) return [hk(P.wood, a % 2 ? 0.88 : 1)];
    if (side === 2 && a >= 24 && a <= 31) { if (yy >= 7) return a % 3 === 0 ? [P.paperL, 1] : [hk(P.indigo, yy === 9 ? 1.5 : 1)]; return [P.paperL, 1]; }
    if (side !== 2 && a % 16 > 9) return [J(P.plaster, a, yy, side, 0.04)];
    if (a % 2 === 0 || yy % 3 === 1) return [P.woodD];
    return [P.paper, 1];
  });
  G.box(X0, 15, Z0, X1, 15, Z1, P.woodD);
  roofHip(G, X0 - 7, X1 + 7, Z0 - 6, Z1 + 8, 15, 1.4, 1.4, P.tile, P.tileL, { levels: 4, curl: true });
  const A0 = X0 + 6, A1 = X1 - 6, B0 = Z0 + 5, B1 = Z1 - 5;
  walls(G, A0, A1, B0, B1, 16, 25, (a, yy, side, len) => {
    if (a % 8 === 0 || a === len || yy === 0) return [P.woodD];
    if (yy >= 8) return [J(P.plaster, a, yy, side, 0.04)];
    if (a % 8 === 4) return [P.woodD];
    if (a % 2 === 0 || yy % 3 === 0) return [P.woodD];
    return [side === 2 || side === 1 ? P.paper : P.paperL, 1];
  });
  // балкон второго этажа
  for (let x = A0 - 2; x <= A1 + 2; x++) { G.set(x, 18, B1 + 2, P.woodD); if (x % 4 === 0) G.set(x, 17, B1 + 2, P.woodD); }
  G.box(A0 - 2, 16, B1 + 1, A1 + 2, 16, B1 + 2, P.plank);
  roofHip(G, X0 - 3, X1 + 3, Z0 - 1, Z1 + 1, 26, 0.75, 1.25, P.tile, P.tileL, { curl: true });
  // вывеска и фонари
  G.box(23, 12, Z1 + 1, 32, 13, Z1 + 1, P.woodD);
  for (let x = 24; x <= 31; x += 2) G.set(x, 12, Z1 + 2, P.paperL);
  for (const x of [X0 - 2, 21, 34, X1 + 2]) lanternRed(G, x, 10, Z1 + 6);
  lamps.push([27.5, 8, Z1 + 5, 11, 1.2], [X0 - 2, 10, Z1 + 6, 7, 0.7], [X1 + 2, 10, Z1 + 6, 7, 0.7], [37, 20, B1 + 3, 8, 0.6]);
  return { G, lamps };
}
function makePagoda() {
  const G = new VG(50, 96, 50, 0.25), c = 25, lamps = [];
  G.box(c - 14, 0, c - 14, c + 13, 2, c + 13, (x, y, z) => J(P.stone, x, y, z, 0.12));
  G.box(c - 4, 0, c + 14, c + 3, 1, c + 15, P.stoneL); G.box(c - 4, 0, c + 16, c + 3, 0, c + 17, P.stoneL);
  let y = 3;
  const B = [9, 8, 7, 6, 5], HT = [11, 7, 7, 7, 7];
  for (let i = 0; i < 5; i++) {
    const b = B[i], x0 = c - b, x1 = c + b - 1, top = HT[i] - 1;
    walls(G, x0, x1, x0, x1, y, y + top, (a, yy, side, len) => {
      const mid = len / 2;
      if (a === 0 || a === len || Math.abs(a - mid) === 3.5) return [P.shu];
      if (yy === top) return [P.shu];
      if (yy === 0) return [P.woodD];
      if (i === 0 && Math.abs(a - mid) < 3 && yy < top - 2) return [(yy === 2 || yy === top - 4) && a % 2 === 0 ? P.gold : hk(P.woodD, a % 2 ? 0.85 : 1.1)];
      if (i > 0 && i < 4 && Math.abs(a - mid) < 2 && yy >= 2 && yy <= 4) return [P.paper, 1];
      return [J(P.plaster, a, yy, side, 0.04)];
    });
    G.box(x0 + 1, y + HT[i], x0 + 1, x1 - 1, y + HT[i], x1 - 1, P.woodD);
    y += HT[i];
    ring(G, x0 - 1, x1 + 1, x0 - 1, x1 + 1, y, k => k % 2 ? P.shu : P.woodD);
    ring(G, x0 - 2, x1 + 2, x0 - 2, x1 + 2, y + 1, k => k % 2 ? P.woodD : P.shu);
    y += 2;
    const o = 7 - i * 0.6;
    roofHip(G, x0 - 2 - o, x1 + 2 + o, x0 - 2 - o, x1 + 2 + o, y, 1.75, 1.75, P.tile, P.tileL, { levels: 4, curl: true, tip: P.gold, ridge: false });
    y += 4;
  }
  G.box(c - 1, y - 1, c - 1, c, y + 15, c, P.bronze);
  for (let k = 0; k < 7; k++) ring(G, c - 2, c + 1, c - 2, c + 1, y + 3 + k * 2, () => hk(P.bronze, 1.15));
  G.box(c - 1, y + 16, c - 1, c, y + 17, c, P.gold);
  lamps.push([c, 6, c + 12, 9, 0.8]);
  return { G, lamps };
}
function makeTeaHouse() {
  const G = new VG(32, 30, 32, 0.25), X0 = 8, X1 = 23, lamps = [];
  G.box(X0 - 1, 0, X0 - 1, X1 + 1, 1, X1 + 1, (x, y, z) => J(P.stone, x, y, z, 0.1));
  G.box(X0 - 1, 2, X1 + 1, X1 + 1, 2, X1 + 3, P.plank);
  walls(G, X0, X1, X0, X1, 2, 10, (a, yy, side, len) => {
    if (a % 5 === 0 || a === len || yy === 8) return [P.woodL];
    if (yy > 8) return [J(P.earth, a, yy, side, 0.06)];
    if (side === 2 && a > 1 && a < len - 1 && yy > 0 && yy < 8) return (a % 2 === 0 || yy % 3 === 0) ? [P.woodL] : [P.paper, 1];
    if (side === 1) { const dx = a - len / 2, dy = yy - 4.5; if (dx * dx + dy * dy < 7) return [P.paperL, 1]; }
    return [J(P.earth, a, yy, side, 0.06)];
  });
  G.box(X0, 11, X0, X1, 11, X1, P.woodD);
  roofHip(G, X0 - 4, X1 + 4, X0 - 4, X1 + 5, 11, 1, 1, P.thatch, P.thatchD, { thatch: true, ridgeC: P.woodD });
  lamps.push([16, 5, X1 + 3, 8, 0.8]);
  return { G, lamps };
}
function makeBridge() {
  const G = new VG(64, 34, 16, 0.25), top = x => Math.round(12 + 8 * (1 - Math.pow((x - 31.5) / 30.5, 2)));
  for (let x = 1; x <= 62; x++) {
    const yt = top(x);
    for (let z = 3; z <= 12; z++) {
      G.set(x, yt, z, hk(P.plank, x % 3 === 0 ? 0.84 : 0.97 + h3(x, 0, z) * 0.06));
      G.set(x, yt - 1, z, z === 3 || z === 12 ? P.shu : P.woodD);
    }
    G.set(x, yt - 2, 3, P.shuD); G.set(x, yt - 2, 12, P.shuD);
    for (const z of [3, 12]) {
      G.set(x, yt + 4, z, P.shu); G.set(x, yt + 2, z, P.shuD);
      if (x % 6 === 1 || x === 62) { G.box(x, yt + 1, z, x, yt + 4, z, P.shu); G.set(x, yt + 5, z, x === 1 || x === 62 ? P.gold : P.shuD); if (x === 1 || x === 62) G.set(x, yt + 6, z, P.gold); }
    }
  }
  for (const px of [15, 47]) {
    const yb = top(px) - 2;
    for (const z of [4, 11]) G.box(px, 0, z, px + 1, yb, z, P.shuD);
    G.box(px, yb - 1, 4, px + 1, yb - 1, 11, P.woodD); G.box(px, 3, 4, px + 1, 3, 11, P.woodD);
  }
  return { G, lamps: [] };
}
function makeDeck() {
  const G = new VG(44, 32, 28, 0.25), lamps = [];
  for (const x of [2, 13, 24, 35, 41]) for (const z of [2, 13, 25]) G.box(x, 0, z, x, 8, z, P.woodD);
  ring(G, 1, 42, 1, 26, 8, () => P.woodD);
  G.box(1, 9, 1, 42, 9, 26, (x, y, z) => (x % 8 === 1 || z % 5 === 1) ? P.tatamiD : J(P.tatami, x, y, z, 0.05));
  for (let x = 1; x <= 42; x++) { G.set(x, 12, 1, P.woodD); if (x % 4 === 1) G.box(x, 10, 1, x, 11, 1, P.woodD); }
  for (let z = 1; z <= 26; z++) { G.set(1, 12, z, P.woodD); if (z % 4 === 1) G.box(1, 10, z, 1, 11, z, P.woodD); }
  for (const [tx, tz] of [[7, 8], [19, 16], [31, 8]]) {
    G.box(tx, 11, tz, tx + 5, 11, tz + 3, P.lacquer); for (const [lx, lz] of [[tx, tz], [tx + 5, tz], [tx, tz + 3], [tx + 5, tz + 3]]) G.set(lx, 10, lz, P.lacquer);
    G.box(tx + 1, 10, tz - 2, tx + 2, 10, tz - 1, P.red); G.box(tx + 3, 10, tz + 4, tx + 4, 10, tz + 5, P.indigo);
  }
  for (const [ux, uz] of [[12, 19], [34, 17]]) {
    G.box(ux, 10, uz, ux, 25, uz, P.woodD);
    for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) {
      const d = Math.hypot(dx, dz); if (d > 9.3) continue;
      const rib = Math.floor((Math.atan2(dz, dx) + Math.PI) / (Math.PI / 6)) % 2;
      G.set(ux + dx, 27 - Math.floor(d / 3.4), uz + dz, d > 8.4 ? hk(P.red, 0.72) : hk(P.red, rib ? 0.86 : 1));
    }
    G.set(ux, 28, uz, P.black);
  }
  for (const [ax, az] of [[41, 3], [41, 24]]) { G.box(ax, 10, az, ax, 13, az, P.woodD); G.box(ax - 1, 14, az - 1, ax, 16, az, P.paperL, 1); lamps.push([ax, 15, az, 8, 0.9]); }
  return { G, lamps };
}
function makeMachiya(lit) {
  const G = new VG(40, 38, 32, 0.25), X0 = 6, X1 = 33, Z0 = 6, Z1 = 25, lamps = [];
  G.box(X0 - 1, 0, Z0 - 1, X1 + 1, 0, Z1 + 1, (x, y, z) => J(P.stone, x, y, z, 0.1));
  walls(G, X0, X1, Z0, Z1, 1, 11, (a, yy, side, len) => {
    if (a % 7 === 0 || a === len || yy === 11 || yy === 6) return [P.woodD];
    if (side === 2) { if (a % 2 === 0) return [P.woodD]; return lit && yy > 1 && yy < 10 && a > 7 && a < 21 ? [P.paper, 1] : [hk(P.woodD, 0.75)]; }
    return [J(P.plaster, a, yy, side, 0.05)];
  });
  G.box(X0, 12, Z0, X1, 12, Z1, P.woodD);
  roofHip(G, X0 - 3, X1 + 3, Z0 - 3, Z1 + 3, 12, 0.35, 1.2, P.tile, P.tileL, {});
  if (lit) lamps.push([20, 6, Z1 + 3, 8, 0.7]);
  return { G, lamps };
}
function makeMinka(lit) {
  const G = new VG(44, 44, 36, 0.25), X0 = 8, X1 = 35, Z0 = 8, Z1 = 27, lamps = [];
  G.box(X0 - 1, 0, Z0 - 1, X1 + 1, 0, Z1 + 1, (x, y, z) => J(P.stoneD, x, y, z, 0.1));
  walls(G, X0, X1, Z0, Z1, 1, 10, (a, yy, side, len) => {
    if (a % 6 === 0 || a === len || yy === 10) return [P.woodD];
    if (yy < 3) return [hk(P.wood, 0.8)];
    if (lit && side === 2 && a > 12 && a < 22 && yy < 9) return (a % 2 === 0 || yy % 3 === 0) ? [P.woodD] : [P.paper, 1];
    return [J(P.earth, a, yy, side, 0.06)];
  });
  G.box(X0, 11, Z0, X1, 11, Z1, P.woodD);
  roofHip(G, X0 - 4, X1 + 4, Z0 - 4, Z1 + 4, 11, 0.8, 0.85, P.thatch, P.thatchD, { thatch: true, ridgeC: P.woodD });
  if (lit) lamps.push([22, 5, Z1 + 3, 8, 0.7]);
  return { G, lamps };
}
function makeKura() {
  const G = new VG(28, 34, 24, 0.25), X0 = 6, X1 = 21, Z0 = 5, Z1 = 18;
  walls(G, X0, X1, Z0, Z1, 0, 16, (a, yy, side, len) => {
    if (yy < 6) return [((a + yy) % 4 === 0 || (a - yy + 64) % 4 === 0) ? P.plaster : 0x3b3f46];
    if (Math.abs(a - len / 2) < 2 && yy >= 11 && yy <= 13 && side % 2 === 0) return [P.black];
    return [J(P.plaster, a, yy, side, 0.03)];
  });
  G.box(X0, 17, Z0, X1, 17, Z1, P.woodD);
  roofHip(G, X0 - 2, X1 + 2, Z0 - 2, Z1 + 2, 17, 0.3, 1.1, P.tileD, P.tile, {});
  return { G, lamps: [] };
}
function makeTorii() {
  const G = new VG(30, 24, 6, 0.25);
  for (const x of [5, 23]) { G.box(x, 0, 2, x + 1, 18, 3, P.shu); G.box(x, 0, 2, x + 1, 1, 3, P.black); }
  G.box(2, 14, 2, 27, 15, 3, P.shu); G.box(14, 16, 2, 15, 18, 3, P.shu);
  G.box(0, 19, 1, 29, 19, 4, P.shu); G.box(0, 20, 1, 29, 21, 4, P.black);
  G.box(0, 22, 1, 1, 22, 4, P.black); G.box(28, 22, 1, 29, 22, 4, P.black);
  return { G, lamps: [] };
}
function makeStoneLantern() {
  const G = new VG(9, 17, 9, 0.15), S = (x, y, z) => J(h3(x, y, z) > 0.85 ? P.moss : P.stone, x, y, z, 0.12);
  G.box(1, 0, 1, 7, 1, 7, S); G.box(3, 2, 3, 5, 7, 5, S); G.box(1, 8, 1, 7, 8, 7, S);
  G.box(2, 9, 2, 6, 11, 6, (x, y, z) => (y > 9 && ((x > 2 && x < 6 && (z === 2 || z === 6)) || (z > 2 && z < 6 && (x === 2 || x === 6)))) ? null : S(x, y, z));
  G.box(3, 10, 3, 5, 11, 5, P.paperL, 1);
  G.box(0, 12, 0, 8, 12, 8, S); G.box(1, 13, 1, 7, 13, 7, S); G.box(2, 14, 2, 6, 14, 6, S); G.box(4, 15, 4, 4, 16, 4, S);
  return G;
}

// ---------- деревья и мелочь ----------
function vadd(a, b, k = 1) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
function vnorm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function voxelize(segs, blobs, s, pal, seed) {
  let mx = 0, my0 = 0, my1 = 0;
  for (const g of segs) for (const p of [g[0], g[1]]) { mx = Math.max(mx, Math.abs(p[0]) + g[2], Math.abs(p[2]) + g[2]); my0 = Math.min(my0, p[1] - g[2]); my1 = Math.max(my1, p[1] + g[2]); }
  for (const b of blobs) { mx = Math.max(mx, Math.abs(b.c[0]) + b.r * b.sx, Math.abs(b.c[2]) + b.r * b.sx); my1 = Math.max(my1, b.c[1] + b.r * b.sy); my0 = Math.min(my0, b.c[1] - b.r * b.sy); }
  const n = Math.ceil(mx / s) + 2, yOff = Math.ceil(-my0 / s) + 1;
  const G = new VG(n * 2, Math.ceil(my1 / s) + yOff + 2, n * 2, s); G.yOff = yOff;
  const vc = (i, o) => (i + 0.5) * s - o * s;
  for (const [a, b, ra, rb] of segs) {
    const r = Math.max(ra, rb), lo = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r], hi = [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], ll = dx * dx + dy * dy + dz * dz || 1;
    for (let iy = Math.floor(lo[1] / s) + yOff; iy <= Math.ceil(hi[1] / s) + yOff; iy++) for (let iz = Math.floor(lo[2] / s) + n; iz <= Math.ceil(hi[2] / s) + n; iz++) for (let ix = Math.floor(lo[0] / s) + n; ix <= Math.ceil(hi[0] / s) + n; ix++) {
      const px = vc(ix, n), py = vc(iy, yOff), pz = vc(iz, n);
      const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / ll, 0, 1);
      const d = Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t, pz - a[2] - dz * t);
      if (d <= lerp(ra, rb, t) + s * 0.36) G.set(ix, iy, iz, J(py < s * 2 ? pal.barkD : h3(ix, iy, iz) > 0.8 ? pal.barkL : pal.bark, ix, iy, iz, 0.1));
    }
  }
  for (const B of blobs) {
    const rx = B.r * B.sx, ry = B.r * B.sy;
    for (let iy = Math.floor((B.c[1] - ry) / s) + yOff; iy <= Math.ceil((B.c[1] + ry) / s) + yOff; iy++) for (let iz = Math.floor((B.c[2] - rx) / s) + n; iz <= Math.ceil((B.c[2] + rx) / s) + n; iz++) for (let ix = Math.floor((B.c[0] - rx) / s) + n; ix <= Math.ceil((B.c[0] + rx) / s) + n; ix++) {
      const px = vc(ix, n) - B.c[0], py = vc(iy, yOff) - B.c[1], pz = vc(iz, n) - B.c[2];
      const e = (px * px + pz * pz) / (rx * rx) + (py * py) / (ry * ry);
      if (e >= 1) continue;
      const nz = vn3(vc(ix, n) * pal.nf + seed, vc(iy, yOff) * pal.nf, vc(iz, n) * pal.nf);
      if (nz < pal.cut + e * pal.edge) continue;
      const ty = py / ry, r = h3(ix, iy, iz + seed);
      let c = ty > 0.35 ? pal.c1 : ty > -0.25 ? pal.c2 : pal.c3;
      if (r > 0.94) c = pal.c0; else if (r < 0.06) c = pal.c4;
      G.set(ix, iy, iz, J(c, ix, iy, iz, 0.05));
    }
  }
  return G;
}
const PAL_SAKURA = { bark: P.bark, barkD: P.barkD, barkL: P.barkL, c0: P.pinkW, c1: P.pink1, c2: P.pink2, c3: P.pink3, c4: P.pink4, nf: 1.25, cut: 0.26, edge: 0.42 };
const PAL_GREEN = { bark: P.bark, barkD: P.barkD, barkL: P.barkL, c0: P.grassD, c1: P.leaf2, c2: P.leaf1, c3: P.leaf3, c4: P.cedar2, nf: 1.1, cut: 0.2, edge: 0.4 };
function makeTree(seed, S, s, depth, pal, blobK = 1) {
  const rnd = mulberry32(seed), segs = [], tips = [];
  function grow(p, dir, len, r, dp) {
    const mid = vadd(p, dir, len * 0.5), d2 = vnorm(vadd(dir, [(rnd() - 0.5) * 0.55, 0.06, (rnd() - 0.5) * 0.55])), end = vadd(mid, d2, len * 0.5);
    segs.push([p, mid, r, r * 0.88], [mid, end, r * 0.88, r * 0.74]);
    if (dp >= depth) { tips.push(end); return; }
    const n = dp === 0 ? 3 : (rnd() < 0.5 ? 2 : 3), a0 = rnd() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = a0 + i * 6.283 / n + (rnd() - 0.5) * 0.9, sp = dp === 0 ? 0.95 : 0.78;
      grow(end, vnorm([Math.cos(a) * sp + d2[0] * 0.5, 0.52 + rnd() * 0.4 - dp * 0.1, Math.sin(a) * sp + d2[2] * 0.5]), len * (0.6 + rnd() * 0.16), r * 0.64, dp + 1);
    }
    if (dp >= 1 && rnd() < 0.45) tips.push(end);
  }
  grow([0, 0, 0], vnorm([(rnd() - 0.5) * 0.35, 1, (rnd() - 0.5) * 0.35]), S * 0.34, S * 0.06, 0);
  for (let i = 0; i < 5; i++) { const a = i * 1.257 + rnd() * 0.5; segs.push([[0, S * 0.07, 0], [Math.cos(a) * S * 0.13, -S * 0.02, Math.sin(a) * S * 0.13], S * 0.035, S * 0.014]); }
  const blobs = tips.map(t => ({ c: [t[0], t[1] + S * 0.02, t[2]], r: S * (0.1 + rnd() * 0.06) * blobK, sx: 1.25, sy: 0.78 }));
  return voxelize(segs, blobs, s, pal, seed % 97);
}
function makeCedar(seed, Hm, s) {
  const rnd = mulberry32(seed), R = Hm * 0.2, n = Math.ceil(R / s) + 2, G = new VG(n * 2, Math.ceil(Hm / s) + 3, n * 2, s);
  const tr = Math.max(0.5, 0.22 / s);
  for (let y = 0; y < Hm * 0.92 / s; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.hypot(x, z) <= tr) G.set(n + x, y, n + z, J(P.barkD, x, y, z));
  const y0 = Hm * 0.2 / s, y1 = Hm / s;
  for (let y = Math.floor(y0); y < y1; y++) {
    const t = (y - y0) / (y1 - y0), tier = (y % 3 === 0) ? 1.18 : 0.92, r = (R / s) * Math.pow(1 - t, 0.95) * tier + 0.6;
    for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5); if (d > r) continue;
      if (d > r - 1.2 && h3(x + seed, y, z) < 0.3) continue;
      const k = h3(x, y + seed, z), c = t > 0.75 ? P.cedar2 : k > 0.66 ? P.cedar1 : k > 0.25 ? P.cedar3 : P.cedar2;
      G.set(n + x, y, n + z, J(c, x, y, z, 0.06));
    }
  }
  rnd();
  return G;
}
function makeRock(seed, R, s) {
  const n = Math.ceil(R * 1.3 / s) + 1, G = new VG(n * 2, Math.ceil(R * 1.1 / s) + 2, n * 2, s); G.yOff = 1;
  for (let y = 0; y < G.h; y++) for (let z = 0; z < G.d; z++) for (let x = 0; x < G.w; x++) {
    const px = (x - n + 0.5) * s, py = (y - 1 + 0.5) * s, pz = (z - n + 0.5) * s;
    const e = (px * px + pz * pz) / (R * R * 1.4) + py * py / (R * R * 0.6);
    if (e + (vn3(px * 1.4 + seed, py * 1.4, pz * 1.4) - 0.5) * 0.7 < 1) {
      const top = py > R * 0.35 && h3(x, y, z + seed) > 0.45;
      G.set(x, y, z, top ? J(P.moss, x, y, z, 0.1) : J(h3(x, y + seed, z) > 0.6 ? P.rockL : P.rock, x, y, z, 0.1));
    }
  }
  return G;
}
function makeTuft(seed, s) {
  const G = new VG(5, 6, 5, s), rnd = mulberry32(seed), greens = [P.grassA, P.grassB, P.grassD, P.moss, P.leaf2];
  const flowers = [0xf4efe8, 0xb39ad8, 0xf1d36a, 0xf2b3c6];
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
    if (rnd() > 0.5 || Math.hypot(x - 2, z - 2) > 2.4) continue;
    const hh = 1 + Math.floor(rnd() * (3.4 - Math.hypot(x - 2, z - 2)));
    const c = greens[Math.floor(rnd() * greens.length)];
    for (let y = 0; y < hh; y++) G.set(x, y, z, hk(c, 0.8 + y * 0.08));
    if (rnd() < 0.25) G.set(x, hh, z, flowers[Math.floor(rnd() * flowers.length)]);
  }
  return G;
}
function makeKoi(seed) {
  const G = new VG(4, 2, 11, 0.07), rnd = mulberry32(seed), base = [P.koiO, P.koiW, P.koiO][seed % 3];
  for (let z = 0; z < 11; z++) {
    const w = z < 2 ? 0 : z < 8 ? 1 : 0;
    for (let x = 1 - w; x <= 2 + w; x++) for (let y = 0; y < (z > 1 && z < 9 ? 2 : 1); y++) {
      const spot = vn2(x * 0.9 + seed, z * 0.6) > 0.55 ? (rnd() < 0.8 ? P.koiW : P.koiB) : base;
      G.set(x, y, z, z < 2 ? hk(base, 0.9) : spot);
    }
  }
  G.set(0, 0, 1, hk(base, 0.9)); G.set(3, 0, 1, hk(base, 0.9));
  return G;
}
function makeFloatLantern() {
  const G = new VG(5, 5, 5, 0.12);
  G.box(0, 0, 0, 4, 0, 4, P.woodD); G.box(1, 1, 1, 3, 3, 3, P.paper, 1);
  for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4]]) G.box(x, 1, z, x, 3, z, P.woodD);
  G.box(0, 4, 0, 4, 4, 4, (x, y, z) => (x === 0 || x === 4 || z === 0 || z === 4) ? P.woodD : null);
  return G;
}

// ---------- рендер ----------
const canvas = $('#gl');
let renderer;
try {
  if (!window.WebGL2RenderingContext) throw new Error('no webgl2');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) { document.documentElement.classList.add('nogl'); $('#load').classList.add('off'); }

// слоистый туман: дальность + дымка у земли (сила дымки — дробная часть near)
const FOG_FN = `
float fogAmt(float d, float y, float nh, float far) {
  float fd = 1.0 - exp(-max(d - floor(nh), 0.0) / far);
  float fh = exp(-max(y - 1.0, 0.0) * 0.06);
  return clamp(fd * (0.72 + 0.45 * fh) + fh * fract(nh) * smoothstep(6.0, 80.0, d), 0.0, 0.96);
}`;
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying float vFogY;\n#endif';
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  { vec4 fw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fw = instanceMatrix * fw;
  #endif
    vFogY = ( modelMatrix * fw ).y; }
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
 uniform vec3 fogColor; varying float vFogDepth; varying float vFogY; uniform float fogNear; uniform float fogFar;
 ${FOG_FN}
#endif`;
THREE.ShaderChunk.fog_fragment = '#ifdef USE_FOG\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogAmt( vFogDepth, vFogY, fogNear, fogFar ) );\n#endif';

const U = {
  time: { value: 0 }, lamp: { value: 1 }, glow: { value: 2.4 }, lampCol: { value: new THREE.Color(0xffa860) }, wind: { value: 1 },
  fogColor: { value: new THREE.Color() }, fogNear: { value: 30 }, fogFar: { value: 650 },
};
function voxMat(sway) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, { uLamp: U.lamp, uGlow: U.glow, uLampCol: U.lampCol, uTime: U.time, uWind: U.wind });
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute float aLamp; attribute float aGlow; varying float vLamp; varying float vGlow; uniform float uTime; uniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLamp = aLamp; vGlow = aGlow;
${sway ? `{ vec3 ip = vec3(0.0);
#ifdef USE_INSTANCING
ip = instanceMatrix[3].xyz;
#endif
float k = max(position.y - 2.5, 0.0) * 0.014 * uWind;
transformed.x += sin(uTime * 1.2 + ip.x * 0.37 + position.y * 0.35) * k;
transformed.z += cos(uTime * 0.9 + ip.z * 0.31 + position.y * 0.3) * k * 0.7; }` : ''}`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying float vLamp; varying float vGlow; uniform float uLamp; uniform float uGlow; uniform vec3 uLampCol;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uLampCol * (vLamp * uLamp) + diffuseColor.rgb * vGlow * uGlow;`);
  };
  m.customProgramCacheKey = () => sway ? 'vox-sway' : 'vox';
  return m;
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x5d5a86, 30.14, 650);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.3, 1800);
camera.layers.enable(1);
const MAT = voxMat(false), MAT_SWAY = voxMat(true);

// небо: градиент, свечение у горизонта, облака, звёзды, луна
const skyUni = {
  uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
  uCloudCol: { value: new THREE.Color() }, uGlowDir: { value: new THREE.Vector3(0, 0, -1) }, uMoonDir: { value: new THREE.Vector3(0.35, 0.42, -0.84).normalize() },
  uStars: { value: 1 }, uMoon: { value: 1 }, uCloud: { value: 0.5 }, uTime: U.time,
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUni, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: `
uniform vec3 uZen, uMid, uHor, uGlow, uCloudCol, uGlowDir, uMoonDir; uniform float uStars, uMoon, uCloud, uTime; varying vec3 vDir;
float hh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(vec3(i, 1.0)), hh(vec3(i + vec2(1.0, 0.0), 1.0)), f.x), mix(hh(vec3(i + vec2(0.0, 1.0), 1.0)), hh(vec3(i + 1.0, 1.0)), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.2, h));
  col = mix(col, uZen, smoothstep(0.16, 0.7, h));
  float g = pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(uGlowDir)), 0.0), 3.0);
  col += uGlow * g * (1.0 - smoothstep(-0.02, 0.32, h));
  vec2 cp = d.xz / (max(h, 0.0) + 0.16) * 0.9 + vec2(uTime * 0.006, 0.0);
  float c = n2(cp * 1.4) * 0.6 + n2(cp * 3.3 + 7.0) * 0.28 + n2(cp * 7.7) * 0.12;
  c = smoothstep(0.52, 0.86, c) * smoothstep(0.015, 0.2, h) * uCloud;
  col = mix(col, uCloudCol, c * 0.7);
  vec3 sp = d * 150.0; float r = hh(floor(sp));
  float st = step(0.992, r) * smoothstep(0.26, 0.05, length(fract(sp) - 0.5)) * smoothstep(0.06, 0.35, h) * (0.65 + 0.35 * sin(uTime * 1.7 + r * 90.0));
  col += vec3(0.85, 0.9, 1.0) * st * uStars * (1.0 - c) * 1.8;
  float m = dot(d, normalize(uMoonDir));
  col += vec3(1.0, 0.96, 0.9) * (smoothstep(0.99945, 0.9996, m) * 2.4 * (1.0 - c * 0.7) + pow(max(m, 0.0), 220.0) * 0.35) * uMoon;
  if (h < 0.0) col = mix(uHor, uHor * 0.55, smoothstep(0.0, -0.25, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);
const skyScene = new THREE.Scene(); skyScene.add(new THREE.Mesh(sky.geometry, skyMat));

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
Object.assign(sun.shadow.camera, { left: -175, right: 175, top: 175, bottom: -175, near: 10, far: 900 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 2.5;
sun.target.position.set(0, 0, -40);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x8d93c9, 0x2c2f3a, 0.5);
scene.add(hemi);

// ---------- настроения ----------
const C = h => new THREE.Color(h);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const MOODS = {
  dusk: { zen: C(0x1b2146), mid: C(0x3c3e76), hor: C(0xa487b0), glowC: C(0xe99f98), cloudC: C(0x6f668f), cloud: 0.55, glowDir: V3(-0.25, 0, -1), stars: 1, moon: 1,
    sunC: C(0xa9b6ff), sunI: 1.7, sunDir: V3(-0.45, 0.72, 0.52), hemiS: C(0x8e95cc), hemiG: C(0x33374a), hemiI: 0.8, env: 1.0,
    fog: C(0x5d5a88), near: 30.12, far: 430, lamp: 1, glow: 1.5, flies: 1, rain: 0, deep: C(0x10152e), shallow: C(0x2a3957), ripple: 1, fall: 0.62, exp: 1.12, bloom: 0.45, pl: 1 },
  morning: { zen: C(0x5b8fd2), mid: C(0x9ec0ea), hor: C(0xf0dac7), glowC: C(0xffcf9e), cloudC: C(0xfff3e8), cloud: 0.45, glowDir: V3(0.9, 0, -0.3), stars: 0, moon: 0,
    sunC: C(0xffe1bd), sunI: 2.8, sunDir: V3(0.82, 0.36, 0.18), hemiS: C(0xb8d2f0), hemiG: C(0x5a513f), hemiI: 0.75, env: 1,
    fog: C(0xc9d5e4), near: 24.1, far: 760, lamp: 0.04, glow: 0.3, flies: 0, rain: 0, deep: C(0x2c4a66), shallow: C(0x7695a0), ripple: 0.9, fall: 1.1, exp: 1.0, bloom: 0.18, pl: 0 },
  rain: { zen: C(0x3d4453), mid: C(0x545e6e), hor: C(0x7a838f), glowC: C(0x878d99), cloudC: C(0x5a616f), cloud: 1, glowDir: V3(0, 0, -1), stars: 0, moon: 0,
    sunC: C(0xc6cfe0), sunI: 0.55, sunDir: V3(0.2, 0.9, 0.35), hemiS: C(0x8a94a6), hemiG: C(0x2d3137), hemiI: 0.75, env: 0.8,
    fog: C(0x68707e), near: 10.3, far: 300, lamp: 0.9, glow: 1.3, flies: 0.15, rain: 1, deep: C(0x1d242e), shallow: C(0x44505c), ripple: 1.5, fall: 0.5, exp: 1.0, bloom: 0.35, pl: 0.8 },
};
const mood = {};
for (const k in MOODS.dusk) { const v = MOODS.dusk[k]; mood[k] = v && v.clone ? v.clone() : v; }
let moodFrom = null, moodTo = null, moodT = 1;

// ---------- мир ----------
let water, waterUni, fall, fallUni, petals, floaters, flies, rain, rainUni, lanternsFloat, kois = [], pLights = [];
const petalState = [], floatState = [], koiState = [], lfState = [];
let terrainInfo;
const KEYS = [];

function inst(G, mat, list, o = {}) {
  const geo = meshVG(G, new Geo()).build();
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const d = new THREE.Object3D();
  list.forEach((p, i) => { d.position.set(p[0], p[1] - G.yOff * G.s * (p[4] || 1), p[2]); d.rotation.set(0, p[3] || 0, 0); d.scale.setScalar(p[4] || 1); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
  m.castShadow = o.cast !== false; m.receiveShadow = true;
  if (o.layer) m.layers.set(o.layer);
  m.computeBoundingSphere();
  scene.add(m);
  return m;
}
function place(B, T, cast = true) {
  const geo = meshVG(B.G, new Geo(), T);
  for (const l of B.lamps || []) { const w = toWorld(B.G, T, l[0], l[1], l[2]); LAMPS.push([w[0], w[1], w[2], l[3], l[4]]); }
  return { geo, cast };
}

function buildTerrain() {
  const Cc = Q.cell, nx = Math.round((X1 - X0) / Cc), nz = Math.round((Z1 - Z0) / Cc);
  const Hq = new Float32Array(nx * nz), COL = new Uint32Array(nx * nz), SIDE = new Uint32Array(nx * nz), petal = new Float32Array(nx * nz);
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz) ? -40 : Hq[j * nx + i];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + (i + 0.5) * Cc, z = Z0 + (j + 0.5) * Cc, h = H(x, z), wn = waterN(x, z);
    const q = h > 22 ? 1 : 0.5;
    let hq = Math.round((h + (h2(i * 7 + 1, j * 13 + 5) - 0.5) * (wn < 1 ? 0.2 : 0.34)) / q) * q;
    if (wn < 1) hq = Math.min(hq, WL - 0.25); else if (wn < 1.25) hq = Math.max(hq, WL + 0.25);
    Hq[j * nx + i] = hq;
  }
  for (const t of terrainInfo.sakura) {
    const ci = Math.floor((t[0] - X0) / Cc), cj = Math.floor((t[2] - Z0) / Cc), R = Math.ceil(5.5 / Cc);
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const d = Math.hypot((i - ci) * Cc, (j - cj) * Cc) / 5.5; if (d < 1) petal[j * nx + i] = Math.max(petal[j * nx + i], 1 - d);
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + (i + 0.5) * Cc, z = Z0 + (j + 0.5) * Cc, h = Hq[j * nx + i], wn = waterN(x, z), r = h2(i, j);
    const slope = Math.max(Math.abs(h - at(i + 1, j)), Math.abs(h - at(i - 1, j)), Math.abs(h - at(i, j + 1)), Math.abs(h - at(i, j - 1)));
    const n = fbm(x * 0.07, z * 0.07, 2), n2 = vn2(x * 0.25, z * 0.25), pd = pathD(x, z);
    let c, sc;
    if (h < WL - 0.1) { c = hm(P.bed, P.pebble, n2); if (r > 0.9) c = P.sand; c = hk(c, 1 - clamp((WL - h) * 0.12, 0, 0.35)); sc = P.pebble; }
    else if (wn < 1.45 && h < WL + 1.1) { c = r > 0.55 ? hm(P.wet, P.moss, n2 * 0.6) : hm(P.sand, P.pebble, n2); sc = P.wet; }
    else if (pd < 1.3) { c = r > 0.78 ? P.pathL : hm(P.path, P.moss, n2 * 0.25); sc = P.soil; }
    else if (h > 92 + n * 18) { c = r > 0.3 ? P.snow : P.snowB; sc = P.rock; }
    else if (slope > 2.6 || h > 64) { c = hm(P.rock, n2 > 0.5 ? P.rockL : P.rockD, n); sc = P.rockD; }
    else if (h > 13 + n * 8) { c = hm(P.forest, n2 > 0.6 ? P.grassC : P.forestD, n); sc = hm(c, P.soilD, 0.5); if (r > 0.86) c = P.rock; }
    else {
      c = n < 0.38 ? P.grassC : n < 0.5 ? P.grassA : n < 0.62 ? P.grassB : P.grassD;
      c = hm(c, P.moss, n2 * 0.3);
      sc = hm(c, P.soil, 0.5);
      if (r > 0.992) c = [0xf4efe8, 0xb39ad8, 0xf1d36a][Math.floor(h2(j, i) * 3)];
    }
    const pt = petal[j * nx + i];
    if (pt > 0 && h >= WL && h2(i + 5, j) < pt * 0.9) c = hm(c, P.petalG, 0.35 + pt * 0.45);
    COL[j * nx + i] = hk(c, 0.93 + r * 0.12); SIDE[j * nx + i] = sc;
  }
  // сетка чанками: верх, боковины ступенями, мягкая тень в углах
  const CH = 48, TAO = [0.58, 0.74, 0.88, 1];
  const q = new Array(12), col = new Array(12);
  const put = (geo, verts, nrm, ctop, cbot, ytop) => {
    for (let k = 0; k < 4; k++) { q[k * 3] = verts[k][0]; q[k * 3 + 1] = verts[k][1]; q[k * 3 + 2] = verts[k][2]; const cc = verts[k][1] >= ytop - 1e-3 ? ctop : cbot; col[k * 3] = cc[0]; col[k * 3 + 1] = cc[1]; col[k * 3 + 2] = cc[2]; }
    geo.quad(q, nrm[0], nrm[1], nrm[2], col, 0, false);
  };
  const lin = (c, k) => [S2L[c >>> 16] * k, S2L[(c >> 8) & 255] * k, S2L[c & 255] * k];
  const NB = [[1, 0, [1, 0, 0]], [-1, 0, [-1, 0, 0]], [0, 1, [0, 0, 1]], [0, -1, [0, 0, -1]]];
  for (let cj = 0; cj < nz; cj += CH) for (let ci = 0; ci < nx; ci += CH) {
    const geo = new Geo();
    for (let j = cj; j < Math.min(nz, cj + CH); j++) for (let i = ci; i < Math.min(nx, ci + CH); i++) {
      const h = Hq[j * nx + i], x0 = X0 + i * Cc, z0 = Z0 + j * Cc, x1 = x0 + Cc, z1 = z0 + Cc, c = COL[j * nx + i];
      const cr = S2L[c >>> 16], cg = S2L[(c >> 8) & 255], cb = S2L[c & 255];
      const ao = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const sz = CORN[k * 2] ? 1 : -1, sx = CORN[k * 2 + 1] ? 1 : -1;
        const s1 = at(i + sx, j) > h + 0.01 ? 1 : 0, s2 = at(i, j + sz) > h + 0.01 ? 1 : 0, c3 = at(i + sx, j + sz) > h + 0.01 ? 1 : 0;
        ao[k] = s1 && s2 ? 0 : 3 - s1 - s2 - c3;
        const m = TAO[ao[k]];
        col[k * 3] = cr * m; col[k * 3 + 1] = cg * m; col[k * 3 + 2] = cb * m;
      }
      q[0] = x0; q[1] = h; q[2] = z0; q[3] = x0; q[4] = h; q[5] = z1; q[6] = x1; q[7] = h; q[8] = z1; q[9] = x1; q[10] = h; q[11] = z0;
      geo.quad(q, 0, 1, 0, col, 0, ao[0] + ao[2] < ao[1] + ao[3]);
      for (const [di, dj, nrm] of NB) {
        const hn = at(i + di, j + dj); if (hn >= h) continue;
        const face = (yb, yt, ct, cbb) => {
          let v;
          if (di === 1) v = [[x1, yb, z0], [x1, yt, z0], [x1, yt, z1], [x1, yb, z1]];
          else if (di === -1) v = [[x0, yb, z0], [x0, yb, z1], [x0, yt, z1], [x0, yt, z0]];
          else if (dj === 1) v = [[x0, yb, z1], [x1, yb, z1], [x1, yt, z1], [x0, yt, z1]];
          else v = [[x0, yb, z0], [x0, yt, z0], [x1, yt, z0], [x1, yb, z0]];
          put(geo, v, nrm, ct, cbb, yt);
        };
        const lip = Math.min(0.35, h - hn);
        face(h - lip, h, lin(c, 0.86), lin(c, 0.7), 0);
        let y = h - lip, seg = 0;
        const sc = SIDE[j * nx + i];
        while (y > hn + 1e-3) {
          const yb = Math.max(hn, y - Q.seg[h > 20 ? 1 : 0]);
          const k = 0.82 + h2(i * 3 + seg, j * 5 + (y | 0)) * 0.3, scc = h > 12 && h2(i * 7 + seg, j * 3) > 0.7 ? hm(sc, P.moss, 0.6) : sc;
          face(yb, y, lin(scc, k), lin(scc, yb <= hn + 1e-3 ? k * 0.55 : k * 0.85), 0);
          y = yb; seg++;
        }
      }
    }
    if (!geo.f.length) continue;
    const mesh = new THREE.Mesh(geo.build(LAMPS), MAT);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { Hq, nx, nz, Cc, at };
}
function groundAt(x, z) {
  const T = terrainInfo.grid, i = Math.floor((x - X0) / T.Cc), j = Math.floor((z - Z0) / T.Cc);
  return T.at(i, j);
}
function buildFar() {
  const F = Q.far, x0 = -480, x1 = 480, z0 = -660, z1 = 120, nx = Math.round((x1 - x0) / F), nz = Math.round((z1 - z0) / F);
  const inside = (x, z) => x > X0 + 2 && x < X1 - 2 && z > Z0 + 2 && z < Z1 - 2;
  const Hh = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + (i + 0.5) * F, z = z0 + (j + 0.5) * F; Hh[j * nx + i] = inside(x, z) ? -999 : Math.round((Hfar(x, z) + (h2(i, j) - 0.5) * 6) / 2) * 2; }
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz) ? -60 : Hh[j * nx + i] === -999 ? -20 : Hh[j * nx + i];
  const q = new Array(12), col = new Array(12);
  const lin = (c, k) => [S2L[c >>> 16] * k, S2L[(c >> 8) & 255] * k, S2L[c & 255] * k];
  const CH = 40;
  for (let cj = 0; cj < nz; cj += CH) for (let ci = 0; ci < nx; ci += CH) {
    const geo = new Geo();
    for (let j = cj; j < Math.min(nz, cj + CH); j++) for (let i = ci; i < Math.min(nx, ci + CH); i++) {
      const h = Hh[j * nx + i]; if (h === -999) continue;
      const X = x0 + i * F, Z = z0 + j * F, r = h2(i, j), n = vn2(X * 0.02, Z * 0.02);
      const c = h > 92 + n * 20 ? (r > 0.25 ? P.snow : P.snowB) : h > 64 + n * 10 ? hm(P.rock, P.rockD, r) : hm(P.forestD, P.forest, n);
      const top = lin(c, 0.92 + r * 0.14);
      for (let k = 0; k < 4; k++) { col[k * 3] = top[0]; col[k * 3 + 1] = top[1]; col[k * 3 + 2] = top[2]; }
      q[0] = X; q[1] = h; q[2] = Z; q[3] = X; q[4] = h; q[5] = Z + F; q[6] = X + F; q[7] = h; q[8] = Z + F; q[9] = X + F; q[10] = h; q[11] = Z;
      geo.quad(q, 0, 1, 0, col, 0, false);
      const sideC = h > 92 + n * 20 ? P.snowB : h > 60 ? P.rock : P.forestD;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const hn = at(i + di, j + dj); if (hn >= h) continue;
        const ct = lin(sideC, 0.85), cb = lin(sideC, 0.55);
        let v;
        if (di === 1) v = [[X + F, hn, Z], [X + F, h, Z], [X + F, h, Z + F], [X + F, hn, Z + F]];
        else if (di === -1) v = [[X, hn, Z], [X, hn, Z + F], [X, h, Z + F], [X, h, Z]];
        else if (dj === 1) v = [[X, hn, Z + F], [X + F, hn, Z + F], [X + F, h, Z + F], [X, h, Z + F]];
        else v = [[X, hn, Z], [X, h, Z], [X + F, h, Z], [X + F, hn, Z]];
        for (let k = 0; k < 4; k++) { q[k * 3] = v[k][0]; q[k * 3 + 1] = v[k][1]; q[k * 3 + 2] = v[k][2]; const cc = v[k][1] === h ? ct : cb; col[k * 3] = cc[0]; col[k * 3 + 1] = cc[1]; col[k * 3 + 2] = cc[2]; }
        geo.quad(q, di, 0, dj, col, 0, false);
      }
    }
    if (!geo.f.length) continue;
    const mesh = new THREE.Mesh(geo.build(), MAT);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

// камера: опорные точки вдоль пути; sx/sy — сдвиг кадра под панели
function buildKeys() {
  const B = L.bridge, Pg = L.pagoda;
  KEYS.length = 0;
  const rbx = riverX(B.z + 25), wx = riverX(PZ + 30);
  KEYS.push(
    { p: [2, 16, 96], t: [3, 7.5, -50], sx: -0.04, sy: 0.26 },
    { p: [2, 13, 68], t: [5, 5, 0], sx: -0.1, sy: 0.24 },
    { p: [rbx, WL + 2.1, B.z + 25], t: [B.x + 3, WL + 3.4, B.z - 8], sx: -0.2, sy: 0.2 },
    { p: [B.x - 2, 16, B.z - 20], t: [Pg.x, Pg.h + 9, Pg.z], sx: 0.05, sy: 0.18 },
    { p: [Pg.x + 26, Pg.h + 10, Pg.z + 26], t: [Pg.x - 1, Pg.h + 10, Pg.z - 2], sx: 0.2, sy: 0.2 },
    { p: [PX + 6, 14, PZ + 44], t: [PX + 5, 5, PZ - 8], sx: -0.05, sy: 0.18 },
    { p: [wx, WL + 3, PZ + 30], t: [wx + 8, WL + 10, PZ + 1], sx: -0.2, sy: 0.2 },
    { p: [wx + 1.1, WL + 2.7, PZ + 26], t: [wx + 8.5, WL + 10.5, PZ + 1], sx: -0.2, sy: 0.2 },
  );
  if (TOUCH) KEYS[0].p = [2, 21, 108];
}
let posCurve, tgtCurve;

async function build() {
  await tick(0.05);
  layout();
  buildKeys();
  posCurve = new THREE.CatmullRomCurve3(KEYS.map(k => new THREE.Vector3(...k.p)), false, 'centripetal');
  tgtCurve = new THREE.CatmullRomCurve3(KEYS.map(k => new THREE.Vector3(...k.t)), false, 'centripetal');
  const corridor = posCurve.getSpacedPoints(160);
  const shots = [0, 2, 4, 6, 7].map(i => KEYS[i]);
  const inView = (x, z, hTop) => shots.some((k, n) => {
    const [px, py, pz] = k.p, [tx, ty, tz] = k.t, dx = tx - px, dz = tz - pz, L2 = dx * dx + dz * dz, Ln = Math.sqrt(L2);
    const t = clamp(((x - px) * dx + (z - pz) * dz) / L2, 0, 1);
    if (t * Ln > (n ? 34 : 60) || t * Ln < (n ? 0 : 30) || (n && t > 0.8)) return false;
    return Math.hypot(x - px - dx * t, z - pz - dz * t) < (n ? 6 : 2.5) + t * Ln * (n ? 0.33 : 0.12) && hTop > py + (ty - py) * t - 3;
  });
  const blocked = (x, z, hTop) => inView(x, z, hTop) || corridor.some(p => p.y < hTop + 3 && Math.hypot(p.x - x, p.z - z) < 6.5);

  // деревья: сначала позиции (нужны для лепестков на земле)
  const rnd = mulberry32(7), sak = [], ced = [], rnds = [];
  const freeFromPads = (x, z, m) => PADS.every(p => Math.hypot(x - p.x, z - p.z) > p.r + m);
  const want = [[L.bridgeE[0] + 5, L.bridgeE[1] + 3], [L.bridgeW[0] - 5, L.bridgeW[1] - 4], [L.rest.x - 3, L.rest.z + 14], [L.rest.x + 2, L.rest.z - 14],
    [PX - 14, PZ + 16], [PX + 12, PZ + 17], [PX - 22, PZ + 4], [L.deck.x + 11, L.deck.z - 7], [L.deck.x + 10, L.deck.z + 10], [L.pagoda.x + 9, L.pagoda.z - 7], [L.torii.x - 6, L.torii.z - 3], [L.tea.x + 6, L.tea.z - 3], [-9, 52], [12, 40], [-14, 20]];
  for (const [x, z] of want) { const hq = H0(x, z); if (waterN(x, z) > 1.3 && !blocked(x, z, hq + 9)) sak.push([x, 0, z, rnd() * 6.28, 0.9 + rnd() * 0.25]); }
  for (let t = 0; t < 4000 && sak.length < Q.sakura; t++) {
    const x = -75 + rnd() * 150, z = -125 + rnd() * 215, h = H0(x, z);
    if (h > 20 || waterN(x, z) < 1.5 || fbm(x * 0.03 + 4, z * 0.03, 2) < 0.47 || pathD(x, z) < 2.4 || !freeFromPads(x, z, 2.5)) continue;
    if (sak.some(s => Math.hypot(s[0] - x, s[2] - z) < 6) || blocked(x, z, h + 9) || Math.hypot(x - 2, z - 96) < 20) continue;
    sak.push([x, 0, z, rnd() * 6.28, 0.85 + rnd() * 0.3]);
  }
  for (let t = 0; t < 6000 && ced.length < Q.cedar; t++) {
    const x = -140 + rnd() * 280, z = -210 + rnd() * 300, h = H0(x, z);
    if (h < 9 || h > 70 || fbm(x * 0.025 - 3, z * 0.025, 2) < 0.4 || !freeFromPads(x, z, 3) || blocked(x, z, h + 15)) continue;
    if (ced.some(s => Math.hypot(s[0] - x, s[2] - z) < 4.5)) continue;
    ced.push([x, 0, z, rnd() * 6.28, 0.8 + rnd() * 0.45]);
  }
  for (let t = 0; t < 3000 && rnds.length < Q.round; t++) {
    const x = -90 + rnd() * 180, z = -130 + rnd() * 220, h = H0(x, z);
    if (h < 4 || h > 26 || waterN(x, z) < 1.6 || pathD(x, z) < 2.5 || !freeFromPads(x, z, 3) || blocked(x, z, h + 8)) continue;
    if ([...sak, ...rnds].some(s => Math.hypot(s[0] - x, s[2] - z) < 6)) continue;
    rnds.push([x, 0, z, rnd() * 6.28, 0.85 + rnd() * 0.3]);
  }
  terrainInfo = { sakura: sak };
  await tick(0.12);

  // постройки: сначала огни (ими подсвечивается земля)
  const R = makeRestaurant(), Pg = makePagoda(), Th = makeTeaHouse(), Br = makeBridge(), Dk = makeDeck(), To = makeTorii(), SL = makeStoneLantern();
  const built = [];
  built.push(place(R, { x: L.rest.x, y: L.rest.h, z: L.rest.z, rot: L.rest.rot }));
  built.push(place(Pg, { x: L.pagoda.x, y: L.pagoda.h, z: L.pagoda.z, rot: Math.atan2(PX - L.pagoda.x, 40) * 0.5 + 0.35 }));
  built.push(place(Th, { x: L.tea.x, y: L.tea.h, z: L.tea.z, rot: 0.5 }));
  built.push(place(Br, { x: L.bridge.x, y: WL - 1.5, z: L.bridge.z, rot: L.bridge.rot }));
  built.push(place(Dk, { x: L.deck.x, y: WL - 1.4, z: L.deck.z, rot: L.deck.rot }));
  built.push(place(To, { x: L.torii.x, y: L.torii.h, z: L.torii.z, rot: 0.25 }));
  const mk = { machiya: makeMachiya, minka: makeMinka, kura: makeKura };
  for (const h of L.houses) built.push(place(mk[h.k](h.lit), { x: h.x, y: h.h, z: h.z, rot: h.rot }));
  const slGeo = new Geo();
  for (const [x, z, y] of L.lanterns) { meshVG(SL, slGeo, { x, y, z, rot: h2(x | 0, z | 0) * 1.5 }); LAMPS.push([x, y + 1.6, z, 6.5, 0.9]); }
  built.push({ geo: slGeo, cast: true });
  await tick(0.3);

  terrainInfo.grid = buildTerrain();
  await tick(0.5);
  buildFar();
  await tick(0.58);
  for (const b of built) { const m = new THREE.Mesh(b.geo.build(LAMPS), MAT); m.castShadow = b.cast; m.receiveShadow = true; scene.add(m); }
  await tick(0.66);

  // деревья по земле
  const drop = list => list.map(p => [p[0], groundAt(p[0], p[2]) - 0.15, p[2], Math.round(p[3] / 1.5708) * 1.5708, p[4]]);
  // дальние от пути камеры деревья — крупным вокселем
  const far = p => corridor.every(c => Math.hypot(c.x - p[0], c.z - p[2]) > 70);
  const lod = (list, n, mk, mat, o) => {
    const near = list.filter(p => !far(p)), farL = list.filter(far);
    for (const [part, lo] of [[near, false], [farL, true]]) for (let i = 0; i < n; i++) {
      const l = part.filter((_, k) => k % n === i); if (l.length) inst(mk(i, lo), mat, l, o);
    }
  };
  lod(drop(sak), 4, (i, lo) => makeTree(101 + i * 37, 8.5 + i * 0.6, lo ? Q.treeVox * 1.7 : Q.treeVox, 3, PAL_SAKURA), MAT_SWAY);
  await tick(0.75);
  lod(drop(ced), 3, (i, lo) => makeCedar(300 + i * 11, 13 + i * 2, lo ? Q.cedarVox * 1.45 : Q.cedarVox), MAT_SWAY, { layer: 1, cast: false });
  lod(drop(rnds), 2, (i, lo) => makeTree(700 + i * 13, 7 + i, Q.treeVox * (lo ? 1.8 : 1.1), 2, PAL_GREEN, 1.35), MAT_SWAY);
  // главное дерево на переднем плане
  const hero = makeTree(4242, 12, HQ ? 0.3 : 0.45, 4, { ...PAL_SAKURA, cut: 0.33, edge: 0.5 });
  inst(hero, MAT_SWAY, [[21, groundAt(21, 68) - 0.2, 68, 0.4, 1]]);
  await tick(0.84);

  // камни, трава, фонари на воде, карпы
  const rocks = [0, 1, 2].map(i => makeRock(900 + i, 0.8 + i * 0.35, 0.3));
  const rl = [];
  for (let t = 0; t < 4000 && rl.length < Q.rocks; t++) {
    const x = -60 + rnd() * 120, z = PZ - 20 + rnd() * (116 - PZ + 20), wn = waterN(x, z);
    if (wn < 0.8 || wn > 1.6 || !freeFromPads(x, z, 1.5) || Math.hypot(x - L.bridge.x, z - L.bridge.z) < 9) continue;
    rl.push([x, groundAt(x, z) + 0.05, z, rnd() * 6.28, 0.7 + rnd() * 0.7]);
  }
  rl.push([-8, groundAt(-8, 84), 84, 0.3, 2.2], [-12, groundAt(-12, 88), 88, 1.2, 1.4], [13, groundAt(13, 80), 80, 2, 1.6]);
  rocks.forEach((G, i) => { const l = rl.filter((_, k) => k % 3 === i); if (l.length) inst(G, MAT, l); });
  const tufts = [0, 1, 2, 3].map(i => makeTuft(50 + i, 0.17));
  const tl = [];
  for (let t = 0; t < 30000 && tl.length < Q.tufts; t++) {
    const x = -70 + rnd() * 140, z = -125 + rnd() * 240, wn = waterN(x, z), h = H0(x, z);
    const nearWater = wn > 1.05 && wn < 2.4, nearCam = z > 40 && Math.abs(x) < 40;
    if (!(nearWater || (nearCam && rnd() < 0.5) || rnd() < 0.08) || h > 16 || wn < 1.05 || pathD(x, z) < 1.2 || !freeFromPads(x, z, 0.5)) continue;
    tl.push([x, groundAt(x, z), z, rnd() * 6.28, 0.8 + rnd() * 0.6]);
  }
  tufts.forEach((G, i) => { const l = tl.filter((_, k) => k % 4 === i); if (l.length) inst(G, MAT_SWAY, l, { cast: false, layer: 1 }); });

  buildWater();
  buildParticles(rnd);
  await tick(0.92);

  if (Q.lights) for (const [x, y, z, i] of [[L.rest.x - 9, L.rest.h + 3, L.rest.z, 26], [L.deck.x - 2, WL + 3, L.deck.z, 18], [L.pagoda.x + 1, L.pagoda.h + 2.5, L.pagoda.z + 5, 14], [L.bridge.x, 5.5, L.bridge.z, 8]]) {
    const pl = new THREE.PointLight(0xffa860, i, 16, 2); pl.position.set(x, y, z); pl.userData.base = i; scene.add(pl); pLights.push(pl);
  }
}

function buildWater() {
  const nx = terrainInfo.grid.nx, nz = terrainInfo.grid.nz, Hq = terrainInfo.grid.Hq, data = new Uint8Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) data[i] = clamp((WL - Hq[i]) / 2, 0, 1) * 255;
  const dtex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  dtex.magFilter = dtex.minFilter = THREE.LinearFilter; dtex.needsUpdate = true;
  const x0 = PX - PRX - 16, x1 = PX + PRX + 26, z0 = PZ - PRZ - 2, z1 = Z1;
  waterUni = {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tDepth: { value: dtex },
    uGrid: { value: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) }, uTime: U.time, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
    uRipple: { value: 1 }, uRain: { value: 0 }, uFogColor: U.fogColor, uFogNear: U.fogNear, uFogFar: U.fogFar,
  };
  const shader = {
    name: 'Voda', uniforms: waterUni,
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW; varying float vD;
void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform vec4 uGrid; uniform float uTime, uRipple, uRain, uFogNear, uFogFar; uniform vec3 uDeep, uShallow, uFogColor;
varying vec4 vUv; varying vec3 vW; varying float vD;
${FOG_FN}
vec2 wv(vec2 p, vec2 d, float f, float s, float a){ return d * a * f * cos(dot(p, d) * f + uTime * s); }
void main(){
  vec2 p = vW.xz;
  vec2 g = wv(p, vec2(0.8, 0.6), 1.3, 1.1, 0.05) + wv(p, vec2(-0.5, 0.86), 2.1, 1.7, 0.03) + wv(p, vec2(0.96, -0.28), 3.7, 2.3, 0.015) + wv(p, vec2(-0.2, -0.98), 6.3, 3.1, 0.007);
  if (uRain > 0.01) {
    vec2 q = p * 0.8, cell = floor(q), fp = fract(q) - 0.5;
    float hs = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453), ph = fract(uTime * 0.8 + hs);
    vec2 o = fp - (vec2(fract(hs * 7.1), fract(hs * 3.3)) - 0.5) * 0.5; float r = length(o);
    g += o / (r + 1e-3) * sin((r - ph * 0.5) * 50.0) * smoothstep(0.08, 0.0, abs(r - ph * 0.5)) * (1.0 - ph) * 0.35 * uRain;
  }
  vec3 N = normalize(vec3(-g.x * uRipple, 1.0, -g.y * uRipple));
  vec4 uv = vUv; uv.xy += N.xz * 0.03 * uv.w;
  vec3 refl = texture2DProj(tDiffuse, uv).rgb;
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  float depth = texture2D(tDepth, (p - uGrid.xy) / uGrid.zw).r;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 0.6, depth));
  vec3 col = mix(body, refl, mix(0.6, 0.97, fres));
  col += uShallow * 0.3 * (1.0 - smoothstep(0.0, 0.12, depth));
  float a = mix(0.84 * smoothstep(0.0, 0.2, depth), 1.0, fres);
  col = mix(col, uFogColor, fogAmt(vD, vW.y, uFogNear, uFogFar));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  };
  const w = x1 - x0, d = z1 - z0;
  water = new Reflector(new THREE.PlaneGeometry(w, d), { textureWidth: 512, textureHeight: 512, clipBias: 0.002, multisample: 0, shader });
  water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, WL, (z0 + z1) / 2);
  water.material.transparent = true;
  // Reflector копирует uniforms: общие (время, туман) подменяем обратно ссылками
  Object.assign(water.material.uniforms, { uTime: U.time, uFogColor: U.fogColor, uFogNear: U.fogNear, uFogFar: U.fogFar });
  waterUni = water.material.uniforms;
  const reflect = water.onBeforeRender;
  water.onBeforeRender = function (...a) { if (frameNo % Q.reflEvery === 0) reflect.apply(this, a); };
  scene.add(water);
  water.getReflectionCamera(camera).layers.set(0);

  // водопад: полосы по колонкам, падают вниз
  const top = groundAt(WFX, WFZ - 9) - 0.8, hgt = top - WL;
  const g = new THREE.PlaneGeometry(5.6, hgt, 1, 10);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) + hgt / 2) / hgt; pos.setZ(i, Math.pow(t, 3) * -0.8 + Math.sin(t * 3.1) * 0.3); }
  fallUni = { uTime: U.time, uBright: { value: 0.55 }, uFogColor: U.fogColor, uFogNear: U.fogNear, uFogFar: U.fogFar };
  fall = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: fallUni, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vW; varying float vD; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime, uBright, uFogNear, uFogFar; uniform vec3 uFogColor; varying vec2 vUv; varying vec3 vW; varying float vD;
${FOG_FN}
float hs(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float cx = floor(vUv.x * 18.0), r = hs(cx * 7.13);
  float y = (1.0 - vUv.y) * 7.0 - uTime * (1.3 + r * 0.9);
  float b = hs(floor(y * 3.0 + r * 10.0) * 3.7 + cx * 1.3);
  vec3 c = mix(vec3(0.5, 0.6, 0.78), vec3(0.95, 0.97, 1.0), step(0.42, b));
  c = mix(c, vec3(1.0), smoothstep(0.1, 0.0, vUv.y) * 0.7);
  float ey = hs(floor(vUv.y * 22.0) * 5.1) * 0.22;
  float a = smoothstep(ey, ey + 0.1, vUv.x) * smoothstep(1.0 - ey * 0.8, 0.9 - ey * 0.8, vUv.x) * (0.55 + 0.45 * b);
  c *= uBright;
  c = mix(c, uFogColor, fogAmt(vD, vW.y, uFogNear, uFogFar));
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  }));
  fall.position.set(WFX, WL + hgt / 2, WFZ + 0.4);
  scene.add(fall);
}

function softPoints(n, fill, uni, frag, o = {}) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = fill(i); pos.set(p, i * 3); seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, blending: o.blend || THREE.AdditiveBlending, vertexShader: o.vs, fragmentShader: frag });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.layers.set(1); scene.add(pts);
  return pts;
}
function buildParticles(rnd) {
  // светлячки у воды
  const fl = [];
  for (let t = 0; t < 20000 && fl.length < Q.flies; t++) {
    const x = -50 + rnd() * 100, z = PZ - 12 + rnd() * 150, wn = waterN(x, z);
    if (wn < 0.7 || wn > 2.6) continue;
    fl.push([x, Math.max(groundAt(x, z), WL) + 0.4 + rnd() * 2.2, z]);
  }
  flies = softPoints(fl.length, i => fl[i], { uTime: U.time, uInt: { value: 1 }, uPx: { value: 1 } }, `
varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.82, 0.42) * 3.2 * a, a); }`, {
    vs: `uniform float uTime, uInt, uPx; attribute float aSeed; varying float vA;
void main(){ vec3 p = position; float t = uTime * 0.35 + aSeed * 20.0;
  p += vec3(sin(t * 1.3) * 1.3, sin(t * 0.9 + aSeed * 6.0) * 0.5, cos(t * 1.1) * 1.3);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float bl = 0.5 + 0.5 * sin(uTime * 2.1 + aSeed * 40.0); vA = bl * bl * uInt;
  gl_PointSize = uPx * 34.0 * (0.6 + bl * 0.5) / -mv.z; }` });
  // дождь: штрихи в коробке вокруг камеры
  const RN = HQ ? 2600 : 800, rp = new Float32Array(RN * 6), re = new Float32Array(RN * 2);
  for (let i = 0; i < RN; i++) { const x = rnd() * 60, y = rnd() * 34, z = rnd() * 60; rp.set([x, y, z, x, y, z], i * 6); re[i * 2 + 1] = 1; }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aEnd', new THREE.BufferAttribute(re, 1));
  rainUni = { uTime: U.time, uCam: { value: new THREE.Vector3() }, uRain: { value: 0 } };
  rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
    uniforms: rainUni, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime, uRain; uniform vec3 uCam; attribute float aEnd; varying float vA;
void main(){ vec3 B = vec3(60.0, 34.0, 60.0), v = vec3(-1.4, -16.0, -0.7);
  vec3 p = mod(position + v * uTime - uCam, B) - B * 0.5 + uCam; p -= v * 0.05 * aEnd;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = uRain * (1.0 - aEnd * 0.8); }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.72, 0.77, 0.86), 0.32 * vA); }`,
  }));
  rain.frustumCulled = false; rain.visible = false; rain.layers.set(1); scene.add(rain);
  // лепестки в воздухе
  const pm = new THREE.MeshStandardMaterial({ color: 0xf6c6d4, emissive: 0x9a4a60, emissiveIntensity: 0.35, roughness: 0.6, side: THREE.DoubleSide });
  petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.11), pm, Q.petals);
  petals.frustumCulled = false; petals.layers.set(1); scene.add(petals);
  for (let i = 0; i < Q.petals; i++) petalState.push({ p: new THREE.Vector3((rnd() - 0.5) * 50, rnd() * 26, (rnd() - 0.5) * 50), f: 0.5 + rnd() * 0.7, ph: rnd() * 6.28, r: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6), s: 0.7 + rnd() * 0.7 });
  // лепестки на воде
  floaters = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.14).rotateX(-Math.PI / 2), pm, Q.floaters);
  floaters.frustumCulled = false; floaters.layers.set(1); scene.add(floaters);
  for (let i = 0; i < Q.floaters; i++) {
    const inPond = i % 3 === 0;
    floatState.push(inPond ? { pond: true, a: rnd() * 6.28, r: 0.2 + rnd() * 0.7, w: 0.02 + rnd() * 0.03, rot: rnd() * 6 } : { z: PZ + rnd() * (Z1 - PZ), o: (rnd() - 0.5) * 1.5, v: 0.25 + rnd() * 0.25, rot: rnd() * 6 });
  }
  // фонари на пруду
  const lg = meshVG(makeFloatLantern(), new Geo()).build();
  lanternsFloat = new THREE.InstancedMesh(lg, MAT, HQ ? 11 : 6);
  lanternsFloat.frustumCulled = false; scene.add(lanternsFloat);
  for (let i = 0; i < lanternsFloat.count; i++) lfState.push({ a: rnd() * 6.28, r: 0.25 + rnd() * 0.6, w: (rnd() < 0.5 ? -1 : 1) * (0.012 + rnd() * 0.015), ph: rnd() * 6 });
  // карпы
  const kg = [0, 1, 2].map(i => meshVG(makeKoi(i), new Geo()).build());
  for (let i = 0; i < Q.koi; i++) {
    const m = new THREE.Mesh(kg[i % 3], MAT); scene.add(m); kois.push(m);
    const inPond = i < Q.koi - 2;
    koiState.push(inPond ? { cx: PX + (rnd() - 0.5) * 16, cz: PZ + (rnd() - 0.2) * 12, r: 2 + rnd() * 4, w: (0.25 + rnd() * 0.3) * (rnd() < 0.5 ? -1 : 1), a: rnd() * 6.28 }
      : { cx: riverX(L.bridge.z + 6 + i * 4), cz: L.bridge.z + 6 + i * 4, r: 1.2 + rnd(), w: 0.4, a: rnd() * 6.28 });
  }
}

// ---------- постобработка ----------
let composer, bloom, pmrem, envRT;
function initPost() {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  renderer.debug.checkShaderErrors = qs.has('debug');
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: Q.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  pmrem = new THREE.PMREMGenerator(renderer);
}
function refreshEnv() {
  const old = envRT;
  envRT = pmrem.fromScene(skyScene, 0.04, 1, 2000);
  scene.environment = envRT.texture;
  if (old) old.dispose();
}
function applyMood() {
  const m = mood;
  skyUni.uZen.value.copy(m.zen); skyUni.uMid.value.copy(m.mid); skyUni.uHor.value.copy(m.hor); skyUni.uGlow.value.copy(m.glowC); skyUni.uCloudCol.value.copy(m.cloudC);
  skyUni.uGlowDir.value.copy(m.glowDir); skyUni.uStars.value = m.stars; skyUni.uMoon.value = m.moon; skyUni.uCloud.value = m.cloud;
  sun.color.copy(m.sunC); sun.intensity = m.sunI; sun.position.copy(sun.target.position).addScaledVector(m.sunDir, 420);
  hemi.color.copy(m.hemiS); hemi.groundColor.copy(m.hemiG); hemi.intensity = m.hemiI;
  scene.environmentIntensity = m.env;
  scene.fog.color.copy(m.fog); scene.fog.near = m.near; scene.fog.far = m.far;
  U.fogColor.value.copy(m.fog); U.fogNear.value = m.near; U.fogFar.value = m.far;
  U.lamp.value = m.lamp; U.glow.value = m.glow;
  if (waterUni) { waterUni.uDeep.value.copy(m.deep); waterUni.uShallow.value.copy(m.shallow); waterUni.uRipple.value = m.ripple; waterUni.uRain.value = m.rain; }
  if (fallUni) fallUni.uBright.value = m.fall;
  if (flies) flies.material.uniforms.uInt.value = m.flies;
  if (rain) { rainUni.uRain.value = m.rain; rain.visible = m.rain > 0.01; }
  for (const pl of pLights) pl.intensity = pl.userData.base * m.pl;
  renderer.toneMappingExposure = m.exp;
  if (bloom) bloom.strength = m.bloom;
}
function setMood(name) {
  moodFrom = {}; for (const k in mood) moodFrom[k] = mood[k] && mood[k].clone ? mood[k].clone() : mood[k];
  moodTo = MOODS[name]; moodT = CALM ? 0.999 : 0;
}
let shadowTick = 0;
function stepMood(dt) {
  if (moodT >= 1) return;
  moodT = Math.min(1, moodT + dt / 2.4);
  const e = moodT < 0.5 ? 2 * moodT * moodT : 1 - Math.pow(-2 * moodT + 2, 2) / 2;
  for (const k in mood) {
    const a = moodFrom[k], b = moodTo[k];
    if (a && a.isColor) mood[k].lerpColors(a, b, e); else if (a && a.isVector3) mood[k].lerpVectors(a, b, e).normalize(); else mood[k] = lerp(a, b, e);
  }
  applyMood();
  if (++shadowTick % 4 === 0 || moodT >= 1) renderer.shadowMap.needsUpdate = true;
  if (moodT >= 1) refreshEnv();
}

// ---------- прокрутка, камера, кадр ----------
let lenis = null, anchors = [[0, 0]];
const secs = ['#menu', '#ceremony', '#reserve'].map(s => $(s));
function measure() {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const mid = el => { const p = el.querySelector('.panel'), r = p.getBoundingClientRect(), y = r.top + scrollY + Math.min(r.height, innerHeight) / 2 - innerHeight / 2; return clamp(TOUCH ? r.top + scrollY - innerHeight * 0.45 : y, 1, max - 1); };
  anchors = [[0, 0], [mid(secs[0]), 2], [mid(secs[1]), 4], [mid(secs[2]), 6], [max, 7]];
  for (let i = 1; i < anchors.length; i++) if (anchors[i][0] <= anchors[i - 1][0]) anchors[i][0] = anchors[i - 1][0] + 1;
}
function camK(y) {
  for (let i = 0; i < anchors.length - 1; i++) {
    const [ya, ka] = anchors[i], [yb, kb] = anchors[i + 1];
    if (y <= yb) { const f = clamp((y - ya) / (yb - ya), 0, 1); return lerp(ka, kb, f * f * (3 - 2 * f)); }
  }
  return anchors[anchors.length - 1][1];
}
function goTo(id) {
  const i = { menu: 1, ceremony: 2, reserve: 3 }[id], y = i ? anchors[i][0] : 0;
  if (lenis) lenis.scrollTo(y, { duration: 2.4 }); else scrollTo({ top: y, behavior: CALM ? 'auto' : 'smooth' });
}

function degrade() {
  const minDpr = HQ ? 0.8 : 0.65;
  if (dpr > minDpr + 0.01) { dpr = Math.max(minDpr, dpr * 0.85); resize(); return; }
  if (level === 0) { Q.reflEvery = 2; level++; return; }
  if (level === 1) { bloom.enabled = false; level++; return; }
  if (level === 2) { for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = 0; rt.dispose(); } level++; }
}
function resize() {
  const w = innerWidth, h = innerHeight, asp = w / h;
  camera.aspect = asp;
  camera.fov = asp < 1 ? Math.min(72, 46 / Math.sqrt(asp)) : 46;
  camera.updateProjectionMatrix();
  if (!renderer) return;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr); composer.setSize(w, h);
  const rw = Math.max(256, Math.round(w * dpr * Q.refl)), rh = Math.max(256, Math.round(h * dpr * Q.refl));
  if (water) water.getRenderTarget().setSize(rw, rh);
  if (flies) flies.material.uniforms.uPx.value = h * dpr / 900;
  measure();
}
let dpr = Math.min(devicePixelRatio || 1, Q.dpr);
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.tx = e.clientX / innerWidth * 2 - 1; mouse.ty = e.clientY / innerHeight * 2 - 1; } });

const vp = new THREE.Vector3(), vt = new THREE.Vector3(), dm = new THREE.Object3D(), fwd = new THREE.Vector3();
const topBar = $('.top'); let topSolid = false;
let T = 0, last = performance.now(), slowFrames = 0, ema = 16, frameNo = 0, level = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  T += dt; U.time.value = T; frameNo++;
  if (lenis) lenis.raf(now);
  const ys = lenis ? lenis.animatedScroll : scrollY;
  const solid = ys > innerHeight * 0.6; if (solid !== topSolid) { topSolid = solid; topBar.classList.toggle('solid', solid); }
  const k = camK(ys), u = k / (KEYS.length - 1);
  posCurve.getPoint(u, vp); tgtCurve.getPoint(u, vt);
  const fl = CALM ? 0 : 1, hero = 1 - clamp(k, 0, 1) * 0.6;
  mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
  vp.x += (Math.sin(T * 0.23) * 5.2 * hero + Math.sin(T * 0.07) * 1.2) * fl; vp.y += Math.sin(T * 0.21) * 0.9 * fl; vp.z += (-Math.sin(T * 0.157) * 6 + Math.cos(T * 0.13) * 1.2) * hero * fl;
  vt.x += (Math.sin(T * 0.13) * 2.4 + Math.sin(T * 0.2) * 5 * hero) * fl + mouse.x * 3; vt.y += Math.cos(T * 0.09) * 0.5 * fl - mouse.y * 1.5;
  camera.position.copy(vp); camera.lookAt(vt);
  const i0 = Math.floor(k), f = k - i0, A = KEYS[i0], B = KEYS[Math.min(i0 + 1, KEYS.length - 1)];
  const sx = TOUCH ? 0 : lerp(A.sx, B.sx, f), sy = TOUCH ? lerp(A.sy, B.sy, f) : 0;
  camera.setViewOffset(innerWidth, innerHeight, sx * innerWidth, sy * innerHeight, innerWidth, innerHeight);

  stepMood(dt);
  // лепестки: коробка перед камерой, ветер
  camera.getWorldDirection(fwd);
  const cx = vp.x + fwd.x * 18, cy = vp.y - 4, cz = vp.z + fwd.z * 18;
  petalState.forEach((s, i) => {
    s.p.y -= s.f * dt; s.p.x += (0.9 + Math.sin(T * 0.7 + s.ph) * 0.6) * dt; s.p.z += (0.35 + Math.cos(T * 0.5 + s.ph) * 0.4) * dt;
    const wx = s.p.x + cx, wy = s.p.y + cy, wz = s.p.z + cz;
    const rel = [wx - cx, wy - cy, wz - cz];
    if (rel[0] > 25) s.p.x -= 50; if (rel[0] < -25) s.p.x += 50; if (rel[2] > 25) s.p.z -= 50; if (rel[2] < -25) s.p.z += 50;
    if (wy < Math.max(WL, cy - 14)) s.p.y += 26;
    s.r.x += dt * 1.3 * s.s; s.r.y += dt * 0.8; s.r.z += dt * 0.6 * s.s;
    dm.position.set(s.p.x + cx, s.p.y + cy, s.p.z + cz); dm.rotation.copy(s.r); dm.scale.setScalar(s.s); dm.updateMatrix(); petals.setMatrixAt(i, dm.matrix);
  });
  petals.instanceMatrix.needsUpdate = true;
  floatState.forEach((s, i) => {
    if (s.pond) { s.a += s.w * dt; dm.position.set(PX + Math.cos(s.a) * PRX * s.r, WL + 0.02, PZ + Math.sin(s.a) * PRZ * s.r); }
    else { s.z += s.v * dt; if (s.z > Z1 - 2) s.z = PZ + PRZ; dm.position.set(riverX(s.z) + s.o * riverW(s.z), WL + 0.02, s.z); }
    dm.rotation.set(0, s.rot + T * 0.05, 0); dm.scale.setScalar(1); dm.updateMatrix(); floaters.setMatrixAt(i, dm.matrix);
  });
  floaters.instanceMatrix.needsUpdate = true;
  lfState.forEach((s, i) => {
    s.a += s.w * dt;
    dm.position.set(PX + Math.cos(s.a) * PRX * s.r * 0.9, WL - 0.05 + Math.sin(T * 1.3 + s.ph) * 0.03, PZ + Math.sin(s.a) * PRZ * s.r * 0.9);
    dm.rotation.set(Math.sin(T + s.ph) * 0.04, s.ph + s.a * 0.3, 0); dm.updateMatrix(); lanternsFloat.setMatrixAt(i, dm.matrix);
  });
  lanternsFloat.instanceMatrix.needsUpdate = true;
  koiState.forEach((s, i) => {
    s.a += s.w * dt * 0.5;
    const x = s.cx + Math.cos(s.a) * s.r, z = s.cz + Math.sin(s.a) * s.r * 0.7;
    kois[i].position.set(x, WL - 0.32, z);
    kois[i].rotation.y = Math.atan2(-Math.sin(s.a) * Math.sign(s.w), Math.cos(s.a) * 0.7 * Math.sign(s.w)) + Math.sin(T * 6 + i) * 0.12;
  });
  rainUni.uCam.value.copy(vp);

  renderer.info.reset();
  composer.render(dt);

  // держим 60 к/с: при долгих кадрах по шагу снимаем качество — пиксели, отражение через кадр, свечение, сглаживание
  if (T > 3 && !document.hidden) {
    ema = ema * 0.95 + dt * 1000 * 0.05;
    if (ema > 19.5) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 45) { slowFrames = 0; ema = 16; degrade(); }
  }
}
window.__at = i => { const y = anchors[Math.min(i, anchors.length - 1)][0]; if (lenis) lenis.scrollTo(y, { immediate: true }); else scrollTo(0, y); };
window.__stats = () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, dpr, geos: renderer.info.memory.geometries });

// ---------- интерфейс ----------
function splitWords(el, step) {
  let i = 0;
  const wrap = t => t.split(/(\s+)/).map(w => !w || /^\s+$/.test(w) ? w : `<span class="w"><span style="transition-delay:${(i++) * step}ms">${w}</span></span>`).join('');
  el.innerHTML = [...el.childNodes].map(n => n.nodeType === 3 ? wrap(n.textContent) : n.tagName === 'A' ? n.outerHTML : `<${n.tagName.toLowerCase()}>${wrap(n.textContent)}</${n.tagName.toLowerCase()}>`).join('');
}
document.querySelectorAll('.sw').forEach(el => splitWords(el, 60));
document.querySelectorAll('.lead, .panel > p:not(.eyebrow), .steps p, .courses p, .note, footer div').forEach(el => { el.classList.add('sw', 'sp'); splitWords(el, 9); });
document.querySelectorAll('.panel').forEach(p => p.querySelectorAll('.li').forEach((li, i) => { li.style.transitionDelay = 200 + i * 70 + 'ms'; }));
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
function revealAll() { document.querySelectorAll('.rv, .sw').forEach(el => { if (el.closest('.hero')) setTimeout(() => el.classList.add('in'), 150); else io.observe(el); }); }

document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  if (a.dataset.seat) { const r = document.querySelector(`input[name=seat][value=${a.dataset.seat}]`); if (r) r.checked = true; }
  goTo(a.dataset.go);
}));
document.querySelectorAll('[data-mood]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-mood]').forEach(x => x.setAttribute('aria-pressed', x === b));
  if (renderer) setMood(b.dataset.mood);
}));
const form = $('#book'), sent = form.querySelector('.sent'), dateIn = form.elements.date;
dateIn.min = new Date().toISOString().slice(0, 10);
form.addEventListener('submit', e => {
  e.preventDefault();
  const miss = ['date', 'name', 'email'].filter(n => !form.elements[n].value.trim() || (n === 'email' && !form.elements.email.checkValidity()));
  if (miss.length) { sent.textContent = 'Please add ' + miss.join(', ') + '.'; form.elements[miss[0]].focus(); return; }
  sent.textContent = `Thank you, ${form.elements.name.value.trim().split(' ')[0]}. This is a concept site, so nothing was sent — on a live site the request would go straight to the restaurant's booking book.`;
});

async function start() {
  if (!CALM) { lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9 }); window.__lenis = lenis; }
  if (!renderer) { revealAll(); measure(); return; }
  try {
    initPost();
    applyMood();
    await build();
    applyMood();
    resize();
    refreshEnv();
    renderer.shadowMap.needsUpdate = true;
    addEventListener('resize', resize);
    requestAnimationFrame(t => { last = t; frame(t); $('#load').classList.add('off'); revealAll(); });
  } catch (err) {
    console.warn(err);
    document.documentElement.classList.add('nogl'); $('#load').classList.add('off'); revealAll();
  }
}
start();
