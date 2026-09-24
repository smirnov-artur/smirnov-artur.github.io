import * as THREE from './vendor/three.module.min.js';
import {
  LAYER_VERT, SKY_FRAG, CITY_FRAG, FORE_FRAG,
  GEO_VERT, GEO_FRAG, SIGN_FRAG, TRAIN_FRAG,
  MOTE_VERT, MOTE_FRAG,
  FS_VERT, BRIGHT_FRAG, BLUR_FRAG, POST_FRAG
} from './shaders.js';

/* ================================================================== */
/* setup                                                               */
/* ================================================================== */

const canvas = document.getElementById('scene');
const coarse = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, alpha: false, stencil: false,
  powerPreference: 'high-performance'
});
renderer.setClearColor(0x05070c, 1);
renderer.autoClear = true;
renderer.info.autoReset = false;

const MAX_DPR = coarse ? 1.5 : 2;
const QUALITY = coarse ? 'low' : 'high';
const DEFINES = { OCTAVES: QUALITY === 'low' ? 3 : 5 };

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);

// The projector: a second camera that never moves. Everything painted is
// sampled through its clip space, so it is literally the point of view the
// "painting" was made from.
const projector = new THREE.PerspectiveCamera(42, 1, 0.5, 900);

const CAM_HOME = new THREE.Vector3(0, 5.0, 14);
const CAM_LOOK = new THREE.Vector3(0, 3.4, -16);
camera.position.copy(CAM_HOME);
camera.lookAt(CAM_LOOK);
projector.position.copy(CAM_HOME);
projector.lookAt(CAM_LOOK);

/* ================================================================== */
/* shared uniforms                                                     */
/* ================================================================== */

const U = {
  time:     { value: 0 },
  horizon:  { value: 0.14 },
  sun:      { value: new THREE.Vector2(0.44, 0.16) },
  projMat:  { value: new THREE.Matrix4() },
  cameraMap:{ value: 1 },
  aspect:   { value: 1.6 },
  lightQ:   { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
  lightC:   { value: [
    new THREE.Color(1.00, 0.54, 0.30),   // 0 — the sun, sitting on the horizon
    new THREE.Color(1.00, 0.40, 0.36),   // 1 — the neon sign on our roof
    new THREE.Color(1.00, 0.84, 0.58)    // 2 — the train, once every 26 seconds
  ] },
  lightI:   { value: [0.85, 1.15, 0.0] },
  lightR:   { value: [1.05, 0.42, 0.60] },
  camPos:   { value: new THREE.Vector3() }
};

const SIGN_POS  = new THREE.Vector3(-7.6, 4.0, -4.6);
const TRAIN_POS = new THREE.Vector3(0, 3.7, -62);

/* ================================================================== */
/* painted layers                                                      */
/* ================================================================== */

const PLANE = new THREE.PlaneGeometry(2, 2, 1, 1);
const layers = [];

function makeLayer({ name, dist, frag, uniforms, margin, order, explodeTo }) {
  const mat = new THREE.ShaderMaterial({
    defines: { ...DEFINES },
    vertexShader: LAYER_VERT,
    fragmentShader: frag,
    uniforms: Object.assign({
      uTime: U.time, uHorizon: U.horizon, uSun: U.sun,
      uLightQ: U.lightQ, uLightC: U.lightC, uLightI: U.lightI, uLightR: U.lightR,
      uProjMat: U.projMat, uCameraMap: U.cameraMap, uProjAspect: U.aspect,
      uMargin: { value: new THREE.Vector2(margin[0], margin[1]) },
      uEdge: { value: 0 }
    }, uniforms),
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(PLANE, mat);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const layer = { name, mesh, mat, margin, dist, explodeTo, k: 1 };
  layers.push(layer);
  return layer;
}

const sky = makeLayer({
  name: 'sky', dist: 434, frag: SKY_FRAG, order: 0, margin: [1.7, 1.6], explodeTo: 74,
  uniforms: {}
});

function cityUniforms(cfg) {
  return {
    uBaseY:      { value: cfg.baseY },
    uColW:       { value: cfg.colW },
    uSeed:       { value: cfg.seed },
    uAmp:        { value: cfg.amp },
    uWinDens:    { value: cfg.winDens },
    uMastCut:    { value: cfg.mastCut },
    uHaze:       { value: cfg.haze },
    uSilhouette: { value: new THREE.Color(...cfg.silhouette) },
    uWinColor:   { value: new THREE.Color(...cfg.winColor) },
    uRimDir:     { value: new THREE.Vector2(1, 0) },
    uRimCol:     { value: new THREE.Color(...cfg.rimCol) },
    uRimW:       { value: cfg.rimW },
    uRim:        { value: cfg.rim },
    uWash:       { value: cfg.wash }
  };
}

const CITY = [
  { name: 'far', dist: 184, order: 1, margin: [1.55, 1.45], explodeTo: 60, seed: 3.7,
    colWBase: 0.062, ampBase: 0.130, baseOff: -0.004, winDens: 0.26, mastCut: 0.95, haze: 0.78,
    silhouette: [0.115, 0.120, 0.185], winColor: [0.42, 0.28, 0.16], rimCol: [0.55, 0.31, 0.19],
    rimW: 0.0035, rim: 0.30, wash: 0.09, rimLight: 0 },
  { name: 'mid', dist: 104, order: 2, margin: [1.55, 1.5], explodeTo: 48, seed: 17.3,
    colWBase: 0.135, ampBase: 0.255, baseOff: -0.022, winDens: 0.30, mastCut: 0.86, haze: 0.46,
    silhouette: [0.060, 0.064, 0.102], winColor: [1.00, 0.62, 0.28], rimCol: [0.72, 0.38, 0.22],
    rimW: 0.0055, rim: 0.42, wash: 0.15, rimLight: 0 },
  { name: 'near', dist: 48, order: 5, margin: [1.6, 1.55], explodeTo: 38, seed: 41.1,
    colWBase: 0.300, ampBase: 0.620, baseOff: -0.285, winDens: 0.22, mastCut: 0.88, haze: 0.09,
    silhouette: [0.024, 0.027, 0.044], winColor: [1.00, 0.58, 0.24], rimCol: [0.72, 0.26, 0.24],
    rimW: 0.0075, rim: 0.40, wash: 0.18, rimLight: 1 }
];

const cityLayers = CITY.map(cfg => {
  const l = makeLayer({
    name: cfg.name, dist: cfg.dist, frag: CITY_FRAG, order: cfg.order,
    margin: cfg.margin, explodeTo: cfg.explodeTo,
    uniforms: cityUniforms({ ...cfg, baseY: U.horizon.value + cfg.baseOff, colW: cfg.colWBase, amp: cfg.ampBase })
  });
  l.cfg = cfg;
  return l;
});

const fore = makeLayer({
  name: 'fore', dist: 7, frag: FORE_FRAG, order: 9, margin: [1.35, 1.3], explodeTo: 7,
  uniforms: {}
});

/* The projector drawn as a wireframe cone of rays. It only appears in the
   exploded view, where its whole job is to answer "mapped from where?". */
const rig = new THREE.Group();
rig.renderOrder = 10;
scene.add(rig);

const RIG_FAR = 80, RIG_NEAR = 7;
const rigGeo = new THREE.BufferGeometry();
const rigMat = new THREE.LineBasicMaterial({
  color: new THREE.Color(1.0, 0.72, 0.42), transparent: true, opacity: 0, depthTest: false
});
const rigLines = new THREE.LineSegments(rigGeo, rigMat);
rigLines.frustumCulled = false;
rigLines.renderOrder = 10;
rig.add(rigLines);

function buildRig() {
  const ty = Math.tan(THREE.MathUtils.degToRad(projector.fov * 0.5));
  const tx = ty * state.aspect;
  const corner = (d, sx, sy) => [sx * tx * d, sy * ty * d, -d];
  const pts = [];
  const push = (a, b) => pts.push(...a, ...b);
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of signs) push([0, 0, 0], corner(RIG_FAR, sx, sy));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    push(corner(RIG_NEAR, ...signs[i]), corner(RIG_NEAR, ...signs[j]));
    push(corner(RIG_FAR, ...signs[i]), corner(RIG_FAR, ...signs[j]));
  }
  // a stub of a camera body so the apex reads as an object, not a dot
  const b = 0.9;
  for (const [sx, sy] of signs) push([sx * b, sy * b, 0], [sx * b, sy * b, b * 2.2]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    push([signs[i][0] * b, signs[i][1] * b, 0], [signs[j][0] * b, signs[j][1] * b, 0]);
    push([signs[i][0] * b, signs[i][1] * b, b * 2.2], [signs[j][0] * b, signs[j][1] * b, b * 2.2]);
  }
  rigGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  rigGeo.computeBoundingSphere();
  rig.position.copy(projector.position);
  rig.quaternion.copy(projector.quaternion);
}

/* ================================================================== */
/* real geometry                                                       */
/* ================================================================== */

const geoUniforms = () => ({
  uTime:       U.time,
  uCamPos:     U.camPos,
  uBase:       { value: new THREE.Color(0.038, 0.042, 0.060) },
  uSunDir:     { value: new THREE.Vector3(0.62, 0.10, -0.78).normalize() },
  uSunCol:     { value: new THREE.Color(1.00, 0.50, 0.28) },
  uSkyFill:    { value: new THREE.Color(0.058, 0.072, 0.130) },
  uGroundFill: { value: new THREE.Color(0.020, 0.022, 0.034) },
  uFogColor:   { value: new THREE.Color(0.330, 0.230, 0.250) },
  uFog:        { value: new THREE.Vector2(25, 110) },
  uMottle:     { value: 0 },
  uLightP:  { value: [SIGN_POS.clone(), TRAIN_POS.clone()] },
  uLightWC: { value: [U.lightC.value[1].clone(), U.lightC.value[2].clone()] },
  uLightWI: { value: [3.4, 0.0] },
  uLightWR: { value: [13.0, 55.0] }
});

// Marked transparent on purpose: three draws every opaque object before every
// transparent one, and the painted layers are transparent. Putting the meshes
// in the same queue is what lets renderOrder interleave geometry between
// layers — the whole point of the hybrid.
const geoMat = new THREE.ShaderMaterial({ defines: { ...DEFINES },
  vertexShader: GEO_VERT, fragmentShader: GEO_FRAG,
  uniforms: geoUniforms(),
  transparent: true, depthTest: true, depthWrite: true
});
const deckMat = geoMat.clone();
deckMat.uniforms = { ...geoMat.uniforms, uMottle: { value: 1 }, uBase: { value: new THREE.Color(0.030, 0.033, 0.046) } };

const rooftop = new THREE.Group();
scene.add(rooftop);

function box(w, h, d, x, y, z, mat = geoMat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.renderOrder = 7;
  rooftop.add(m);
  return m;
}
function cyl(rt, rb, h, seg, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), geoMat);
  m.position.set(x, y, z);
  m.renderOrder = 7;
  rooftop.add(m);
  return m;
}

// The deck we stand on, stopping at a low parapet: past the roofline the
// painted city carries on downwards, which is what sells the height.
const DECK = 1.2;
box(74, 6, 22, 0, DECK - 3, 5, deckMat);
box(74, 0.62, 0.7, 0, DECK + 0.31, -5.6);    // parapet, far edge
box(0.7, 0.62, 22, -25, DECK + 0.31, 5);     // parapet, left
box(0.7, 0.62, 22, 25, DECK + 0.31, 5);      // parapet, right

// water tank on legs — the shape that says "rooftop" faster than anything else
cyl(1.35, 1.35, 2.4, 20, -3.6, DECK + 2.6, -1.0);
cyl(0.10, 1.45, 0.8, 20, -3.6, DECK + 4.2, -1.0);
for (const [dx, dz] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) {
  box(0.17, 1.5, 0.17, -3.6 + dx, DECK + 0.75, -1.0 + dz);
}
// air handling units
box(2.8, 1.4, 1.9, 6.6, DECK + 0.7, -1.2);
box(2.0, 1.0, 1.6, 9.4, DECK + 0.5, -5.5);
box(0.85, 0.6, 0.85, 6.6, DECK + 1.7, -1.2);
// vent stacks
cyl(0.22, 0.22, 1.7, 10, 1.6, DECK + 0.85, -3.4);
cyl(0.26, 0.26, 1.25, 10, 2.6, DECK + 0.63, -4.3);
// antenna
cyl(0.08, 0.12, 7.2, 8, 10.5, DECK + 3.6, -5.0);
box(1.2, 0.08, 0.08, 10.5, DECK + 6.2, -5.0);
box(0.85, 0.08, 0.08, 10.5, DECK + 5.6, -5.0);

// Close enough to the lens to be nearly a silhouette. This is what turns the
// camera drift into depth instead of a wobble: two metres of camera move
// barely touches the skyline and swings these right across the frame.
box(0.8, 2.9, 0.8, 4.5, DECK + 1.45, 7.6);
box(1.2, 0.28, 1.2, 4.5, DECK + 2.95, 7.6);
cyl(0.20, 0.20, 26, 8, 0, DECK + 0.95, 8.4).rotation.z = Math.PI / 2;

// elevated line the train runs on, out among the city — kept below the
// horizon glow so it reads as a line through the city, not a bar across it
const viaduct = box(200, 0.32, 1.4, 0, 3.0, -62);
viaduct.renderOrder = 3;
for (let i = -4; i <= 4; i++) {
  const p = box(1.0, 4.6, 1.0, i * 22 + 5, 0.5, -62);
  p.renderOrder = 3;
}

/* the neon sign — the key light, and an object you can see making the light */
const signMat = new THREE.ShaderMaterial({ defines: { ...DEFINES },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: SIGN_FRAG,
  uniforms: { uTime: U.time, uNeon: { value: new THREE.Color(1.00, 0.34, 0.32) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), signMat);
sign.position.copy(SIGN_POS);
sign.rotation.y = 0.34;
sign.renderOrder = 8;
scene.add(sign);
const signPost = box(0.22, 1.4, 0.22, SIGN_POS.x, DECK + 0.7, SIGN_POS.z);
signPost.renderOrder = 7;
box(1.5, 0.16, 0.6, SIGN_POS.x, DECK + 0.08, SIGN_POS.z).renderOrder = 7;

/* the train */
const trainMat = new THREE.ShaderMaterial({ defines: { ...DEFINES },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: TRAIN_FRAG,
  uniforms: { uTime: U.time, uWarm: { value: new THREE.Color(1.00, 0.74, 0.40) } },
  transparent: true, depthWrite: false
});
const train = new THREE.Mesh(new THREE.PlaneGeometry(26, 1.9), trainMat);
train.position.copy(TRAIN_POS);
train.renderOrder = 4;
scene.add(train);

/* dust motes drifting through the warm air */
const MOTES = QUALITY === 'low' ? 180 : 380;
const mp = new Float32Array(MOTES * 3);
const ms = new Float32Array(MOTES * 3);
for (let i = 0; i < MOTES; i++) {
  mp[i * 3]     = (Math.random() - 0.5) * 52;
  mp[i * 3 + 1] = 1.5 + Math.random() * 11;
  mp[i * 3 + 2] = -22 + Math.random() * 30;
  ms[i * 3]     = Math.random();
  ms[i * 3 + 1] = Math.random();
  ms[i * 3 + 2] = Math.random();
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(ms, 3));
const moteMat = new THREE.ShaderMaterial({ defines: { ...DEFINES },
  vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
  uniforms: { uTime: U.time, uPixelRatio: { value: 1 }, uWarm: { value: new THREE.Color(1.0, 0.72, 0.42) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
const motes = new THREE.Points(moteGeo, moteMat);
motes.renderOrder = 8;
motes.frustumCulled = false;
scene.add(motes);

/* ================================================================== */
/* post                                                                */
/* ================================================================== */

const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false };
const sceneRT = new THREE.WebGLRenderTarget(2, 2, rtOpts);
const bloomA  = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
const bloomB  = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
for (const rt of [sceneRT, bloomA, bloomB]) {
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;
}

const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsGeo = new THREE.PlaneGeometry(2, 2);
function pass(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ defines: { ...DEFINES },
    vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false
  });
  const mesh = new THREE.Mesh(fsGeo, m);
  mesh.frustumCulled = false;
  const s = new THREE.Scene();
  s.add(mesh);
  return { scene: s, mat: m, uniforms };
}

const brightPass = pass(BRIGHT_FRAG, {
  uTex: { value: sceneRT.texture }, uThreshold: { value: 0.62 }
});
const blurPass = pass(BLUR_FRAG, {
  uTex: { value: null }, uDir: { value: new THREE.Vector2() }
});
const postPass = pass(POST_FRAG, {
  uScene: { value: sceneRT.texture },
  uBloom: { value: bloomA.texture },
  uRes: { value: new THREE.Vector2() },
  uTime: U.time,
  uGrain: { value: 0.055 },
  uBloomAmt: { value: 0.62 },
  uVignette: { value: 0.42 }
});

/* ================================================================== */
/* sizing                                                              */
/* ================================================================== */

const state = {
  w: 1, h: 1, dpr: 1, aspect: 1.6,
  renderScale: 1,
  bloomDiv: QUALITY === 'low' ? 6 : 5,
  explode: 0, explodeTarget: 0,
  grain: true,
  running: true
};

const horizonProbe = new THREE.Vector3();

function resize() {
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  state.w = w; state.h = h;
  state.aspect = w / h;
  state.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);

  // portrait phones get a wider vertical field so the composition still reads
  const fov = THREE.MathUtils.lerp(64, 42, THREE.MathUtils.smoothstep(state.aspect, 0.5, 1.35));
  camera.fov = projector.fov = fov;
  camera.aspect = projector.aspect = state.aspect;
  camera.updateProjectionMatrix();
  projector.updateProjectionMatrix();
  projector.updateMatrixWorld(true);
  U.projMat.value.multiplyMatrices(projector.projectionMatrix, projector.matrixWorldInverse);
  U.aspect.value = state.aspect;

  // find where the true horizon lands in the painting, and hang everything off it
  horizonProbe.set(0, projector.position.y, projector.position.z - 40000).project(projector);
  U.horizon.value = horizonProbe.y;
  U.sun.value.set(0.44 * state.aspect, horizonProbe.y + 0.035);

  const scaleFix = THREE.MathUtils.clamp(state.aspect / 1.6, 0.42, 1.25);
  for (const l of cityLayers) {
    l.mat.uniforms.uBaseY.value = U.horizon.value + l.cfg.baseOff * THREE.MathUtils.clamp(state.aspect / 1.6, 0.7, 1.15);
    l.mat.uniforms.uColW.value = l.cfg.colWBase * scaleFix;
    l.mat.uniforms.uAmp.value = l.cfg.ampBase * THREE.MathUtils.clamp(state.aspect / 1.6, 0.78, 1.1);
  }

  layoutLayers();
  buildRig();

  const rw = Math.max(2, Math.round(w * state.dpr * state.renderScale));
  const rh = Math.max(2, Math.round(h * state.dpr * state.renderScale));
  sceneRT.setSize(rw, rh);
  const bw = Math.max(2, Math.round(rw / state.bloomDiv));
  const bh = Math.max(2, Math.round(rh / state.bloomDiv));
  bloomA.setSize(bw, bh);
  bloomB.setSize(bw, bh);
  postPass.uniforms.uRes.value.set(rw, rh);
  moteMat.uniforms.uPixelRatio.value = state.dpr * state.renderScale;
}

// Each painted plane is sized to exactly cover the projector's frustum at its
// own depth, plus margin for the camera to move inside. In the exploded view
// the whole stack is scaled about the projector, which leaves the projected
// image untouched — you just get to walk around it.
const projDir = new THREE.Vector3();

function layoutLayers() {
  const tanY = Math.tan(THREE.MathUtils.degToRad(projector.fov * 0.5));
  const P = projector.position;
  projector.getWorldDirection(projDir);
  for (const l of layers) {
    const k = THREE.MathUtils.lerp(1, l.explodeTo / l.dist, state.explode);
    l.k = k;
    const d = l.dist * k;
    l.mesh.scale.set(d * tanY * state.aspect * l.margin[0], d * tanY * l.margin[1], 1);
    l.mesh.position.copy(P).addScaledVector(projDir, d);
    l.mesh.quaternion.copy(projector.quaternion);
    l.mat.uniforms.uEdge.value = state.explode * 0.9;
  }
  rigMat.opacity = state.explode * 0.55;
  rigLines.visible = state.explode > 0.01;
}

/* ================================================================== */
/* interaction                                                         */
/* ================================================================== */

const pointer = new THREE.Vector2();
const pointerTarget = new THREE.Vector2();
let idle = 0;

function onPointer(e) {
  const t = e.touches ? e.touches[0] : e;
  if (!t) return;
  pointerTarget.set((t.clientX / state.w) * 2 - 1, (t.clientY / state.h) * 2 - 1);
  idle = 0;
  hint.classList.add('gone');
}
window.addEventListener('pointermove', onPointer, { passive: true });
window.addEventListener('touchmove', onPointer, { passive: true });
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { state.running = !document.hidden; });

/* ================================================================== */
/* frame                                                               */
/* ================================================================== */

let last = performance.now() / 1000;
let elapsed = 0;
const camPos = new THREE.Vector3().copy(CAM_HOME);
const camLook = new THREE.Vector3().copy(CAM_LOOK);
const tmp = new THREE.Vector3();
const explodeCam = new THREE.Vector3();

let fps = 60, acc = 0, frames = 0, slowFor = 0;

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function projectLight(world, out) {
  tmp.copy(world).project(projector);
  out.set(tmp.x * state.aspect, tmp.y);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000;
  const dt = Math.min(now - last, 0.05);
  last = now;
  if (!state.running) return;

  elapsed += dt;
  const t = elapsed;
  U.time.value = t;
  idle += dt;

  /* --- the scene's one scheduled event ---------------------------- */
  const period = 26, travel = 9;
  const tt = t % period;
  if (tt < travel) {
    const p = tt / travel;
    train.position.x = THREE.MathUtils.lerp(-110, 110, p);
    train.visible = true;
    const env = Math.sin(Math.PI * p);
    U.lightI.value[2] = env * 0.85;
    geoMat.uniforms.uLightWI.value[1] = env * 1.5;
    deckMat.uniforms.uLightWI.value[1] = env * 1.5;
    TRAIN_POS.set(train.position.x, train.position.y, train.position.z);
    geoMat.uniforms.uLightP.value[1].copy(TRAIN_POS);
    deckMat.uniforms.uLightP.value[1].copy(TRAIN_POS);
  } else {
    train.visible = false;
    U.lightI.value[2] = 0;
    geoMat.uniforms.uLightWI.value[1] = 0;
    deckMat.uniforms.uLightWI.value[1] = 0;
  }

  // the sign breathes; so does everything it touches
  const signPulse = 1.05 + 0.13 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 7.1);
  U.lightI.value[1] = 1.05 * signPulse;
  geoMat.uniforms.uLightWI.value[0] = 3.4 * signPulse;
  deckMat.uniforms.uLightWI.value[0] = 3.4 * signPulse;

  /* --- camera ------------------------------------------------------ */
  state.explode = damp(state.explode, state.explodeTarget, 3.2, dt);

  const drift = reduced ? 0.25 : 1;
  const dx = Math.sin(t * 0.11) * 0.42 + Math.sin(t * 0.047 + 1.7) * 0.26;
  const dy = Math.sin(t * 0.083 + 0.6) * 0.20;
  pointer.x = damp(pointer.x, pointerTarget.x, 2.2, dt);
  pointer.y = damp(pointer.y, pointerTarget.y, 2.2, dt);

  camPos.set(
    CAM_HOME.x + (dx - pointer.x * 0.85) * drift,
    CAM_HOME.y + (dy - pointer.y * 0.42) * drift,
    CAM_HOME.z + Math.sin(t * 0.062) * 0.35 * drift
  );
  camLook.set(
    CAM_LOOK.x + (dx * 0.35 - pointer.x * 0.22) * drift,
    CAM_LOOK.y + (dy * 0.5 - pointer.y * 0.18) * drift,
    CAM_LOOK.z
  );

  if (state.explode > 0.0005) {
    // swing round the stack at 40–68° off the projector axis: far enough to
    // see the cards as cards, near enough to still read what is painted on them
    const phi = THREE.MathUtils.degToRad(54 + Math.sin(t * 0.13) * 14);
    const R = 116;
    tmp.copy(projector.position).addScaledVector(projDir, 46);
    explodeCam.set(
      tmp.x - Math.sin(phi) * R,
      tmp.y + 30 + Math.sin(t * 0.09) * 4,
      tmp.z + Math.cos(phi) * R
    );
    camPos.lerp(explodeCam, state.explode);
    camLook.lerp(tmp, state.explode);
    layoutLayers();
  }

  camera.position.copy(camPos);
  camera.lookAt(camLook);
  U.camPos.value.copy(camera.position);

  /* --- lights, in both spaces at once ------------------------------ */
  U.lightQ.value[0].copy(U.sun.value);
  projectLight(SIGN_POS, U.lightQ.value[1]);
  projectLight(TRAIN_POS, U.lightQ.value[2]);

  for (const l of cityLayers) {
    const src = l.cfg.rimLight === 1 ? U.lightQ.value[1] : U.lightQ.value[0];
    const u = l.mat.uniforms.uRimDir.value;
    u.set(src.x - 0, src.y - l.mat.uniforms.uBaseY.value).normalize();
  }

  /* --- draw -------------------------------------------------------- */
  renderer.info.reset();
  renderer.setRenderTarget(sceneRT);
  renderer.clear();
  renderer.render(scene, camera);

  renderer.setRenderTarget(bloomA);
  renderer.render(brightPass.scene, fsCam);

  blurPass.uniforms.uTex.value = bloomA.texture;
  blurPass.uniforms.uDir.value.set(1 / bloomA.width, 0);
  renderer.setRenderTarget(bloomB);
  renderer.render(blurPass.scene, fsCam);

  blurPass.uniforms.uTex.value = bloomB.texture;
  blurPass.uniforms.uDir.value.set(0, 1 / bloomA.height);
  renderer.setRenderTarget(bloomA);
  renderer.render(blurPass.scene, fsCam);

  renderer.setRenderTarget(null);
  renderer.render(postPass.scene, fsCam);

  /* --- keep the frame budget --------------------------------------- */
  acc += dt; frames++;
  if (acc > 0.5) {
    fps = frames / acc;
    acc = 0; frames = 0;
    if (fps < 45) { slowFor++; } else if (fps > 56) { slowFor = 0; }
    if (slowFor >= 3 && state.renderScale > 0.62) {
      state.renderScale = Math.max(0.62, state.renderScale - 0.18);
      slowFor = 0;
      resize();
    }
    if (stats) stats.textContent = fps.toFixed(0) + ' fps · ' + renderer.info.render.calls + ' calls';
  }
  window.__lofi.fps = fps;
  window.__lofi.calls = renderer.info.render.calls;
}

/* ================================================================== */
/* ui                                                                  */
/* ================================================================== */

const hint = document.getElementById('hint');
const stats = new URLSearchParams(location.search).has('stats')
  ? document.getElementById('stats') : null;
if (stats) stats.hidden = false;

function toggle(id, initial, fn) {
  const el = document.getElementById(id);
  let on = initial;
  const paint = () => { el.dataset.on = on ? '1' : '0'; };
  el.addEventListener('click', () => { on = !on; paint(); fn(on); });
  paint();
  return el;
}

toggle('t-map', true, on => { U.cameraMap.value = on ? 1 : 0; });
toggle('t-layers', false, on => { state.explodeTarget = on ? 1 : 0; });
toggle('t-grain', true, on => {
  postPass.uniforms.uGrain.value = on ? 0.055 : 0;
  postPass.uniforms.uVignette.value = on ? 0.42 : 0.22;
});

const about = document.getElementById('about');
document.getElementById('about-toggle').addEventListener('click', () => {
  about.classList.toggle('open');
});

window.__lofi = { fps: 0, calls: 0, ready: false };

resize();
frame();
requestAnimationFrame(() => { document.body.classList.add('ready'); window.__lofi.ready = true; });
setTimeout(() => hint.classList.add('gone'), 7000);
