// Голова на первом экране. Механика прочитана в коде landonorris.com:
// плоскость, выдавленная картой глубины (сила 0.25), поворот за мышью всего 0.075 рад с тяжёлым сглаживанием,
// а главный приём это жидкое пятно под курсором, в котором вместо лица проступает второй слой: шлем.
// Шлем у них настоящая GLB-модель с металлом и студийной HDRI, рисуется в отдельный буфер, кадр смешивается по пятну.
// Здесь так же: Шлем Господства (js/shlem.js) надет на голову, в прорези видно лицо в тени, глаза в пятне горят синим.
import * as THREE from './three.module.min.js';
import { fluid } from './fluid.js';
import { shlem } from './shlem.js';
import { HDRLoader } from './HDRLoader.js';

const ASPEKT = 1504 / 1152;         // портрет с дорисованными плечами (plechi.py); до этого был 928 / 1152, плечи упирались в края
const VIDNO = 0.705;                // какая доля высоты портрета видна над нижним краем экрана. Правое плечо упирается в край фото с v = 0.286:
                                    // при 0.74 этот обрез был виден вертикальной линией внизу справа
const RAZMER = 0.74;                // размер головы прежний: высота портрета считается от этой доли
const OS = new THREE.Vector3(0, 0.22, -0.05); // ось поворота головы: примерно шея, в единицах плоскости
// Посадка шлема на портрет, подобрана по кадрам proverka.py: высота шлема в высотах портрета, где у шлема прорези глаз
// (доля его высоты от центра), насколько он отодвинут назад, чтобы прорезь легла на плоскость лица
const POLE = 2.0;                    // во сколько раз плоскость шире портрета. При 1.6 на телефоне верхний край плоскости
                                     // срезал корону: там портрет ужат, и шлем вылезает за него не только вбок, но и вверх
// латы: ls рост фигуры в высотах портрета, lx во сколько раз она шире по плечам, ly высота ворота на портрете, lz глубина,
// srez где у фигуры снимается голова (доля роста от центра), lsr полуширина этого среза в долях роста, lnak наклон вперёд,
// lm масштаб мелочи на стали (фигура крупнее шлема), lw во сколько раз размаху плеч позволено быть шире кадра
// bw, bv: ширина и высота болванки головы в высотах портрета (она прячет изнанку шлема и уводит лицо в прорезях в тень).
// vls: линия волос на портрете, выше неё человека в пятне нет — там шлем
// uzh, niz: посадка для узкого экрана, см. razmer(). hod: во сколько раз зрачки нежити ходят дальше живых, см. шейдер.
// dyra: радиус в пикселях, которым затягиваются дыры внутри пятна (точки застоя жидкости), porog: с какой
// скорости жидкость считается пятном. Эти два ходят парой: кольцо раздувает пятно наружу, порог возвращает край назад
const POSADKA = { vys: 1.25, glaza: -0.153, z: -0.35, bw: 0.322, bv: 0.50, vls: 0.76, uzh: 1.45, niz: 0.05, hod: 1.15, dyra: 28, porog: 0.10,
  ls: 2.2, lx: 1.1, lr: 0.06, lt: 0.165, ly: 0.45, lz: -0.9, srez: 0.29, lsr: 0.115, lnak: 0, lm: 3.2, lw: 2.0 };
// lr, lt: насколько и от какой полуширины наплечники разъезжаются в стороны. srez сажает фигуру так, чтобы наплечники
// легли на концы плеч, а не на трапеции: у портрета торс расширяется до края кадра ниже нижней кромки экрана, поэтому
// пластины наполовину уходят под низ, как уходят настоящие плечи на фото
for (const [k, v] of new URLSearchParams(location.search)) if (k in POSADKA) POSADKA[k] = +v;   // подгонка с адресной строки: ?vys=1.2&z=-0.3

const vert = /* glsl */`
  uniform sampler2D tKarta;
  uniform float uDepth, uYaw, uPitch;
  uniform vec3 uOs;
  varying vec2 vUv;

  void main() {
    vUv = uv * ${POLE.toFixed(2)} - (${POLE.toFixed(2)} - 1.0) * 0.5;      // плоскость шире портрета, за его краями человека нет, а шлем есть
    vec3 p = position;
    p.z += (texture2D(tKarta, vUv).r - 0.55) * uDepth;

    // плечи стоят, поворачивается голова: вес поворота растёт от воротника к макушке
    float w = smoothstep(0.30, 0.52, vUv.y);
    vec3 q = p - uOs;
    float a = uYaw * w, b = uPitch * w;
    q = vec3(q.x * cos(a) + q.z * sin(a), q.y, -q.x * sin(a) + q.z * cos(a));
    q = vec3(q.x, q.y * cos(b) - q.z * sin(b), q.y * sin(b) + q.z * cos(b));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(q + uOs, 1.0);
  }
`;

const frag = /* glsl */`
  precision highp float;
  uniform sampler2D tA, tB, tN, tKarta, tFluid, tShlem;   // tN: тот же портрет нежитью (ref/ya-5.jpg, череп сквозь кожу, посажен по радужкам в nezhit.py)
  uniform float uSmile, uTime, uIntro, uVse;
  uniform vec2 uRes, uVzglyad, uGlazL, uGlazR, uDyra;
  uniform float uVorot, uVolosy;
  uniform float uRad;                                // радужки нежити: середины и радиус в uv портрета (glaza.json). В uv, а не на экране: так свет сам едет с поворотом головы
  varying vec2 vUv;

  // Взгляд. Глаз собран слоями из glaza.py: веки неподвижны и работают маской (альфа белка), под ними чистый белок,
  // по нему ездит полный диск радужки, блик лампы стоит на месте. Атласы: верхняя половина нейтральный портрет, нижняя с улыбкой
  uniform sampler2D tBelok, tRaduzhka, tBlik;
  uniform vec4 uOkno;                                // полоса с глазами в uv портрета: x, y, ширина, высота
  vec4 atlas(sampler2D t, vec2 q) { return mix(texture2D(t, vec2(q.x, 0.5 + q.y * 0.5)), texture2D(t, vec2(q.x, q.y * 0.5)), uSmile); }
  vec3 glaza(vec3 lico, vec2 uv) {
    vec2 q = (uv - uOkno.xy) / max(uOkno.zw, vec2(1e-5));
    if (uOkno.z == 0.0 || q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return lico;
    vec4 belok = atlas(tBelok, q), blik = atlas(tBlik, q);
    vec4 rad = atlas(tRaduzhka, clamp(q - uVzglyad / uOkno.zw, 0.0, 1.0));
    vec3 g = mix(belok.rgb, rad.rgb * (0.78 + 0.22 * smoothstep(0.35, 0.9, belok.a)), rad.a);   // у века радужка в тени
    return mix(lico, mix(g, blik.rgb, blik.a), smoothstep(0.35, 0.65, belok.a));
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    // карта из podgotovka.py: R глубина, G маска человека
    vec3 karta = texture2D(tKarta, vUv).rgb;

    // Пятно: там, где жидкость ещё движется. Край жёсткий, сглажен на ширину пикселя.
    // Скорость беру наибольшую по кольцу вокруг пикселя. Жидкость несжимаемая, и внутри завихрения у неё есть точки
    // застоя, где скорость падает до нуля: в середине пятна открывались дыры, а в дыре весь второй слой выключается
    // (сталь умножена на mask) и сквозь шлем проступала живая кожа. Кольцо эти дыры затягивает, порог поднят,
    // чтобы наружный край не расползся вместе с ними
    vec2 fu = gl_FragCoord.xy / uRes;
    float skorost = length(texture2D(tFluid, fu).xy);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      skorost = max(skorost, length(texture2D(tFluid, fu + vec2(cos(a), sin(a)) * uDyra).xy));
    }
    float mask = smoothstep(0.0, 1.0, (skorost - ${POSADKA.porog.toFixed(3)}) / max(fwidth(skorost), 0.0005) + 0.5);

    // вступление: андроид сходит сверху вниз неровной кромкой
    float n = noise(vUv * 9.0 + uTime * 0.15) + 0.5 * noise(vUv * 31.0);
    float kromka = vUv.y - (1.25 - uIntro * 1.6) + (n / 1.5 - 0.5) * 0.10;
    mask = max(mask, 1.0 - smoothstep(0.0, 0.004, kromka));

    mask = max(mask, uVse);
    // буфер шлема: цвет линейный и умножен на покрытие. Внутри шлема стоит болванка головы с альфой 0.6 и чёрным цветом:
    // она закрывает изнанку шлема, а лицо в прорези уводит в тень
    vec4 sh = texture2D(tShlem, gl_FragCoord.xy / uRes);
    vec3 stal = sh.rgb / max(sh.a, 1e-4);
    stal = (stal * (2.51 * stal + 0.03)) / (stal * (2.43 * stal + 0.59) + 0.14);              // ACES, как у рендера в экран
    stal = pow(clamp(stal, 0.0, 1.0), vec3(1.0 / 2.2));

    float vKadre = step(0.0, vUv.x) * step(vUv.x, 1.0) * step(0.0, vUv.y) * step(vUv.y, 1.0);
    float kofta = mask * (1.0 - smoothstep(uVorot - 0.03, uVorot + 0.015, vUv.y));          // ниже ворота человек в пятне исчезает: там латы
    // Выше линии волос человек в пятне исчезает так же: у лича там шлем, а не причёска Артура. Без этого при повороте
    // головы сбоку от шлема вылезала полоска настоящих волос — сам шлем её не перекрывает, он объёмный и на повороте
    // уводит свой край внутрь. Затемнять её болванкой бесполезно: вместо волос получалось серое пятно с мягким краем
    float volosy = mask * smoothstep(uVolosy - 0.02, uVolosy + 0.02, vUv.y);
    float alpha = max(karta.g * vKadre * (1.0 - max(kofta, volosy)), sh.a * mask);
    if (alpha < 0.01) discard;

    vec3 chelovek = glaza(mix(texture2D(tA, vUv).rgb, texture2D(tB, vUv).rgb, uSmile), vUv);
    // Глаза нежити нарисованы на кадре, сдвинуть их можно только вместе с куском текстуры: вокруг каждой радужки
    // беру кружок и веду его за курсором чуть дальше, чем ходит живой глаз: прорезь шлема съедает часть хода.
    // Гаснет сдвиг не сразу за радужкой, а далеко: на кольце 0.75..1.35 весь ход ложился на двенадцать пикселей текстуры
    // и жал нижнее веко вдвое. На широком затухании веко едет за взглядом, как живое, и ничего не рвёт — но вместе с ним
    // едет и кусок лица, поэтому сам ход пришлось убавить с 1.7: иначе в прорези не взгляд, а сползающая картинка
    vec2 uvN = vUv;
    for (int i = 0; i < 2; i++) {
      vec2 c = i == 0 ? uGlazL : uGlazR;
      float d = length((vUv - c) * vec2(${ASPEKT.toFixed(4)}, 1.0)) / uRad;
      uvN -= uVzglyad * ${POSADKA.hod.toFixed(2)} * (1.0 - smoothstep(0.85, 2.1, d));
    }
    vec3 nezhit = texture2D(tN, uvN).rgb;                                 // нежить не улыбается: в пятне всегда нейтральный портрет
    vec3 svet = vec3(0.0);

    // Глаза нежити настоящие: радужка со зрачком с кадра Артура. Поэтому саму радужку не закрашиваю, а разжигаю умножением
    // (зрачок так остаётся чёрным), свет же идёт кольцом за её краем и языками вверх. Свет ложится и поверх кромки шлема
    if (mask > 0.001) {
      for (int i = 0; i < 2; i++) {
        vec2 c = i == 0 ? uGlazL : uGlazR;
        vec2 p = (vUv - c) * vec2(${ASPEKT.toFixed(4)}, 1.0) / uRad;      // uv растянут по x: делаю круг круглым
        float storona = i == 0 ? -1.0 : 1.0, d = length(p);
        nezhit *= 1.0 + 1.1 * (1.0 - smoothstep(0.45, 1.05, d));
        float oreol = exp(-d * 0.6) * smoothstep(0.9, 2.1, d);            // дырка по радужке: зрачок и синева остаются открытыми
        float h = max(p.y - 1.0, 0.0), snos = p.x - storona * h * 0.55 + (noise(vec2(h * 1.3 - uTime * 1.9, float(i) * 7.0 + uTime * 0.3)) - 0.5) * h * 0.9;
        // пламя разгорается над веком плавно: жёсткий порог по высоте дал бы прямую линию поперёк всего кадра
        float yazyk = exp(-snos * snos / (0.5 + h * 0.18)) * smoothstep(0.0, 1.4, p.y - 1.0) * smoothstep(6.0, 1.4, h) * (0.35 + 0.65 * noise(vec2(p.x * 2.0 + float(i) * 3.0, h * 1.7 - uTime * 2.6)));
        svet += vec3(0.25, 0.72, 1.0) * (oreol * 0.80 + yazyk * 0.65);
      }
    }
    vec3 col = mix(mix(chelovek, nezhit, mask), stal, sh.a * mask) + svet * mask;   // у болванки цвет чёрный: лицо в прорези темнеет и синеет
    gl_FragColor = vec4(col, alpha);
  }
`;

export function golova(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.z = 1 / Math.tan(THREE.MathUtils.degToRad(14)); // видимая высота на z=0 равна 2
  const zhidkost = fluid(renderer);

  const zagr = new THREE.TextureLoader();
  const tex = (url) => { const t = zagr.load(url); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; };
  const u = {
    tA: { value: tex('assets/img/ya-1.webp') }, tB: { value: tex('assets/img/ya-2.webp') },
    tKarta: { value: tex('assets/img/karta.png') }, tFluid: { value: null }, tShlem: { value: null }, tN: { value: tex('assets/img/ya-5.webp') }, uRes: { value: new THREE.Vector2() }, uDyra: { value: new THREE.Vector2() },
    uDepth: { value: 0.25 }, uYaw: { value: 0 }, uPitch: { value: 0 }, uOs: { value: OS },
    uSmile: { value: 0 }, uTime: { value: 0 }, uIntro: { value: 0 }, uVse: { value: /[?&]maska=1/.test(location.search) ? 1 : 0 },   // ?maska=1 показывает шлем целиком, для подгонки посадки
    tBelok: { value: tex('assets/img/glaza-belok.png') }, tRaduzhka: { value: tex('assets/img/glaza-raduzhka.png') }, tBlik: { value: tex('assets/img/glaza-blik.png') },
    uOkno: { value: new THREE.Vector4() }, uVzglyad: { value: new THREE.Vector2() }, uGlazL: { value: new THREE.Vector2(0.444, 0.6713) }, uGlazR: { value: new THREE.Vector2(0.5552, 0.673) }, uRad: { value: 0.0293 }, uVorot: { value: POSADKA.ly }, uVolosy: { value: POSADKA.vls },
  };
  // где на портрете глаза, знает разметка лица: glaza.py кладёт полосу и центры радужек в glaza.json.
  // У нежити радужки стоят там же: кадр черепа посажен именно по ним (nezhit.py), поэтому свет вокруг глаз берёт те же центры
  fetch('assets/img/glaza.json').then((r) => r.json()).then((d) => {
    u.uOkno.value.fromArray(d.okno);
    const c = d.centry['ya-1'];
    u.uGlazL.value.fromArray(c.L); u.uGlazR.value.fromArray(c.R);
    u.uRad.value = (c.L[2] / 1504) * ASPEKT;      // радиус радужки в пикселях кадра 1504 x 1152 → в долях высоты портрета
  });

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(POLE, POLE, 300, 372),
    new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: u, transparent: true }),
  );
  scene.add(mesh);

  // шлем рисуется той же камерой в свой буфер. Шарнир стоит в оси поворота головы, шлем поворачивается вместе с ней
  const mirSh = new THREE.Scene(), sharnir = new THREE.Group(), bufer = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
  u.tShlem.value = bufer.texture; mirSh.add(sharnir);
  new HDRLoader().load('assets/img/studiya-shlem.hdr', (hdr) => { const pm = new THREE.PMREMGenerator(renderer); mirSh.environment = pm.fromEquirectangular(hdr).texture; pm.dispose(); hdr.dispose(); });
  // Света мало и он холодный: у металла вся картинка это отражения, и при прежних 3 и 10 железо выбивало в белое зеркало
  const holod = new THREE.DirectionalLight('#bfe4ff', 1.2); holod.position.set(-3, 4, 5);
  const kontur = new THREE.DirectionalLight('#39b8ff', 3); kontur.position.set(4, -1, -3);         // ледяной контровой, цвет Ледяной Скорби
  mirSh.add(holod, kontur);
  let gotov = false;
  const os = shlem(() => { gotov = true; }); sharnir.add(os);
  // болванка головы: закрывает изнанку шлема и пишет в буфер чёрный цвет с альфой (лицо в прорези в тени), к шее тень сходит на нет.
  // На уровне глаз тень раскрывается почти в ноль: Артур просил видеть в прорезях настоящие глаза нежити, а не синие огни
  const bolvanka = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), new THREE.ShaderMaterial({
    blending: THREE.NoBlending,
    vertexShader: 'varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying float vY;
      void main() {
        float okno = smoothstep(0.105, 0.035, abs(vY - 0.014));
        gl_FragColor = vec4(0.0, 0.0, 0.0, (0.5 + 0.42 * smoothstep(-0.14, -0.02, vY)) * smoothstep(-0.5, -0.2, vY) * (1.0 - 0.82 * okno));
      }`,
  }));
  sharnir.add(bolvanka);
  // Латы вместо кофты: цельная фигура Короля-лича (скульпт Yury Misiyuk, CC-BY-4.0, та же сталь, что у шлема), в кадр попадают
  // наплечники и грудь. Голова у фигуры своя, она снимается в шейдере стали: выбрасывается всё выше ворота и ближе к оси, чем полуширина головы.
  // Стоит на плечах и за головой не поворачивается. Первый вариант, бюст от 4DigitalARTS, Артур забраковал: наплечники мелкие и мыльные
  const srez = { value: new THREE.Vector2(9, 0) }, razvod = { value: new THREE.Vector2(POSADKA.lr, POSADKA.lt) };
  const laty = shlem(null, 'assets/model/lich.glb', srez, POSADKA.lm, razvod); laty.rotation.y = Math.PI; mirSh.add(laty);

  let W = 1, H = 1, pw = 1, ph = 1;
  function razmer() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(u.uRes.value); bufer.setSize(u.uRes.value.x, u.uRes.value.y);
    u.uDyra.value.set(POSADKA.dyra / W, POSADKA.dyra / H);    // радиус кольца в долях экрана: по x и y разный, чтобы кольцо было круглым в пикселях
    zhidkost.razmer(W, H);
    // нижние 26 % портрета (там плечи упираются в края фото) прячем под низ экрана
    ph = 2 * 0.97 / RAZMER; pw = ph * ASPEKT;
    const shir = 2 * camera.aspect;                 // видимая ширина
    const uzko = ph * 0.8056 / (shir * 1.6);         // узкий экран: голова по ширине, плечи режутся с боков. Меряется по прежней ширине кадра (928 / 1152): голова в нём та же
    // На телефоне мало ужать по прежней мерке: шлем всё равно упирается в оба края, а от лат остаются одни внутренние углы.
    // Поэтому там портрет ужимается ещё в uzh раз (голова становится вдвое уже плеч, наплечники ложатся поперёк низа),
    // и кадр поднимается: низ портрета прячу под экран не на 1 - VIDNO его высоты, а всего на niz, иначе голова уезжает в подвал.
    // Обе поправки въезжают плавно на границе узкого: порогом кадр прыгал бы, когда окно на десктопе тянут в узкое
    const tesno = THREE.MathUtils.smoothstep(uzko, 1, 1.15);
    ph /= Math.max(uzko, 1) * (1 + (POSADKA.uzh - 1) * tesno); pw = ph * ASPEKT;
    mesh.scale.set(pw, ph, 1);
    mesh.position.y = -1 + ph * (0.5 - (1 - VIDNO) + (1 - VIDNO - POSADKA.niz) * tesno);

    const naPortrete = (v) => mesh.position.y + (v - 0.5) * ph;   // высота точки портрета в мире
    sharnir.position.set(OS.x * pw, mesh.position.y + OS.y * ph, OS.z);
    const vys = POSADKA.vys * ph;
    os.scale.setScalar(vys); os.position.set(-sharnir.position.x, naPortrete(0.672) - POSADKA.glaza * vys - sharnir.position.y, POSADKA.z);
    // Латы стоят глубже портрета, оттуда всё видно мельче: множитель дали нужен, чтобы считать их разворот в мерках экрана
    const dal = camera.position.z / (camera.position.z - POSADKA.lz);
    // У скульпта размах наплечников 0.58 роста. На телефоне фигура во весь разворот не влезает и от плеч по краям остаются
    // чёрные полосы: там рост урезаю до размаха чуть шире кадра, наплечники целиком ложатся поперёк низа
    const ls = Math.min(POSADKA.ls, shir * POSADKA.lw / (0.58 * POSADKA.lx * ph * dal));
    laty.scale.setScalar(ls * ph); laty.scale.x *= POSADKA.lx; laty.rotation.x = POSADKA.lnak;
    laty.position.set(0, naPortrete(POSADKA.ly) - POSADKA.srez * ls * ph, POSADKA.lz);
    srez.value.set(naPortrete(POSADKA.ly), POSADKA.lsr * POSADKA.lx * ls * ph);   // срез едет вместе с lx: латы растянуты по x, значит и голова у них шире
    // ширина и высота от высоты портрета: ширина кадра после plechi.py другая, а голова та же. А по z болванка живёт
    // внутри шлема, и место ей считаю от шлема: шлем отодвинут назад на постоянные POSADKA.z, а сам мельчает вместе с портретом,
    // и болванка на постоянном z = 0.12 на телефоне пробивала ему маску — вместо лица в прорезях был голый череп
    bolvanka.scale.set(POSADKA.bw * ph, POSADKA.bv * ph, 0.37 * ph); bolvanka.position.set(-sharnir.position.x, naPortrete(0.665) - sharnir.position.y, POSADKA.z - 0.0043 * vys);
  }
  razmer(); addEventListener('resize', razmer);

  // курсор в координатах холста: -1..1, y вверх
  const mysh = { x: 0, y: 0, tx: 0, ty: 0, byl: false };
  addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mysh.tx = ((e.clientX - r.left) / r.width) * 2 - 1; mysh.ty = -(((e.clientY - r.top) / r.height) * 2 - 1); mysh.byl = true; mysh.kogda = performance.now();
  });

  let t0 = performance.now(), vidno = true;
  new IntersectionObserver(([e]) => { vidno = e.isIntersecting; }).observe(canvas);

  function kadr(now) {
    requestAnimationFrame(kadr);
    if (!vidno) { t0 = now; return; }
    const dt = Math.min((now - t0) / 1000, 0.05); t0 = now;
    const t = (u.uTime.value += dt);
    if (gotov || t > 4) u.uIntro.value = Math.min(1, u.uIntro.value + dt / 2.2);   // вступление ждёт шлем: страница открывается в шлеме, он сходит сверху вниз

    // пока мыши нет (тач, первые секунды), курсор-призрак сам проходит по лицу, чтобы приём был виден
    if (!mysh.byl) { mysh.tx = Math.sin(t * 0.9) * 0.16 * (H / W) * 1.8; mysh.ty = 0.12 + Math.sin(t * 1.7) * 0.34; }

    const k = 1 - Math.pow(0.2, dt);                // тяжёлое сглаживание, как ease 0.025 у них
    mysh.x += (mysh.tx - mysh.x) * k; mysh.y += (mysh.ty - mysh.y) * k;
    u.uYaw.value = mysh.x * 0.075;
    u.uPitch.value = -mysh.y * 0.075;

    zhidkost.shag(u.uIntro.value < 1 ? null : [(mysh.tx + 1) / 2, (mysh.ty + 1) / 2], dt);
    u.tFluid.value = zhidkost.tekstura;

    // курсор остановился у лица: пятно растаяло, человек улыбнулся
    const cx = (mysh.tx * camera.aspect) / pw + 0.5, cy = (mysh.ty - mesh.position.y) / ph + 0.5;
    const uLica = Math.hypot((cx - 0.5) * ASPEKT, cy - 0.66);
    const cel = mysh.byl ? THREE.MathUtils.smoothstep(0.55 - uLica, 0, 0.3) : 0;
    u.uSmile.value += (cel - u.uSmile.value) * (1 - Math.pow(0.02, dt));

    // глаза быстрее головы. Ход радужки 11 px по горизонтали и 3 px по вертикали на кадре 1856 × 2304:
    // по вертикали у живого глаза двигается и веко, без него больший ход выдаёт подделку
    let gx = mysh.tx * camera.aspect, gy = mysh.ty - (mesh.position.y + (0.672 - 0.5) * ph);
    const s = Math.hypot(gx, gy) + 0.45, kg = 1 - Math.pow(0.0005, dt);
    u.uVzglyad.value.x += (gx / s * 0.0058 - u.uVzglyad.value.x) * kg;
    u.uVzglyad.value.y += (gy / s * 0.0013 - u.uVzglyad.value.y) * kg;

    // шлем: поворот как у головы, студия в отражениях едет за курсором, от этого блики скользят по стали
    // шлем в 455 тысяч треугольников рисуется, только пока его видно: вступление, курсор-призрак, и 4 секунды после движения мыши (пятно тает быстрее)
    if (gotov && (u.uIntro.value < 1 || u.uVse.value || !mysh.byl || now - mysh.kogda < 4000)) {
      sharnir.rotation.set(u.uPitch.value, u.uYaw.value, 0);
      mirSh.environmentRotation.set(mysh.y * 0.35, mysh.x * 0.9 + t * 0.04, 0);
      sharnir.updateMatrixWorld(true);
      renderer.setRenderTarget(bufer); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(mirSh, camera); renderer.setRenderTarget(null);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(kadr);
}
