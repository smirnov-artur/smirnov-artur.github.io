/* lichtenberg — разряд в акриловом блоке.
   Физика: экранированный Пуассон на решётке 64×64 (заряженный лист + заземлённый
   растущий канал), релаксация на CPU, рост — рулетка по вероятности w=φ^η на
   фронте свободных ячеек. Ничего не анимируется по таймлайну — состояние решётки
   считается каждый кадр и определяет геометрию каналов. */
export default {
  name: 'lichtenberg',
  title: 'Фигура Лихтенберга',
  line: 'облучение и глубина захоронения заряда → цена блока',
  accent: 0x63e8ff,

  async build(T, TSL, ctx) {
    const { attribute, time, vec3, mix, min, clamp, sin, hash, instanceIndex, float } = TSL;

    const group = new T.Group();

    /* ── геометрия блока (м) — крупный настольный брусок, не миниатюра ── */
    const BLOCK_L = 0.52, BLOCK_D = 0.34, BLOCK_T = 0.24;
    const INSET = 0.94;
    const N = 64, M = 64, NN = N * M;
    const idx = (x, z) => x + z * N;

    /* ── акриловый брусок: скруглённая плита с фаской на каждом ребре ── */
    function slab(w, d, t, r, bev) {
      const s = new T.Shape();
      const x = w / 2 - bev, y = d / 2 - bev;
      s.moveTo(-x + r, -y);
      s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
      s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
      s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
      s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
      const g = new T.ExtrudeGeometry(s, {
        depth: t - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
        bevelSegments: 4, curveSegments: 12, steps: 1,
      });
      g.rotateX(-Math.PI / 2);
      g.center();
      g.translate(0, t / 2, 0);
      return g;
    }
    const acrylic = new T.MeshPhysicalNodeMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.045,
      transmission: 1.0, ior: 1.49, thickness: 0.20,
      attenuationColor: new T.Color(0.60, 0.78, 0.98), attenuationDistance: 0.60,
      clearcoat: 0.28, clearcoatRoughness: 0.18, envMapIntensity: 1.6,
    });
    /* следы обработки: изотропный микрошум литья + анизотропные штрихи полировки
       (одно направление на грани — читается как реальная механическая доводка,
       не голая ExtrudeGeometry) */
    {
      const pl = TSL.positionLocal;
      const iso = TSL.mx_noise_float(pl.mul(30)).mul(0.022);
      const brushUV = vec3(pl.x.mul(210), pl.z.mul(3.2), pl.y.mul(210));
      const brush = TSL.mx_noise_float(brushUV).mul(0.014);
      /* редкие царапины у нижнего ребра — блок ставили и двигали руками */
      const wear = TSL.clamp(float(1.0).sub(pl.y.div(BLOCK_T * 0.5).abs()).sub(0.82).mul(6), 0.0, 1.0)
        .mul(TSL.mx_noise_float(pl.mul(70)).mul(0.5).add(0.5)).mul(0.05);
      acrylic.roughnessNode = float(0.036).add(iso).add(brush).add(wear);
    }
    const block = new T.Mesh(slab(BLOCK_L, BLOCK_D, BLOCK_T, 0.022, 0.014), acrylic);
    block.renderOrder = 3;
    group.add(block);

    /* ── каналы разряда: живая InstancedMesh-геометрия, ветви через весь блок ── */
    const MAXSEG = 780;
    const RAD_BASE = 0.0046;
    const MIDY = BLOCK_T * 0.5, YJIT = BLOCK_T * 0.62;

    const seg = new T.CylinderGeometry(1, 1, 1, 6, 1, true);
    const freshAttr = new T.InstancedBufferAttribute(new Float32Array(MAXSEG), 1).setUsage(T.DynamicDrawUsage);
    seg.setAttribute('aFresh', freshAttr);

    const chanMat = new T.MeshBasicNodeMaterial({ toneMapped: true });
    const ac = new T.Color(0x63e8ff);
    const cold = vec3(ac.r, ac.g, ac.b);
    const hot = vec3(1.0, 0.97, 1.0);
    const seedPhase = hash(float(instanceIndex));
    const ember = sin(time.mul(2.3).add(seedPhase.mul(41.0))).mul(0.5).add(0.5).mul(0.11).add(0.08);
    const freshA = attribute('aFresh', 'float');
    const inten = freshA.add(ember);
    const flashMix = clamp(freshA.mul(0.6), 0.0, 1.0);
    chanMat.colorNode = mix(cold, hot, flashMix).mul(inten);

    const chan = new T.InstancedMesh(seg, chanMat, MAXSEG);
    chan.count = 0; chan.frustumCulled = false; chan.renderOrder = 1;
    group.add(chan);

    /* ── решётка: экранированный Пуассон ── */
    const phi = new Float32Array(NN);
    const rho = new Float32Array(NN).fill(1);
    const solid = new Uint8Array(NN);
    const fmask = new Uint8Array(NN);
    const parent = new Int32Array(NN).fill(-1);
    const rank = new Int16Array(NN);
    let front = [];
    const ETA = 1.9, SRC = 0.34, KAPPA = 0.05;
    const NB = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

    function relax(passes) {
      for (let p = 0; p < passes; p++) {
        for (let z = 1; z < M - 1; z++) {
          const row = z * N;
          for (let x = 1; x < N - 1; x++) {
            const i = row + x;
            if (solid[i]) { phi[i] = 0; continue; }
            const s = phi[i - 1] + phi[i + 1] + phi[i - N] + phi[i + N];
            phi[i] = (s + rho[i] * SRC) / (4 + KAPPA);
          }
        }
      }
    }
    function depleteRho(x, z) {
      for (let dz = -3; dz <= 3; dz++) {
        const nz = z + dz; if (nz < 1 || nz >= M - 1) continue;
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx; if (nx < 1 || nx >= N - 1) continue;
          const q = dx * dx + dz * dz, j = idx(nx, nz);
          rho[j] *= q <= 4 ? 0.05 : q <= 9 ? 0.35 : 0.82;
        }
      }
    }
    function addFront(i, from) {
      if (solid[i] || fmask[i]) return;
      fmask[i] = 1; parent[i] = from; rank[i] = from >= 0 ? rank[from] + 1 : 0;
      front.push(i);
    }

    /* ── каналы: сегменты, вспышка на рождении, тление после ── */
    let chanCount = 0;
    const recent = []; // {k, birth} — только недавно рождённые платят за расчёт вспышки
    const freshArr = freshAttr.array;
    const va = new T.Vector3(), vb = new T.Vector3(), vc = new T.Vector3(), vmid = new T.Vector3();
    const qq = new T.Quaternion(), UP = new T.Vector3(0, 1, 0), mm = new T.Matrix4(), vs = new T.Vector3();

    /* волна по Y должна быть ГЛАДКОЙ по решётке: у соседних ячеек (их соединяет
       один сегмент) высота обязана быть близкой, иначе каждая связь превращается
       в вертикальную иглу — так и было с независимым хешем на ячейку раньше */
    function cellPos(i, out) {
      const x = i % N, z = (i / N) | 0;
      const w = Math.sin(x * 0.34 + z * 0.11 + 1.7) * 0.6
              + Math.sin(x * 0.09 - z * 0.27 + 4.2) * 0.4;
      out.set(
        (x / (N - 1) - 0.5) * BLOCK_L * INSET,
        MIDY + w * 0.5 * YJIT,
        (z / (M - 1) - 0.5) * BLOCK_D * INSET
      );
    }
    function addSegment(p, i, now) {
      if (chanCount >= MAXSEG) return;
      cellPos(p, va); cellPos(i, vb);
      vc.subVectors(vb, va);
      const len = vc.length() || 0.001;
      qq.setFromUnitVectors(UP, vc.divideScalar(len));
      const rad = RAD_BASE * (0.55 + 0.45 * Math.exp(-rank[i] * 0.05));
      vs.set(rad, len * 1.4, rad);
      vmid.copy(va).add(vb).multiplyScalar(0.5);
      mm.compose(vmid, qq, vs);
      chan.setMatrixAt(chanCount, mm);
      freshArr[chanCount] = 0.85;
      recent.push({ k: chanCount, birth: now });
      chanCount++;
    }
    function activate(i, now) {
      solid[i] = 1; fmask[i] = 2;
      const x = i % N, z = (i / N) | 0;
      depleteRho(x, z);
      const p = parent[i];
      if (p >= 0) addSegment(p, i, now);
      for (const [dx, dz] of NB) {
        const nx = x + dx, nz = z + dz;
        if (nx < 1 || nz < 1 || nx >= N - 1 || nz >= M - 1) continue;
        addFront(idx(nx, nz), i);
      }
    }
    function seedAt(x, z) { activate(idx(x, z), 0); }
    function growStep(now, biasCell, biasGain) {
      front = front.filter(i => !solid[i]);
      if (!front.length) return false;
      let tot = 0;
      const w = new Array(front.length);
      for (let k = 0; k < front.length; k++) {
        const i = front[k];
        let ww = Math.pow(Math.max(0, phi[i]), ETA);
        if (biasCell >= 0) {
          const x = i % N, z = (i / N) | 0, bx = biasCell % N, bz = (biasCell / N) | 0;
          const d = Math.hypot(x - bx, z - bz);
          ww *= 1 + biasGain * Math.exp(-d * 0.16);
        }
        w[k] = ww; tot += ww;
      }
      if (tot < 1e-8) { activate(front[(Math.random() * front.length) | 0], now); return true; }
      let r = Math.random() * tot, acc = 0, pick = front.length - 1;
      for (let k = 0; k < front.length; k++) { acc += w[k]; if (acc >= r) { pick = k; break; } }
      activate(front[pick], now);
      return true;
    }
    function tickFresh(t) {
      let touched = false;
      for (let i = recent.length - 1; i >= 0; i--) {
        const e = recent[i], age = t - e.birth;
        freshArr[e.k] = Math.exp(-age * 9) * 0.85 + Math.exp(-age * 2.2) * 0.28;
        touched = true;
        if (age > 3.2) { freshArr[e.k] = 0; recent.splice(i, 1); }
      }
      if (touched) freshAttr.needsUpdate = true;
    }

    seedAt(9, Math.round(M * 0.44));

    /* ── касание: клик тянет новую ветвь к точке за ~2с ── */
    function localToCell(world) {
      const fx = world.x / (BLOCK_L * INSET) + 0.5;
      const fz = world.z / (BLOCK_D * INSET) + 0.5;
      if (fx < 0.02 || fx > 0.98 || fz < 0.02 || fz > 0.98) return -1;
      const x = Math.min(N - 2, Math.max(1, Math.round(fx * (N - 1))));
      const z = Math.min(M - 2, Math.max(1, Math.round(fz * (M - 1))));
      return idx(x, z);
    }

    let growAccum = 0, ptrDownPrev = false, zapT = -999, zapCell = -1;

    function update(t, dt, focus, ptr) {
      if (focus > 0.5 && ptr.hit && ptr.world && ptr.down && !ptrDownPrev) {
        const c = localToCell(ptr.world);
        if (c >= 0) { zapCell = c; zapT = t; }
      }
      ptrDownPrev = ptr.down;

      const zapping = zapCell >= 0 && (t - zapT) < 2.0;
      if (focus > 0.12) {
        relax(zapping ? 7 : 4);
        growAccum += dt;
        const pace = zapping ? 0.018 : 0.13;
        let grew = false, guard = 40;
        while (growAccum > pace && chanCount < MAXSEG && guard-- > 0) {
          growAccum -= pace;
          if (growStep(t, zapping ? zapCell : -1, zapping ? 4.5 : 0)) grew = true;
        }
        if (grew) { chan.instanceMatrix.needsUpdate = true; chan.count = chanCount; }
      } else growAccum = 0;

      tickFresh(t);
    }

    function dispose() {
      seg.dispose(); chanMat.dispose();
      block.geometry.dispose(); acrylic.dispose();
    }

    return { group, update, dispose, hitY: 0.9 + BLOCK_T };
  },
};
