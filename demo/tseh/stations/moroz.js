/* ═══ станция moroz · гранёный стакан, иней растёт по стенке от касания ═══
   Физика — тот же фазовый переход, что в site/cases/moroz (диффузия температуры
   + анизотропный дендритный рост с кривизной Гиббса — Томсона + скрытая теплота),
   решётка урезана до 128² и перенесена с плоского среза стакана на развёртку
   его цилиндрической стенки (u = угол, v = высота). Раймарч льда в воде из
   кейса убран целиком — стенка тонкая, иней рисуется как узловой материал
   на тонкой прозрачной оболочке внутри стекла, а не как объём. */
export default {
  name: 'moroz',
  title: 'Переохлаждённая вода',
  line: 'живой замер фазового перехода: °C, мм/с, Дж',
  accent: 0x5ec3ff,
  async build(T, TSL, ctx) {
    const t0 = performance.now();
    const { Fn, If, uniform, texture, uv, vec2, vec3, vec4, float, mix,
            smoothstep, max, min, pow, sin, cos, atan, fract, dot, length, normalize,
            positionLocal, normalLocal, positionWorld, mx_noise_float } = TSL;
    const renderer = ctx.renderer;
    const ACCENT = 0x5ec3ff;

    /* ── геометрия: гранёный стакан со скульптурным профилем ────────
       не цилиндр: узкая пятка → раздутое пузо → прямые грани корпуса →
       поджатое горло → отогнутая губа. Двойная стенка в верхней трети —
       у кромки видна настоящая толщина стекла, а не нулевой лист. */
    const H = 0.46;
    const WALL = 0.0038;                    // толщина стекла у кромки, м
    const PROF = [                           // [r, y] снизу вверх, наружная стенка
      [0.040, 0.000], [0.043, 0.010], [0.058, 0.028], [0.086, 0.058],
      [0.103, 0.118], [0.101, 0.185], [0.100, 0.200],
      [0.100, 0.340], [0.093, 0.400], [0.088, 0.430], [0.089, 0.460],
    ];
    const YINNER0 = 0.200;                   // выше этой высоты стакан полый
    const profR = (y) => {
      for (let i = 0; i < PROF.length - 1; i++) {
        const [r0, y0] = PROF[i], [r1, y1] = PROF[i + 1];
        if (y >= y0 - 1e-6 && y <= y1 + 1e-6) return r0 + (r1 - r0) * (y - y0) / (y1 - y0 || 1);
      }
      return PROF[PROF.length - 1][0];
    };
    const FACETS = 10, SUB = 3, seg = Math.PI * 2 / FACETS;
    const facetK = (y) => {                  // 1 — грань, 0 — гладкая кромка у пуза/губы
      const a = Math.min(1, Math.max(0, (y - 0.145) / 0.025));
      const b = 1 - Math.min(1, Math.max(0, (y - 0.395) / 0.025));
      return a * b;
    };
    const radAt = (r, y, ang) => {
      const k = facetK(y); if (k < 0.001) return r;
      const half = seg / 2, d = ((ang % seg) + seg) % seg - half;
      const flat = r * Math.cos(half) / Math.cos(d);
      return r * (1 - k) + flat * k;
    };
    function ring(baseRFn, ys) {              // кольцо в 3D по всем граням/подсегментам
      const pts = [];
      for (let f = 0; f < FACETS; f++) {
        const a0 = f * seg - seg / 2;
        for (let sI = 0; sI <= SUB; sI++) {
          if (f > 0 && sI === 0) continue;    // не дублировать стык граней
          const ang = a0 + seg * sI / SUB;
          const r = radAt(baseRFn(ys), ys, ang);
          pts.push([Math.cos(ang) * r, ys, Math.sin(ang) * r]);
        }
      }
      return pts;
    }
    function quadStrip(pos, ringA, ringB, flip) {
      for (let i = 0; i < ringA.length - 1; i++) {
        const A = ringA[i], B = ringA[i + 1], C = ringB[i + 1], D = ringB[i];
        if (flip) pos.push(...A, ...C, ...B, ...A, ...D, ...C);
        else pos.push(...A, ...B, ...C, ...A, ...C, ...D);
      }
    }
    function buildGlassGeo() {
      const pos = [];
      /* наружная стенка: кольцо на каждой контрольной высоте профиля */
      const outerYs = PROF.map((p) => p[1]);
      const outerRings = outerYs.map((y) => ring(profR, y));
      for (let i = 0; i < outerRings.length - 1; i++) quadStrip(pos, outerRings[i], outerRings[i + 1], false);
      /* донце снаружи */
      { const rb = profR(0);
        for (let f = 0; f < FACETS; f++) {
          const a0 = f * seg - seg / 2;
          for (let sI = 0; sI < SUB; sI++) {
            const ga = a0 + seg * sI / SUB, gb = a0 + seg * (sI + 1) / SUB;
            pos.push(0, 0, 0, Math.cos(gb) * rb, 0, Math.sin(gb) * rb, Math.cos(ga) * rb, 0, Math.sin(ga) * rb);
          }
        } }
      /* внутренняя стенка (полая часть, нормали внутрь) + пол внутри */
      const innerRFn = (y) => profR(y) - WALL;
      const innerYs = outerYs.filter((y) => y >= YINNER0 - 1e-6);
      if (innerYs[0] > YINNER0 + 1e-6) innerYs.unshift(YINNER0);
      const innerRings = innerYs.map((y) => ring(innerRFn, y));
      for (let i = 0; i < innerRings.length - 1; i++) quadStrip(pos, innerRings[i], innerRings[i + 1], true);
      { const rf = innerRFn(YINNER0);
        for (let f = 0; f < FACETS; f++) {
          const a0 = f * seg - seg / 2;
          for (let sI = 0; sI < SUB; sI++) {
            const ga = a0 + seg * sI / SUB, gb = a0 + seg * (sI + 1) / SUB;
            pos.push(0, YINNER0, 0, Math.cos(ga) * rf, YINNER0, Math.sin(ga) * rf, Math.cos(gb) * rf, YINNER0, Math.sin(gb) * rf);
          }
        } }
      /* кромка: мостик наружная ↔ внутренняя стенка на верхнем кольце — здесь толщина стекла видна */
      quadStrip(pos, ring(profR, H), ring(innerRFn, H), false);
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    }
    const glassGeo = buildGlassGeo();

    /* ── поле инея: ping-pong RT 128², читается развёрткой стенки ──── */
    const SIZE = 128;
    const rtOpt = { type: T.HalfFloatType, format: T.RGBAFormat, minFilter: T.LinearFilter,
      magFilter: T.LinearFilter, depthBuffer: false, stencilBuffer: false,
      wrapS: T.RepeatWrapping, wrapT: T.ClampToEdgeWrapping, generateMipmaps: false };
    const rtA = new T.RenderTarget(SIZE, SIZE, rtOpt);
    const rtB = new T.RenderTarget(SIZE, SIZE, rtOpt);
    for (const rt of [rtA, rtB]) {
      rt.texture.minFilter = T.LinearFilter; rt.texture.magFilter = T.LinearFilter;
      rt.texture.wrapS = T.RepeatWrapping; rt.texture.wrapT = T.ClampToEdgeWrapping;
    }
    const ST = texture(rtA.texture);          // читает шаг симуляции
    const STR = texture(rtA.texture);         // читает материал стенки (тот же кадр)

    const REF = 8;
    const vTip = SIZE / 22, grow = vTip / Math.pow(REF, 1.5), dif = 3.2 * vTip, dt0 = 0.20 / dif;
    const U = {
      uDt: uniform(dt0), uTm: uniform(0), uLoC: uniform(79.8), uDif: uniform(dif),
      uKamb: uniform(0.06), uTamb: uniform(-14), uGrow: uniform(grow), uReset: uniform(1),
      uSeed: uniform(new T.Vector3(0, 0, 0)), uSeedTh: uniform(0), uSeedR: uniform(0.045),
      uWarm: uniform(new T.Vector3(0, 0, 0)),
    };
    const hash21 = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));

    /* домен — прямоугольник (u угол, v высота): x заворачивается через RepeatWrapping
       текстуры, для тёплого следа и зародыша расстояние по u берётся кратчайшим по кольцу */
    const simFn = Fn(() => {
      const Uv = uv().toVar();
      const px = float(1 / SIZE);
      const s = ST.sample(Uv);
      const out = vec4(1, -14, 0, hash21(Uv.mul(311.7))).toVar();

      If(U.uReset.greaterThan(0.5), () => {
        out.assign(vec4(1, -14, 0, hash21(Uv.mul(311.7))));
      }).Else(() => {
        const phi = s.x.oneMinus().toVar();
        const Tc = s.y.toVar();
        const th = s.z.toVar();
        const sd = s.w.toVar();

        const e  = ST.sample(Uv.add(vec2(px, 0)));
        const w  = ST.sample(Uv.add(vec2(px.negate(), 0)));
        const n  = ST.sample(Uv.add(vec2(0, px)));
        const s2 = ST.sample(Uv.add(vec2(0, px.negate())));
        const ne = ST.sample(Uv.add(vec2(px, px)));
        const nw = ST.sample(Uv.add(vec2(px.negate(), px)));
        const se = ST.sample(Uv.add(vec2(px, px.negate())));
        const sw = ST.sample(Uv.add(vec2(px.negate(), px.negate())));

        const lap = e.y.add(w.y).add(n.y).add(s2.y).mul(4)
          .add(ne.y).add(nw.y).add(se.y).add(sw.y).sub(Tc.mul(20)).div(6);
        Tc.addAssign(U.uDif.mul(lap).mul(U.uDt));

        const pe = e.x.oneMinus(), pw = w.x.oneMinus(), pn = n.x.oneMinus(), ps = s2.x.oneMinus();
        const pne = ne.x.oneMinus(), pnw = nw.x.oneMinus(), pse = se.x.oneMinus(), psw = sw.x.oneMinus();
        const nmax = max(max(max(pe, pw), max(pn, ps)), max(max(pne, pnw), max(pse, psw))).toVar();

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

        If(phi.lessThan(1).and(drive.greaterThan(0.002)), () => {
          const gx = pe.sub(pw).add(pne.add(pse).sub(pnw).sub(psw).mul(0.5));
          const gy = pn.sub(ps).add(pne.add(pnw).sub(pse).sub(psw).mul(0.5));
          const ang = atan(gy, gx.add(1e-6)).toVar();
          const ori = fract(th.mul(4)).toVar();
          const c6 = cos(ang.sub(ori.mul(Math.PI / 3)).mul(6)).toVar();
          const a = c6.mul(0.46).add(1);
          /* кривизна границы (Гиббс — Томсон): у острия lapP < 0, точка плавления
             там ниже — плоский фронт распадается на ветви сам, без нарисованных веток */
          const lapP = pe.add(pw).add(pn).add(ps)
            .add(pne.add(pnw).add(pse).add(psw).mul(0.5)).sub(phi.mul(6));
          const stiff = float(1.35).mul(c6.mul(0.88).oneMinus());
          const dT = max(0, U.uTm.sub(Tc).add(stiff.mul(lapP))).toVar();
          const v = U.uGrow.mul(pow(dT, 1.5)).mul(max(a, 0.02)).mul(drive)
            .mul(sd.sub(0.5).mul(0.26).add(1));
          const room = dT.div(U.uLoC);         // скрытая теплота: греет клетку, тормозит фронт
          const dphi = min(min(v.mul(U.uDt), room), phi.oneMinus()).toVar();
          phi.addAssign(dphi); Tc.addAssign(U.uLoC.mul(dphi));
        });

        If(phi.greaterThan(0.0005).and(Tc.greaterThan(U.uTm)), () => {
          const dm = min(phi, Tc.sub(U.uTm).div(U.uLoC).mul(0.55)).toVar();
          phi.subAssign(dm); Tc.subAssign(U.uLoC.mul(dm));
        });

        const dxw = fract(Uv.x.sub(U.uWarm.x).add(0.5)).sub(0.5);       // кратчайший путь по кольцу
        const dw = length(vec2(dxw, Uv.y.sub(U.uWarm.y)));
        Tc.addAssign(U.uWarm.z.mul(TSL.exp(dw.mul(dw).mul(-90))).mul(U.uDt).mul(220));

        Tc.addAssign(U.uTamb.sub(Tc).mul(U.uKamb).mul(U.uDt));

        const dxs = fract(Uv.x.sub(U.uSeed.x).add(0.5)).sub(0.5);
        const dseed = length(vec2(dxs, Uv.y.sub(U.uSeed.y)));
        If(U.uSeed.z.greaterThan(0.5).and(dseed.lessThan(U.uSeedR)), () => {
          const dp = max(0, min(phi.oneMinus(), U.uTm.sub(Tc).div(U.uLoC))).toVar();
          phi.addAssign(dp); Tc.addAssign(U.uLoC.mul(dp)); th.assign(U.uSeedTh);
        });

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
    quad.frustumCulled = false;
    quadScene.add(quad);

    let src = rtA, dst = rtB;
    function simStep() {
      ST.value = src.texture;
      renderer.setRenderTarget(dst);
      renderer.render(quadScene, quadCam);
      renderer.setRenderTarget(null);
      const tmp = src; src = dst; dst = tmp;
      STR.value = src.texture;
    }
    U.uReset.value = 1; simStep(); simStep(); U.uReset.value = 0;

    /* ── стекло + иней в одном материале ───────────────────────────
       Отдельный объект инея внутри стекла оказался невидим целиком: у этого
       рендерера проход трансмиссии стекла строится раньше прохода, где рисуется
       второй узловой материал позади него, — что бы ни было в opacityNode или
       colorNode того объекта, экран его не видит (проверено пятью вариантами:
       transparent, alphaTest, чисто opaque colorNode — все дают пустоту).
       Рабочая схема — рисовать иней тем же материалом, что и само стекло:
       узор читает развёртку стенки (угол + высота) из positionLocal стакана. */
    const bandY0 = 0.165, bandY1 = 0.375, bandH = bandY1 - bandY0;
    const RFROST = 0.100;
    const wallUV = (p) => vec2(
      atan(p.z, p.x).mul(1 / (2 * Math.PI)).add(0.5),
      p.y.sub(bandY0).div(bandH).clamp(0, 1),
    );
    const glassMat = new T.MeshPhysicalNodeMaterial({
      color: 0x03050a, metalness: 0, roughness: 0.045, transmission: 1, thickness: 0.028,
      ior: 1.5, clearcoat: 0.5, clearcoatRoughness: 0.12, transparent: true, side: T.DoubleSide,
    });
    const band = () => smoothstep(bandY0 - 0.03, bandY0 + 0.02, positionLocal.y)
      .mul(smoothstep(bandY1 + 0.03, bandY1 - 0.02, positionLocal.y));
    const coverageAt = (q, bandV) => {
      const st = STR.sample(q);
      const phi = st.x.oneMinus();
      return smoothstep(0.04, 0.55, phi).mul(bandV);
    };
    const frostSample = () => {
      const q = wallUV(positionLocal);
      const bandV = band();
      const st = STR.sample(q);
      const phi = st.x.oneMinus();
      const coverage = smoothstep(0.04, 0.55, phi).mul(bandV);
      const ori = fract(st.z.mul(4)).mul(Math.PI / 3);
      const arc = q.x.mul(2 * Math.PI * RFROST), hgt = q.y.mul(bandH);
      const proj = arc.mul(cos(ori)).add(hgt.mul(sin(ori)));
      const grain = TSL.abs(sin(proj.mul(90).add(st.w.mul(6.0)))).mul(0.5).add(0.5);
      const mask = coverage.mul(mix(1, grain, 0.4)).clamp(0, 1);
      const lo = smoothstep(0.0, 0.12, phi);
      const hi = float(1).sub(smoothstep(0.28, 0.8, phi));
      const front = lo.mul(hi).mul(bandV);
      return { mask, front, q };
    };
    glassMat.colorNode = Fn(() => {
      const { mask } = frostSample();
      const bare = vec3(0.03, 0.05, 0.10);
      const iced = vec3(0.62, 0.72, 0.86);
      return mix(bare, iced, mask);
    })();
    glassMat.emissiveNode = Fn(() => {
      const { mask, front } = frostSample();
      const col = new T.Color(ACCENT);
      const c = vec3(col.r, col.g, col.b);
      const body = c.mul(mask).mul(0.16);
      const edge = c.mul(front).mul(3.2);
      return body.add(edge);
    })();
    /* стекло выдувное, не полированное до нуля: тонкий шум под лаком делает
       блик живым, а не пластиковым. Там, где нарос иней — поверхность матовая. */
    glassMat.roughnessNode = Fn(() => {
      const { mask } = frostSample();
      const n = mx_noise_float(positionWorld.mul(260)).mul(0.5).add(0.5);
      const base = float(0.02).add(n.mul(0.05));
      return base.add(mask.mul(0.42));
    })();
    /* рельеф инея: нормаль стенки отклоняется по градиенту поля вдоль кольца
       и высоты — тот же приём, что и в кейсе для льда (topFn/waterFn), только
       здесь без построения объёма: держит форму дендрита в самом освещении. */
    glassMat.normalNode = Fn(() => {
      const q = wallUV(positionLocal);
      const bandV = band();
      const e = float(1.4 / SIZE);
      const c0 = coverageAt(q, bandV);
      const cx = coverageAt(q.add(vec2(e, 0)), bandV);
      const cy = coverageAt(q.add(vec2(0, e)), bandV);
      const gx = cx.sub(c0), gy = cy.sub(c0);
      const ang = atan(positionLocal.z, positionLocal.x);
      const tang = vec3(sin(ang).negate(), 0, cos(ang));
      const bit = vec3(0, 1, 0);
      const BUMP = 4.2;
      return normalize(normalLocal.sub(tang.mul(gx).mul(BUMP)).sub(bit.mul(gy).mul(BUMP)));
    })();
    const glass = new T.Mesh(glassGeo, glassMat);
    glass.castShadow = true; glass.receiveShadow = true; glass.renderOrder = 1;

    const group = new T.Group();
    group.add(glass);

    /* ── касание: ptr.world — пересечение горизонтальной плоскости у основания,
       угол atan2(z,x) даёт положение по кольцу; высота на стенке из этого луча
       не читается (плоскость горизонтальная), поэтому берётся из ptr.ndc.y —
       грубая, но живая оценка того, по какой высоте кадра ведёт курсор */
    const V0 = -0.30, V1 = 0.32;
    let wasDown = false;
    const seedQueue = [
      { u: 0.52, v: 0.62, th: 0.15 },
      { u: 0.11, v: 0.38, th: 0.62 },
    ];

    const built = {
      group,
      touchHint: 'наведите — греет иней, клик — новый узор',
      update(t, dt, focus, ptr) {
        if (ptr && ptr.hit && ptr.world && focus > 0.5) {
          const u = ((Math.atan2(ptr.world.z, ptr.world.x) / (Math.PI * 2)) + 1) % 1;
          const v = Math.max(0, Math.min(1, (ptr.ndc.y - V0) / (V1 - V0)));
          U.uWarm.value.set(u, v, 1);
          if (ptr.down && !wasDown) seedQueue.push({ u, v, th: Math.random() });
          wasDown = ptr.down;
        } else {
          U.uWarm.value.z = 0; wasDown = false;
        }
        if (focus > 0.03) {
          const sd2 = seedQueue.shift();
          if (sd2) { U.uSeed.value.set(sd2.u, sd2.v, 1); U.uSeedTh.value = sd2.th; }
          else U.uSeed.value.z = 0;
          simStep();
        }
      },
      dispose() {
        rtA.dispose(); rtB.dispose();
        glassGeo.dispose(); glassMat.dispose();
        quadGeo.dispose(); simMat.dispose();
      },
    };
    built.__buildMs = performance.now() - t0;
    return built;
  },
};
