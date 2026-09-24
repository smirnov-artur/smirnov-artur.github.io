// Шлем для пятна на первом экране. У Норриса в пятне настоящая GLB-модель шлема с металлом (metalness 1, roughness 0.05,
// envMapIntensity 3 и студийная HDRI), а не картинка. Здесь так же: скульпт Helm of Domination (PDM_32_1998, CC-BY-4.0),
// упрощённый в shlem.cjs. Развёртки у скульпта нет, поэтому потёртость считается из запечённой в цвет вершин вогнутости:
// в щелях сталь тёмная и матовая, на рёбрах светлая и полированная.
import * as THREE from './three.module.min.js';
import { GLTFLoader } from './GLTFLoader.js';
import { MeshoptDecoder } from './meshopt_decoder.module.js';

// Ковка. Частота задаётся не в высотах модели, а в зёрнах на высоту экрана: n1, n2 — следы молота (ими гнётся нормаль),
// n3 — выработка (только шероховатость). Так зерно всегда одного размера в пикселях, а не мельчает вместе с фигурой:
// от частоты в мерках модели мелкая фигура в зале кейсов рассыпалась в искрящуюся крапинку.
// sila — размах изгиба нормали, sher — размах шероховатости. Подбирается по кадрам, поэтому переопределяется
// с адресной строки так же, как посадка: ?sila=0.004&n1=16&sher=0.1
const KOVKA = { sila: 0.013, n1: 20, n2: 42, n3: 70, sher: 0.22 };
for (const [k, v] of new URLSearchParams(location.search)) if (k in KOVKA) KOVKA[k] = +v;

// Железо, а не хром. У металла базовый цвет это и есть отражательность, и светлый цвет при низкой шероховатости
// давал зеркало: на широких пластинах форма пропадала под сплошным бликом, шлем читался мятой фольгой.
// cvet — тёмное вороненое железо (холодный серо-синий), shero — шероховатость на ровной пластине, pol — нижний
// предел на отполированных рёбрах (ниже него начинается зеркало), env — сколько студии в отражениях,
// rebra и rez — сила и узость ледяного френеля по кромкам, svetCvet — акцент сайта.
// Всё подбирается по кадрам: ?cvet=2a3138&shero=0.55&rebra=1.2&rez=9
const ZHELEZO = { cvet: '#353b44', shero: 0.58, pol: 0.34, env: 0.50,rebra: 0.8, rez: 12, svetCvet: '#1f9cff' };
for (const [k, v] of new URLSearchParams(location.search)) if (k in ZHELEZO) ZHELEZO[k] = typeof ZHELEZO[k] === 'string' ? '#' + v.replace('#', '') : +v;

// srez: необязательная униформа vec2 (высота, полуширина в мире): всё, что выше и ближе к оси, выбрасывается. Так у фигуры снимается голова
// mash: во сколько раз модель крупнее шлема. Вогнутость нормируется по всей сетке, поэтому у фигуры в полный рост
// на широких пластинах она почти нулевая, а разводы растягиваются на пол-экрана: у стали пропадает и грязь, и размер. Множитель возвращает шлемовский масштаб мелочи
// razvod: необязательная униформа vec2 (насколько раздвинуть плечи в долях роста, с какой полуширины начинается наплечник).
// Масштаб по x раздувает и грудь, и шею: фигура становится толстой, а плечи всё равно сидят вместе. Поэтому наплечники
// разъезжаются в стороны прямо в вершинном шейдере, а грудь и ворот остаются на месте
export function stal(srez, mash = 1, razvod) {
  const m = new THREE.MeshPhysicalMaterial({ color: ZHELEZO.cvet, metalness: 1, roughness: ZHELEZO.shero, envMapIntensity: ZHELEZO.env, vertexColors: true });
  const akcent = new THREE.Color(ZHELEZO.svetCvet).convertSRGBToLinear();   // свечение складывается до тонмаппинга, поэтому цвет нужен линейный
  m.userData.uMesto = { value: new THREE.Matrix4() };   // позиции в файле сжаты в целые числа, шуму нужны координаты шлема (высота 1)
  m.userData.uMestoObr = { value: new THREE.Matrix4() };
  // x: высота модели в мире, её shlem() обновляет сам перед отрисовкой — из неё считается частота зерна.
  // y: глушитель силы ковки, его ставит тот, кто модель поставил: издали (зал кейсов) рельеф надо приглушать
  m.userData.uKovka = { value: new THREE.Vector2(1, 1) };
  m.onBeforeCompile = (s) => {
    s.uniforms.uMesto = m.userData.uMesto; s.uniforms.uKovka = m.userData.uKovka; if (srez) s.uniforms.uSrez = srez;
    if (razvod) { s.uniforms.uRazvod = razvod; s.uniforms.uMestoObr = m.userData.uMestoObr; }
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
        varying vec3 vMesto, vMir; uniform mat4 uMesto;
        ${razvod ? 'uniform mat4 uMestoObr; uniform vec2 uRazvod;' : ''}`).replace('#include <begin_vertex>', `#include <begin_vertex>
        vMesto = (uMesto * vec4(position, 1.0)).xyz;
        ${razvod ? `vec3 sdvig = vec3(sign(vMesto.x) * uRazvod.x * smoothstep(uRazvod.y, uRazvod.y * 2.2, abs(vMesto.x)), 0.0, 0.0);
        transformed += (uMestoObr * vec4(sdvig, 0.0)).xyz; vMesto += sdvig;` : ''}
        vMir = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMesto, vMir; uniform vec2 uSrez, uKovka;
        float hsh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float shum(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hsh(i), hsh(i + vec3(1, 0, 0)), f.x), mix(hsh(i + vec3(0, 1, 0)), hsh(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(hsh(i + vec3(0, 0, 1)), hsh(i + vec3(1, 0, 1)), f.x), mix(hsh(i + vec3(0, 1, 1)), hsh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
        float vognutost, patina, relef, vyrabotka;`)
      .replace('#include <color_fragment>', `
        ${srez ? 'if (vMir.y > uSrez.x && abs(vMir.x) < uSrez.y) discard;' : ''}
        vognutost = clamp(((vColor.r - 0.5) * 1.6 + (vColor.g - 0.5) * 1.3) * ${mash.toFixed(2)}, -1.0, 1.0);      // минус ребро, плюс щель
        patina = shum(vMesto * ${(3.2 * mash).toFixed(2)}) * 0.6 + shum(vMesto * ${(15.0 * mash).toFixed(2)}) * 0.4;                          // крупные разводы на стали
        float zerno = uKovka.x * 0.5;                                                                   // «столько-то зёрен в высоту экрана» → частота по vMesto: экран это 2 единицы мира
        relef = shum(vMesto * ${KOVKA.n1.toFixed(1)} * zerno) * 0.75 + shum(vMesto * ${KOVKA.n2.toFixed(1)} * zerno) * 0.25;   // ковка: пологие следы молота, ими гнётся нормаль
        vyrabotka = shum(vMesto * ${KOVKA.n3.toFixed(1)} * zerno);                                      // выработка: в неё нормаль не гну (зерно мелкое, пошла бы рябь), только шероховатость и цвет
        diffuseColor.rgb *= mix(1.0, 0.16, smoothstep(0.05, 0.9, vognutost)) * mix(0.72, 1.0, patina) * (1.0 + 0.35 * smoothstep(0.0, -0.7, vognutost)) * mix(mix(1.0, 0.95, uKovka.y), mix(1.0, 1.05, uKovka.y), relef * 0.6 + vyrabotka * 0.4);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(${ZHELEZO.shero.toFixed(3)} + 0.38 * smoothstep(-0.1, 0.8, vognutost) + (patina - 0.5) * 0.22 - 0.1 * smoothstep(0.0, -0.7, vognutost)
          + ((relef - 0.5) * 0.16 + (vyrabotka - 0.5) * ${KOVKA.sher.toFixed(3)}) * uKovka.y * mix(0.35, 1.0, 1.0 - smoothstep(0.0, 0.45, abs(vognutost))), ${ZHELEZO.pol.toFixed(3)}, 1.0);`)
      // Ледяной акцент: френель по кромкам, то есть там, где нормаль ушла от взгляда — силуэт и рёбра каждого лезвия.
      // Синеву пробовал зажигать и в щелях, по запечённой в цвет вершин вогнутости, и выбросил: на упрощённой сетке
      // щели выходят кусками в пол-пластины, и синева ложится не свечением, а краской
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fren = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), ${ZHELEZO.rez.toFixed(2)});
        totalEmissiveRadiance += vec3(${akcent.r.toFixed(4)}, ${akcent.g.toFixed(4)}, ${akcent.b.toFixed(4)}) * ${ZHELEZO.rebra.toFixed(3)} * fren;`)
      // Нормаль гну по тому же шуму. Развёртки нет, карты нормалей взять неоткуда, поэтому склон считаю экранными производными
      // готового значения (приём Миккельсена): одна выборка шума на пиксель вместо шести. Позиция нужна в том же
      // пространстве, что и нормаль, то есть видовом, отсюда viewMatrix.
      // Силу глушу на рёбрах и в щелях: там форму держит сама сетка, а зеркалит плоскость наплечника и груди
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 pv = (viewMatrix * vec4(vMir, 1.0)).xyz, dpx = dFdx(pv), dpy = dFdy(pv);
        vec3 rb1 = cross(dpy, normal), rb2 = cross(normal, dpx);
        float det = dot(dpx, rb1);
        float sila = ${KOVKA.sila.toFixed(4)} * uKovka.y * (0.3 + 0.7 * (1.0 - smoothstep(0.0, 0.45, abs(vognutost))));
        if (abs(det) > 1e-12) normal = normalize(normal - sila * (dFdx(relef) * rb1 + dFdy(relef) * rb2) / det);`);
  };
  return m;
}

// возвращает группу: шлем отцентрован, высота 1, лицом к +z
export function shlem(gotov, url = 'assets/model/shlem.glb', srez, mash = 1, razvod) {
  const os = new THREE.Group();
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, (g) => {
    const box = new THREE.Box3().setFromObject(g.scene), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    g.scene.position.sub(c); os.add(g.scene); os.userData.razmer = s.clone().divideScalar(s.y);
    g.scene.scale.setScalar(1 / (box.max.y - box.min.y)); g.scene.position.multiplyScalar(1 / (box.max.y - box.min.y));
    const mat = stal(srez, mash, razvod); os.updateMatrixWorld(true);
    // Зерно ковки считается от того, какую долю экрана модель занимает сейчас, поэтому перед отрисовкой
    // подсовываю шейдеру её высоту в мире. Иначе тот, кто поставил фигуру мельче (зал кейсов), получил бы зерно в пиксель
    const mir = new THREE.Vector3();
    g.scene.traverse((m) => { if (m.isMesh) {
      m.material = mat; mat.userData.uMesto.value.copy(os.matrixWorld).invert().multiply(m.matrixWorld);
      m.onBeforeRender = () => { mat.userData.uKovka.value.x = os.getWorldScale(mir).y; };
    } });
    mat.userData.uMestoObr.value.copy(mat.userData.uMesto.value).invert();
    os.userData.stal = mat;                      // чтобы снаружи можно было приглушить ковку: userData.uKovka.value.y
    gotov && gotov(os);
  });
  return os;
}
