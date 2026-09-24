/* ЦЕХ · станция «nodal» — резонанс пластины.
   Стальная пластина 0.6×0.6 м с фаской по периметру и крепёжной шпилькой в центре
   (как у настоящего стенда Хладни) едва вибрирует; 13 000 песчинок (InstancedMesh)
   честно интегрируются на CPU каждый кадр: каждая дрейфует против градиента
   |ψ| текущей моды (m,n), ψ = cos(nπx)cos(mπy) − cos(mπx)cos(nπy) — та же
   аппроксимация Хладни, что и в site/cases/nodal. Песок не размазан плёнкой —
   вдоль узловой линии он копится горкой (высота растёт к точному узлу), поверх
   горки — быстрый подскок при возбуждении. Раз в ~8 c мода сменяется сама;
   касание задаёт ближайшую моду по позиции пальца, удержание поднимает амплитуду. */

export default {
  name: 'nodal',
  title: 'Резонанс пластины',
  line: 'спектр мод и карта узлов — таблица 12 мод',
  accent: 0xd08a4e,

  async build(T, TSL, ctx) {
    const { vec3, float, cos, abs, positionLocal, uniform, mix } = TSL;
    const attr = TSL.attribute;

    const group = new T.Group();
    const PI = Math.PI;
    const ac = new T.Color(0xd08a4e);

    /* 12 мод плиты со свободным краем, f = f0·(m²+n²) — таблица из кейса */
    const MODES = [[2,1],[3,1],[3,2],[4,1],[4,2],[4,3],[5,2],[5,3],[6,1],[6,3],[7,2],[7,4]];
    const F0 = 36;

    const PLATE = 0.6, HALF = PLATE / 2;

    /* ── пластина: выдавленный квадрат с фаской по периметру, не голый Box ── */
    const uN = uniform(2), uM = uniform(1), uRes = uniform(0);
    const plateMat = new T.MeshStandardNodeMaterial({ color: 0x3c4046, metalness: 0.88 });
    {
      const qx = positionLocal.x.div(HALF).mul(0.5).add(0.5);
      const qz = positionLocal.z.div(HALF).mul(0.5).add(0.5);
      const nPix = uN.mul(PI), mPix = uM.mul(PI);
      const psiT = cos(nPix.mul(qx)).mul(cos(mPix.mul(qz))).sub(cos(mPix.mul(qx)).mul(cos(nPix.mul(qz))));
      const aT = abs(psiT);
      const k = aT.div(0.06).clamp(0, 1).oneMinus();          /* 1 на узле, 0 в стороне */
      const nodeGlow = k.mul(k).mul(uRes);
      plateMat.emissiveNode = vec3(ac.r, ac.g, ac.b).mul(nodeGlow).mul(0.85);
      /* шлифовка: анизотропный шум вдоль X имитирует следы ленты, а не гладкий металл */
      const brush = TSL.mx_noise_float(vec3(positionLocal.x.mul(620), positionLocal.y.mul(3), positionLocal.z.mul(11)));
      const fine = TSL.mx_noise_float(positionLocal.mul(90));
      plateMat.roughnessNode = float(0.30)
        .add(brush.mul(0.5).add(0.5).mul(0.20))
        .add(fine.mul(0.5).add(0.5).mul(0.08))
        .clamp(0.14, 0.62);
    }
    const shape = new T.Shape();
    shape.moveTo(-HALF, -HALF);
    shape.lineTo(HALF, -HALF);
    shape.lineTo(HALF, HALF);
    shape.lineTo(-HALF, HALF);
    shape.closePath();
    const plateGeo = new T.ExtrudeGeometry(shape, {
      depth: 0.020, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.007, bevelSegments: 3,
      curveSegments: 1, steps: 1,
    });
    plateGeo.rotateX(-Math.PI / 2);
    plateGeo.computeBoundingBox();
    const plateBottom = plateGeo.boundingBox.min.y;
    const PLATE_H = plateGeo.boundingBox.max.y - plateBottom;   /* полная высота с фаской */
    const plate = new T.Mesh(plateGeo, plateMat);
    plate.position.y = -plateBottom;
    plate.castShadow = true; plate.receiveShadow = true;
    group.add(plate);

    /* ── крепёжная шпилька в центре: шпилька, шайба, гайка — как на стенде Хладни ── */
    const studMat = new T.MeshStandardNodeMaterial({ color: 0x24272b, metalness: 0.86, roughness: 0.30 });
    const stud = new T.Group();
    const shaft = new T.Mesh(new T.CylinderGeometry(0.009, 0.009, PLATE_H + 0.012, 12), studMat);
    shaft.position.y = PLATE_H / 2;
    stud.add(shaft);
    const washerH = 0.005;
    const washer = new T.Mesh(new T.CylinderGeometry(0.030, 0.032, washerH, 20), studMat);
    washer.position.y = PLATE_H + washerH / 2;
    stud.add(washer);
    const headH = 0.016;
    const head = new T.Mesh(new T.CylinderGeometry(0.023, 0.023, headH, 6), studMat);
    head.position.y = PLATE_H + washerH + headH / 2;
    stud.add(head);
    stud.castShadow = true;
    group.add(stud);

    /* ── песок: InstancedMesh, позиции считаются на CPU каждый кадр ── */
    const N = 13000;
    const grainGeo = new T.TetrahedronGeometry(0.0036, 0);
    const glintArr = new Float32Array(N);
    const bounceArr = new Float32Array(N);   /* быстрый подскок — вспышка при ударе */
    const ridgeArr = new Float32Array(N);    /* медленная горка вдоль узла — ровное свечение */
    grainGeo.setAttribute('glint', new T.InstancedBufferAttribute(glintArr, 1));
    grainGeo.setAttribute('bounce', new T.InstancedBufferAttribute(bounceArr, 1));
    grainGeo.setAttribute('ridge', new T.InstancedBufferAttribute(ridgeArr, 1));

    const glintA = attr('glint'), bounceA = attr('bounce'), ridgeA = attr('ridge');
    const grainMat = new T.MeshStandardNodeMaterial({ metalness: 0.05 });
    grainMat.colorNode = mix(vec3(0.22, 0.19, 0.16), vec3(0.56, 0.50, 0.40), glintA);  /* нейтральный песок — не accent */
    grainMat.roughnessNode = mix(float(0.20), float(0.68), glintA);                    /* часть зёрен глянцевее — блик */
    grainMat.emissiveNode = vec3(ac.r, ac.g, ac.b).mul(
      mix(float(0.05), float(0.55), glintA)
        .mul(uRes.mul(0.4).add(0.6))
        .mul(ridgeA.mul(2.6).add(0.25))
        .add(bounceA.mul(bounceA).mul(1.4))
    );

    const sand = new T.InstancedMesh(grainGeo, grainMat, N);
    sand.frustumCulled = false;
    group.add(sand);

    /* позиции/скорости в нормализованном пространстве плиты [-1,1] × [-1,1];
       sY — быстрый подскок над горкой, baseY — сама горка (медленно нарастает к узлу) */
    const sX = new Float32Array(N), sZ = new Float32Array(N), sY = new Float32Array(N);
    const vX = new Float32Array(N), vZ = new Float32Array(N), vY = new Float32Array(N);
    const baseY = new Float32Array(N), pileBias = new Float32Array(N);

    {
      const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), S = new T.Vector3(), P = new T.Vector3();
      for (let i = 0; i < N; i++) {
        sX[i] = (Math.random() * 2 - 1) * 0.97;
        sZ[i] = (Math.random() * 2 - 1) * 0.97;
        glintArr[i] = Math.random();
        pileBias[i] = 0.55 + Math.random() * 0.75;
        E.set(Math.random() * PI * 2, Math.random() * PI * 2, Math.random() * PI * 2);
        Q.setFromEuler(E);
        const sc = 0.55 + Math.random() * 0.85;
        S.set(sc, sc, sc);
        P.set(sX[i] * HALF, PLATE_H + 0.0008, sZ[i] * HALF);
        M.compose(P, Q, S);
        sand.setMatrixAt(i, M);
      }
      sand.instanceMatrix.needsUpdate = true;
    }
    const matArr = sand.instanceMatrix.array;

    /* ── ψ и её аналитический градиент — та же формула, что и в кейсе ── */
    function psiFn(qx, qy, n, m) {
      return Math.cos(n * PI * qx) * Math.cos(m * PI * qy) - Math.cos(m * PI * qx) * Math.cos(n * PI * qy);
    }
    function gradPsi(qx, qy, n, m) {
      const gx = -n * PI * Math.sin(n * PI * qx) * Math.cos(m * PI * qy) + m * PI * Math.sin(m * PI * qx) * Math.cos(n * PI * qy);
      const gy = -m * PI * Math.cos(n * PI * qx) * Math.sin(m * PI * qy) + n * PI * Math.cos(m * PI * qx) * Math.sin(n * PI * qy);
      return [gx, gy];
    }
    function smooth01(x) { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); }

    const GRAV = 2.6, DRIFT = 1.7, RESP = 9.0, WANDER = 2.2, DAMP = 2.1, EDGE = 0.985, BOUNCE = 0.42;
    const PILE_HSCALE = 0.015, BOUNCE_HSCALE = 0.05, PSIG = 0.06;

    /* ψ и её градиент стоят 8 тригонометрических вызовов — слишком дорого на 13 000 зёрен
       каждый кадр (роняет fps и через ограниченный сверху dt тормозит сам таймер станции).
       Мода меняется редко (раз в ~8 c или по касанию), поэтому поле считается один раз на
       смену моды — на сетку 84×84, а зерно в кадре делает дешёвую билинейную выборку. */
    const FRES = 84;
    const field = new Float32Array(FRES * FRES * 3);
    let fieldM = -1, fieldN = -1;
    function buildField(n, m) {
      for (let gy = 0; gy < FRES; gy++) {
        for (let gx = 0; gx < FRES; gx++) {
          const qx = gx / (FRES - 1), qy = gy / (FRES - 1);
          const psiV = psiFn(qx, qy, n, m);
          const [gqx, gqy] = gradPsi(qx, qy, n, m);
          const off = (gy * FRES + gx) * 3;
          field[off] = psiV; field[off + 1] = gqx; field[off + 2] = gqy;
        }
      }
      fieldN = n; fieldM = m;
    }

    function sampleField(qx, qy) {
      const fx = qx * (FRES - 1), fy = qy * (FRES - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(FRES - 1, x0 + 1), y1 = Math.min(FRES - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const i00 = (y0 * FRES + x0) * 3, i10 = (y0 * FRES + x1) * 3, i01 = (y1 * FRES + x0) * 3, i11 = (y1 * FRES + x1) * 3;
      const psiV = field[i00] * w00 + field[i10] * w10 + field[i01] * w01 + field[i11] * w11;
      const gqx = field[i00 + 1] * w00 + field[i10 + 1] * w10 + field[i01 + 1] * w01 + field[i11 + 1] * w11;
      const gqy = field[i00 + 2] * w00 + field[i10 + 2] * w10 + field[i01 + 2] * w01 + field[i11 + 2] * w11;
      return [psiV, gqx, gqy];
    }

    function stepGrains(dt, amp, res, holdA) {
      const respK = 1 - Math.exp(-RESP * dt);
      const dampF = Math.exp(-DAMP * dt);
      const baseK = 1 - Math.exp(-2.4 * dt);
      for (let i = 0; i < N; i++) {
        const x = sX[i], z = sZ[i];
        const qx = x * 0.5 + 0.5, qy = z * 0.5 + 0.5;
        const [psiV, gqx, gqy] = sampleField(qx, qy);
        const a = Math.abs(psiV);
        const sgn = psiV < 0 ? -1 : 1;
        const gx = gqx * sgn, gz = gqy * sgn;
        const glen = Math.hypot(gx, gz) + 1e-4;

        const drift = DRIFT * res * amp * smooth01(a / 0.16);
        const wantX = -(gx / glen) * drift, wantZ = -(gz / glen) * drift;
        let VX = vX[i] + (wantX - vX[i]) * respK;
        let VZ = vZ[i] + (wantZ - vZ[i]) * respK;

        const nodeDamp = Math.exp(-(7.5 * (1 - smooth01(a / 0.1))) * res * dt);
        VX *= nodeDamp; VZ *= nodeDamp;

        VX += (Math.random() - 0.5) * (1 - res) * amp * WANDER * dt;
        VZ += (Math.random() - 0.5) * (1 - res) * amp * WANDER * dt;

        /* горка: высота растёт к точному узлу (a→0), песок копится объёмно, не плёнкой */
        const rr = a / PSIG;
        const pileT = res * pileBias[i] * Math.exp(-rr * rr);
        baseY[i] += (pileT - baseY[i]) * baseK;

        let VY = vY[i], Y = sY[i];
        if (Y <= 0.0009) {
          const toss = Math.min(1.4, a * amp * (0.22 + 0.9 * holdA));
          VY = toss * (0.4 + 0.6 * Math.random());
          VX *= 0.58; VZ *= 0.58;
          VX += (Math.random() - 0.5) * toss * 0.32;
          VZ += (Math.random() - 0.5) * toss * 0.32;
        }
        VY -= GRAV * dt;
        VX *= dampF; VZ *= dampF; VY *= dampF;

        let X = x + VX * dt, Z = z + VZ * dt;
        Y = Math.max(0, Math.min(1.0, Y + VY * dt));

        if (X > EDGE && VX > 0) VX = -VX * BOUNCE;
        if (X < -EDGE && VX < 0) VX = -VX * BOUNCE;
        if (Z > EDGE && VZ > 0) VZ = -VZ * BOUNCE;
        if (Z < -EDGE && VZ < 0) VZ = -VZ * BOUNCE;
        X = Math.min(0.998, Math.max(-0.998, X));
        Z = Math.min(0.998, Math.max(-0.998, Z));

        sX[i] = X; sZ[i] = Z; sY[i] = Y; vX[i] = VX; vZ[i] = VZ; vY[i] = VY;
        bounceArr[i] = Y;
        ridgeArr[i] = baseY[i];

        const off = i * 16;
        matArr[off + 12] = X * HALF;
        matArr[off + 13] = PLATE_H + 0.0008 + baseY[i] * PILE_HSCALE + Y * BOUNCE_HSCALE;
        matArr[off + 14] = Z * HALF;
      }
      sand.instanceMatrix.needsUpdate = true;
      grainGeo.attributes.bounce.needsUpdate = true;
      grainGeo.attributes.ridge.needsUpdate = true;
    }

    function pickNearest(mm, nn) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < MODES.length; i++) {
        const d = (MODES[i][0] - mm) ** 2 + (MODES[i][1] - nn) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    let modeIdx = 0, switchT = 0, modeTimer = 8, holdAmp = 0, frame = 0;

    function update(t, dt, focus, ptr) {
      frame++;
      let holdTarget = 0;
      if (focus > 0.5 && ptr && ptr.hit && ptr.world) {
        const tx = Math.min(1, Math.max(-1, ptr.world.x / HALF));
        const tz = Math.min(1, Math.max(-1, ptr.world.z / HALF));
        const mm = Math.round(2 + (tx * 0.5 + 0.5) * 5);
        const nn = Math.round(1 + (tz * 0.5 + 0.5) * 3);
        const idx = pickNearest(mm, nn);
        if (idx !== modeIdx) { modeIdx = idx; switchT = 0; }
        modeTimer = 8;
        holdTarget = ptr.down ? 1 : 0;
      }
      holdAmp += (holdTarget - holdAmp) * (1 - Math.exp(-4 * dt));

      modeTimer -= dt;
      if (modeTimer <= 0) { modeIdx = (modeIdx + 1) % MODES.length; switchT = 0; modeTimer = 8; }
      switchT += dt;
      const res = Math.min(1, switchT / 1.1);
      const curM = MODES[modeIdx][0], curN = MODES[modeIdx][1];
      uM.value = curM; uN.value = curN; uRes.value = res;
      if (curM !== fieldM || curN !== fieldN) buildField(curN, curM);

      const amp = 0.14 + 0.32 * Math.min(1, focus) + 0.36 * holdAmp;

      const lowFocus = focus < 0.5;
      if (!lowFocus || frame % 3 === 0) {
        stepGrains(lowFocus ? dt * 3 : dt, amp, res, holdAmp);
      }

      /* пластина едва вибрирует — микронаклон двигает блики по стали */
      const freqHz = F0 * (curM * curM + curN * curN);
      const visFreq = Math.min(26, 3 + freqHz * 0.012);
      const wob = 0.3 + 0.7 * Math.min(1, amp);
      plate.rotation.x = Math.sin(t * visFreq) * 0.0009 * wob;
      plate.rotation.z = Math.cos(t * visFreq * 0.83 + 1.1) * 0.0007 * wob;
      stud.rotation.x = plate.rotation.x; stud.rotation.z = plate.rotation.z;
    }

    return {
      group, update,
      hitY: 0.9 + PLATE_H,
      touchHint: 'коснитесь пластины — точка задаёт новую моду, удержите — амплитуда растёт',
      dispose() { plateGeo.dispose(); shaft.geometry.dispose(); washer.geometry.dispose(); head.geometry.dispose(); grainGeo.dispose(); }
    };
  }
};
