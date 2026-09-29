import * as THREE from 'three';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';

// Hero: the Pad & Pixel mark built from 3D voxels. It holds with a ripple, bursts towards the viewer
// and rebuilds left to right into the practice numbers from padandpixel.com/mock-reviews.
const cv = document.getElementById('px');
const stage = document.querySelector('.hero-stage');
const cap = document.querySelector('.cap');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SHAPES = [
  {k: 'mark', t: 'Pad & Pixel, LLC', s: 'Consulting and writing, for tech and video games'},
  {k: '50+', t: 'Vetted reviewers', s: 'Working and former games critics on the bench'},
  {k: '13', t: 'Genre clusters covered', s: 'Critics picked for genre expertise, region and generation'},
  {k: '8', t: 'Countries represented', s: 'Every engagement runs under NDA'}
];
const HEX = {d: '#2a3d78', b: '#2b7cff', r: '#ff3946', w: '#f1f3ff'};
const HOLD = 3000, BURST = 750;

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance'});
} catch (e) {
  renderer = null;
}
if (renderer) start();
else {
  // no WebGL: a fresh canvas for the flat pixel version from main.js
  cv.replaceWith(cv.cloneNode());
  window.startPixelHero2D && window.startPixelHero2D();
}

// Target cells of a shape, sampled from an offscreen 2D drawing (same geometry as the flat version).
function sample(k, w, h, cell) {
  const oc = document.createElement('canvas');
  oc.width = w; oc.height = h;
  const o = oc.getContext('2d', {willReadFrequently: true});
  if (k === 'mark') {
    const u = Math.min(w, h) / 3 * .96, x = (w - 3 * u) / 2, y = (h - 3 * u) / 2;
    o.fillStyle = HEX.w;
    o.fillRect(x, y, u + 1, u);
    o.beginPath(); o.roundRect(x + u, y, 2 * u, 2 * u, [0, .78 * u, .78 * u, 0]); o.fill();
    o.fillStyle = HEX.b;
    o.beginPath(); o.moveTo(x, y + u); o.lineTo(x + u, y + u); o.lineTo(x + u, y + 2 * u); o.closePath(); o.fill();
    o.fillStyle = HEX.r;
    o.fillRect(x, y + 2 * u, u, u);
  } else {
    const parts = k.endsWith('+') ? [[k.slice(0, -1), HEX.w], ['+', HEX.r]] : [[k, HEX.w]];
    const font = fs => { o.font = `800 ${fs}px Archivo, sans-serif`; if ('fontStretch' in o) o.fontStretch = 'expanded'; };
    let fs = h * .92;
    font(fs);
    const width = () => parts.reduce((a, p) => a + o.measureText(p[0]).width, 0);
    if (width() > w * .94) { fs *= w * .94 / width(); font(fs); }
    let x = (w - width()) / 2;
    o.textBaseline = 'middle';
    for (const [s, c] of parts) { o.fillStyle = c; o.fillText(s, x, h / 2 + fs * .04); x += o.measureText(s).width; }
  }
  const d = o.getImageData(0, 0, w, h).data, out = [];
  for (let y = cell / 2; y < h; y += cell) for (let x = cell / 2; x < w; x += cell) {
    const i = ((y | 0) * w + (x | 0)) * 4;
    if (d[i + 3] < 128) continue;
    out.push({x, y, c: d[i] < 150 ? 'b' : d[i + 1] < 150 ? 'r' : 'w'});
  }
  return out;
}

function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping;   // keeps the brand red and blue saturated
  renderer.toneMappingExposure = 1;
  renderer.debug.checkShaderErrors = false;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c1631, 175, 340);   // background voxels sink into the navy
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(26, 1, 1, 800);
  camera.position.z = 160;
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-60, 90, 120);
  const rim = new THREE.DirectionalLight(0x2b7cff, 2.2);
  rim.position.set(90, -30, -60);
  scene.add(key, rim);
  const group = new THREE.Group();
  scene.add(group);
  const geo = new RoundedBoxGeometry(1, 1, 1, 2, .14);
  const mat = new THREE.MeshStandardMaterial({roughness: .3, metalness: .12});
  const COL = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, new THREE.Color(v)]));
  const dummy = new THREE.Object3D();
  const ptr = {x: 0, y: 0, tx: 0, ty: 0, wx: 1e4, wy: 1e4};

  let mesh = null, N = 0, pos, vel, tgt, rot, spin, dly, shape, ph, scl;
  let W = 0, H = 0, wpp = 1, cellW = 1, area = {w: 1, h: 1}, targets = [], si = 0, phase = 'wait', t0 = 0, on = true;

  function build(n) {
    if (mesh && N === n) return;
    if (mesh) { group.remove(mesh); mesh.dispose(); }
    N = n;
    mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    pos = new Float32Array(N * 3); vel = new Float32Array(N * 3); tgt = new Float32Array(N * 3);
    rot = new Float32Array(N * 2); spin = new Float32Array(N * 2);
    dly = new Float32Array(N); shape = new Uint8Array(N); ph = new Float32Array(N); scl = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - .5) * area.w * 1.6;
      pos[i * 3 + 1] = (Math.random() - .5) * area.h * 1.6;
      pos[i * 3 + 2] = -120 - Math.random() * 260;
      tgt.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], i * 3);
      rot[i * 2] = Math.random() * 6; rot[i * 2 + 1] = Math.random() * 6;
      spin[i * 2] = (Math.random() - .5) * .04; spin[i * 2 + 1] = (Math.random() - .5) * .04;
      ph[i] = Math.random() * 6.3; scl[i] = .45 + Math.random() * .3;
      mesh.setColorAt(i, COL.d);
    }
  }

  function assign() {
    const T = targets[si], idx = Array.from({length: N}, (_, i) => i);
    for (let i = N - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let minX = Infinity, maxX = -Infinity;
    for (const t of T) { if (t.x < minX) minX = t.x; if (t.x > maxX) maxX = t.x; }
    idx.forEach((i, n) => {
      if (n < T.length) {
        const t = T[n];
        tgt[i * 3] = t.x; tgt[i * 3 + 1] = t.y; tgt[i * 3 + 2] = t.z;
        shape[i] = 1; scl[i] = 1;
        dly[i] = (t.x - minX) / (maxX - minX || 1) * .55 + Math.random() * .12;   // rebuilds left to right, like a scanline
        mesh.setColorAt(i, COL[t.c]);
      } else {
        shape[i] = 0; scl[i] = .35 + Math.random() * .3;
        tgt[i * 3] = (Math.random() - .5) * area.w * 1.3 - group.position.x;
        tgt[i * 3 + 1] = (Math.random() - .5) * area.h * 1.3 - group.position.y;
        tgt[i * 3 + 2] = -40 - Math.random() * 150;
        mesh.setColorAt(i, COL.d);
      }
    });
    mesh.instanceColor.needsUpdate = true;
    phase = 'hold'; t0 = performance.now();
  }

  function layout() {
    const r = cv.getBoundingClientRect(), s = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    wpp = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z / H;
    area = {w: W * wpp, h: H * wpp};
    const bw = Math.round(s.width), bh = Math.round(Math.max(80, s.height - cap.offsetHeight - 24));
    const cell = Math.max(9, Math.round(Math.min(bw, bh) / 23));
    cellW = cell * wpp;
    group.position.set((s.left - r.left + bw / 2 - W / 2) * wpp, -(s.top - r.top + bh / 2 - H / 2) * wpp, 0);
    targets = SHAPES.map(sh => sample(sh.k, bw, bh, cell).map(p => ({
      x: (p.x - bw / 2) * wpp, y: -(p.y - bh / 2) * wpp,
      z: p.c === 'b' ? cellW * .6 : p.c === 'r' ? cellW * 1.2 : 0, c: p.c
    })));
    build(Math.max(...targets.map(t => t.length)) + (W < 700 ? 30 : 70));
    if (phase !== 'wait') assign();
  }

  function caption() {
    cap.classList.add('swap');
    setTimeout(() => {
      cap.querySelector('strong').textContent = SHAPES[si].t;
      cap.querySelector('.s').textContent = SHAPES[si].s;
      cap.querySelector('.idx').textContent = `0${si + 1} / 0${SHAPES.length}`;
      cap.classList.remove('swap');
    }, 320);
  }

  function burst() {
    for (let i = 0; i < N; i++) {
      if (!shape[i]) continue;
      const o = i * 3, x = pos[o], y = pos[o + 1], d = Math.hypot(x, y) || 1, f = cellW * (.35 + Math.random() * .9);
      vel[o] += x / d * f; vel[o + 1] += y / d * f; vel[o + 2] += cellW * (.3 + Math.random() * 1.4);
      spin[i * 2] = (Math.random() - .5) * .3; spin[i * 2 + 1] = (Math.random() - .5) * .3;
    }
    phase = 'burst'; t0 = performance.now();
  }

  function frame(now) {
    const t = now / 1000, el = now - t0, since = el / 1000;
    if (phase === 'hold' && el > HOLD) burst();
    else if (phase === 'burst' && el > BURST) { si = (si + 1) % SHAPES.length; assign(); caption(); }
    cap.style.setProperty('--t', phase === 'hold' ? Math.min(1, el / HOLD).toFixed(3) : 1);
    ptr.x += (ptr.tx - ptr.x) * .06; ptr.y += (ptr.ty - ptr.y) * .06;
    group.rotation.y = Math.sin(t * .45) * .3 + ptr.x * .35;
    group.rotation.x = Math.sin(t * .31) * .1 - ptr.y * .22;
    const R2 = (cellW * 4.5) ** 2;
    for (let i = 0; i < N; i++) {
      const o = i * 3, r = i * 2;
      if (shape[i] && (phase === 'burst' || since < dly[i])) {
        vel[o] *= .92; vel[o + 1] *= .92; vel[o + 2] *= .92;
        rot[r] += spin[r]; rot[r + 1] += spin[r + 1];
      } else if (shape[i]) {
        let tz = tgt[o + 2] + Math.sin(t * 2.2 + (tgt[o] + tgt[o + 1]) / cellW * .42) * cellW * .3;
        const dx = pos[o] - ptr.wx, dy = pos[o + 1] - ptr.wy, d2 = dx * dx + dy * dy;
        if (d2 < R2) tz += (1 - d2 / R2) * cellW * 2.4;   // voxels under the cursor lift towards you
        vel[o] = (vel[o] + (tgt[o] - pos[o]) * .085) * .76;
        vel[o + 1] = (vel[o + 1] + (tgt[o + 1] - pos[o + 1]) * .085) * .76;
        vel[o + 2] = (vel[o + 2] + (tz - pos[o + 2]) * .085) * .76;
        rot[r] *= .86; rot[r + 1] *= .86;
      } else {
        tgt[o + 1] += cellW * .012;
        if (tgt[o + 1] - pos[o + 1] > 1) tgt[o + 1] = pos[o + 1] + 1;
        if (pos[o + 1] > area.h * .9 - group.position.y) { pos[o + 1] = tgt[o + 1] = -area.h * .9 - group.position.y; }
        vel[o] = (vel[o] + (tgt[o] + Math.sin(t * .4 + ph[i]) * cellW - pos[o]) * .01) * .9;
        vel[o + 1] = (vel[o + 1] + (tgt[o + 1] - pos[o + 1]) * .01) * .9;
        vel[o + 2] = (vel[o + 2] + (tgt[o + 2] - pos[o + 2]) * .01) * .9;
        rot[r] += .004 + spin[r] * .2; rot[r + 1] += .006 + spin[r + 1] * .2;
      }
      pos[o] += vel[o]; pos[o + 1] += vel[o + 1]; pos[o + 2] += vel[o + 2];
      dummy.position.set(pos[o], pos[o + 1], pos[o + 2]);
      dummy.rotation.set(rot[r], rot[r + 1], 0);
      dummy.scale.setScalar(cellW * .86 * scl[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (on && !document.hidden) frame(now);
  }

  const hero = cv.parentElement;
  hero.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect();
    ptr.tx = (e.clientX - r.left) / r.width * 2 - 1;
    ptr.ty = (e.clientY - r.top) / r.height * 2 - 1;
    ptr.wx = (e.clientX - r.left - W / 2) * wpp - group.position.x;
    ptr.wy = -(e.clientY - r.top - H / 2) * wpp - group.position.y;
  });
  hero.addEventListener('pointerleave', () => { ptr.tx = ptr.ty = 0; ptr.wx = ptr.wy = 1e4; });
  new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(cv);
  let lastW = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === lastW) return;
    lastW = innerWidth;
    clearTimeout(layout.t);
    layout.t = setTimeout(layout, 200);
  });

  const fonts = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]);
  fonts.then(() => {
    layout();
    if (reduced) {
      assign();
      for (let i = 0; i < N * 3; i++) pos[i] = tgt[i];
      dly.fill(0);
      rot.fill(0);
      frame(performance.now());
      return;
    }
    // the mark flies in from the depth once the intro lifts
    const go = () => { if (phase === 'wait') assign(); };
    if (document.querySelector('.intro')) addEventListener('intro:done', go, {once: true});
    else setTimeout(go, 300);
    setTimeout(go, 3500);
    requestAnimationFrame(loop);
  });
}
