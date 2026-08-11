/* app.js — параметрический конфигуратор клюшки.
 * Геометрия — assets/klyushka.glb, собрана assets-lib/_tools/recepty/klyushka.mjs
 * (predmet.mjs). Материал и обмотка живые: три.js-материалы меняются по клику,
 * обмотка строится TubeGeometry по той же формуле радиуса шафта, что в рецепте.
 */
import * as THREE from '../assets/three-stick.js';
import { GLTFLoader } from '../assets/three-stick.js';
import { RGBELoader } from '../assets/three-stick.js';
import { OrbitControls } from '../assets/three-stick.js';

const T0 = performance.now();

/* ── та же таблица радиуса шафта, что и в assets-lib/_tools/recepty/klyushka.mjs
   (шафтПрофиль, [радиус_мм, высота_мм]) — источник один, число одно ──────────── */
const SHAFT_MM = [
  [9.5, 0], [10.07, 185.6], [11.78, 417.6], [13.68, 649.6], [15.77, 881.6],
  [13.92, 1067.2], [14.5, 1131], [12.47, 1155.4], [0, 1160],
];
function shaftRadiusM(yMm) {
  for (let i = 1; i < SHAFT_MM.length; i++) {
    const [r0, y0] = SHAFT_MM[i - 1], [r1, y1] = SHAFT_MM[i];
    if (yMm <= y1 || i === SHAFT_MM.length - 1) {
      const t = THREE.MathUtils.clamp((yMm - y0) / (y1 - y0), 0, 1);
      return (r0 + (r1 - r0) * t) / 1000;
    }
  }
  return 0.01;
}

/* ── палитры: tier 'std' бесплатно, 'premium' — доплата (P0-факт: цена реагирует
   на выбор, а не только на слайдер) ─────────────────────────────────────────── */
const PALETTES = {
  pero:    [['#f2f5f7','std'],['#12151a','std'],['#c8102e','std'],['#0057b8','std'],['#ffd400','premium'],['#00c48c','premium'],['#8b5cf6','premium']],
  shaft:   [['#12151a','std'],['#f2f5f7','std'],['#3a4048','std'],['#c8102e','premium'],['#0057b8','premium'],['#21e0ff','premium']],
  wrap:    [['#0c0e11','std'],['#f2f5f7','std'],['#c8102e','std'],['#21e0ff','premium'],['#ffd400','premium']],
  vstavka: [['#21e0ff','std'],['#c9ced4','std'],['#12151a','std'],['#ffd400','premium']],
};
const FINISHES = { matte:0, gloss:24, carbon:42 };
const PREMIUM_SURCHARGE = 8;
const BASE_PRICE = 179;
const WRAP_PRICE_PER_M = 46;
const ENGRAVE_PRICE_PER_CHAR = 3.5;

const state = {
  color: { pero:'#f2f5f7', shaft:'#12151a', wrap:'#0c0e11', vstavka:'#21e0ff' },
  tier:  { pero:'std', shaft:'std', wrap:'std', vstavka:'std' },
  finish:{ pero:'matte', shaft:'matte' },
  wrapLen: 220,
  engrave: '',
};

/* ── three.js: сцена, камера, рендер ─────────────────────────────────────── */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const capDPR = () => Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(capDPR());

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d10);
scene.fog = new THREE.Fog(0x0a0d10, 2.6, 5.4);

const camera = new THREE.PerspectiveCamera(30, innerWidth/innerHeight, 0.05, 20);
camera.position.set(0.86, 0.62, 1.32);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.55;
controls.maxDistance = 2.6;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.target.set(0, 0.12, 0);
controls.update();

/* свет: три источника + окружение (HDRI подгружается после первого кадра) */
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(1.6, 2.1, 1.1);
key.castShadow = true;
key.shadow.mapSize.set(1024,1024);
key.shadow.camera.near = 0.2; key.shadow.camera.far = 4;
key.shadow.camera.left = -1; key.shadow.camera.right = 1; key.shadow.camera.top = 1.6; key.shadow.camera.bottom = -1;
key.shadow.bias = -0.0018;
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fd8ff, 1.4);
rim.position.set(-1.4, 0.6, -1.2);
scene.add(rim);
scene.add(new THREE.AmbientLight(0x223038, 0.5));

const groundGeo = new THREE.CircleGeometry(2.2, 48);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.34 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI/2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

/* ── карбоновый шейдер-твист: вплетаем в MeshStandardMaterial через onBeforeCompile,
   тумблер uCarbonMix переключается без пересборки шейдера ─────────────────────── */
const dummyMap = new THREE.DataTexture(new Uint8Array([255,255,255,255]), 1, 1);
dummyMap.needsUpdate = true;

function makeZoneMaterial(baseColorHex) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColorHex),
    vertexColors: true,
    roughness: 0.5, metalness: 0.04,
    map: dummyMap,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCarbonMix = { value: 0 };
    shader.uniforms.uWeaveScale = { value: 240.0 };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uCarbonMix;\nuniform float uWeaveScale;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n#ifdef USE_MAP
      {
        float wv = sin(vMapUv.x*uWeaveScale)*sin(vMapUv.y*uWeaveScale*0.62);
        roughnessFactor = mix(roughnessFactor, clamp(roughnessFactor*(0.55+0.5*wv*wv),0.06,1.0), uCarbonMix);
      }
      #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n#ifdef USE_MAP
      {
        float wv = sin(vMapUv.x*uWeaveScale)*sin(vMapUv.y*uWeaveScale*0.62);
        vec3 wbump = normalize(vec3(dFdx(wv), dFdy(wv), 3.2));
        normal = normalize(mix(normal, normalize(normal + wbump*0.6), uCarbonMix));
      }
      #endif`);
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'zoneCarbon';
  return mat;
}

/* ── загрузка геометрии ───────────────────────────────────────────────────── */
const rig = new THREE.Group();
rig.rotation.z = THREE.MathUtils.degToRad(-9);
rig.rotation.y = THREE.MathUtils.degToRad(18);
scene.add(rig);

const meshes = {};   // pero, shaft, vstavka
let firstFrameShown = false;
let wrapMesh = null, engraveMesh = null, engraveCanvas, engraveCtx, engraveTex;

const loaderFill = document.getElementById('loaderFill');
const loaderPct = document.getElementById('loaderPct');
const loaderEl = document.getElementById('loader');
const setLoad = (p) => { loaderFill.style.right = (100-p)+'%'; loaderPct.textContent = ' '+Math.round(p)+'%'; };

const gltfLoader = new GLTFLoader();
gltfLoader.load('assets/klyushka.glb', (gltf) => {
  let tris = 0;
  const loaded = [];
  /* сначала собрать список — потом переносить: rig.add(o) отцепляет o от
     gltf.scene.children, а traverse() в этот момент ещё итерирует ЭТОТ ЖЕ массив */
  gltf.scene.traverse((o) => { if (o.isMesh) loaded.push(o); });
  for (const o of loaded) {
    o.castShadow = true; o.receiveShadow = true;
    const mat = makeZoneMaterial(state.color[o.name] || '#ffffff');
    o.material = mat;
    meshes[o.name] = o;
    tris += o.geometry.index ? o.geometry.index.count/3 : o.geometry.attributes.position.count/3;
    rig.add(o);
  }
  document.getElementById('statTris').textContent = Math.round(tris).toLocaleString('en-US');
  buildWrap();
  buildEngrave();
  applyAllColors();
  setLoad(100);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    loaderEl.classList.add('is-done');
  }));
}, (xhr) => {
  if (xhr.total) setLoad(xhr.loaded/xhr.total*100);
}, (err) => { console.error('glb load failed', err); setLoad(100); loaderEl.classList.add('is-done'); });

let geoKb = 118;
fetch('assets/klyushka.glb', { method:'HEAD' }).then(r=>{
  const kb = r.headers.get('content-length');
  if (kb) { geoKb = +(kb/1024).toFixed(1); document.getElementById('statKb').textContent = geoKb+' KB'; }
}).catch(()=>{});

/* ── обмотка: спираль TubeGeometry вокруг того же радиуса, что и шафт ──────── */
function buildWrap() {
  if (wrapMesh) { rig.remove(wrapMesh); wrapMesh.geometry.dispose(); wrapMesh.material.dispose(); }
  const lenM = state.wrapLen/1000;
  if (lenM < 0.005) { wrapMesh = null; return; }
  const startY = 0.070;               // от пятки — типичное место начала намотки под низ хвата
  const endY = startY + lenM;
  const turns = Math.max(4, Math.round(lenM / 0.026));
  const pts = [];
  const N = turns * 10;
  for (let i = 0; i <= N; i++) {
    const t = i/N;
    const y = startY + t*(endY-startY);
    const a = t * turns * Math.PI * 2;
    const r = shaftRadiusM(y*1000) + 0.0016;
    pts.push(new THREE.Vector3(Math.cos(a)*r, y, Math.sin(a)*r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, Math.max(24, turns*8), 0.0034, 6, false);
  const mat = makeZoneMaterial(state.color.wrap);
  mat.roughness = 0.82; mat.metalness = 0.0;
  wrapMesh = new THREE.Mesh(geo, mat);
  wrapMesh.castShadow = true; wrapMesh.receiveShadow = true;
  wrapMesh.name = 'wrap';
  meshes.wrap = wrapMesh;
  rig.add(wrapMesh);
}

/* ── гравировка: canvas-текстура на плоскости, касательной к шафту ─────────── */
function buildEngrave() {
  engraveCanvas = document.createElement('canvas');
  engraveCanvas.width = 512; engraveCanvas.height = 96;
  engraveCtx = engraveCanvas.getContext('2d');
  engraveTex = new THREE.CanvasTexture(engraveCanvas);
  engraveTex.colorSpace = THREE.SRGBColorSpace;
  const y = 0.86; // высота на шафте
  const r = shaftRadiusM(y*1000);
  const geo = new THREE.PlaneGeometry(0.16, 0.03);
  const mat = new THREE.MeshStandardMaterial({ map: engraveTex, transparent:true, roughness:0.5, metalness:0.1, depthWrite:false });
  engraveMesh = new THREE.Mesh(geo, mat);
  engraveMesh.position.set(0, y, r + 0.0009);
  engraveMesh.renderOrder = 2;
  rig.add(engraveMesh);
  drawEngrave();
}
function drawEngrave() {
  const ctx = engraveCtx, c = engraveCanvas;
  ctx.clearRect(0,0,c.width,c.height);
  const txt = state.engrave.trim();
  if (!txt) { engraveTex.needsUpdate = true; return; }
  ctx.fillStyle = '#eef3f6';
  ctx.font = '600 46px Geist, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4;
  ctx.fillText(txt.toUpperCase(), c.width/2, c.height/2+2);
  engraveTex.needsUpdate = true;
}

/* ── цвет/финиш применение с плавным переходом ──────────────────────────── */
const pending = new Map();
function setZoneColor(zone, hex) {
  const m = meshes[zone]; if (!m) return;
  const from = m.material.color.clone();
  const to = new THREE.Color(hex);
  const t0 = performance.now();
  const dur = 420;
  const step = () => {
    const k = Math.min(1, (performance.now()-t0)/dur);
    const e = 1 - Math.pow(1-k, 3);
    m.material.color.copy(from).lerp(to, e);
    if (k < 1) pending.set(zone, requestAnimationFrame(step));
  };
  cancelAnimationFrame(pending.get(zone));
  pending.set(zone, requestAnimationFrame(step));
}
function applyAllColors(){ for (const z in state.color) setZoneColor(z, state.color[z]); }

function setFinish(zone, key) {
  state.finish[zone] = key;
  const m = meshes[zone]; if (!m) return;
  const sh = m.material.userData.shader;
  const target = key==='carbon' ? 1 : 0;
  m.material.roughness = key==='gloss' ? 0.14 : key==='carbon' ? 0.42 : 0.52;
  m.material.metalness = key==='gloss' ? 0.35 : key==='carbon' ? 0.18 : 0.04;
  if (sh) sh.uniforms.uCarbonMix.value = target;
}

/* ── UI: сборка свотчей/пилюль ────────────────────────────────────────────── */
function buildSwatches(zone) {
  const wrap = document.getElementById('sw-'+zone);
  PALETTES[zone].forEach(([hex, tier]) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = hex; b.type='button';
    b.setAttribute('aria-label', zone+' color '+hex+(tier==='premium'?' (premium)':''));
    if (hex === state.color[zone]) b.classList.add('is-active');
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.swatch').forEach(s=>s.classList.remove('is-active'));
      b.classList.add('is-active');
      state.color[zone] = hex; state.tier[zone] = tier;
      setZoneColor(zone, hex);
      updateQuote();
    });
    wrap.appendChild(b);
  });
}
function buildFinishes(zone) {
  const wrap = document.getElementById('fn-'+zone);
  if (!wrap) return;
  Object.keys(FINISHES).forEach((key) => {
    const b = document.createElement('button');
    b.className = 'pill'; b.type='button'; b.textContent = key;
    if (state.finish[zone] === key) b.classList.add('is-active');
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.pill').forEach(s=>s.classList.remove('is-active'));
      b.classList.add('is-active');
      setFinish(zone, key);
      updateQuote();
    });
    wrap.appendChild(b);
  });
}
['pero','shaft','wrap','vstavka'].forEach(buildSwatches);
['pero','shaft'].forEach(buildFinishes);

const wrapLenInput = document.getElementById('wrapLen');
wrapLenInput.addEventListener('input', () => {
  state.wrapLen = +wrapLenInput.value;
  document.getElementById('wrapLenVal').textContent = state.wrapLen+' mm';
  buildWrap();
  setZoneColor('wrap', state.color.wrap);
  updateQuote();
});

const engraveInput = document.getElementById('engrave');
engraveInput.addEventListener('input', () => {
  state.engrave = engraveInput.value.replace(/[^a-zA-Z0-9 .\-']/g,'').slice(0,14);
  engraveInput.value = state.engrave;
  drawEngrave();
  updateQuote();
});

function updateQuote() {
  const lines = [];
  let total = BASE_PRICE;
  lines.push(['Base stick', '$'+BASE_PRICE]);

  ['pero','shaft'].forEach((z) => {
    const f = state.finish[z];
    const add = FINISHES[f];
    if (add) { lines.push([`${z==='pero'?'Blade':'Shaft'} · ${f}`, '+$'+add]); total += add; }
  });

  let premCount = 0;
  for (const z in state.tier) if (state.tier[z]==='premium') premCount++;
  if (premCount) { const add = premCount*PREMIUM_SURCHARGE; lines.push(['Premium color ×'+premCount, '+$'+add]); total += add; }

  if (state.wrapLen > 5) {
    const add = Math.round(state.wrapLen/1000*WRAP_PRICE_PER_M*100)/100;
    lines.push(['Grip wrap · '+state.wrapLen+' mm', '+$'+add.toFixed(2)]); total += add;
  }
  if (state.engrave.trim()) {
    const n = state.engrave.trim().length;
    const add = n*ENGRAVE_PRICE_PER_CHAR;
    lines.push(['Engraving · '+n+' chars', '+$'+add.toFixed(2)]); total += add;
  }

  const linesEl = document.getElementById('quoteLines');
  linesEl.textContent = '';
  for (const [a, b] of lines) {
    const row = document.createElement('div');
    const span = document.createElement('span'); span.textContent = a;
    const strong = document.createElement('b'); strong.textContent = b;
    row.append(span, strong);
    linesEl.append(row);
  }
  document.getElementById('quoteTotal').textContent = '$'+total.toFixed(2);
}
updateQuote();

/* ── HDRI окружение — ПОСЛЕ первого кадра, не блокирует отрисовку ─────────── */
function loadEnv() {
  new RGBELoader().load('assets/env.hdr', (hdr) => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envMap;
    hdr.dispose(); pmrem.dispose();
  });
}

/* ── resize / DPR ───────────────────────────────────────────────────────── */
function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(capDPR());
  renderer.setSize(w, h);
}
addEventListener('resize', onResize);
onResize();

/* ── панель на мобильном ──────────────────────────────────────────────────── */
const panel = document.getElementById('panel');
const panelToggle = document.getElementById('panelToggle');
panel.dataset.open = '1';
panelToggle.addEventListener('click', () => {
  const open = panel.dataset.open === '1';
  panel.dataset.open = open ? '0' : '1';
  panelToggle.setAttribute('aria-expanded', String(!open));
});

const hintEl = document.getElementById('hint');
controls.addEventListener('start', () => hintEl.classList.add('is-hidden'));

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── цикл рендера ──────────────────────────────────────────────────────── */
function tick() {
  requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene, camera);
  if (!firstFrameShown) {
    firstFrameShown = true;
    const ms = performance.now() - T0;
    document.getElementById('perfLine').textContent =
      `first frame ${ms.toFixed(0)} ms · geometry ${geoKb} KB · own render, no pre-baked photos`;
    console.log('[stick] first frame:', ms.toFixed(1), 'ms');
    setTimeout(loadEnv, 60);
  }
}
tick();
