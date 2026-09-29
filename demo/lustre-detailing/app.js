// LUSTRE — сцена: студия с шестигранным светом, машина, полировка по прокрутке.
// Время берём только из requestAnimationFrame: так сайт одинаково идёт и в браузере, и при записи кадр за кадром.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import Lenis from 'lenis';

const Q = new URLSearchParams(location.search);
const TOUCH = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const HQ = !TOUCH || Q.has('hq');          // ?hq — полное качество на телефоне (запись ролика)
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/* ---------- рендер ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, powerPreference: 'high-performance' });
let dpr = Math.min(devicePixelRatio, HQ ? 2 : 1.5);
renderer.setPixelRatio(dpr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.debug.checkShaderErrors = Q.has('debug');   // D3D на Windows сыплет предупреждениями о константах three.js
RectAreaLightUniformsLib.init();
const scene = new THREE.Scene();
scene.environmentIntensity = 0;
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

/* ---------- потолок: соты из светодиодных трубок, как в детейлинг-боксах ---------- */
const HR = 0.8, CEIL = 5.0, cells = [];
for (let c = -3; c <= 3; c++) for (let r = -4; r <= 4; r++) {
  const x = c * 1.5 * HR, z = (r + (c & 1) * 0.5) * Math.sqrt(3) * HR;
  if (Math.abs(z) < 5.3) cells.push({ x, z, d: Math.hypot(x / 3.6, z / 5.3), h: Math.random() });
}
const hexMat = new THREE.ShaderMaterial({
  uniforms: { uGain: { value: 1 } },
  vertexShader: `attribute float aOn; varying vec2 vP; varying float vOn;
    void main(){ vP = position.xz; vOn = aOn; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uGain; varying vec2 vP; varying float vOn;
    void main(){
      vec2 p = abs(vP);
      float e = abs(max(p.y, p.x * 0.8660254 + p.y * 0.5) - ${(HR * 0.8660254).toFixed(5)});
      float core = 1.0 - smoothstep(0.03, 0.03 + fwidth(e) * 1.5, e);
      vec3 c = vec3(1.0, 0.97, 0.93) * (core * 3.2 + exp(-e * 18.0) * 0.22) * vOn * uGain;
      gl_FragColor = vec4(c, 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
});
function hexRig(on) {
  const g = new THREE.PlaneGeometry(2.3 * HR, 2.3 * HR).rotateX(Math.PI / 2);
  g.setAttribute('aOn', new THREE.InstancedBufferAttribute(on, 1));
  const m = new THREE.InstancedMesh(g, hexMat, cells.length), o = new THREE.Object3D();
  cells.forEach((c, i) => { o.position.set(c.x, CEIL, c.z); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.frustumCulled = false; m.renderOrder = 4;
  return m;
}
const hexOn = new Float32Array(cells.length);
const rig = hexRig(hexOn);
scene.add(rig);

/* ---------- окружение для отражений: та же решётка, боковые софтбоксы, тёмный пол ---------- */
{
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x010101);
  const panel = (w, h, k, x, y, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
  };
  panel(14, 0.45, 3.2, 6.5, 1.5, 0, Math.PI / 2);
  panel(14, 0.45, 3.2, -6.5, 1.5, 0, Math.PI / 2);
  panel(9, 1.4, 0.45, 0, 1.8, -8.5);
  panel(9, 1.4, 0.35, 0, 1.8, 8.5, Math.PI);
  panel(40, 40, 0.03, 0, 0, 0, 0, -Math.PI / 2);
  // стены: тёмный верх, светлая полоса горизонта на высоте кузова — она ложится длинным бликом по бортам
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  [[0, '#040404'], [0.6, '#0e0e0e'], [0.8, '#4a4a4a'], [0.89, '#9a9a9a'], [0.95, '#3a3a3a'], [1, '#101010']].forEach(([o, c]) => gr.addColorStop(o, c));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const wt = new THREE.CanvasTexture(cv); wt.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 8, 48, 1, true), new THREE.MeshBasicMaterial({ map: wt, side: THREE.BackSide }));
  wall.position.y = 4; env.add(wall);
  env.add(hexRig(new Float32Array(cells.length).fill(1)));
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.008, 0.1, 100, { size: HQ ? 512 : 256, position: new THREE.Vector3(0, 0.9, 0) }).texture;
  pm.dispose();
}

/* ---------- фон: тёмная студия, дымка ползёт, свечение за лампой ---------- */
const NOISE = `float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
const bgU = { uTime: { value: 0 }, uLight: { value: 0 }, uGlowDir: { value: new THREE.Vector3(0, 0.3, -1) }, uGlowCol: { value: new THREE.Color(0xffffff) } };
const bg = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({
  uniforms: bgU, side: THREE.BackSide, depthWrite: false,
  vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime, uLight; uniform vec3 uGlowDir, uGlowCol; varying vec3 vD;
    ${NOISE}
    void main(){
      vec3 d = normalize(vD);
      float f = n3(d * 3.0 + vec3(0.0, -uTime * 0.05, uTime * 0.04)) * 0.6 + n3(d * 7.0 + vec3(uTime * 0.07, 0.0, 0.0)) * 0.4;
      float band = exp(-abs(d.y - 0.03) * 7.0);
      vec3 c = vec3(0.004, 0.0045, 0.0055);
      c += vec3(0.05, 0.052, 0.058) * band * (0.45 + 0.9 * f) * uLight;
      c += vec3(0.022, 0.023, 0.026) * smoothstep(0.5, 0.95, f) * smoothstep(-0.05, 0.6, d.y) * uLight;
      c += uGlowCol * pow(max(dot(d, normalize(uGlowDir)), 0.0), 10.0) * 0.14 * uLight;
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
bg.renderOrder = -1;
scene.add(bg);

/* ---------- пол: наливной, тёмный, край растворяется ---------- */
{
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(26, 72).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.2, metalness: 0, transparent: true, opacity: HQ ? 0.8 : 1, alphaMap: new THREE.CanvasTexture(cv), depthWrite: false }));
  floor.renderOrder = 1;
  scene.add(floor);
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load('m/ferrari_ao.png'), blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true, depthWrite: false }));
  ao.position.y = 0.003; ao.renderOrder = 2;
  scene.add(ao);
}

/* ---------- пылинки в свете ---------- */
const pU = { uTime: { value: 0 }, uPx: { value: 1 }, uLight: { value: 0 } };
{
  const N = HQ ? 380 : 150, pos = new Float32Array(N * 3), s = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos.set([(Math.random() - .5) * 12, Math.random() * 4.2, (Math.random() - .5) * 14], i * 3); s[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: pU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aS; uniform float uTime, uPx; varying float vA;
      void main(){
        vec3 p = position; p.y = mod(p.y + uTime * (0.04 + aS * 0.07), 4.2);
        p.x += sin(uTime * 0.3 + aS * 20.0) * 0.18; p.z += cos(uTime * 0.23 + aS * 13.0) * 0.18;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (0.5 + aS) * 22.0 / -mv.z;
        vA = (0.3 + 0.7 * fract(aS * 7.31)) * smoothstep(0.0, 0.6, p.y) * smoothstep(4.2, 3.3, p.y);
      }`,
    fragmentShader: `uniform float uLight; varying float vA;
      void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * a * vA * 0.42 * uLight, 1.0); }`,
  }));
  pts.renderOrder = 5; pts.frustumCulled = false;
  scene.add(pts);
}

/* ---------- лак: два состояния и линия полировки между ними ---------- */
const st = (n, c, r, m, cc, ccr, d = 0, ir = 0, glow = 0xffffff) => ({ n, col: new THREE.Color(c), v: [r, m, cc, ccr, d, ir], glow: new THREE.Color(glow) });
const S = {
  gloss: st('Obsidian · gloss', 0x0a0a0c, .2, .55, 1, .02),
  dull: st('As it arrived · hazed', 0x2c2d2f, .6, .25, .5, .55, 1),
  ceramic: st('Obsidian · ceramic 9H', 0x060609, .14, .6, 1, 0, 0, .6),
  stealth: st('Obsidian · stealth film', 0x151517, .5, .3, .3, .45),
};
const SW = [
  st('Liquid chrome', 0xe4e6ea, .1, 1, .3, .02, 0, 0, 0xcfe6ff),
  st('Racing green', 0x0c3320, .28, .6, 1, .02, 0, 0, 0x5cffa8),
  st('Papaya', 0xe0561c, .32, .25, 1, .02, 0, 0, 0xffa060),
  st('Nardo grey', 0x6a6d71, .36, .15, 1, .03),
  st('Pearl white', 0xe8e4da, .3, .1, 1, .02, 0, .35),
];
SW.forEach((s, i) => s.css = ['linear-gradient(135deg,#fff,#8d9097 45%,#e6e8ec 60%,#5d6068)', '#0f3a25', '#e0561c', '#6a6d71', '#ece7dc'][i]);
const U = {
  uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uMatA: { value: new THREE.Vector4() }, uMatB: { value: new THREE.Vector4() },
  uXA: { value: new THREE.Vector2() }, uXB: { value: new THREE.Vector2() }, uWipe: { value: -9 }, uGlow: { value: 0 }, uGlowCol: { value: new THREE.Color() },
};
const paint = new THREE.MeshPhysicalMaterial({ color: 0, metalness: .5, roughness: .2, clearcoat: 1, clearcoatRoughness: .02,
  iridescence: HQ ? 1 : 0, iridescenceIOR: 1.35, iridescenceThicknessRange: [100, 420] });
paint.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; uniform vec3 uColA, uColB, uGlowCol; uniform vec4 uMatA, uMatB; uniform vec2 uXA, uXB; uniform float uWipe, uGlow;
${NOISE}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float nw = 1.0 - smoothstep(uWipe - 0.012, uWipe + 0.012, vWP.z);
vec4 pm = mix(uMatA, uMatB, nw); vec2 px = mix(uXA, uXB, nw);
float dirt = px.x * smoothstep(0.3, 0.8, n3(vWP * 2.6) * 0.6 + n3(vWP * 9.0) * 0.4);
diffuseColor.rgb = mix(mix(uColA, uColB, nw), vec3(0.16, 0.16, 0.165), dirt * 0.55);`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = pm.x + dirt * 0.3;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = pm.y;')
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.clearcoat = pm.z * (1.0 - dirt * 0.7);
material.clearcoatRoughness = clamp(pm.w + dirt * 0.35, 0.0525, 1.0);
#ifdef USE_IRIDESCENCE
material.iridescence = px.y;
#endif`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float gd = abs(vWP.z - uWipe);
totalEmissiveRadiance += uGlowCol * uGlow * (exp(-gd * 40.0) * 1.6 + exp(-gd * 5.0) * 0.12);`);
};
function side(k, a, b = a, t = 0) {
  U['uCol' + k].value.lerpColors(a.col, b.col, t);
  const v = a.v.map((x, i) => mix(x, b.v[i], t));
  U['uMat' + k].value.set(v[0], v[1], v[2], v[3]); U['uX' + k].value.set(v[4], v[5]);
}

/* ---------- свет: полоса-инспекционка идёт за курсором ---------- */
const bar = new THREE.RectAreaLight(0xfff6ea, 0, 5, 0.3);
scene.add(bar);

/* ---------- надпись за машиной ---------- */
const word = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, uRev: { value: 0 }, uOp: { value: 0 } }, transparent: true, depthWrite: false, toneMapped: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform float uRev, uOp; varying vec2 vUv;
    void main(){
      vec2 uv = vUv; uv.y -= (1.0 - uRev) * 0.18;
      vec4 t = texture2D(map, uv);
      float m = smoothstep(uv.y - 0.12, uv.y, uRev * 1.12) * step(0.0, uv.y);
      gl_FragColor = vec4(t.rgb, t.a * m * uOp);
      #include <colorspace_fragment>
    }`,
}));
word.renderOrder = 3;
scene.add(word);
let wordTall = null;
function buildWord(tall) {
  wordTall = tall;
  const lines = tall ? ['LUS', 'TRE'] : ['LUSTRE'];
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const W = 2048, font = s => `900 expanded ${s}px Archivo, "Arial Black", sans-serif`;
  g.font = font(100); g.fontStretch = 'expanded';
  const w100 = Math.max(...lines.map(s => g.measureText(s).width));
  const fs = Math.floor(100 * (W * 0.98) / w100), lh = fs * 0.8;
  cv.width = W; cv.height = Math.ceil(lh * lines.length + fs * 0.06);
  g.font = font(fs); g.fontStretch = 'expanded'; g.fillStyle = '#ECE8DF'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  lines.forEach((s, i) => g.fillText(s, W / 2, lh * (i + 1) - fs * 0.02));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  word.material.uniforms.map.value?.dispose();
  word.material.uniforms.map.value = t;
  word.userData.ratio = cv.height / W;
}

/* ---------- машина ---------- */
// значки марки на хроме спереди и сзади вырезаем: бренд у сайта свой
function cutBadges(m) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (abs(vWP.x) < 0.06 && vWP.z < -2.0 && vWP.y > 0.2 && vWP.y < 0.66) discard;
if (abs(vWP.x) < 0.16 && vWP.z > 2.05 && vWP.y > 0.74 && vWP.y < 0.93) discard;`);
  };
}
const car = new THREE.Group();
scene.add(car);
let ready = false;
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/gltf/');
new GLTFLoader().setDRACOLoader(draco).load('m/ferrari.glb', gltf => {
  const m = gltf.scene;
  const metal = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 1, roughness: .24 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x040506, metalness: 0, roughness: 0, transparent: true, opacity: .66, envMapIntensity: 1.4 });
  m.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (o.name === 'body') o.material = paint;
    else if (o.name.startsWith('rim_') || o.name === 'trim' || n === 'Ferrari_Yellow') o.material = metal; // значков марки нет: бренд выдуманный
    else if (o.name === 'glass') o.material = glass;
    else if (/^(Leather|Leather_red|Interior_light|Interior_dark|Carpet|plastic_gray|Carbon_Fiber)$/.test(n)) o.material.color.set(n === 'Leather' ? 0x1c1916 : 0x151516);
    else if (n === 'metal_gray') { o.material.color.set(0x2c2d30); o.material.roughness = .3; o.material.metalness = 1; }
    else if (n === 'metal_chrome') cutBadges(o.material);
  });
  car.add(m);
  if (HQ) {                              // отражение в наливном полу: та же машина вверх колёсами под полупрозрачным полом
    const mir = m.clone(); mir.scale.y = -1; scene.add(mir);
  }
  renderer.compile(scene, camera);
  ready = true;
  $('.load .t i').style.setProperty('--p', 1);
  if (!Q.has('hold')) go();
}, e => e.total && $('.load .t i').style.setProperty('--p', (e.loaded / e.total * 0.9).toFixed(3)));

/* ---------- страница: секции, прокрутка, цвета ---------- */
const lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9 });
document.querySelectorAll('[data-split]').forEach(el => {
  el.innerHTML = el.textContent.trim().split(/\s+/).map((w, i) => `<span class="w"><span style="--i:${i}">${w}</span></span>`).join(' ');
});
const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.2 });
document.querySelectorAll('.card, .book, .pk article').forEach(el => io.observe(el));

let sel = 0, click = null, shown = S.gloss;
const swBox = $('.sw');
SW.forEach((s, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<i style="--c:${s.css}"></i>${s.n}`;
  b.setAttribute('aria-pressed', i === sel);
  b.onclick = () => {
    if (i === sel) return;
    click = { from: shown, t0: now };
    sel = i;
    swBox.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', j === i));
  };
  swBox.append(b);
});

const secs = ['correction', 'ceramic', 'film', 'colour'].map(id => ({ id, el: document.getElementById(id) }));
let vh = innerHeight, maxY = 1, K = [], tall = false;
// позы камеры: азимут, высота (рад), дистанция, точка взгляда по высоте, сдвиг машины по экрану (доли ширины, высоты)
const POSE = {
  wide: [[3.72, .1, 8.2, .78, 0, .02], [4.71, .05, 9.4, .72, .17, 0], [5.3, .46, 9.2, .5, -.18, 0], [5.8, .12, 7.6, .72, .2, 0], [8.5, .14, 8.2, .72, -.2, 0], [9.77, .08, 9.4, .8, .2, .04]],
  tall: [[3.72, .12, 7.2, .78, 0, -.02], [4.71, .06, 9.6, .72, 0, .22], [5.3, .5, 6.6, .5, 0, .24], [5.8, .14, 8.0, .72, 0, .22], [8.5, .16, 8.6, .72, 0, .22], [9.77, .1, 10.4, .8, 0, .22]],
};
const PH = [
  { s: 0, a: .06, b: .3, fade: 1, A: S.gloss, B: S.dull },
  { s: 0, a: .36, b: .7, A: S.dull, B: S.gloss, g: new THREE.Color(0xffb070) },
  { s: 1, a: .32, b: .68, A: S.gloss, B: S.ceramic, g: new THREE.Color(0x8fe3ff) },
  { s: 2, a: .32, b: .68, A: S.ceramic, B: S.stealth, g: new THREE.Color(0xffffff) },
  { s: 3, a: .3, b: .56, A: S.stealth, B: null },
];
function layout() {
  vh = innerHeight;
  renderer.setSize(innerWidth, innerHeight, false);
  const asp = innerWidth / innerHeight;
  tall = asp < 0.9;
  const k = tall ? Math.pow(1.6 / asp, 0.32) : 1;
  camera.aspect = asp;
  camera.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * k) * 180 / Math.PI;
  camera.userData.k = k;
  camera.updateProjectionMatrix();
  maxY = Math.max(1, document.documentElement.scrollHeight - vh);
  secs.forEach(s => { const r = s.el.getBoundingClientRect(); s.top = r.top + scrollY; s.h = r.height; });
  K = [0, ...secs.map(s => s.top + s.h / 2 - vh / 2), maxY];
  if (wordTall !== tall) buildWord(tall);
  // надпись: за машиной относительно первой позы, почти во всю ширину кадра
  const p = POSE[tall ? 'tall' : 'wide'][0], back = 5.5, dist = p[2] * k + back;
  const w = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * asp * (tall ? 0.9 : 0.94);
  word.scale.set(w, w * word.userData.ratio, 1);
  word.position.set(-Math.sin(p[0]) * back, tall ? 2.3 : 1.35, -Math.cos(p[0]) * back);
  word.rotation.y = p[0];
  pU.uPx.value = renderer.getPixelRatio() * innerHeight / 900;
}
addEventListener('resize', layout);
document.fonts.load('900 expanded 100px Archivo').catch(() => {}).finally(() => { wordTall = null; layout(); });
layout();

document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  const i = ['#correction', '#ceramic', '#film', '#colour'].indexOf(a.getAttribute('href'));
  lenis.scrollTo(i >= 0 ? K[i + 1] : a.getAttribute('href') === '#book' ? maxY : 0, { duration: 2.2 });
}));

/* ---------- курсор ---------- */
let px = 0, py = 0, lastPtr = -1e9, now = 0;
addEventListener('pointermove', e => { px = e.clientX / innerWidth * 2 - 1; py = e.clientY / innerHeight * 2 - 1; lastPtr = now; }, { passive: true });

/* ---------- вступление: свет включается по очереди ---------- */
let t0 = null;
function go() { if (t0 === null && ready) { t0 = now; document.body.classList.add('go'); } }
window.__go = () => { if (ready) go(); return ready; };

/* ---------- кадр ---------- */
const cam = { az: 0, el: 0, d: 0, ty: 0, sx: 0, sy: 0 }, dir = new THREE.Vector3(), tgt = new THREE.Vector3();
let ys = 0, mx = 0, my = 0, last = null, slow = 0, frames = 0, hudTxt = '', railI = -1;
const hp = $('#hp'), hc = $('#hc'), rail = [...document.querySelectorAll('.rail i')], band = $('.band div'), cards = [...document.querySelectorAll('.card')];
function local(i, y) { const s = secs[i]; return (y - (s.top - vh / 2)) / s.h; }
function frame(t) {
  requestAnimationFrame(frame);
  now = t;
  const dt = last === null ? 1 / 60 : Math.min((t - last) / 1000, 0.1);
  last = t;
  lenis.raf(t);
  const ti = t0 === null ? 0 : (t - t0) / 1000;
  const T = t / 1000;

  // включение света
  let on = 0;
  cells.forEach((c, i) => {
    const s = 0.35 + c.d * 0.8 + c.h * 0.25, u = ti - s;
    hexOn[i] = u < 0 ? 0 : u > 0.32 ? 1 : (Math.sin(u * 90 + c.h * 40) > 0.1 ? 1 : 0.08);
    on += hexOn[i];
  });
  rig.geometry.attributes.aOn.needsUpdate = true;
  const light = on / cells.length;
  scene.environmentIntensity = light;
  bgU.uLight.value = light; pU.uLight.value = light;
  bgU.uTime.value = pU.uTime.value = T;
  word.material.uniforms.uRev.value = sstep(1.1, 2.3, ti);
  word.material.uniforms.uOp.value = light * (1 - sstep(0.12, 0.45, ys / (K[1] || 1)));
  if (ti > 1.7) $('.hero').classList.add('in');
  if (ti > 2.6) document.body.classList.add('on');
  document.body.classList.toggle('past', ys > vh * 0.6);

  // прокрутка -> поза камеры
  ys += (lenis.animatedScroll - ys) * (1 - Math.exp(-dt * 7));
  const P = POSE[tall ? 'tall' : 'wide'];
  let i = 0; while (i < K.length - 2 && ys > K[i + 1]) i++;
  const f = sstep(0.2, 0.8, (ys - K[i]) / Math.max(1, K[i + 1] - K[i]));
  const a = P[i], b = P[i + 1];
  cam.az = mix(a[0], b[0], f); cam.el = mix(a[1], b[1], f); cam.d = mix(a[2], b[2], f);
  cam.ty = mix(a[3], b[3], f); cam.sx = mix(a[4], b[4], f); cam.sy = mix(a[5], b[5], f);

  // курсор или сам по себе: полоса света ходит вдоль кузова
  const auto = t - lastPtr > 2500;
  const tx = auto ? Math.sin(T * 0.55) * 0.85 : px, ty = auto ? -0.25 + Math.sin(T * 0.37) * 0.25 : py;
  mx += (tx - mx) * (1 - Math.exp(-dt * 3)); my += (ty - my) * (1 - Math.exp(-dt * 3));
  const intro = 1 - Math.pow(1 - clamp(ti / 3.6), 3);
  const drift = CALM ? 0 : Math.sin(T * 0.21) * 0.05;
  const az = cam.az + mx * 0.1 + drift - 0.5 * (1 - intro);
  const d = cam.d * camera.userData.k * (1 + 0.45 * (1 - intro));
  // камера всегда под сотами
  const el = Math.min(clamp(cam.el - my * 0.04 + 0.08 * (1 - intro), 0.02, 1.2), Math.asin(clamp((CEIL - 0.8 - cam.ty) / d, -1, 1)));
  dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  tgt.set(0, cam.ty, 0.1);
  camera.position.copy(tgt).addScaledVector(dir, d);
  camera.lookAt(tgt);
  const W = innerWidth, H = innerHeight;
  camera.setViewOffset(W, H, -cam.sx * W, cam.sy * H, W, H);

  // полоса света: в стороне камеры, сдвиг по курсору
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  bar.position.copy(tgt).addScaledVector(dir.clone().setY(0).normalize(), 2.6).addScaledVector(right, mx * 3.4);
  bar.position.y = 3.0 - my * 1.2;
  bar.lookAt(tgt.x, 0.5, tgt.z);
  bar.intensity = 14 * sstep(1.4, 2.6, ti);
  bgU.uGlowDir.value.copy(bar.position).normalize();

  // лак по прокрутке
  let A = S.gloss, B = S.gloss, w = 0, fade = null, g = null;
  for (const ph of PH) {
    const l = local(ph.s, ys);
    if (l >= ph.a) { A = ph.A; B = ph.B || SW[sel]; w = clamp((l - ph.a) / (ph.b - ph.a)); fade = ph.fade; g = ph.g || B.glow; }
  }
  if (!fade && B === SW[sel] && w >= 1 && click) {
    const c = clamp((t - click.t0) / 1200);
    A = click.from; w = c * c * (3 - 2 * c); g = B.glow;
    if (c >= 1) click = null;
  }
  if (fade) { side('A', A, B, w); side('B', A, B, w); U.uWipe.value = -9; U.uGlow.value = 0; shown = w > .5 ? B : A; }
  else {
    side('A', A); side('B', B);
    U.uWipe.value = -2.7 + 5.4 * w;
    U.uGlow.value = w > 0 && w < 1 ? Math.pow(Math.sin(Math.PI * w), 0.4) * 2.2 : 0;
    shown = w > .5 ? B : A;
  }
  if (g) U.uGlowCol.value.copy(g);

  // телефон: уходящая карточка гаснет, чтобы не закрывать машину, пока въезжает следующая
  cards.forEach(c => { c.style.opacity = tall ? sstep(vh * 0.5, vh * 0.85, c.getBoundingClientRect().bottom).toFixed(3) : ''; });

  // бегущая строка, рельс, показатели
  band.style.transform = `translate3d(${-((lenis.animatedScroll * 0.35) % (band.offsetWidth / 2))}px,0,0)`;
  const ri = K.reduce((bi, k, j) => Math.abs(k - ys) < Math.abs(K[bi] - ys) ? j : bi, 0);
  if (ri !== railI) { railI = ri; rail.forEach((x, j) => x.classList.toggle('a', j === ri)); }
  const txt = shown.n + '|' + String(Math.round(((az * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0') + '° / ' + String(Math.round(el * 180 / Math.PI)).padStart(2, '0') + '°';
  if (txt !== hudTxt) { hudTxt = txt; const [n, c] = txt.split('|'); hp.textContent = n; hc.textContent = c; }

  // если видеокарта не тянет — меньше пикселей (до двух раз)
  if (t0 !== null && ti > 1 && ti < 6 && slow < 2) {
    frames = dt > 1 / 42 ? frames + 1 : Math.max(0, frames - 1);
    if (frames > 45) { slow++; frames = 0; dpr = Math.max(TOUCH ? 0.85 : 1, dpr * 0.75); renderer.setPixelRatio(dpr); layout(); }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
