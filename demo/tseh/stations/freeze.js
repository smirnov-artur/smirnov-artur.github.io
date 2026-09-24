/* freeze — плошка переохлаждённого расплава ацетата натрия.
   Фазовое поле (скрытая теплота + Гиббс–Томсон) на GPU через ping-pong
   RenderTarget ≤256² — тот же приём, что в site/cases/moroz, разрешение
   урезано, физика та же: рост фронта v = k·(Tm−T)^1.5·a(θ), рекалесценция
   ΔT = L/c·Δφ, обратный ход при перегреве. Числа — из site/cases/freeze
   (ацетат натрия: Tm=58°C, L/c=94.3K). */
export default {
  name: 'freeze',
  title: 'Тепловой аккумулятор',
  line: 'энергия плато → длительность → цена партии',
  accent: 0x49bdff,

  async build(T, TSL, ctx) {
    const t0build = performance.now();
    const { Fn, If, uniform, texture, uv, vec2, vec3, vec4, float, mix, clamp, smoothstep,
            abs, max, min, pow, exp, sin, cos, atan, fract, length, dot, normalize,
            positionWorld, positionLocal, modelWorldMatrixInverse, modelWorldMatrix,
            mx_noise_float, time } = TSL;

    const group = new T.Group();

    /* геометрия — метры, основание y=0 (стол зала добавит свои +0.9).
       Камера solo-харнесса стоит на фиксированной дистанции ~3.3м с FOV 34° —
       для «заполнения центральной трети кадра» предмет должен быть заметного
       размера, не буквальные 9см настольной плошки: диаметр борта 0.5м. */
    const R_OUT = 0.25, TH_RIM = 0.012, BASE_TH = 0.016, FOOT_R = 0.018, WALL_H = 0.075;
    const R_BOT = R_OUT - TH_RIM - 0.006;   /* радиус жидкости — чуть меньше внутренней стенки */
    const LIQ_Y = 0.058;
    const SIZE = ctx.quality === 'soft' ? 96 : 160;

    /* ── фазовое поле: два таргета, шаг рисуется квадом ── */
    const rtOpt = { type: T.HalfFloatType, format: T.RGBAFormat, minFilter: T.LinearFilter,
      magFilter: T.LinearFilter, depthBuffer: false, stencilBuffer: false,
      wrapS: T.ClampToEdgeWrapping, wrapT: T.ClampToEdgeWrapping, generateMipmaps: false };
    const rtA = new T.RenderTarget(SIZE, SIZE, rtOpt);
    const rtB = new T.RenderTarget(SIZE, SIZE, rtOpt);
    const ST = texture(rtA.texture);   /* читает шаг компута */
    const SR = texture(rtA.texture);   /* читает сцена — свежий кадр после свопа */

    const Tm = 58, T0 = 22, LoC = 94.3;      /* °C, °C, K — ацетат натрия */
    const growReal = 0.028;                  /* мм/с на K^1.5, справочник */
    const vTip = SIZE / 20, REF = 30;
    const growSim = vTip / Math.pow(REF, 1.5);
    const difSim = 3.0 * vTip;
    const dtSim = 0.22 / difSim;
    const cellMm = (R_BOT * 2000) / SIZE;
    void ((growSim * cellMm) / growReal);    /* масштаб времени поля к реальным секундам */

    const U = {
      uDt: uniform(dtSim), uTm: uniform(Tm), uT0: uniform(T0), uLoC: uniform(LoC),
      uDif: uniform(difSim), uGrow: uniform(growSim), uAmb: uniform(0.006),
      uReset: uniform(1),
      uSeed: uniform(new T.Vector3(0, 0, 0)), uSeedTh: uniform(0), uSeedR: uniform(0.045),
      uMelt: uniform(new T.Vector3(0, 0, 0)),
    };
    const uHover = uniform(new T.Vector3(0, 0, 0));   /* xz — локаль в метрах, z — сила ряби */

    const hash21 = p => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));

    const simFn = Fn(() => {
      const Uv = uv().toVar();
      const px = float(1 / SIZE);
      const s = ST.sample(Uv);
      const out = vec4(1, T0, 0, 0).toVar();

      If(U.uReset.greaterThan(0.5), () => {
        out.assign(vec4(1, U.uT0, 0, hash21(Uv.mul(233.1))));
      }).Else(() => {
        const phi = s.x.oneMinus().toVar();
        const Tc = s.y.toVar();
        const th = s.z.toVar();
        const sd = s.w.toVar();
        const P = Uv.mul(2).sub(1).toVar();
        const rr = length(P).toVar();

        const e = ST.sample(Uv.add(vec2(px, 0)));
        const w = ST.sample(Uv.add(vec2(px.negate(), 0)));
        const n = ST.sample(Uv.add(vec2(0, px)));
        const s2 = ST.sample(Uv.add(vec2(0, px.negate())));
        const ne = ST.sample(Uv.add(vec2(px, px)));
        const nw = ST.sample(Uv.add(vec2(px.negate(), px)));
        const se = ST.sample(Uv.add(vec2(px, px.negate())));
        const sw = ST.sample(Uv.add(vec2(px.negate(), px.negate())));

        /* девятиточечный лапласиан теплопроводности */
        const lap = e.y.add(w.y).add(n.y).add(s2.y).mul(4)
          .add(ne.y).add(nw.y).add(se.y).add(sw.y).sub(Tc.mul(20)).div(6);
        Tc.addAssign(U.uDif.mul(lap).mul(U.uDt));

        const pe = e.x.oneMinus(), pw = w.x.oneMinus(), pn = n.x.oneMinus(), ps = s2.x.oneMinus();
        const pne = ne.x.oneMinus(), pnw = nw.x.oneMinus(), pse = se.x.oneMinus(), psw = sw.x.oneMinus();
        const nmax = max(max(max(pe, pw), max(pn, ps)), max(max(pne, pnw), max(pse, psw))).toVar();

        /* пустая клетка перенимает ориентацию у самого промёрзшего соседа */
        If(phi.lessThan(0.02).and(nmax.greaterThan(0.30)), () => {
          const best = float(-1).toVar(), bo = th.toVar();
          If(pe.greaterThan(best), () => { best.assign(pe); bo.assign(e.z); });
          If(pw.greaterThan(best), () => { best.assign(pw); bo.assign(w.z); });
          If(pn.greaterThan(best), () => { best.assign(pn); bo.assign(n.z); });
          If(ps.greaterThan(best), () => { best.assign(ps); bo.assign(s2.z); });
          If(pne.greaterThan(best), () => { best.assign(pne); bo.assign(ne.z); });
          If(pnw.greaterThan(best), () => { best.assign(pnw); bo.assign(nw.z); });
          If(pse.greaterThan(best), () => { best.assign(pse); bo.assign(se.z); });
          If(psw.greaterThan(best), () => { best.assign(psw); bo.assign(sw.z); });
          th.assign(bo);
        });

        const own = smoothstep(0.02, 0.22, phi);
        const nb = smoothstep(0.33, 0.78, nmax);
        const drive = max(own, nb).toVar();

        If(phi.lessThan(1).and(drive.greaterThan(0.002)).and(rr.lessThan(0.99)), () => {
          const gx = pe.sub(pw).add(pne.add(pse).sub(pnw).sub(psw).mul(0.5));
          const gy = pn.sub(ps).add(pne.add(pnw).sub(pse).sub(psw).mul(0.5));
          const ang = atan(gy, gx.add(1e-6)).toVar();
          const c6 = cos(ang.sub(th.mul(6.283)).mul(6)).toVar();
          const a = c6.mul(0.46).add(1);
          /* кривизна границы: у острия лапласиан фазы отрицательный —
             Гиббс–Томсон опускает точку плавления, острые пальцы растут легче */
          const lapP = pe.add(pw).add(pn).add(ps)
            .add(pne.add(pnw).add(pse).add(psw).mul(0.5)).sub(phi.mul(6));
          const stiff = float(1.35).mul(c6.mul(0.88).oneMinus());
          const dT = max(0, U.uTm.sub(Tc).add(stiff.mul(lapP))).toVar();
          const v = U.uGrow.mul(pow(dT, 1.5)).mul(max(a, 0.02)).mul(drive)
            .mul(sd.sub(0.5).mul(0.24).add(1));
          /* замёрзнуть можно ровно на столько, на сколько хватает переохлаждения —
             скрытая теплота греет клетку и сама останавливает рост */
          const room = dT.div(U.uLoC);
          const dphi = min(min(v.mul(U.uDt), room), phi.oneMinus()).toVar();
          phi.addAssign(dphi); Tc.addAssign(U.uLoC.mul(dphi));
        });

        /* перегрев тает лёд и забирает ту же теплоту назад */
        If(phi.greaterThan(0.0005).and(Tc.greaterThan(U.uTm)), () => {
          const dm = min(phi, Tc.sub(U.uTm).div(U.uLoC).mul(0.6)).toVar();
          phi.subAssign(dm); Tc.subAssign(U.uLoC.mul(dm));
        });

        /* локальное плавление вторым кликом — точечный нагрев выше Tm */
        const dMelt = length(P.sub(U.uMelt.xy));
        Tc.addAssign(U.uMelt.z.mul(exp(dMelt.mul(dMelt).mul(-90))).mul(U.uDt).mul(340));

        /* плошка не изолирована — тепло уходит в воздух и стекло */
        Tc.addAssign(U.uT0.sub(Tc).mul(U.uAmb).mul(U.uDt));

        If(U.uSeed.z.greaterThan(0.5).and(length(P.sub(U.uSeed.xy)).lessThan(U.uSeedR)), () => {
          const dp = max(0, min(phi.oneMinus(), U.uTm.sub(Tc).div(U.uLoC))).toVar();
          phi.addAssign(dp); Tc.addAssign(U.uLoC.mul(dp)); th.assign(U.uSeedTh);
        });

        If(rr.greaterThan(0.99), () => { phi.assign(0); Tc.assign(U.uT0); });
        out.assign(vec4(phi.oneMinus(), Tc, th, sd));
      });
      return out;
    });

    const simMat = new T.NodeMaterial();
    simMat.fragmentNode = simFn();
    simMat.depthTest = false; simMat.depthWrite = false;
    const quadScene = new T.Scene();
    const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new T.PlaneGeometry(2, 2);
    const quad = new T.Mesh(quadGeo, simMat);
    quad.frustumCulled = false; quadScene.add(quad);

    let src = rtA, dst = rtB;
    function simStep() {
      ST.value = src.texture;
      ctx.renderer.setRenderTarget(dst);
      ctx.renderer.render(quadScene, quadCam);
      ctx.renderer.setRenderTarget(null);
      const tmp = src; src = dst; dst = tmp;
      SR.value = src.texture;
    }
    U.uReset.value = 1; simStep(); simStep(); U.uReset.value = 0;

    /* ── видимая жидкость/лёд: узловой материал, эмиссия — фронт ── */
    const fieldAt = xz => SR.sample(xz.div(R_BOT).mul(0.5).add(0.5));
    const accentColor = new T.Color(0x49bdff);
    const ACC = vec3(accentColor.r, accentColor.g, accentColor.b);
    const cellW = float((R_BOT * 2) / SIZE);

    const HEIGHT_MAX = 0.026;   /* высота ледяных пальцев над зеркалом жидкости, м */
    const heightAt = xz => smoothstep(0.05, 0.88, fieldAt(xz).x.oneMinus()).mul(HEIGHT_MAX);

    const localXZ = () => modelWorldMatrixInverse.mul(vec4(positionWorld, 1)).xyz.xz;

    const colorFn = Fn(() => {
      const phi = fieldAt(localXZ()).x.oneMinus();
      const meltStep = smoothstep(0.04, 0.5, phi);
      return mix(vec3(0.006, 0.009, 0.015), vec3(0.78, 0.85, 0.91), meltStep);
    });
    const roughFn = Fn(() => {
      const phi = fieldAt(localXZ()).x.oneMinus();
      return mix(float(0.022), float(0.52), smoothstep(0.04, 0.5, phi));
    });
    const emisFn = Fn(() => {
      const xz = localXZ();
      const st = fieldAt(xz);
      const phi = st.x.oneMinus();
      const Tc = st.y;
      const gx = fieldAt(xz.add(vec2(cellW, 0))).x.sub(fieldAt(xz.sub(vec2(cellW, 0))).x);
      const gz = fieldAt(xz.add(vec2(0, cellW))).x.sub(fieldAt(xz.sub(vec2(0, cellW))).x);
      const gmag = abs(gx).add(abs(gz));
      /* полоса активного фронта — гаснет и у чистой воды (phi≈0), и у устоявшегося льда (phi≈1) */
      const mushy = smoothstep(0.02, 0.13, phi).mul(smoothstep(0.95, 0.55, phi));
      const heat = clamp(Tc.sub(U.uT0).div(U.uLoC.mul(0.6)), 0, 1);
      const glow = mushy.mul(gmag.mul(9).clamp(0, 1).add(0.25)).mul(heat.mul(0.6).add(0.4)).mul(2.6);
      const hoverD = length(xz.sub(uHover.xy));
      const chill = exp(hoverD.mul(hoverD).mul(-260)).mul(uHover.z).mul(phi.oneMinus()).mul(0.16);
      return ACC.mul(glow.add(chill));
    });
    const dispFn = Fn(() => positionLocal.add(vec3(0, heightAt(positionLocal.xz), 0)));

    /* чёрное зеркало жидкости / матовый лёд — стандартный лит-материал: настоящее
       зеркало от прожектора зала и IBL даёт сама PBR-модель, руками не считаем */
    const meltMat = new T.MeshStandardNodeMaterial({ metalness: 0 });
    meltMat.colorNode = colorFn();
    meltMat.roughnessNode = roughFn();
    meltMat.emissiveNode = emisFn();
    meltMat.positionNode = dispFn();

    /* полярная сетка вместо CircleGeometry — нужна радиальная тесселяция под
       вертикальный дисплейсмент ледяных пальцев (веером от центра тесселяции нет) */
    function polarGrid(R, rings, segs) {
      const pos = [0, 0, 0], uvs = [0.5, 0.5], idx = [];
      for (let r = 1; r <= rings; r++) {
        const rad = R * (r / rings);
        for (let s = 0; s < segs; s++) {
          const a = (s / segs) * Math.PI * 2;
          const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
          pos.push(x, 0, z); uvs.push(x / (2 * R) + 0.5, z / (2 * R) + 0.5);
        }
      }
      for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + (s + 1) % segs);
      for (let r = 1; r < rings; r++) {
        const b0 = 1 + (r - 1) * segs, b1 = 1 + r * segs;
        for (let s = 0; s < segs; s++) {
          const s2 = (s + 1) % segs;
          idx.push(b0 + s, b1 + s, b1 + s2, b0 + s, b1 + s2, b0 + s2);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    const liqGeo = polarGrid(R_BOT * 0.985, 40, 84);
    const liqMesh = new T.Mesh(liqGeo, meltMat);
    liqMesh.position.y = LIQ_Y;
    liqMesh.receiveShadow = true;
    group.add(liqMesh);

    /* ── плошка: точёный профиль LatheGeometry, настоящая толщина стенки и
       скруглённая кромка вместо цилиндра с плоскими крышками ── */
    const glassMat = new T.MeshPhysicalNodeMaterial({
      color: 0x0b0f14, metalness: 0,
      transmission: 1, ior: 1.46, thickness: TH_RIM, transparent: true, side: T.DoubleSide,
    });
    glassMat.roughnessNode = float(0.026).add(mx_noise_float(positionWorld.mul(150)).mul(0.5).add(0.5).mul(0.03));

    const pts = [];
    pts.push([0, 0]);
    pts.push([R_OUT - FOOT_R, 0]);
    { const n = 5; for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2;
      pts.push([R_OUT - FOOT_R + Math.sin(a) * FOOT_R, (1 - Math.cos(a)) * FOOT_R]); } }
    pts.push([R_OUT, WALL_H - TH_RIM / 2]);
    { const lipR = TH_RIM / 2, cx = R_OUT - lipR, cy = WALL_H - lipR, n = 10;
      for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI;
        pts.push([cx + Math.cos(a) * lipR, cy + Math.sin(a) * lipR]); } }
    pts.push([R_OUT - TH_RIM, BASE_TH]);
    pts.push([(R_OUT - TH_RIM) * 0.5, BASE_TH * 0.55]);
    pts.push([0, BASE_TH * 0.32]);
    const latheGeo = new T.LatheGeometry(pts.map(p => new T.Vector2(p[0], p[1])), 64);
    const dish = new T.Mesh(latheGeo, glassMat);
    group.add(dish);

    /* ── касание ── */
    const seeds = [];
    let wasDown = false, seedPulse = 0, meltTimer = 0, hoverT = 0;
    const V_AVG = R_BOT / 18;   /* м/с — эвристика клика по эффективной скорости фронта, не сама физика поля */

    function update(t, dt, focus, p) {
      let hx = 0, hz = 0, hoverTarget = 0;
      if (focus > 0.5 && p.hit && p.world) {
        const r = Math.hypot(p.world.x, p.world.z);
        if (r < R_BOT * 0.95) {
          hx = p.world.x; hz = p.world.z;
          hoverTarget = p.down ? 0 : 1;
          if (p.down && !wasDown) {
            let melt = false;
            for (const sdSeed of seeds) {
              const reach = Math.min(R_BOT, V_AVG * (t - sdSeed.t0));
              if (Math.hypot(hx - sdSeed.x, hz - sdSeed.z) < reach * 1.1) { melt = true; break; }
            }
            if (melt) {
              U.uMelt.value.set(hx / R_BOT, hz / R_BOT, 1);
              meltTimer = 1.1;
            } else {
              seeds.push({ x: hx, z: hz, t0: t });
              U.uSeed.value.set(hx / R_BOT, hz / R_BOT, 1);
              U.uSeedTh.value = Math.random();
              seedPulse = 2;
            }
          }
        }
        wasDown = p.down;
      } else wasDown = false;

      hoverT += (hoverTarget - hoverT) * Math.min(1, dt * 6);
      uHover.value.set(hx, hz, hoverT);

      if (seedPulse > 0) { seedPulse--; if (seedPulse <= 0) U.uSeed.value.z = 0; }
      if (meltTimer > 0) {
        meltTimer -= dt;
        U.uMelt.value.z = Math.max(0, meltTimer / 1.1);
      }

      if (focus > 0.03) simStep();
    }

    const buildMs = Math.round(performance.now() - t0build);
    console.info(`freeze: build ${buildMs}ms, поле ${SIZE}×${SIZE}`);

    return {
      group,
      update,
      hitY: 0.9 + LIQ_Y,
      touchHint: 'клик — зародыш кристалла; клик в лёд — плавит',
      dispose() {
        rtA.dispose(); rtB.dispose();
        liqGeo.dispose(); latheGeo.dispose(); quadGeo.dispose();
        meltMat.dispose(); glassMat.dispose(); simMat.dispose();
      },
    };
  },
};
