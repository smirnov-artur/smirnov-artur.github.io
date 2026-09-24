/* ЦЕХ · станция «forge» — ковка клинка, полный цикл ремесла.
   Болванка из горна → протяжка через боёк (брус ползёт, удлиняется,
   кромки и остриё оттягиваются — каждый столбик металла честно меняет
   толщину/ширину/длину с сохранением объёма) → закалка в корыте с водой
   (пар, фронт гашения от острия) → готовый клинок с бликом → новый цикл. */

export default {
  name: 'forge',
  title: 'Свободная ковка',
  line: 'болванка → клинок: удары, нагревы, закалка — и цена партии',
  accent: 0xff6a1c,

  async build(T, TSL, ctx) {
    const { vec3, vec2, float, mix, clamp, smoothstep, pow, dot, sin,
            positionLocal, normalWorld, cameraPosition, positionWorld, normalize, time } = TSL;
    const attr = TSL.attribute;
    const sm = x => x*x*(3-2*x);

    const group = new T.Group();

    /* ── наковальня ── */
    let anvilTop = 0.68;
    try {
      const gl = new T.GLTFLoader();
      const g = await new Promise((res, rej) => gl.load(ctx.assetsBase + 'nakovalnya.glb', res, undefined, rej));
      const anvil = g.scene;
      const bb = new T.Box3().setFromObject(anvil);
      const size = new T.Vector3(); bb.getSize(size);
      anvil.scale.setScalar(0.68 / size.y);
      bb.setFromObject(anvil);
      anvil.position.y = -bb.min.y;
      anvil.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          const am = new T.MeshStandardNodeMaterial({ metalness: 0.85 });
          const topK = smoothstep(0.80, 0.97, TSL.normalWorld.y);
          am.colorNode = mix(vec3(0.024,0.025,0.028), vec3(0.075,0.078,0.084), topK);
          am.roughnessNode = mix(float(0.56), float(0.30), topK)
            .add(TSL.mx_noise_float(positionWorld.mul(34)).mul(0.09));
          o.material = am;
        }
      });
      group.add(anvil);
    } catch (e) {
      const m = new T.MeshStandardNodeMaterial({ color: 0x17181b, roughness: 0.46, metalness: 0.86 });
      const body = new T.Mesh(new T.BoxGeometry(0.62, 0.20, 0.26), m);
      body.position.y = 0.58; body.castShadow = true; group.add(body);
      const foot = new T.Mesh(new T.BoxGeometry(0.44, 0.48, 0.34), m);
      foot.position.y = 0.24; group.add(foot);
    }

    /* ── молот и клещи из сборщика предметов ── */
    let hammer = null, hammerRest = new T.Vector3(0, anvilTop + 0.34, 0.02);
    let tongs = null;
    try {
      const gl2 = new T.GLTFLoader();
      const [hg, tg] = await Promise.all([
        new Promise((res, rej) => gl2.load(ctx.assetsBase + 'molot.glb', res, undefined, rej)),
        new Promise((res, rej) => gl2.load(ctx.assetsBase + 'kleshchi.glb', res, undefined, rej)),
      ]);
      const toolMat = () => {
        const m = new T.MeshStandardNodeMaterial({ metalness: 0.8 });
        m.colorNode = vec3(0.035, 0.036, 0.040);
        m.roughnessNode = float(0.42).add(TSL.mx_noise_float(positionWorld.mul(40)).mul(0.10));
        return m;
      };
      hammer = hg.scene;
      { const bb = new T.Box3().setFromObject(hammer);
        const size = new T.Vector3(); bb.getSize(size);
        hammer.scale.setScalar(0.44 / Math.max(size.x, size.y, size.z));
        hammer.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = toolMat(); } });
        const bb2 = new T.Box3().setFromObject(hammer);
        const c = new T.Vector3(); bb2.getCenter(c);
        hammer.position.sub(c);                         /* пивот в центр */
        hammer.rotation.z = Math.PI;                    /* боёк ВНИЗ, рукоять вверх */
        const wrap = new T.Group(); wrap.add(hammer); hammer = wrap;
        hammer.rotation.z = -0.28;
        hammer.position.copy(hammerRest);
        group.add(hammer); }
      tongs = tg.scene;
      { const bb = new T.Box3().setFromObject(tongs);
        const size = new T.Vector3(); bb.getSize(size);
        tongs.scale.setScalar(0.52 / Math.max(size.x, size.y, size.z));
        tongs.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = toolMat(); } });
        const bb2 = new T.Box3().setFromObject(tongs);
        const c = new T.Vector3(); bb2.getCenter(c);
        tongs.position.sub(c); }
    } catch (e) { hammer = null; tongs = null; }

    /* ── горн: кирпичный зев со свечением, фон и смысл цикла ── */
    const forgeGlow = TSL.uniform(1);
    { const brickM = new T.MeshStandardNodeMaterial({ metalness: 0.05 });
      brickM.colorNode = vec3(0.026, 0.019, 0.016)
        .mul(TSL.mx_noise_float(positionWorld.mul(14)).mul(0.35).add(0.8));
      brickM.roughnessNode = float(0.88);
      const gorn = new T.Group();
      const arch = new T.Mesh(new T.BoxGeometry(1.15, 1.0, 0.55), brickM);
      arch.position.y = 0.5; arch.castShadow = true; gorn.add(arch);
      const lip = new T.Mesh(new T.BoxGeometry(1.3, 0.10, 0.65), brickM);
      lip.position.y = 1.02; gorn.add(lip);
      /* зев: светящееся нутро, мерцает углями */
      const mawM = new T.MeshBasicNodeMaterial();
      mawM.colorNode = vec3(1.0, 0.34, 0.07)
        .mul(TSL.mx_noise_float(positionWorld.mul(9).add(vec3(0, time.mul(0.7), 0))).mul(0.6).add(0.55))
        .mul(forgeGlow.mul(1.5));
      const maw = new T.Mesh(new T.PlaneGeometry(0.46, 0.30), mawM);
      maw.position.set(0, 0.42, 0.281); gorn.add(maw);
      /* козырёк, чтобы зев сидел в глубине, а не плакатом */
      const hood = new T.Mesh(new T.BoxGeometry(0.62, 0.07, 0.16), brickM);
      hood.position.set(0, 0.62, 0.30); gorn.add(hood);
      const gornL = new T.PointLight(0xff5a14, 2.2, 1.8, 1.9);
      gornL.position.set(0, 0.45, 0.34); gorn.add(gornL);
      gorn.userData.light = gornL;
      gorn.position.set(-1.7, 0, -2.6);
      gorn.rotation.y = 0.55;
      group.add(gorn);
      group.userData.gorn = gorn; }

    /* ── корыто закалки ── */
    const trough = new T.Group();
    const tM = new T.MeshStandardNodeMaterial({ color: 0x101114, roughness: 0.55, metalness: 0.6 });
    const tw = 0.95, td = 0.34, thh = 0.30, wall = 0.022;
    for (const [sx, sz, px, pz] of [[tw, wall, 0, -td/2], [tw, wall, 0, td/2], [wall, td, -tw/2, 0], [wall, td, tw/2, 0]]) {
      const w = new T.Mesh(new T.BoxGeometry(sx, thh, sz), tM);
      w.position.set(px, thh/2, pz); w.castShadow = true; trough.add(w);
    }
    const tb = new T.Mesh(new T.BoxGeometry(tw, wall, td), tM);
    tb.position.y = wall/2; trough.add(tb);
    /* обод и ножки — чтобы не читалось голым ящиком */
    for (const [sx, sz, px, pz] of [[tw+0.05, 0.035, 0, -td/2], [tw+0.05, 0.035, 0, td/2], [0.035, td+0.05, -tw/2, 0], [0.035, td+0.05, tw/2, 0]]) {
      const r = new T.Mesh(new T.BoxGeometry(sx, 0.028, sz), tM);
      r.position.set(px, thh + 0.014, pz); trough.add(r);
    }
    for (const [px, pz] of [[-tw/2+0.05, -td/2+0.05], [tw/2-0.05, -td/2+0.05], [-tw/2+0.05, td/2-0.05], [tw/2-0.05, td/2-0.05]]) {
      const leg = new T.Mesh(new T.BoxGeometry(0.04, 0.06, 0.04), tM);
      leg.position.set(px, -0.02, pz); trough.add(leg);
    }
    trough.position.y = 0.06;
    /* вода: тёмное зеркало, дышит рябью, при закалке бурлит */
    const boil = TSL.uniform(0);
    const wM = new T.MeshStandardNodeMaterial({ color: 0x05070a, metalness: 0.0 });
    wM.roughnessNode = float(0.045).add(boil.mul(0.30))
      .add(TSL.mx_noise_float(positionWorld.mul(30).add(vec3(0, time.mul(1.2), 0))).mul(boil.mul(0.25).add(0.012)));
    const water = new T.Mesh(new T.PlaneGeometry(tw - wall*2, td - wall*2, 1, 1), wM);
    water.rotation.x = -Math.PI/2; water.position.y = 0.245;
    trough.add(water);
    trough.position.set(0.88, 0, 0.46);
    trough.rotation.y = 0.28;
    group.add(trough);
    const waterY = 0.245;

    /* ── заготовка: выдавленный профиль со скруглённой фаской ── */
    const BX = 96;
    const L = 0.36, H = 0.16, W = 0.17;
    const r0 = 0.016, hw = W/2, hh = H/2;
    const shape = new T.Shape();
    shape.moveTo(-hw + r0, -hh);
    shape.lineTo(hw - r0, -hh);
    shape.absarc(hw - r0, -hh + r0, r0, -Math.PI/2, 0);
    shape.lineTo(hw, hh - r0);
    shape.absarc(hw - r0, hh - r0, r0, 0, Math.PI/2);
    shape.lineTo(-hw + r0, hh);
    shape.absarc(-hw + r0, hh - r0, r0, Math.PI/2, Math.PI);
    shape.lineTo(-hw, -hh + r0);
    shape.absarc(-hw + r0, -hh + r0, r0, Math.PI, Math.PI*1.5);
    const geo = new T.ExtrudeGeometry(shape, { depth: L, steps: BX, bevelEnabled: false, curveSegments: 5 });
    geo.translate(0, 0, -L/2);
    geo.rotateY(Math.PI/2);
    const pos = geo.attributes.position;
    const nV = pos.count;
    const base = new Float32Array(pos.array);

    const NC = BX + 1;
    const thA = new Float32Array(NC).fill(H);    /* толщина столбика */
    const pA  = new Float32Array(NC);            /* прогресс формовки 0..1 */
    const tempA = new Float32Array(nV);
    const coreA = new Float32Array(nV);
    function tempInit() {
      for (let i = 0; i < nV; i++) {
        const x = base[i*3], z = base[i*3+2];
        const ex = 1 - Math.abs(x)/(L/2), ez = 1 - Math.abs(z)/(W/2);
        coreA[i] = Math.pow(Math.max(0.02, Math.min(1, Math.min(ex, ez) * 2.6)), 0.7);
        tempA[i] = 1280 + 90 * coreA[i];
      }
    }
    tempInit();
    geo.setAttribute('temp', new T.BufferAttribute(tempA, 1));
    geo.setAttribute('core', new T.BufferAttribute(coreA, 1));

    /* цель — клинок: толщина/ширина по доле длины (0 — хвостовик, 1 — остриё) */
    const bladeTh = f => f < 0.14 ? H*0.42 : H*(0.115 - 0.055*(f-0.14)/0.86);
    const bladeW  = f => f < 0.14 ? 0.46 : (0.60 - 0.42*Math.pow((f-0.14)/0.86, 1.6));

    const marks = [], splashes = [];
    const cumX = new Float32Array(NC);
    let barLen = L;
    function rebuildCum() {
      let acc = 0; const step = L / BX;
      for (let c = 0; c < NC; c++) {
        cumX[c] = acc;
        const wS = 1 - pA[c] * (1 - bladeW(c/(NC-1)));
        acc += step * Math.min(2.7, Math.pow(H / thA[c], 0.55) * Math.pow(1 / wS, 0.35));
      }
      barLen = acc;
    }
    rebuildCum();

    function reshape() {
      const arr = pos.array;
      rebuildCum();
      for (let i = 0; i < nV; i++) {
        const bx = base[i*3], by = base[i*3+1], bz = base[i*3+2];
        const cf = Math.max(0, Math.min(NC - 1.001, (bx/L + 0.5) * BX));
        const c0 = Math.floor(cf), f = cf - c0;
        const x = (cumX[c0]*(1-f) + cumX[c0+1]*f) - L/2;
        const th = (thA[c0]*(1-f) + thA[c0+1]*f) / H;
        const p  = pA[c0]*(1-f) + pA[c0+1]*f;
        const lf = cf/(NC-1);
        const wS = 1 - p * (1 - bladeW(lf));
        /* клин кромки: сечение сплющивается к рёбрам по мере формовки */
        const wedge = 1 - p * Math.abs(by)/hh * 0.55;
        let y = -H/2 + (by + H/2) * th;
        const topW = Math.pow(Math.max(0, by / hh), 6);
        if (topW > 0.01) {
          let dent = 0;
          for (const d of marks) {
            const dist = Math.hypot(x - d.x, bz - d.z);
            if (dist < d.r) {
              const k = dist < d.r*0.45 ? 1 : sm(1 - (dist - d.r*0.45)/(d.r*0.55));
              const v = d.d * k * (d.age < 1 ? sm(d.age) : 1);
              if (v > dent) dent = v;
            }
          }
          y -= dent * topW;
        }
        let ox = 0, oz = 0;
        const midK = 1 - Math.abs(by)/hh * 0.62;
        for (const s of splashes) {
          const dx = x - s.x, dz = bz - s.z;
          const dist = Math.hypot(dx, dz);
          if (dist < s.r && dist > 1e-4) {
            const fall = sm(1 - dist / s.r);
            const a = s.amp * fall * midK * (s.age < 1 ? sm(s.age) : 1);
            ox += dx/dist * a; oz += dz/dist * a * 1.6;
          }
        }
        arr[i*3+1] = y;
        arr[i*3]   = x + ox;
        arr[i*3+2] = (bz * wS * wedge + oz) * (1 + (1-th)*0.16);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
    reshape();

    /* ── материал ── */
    const tN = attr('temp'), coreN = attr('core');
    const tt = clamp(tN.sub(760).div(720), 0, 1);
    const uPolish = TSL.uniform(0);
    const mat = new T.MeshStandardNodeMaterial({ metalness: 0.78 });
    /* тёмная сталь; раскалённая зона не отражает — светит */
    mat.colorNode = mix(vec3(0.043, 0.045, 0.050), vec3(0.010, 0.009, 0.008), tt.mul(0.9))
      .add(uPolish.mul(vec3(0.045, 0.047, 0.052)));
    mat.roughnessNode = float(0.50).sub(tt.mul(0.16)).sub(uPolish.mul(0.28));
    const heat = smoothstep(0.30, 0.96, tt);           /* жар — только в горячей зоне */
    const glow = heat.mul(coreN.mul(0.7).add(0.3));
    const fres = dot(normalize(cameraPosition.sub(positionWorld)), normalWorld).clamp(0, 1);
    const sss = fres.mul(0.55).add(0.45);
    /* прокат: продольные полосы, не крошка */
    const okal = pow(
        TSL.mx_noise_float(vec3(positionLocal.x.mul(7), positionLocal.y.mul(52), positionLocal.z.mul(52)))
          .mul(0.5).add(0.5),
      float(1.3)).mul(1.05).add(0.28);
    mat.emissiveNode = vec3(
        smoothstep(0.02, 0.30, heat),
        pow(heat, float(1.9)).mul(0.55),
        pow(heat, float(4.2)).mul(0.26)
      ).mul(glow).mul(sss).mul(okal).mul(5.2);
    const billet = new T.Mesh(geo, mat);
    billet.castShadow = true;
    const rig = new T.Group();
    rig.add(billet);
    rig.position.set(0, anvilTop + H/2, 0);
    group.add(rig);
    const rigHome = new T.Vector3(0, anvilTop + H/2, 0);
    /* клещи — реквизит у горна, в кадре ремесло, в руках ничего не висит */
    if (tongs) {
      const tw2 = new T.Group(); tw2.add(tongs);
      tw2.position.set(-0.66, 0.012, 0.52);
      tw2.rotation.y = -0.7;
      group.add(tw2);
    }

    const ember = new T.PointLight(0xff7a26, 2.3, 2.3, 2.0);
    ember.position.set(0, anvilTop + 0.22, 0);
    group.add(ember);

    /* ── гарь и окалина ── */
    const scM = new T.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    scM.colorNode = vec3(0.004, 0.003, 0.003);
    scM.opacityNode = smoothstep(float(0.95), float(0.12), TSL.uv().sub(0.5).length().mul(2))
      .mul(TSL.mx_noise_float(positionWorld.mul(5.5)).mul(0.35).add(0.75)).mul(0.62);
    const scorch = new T.Mesh(new T.CircleGeometry(1.05, 40), scM);
    scorch.rotation.x = -Math.PI/2; scorch.position.y = 0.004;
    group.add(scorch);
    const flakeG = new T.BoxGeometry(0.014, 0.0022, 0.009);
    const flakeM = new T.MeshStandardNodeMaterial({ color: 0x0b0b0d, roughness: 0.9, metalness: 0.3 });
    const NF = 46;
    const flakes = new T.InstancedMesh(flakeG, flakeM, NF);
    { const fm = new T.Matrix4(), fq = new T.Quaternion(), fe = new T.Euler(), fv = new T.Vector3(), fs = new T.Vector3();
      for (let i = 0; i < NF; i++) {
        const a = Math.random()*6.283, rr = 0.33 + Math.pow(Math.random(), 1.4)*0.75;
        fv.set(Math.cos(a)*rr, 0.0015, Math.sin(a)*rr);
        fe.set(0, Math.random()*6.283, 0); fq.setFromEuler(fe);
        fs.setScalar(0.6 + Math.random()*1.3);
        fm.compose(fv, fq, fs);
        flakes.setMatrixAt(i, fm);
      }
      flakes.instanceMatrix.needsUpdate = true; }
    group.add(flakes);

    /* ── искры ── */
    const NS = ctx.quality === 'soft' ? 90 : 240;
    const sGeo = new T.OctahedronGeometry(0.006, 0);
    sGeo.scale(1, 2.6, 1);
    const sMat = new T.MeshBasicNodeMaterial();
    const lifeA = attr('life');
    sMat.colorNode = vec3(float(1.0), lifeA.mul(0.62).add(0.06), lifeA.mul(lifeA).mul(0.30))
      .mul(lifeA.mul(9).add(0.5));
    const sparks = new T.InstancedMesh(sGeo, sMat, NS);
    sparks.frustumCulled = false;
    const sLife = new Float32Array(NS);
    sGeo.setAttribute('life', new T.InstancedBufferAttribute(sLife, 1));
    const sPos = new Float32Array(NS*3), sVel = new Float32Array(NS*3);
    const sM = new T.Matrix4(), sQ = new T.Quaternion(), sUp = new T.Vector3(0,1,0),
          sDir = new T.Vector3(), sScl = new T.Vector3(1,1,1), sP = new T.Vector3();
    let sHead = 0;
    for (let i = 0; i < NS; i++){ sM.makeTranslation(0,-9,0); sparks.setMatrixAt(i, sM); }
    sparks.instanceMatrix.needsUpdate = true;
    group.add(sparks);
    function burst(x, z, n) {
      for (let k = 0; k < n; k++) {
        const i = sHead = (sHead + 1) % NS;
        const a = Math.random()*6.283, up = 0.4 + Math.random()*1.4, sp = 1.5 + Math.random()*2.4;
        sPos[i*3] = x; sPos[i*3+1] = anvilTop + H; sPos[i*3+2] = z;
        sVel[i*3] = Math.cos(a)*sp; sVel[i*3+1] = up; sVel[i*3+2] = Math.sin(a)*sp;
        sLife[i] = 0.45 + Math.random()*0.55;
      }
    }

    /* ── пар закалки ── */
    const NP = 70;
    const pGeo = new T.IcosahedronGeometry(0.011, 1);
    const pMat = new T.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    const plA = attr('plife');
    pMat.colorNode = vec3(0.42, 0.48, 0.56);
    pMat.opacityNode = plA.mul(plA.oneMinus()).mul(0.22);
    const steam = new T.InstancedMesh(pGeo, pMat, NP);
    steam.frustumCulled = false;
    const pLife = new Float32Array(NP);
    pGeo.setAttribute('plife', new T.InstancedBufferAttribute(pLife, 1));
    const pPos = new Float32Array(NP*3), pVel = new Float32Array(NP*3), pScl = new Float32Array(NP);
    let pHead = 0;
    for (let i = 0; i < NP; i++){ sM.makeTranslation(0,-9,0); steam.setMatrixAt(i, sM); }
    group.add(steam);
    function puff(x, y, z) {
      const i = pHead = (pHead + 1) % NP;
      pPos[i*3] = x + (Math.random()-0.5)*0.10;
      pPos[i*3+1] = y;
      pPos[i*3+2] = z + (Math.random()-0.5)*0.10;
      pVel[i*3] = (Math.random()-0.5)*0.12;
      pVel[i*3+1] = 0.28 + Math.random()*0.30;
      pVel[i*3+2] = (Math.random()-0.5)*0.12;
      pScl[i] = 0.7 + Math.random()*0.9;
      pLife[i] = 0.01;
    }

    /* ── цикл ремесла ── */
    let mode = 'kovka', phT = 0, flash = 0, nextAuto = 1.1;
    let feed = 0;
    const strikeWorldX = 0;
    /* видимый молот: замах → удар → отскок, бьёт сам */
    const ham = { st: 'rest', t: 0, x: 0, z: 0, power: 0.6 };
    function swing(xw, z, power, fast) {
      if (ham.st !== 'rest' && ham.st !== 'recoil') return false;
      ham.st = 'up'; ham.t = 0; ham.x = xw; ham.z = z; ham.power = power; ham.fast = !!fast;
      return true;
    }

    function strike(xLocal, z, power) {
      /* xLocal — в координатах бруса (до feed) */
      const cf = (()=>{ /* найти столбик по накопленной длине */
        const target = xLocal + L/2;
        let lo = 0, hi = NC-1;
        while (lo < hi) { const m = (lo+hi)>>1; if (cumX[m] < target) lo = m+1; else hi = m; }
        return lo;
      })();
      const lf = cf/(NC-1);
      for (let c = 0; c < NC; c++) {
        const d = Math.abs(c - cf) / (BX * 0.16);
        if (d < 1) {
          const k = Math.cos(d*Math.PI/2)**2 * (0.9 + power*0.5);
          thA[c] = Math.max(bladeTh(c/(NC-1)), thA[c] - 0.011*k);
          pA[c] = Math.min(1, pA[c] + 0.22*k);
        }
      }
      for (let k = 0; k < 3; k++)
        for (let c = 1; c < NC-1; c++) thA[c] = thA[c]*0.60 + (thA[c-1]+thA[c+1])*0.20;
      marks.push({ x: xLocal, z: z*0.5, r: 0.085 + power*0.025, d: 0.0020 + power*0.0014, age: 0 });
      if (marks.length > 8) marks.shift();
      splashes.push({ x: xLocal, z: z*0.5, r: 0.10 + power*0.04, amp: 0.006 + power*0.005, age: 0 });
      if (splashes.length > 20) splashes.shift();
      for (let i = 0; i < nV; i++) {
        const bx = base[i*3];
        const cfv = Math.max(0, Math.min(NC-1.001, (bx/L + 0.5)*BX));
        const dist = Math.abs(cumX[Math.floor(cfv)] - L/2 - xLocal);
        if (dist < 0.14) tempA[i] = Math.min(1430, tempA[i] + (1 - dist/0.14) * 90);
      }
      geo.attributes.temp.needsUpdate = true;
      flash = 1;
      burst(xLocal + feed, z, ctx.quality === 'soft' ? 14 : 30);
    }

    let coolT = 0;
    function update(t, dt, focus, ptr) {
      coolT += dt;
      if (coolT > 0.12 && mode !== 'zakalka') {
        const k = Math.exp(-coolT * 0.05);
        for (let i = 0; i < nV; i++) tempA[i] = 840 + (tempA[i] - 840) * k;
        geo.attributes.temp.needsUpdate = true;
        coolT = 0;
      }
      if (focus < 0.02) return;

      let dirty = false;
      for (const d of marks) if (d.age < 1) { d.age = Math.min(1, d.age + dt/0.12); dirty = true; }
      for (const s of splashes) if (s.age < 1) { s.age = Math.min(1, s.age + dt/0.10); dirty = true; }

      if (mode === 'kovka') {
        /* брус неподвижен — молот сам идёт проходом вдоль него */
        const xMin = -L/2 - 0.005, xMax = barLen - L/2 + 0.005;
        nextAuto -= dt * (0.5 + focus);
        if (nextAuto <= 0) {
          update.pw = (update.pw ?? 0) + 0.085;
          if (update.pw > 1) update.pw = 0;
          const px = xMin + (xMax - xMin) * update.pw;
          if (hammer ? swing(px, (Math.random()-0.5)*0.03, 0.5 + Math.random()*0.4)
                     : (strike(px, 0, 0.6), dirty = true, true))
            nextAuto = 0.78 + Math.random()*0.4;
          else nextAuto = 0.1;
        }
        if (ptr && ptr.hit && ptr.world) {
          if (ptr.down && update.pd !== true) {
            const xw = Math.max(xMin, Math.min(xMax, ptr.world.x));
            if (hammer) swing(xw, Math.max(-0.06, Math.min(0.06, ptr.world.z)), 1.0, true);
            else { strike(xw, ptr.world.z, 1.0); dirty = true; }
            nextAuto = 1.0;
          }
          update.pd = ptr.down;
        } else update.pd = false;

        let done = 0; for (let c = 0; c < NC; c++) if (pA[c] > 0.85) done++;
        if (done / NC > 0.90) { mode = 'zakalka'; phT = 0; }
      }
      else if (mode === 'zakalka') {
        phT += dt;
        const cx = trough.position.x, cz = trough.position.z;
        const cen = (barLen - L) / 2;                     /* середина клинка в локале */
        const overTrough = new T.Vector3(cx - cen*Math.cos(0.28), waterY + 0.34, cz);
        if (phT < 1.0) {                                   /* перенос: клинок целиком над водой */
          const k = sm(phT / 1.0);
          rig.position.lerpVectors(rigHome, overTrough, k);
          rig.rotation.z = -0.16 * k;
          rig.rotation.y = 0.28 * k;                       /* вдоль корыта */
        } else if (phT < 1.8) {                            /* погружение ЦЕЛИКОМ */
          const k = sm((phT - 1.0) / 0.8);
          rig.position.y = overTrough.y - k * (overTrough.y - (waterY - 0.015));
          boil.value = Math.min(1, boil.value + dt*3);
          const q = k * 1.12;                              /* фронт от острия до хвоста */
          for (let i = 0; i < nV; i++) {
            const lfv = Math.max(0, Math.min(1, ((base[i*3]/L + 0.5)*BX)/(NC-1)));
            if (1 - lfv < q) tempA[i] += (300 - tempA[i]) * Math.min(1, dt*7);
          }
          geo.attributes.temp.needsUpdate = true;
          for (let s2 = 0; s2 < 3; s2++) if (Math.random() < 0.9)
            puff(cx + (Math.random()-0.5)*barLen*0.8, waterY + 0.02, cz + (Math.random()-0.5)*0.16);
          uPolish.value = Math.min(0.65, uPolish.value + dt*0.5);
        } else if (phT < 3.0) {                            /* выдержка: кипит вдоль всего клинка */
          for (let i = 0; i < nV; i++) tempA[i] += (300 - tempA[i]) * Math.min(1, dt*2.6);
          geo.attributes.temp.needsUpdate = true;
          if (Math.random() < 0.7)
            puff(cx + (Math.random()-0.5)*barLen*0.8, waterY + 0.02, cz + (Math.random()-0.5)*0.16);
          boil.value = Math.max(0, boil.value - dt*0.25);
        } else if (phT < 4.0) {                            /* подъём и показ */
          const k = sm((phT - 3.0) / 1.0);
          rig.position.y = (waterY - 0.015) + k * (anvilTop + 0.5 - (waterY - 0.015));
          boil.value = Math.max(0, boil.value - dt*1.5);
          if (Math.random() < 0.3*(1-k))
            puff(rig.position.x + cen, rig.position.y, rig.position.z);
        } else { mode = 'gotov'; phT = 0; }
      }
      else if (mode === 'gotov') {
        phT += dt;
        /* клинок над наковальней, медленный поворот — кромка ловит луч */
        rig.position.lerp(new T.Vector3(0, anvilTop + 0.42, 0.10), Math.min(1, dt*3));
        rig.rotation.z = Math.sin(phT*0.9)*0.06;
        rig.rotation.y += dt * 0.55;
        if (phT > 2.4) { mode = 'nagrev'; phT = 0; }
      }
      else if (mode === 'nagrev') {
        phT += dt;
        const k = sm(Math.min(1, phT / 1.6));
        rig.position.lerp(new T.Vector3(rigHome.x + 0.10, rigHome.y, rigHome.z), Math.min(1, dt*3.5));
        rig.rotation.y += (Math.round(rig.rotation.y / (Math.PI*2)) * Math.PI*2 - rig.rotation.y) * Math.min(1, dt*4);
        rig.rotation.z *= Math.max(0, 1 - dt*5);
        /* горн: всё разгорается, металл оседает в новую болванку */
        const e = k < 0.5 ? k*2 : (1-k)*2;
        for (let c = 0; c < NC; c++) { thA[c] += (H - thA[c]) * dt * 1.4; pA[c] *= Math.max(0, 1 - dt*1.6); }
        if (phT > 0.5 && (marks.length || splashes.length)) { marks.length = 0; splashes.length = 0; }
        for (let i = 0; i < nV; i++) tempA[i] = Math.min(1400, tempA[i] + e * dt * 1150 * (0.4 + coreA[i]));
        geo.attributes.temp.needsUpdate = true;
        dirty = true;
        uPolish.value = Math.max(0, uPolish.value - dt*0.7);
        if (k >= 1) { tempInit(); geo.attributes.temp.needsUpdate = true;
          feed = 0; update.pw = 0; rig.rotation.set(0,0,0); mode = 'kovka'; nextAuto = 1.4; }
      }
      /* ── молот: замах-удар-отскок ── */
      if (hammer) {
        const restY = anvilTop + 0.34, contactY = anvilTop + 0.15;
        if (mode !== 'kovka') {
          hammer.position.lerp(hammerRest, Math.min(1, dt*2.5));
          hammer.visible = mode !== 'gotov';
        } else {
          hammer.visible = true;
          if (ham.st === 'rest') {
            hammer.position.y = restY + Math.sin(t*1.1)*0.012;
            hammer.position.x += (0 - hammer.position.x) * Math.min(1, dt*2);
            hammer.position.z += (0.02 - hammer.position.z) * Math.min(1, dt*2);
          } else if (ham.st === 'up') {
            ham.t += dt / (ham.fast ? 0.15 : 0.30);
            const k = sm(Math.min(1, ham.t));
            hammer.position.y = restY + 0.26*k;
            hammer.position.x += (ham.x - hammer.position.x) * Math.min(1, dt*8);
            hammer.position.z += (ham.z - hammer.position.z) * Math.min(1, dt*8);
            hammer.rotation.z = -0.28 - 0.30*k;
            if (ham.t >= 1) { ham.st = 'down'; ham.t = 0; }
          } else if (ham.st === 'down') {
            ham.t += dt / 0.07;
            const k = Math.min(1, ham.t) ** 2;
            hammer.position.y = (restY + 0.26) - (restY + 0.26 - contactY)*k;
            hammer.rotation.z = -0.28 - 0.30*(1 - k);
            if (ham.t >= 1) {
              strike(ham.x - feed, ham.z, ham.power);
              dirty = true;
              ham.st = 'recoil'; ham.t = 0;
            }
          } else if (ham.st === 'recoil') {
            ham.t += dt / 0.32;
            const k = Math.min(1, ham.t);
            const ov = Math.sin(k*Math.PI) * 0.05;
            hammer.position.y = contactY + (restY - contactY)*sm(k) + ov;
            hammer.rotation.z = -0.28;
            if (ham.t >= 1) ham.st = 'rest';
          }
        }
      }
      if (dirty) reshape();

      flash = Math.max(0, flash - dt * 5.5);
      ember.intensity = 2.3 + Math.sin(t*2.4)*0.35 + flash*20 + (mode==='nagrev' ? 6 : 0);
      /* горн дышит углями, при нагреве ревёт */
      const gorn = group.userData.gorn;
      if (gorn) {
        const fl = 0.8 + 0.2*Math.sin(t*7.3) + 0.12*Math.sin(t*13.7);
        gorn.userData.light.intensity = (mode === 'nagrev' ? 15 : 5.5) * fl;
        forgeGlow.value = (mode === 'nagrev' ? 1.9 : 1.0) * fl;
      }

      /* искры */
      let any = false;
      for (let i = 0; i < NS; i++) {
        if (sLife[i] <= 0) continue;
        any = true;
        sLife[i] -= dt * 0.9;
        sVel[i*3+1] -= 9.8 * dt;
        let px = sPos[i*3] + sVel[i*3]*dt, py = sPos[i*3+1] + sVel[i*3+1]*dt, pz = sPos[i*3+2] + sVel[i*3+2]*dt;
        const onAnvil = Math.abs(px) < 0.31 && Math.abs(pz) < 0.14;
        const ground = onAnvil ? anvilTop : 0.005;
        if (py < ground && sVel[i*3+1] < 0) { py = ground; sVel[i*3+1] *= -0.36; sVel[i*3] *= 0.6; sVel[i*3+2] *= 0.6; }
        sPos[i*3] = px; sPos[i*3+1] = py; sPos[i*3+2] = pz;
        sP.set(px, py, pz);
        sDir.set(sVel[i*3], sVel[i*3+1], sVel[i*3+2]);
        const sp = Math.max(0.02, sDir.length()); sDir.divideScalar(sp);
        sQ.setFromUnitVectors(sUp, sDir);
        sScl.set(1, Math.min(3, 0.7 + sp*0.5), 1);
        sM.compose(sP, sQ, sScl);
        sparks.setMatrixAt(i, sM);
        if (sLife[i] <= 0) { sM.makeTranslation(0,-9,0); sparks.setMatrixAt(i, sM); }
      }
      if (any) { sparks.instanceMatrix.needsUpdate = true; sGeo.attributes.life.needsUpdate = true; }

      /* пар */
      let anyP = false;
      for (let i = 0; i < NP; i++) {
        if (pLife[i] <= 0) continue;
        anyP = true;
        pLife[i] += dt * 0.8;
        if (pLife[i] >= 1) { pLife[i] = 0; sM.makeTranslation(0,-9,0); steam.setMatrixAt(i, sM); continue; }
        pPos[i*3] += pVel[i*3]*dt; pPos[i*3+1] += pVel[i*3+1]*dt; pPos[i*3+2] += pVel[i*3+2]*dt;
        sP.set(pPos[i*3], pPos[i*3+1], pPos[i*3+2]);
        const gs = pScl[i] * (0.5 + pLife[i]*1.5);
        sScl.set(gs, gs, gs);
        sQ.identity();
        sM.compose(sP, sQ, sScl);
        steam.setMatrixAt(i, sM);
      }
      if (anyP) { steam.instanceMatrix.needsUpdate = true; pGeo.attributes.plife.needsUpdate = true; }
    }

    return {
      group, update,
      hitY: anvilTop + H,
      touchHint: 'кликните по заготовке — молот ударит в эту точку',
      dispose() { geo.dispose(); sGeo.dispose(); pGeo.dispose(); }
    };
  }
};
