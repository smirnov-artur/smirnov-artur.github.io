// ТРИ НЕБА — сцена: жилой квартал у реки. Вечер, окна загораются; прокрутка облетает башни, спускается во двор,
// поднимается на верхний этаж, режет квартал до паркинга; этаж выбирается прямо на башне; день и вечер одной кнопкой.
// Всё собрано кодом, готовых моделей нет. Время берём только из requestAnimationFrame: так сайт одинаково идёт
// и в браузере, и при записи кадр за кадром.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import Lenis from 'lenis';

const Q = new URLSearchParams(location.search);
const TOUCH = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const HQ = !TOUCH || Q.has('hq');          // ?hq — полное качество на телефоне (запись ролика)
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
let seed = 11;   // свой генератор: квартал одинаковый при каждой загрузке и в ролике
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const f1 = x => x.toFixed(1);

/* ---------- рендер ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, powerPreference: 'high-performance' });
let dpr = Math.min(devicePixelRatio, HQ ? 2 : 1.5);
renderer.setPixelRatio(dpr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.debug.checkShaderErrors = Q.has('debug');   // D3D на Windows сыплет предупреждениями о константах three.js
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0, 0.0005);
const camera = new THREE.PerspectiveCamera(30, 1, 2, 7000);

/* ---------- квартал: размеры ---------- */
const FH = 3.3, PODH = 2 * FH, FX = 56, FZ = 42;      // этаж, стилобат в 2 этажа, пятно квартала (под ним паркинг)
const TOW = [
  { n: 'Корпус 1', x: -44, z: -30, w: 22, d: 22, f: 31 },
  { n: 'Корпус 2', x: 18, z: -30, w: 22, d: 24, f: 38 },
  { n: 'Корпус 3', x: 44, z: 20, w: 20, d: 22, f: 45 },
];

/* ---------- общие uniform и куски шейдеров ---------- */
const G = {
  uLit: { value: 1 }, uOn: { value: 0 }, uStreet: { value: 0 }, uT: { value: 0 }, uCut: { value: 1e4 },
  uHi: { value: new THREE.Vector3(-9, 0, 0) }, uSel: { value: new THREE.Vector3(-9, 0, 0) }, uFocus: { value: 0 },
};
const GL = `
uniform float uLit, uOn, uStreet, uT, uCut, uFocus; uniform vec3 uHi, uSel;
varying vec3 vWP;
float h1(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
// полоса [a,b] периодической координаты, сглаженная по размеру пикселя: вдали окна не мерцают, а сливаются в средний тон
float pI(float x, float a, float b){ return floor(x) * (b - a) + clamp(fract(x) - a, 0.0, b - a); }
float fp(float x, float a, float b){ float w = max(fwidth(x), 1e-4); return (pI(x + w * 0.5, a, b) - pI(x - w * 0.5, a, b)) / w; }
float inFoot(){ return step(abs(vWP.x), ${f1(FX + 1.5)}) * step(abs(vWP.z), ${f1(FZ + 1.5)}); }
`;
// cut — разрез квартала плоскостью y = uCut (раздел «Паркинг»), fill — цвет среза для изнанки стен
function patch(mat, key, { vh = '', vm = '', fh = '', col = '', pbr = '', nrm = '', emi = '', cut = false, glow = true, fill = '' } = {}) {
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, G);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\n' + vh)
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 wp4 = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wp4 = instanceMatrix * wp4;
#endif
vWP = (modelMatrix * wp4).xyz;
${vm}`);
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GL + fh);
    if (cut) f = f.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vWP.y > uCut && inFoot() > 0.5) discard;');
    if (col) f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + col);
    if (pbr) f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + pbr);
    if (nrm) f = f.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + nrm);
    const cg = cut && glow ? 'if (uCut < 999.0) totalEmissiveRadiance += vec3(0.45, 0.85, 1.0) * exp(-abs(vWP.y - uCut) * 1.4) * 3.0 * inFoot();' : '';
    if (emi || cg) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + emi + '\n' + cg);
    if (fill) f = f.replace('#include <opaque_fragment>', `#include <opaque_fragment>\nif (!gl_FrontFacing) gl_FragColor = vec4(${fill}, 1.0);`);
    sh.fragmentShader = f;
  };
  return mat;
}
// тень от разрезанного квартала тоже режется
const cutDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'cutDepth', { cut: true, glow: false });

/* ---------- фасады: стекло в пол, простенки, плиты перекрытий, корона ---------- */
// aKind: 0 стекло башни, 1 камень (плиты, пилоны, стены паркинга), 2 корона, 4 стилобат с витринами
const towerMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, shadowSide: THREE.BackSide }), 'tower', {
  vh: 'attribute float aKind, aTower; varying vec3 vP, vN; varying float vK, vT;',
  vm: 'vP = position; vN = normal; vK = aKind; vT = aTower;',
  fh: 'varying vec3 vP, vN; varying float vK, vT;',
  col: `
vec3 N0 = normalize(vN);
float wall = 1.0 - step(0.5, abs(N0.y));
float face = abs(N0.x) > 0.5 ? (N0.x > 0.0 ? 1.0 : 2.0) : (N0.z > 0.0 ? 3.0 : 4.0);
float u = abs(N0.x) > 0.5 ? vP.z * sign(N0.x) : -vP.x * sign(N0.z);
float cw = vK > 3.5 ? 3.0 : 1.5;
float tid = floor(vT + 0.5), gx = u / cw, gy = vP.y / ${f1(FH)};
float fl = floor(gy) + 1.0, room = floor(gx / 4.0);
float isG = wall * (step(vK, 0.5) + step(3.5, vK));
float pane = fp(gx, 0.05, 0.95), pier = fp(gx / 4.0, 0.0, 0.075), band = fp(gy, 0.06, 0.97);
float glass = isG * pane * (1.0 - pier) * band;
float rh = h1(vec3(tid * 7.0 + face, fl, room));
vec3 stone = vec3(0.56, 0.5, 0.43), bronze = vec3(0.08, 0.065, 0.05);
vec3 cc = mix(stone, bronze, isG * (1.0 - pane) * (1.0 - pier));
cc = mix(cc, mix(vec3(0.1, 0.13, 0.16), vec3(0.26, 0.3, 0.34), rh * rh), glass);
if (N0.y > 0.5) cc = vK > 3.5 ? vec3(0.1, 0.16, 0.07) : vec3(0.16, 0.16, 0.17);
float inS = step(abs(tid - uSel.x), 0.1) * step((uSel.y - 1.0) * ${f1(FH)} - 0.2, vP.y) * step(vP.y, uSel.y * ${f1(FH)} + 0.2);
float inH = step(abs(tid - uHi.x), 0.1) * step((uHi.y - 1.0) * ${f1(FH)} - 0.2, vP.y) * step(vP.y, uHi.y * ${f1(FH)} + 0.2);
float hl = max(inH * uHi.z, inS * uSel.z) * step(tid, 8.0);
cc = mix(cc, vec3(0.95, 0.62, 0.24), hl * (1.0 - uLit));
diffuseColor.rgb = cc;`,
  pbr: `roughnessFactor = mix(0.75, 0.05, glass); metalnessFactor = mix(isG * (1.0 - pane) * 0.7, 0.92, glass);`,
  emi: `
float aa = clamp(1.0 - fwidth(gx / 4.0) * 3.0, 0.0, 1.0);
float lh = h1(vec3(tid * 13.1 + face * 1.7, fl * 1.37, room * 3.3 + 0.5));
float pick = step(lh, vK > 3.5 ? (fl < 1.5 ? 0.97 : 0.45) : 0.48);
float dl = 0.3 + fl * 0.028 + fract(lh * 91.7) * 1.5;
float on = mix(0.42 * smoothstep(0.8, 3.2, uOn), pick * smoothstep(dl, dl + 0.06, uOn), aa);
vec3 wc = mix(vec3(1.0, 0.42, 0.13), vec3(1.0, 0.66, 0.36), fract(lh * 37.1));
float inten = (0.5 + 1.1 * fract(lh * 53.3)) * (0.45 + 0.55 * fract(gy));
float dim = 1.0 - uFocus * 0.65 * (1.0 - inS) * step(tid, 8.0);
totalEmissiveRadiance += wc * inten * on * glass * uLit * 2.3 * dim;
totalEmissiveRadiance += vec3(1.0, 0.84, 0.62) * step(1.5, vK) * step(vK, 2.5) * wall * fp(u / 1.1, 0.0, 0.12) * uLit * smoothstep(2.4, 3.2, uOn) * 4.0;
totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(1.0, 0.5, 0.13) * (1.2 + 1.4 * glass) * (0.35 + 0.65 * uLit), hl);`,
  cut: true, fill: 'vec3(0.075, 0.07, 0.068)',
});

function box(w, h, d, x, y, z, k) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(k), 1));
  return g;
}
function tag(g, t) { g.setAttribute('aTower', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(t), 1)); return g; }

const towers = TOW.map((T, i) => {
  const H = T.f * FH, p = 0.5, s = 0.32, parts = [box(T.w, H, T.d, 0, H / 2, 0, 0)];
  for (let k = 3; k < T.f; k++) {            // плиты по периметру: горизонтальный ритм и тени днём
    const y = k * FH;
    parts.push(box(T.w + 2 * p, s, p, 0, y, T.d / 2 + p / 2, 1), box(T.w + 2 * p, s, p, 0, y, -T.d / 2 - p / 2, 1),
      box(p, s, T.d, T.w / 2 + p / 2, y, 0, 1), box(p, s, T.d, -T.w / 2 - p / 2, y, 0, 1));
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(box(1.3, H, 1.3, sx * (T.w / 2 + 0.2), H / 2, sz * (T.d / 2 + 0.2), 1));
  parts.push(box(T.w + 1.2, 5.5, T.d + 1.2, 0, H + 2.75, 0, 2));
  const m = new THREE.Mesh(tag(mergeGeometries(parts), i), towerMat);
  m.position.set(T.x, 0, T.z);
  m.castShadow = m.receiveShadow = true;
  m.customDepthMaterial = cutDepth;
  m.userData.i = i;
  scene.add(m);
  return m;
});

// стилобат: три корпуса по краям двора, юг открыт к реке; ниже земли — стены паркинга и плита двора
{
  const B = [[-56, 56, -42, -26], [-56, -40, -26, 24], [40, 56, -26, 34]];
  const parts = B.map(([x0, x1, z0, z1]) => box(x1 - x0, PODH, z1 - z0, (x0 + x1) / 2, PODH / 2, (z0 + z1) / 2, 4));
  const w = 0.6, top = -0.62, bot = -4.4, hh = top - bot;
  parts.push(box(2 * FX, hh, w, 0, bot + hh / 2, -FZ + w / 2, 1), box(2 * FX, hh, w, 0, bot + hh / 2, FZ - w / 2, 1),
    box(w, hh, 2 * FZ, -FX + w / 2, bot + hh / 2, 0, 1), box(w, hh, 2 * FZ, FX - w / 2, bot + hh / 2, 0, 1),
    box(2 * FX, 0.6, 2 * FZ, 0, -0.32, 0, 1));
  const m = new THREE.Mesh(tag(mergeGeometries(parts), 9), towerMat);
  m.castShadow = m.receiveShadow = true;
  m.customDepthMaterial = cutDepth;
  scene.add(m);
}

/* ---------- двор: сад, дорожки, площадки ---------- */
const LAWNS = [[-28, -12, 10, 11, .3], [-9, -14, 8, 6, -.2], [16, -10, 11, 6, .15], [-28, 14, 10, 12, .1], [6, 14, 10, 8, -.4], [24, 30, 8, 8, .3], [-12, 34, 16, 6, 0], [-30, 36, 8, 5, .2]];
const PATHS = [[[2, 46], [-2, 32], [4, 22], [0, 8], [-4, -3], [0, -17]], [[-40, 3], [-24, 2], [-12, -2], [-4, -3], [10, 1], [24, 3], [36, -2]], [[4, 22], [18, 23], [30, 16]], [[-4, -3], [-18, -20]]];
const inYard = (x, z) => x > -39 && x < 39 && z > -25 && z < 44 && !TOW.some(T => Math.abs(x - T.x) < T.w / 2 + 3 && Math.abs(z - T.z) < T.d / 2 + 3);
const onLawn = (x, z) => LAWNS.some(([cx, cz, rx, rz, r]) => { const c = Math.cos(-r), s = Math.sin(-r), dx = x - cx, dz = z - cz, u = (dx * c - dz * s) / rx, v = (dx * s + dz * c) / rz; return u * u + v * v < 0.8; });
{
  const W = 1024, H = 768, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), kx = W / (2 * FX), kz = H / (2 * FZ), X = x => (x + FX) * kx, Z = z => (z + FZ) * kz;
  g.fillStyle = '#8b867c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},${(rnd() * .05).toFixed(3)})`; g.fillRect(rnd() * W, rnd() * H, 9, 5); }
  LAWNS.forEach(([x, z, rx, rz, r], i) => {
    g.fillStyle = ['#3b5829', '#42602c', '#375226'][i % 3];
    g.beginPath(); g.ellipse(X(x), Z(z), rx * kx, rz * kz, r, 0, 7); g.fill();
  });
  g.strokeStyle = '#a39d91'; g.lineWidth = 3.2 * kx; g.lineCap = g.lineJoin = 'round';
  PATHS.forEach(p => { g.beginPath(); p.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.stroke(); });
  g.fillStyle = '#b5633b'; g.beginPath(); g.arc(X(-16), Z(22), 6 * kx, 0, 7); g.fill();          // детская площадка
  g.strokeStyle = '#e6d9c6'; g.lineWidth = 0.5 * kx; g.beginPath(); g.arc(X(-16), Z(22), 4 * kx, 0, 7); g.stroke();
  g.fillStyle = '#34607f'; g.fillRect(X(12), Z(-22), 14 * kx, 8 * kz);                             // спортплощадка
  g.strokeStyle = '#dfe8ee'; g.lineWidth = 0.35 * kx; g.strokeRect(X(13), Z(-21), 12 * kx, 6 * kz);
  g.fillStyle = '#16303f'; g.beginPath(); g.ellipse(X(20), Z(8), 6 * kx, 3.4 * kz, .2, 0, 7); g.fill(); // пруд
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(2 * FX, 2 * FZ).rotateX(-Math.PI / 2),
    patch(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), 'yard', { cut: true,
      emi: 'totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.72, 0.48) * 0.22 * uLit * uStreet;' }));
  yard.receiveShadow = true;
  scene.add(yard);
}

/* ---------- земля: улицы, фонари, машины; в пятне квартала дыра под паркинг ---------- */
{
  const s = new THREE.Shape([new THREE.Vector2(-3500, -3500), new THREE.Vector2(3500, -3500), new THREE.Vector2(3500, 3500), new THREE.Vector2(-3500, 3500)]);
  s.holes.push(new THREE.Path([new THREE.Vector2(-FX, -FZ), new THREE.Vector2(-FX, FZ), new THREE.Vector2(FX, FZ), new THREE.Vector2(FX, -FZ)]));
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2), patch(new THREE.MeshStandardMaterial({ roughness: 0.92 }), 'ground', {
    col: `
vec2 p = vWP.xz;
float sx = mod(p.x, 170.0) - 85.0, sz = mod(p.y, 170.0) - 85.0;
float ax = abs(sx), az = abs(sz), d = min(ax, az);
float along = ax < az ? p.y : p.x, across = ax < az ? sx : sz;
vec2 bi = floor(p / 170.0 + 0.5);
float road = 1.0 - smoothstep(8.0, 8.6, d), walk = 1.0 - smoothstep(13.0, 13.6, d);
vec3 c = mix(vec3(0.09, 0.11, 0.08), vec3(0.14, 0.14, 0.14), step(0.45, h1(vec3(bi, 1.0))));
float park = step(92.0, p.y) * step(p.y, 141.0) + step(abs(bi.x - 2.0), 0.1) * step(abs(bi.y + 1.0), 0.1);
c = mix(c, vec3(0.07, 0.11, 0.05), clamp(park, 0.0, 1.0));
c = mix(c, vec3(0.34, 0.32, 0.29), step(abs(p.x), 73.0) * step(abs(p.y), 73.0));
c = mix(c, vec3(0.22, 0.22, 0.21), walk);
c = mix(c, vec3(0.06, 0.065, 0.07), road);
c = mix(c, vec3(0.55), road * fp(across / 40.0 + 0.5, 0.497, 0.503) * fp(along / 9.0, 0.0, 0.5) * 0.7);
diffuseColor.rgb = c;`,
    emi: `
float lamp = exp(-(pow(abs(across) - 10.5, 2.0) + pow(mod(along, 32.0) - 16.0, 2.0)) / 7.0);
vec3 em = vec3(1.0, 0.52, 0.2) * (lamp * 0.8 + road * 0.07 + walk * 0.02);
float lane = across, cq = fract((along - uT * sign(lane) * 13.0) / 41.0 + h1(vec3(ax < az ? bi.x : bi.y, 3.0, sign(lane))));
float car = road * step(1.8, abs(lane)) * step(abs(lane), 5.8) * (1.0 - smoothstep(0.0, 0.05, abs(cq - 0.5)));
em += (lane > 0.0 ? vec3(1.0, 0.9, 0.75) : vec3(1.0, 0.1, 0.05)) * car * 1.6 * smoothstep(180.0, 420.0, distance(vWP, cameraPosition));
totalEmissiveRadiance += em * uStreet * uLit;`,
  }));
  ground.receiveShadow = true;
  scene.add(ground);
}

/* ---------- река ---------- */
{
  const water = new THREE.Mesh(new THREE.PlaneGeometry(7000, 190).rotateX(-Math.PI / 2), patch(new THREE.MeshStandardMaterial({ color: 0x0c1822, roughness: 0.07, emissive: 0x0a1a2a, emissiveIntensity: 0.5 }), 'water', {
    nrm: `
vec2 q = vWP.xz * 0.05;
float nx = sin(q.x * 3.1 + uT * 0.9) * 0.5 + sin(q.y * 5.3 - uT * 1.3 + q.x) * 0.3 + sin((q.x + q.y) * 9.0 + uT * 2.0) * 0.2;
float nz = sin(q.y * 2.7 - uT * 0.7) * 0.5 + sin(q.x * 6.1 + uT * 1.1) * 0.3 + sin((q.x - q.y) * 8.0 - uT * 1.7) * 0.2;
normal = normalize(normal + (viewMatrix * vec4(nx, 0.0, nz, 0.0)).xyz * 0.05);`,
  }));
  water.position.set(0, 0.06, 235);
  water.receiveShadow = true;
  scene.add(water);
  const edge = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.8 });
  for (const z of [140.6, 329.4]) { const e = new THREE.Mesh(new THREE.BoxGeometry(7000, 1.2, 1.2), edge); e.position.set(0, 0.6, z); e.receiveShadow = true; scene.add(e); }
}

/* ---------- город вокруг: кварталы-коробки, окна светятся ---------- */
{
  const R = TOUCH ? 5 : 7, list = [];
  const ok = (z, d) => z + d / 2 < 84 || z - d / 2 > 342;
  const add = (x, z, w, d, h) => { if (ok(z, d)) list.push([x, z, w, d, h]); };
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    if ((!i && !j) || (i === 2 && j === -1) || i * i + j * j > R * R + 1) continue;
    const cx = i * 170, cz = j * 170, dd = Math.hypot(i, j), near = dd < 2.5, r = near ? rnd() * 0.42 : rnd();
    if (r < 0.42) {                            // квартал по периметру, двор внутри
      const h = rr(14, near ? 24 : 30), b = rr(12, 16);
      add(cx, cz - 60 + b / 2, 132, b, h); add(cx, cz + 60 - b / 2, 132, b, h * rr(0.8, 1.1));
      add(cx - 60 + b / 2, cz, b, 120 - 2 * b, h); add(cx + 60 - b / 2, cz, b, 120 - 2 * b, h * rr(0.7, 1.2));
    } else if (r < 0.72) {                     // башни
      const n = 2 + (rnd() * 2 | 0);
      for (let k = 0; k < n; k++) add(cx + rr(-40, 40), cz + rr(-40, 40), rr(18, 28), rr(18, 28), rr(35, dd > 4 ? 90 : 60));
    } else {                                   // низкая застройка
      const n = 3 + (rnd() * 3 | 0);
      for (let k = 0; k < n; k++) add(cx + rr(-45, 45), cz + rr(-45, 45), rr(20, 40), rr(16, 34), rr(9, 24));
    }
  }
  const cityMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.82 }), 'city', {
    vh: 'varying vec3 vN, vI;',
    vm: 'vN = normal; vI = vec3(0.0);\n#ifdef USE_INSTANCING\nvI = instanceMatrix[3].xyz;\n#endif',
    fh: 'varying vec3 vN, vI;',
    col: `
vec3 N0 = normalize(vN);
float wall = 1.0 - step(0.5, abs(N0.y));
float u = abs(N0.x) > 0.5 ? vWP.z : vWP.x;
float gx = u / 2.6, gy = vWP.y / 3.1;
float win = wall * fp(gx, 0.22, 0.78) * fp(gy, 0.3, 0.82) * step(1.0, gy);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.07), win * 0.85);
if (N0.y > 0.5) diffuseColor.rgb *= 0.5;`,
    emi: `
float aa = clamp(1.0 - fwidth(gx) * 2.0, 0.0, 1.0);
float lh = h1(vec3(floor(gx / 2.0) + vI.x * 0.37 + N0.x * 11.0, floor(gy), vI.z * 0.37 + N0.z * 7.0));
float on = mix(0.3, step(lh, 0.3), aa);
vec3 wc = mix(vec3(1.0, 0.58, 0.28), vec3(0.8, 0.88, 1.0), step(0.78, fract(lh * 31.0)));
totalEmissiveRadiance += wc * win * on * uLit * uStreet * (0.5 + fract(lh * 57.0)) * 1.5;`,
  });
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cityMat, list.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  list.forEach(([x, z, w, d, h], k) => {
    o.position.set(x, 0, z); o.scale.set(w, h, d); o.updateMatrix(); city.setMatrixAt(k, o.matrix);
    city.setColorAt(k, c.setHSL(rr(0.05, 0.12), rr(0.06, 0.16), rr(0.26, 0.46)));
  });
  city.receiveShadow = true;
  scene.add(city);
}

/* ---------- деревья: во дворе, на набережной, вдоль улиц, в парке ---------- */
const trees = [];
{
  const T = (x, z, r, gold = 0) => trees.push([x, z, r, gold]);
  for (let k = 0; k < 400 && trees.length < 46; k++) { const x = rr(-38, 38), z = rr(-24, 43); if (inYard(x, z) && onLawn(x, z) && Math.hypot(x, z - 38) > 10) T(x, z, rr(2.2, 3.6), rnd() < .2); }
  for (let k = 0; k < (TOUCH ? 90 : 170); k++) T(rr(-900, 900), rr(96, 137), rr(3, 5), rnd() < .25);
  for (let k = 0; k < (TOUCH ? 30 : 60); k++) T(rr(262, 418), rr(-248, -92), rr(3.5, 6), rnd() < .3);
  for (let v = -420; v <= 84; v += 15) for (const x of [-85, 85, -255, 255]) for (const s of [-11, 11]) if (Math.abs(x) < 100 || rnd() < .6) T(x + s, v + rr(-2, 2), rr(2.5, 3.6), rnd() < .15);
  for (let v = -420; v <= 420; v += 15) for (const s of [-11, 11]) T(v + rr(-2, 2), -85 + s, rr(2.5, 3.6), rnd() < .15);
  for (let v = -60; v <= 60; v += 12) { if (Math.abs(v) > 40) T(v, 49, 2.8); T(v, -49, 2.6); }
  for (let v = -36; v <= 36; v += 12) { T(66, v, 2.8); T(-66, v, 2.8); }
  // крона — гроздь из шести шаров: силуэт рваный, как у настоящего дерева, а не мяч
  const blob = (r, x, y, z) => { let b = new THREE.IcosahedronGeometry(r, 1); b.deleteAttribute('normal'); b.deleteAttribute('uv'); b = mergeVertices(b); b.computeVertexNormals(); return b.translate(x, y, z); };
  const g = mergeGeometries([blob(0.62, 0, 0.05, 0), blob(0.48, 0.42, -0.18, 0.12), blob(0.46, -0.38, -0.12, 0.22), blob(0.44, 0.08, -0.2, -0.44),
    blob(0.42, -0.2, 0.42, -0.1), blob(0.38, 0.28, 0.36, 0.2)]);
  const leaf = patch(new THREE.MeshStandardMaterial({ roughness: 0.9 }), 'leaf', { cut: true });
  const bark = patch(new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.9 }), 'bark', { cut: true, glow: false });
  const crowns = new THREE.InstancedMesh(g, leaf, trees.length), trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0), bark, trees.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  trees.forEach(([x, z, r, gold], k) => {
    const th = r * 0.9;
    o.position.set(x, 0, z); o.rotation.y = rnd() * 6; o.scale.set(1, th + r * 0.5, 1); o.updateMatrix(); trunks.setMatrixAt(k, o.matrix);
    o.position.y = th + r * 0.95; o.scale.set(r, r * rr(1.1, 1.4), r); o.updateMatrix(); crowns.setMatrixAt(k, o.matrix);
    crowns.setColorAt(k, gold ? c.setHSL(rr(0.1, 0.13), 0.6, rr(0.3, 0.4)) : c.setHSL(rr(0.22, 0.3), rr(0.35, 0.5), rr(0.17, 0.26)));
  });
  for (const m of [crowns, trunks]) { m.castShadow = m.receiveShadow = true; m.customDepthMaterial = cutDepth; scene.add(m); }
}

/* ---------- фонари: во дворе вдоль дорожек и на набережной ---------- */
const LU = { uLit: G.uLit, uStreet: G.uStreet, uCut: G.uCut, uPx: { value: 1 } };
{
  const pts = [];
  PATHS.forEach(p => {
    for (let i = 1; i < p.length; i++) {
      const [x0, z0] = p[i - 1], [x1, z1] = p[i], L = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
      for (let s = 4; s < L; s += 11) { const x = x0 + (x1 - x0) * s / L + nx * 2.2, z = z0 + (z1 - z0) * s / L + nz * 2.2; if (inYard(x, z)) pts.push([x, z, 4.4]); }
    }
  });
  for (let x = -640; x <= 640; x += 26) pts.push([x, 97, 5]);
  for (let x = -70; x <= 70; x += 20) pts.push([x, 60, 4.5]);
  const n = pts.length, o = new THREE.Object3D();
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 1, 5).translate(0, 0.5, 0),
    patch(new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.6 }), 'pole', { cut: true, glow: false }), n);
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const poolMat = patch(new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0xffa050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }), 'pool', { cut: true });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, n);
  const pos = new Float32Array(n * 3);
  pts.forEach(([x, z, h], k) => {
    o.position.set(x, 0, z); o.scale.set(1, h, 1); o.updateMatrix(); poles.setMatrixAt(k, o.matrix);
    o.position.y = 0.05; o.scale.set(h * 2.4, 1, h * 2.4); o.updateMatrix(); pools.setMatrixAt(k, o.matrix);
    pos.set([x, h + 0.1, z], k * 3);
  });
  poles.castShadow = true; poles.customDepthMaterial = cutDepth;
  pools.renderOrder = 2; pools.userData.mat = poolMat;
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const glows = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms: LU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uPx, uCut; varying float vK;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        vK = (position.y > uCut && abs(position.x) < ${f1(FX)} && abs(position.z) < ${f1(FZ)}) ? 0.0 : 1.0;
        gl_PointSize = max(uPx * 2.2 / -mv.z, 3.0) * vK; }`,
    fragmentShader: `uniform float uLit, uStreet; varying float vK;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = exp(-d * d * 30.0) + exp(-d * 7.0) * 0.25;
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a * uLit * uStreet * vK, 1.0); }`,
  }));
  glows.frustumCulled = false; glows.renderOrder = 3;
  scene.add(poles, pools, glows);
  window.__pools = pools;
}

/* ---------- паркинг под кварталом: виден, только когда квартал разрезан ---------- */
const parking = new THREE.Group();
parking.visible = false;
scene.add(parking);
{
  const ROWS = [], lanes = [];
  let z = -41.4;
  ROWS.push([z, z + 5.2]); z += 5.2; lanes.push([z, z + 6]); z += 6;
  while (z + 10.4 < 41.6) { ROWS.push([z, z + 5.2], [z + 5.2, z + 10.4]); z += 10.4; if (z + 6 < 41.6) { lanes.push([z, z + 6]); z += 6; } }
  const W = 1024, H = 768, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), kx = W / (2 * FX), kz = H / (2 * FZ), X = x => (x + FX) * kx, Z = v => (v + FZ) * kz;
  g.fillStyle = '#26292d'; g.fillRect(0, 0, W, H);
  const B0 = -54.6, BW = 2.6, NB = 42, cars = [];
  g.strokeStyle = 'rgba(235,240,245,.85)'; g.lineWidth = 0.13 * kx;
  ROWS.forEach(([a, b], r) => {
    for (let k = 0; k <= NB; k++) { g.beginPath(); g.moveTo(X(B0 + k * BW), Z(a)); g.lineTo(X(B0 + k * BW), Z(b)); g.stroke(); }
    for (let k = 0; k < NB; k++) {
      if (k % 9 === 4) { g.fillStyle = 'rgba(90,220,140,.55)'; g.fillRect(X(B0 + k * BW) + 2, Z(a) + 2, BW * kx - 4, (b - a) * kz - 4); }
      if (rnd() < 0.72) cars.push([B0 + (k + 0.5) * BW, (a + b) / 2]);
    }
  });
  g.strokeStyle = 'rgba(240,200,90,.7)'; g.setLineDash([2 * kx, 2 * kx]); g.lineWidth = 0.15 * kx;
  lanes.forEach(([a, b]) => { g.beginPath(); g.moveTo(X(-54), Z((a + b) / 2)); g.lineTo(X(54), Z((a + b) / 2)); g.stroke(); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * FX, 2 * FZ).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 }));
  floor.position.y = -4.4; floor.receiveShadow = true;
  const body = new RoundedBoxGeometry(1.85, 0.8, 4.5, 2, 0.3).translate(0, 0.55, 0), cab = new RoundedBoxGeometry(1.6, 0.62, 2.4, 2, 0.25).translate(0, 1.2, -0.25);
  const carM = new THREE.InstancedMesh(mergeGeometries([body, cab]), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.6 }), cars.length);
  const o = new THREE.Object3D(), c = new THREE.Color(), PAL = [0xe9e9ea, 0x111214, 0x8c9096, 0x3b3f45, 0x1d3557, 0x8a1c1c, 0xd9d4c8];
  cars.forEach(([x, v], k) => { o.position.set(x, -4.4, v); o.rotation.y = rnd() < .5 ? 0 : Math.PI; o.updateMatrix(); carM.setMatrixAt(k, o.matrix); carM.setColorAt(k, c.setHex(PAL[(rnd() * PAL.length) | 0])); });
  carM.castShadow = carM.receiveShadow = true;
  const colG = tag(box(0.8, 3.8, 0.8, 0, -2.5, 0, 1), 9), cols = [];
  for (let k = 0; k <= 14; k++) for (const v of [-25.2, -8.8, 7.6, 24]) cols.push([B0 + 3 * k * BW, v]);
  const colM = new THREE.InstancedMesh(colG, towerMat, cols.length);
  cols.forEach(([x, v], k) => { o.position.set(x, 0, v); o.rotation.set(0, 0, 0); o.updateMatrix(); colM.setMatrixAt(k, o.matrix); });
  colM.castShadow = colM.receiveShadow = true; colM.customDepthMaterial = cutDepth;
  parking.add(floor, carM, colM);
}

/* ---------- маршрут до метро и метки на карте (раздел «Локация») ---------- */
const RU = { uT: G.uT, uProg: { value: 0 }, uVis: { value: 0 } };
const pinMat = new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false });
const tags = [...document.querySelectorAll('.tag')].map(el => ({ el, p: new THREE.Vector3(...el.dataset.p.split(',').map(Number)), v: new THREE.Vector3() }));
{
  const P = [[-8, -43], [-8, -85], [-255, -85], [-255, -262], [-300, -262]].map(([x, z]) => new THREE.Vector3(x, 1.4, z));
  const path = new THREE.CurvePath();
  for (let i = 1; i < P.length; i++) path.add(new THREE.LineCurve3(P[i - 1], P[i]));
  const route = new THREE.Mesh(new THREE.TubeGeometry(path, 400, 1.7, 6, false), new THREE.ShaderMaterial({
    uniforms: RU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: 'varying float vX; void main(){ vX = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT, uProg, uVis; varying float vX;
      void main(){ float dash = step(fract(vX * 60.0 - uT * 1.4), 0.55); float a = step(vX, uProg) * uVis * (0.35 + 0.65 * dash);
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.38) * a, 1.0); }`,
  }));
  route.frustumCulled = false; route.renderOrder = 4;
  scene.add(route);
  const pins = tags.slice(0, 4);
  const beam = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.7, 1, 8, 1, true).translate(0, 0.5, 0), pinMat, pins.length);
  const ring = new THREE.InstancedMesh(new THREE.RingGeometry(9, 11.5, 48).rotateX(-Math.PI / 2), pinMat, pins.length);
  const o = new THREE.Object3D();
  pins.forEach((t, k) => {
    o.position.set(t.p.x, 0, t.p.z); o.scale.set(1, t.p.y, 1); o.updateMatrix(); beam.setMatrixAt(k, o.matrix);
    o.position.y = 0.3; o.scale.set(1, 1, 1); o.updateMatrix(); ring.setMatrixAt(k, o.matrix);
  });
  beam.renderOrder = ring.renderOrder = 4;
  scene.add(beam, ring);
}

/* ---------- небо: синий час или день, солнце, облака; у горизонта сходится с туманом ---------- */
const NOISE = `float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uDay: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uFog: { value: new THREE.Color() }, uT: G.uT },
  side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uDay, uT; uniform vec3 uSun, uFog; varying vec3 vD;
    ${NOISE}
    void main(){
      vec3 d = normalize(vD);
      float h = d.y, s = max(dot(d, normalize(uSun)), 0.0);
      vec3 ev = mix(vec3(0.42, 0.22, 0.17), vec3(0.05, 0.065, 0.15), smoothstep(0.0, 0.2, h));
      ev = mix(ev, vec3(0.008, 0.014, 0.042), smoothstep(0.14, 0.6, h));
      ev += vec3(1.0, 0.4, 0.14) * pow(s, 5.0) * (1.0 - smoothstep(0.0, 0.3, h)) * 1.1;
      ev += vec3(1.0, 0.62, 0.32) * (pow(s, 700.0) * 14.0 + pow(s, 60.0) * 0.5);
      vec3 dy = mix(vec3(0.58, 0.7, 0.84), vec3(0.08, 0.22, 0.56), pow(smoothstep(0.0, 0.8, h), 0.6));
      dy += vec3(1.0, 0.95, 0.85) * (pow(s, 1200.0) * 40.0 + pow(s, 10.0) * 0.22);
      vec3 c = mix(ev, dy, uDay);
      vec2 cp = d.xz / (h + 0.12) * 1.3;
      float cl = smoothstep(mix(0.52, 0.6, uDay), 0.88, n3(vec3(cp * 1.4 + uT * 0.004, 0.0)) * 0.65 + n3(vec3(cp * 4.0, 1.0)) * 0.35) * smoothstep(0.03, 0.25, h);
      vec3 clc = mix(vec3(0.16, 0.09, 0.1) + vec3(0.7, 0.28, 0.1) * pow(s, 3.0), vec3(0.95, 0.96, 1.0), uDay);
      c = mix(c, clc, cl * mix(0.55, 0.7, uDay));
      c = mix(uFog, c, smoothstep(-0.01, 0.09, h));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), skyMat);
sky.renderOrder = -1; sky.frustumCulled = false;
scene.add(sky);

/* ---------- солнце и свет: вечер и день ---------- */
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(HQ ? 2048 : 1024);
Object.assign(sun.shadow.camera, { left: -135, right: 135, top: 135, bottom: -135, near: 100, far: 2800 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.25;
scene.add(sun, sun.target);
const FOG = [new THREE.Color().setRGB(0.1, 0.085, 0.11), new THREE.Color().setRGB(0.5, 0.6, 0.72)];
const SUNC = [new THREE.Color().setRGB(1, 0.5, 0.24), new THREE.Color().setRGB(1, 0.95, 0.88)];
function sunDir(d, v = new THREE.Vector3()) {
  const az = mix(-1.15, 0.95, d), el = mix(0.1, 0.8, d);
  return v.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}
// отражения: два окружения из того же неба, между ними переключаемся посреди перехода
const ENV = [0, 1].map(d => {
  const env = new THREE.Scene(), m = new THREE.Mesh(sky.geometry, skyMat.clone());
  m.material.uniforms.uDay.value = d; sunDir(d, m.material.uniforms.uSun.value); m.material.uniforms.uFog.value.copy(FOG[d]);
  env.add(m);
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(env, 0, 1, 7000, { size: HQ ? 256 : 128 }).texture;
  pm.dispose();
  return t;
});

/* ---------- страница: разделы, прокрутка, выбор квартиры ---------- */
const lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9 });
document.querySelectorAll('[data-split]').forEach(el => {
  el.innerHTML = el.textContent.trim().split(/[ \n\t]+/).map((w, i) => `<span class="w"><span style="--i:${i}">${w}</span></span>`).join(' ');
});
const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.2 });
document.querySelectorAll('.card, .book, .pk article, .form').forEach(el => io.observe(el));

// квартиры на этаже: план один на все башни, цены и свободные — из номера корпуса и этажа (демо)
const PLAN = [[0, 0, 80, 90, '2-комн', 63.4], [80, 0, 60, 90, '1-комн', 41.2], [140, 0, 80, 150, '3-комн', 104.7],
  [0, 90, 80, 60, 'Студия', 32.5], [0, 150, 110, 90, '3-комн', 88.6], [110, 150, 110, 90, '2-комн', 71.9]];
const hj = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
const flatsOn = (t, F) => PLAN.map((u, i) => ({ u, free: hj(t * 131 + F * 17.3 + i * 5.1 + 6.66) < 0.5, price: u[5] * (372000 + F * 3000 + t * 14000) * (u[4] === '3-комн' ? 1.06 : 1) }));
const mln = p => (p / 1e6).toFixed(1).replace('.', ',') + ' млн ₽';
const plural = n => n % 10 === 1 && n % 100 !== 11 ? 'квартира' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'квартиры' : 'квартир';
const S = { t: 1, f: 17, picked: false, t0: -1e9 };
const tabBox = $('.tabs'), svg = $('.plan'), res = $('.res');
const tabs = TOW.map((T, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = `${T.n}<small>${T.f} этажей</small>`;
  b.onclick = () => select(i, Math.min(S.f, T.f));
  tabBox.append(b);
  return b;
});
document.querySelectorAll('.fl button').forEach(b => b.onclick = () => select(S.t, clamp(S.f + +b.dataset.s, 3, TOW[S.t].f)));
function renderFlats() {
  $('#fN').textContent = `Этаж ${S.f}`;
  tabs.forEach((b, i) => b.setAttribute('aria-pressed', i === S.t));
  const L = flatsOn(S.t, S.f), fr = L.filter(x => x.free).sort((a, b) => a.price - b.price);
  svg.innerHTML = '<rect class="core" x="80" y="90" width="60" height="60"/>' +
    L.map(({ u, free }) => `<rect class="${S.picked && free ? 'free' : 'sold'}" x="${u[0]}" y="${u[1]}" width="${u[2]}" height="${u[3]}"/>`).join('');
  if (!S.picked) return;
  $('#fC').textContent = fr.length ? `${fr.length} ${plural(fr.length)} в продаже` : 'На этаже всё продано';
  $('#fP').textContent = fr.length ? 'от ' + mln(fr[0].price) : 'соседние этажи ±1';
  $('.lst').innerHTML = fr.map(({ u, price }) => `<li><span>${u[4]} · ${String(u[5]).replace('.', ',')} м²</span><b>${mln(price)}</b></li>`).join('');
  res.classList.remove('flash'); void res.offsetWidth; res.classList.add('flash');
}
function select(t, F) {
  S.t = t; S.f = F; S.picked = true; S.t0 = now;
  renderFlats();
}
renderFlats();

// день и вечер
let day = 0, dayFrom = 0, dayTo = 0, dayT0 = -1e9;
const dn = $('.dn');
dn.querySelectorAll('button').forEach(b => b.onclick = () => {
  const d = +b.dataset.d;
  if (d === dayTo) return;
  dayFrom = day; dayTo = d; dayT0 = now;
  dn.classList.toggle('night', !d);
  dn.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.d === d));
});

$('.form').addEventListener('submit', e => { e.preventDefault(); $('.ok').hidden = false; e.target.reset(); });

const secs = ['loc', 'yard', 'views', 'park', 'flats'].map(id => ({ id, el: document.getElementById(id) }));
let vh = innerHeight, maxY = 1, K = [], tall = false;
// позы камеры: где камера, куда смотрит, сдвиг квартала по экрану (доли ширины и высоты), во сколько раз шире объектив
const POSE = {
  wide: [
    [-176, 50, 356, 2, 70, -8, 0, 0.02],       // герой: с реки, снизу вверх
    [-150, 880, 700, -80, 0, -70, 0.17, 0],    // локация: с высоты, город и река
    [0, 6, 38, 4, 24, -20, -0.17, 0, 2],       // двор: с дорожки, сад и башни над головой
    [47, 131, 40, -51, 118, 109, 0.17, 0, 1.4], // виды: у окна 40 этажа, на реку и закат
    [226, 172, -78, 0, -4, 2, -0.17, 0],       // паркинг: сверху наискосок, квартал разрезан
    [104, 84, -420, 6, 74, 0, 0.18, 0],        // выбор этажа: с севера, три башни в ряд
    [-340, 118, -350, 0, 58, 0, 0, -0.04],     // запись: общий план
  ],
  tall: [
    [-225, 38, 318, 6, 70, -8, 0, 0.06],
    [-240, 1000, 700, -140, 0, -110, 0, 0.2],
    [0, 6, 38, 4, 20, -20, 0, 0.14, 1.5],
    [47, 131, 40, -51, 112, 109, 0, 0.14, 1.2],
    [300, 230, -104, 0, -4, 2, 0, 0.2],
    [124, 80, -520, 8, 76, 0, 0, 0.18],
    [-420, 130, -440, 0, 60, 0, 0, 0.12],
  ],
};
function setFov(z) {
  camera.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * camera.userData.k * z) * 180 / Math.PI;
  camera.updateProjectionMatrix();
}
function layout() {
  vh = innerHeight;
  renderer.setSize(innerWidth, innerHeight, false);
  const asp = innerWidth / innerHeight;
  tall = asp < 0.9;
  const k = tall ? Math.pow(1.6 / asp, 0.32) : 1;
  camera.aspect = asp;
  camera.userData.k = k;
  setFov(1);
  maxY = Math.max(1, document.documentElement.scrollHeight - vh);
  secs.forEach(s => { const r = s.el.getBoundingClientRect(); s.top = r.top + scrollY; s.h = r.height; });
  K = [0, ...secs.map(s => s.top + s.h / 2 - vh / 2), maxY];
}
addEventListener('resize', layout);
layout();

document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  const i = ['#loc', '#yard', '#views', '#park', '#flats'].indexOf(a.getAttribute('href'));
  lenis.scrollTo(i >= 0 ? K[i + 1] : a.getAttribute('href') === '#book' ? maxY : 0, { duration: 2.2 });
}));

/* ---------- курсор, наведение на этаж, нажатие ---------- */
let px = 0, py = 0, cx = -1, cy = -1, lastPtr = -1e9, now = 0, picking = false, hover = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(towers, false)[0];
  if (!h) return null;
  const t = h.object.userData.i, F = Math.floor(h.point.y / FH) + 1;
  return F >= 3 && F <= TOW[t].f ? [t, F] : null;
}
addEventListener('pointermove', e => {
  px = e.clientX / innerWidth * 2 - 1; py = e.clientY / innerHeight * 2 - 1; lastPtr = now;
  if (e.pointerType === 'mouse') { cx = e.clientX; cy = e.clientY; }
}, { passive: true });
const tapEl = $('.tap');
function tapAt(x, y, hit) {
  tapEl.style.left = x + 'px'; tapEl.style.top = y + 'px';
  tapEl.classList.remove('on'); void tapEl.offsetWidth; tapEl.classList.add('on');
  if (hit) select(...hit);
}
addEventListener('click', e => {
  if (!picking || e.target.closest('a, button, input, select, .card, .nav')) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (hit) tapAt(e.clientX, e.clientY, hit);
});
// для ролика: нажать на этаж там, где он сейчас на экране
window.__tapFloor = (t, F) => {
  const T = TOW[t], v = new THREE.Vector3(T.x, (F - 0.5) * FH, T.z);
  v.addScaledVector(camera.position.clone().sub(v).setY(0).normalize(), Math.min(T.w, T.d) / 2).project(camera);
  tapAt((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, [t, F]);
};

/* ---------- вступление ---------- */
let t0 = null, ready = false;
function go() { if (t0 === null && ready) { t0 = now; document.body.classList.add('go'); } }
window.__go = () => { if (ready) go(); return ready; };

/* ---------- кадр ---------- */
const cam = new Float32Array(9), cp = new THREE.Vector3(), tg = new THREE.Vector3(), off = new THREE.Vector3(), sd = new THREE.Vector3(), tmpC = new THREE.Color();
let ys = 0, mx = 0, my = 0, last = null, slow = 0, frames = 0, hudTxt = '', railI = -1, hiA = 0, hiT = [-9, 0], envI = -1;
const hv = $('#hv'), hc = $('#hc'), rail = [...document.querySelectorAll('.rail i')], band = $('.band div'), cards = [...document.querySelectorAll('.card')];
function local(i, y) { const s = secs[i]; return (y - (s.top - vh / 2)) / s.h; }
// камера между позами: вокруг квартала по дуге (угол, радиус, высота), точка взгляда — по прямой
function lerpPose(a, b, f, out) {
  const ra = Math.hypot(a[0], a[2]), rb = Math.hypot(b[0], b[2]);
  const qa = Math.atan2(a[0], a[2]); let qb = Math.atan2(b[0], b[2]);
  while (qb - qa > Math.PI) qb -= 2 * Math.PI;
  while (qb - qa < -Math.PI) qb += 2 * Math.PI;
  const q = mix(qa, qb, f), r = mix(ra, rb, f);
  out[0] = Math.sin(q) * r; out[1] = mix(a[1], b[1], f); out[2] = Math.cos(q) * r;
  for (let j = 3; j < 8; j++) out[j] = mix(a[j], b[j], f);
  out[8] = mix(a[8] || 1, b[8] || 1, f);
}
function frame(t) {
  requestAnimationFrame(frame);
  now = t;
  if (t0 === null && !Q.has('hold')) go();
  const dt = last === null ? 1 / 60 : Math.min((t - last) / 1000, 0.1);
  last = t;
  lenis.raf(t);
  const ti = t0 === null ? 0 : (t - t0) / 1000;
  const T = t / 1000;
  G.uT.value = T; G.uOn.value = ti; G.uStreet.value = sstep(0.8, 2.2, ti);
  if (ti > 1.7) $('.hero').classList.add('in');
  if (ti > 2.6) document.body.classList.add('on');
  document.body.classList.toggle('past', ys > vh * 0.6);

  // день и вечер
  day = mix(dayFrom, dayTo, sstep(0, 1, (t - dayT0) / 1900));
  sunDir(day, sd);
  sun.position.copy(sd).multiplyScalar(900);
  sun.color.lerpColors(SUNC[0], SUNC[1], day);
  sun.intensity = mix(1.2, 3.3, day);
  scene.fog.color.lerpColors(FOG[0], FOG[1], day);
  scene.fog.density = mix(0.00058, 0.00026, day);
  skyMat.uniforms.uDay.value = day; skyMat.uniforms.uSun.value.copy(sd); skyMat.uniforms.uFog.value.copy(scene.fog.color);
  const ei = day < 0.5 ? 0 : 1;
  if (ei !== envI) { envI = ei; scene.environment = ENV[ei]; }
  scene.environmentIntensity = mix(0.42, 1, day) * (0.35 + 0.65 * Math.abs(day * 2 - 1));
  renderer.toneMappingExposure = mix(1.0, 0.78, day);
  G.uLit.value = 1 - day;

  // прокрутка -> поза камеры
  ys += (lenis.animatedScroll - ys) * (1 - Math.exp(-dt * 7));
  const P = POSE[tall ? 'tall' : 'wide'];
  let i = 0; while (i < K.length - 2 && ys > K[i + 1]) i++;
  const f = sstep(0.2, 0.8, (ys - K[i]) / Math.max(1, K[i + 1] - K[i]));
  lerpPose(P[i], P[i + 1], f, cam);

  const auto = t - lastPtr > 2500;
  const tx = auto ? Math.sin(T * 0.4) * 0.5 : px, ty = auto ? Math.sin(T * 0.29) * 0.3 : py;
  mx += (tx - mx) * (1 - Math.exp(-dt * 2.5)); my += (ty - my) * (1 - Math.exp(-dt * 2.5));
  const intro = 1 - Math.pow(1 - clamp(ti / 4.2), 3);
  const drift = CALM ? 0 : Math.sin(T * 0.17) * 0.015;
  tg.set(cam[3], cam[4], cam[5]);
  off.set(cam[0], cam[1], cam[2]).sub(tg).multiplyScalar(1 + 0.45 * (1 - intro));
  off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, mx * 0.035 + drift - 0.3 * (1 - intro));
  off.y -= my * off.length() * 0.02;
  cp.copy(tg).add(off);
  cp.y = Math.max(cp.y, 3);
  camera.position.copy(cp);
  camera.lookAt(tg);
  const W = innerWidth, H = innerHeight;
  setFov(cam[8]);
  LU.uPx.value = renderer.getPixelRatio() * H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  camera.setViewOffset(W, H, -cam[6] * W, cam[7] * H, W, H);
  camera.updateMatrixWorld();

  // локация: маршрут до метро и метки
  const lo = local(0, ys), vis = sstep(0.12, 0.35, lo) * (1 - sstep(0.72, 0.95, lo));
  RU.uVis.value = vis; RU.uProg.value = sstep(0.2, 0.55, lo); pinMat.opacity = vis * 0.5;
  for (const g of tags) {
    g.v.copy(g.p).project(camera);
    const a = g.v.z < 1 ? vis : 0;
    g.el.style.opacity = a.toFixed(3);
    if (a > 0) g.el.style.transform = `translate(${((g.v.x + 1) / 2 * W).toFixed(1)}px,${((1 - g.v.y) / 2 * H).toFixed(1)}px) translate(-50%,-130%)`;
  }

  // паркинг: плоскость разреза идёт сверху вниз до паркинга, на выходе квартал вырастает обратно
  const pl = local(3, ys), cutA = sstep(0.08, 0.5, pl) * (1 - sstep(0.7, 1.08, pl));
  G.uCut.value = cutA > 0 ? mix(160, -0.9, 1 - Math.pow(1 - cutA, 2)) : 1e4;
  parking.visible = G.uCut.value < 2;
  window.__pools.userData.mat.opacity = G.uLit.value * G.uStreet.value * 0.32;

  // выбор этажа: подсветка под курсором, сама бегает по башне, пока никто не трогает
  const fl = local(4, ys);
  G.uFocus.value = S.picked ? sstep(0.1, 0.3, fl) * (1 - sstep(0.85, 1.1, fl)) : 0;
  picking = fl > 0.12 && fl < 0.95;
  document.body.classList.toggle('pick', picking && !!hover);
  hover = picking && !TOUCH && cx >= 0 && t - lastPtr < 2500 ? pickAt(cx, cy) : null;
  let want = hover;
  if (!want && picking && !S.picked) { const k = (Math.sin(T * 0.9) * 0.5 + 0.5); want = [1, Math.round(4 + k * (TOW[1].f - 5))]; }
  if (want) hiT = want;
  hiA += ((want ? 1 : 0) - hiA) * (1 - Math.exp(-dt * 10));
  G.uHi.value.set(hiT[0], hiT[1], hiA);
  G.uSel.value.set(S.t, S.f, S.picked ? (0.8 + 0.2 * Math.sin((t - S.t0) / 180)) * sstep(0, 250, t - S.t0) : 0);

  // телефон: уходящая карточка гаснет, чтобы не закрывать квартал, пока въезжает следующая
  cards.forEach(c => { c.style.opacity = tall ? sstep(vh * 0.5, vh * 0.85, c.getBoundingClientRect().bottom).toFixed(3) : ''; });

  // бегущая строка, рельс, показатели
  band.style.transform = `translate3d(${-((lenis.animatedScroll * 0.35) % (band.offsetWidth / 2))}px,0,0)`;
  const ri = K.reduce((bi, k, j) => Math.abs(k - ys) < Math.abs(K[bi] - ys) ? j : bi, 0);
  if (ri !== railI) { railI = ri; rail.forEach((x, j) => x.classList.toggle('a', j === ri)); }
  const mins = Math.round(mix(19 * 60 + 40, 13 * 60, day)), az = Math.atan2(off.x, off.z), el = Math.asin(clamp(off.y / off.length(), -1, 1));
  const txt = (day > 0.5 ? 'день · ' : 'вечер · ') + String(mins / 60 | 0).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0') + '|' +
    String(Math.round(((az * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0') + '° / ' + String(Math.round(el * 180 / Math.PI)).padStart(2, '0') + '°';
  if (txt !== hudTxt) { hudTxt = txt; const [a, b] = txt.split('|'); hv.textContent = a; hc.textContent = b; }

  // если видеокарта не тянет — меньше пикселей (до двух раз)
  if (t0 !== null && ti > 1 && ti < 6 && slow < 2) {
    frames = dt > 1 / 42 ? frames + 1 : Math.max(0, frames - 1);
    if (frames > 45) { slow++; frames = 0; dpr = Math.max(TOUCH ? 0.85 : 1, dpr * 0.75); renderer.setPixelRatio(dpr); layout(); }
  }
  renderer.render(scene, camera);
}
scene.environment = ENV[0]; envI = 0;
renderer.compile(scene, camera);
ready = true;
$('.load .t i').style.setProperty('--p', 1);
requestAnimationFrame(frame);
