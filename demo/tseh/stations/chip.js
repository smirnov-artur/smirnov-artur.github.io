/* станция «chip» · точение: патрон держит заготовку, резец снимает стружку.
   Ядро физики (геометрия стружки, режим резания, толщина плёнки побежалости) —
   те же формулы, что в site/cases/chip/index.html. Интерференция переписана
   узлами TSL (там она была в onBeforeCompile). Все размеры — TSL/three даются
   через build(T, TSL, ctx). */

export default {
  name: 'chip',
  title: 'Резание металла',
  line: 'режим резания → стойкость → цена детали',
  accent: 0xff7a33,

  async build(T, TSL, ctx) {
    const {
      uniform, attribute, vec3, float, clamp, abs, max, pow, cos, mix,
      dot, normalize, positionWorld, normalWorld, cameraPosition, mx_noise_float,
    } = TSL;

    const soft = ctx.quality === 'soft';

    /* ═══ 1. физика резания — формулы из site/cases/chip/index.html, без изменений ═══ */
    const K = {
      gamma: 8, kappa: 95,
      kc11: 1700, mc: 0.25,
      thC: 110,                      // θ = 110·v^.4·s^.2·t^.105
      fA: 1408, fB: 3393, fN: 2.4,   // плёнка: d = A·exp(−B/T), n оксида
      R0: 1.5, kR: 0.6,              // радиус завивки R = R0 + kR·a2 (мм)
      ef0: 0.024, efk: 1.15,         // предельная деформация εf(θ)
    };
    const D2R = Math.PI / 180;
    const clampN = (x, a, b) => (x < a ? a : x > b ? b : x);

    function solve(v, s, t) {
      const kr = K.kappa * D2R, g = K.gamma * D2R;
      const a1 = s * Math.sin(kr);
      const b = t / Math.sin(kr);
      const mu = Math.max(0.24, 0.62 - 0.0009 * v);
      const beta = Math.atan(mu);
      const phi = Math.PI / 4 - (beta - g) / 2;
      const xi = Math.cos(phi - g) / Math.sin(phi);
      const a2 = a1 * xi;
      const vc = v / xi;                                        // м/мин, скорость схода
      const th = K.thC * Math.pow(v, 0.4) * Math.pow(s, 0.2) * Math.pow(t, 0.105);
      const d = K.fA * Math.exp(-K.fB / (th + 273));             // нм, плёнка окисла
      const R = K.R0 + K.kR * a2;                                // мм, радиус завивки
      const eps = a2 / (4 * R);
      const efr = K.ef0 * (1 + K.efk * th / 900);
      const CB = eps / efr;
      const Lb = clampN(R * 2 * Math.PI / Math.pow(CB, 6), 4, 380); // мм, длина до облома
      const kc = K.kc11 * Math.pow(a1, -K.mc);
      const Fc = kc * b * a1;
      return { a1, b, a2, R, Lb, vc, th, d, CB, Fc };
    }

    /* ═══ 2. геометрия сцены — реальные метры, крупный план ═══════════════════ */
    const AXIS_Y = 0.80;                 // высота оси шпинделя (= точка взгляда камеры)
    const R_BAR0 = 0.095;                // радиус заготовки, м (190мм ⌀)
    const X0 = -0.16, X1 = 0.30;         // рабочий (режущийся) участок прутка вдоль X
    const TAILN = 5, TAIL_LEN = 0.022;   // скруглённый носок на свободном конце — без острых рёбер
    const K_CHIP = 0.020;                // визуальное усиление стружки (мм физики → м сцены)
    const MAX_LB = 0.52;                 // предохранитель длины ленты в сцене, м

    const group = new T.Group();

    /* ── скруглённый прямоугольный профиль, вытянутый вдоль X — фаска на всех 4 рёбрах ── */
    function roundedBoxGeo(lenX, sizeY, sizeZ, fillet, curveSegs) {
      const hw = sizeZ / 2, hh = sizeY / 2, rr = Math.min(fillet, Math.min(hw, hh) * 0.9);
      const sh = new T.Shape();
      sh.moveTo(-hw + rr, -hh);
      sh.lineTo(hw - rr, -hh);
      sh.absarc(hw - rr, -hh + rr, rr, -Math.PI / 2, 0);
      sh.lineTo(hw, hh - rr);
      sh.absarc(hw - rr, hh - rr, rr, 0, Math.PI / 2);
      sh.lineTo(-hw + rr, hh);
      sh.absarc(-hw + rr, hh - rr, rr, Math.PI / 2, Math.PI);
      sh.lineTo(-hw, -hh + rr);
      sh.absarc(-hw + rr, -hh + rr, rr, Math.PI, Math.PI * 1.5);
      const g = new T.ExtrudeGeometry(sh, { depth: lenX, steps: 1, bevelEnabled: false, curveSegments: curveSegs || 5 });
      g.translate(0, 0, -lenX / 2);
      g.rotateY(Math.PI / 2);
      return g;
    }

    /* ── чугунная тумба-оснастка патрона, стоит на y=0, скруглённые рёбра ── */
    const ironMat = new T.MeshStandardNodeMaterial({ color: 0x101116, roughness: 0.78, metalness: 0.3 });
    const blockGeo = roundedBoxGeo(0.24, 1.05, 0.52, 0.03, 4);
    const block = new T.Mesh(blockGeo, ironMat);
    block.position.set(-0.44, 0.525, 0);
    group.add(block);

    /* ── патрон: тело вращения с фаской по кромке — LatheGeometry, без острых рёбер ── */
    const steelDarkMat = new T.MeshStandardNodeMaterial({ color: 0x2a2c31, roughness: 0.46, metalness: 0.82 });
    const chuckHalfD = 0.08, chuckR = 0.145, chuckF = 0.014;
    const chuckProfile = new T.Shape();
    chuckProfile.moveTo(0, -chuckHalfD);
    chuckProfile.lineTo(chuckR - chuckF, -chuckHalfD);
    chuckProfile.absarc(chuckR - chuckF, -chuckHalfD + chuckF, chuckF, -Math.PI / 2, 0);
    chuckProfile.lineTo(chuckR, chuckHalfD - chuckF);
    chuckProfile.absarc(chuckR - chuckF, chuckHalfD - chuckF, chuckF, 0, Math.PI / 2);
    chuckProfile.lineTo(0, chuckHalfD);
    const chuckGeo = new T.LatheGeometry(chuckProfile.getPoints(6), soft ? 20 : 30);
    chuckGeo.rotateZ(-Math.PI / 2);
    const chuck = new T.Mesh(chuckGeo, steelDarkMat);
    chuck.position.set(-0.24, AXIS_Y, 0);
    group.add(chuck);

    const jawGeo = roundedBoxGeo(0.075, 0.078, 0.062, 0.010, 3);
    const jaws = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const j = new T.Mesh(jawGeo, steelDarkMat);
      j.position.set(-0.195, AXIS_Y + Math.cos(a) * 0.115, Math.sin(a) * 0.115);
      j.rotation.x = a;
      group.add(j);
      jaws.push(j);
    }

    /* ── заготовка: поверхность вращения, радиус живёт в массиве.
       Последние TAILN колонок — фиксированная скруглённая фаска на свободном
       торце (радиус плавно уходит в 0), не отдельная деталь — часть той же сетки. */
    const NXC = soft ? 46 : 64, NC = soft ? 28 : 42, NC1 = NC + 1;
    const NX = NXC + TAILN;
    const DX = (X1 - X0) / (NXC - 1);
    const DXT = TAIL_LEN / TAILN;
    const rad = new Float32Array(NXC).fill(R_BAR0);
    const wGeo = new T.BufferGeometry();
    const wPos = new Float32Array(NX * NC1 * 3), wNor = new Float32Array(NX * NC1 * 3);
    const wUv = new Float32Array(NX * NC1 * 2), wMach = new Float32Array(NX * NC1);
    const cosT = new Float32Array(NC1), sinT = new Float32Array(NC1);
    for (let j = 0; j < NC1; j++) { const a = (j / NC) * Math.PI * 2; cosT[j] = Math.cos(a); sinT[j] = Math.sin(a); }
    const wIdx = new Uint32Array((NX - 1) * NC * 6);
    { let k = 0; for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NC; j++) {
        const A = i * NC1 + j, B = A + 1, C = A + NC1, D = C + 1;
        wIdx[k++] = A; wIdx[k++] = C; wIdx[k++] = B; wIdx[k++] = B; wIdx[k++] = C; wIdx[k++] = D; } }
    wGeo.setIndex(new T.BufferAttribute(wIdx, 1));
    wGeo.setAttribute('position', new T.BufferAttribute(wPos, 3));
    wGeo.setAttribute('normal', new T.BufferAttribute(wNor, 3));
    wGeo.setAttribute('uv', new T.BufferAttribute(wUv, 2));
    wGeo.setAttribute('aMach', new T.BufferAttribute(wMach, 1));

    const PITCH = 0.011;                                  // шаг винтовой риски, м
    function xAt(i) { return i < NXC ? X0 + i * DX : X1 + (i - NXC + 1) * DXT; }
    function rAt(i) {
      if (i < NXC) return rad[i];
      const k = i - NXC, tFrac = (k + 1) / TAILN;
      return rad[NXC - 1] * Math.cos(tFrac * Math.PI / 2);
    }
    function rowAt(i) {
      const x = xAt(i);
      const rm = rAt(Math.max(0, i - 1)), rp = rAt(Math.min(NX - 1, i + 1));
      const xm = xAt(Math.max(0, i - 1)), xp = xAt(Math.min(NX - 1, i + 1));
      const dr = (rp - rm) / Math.max(1e-6, xp - xm);
      const inv = 1 / Math.sqrt(1 + dr * dr);
      const mach = i < NXC ? clampN((R_BAR0 - rad[i]) / (R_BAR0 * 0.05), 0, 1) : 0;
      const grooveAmp = R_BAR0 * 0.0055 * mach;
      for (let j = 0; j < NC1; j++) {
        const o = (i * NC1 + j) * 3;
        const phase = (j / NC) * Math.PI * 2 + x / PITCH * Math.PI * 2;
        const r = rAt(i) - grooveAmp * (0.5 + 0.5 * Math.sin(phase));
        wPos[o] = x; wPos[o + 1] = r * cosT[j]; wPos[o + 2] = r * sinT[j];
        wNor[o] = -dr * inv; wNor[o + 1] = cosT[j] * inv; wNor[o + 2] = sinT[j] * inv;
        const u = (i * NC1 + j) * 2; wUv[u] = j / NC; wUv[u + 1] = clampN((x - X0) / (X1 - X0), 0, 1);
        wMach[i * NC1 + j] = mach;
      }
    }
    function rows(lo, hi) {
      lo = Math.max(0, lo); hi = Math.min(NXC - 1, hi);
      for (let i = lo; i <= hi; i++) rowAt(i);
      for (let i = NXC - 1; i < NX; i++) rowAt(i);        // хвост-фаска следует за последней рабочей колонкой
      wGeo.attributes.position.needsUpdate = true;
      wGeo.attributes.normal.needsUpdate = true;
      wGeo.attributes.aMach.needsUpdate = true;
    }
    rows(0, NXC - 1);
    const machAttr = attribute('aMach');
    const steelMat = new T.MeshStandardNodeMaterial({ metalness: 0.5 });
    steelMat.colorNode = mix(vec3(0.29, 0.30, 0.32), vec3(0.50, 0.51, 0.54), machAttr);
    steelMat.roughnessNode = mix(float(0.62), float(0.30), machAttr)
      .add(mx_noise_float(positionWorld.mul(150)).mul(0.07));
    const work = new T.Mesh(wGeo, steelMat);
    work.position.y = AXIS_Y;
    work.frustumCulled = false;
    group.add(work);

    /* ── резец: держатель + пластина, фаска на резце — extrude с bevel ── */
    const holder = new T.Group();
    const shankMat = new T.MeshStandardNodeMaterial({ color: 0x1c1d21, roughness: 0.5, metalness: 0.78 });
    const shankGeo = roundedBoxGeo(0.22, 0.038, 0.038, 0.006, 3);
    const shank = new T.Mesh(shankGeo, shankMat);
    shank.position.set(0.13, -0.012, 0);
    holder.add(shank);
    const insertMat = new T.MeshStandardNodeMaterial({ color: 0x8d9096, roughness: 0.46, metalness: 0.72 });
    insertMat.roughnessNode = float(0.46).add(mx_noise_float(positionWorld.mul(300)).mul(0.05));
    const insertShape = new T.Shape();
    insertShape.moveTo(0, 0); insertShape.lineTo(0.030, 0.017); insertShape.lineTo(0.034, -0.007); insertShape.closePath();
    const insertGeo = new T.ExtrudeGeometry(insertShape, { depth: 0.020, bevelEnabled: true, bevelSize: 0.0016, bevelThickness: 0.0016, bevelSegments: 2 });
    insertGeo.translate(0, 0, -0.010);
    const insert = new T.Mesh(insertGeo, insertMat);
    holder.add(insert);
    group.add(holder);

    /* ── лента стружки: BufferGeometry-лента постоянного сечения ── */
    const MAXST = soft ? 120 : 190;
    const chGeo = new T.BufferGeometry();
    const chPos = new Float32Array(MAXST * 8 * 3), chNor = new Float32Array(MAXST * 8 * 3);
    const chOx = new Float32Array(MAXST * 8), chGl = new Float32Array(MAXST * 8);
    const chIdx = new Uint32Array((MAXST - 1) * 4 * 6);
    { let k = 0; for (let i = 0; i < MAXST - 1; i++) { const a = i * 8, b = (i + 1) * 8;
        for (let f = 0; f < 4; f++) { const p = f * 2;
          chIdx[k++] = a + p; chIdx[k++] = b + p; chIdx[k++] = a + p + 1;
          chIdx[k++] = a + p + 1; chIdx[k++] = b + p; chIdx[k++] = b + p + 1; } } }
    chGeo.setIndex(new T.BufferAttribute(chIdx, 1));
    chGeo.setAttribute('position', new T.BufferAttribute(chPos, 3));
    chGeo.setAttribute('normal', new T.BufferAttribute(chNor, 3));
    chGeo.setAttribute('aOx', new T.BufferAttribute(chOx, 1));
    chGeo.setAttribute('aGl', new T.BufferAttribute(chGl, 1));

    /* материал стружки: узловой, интерференция плёнки — TSL вместо onBeforeCompile */
    const uD = uniform(52), uHot = uniform(0);
    function chipMaterial() {
      const m = new T.MeshStandardNodeMaterial({ roughness: 0.60, metalness: 0.7, side: T.DoubleSide });
      const vOx = attribute('aOx'), vGl = attribute('aGl');
      const V = normalize(cameraPosition.sub(positionWorld));
      const ci = clamp(abs(dot(normalize(normalWorld), V)), 0.04, 1.0);
      const si = pow(max(ci.mul(ci).oneMinus(), float(0)), float(0.5)).div(float(K.fN));
      const cr = pow(max(si.mul(si).oneMinus(), float(0)), float(0.5));
      const dl = uD.mul(vOx).mul(2 * K.fN).mul(cr);                        // разность хода, нм
      const invLam = vec3(1 / 630, 1 / 532, 1 / 465);
      const ph = invLam.mul(dl).mul(6.2831853);
      const cs = cos(ph);
      const r1 = 0.28, r2 = 0.66;
      const num = vec3(r1 * r1 + r2 * r2).add(cs.mul(2 * r1 * r2));
      const den = vec3(1 + r1 * r1 * r2 * r2).add(cs.mul(2 * r1 * r2));
      const tint = clamp(num.div(max(den, vec3(1e-4))).div(0.6294), 0, 1.4);
      m.colorNode = vec3(0.40, 0.42, 0.45).mul(tint);
      m.roughnessNode = float(0.60).add(mx_noise_float(positionWorld.mul(400)).mul(0.08));
      m.emissiveNode = vec3(1.0, 0.34, 0.09).mul(uHot).mul(vGl).mul(0.55);
      return m;
    }
    const chip = new T.Mesh(chGeo, chipMaterial());
    chip.frustumCulled = false;
    group.add(chip);

    /* обломки — пул мешей, переиспользуются */
    const POOL = soft ? 2 : 4, shards = [];
    for (let i = 0; i < POOL; i++) {
      const g = new T.BufferGeometry();
      g.setIndex(new T.BufferAttribute(chIdx.slice(), 1));
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(MAXST * 8 * 3), 3));
      g.setAttribute('normal', new T.BufferAttribute(new Float32Array(MAXST * 8 * 3), 3));
      g.setAttribute('aOx', new T.BufferAttribute(new Float32Array(MAXST * 8), 1));
      g.setAttribute('aGl', new T.BufferAttribute(new Float32Array(MAXST * 8), 1));
      const m = chipMaterial(); m.transparent = true; m.opacity = 0;
      const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.visible = false;
      group.add(mesh);
      shards.push({ mesh, vel: new T.Vector3(), spin: new T.Vector3(), life: 0 });
    }
    let shardI = 0;

    /* ── свет зоны резания: физически обоснован — раскалённая стружка светит ── */
    const zone = new T.PointLight(0xff7a33, 0, 0.6, 2);
    group.add(zone);

    /* ═══ 3. состояние станка ═══════════════════════════════════════════════ */
    const M = { xt: X0 + 0.02, dir: 1, rc: R_BAR0, pass: 1, retract: 0, chipL: 0, spin: 0, touchK: 0 };
    const U = { y: 0.60, z: -0.80 };                                    // направление резца от оси к точке резания
    let A = solve(190, 0.16, 2.0);
    const cut = new T.Vector3(), Tt = new T.Vector3(), Nn = new T.Vector3(), Bb = new T.Vector3(), tmp = new T.Vector3();

    function target(rcNow) { return Math.max(R_BAR0 * 0.55, rcNow - 0.002 * M.pass); }

    function buildChip(geo, posArr, norArr, oxArr, glArr, a2s, bs, Rs, Lus, rateS) {
      const ds = Math.max(Rs / 9, Lus / MAXST);
      const n = Math.max(2, Math.min(MAXST, Math.floor(Lus / ds) + 1));
      const kap = 1 / Rs, tau = 0.09 / Rs;
      const P = cut.clone(), ht = a2s / 2, hw = bs / 2;
      Tt.set(-0.08, 0.7, U.z >= 0 ? 0.71 : -0.71).normalize();
      Bb.copy(Tt).cross(Nn.set(0, U.y, U.z)).normalize();
      Nn.copy(Bb).cross(Tt).normalize();
      for (let i = 0; i < n; i++) {
        const o = i * 8 * 3, oa = i * 8;
        const age = rateS > 0.0001 ? (i * ds) / rateS : 1;
        const ox = Math.sqrt(clampN(age / 0.34, 0.04, 1));
        const gl = Math.exp(-age / 0.30);
        for (let f = 0; f < 4; f++) {
          const useN = f < 2;
          for (let e = 0; e < 2; e++) {
            const vi = o + (f * 2 + e) * 3;
            const s1 = useN ? (f === 0 ? 1 : -1) : (e === 0 ? 1 : -1);
            const s2 = useN ? (e === 0 ? 1 : -1) : (f === 2 ? 1 : -1);
            const nx = useN ? Nn.x * s1 : Bb.x * s2, ny = useN ? Nn.y * s1 : Bb.y * s2, nz = useN ? Nn.z * s1 : Bb.z * s2;
            posArr[vi] = P.x + (useN ? Nn.x * ht * s1 + Bb.x * hw * s2 : Nn.x * ht * s1 + Bb.x * hw * s2);
            posArr[vi + 1] = P.y + (useN ? Nn.y * ht * s1 + Bb.y * hw * s2 : Nn.y * ht * s1 + Bb.y * hw * s2);
            posArr[vi + 2] = P.z + (useN ? Nn.z * ht * s1 + Bb.z * hw * s2 : Nn.z * ht * s1 + Bb.z * hw * s2);
            norArr[vi] = nx; norArr[vi + 1] = ny; norArr[vi + 2] = nz;
            oxArr[oa + f * 2 + e] = ox; glArr[oa + f * 2 + e] = gl;
          }
        }
        P.addScaledVector(Tt, ds);
        tmp.copy(Nn).multiplyScalar(kap * ds); Tt.add(tmp).normalize();
        tmp.copy(Tt).multiplyScalar(-kap * ds); Nn.add(tmp);
        tmp.copy(Bb).multiplyScalar(tau * ds); Nn.add(tmp).normalize();
        Bb.copy(Tt).cross(Nn).normalize();
        Nn.copy(Bb).cross(Tt).normalize();
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
      geo.attributes.aOx.needsUpdate = true; geo.attributes.aGl.needsUpdate = true;
      geo.setDrawRange(0, Math.max(0, n - 1) * 24);
      return n;
    }

    function breakOff(n) {
      const sd = shards[shardI]; shardI = (shardI + 1) % POOL;
      const g = sd.mesh.geometry;
      g.attributes.position.array.set(chPos.subarray(0, n * 8 * 3));
      g.attributes.normal.array.set(chNor.subarray(0, n * 8 * 3));
      g.attributes.aOx.array.set(chOx.subarray(0, n * 8));
      g.attributes.aGl.array.set(chGl.subarray(0, n * 8));
      for (const k of ['position', 'normal', 'aOx', 'aGl']) g.attributes[k].needsUpdate = true;
      g.setDrawRange(0, Math.max(0, n - 1) * 24);
      sd.mesh.position.set(0, 0, 0); sd.mesh.rotation.set(0, 0, 0);
      sd.mesh.visible = true; sd.mesh.material.opacity = 1; sd.life = 0;
      sd.vel.set((Math.random() - 0.5) * 0.30, 0.15 + Math.random() * 0.20, (Math.random() - 0.5) * 0.20 + U.z * 0.25);
      sd.spin.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
    }

    /* ═══ 4. update ═══════════════════════════════════════════════════════ */
    function update(t, dt, focus, ptr) {
      dt = Math.min(0.05, dt);
      const wantTouch = focus > 0.5 && ptr && ptr.hit;
      M.touchK += ((wantTouch ? 1 : 0) - M.touchK) * (1 - Math.exp(-dt / 0.06));

      /* режим резания: медленный дрейф + подача глубже под касанием */
      const v = 185 + Math.sin(t * 0.07) * 30;
      const s = 0.15 + Math.sin(t * 0.11 + 1.3) * 0.035;
      const tDoc = 1.9 + Math.sin(t * 0.05 + 2.1) * 0.5 + M.touchK * 1.6;
      A = solve(Math.max(30, v), Math.max(0.05, s), Math.max(0.3, tDoc));

      /* вращение шпинделя — читаемый темп, реагирует на v */
      const spinRate = 0.55 + (Math.max(30, v) - 30) / 290 * 2.1;
      M.spin += spinRate * dt;
      work.rotation.x = M.spin; chuck.rotation.x = M.spin;
      for (const j of jaws) j.rotation.y = 0; /* зажаты — идут одним телом с патроном */

      /* подача каретки: фиксированный кинематографичный темп + тяга к точке касания.
         Идёт от патрона к свободному концу — торец с фаской дольше остаётся необработанным. */
      const FEED = 0.032;
      if (M.retract > 0) {
        M.retract -= dt;
        if (M.retract <= 0) { M.retract = 0; M.dir = 1; M.xt = X0 + 0.02; }
      } else {
        M.xt += M.dir * FEED * dt;
        const i0 = Math.round((M.xt - X0) / DX);
        const tr = target(R_BAR0);
        let lo = 1e9, hi = -1e9;
        for (let i = Math.max(0, i0 - 1); i <= Math.min(NXC - 1, i0 + 1); i++) {
          if (rad[i] > tr) { rad[i] = tr; lo = Math.min(lo, i); hi = Math.max(hi, i); }
        }
        if (hi >= lo) rows(lo - 1, hi + 1);
        if (M.xt > X1 - 0.02) { M.pass++; M.retract = 0.45; if (target(R_BAR0) <= R_BAR0 * 0.58) { M.pass = 1; rad.fill(R_BAR0); rows(0, NXC - 1); } }
      }
      M.rc = rad[Math.max(0, Math.min(NXC - 1, Math.round((M.xt - X0) / DX)))];

      /* видимая позиция резца: тянется к точке касания вдоль прутка */
      const touchX = (ptr && ptr.world) ? clampN(ptr.world.x, X0, X1) : M.xt;
      const drawX = M.xt + (touchX - M.xt) * M.touchK * 0.7;

      cut.set(drawX, AXIS_Y + U.y * M.rc, U.z * M.rc);
      holder.position.copy(cut).addScaledVector({ x: 0, y: U.y, z: U.z }, 0.008);
      holder.rotation.set(0, 0, U.z < 0 ? 0.55 : -0.55);

      /* стружка: растёт от вершины резца, скручивается, ломается по критерию деформации */
      const a2s = A.a2 * K_CHIP, bs = A.b * K_CHIP, Rs = A.R * K_CHIP;
      const Lbs = Math.min(A.Lb * K_CHIP, MAX_LB) * (1 + M.touchK * 0.5);
      const rateS = Math.max(0.004, A.vc * 1000 * K_CHIP / 60) * (1 + M.touchK * 0.6);
      if (M.chipL <= 0) M.chipL = Lbs * 0.55;
      M.chipL += rateS * dt;
      if (M.chipL > Lbs) {
        const n = buildChip(chGeo, chPos, chNor, chOx, chGl, a2s, bs, Rs, Math.min(M.chipL, Lbs), rateS);
        breakOff(n);
        M.chipL = Math.max(0.01, Lbs * 0.12);
      }
      buildChip(chGeo, chPos, chNor, chOx, chGl, a2s, bs, Rs, Math.max(0.006, M.chipL), rateS);

      /* обломки падают и гаснут */
      for (const sd of shards) {
        if (!sd.mesh.visible) continue;
        sd.life += dt;
        sd.vel.y -= 2.6 * dt;
        sd.mesh.position.addScaledVector(sd.vel, dt);
        sd.mesh.rotation.x += sd.spin.x * dt; sd.mesh.rotation.y += sd.spin.y * dt; sd.mesh.rotation.z += sd.spin.z * dt;
        if (sd.mesh.position.y < -AXIS_Y + 0.02) { sd.vel.y *= -0.22; sd.vel.x *= 0.55; sd.vel.z *= 0.55; sd.mesh.position.y = -AXIS_Y + 0.02; }
        sd.mesh.material.opacity = Math.max(0, 1 - Math.max(0, sd.life - 1.0) / 0.8);
        if (sd.life > 1.9) sd.mesh.visible = false;
      }

      /* тепловой отклик: интерференция и точечный свет зоны резания */
      uD.value = A.d;
      const hotK = Math.max(0, Math.min(1, (A.th - 560) / 340 + M.touchK * 0.35));
      uHot.value = hotK;
      zone.position.copy(cut);
      zone.intensity = focus > 0.05 ? (0.08 + hotK * 0.65) : 0;
      zone.color.setRGB(1, 0.40 + 0.12 * (1 - hotK), 0.14 + 0.10 * hotK);
    }

    function dispose() {
      wGeo.dispose(); steelMat.dispose();
      chuckGeo.dispose(); steelDarkMat.dispose();
      jawGeo.dispose();
      blockGeo.dispose(); ironMat.dispose();
      shankGeo.dispose(); shankMat.dispose();
      insertGeo.dispose(); insertMat.dispose();
      chGeo.dispose(); chip.material.dispose();
      for (const sd of shards) { sd.mesh.geometry.dispose(); sd.mesh.material.dispose(); }
    }

    return { group, update, dispose, hitY: AXIS_Y, touchHint: 'наведите на пруток — резец подаётся глубже' };
  },
};
