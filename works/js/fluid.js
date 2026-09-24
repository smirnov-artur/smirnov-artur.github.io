// Пятно под курсором: Stable Fluids. Так же сделан курсор на landonorris.com (mnmxmx/fluid-three),
// числа оттуда: сетка 0.1 экрана, dt 0.014, затухание 0.96, сила 50, 4 итерации давления, адвекция BFECC.
// Наружу отдаётся поле скорости; где жидкость ещё движется, там и пятно.
import * as THREE from './three.module.min.js';

const CH = { DT: 0.014, ZATUHANIE: 0.96, SILA: 50, ITERACIY: 4, SETKA: 0.1, RADIUS: 0.085, SHAG: 1 / 60 };
for (const [k, v] of new URLSearchParams(location.search)) if (k in CH) CH[k] = +v;   // ?RADIUS=0.22&ZATUHANIE=0.99 — для снимков og.py
const { DT, ZATUHANIE, SILA, ITERACIY, SETKA, RADIUS, SHAG } = CH;

const vert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const sosedi = (t, k) => `
  float ${k}0 = texture2D(${t}, vUv + vec2(uPx.x * S, 0.0)).CH, ${k}1 = texture2D(${t}, vUv - vec2(uPx.x * S, 0.0)).CH;
  float ${k}2 = texture2D(${t}, vUv + vec2(0.0, uPx.y * S)).CH, ${k}3 = texture2D(${t}, vUv - vec2(0.0, uPx.y * S)).CH;`;

const frag = {
  // перенос скорости самой собой (BFECC: шаг назад, шаг вперёд, поправка на ошибку) плюс толчок от курсора
  perenos: `
    uniform sampler2D tVel; uniform vec2 uRatio, uCentr, uSila, uRadius; varying vec2 vUv;
    void main() {
      vec2 s0 = vUv - texture2D(tVel, vUv).xy * ${DT} * uRatio;
      vec2 s1 = s0 + texture2D(tVel, s0).xy * ${DT} * uRatio;
      vec2 s2 = vUv - (s1 - vUv) / 2.0;
      vec2 v = texture2D(tVel, s2 - texture2D(tVel, s2).xy * ${DT} * uRatio).xy * ${ZATUHANIE};
      float f = 1.0 - min(length((vUv - uCentr) / uRadius), 1.0);
      gl_FragColor = vec4(v + uSila * f * f, 0.0, 1.0);
    }`,
  divergenciya: `
    uniform sampler2D tVel; uniform vec2 uPx; varying vec2 vUv;
    void main() {
      float x0 = texture2D(tVel, vUv - vec2(uPx.x, 0.0)).x, x1 = texture2D(tVel, vUv + vec2(uPx.x, 0.0)).x;
      float y0 = texture2D(tVel, vUv - vec2(0.0, uPx.y)).y, y1 = texture2D(tVel, vUv + vec2(0.0, uPx.y)).y;
      gl_FragColor = vec4((x1 - x0 + y1 - y0) / 2.0 / ${DT});
    }`,
  davlenie: `
    uniform sampler2D tP, tDiv; uniform vec2 uPx; varying vec2 vUv;
    void main() {${sosedi('tP', 'p').replace(/S/g, '2.0').replace(/CH/g, 'r')}
      gl_FragColor = vec4((p0 + p1 + p2 + p3) / 4.0 - texture2D(tDiv, vUv).r);
    }`,
  // вычитаем градиент давления: жидкость становится несжимаемой, отсюда завихрения вместо размытого следа
  proekciya: `
    uniform sampler2D tP, tVel; uniform vec2 uPx; varying vec2 vUv;
    void main() {${sosedi('tP', 'p').replace(/S/g, '1.0').replace(/CH/g, 'r')}
      gl_FragColor = vec4(texture2D(tVel, vUv).xy - vec2(p0 - p1, p2 - p3) * 0.5 * ${DT}, 0.0, 1.0);
    }`,
};

export function fluid(renderer) {
  const scena = new THREE.Scene(), kamera = new THREE.Camera();
  const kvad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); scena.add(kvad);
  const u = { tVel: { value: null }, tP: { value: null }, tDiv: { value: null }, uPx: { value: new THREE.Vector2() }, uRatio: { value: new THREE.Vector2() },
    uCentr: { value: new THREE.Vector2(-9, -9) }, uSila: { value: new THREE.Vector2() }, uRadius: { value: new THREE.Vector2() } };
  const mat = Object.fromEntries(Object.entries(frag).map(([k, f]) => [k, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: f, uniforms: u, depthTest: false })]));
  // ponytail: границы не обрабатываю (у них по краю нулевая рамка), затухание само гасит скорость у краёв
  const cel = () => new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: false });
  let vel = [cel(), cel()], davl = [cel(), cel()]; const div = cel();

  function razmer(w, h) {
    const x = Math.max(32, Math.round(w * SETKA)), y = Math.max(32, Math.round(h * SETKA));
    [...vel, ...davl, div].forEach((t) => t.setSize(x, y));
    u.uPx.value.set(1 / 110, (x / y) / 110);             // как у них: шаг сетки привязан к 1100 px ширины
    u.uRatio.value.set(Math.max(x, y) / x, Math.max(x, y) / y);
    u.uRadius.value.set(RADIUS * y / x, RADIUS);         // круг, а не эллипс
  }

  const prohod = (m, kuda) => { kvad.material = mat[m]; renderer.setRenderTarget(kuda); renderer.render(scena, kamera); };
  let nakopleno = 0, bylo = null;

  // kursor: [x, y] в 0..1 от левого нижнего угла холста или null, если мышь ещё не двигалась
  function shag(kursor, dt) {
    nakopleno += dt; if (nakopleno < SHAG) return;
    nakopleno %= SHAG;
    if (kursor && bylo) { u.uCentr.value.set(...kursor); u.uSila.value.set((kursor[0] - bylo[0]) * SILA, (kursor[1] - bylo[1]) * SILA); } else u.uSila.value.set(0, 0);
    bylo = kursor && [...kursor];

    u.tVel.value = vel[0].texture; prohod('perenos', vel[1]);
    u.tVel.value = vel[1].texture; prohod('divergenciya', div);
    u.tDiv.value = div.texture;
    for (let i = 0; i < ITERACIY; i++) { u.tP.value = davl[0].texture; prohod('davlenie', davl[1]); davl.reverse(); }
    u.tP.value = davl[0].texture; prohod('proekciya', vel[0]);
    renderer.setRenderTarget(null);
  }

  return { shag, razmer, get tekstura() { return vel[0].texture; } };
}
