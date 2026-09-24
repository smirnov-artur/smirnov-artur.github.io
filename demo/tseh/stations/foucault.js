/* ═══ Станция «foucault» · маятник Фуко, потолочный подвес ═════════════════
   Физика честная: интегрируется вручную линеаризованное уравнение маятника
   в горизонтальной плоскости (x,z) с силой Кориолиса —

     x'' = -ω0² x + 2Ωeff z'
     z'' = -ω0² z - 2Ωeff x'      где ω0 = √(g/L), Ωeff = 15.041°/ч·sinφ · K

   Ω берётся для широты Белграда (44.817°), K=2000 — скорость прецессии
   ускорена так, чтобы полный оборот плоскости укладывался примерно в минуту
   (реальный оборот занял бы ≈34 часа). Никакого cos(ωt) с ручным поворотом
   плоскости нет — угол прецессии рождается сам, как побочный эффект силы
   Кориолиса в интеграторе. Мягкий «эскапемент» (энергетический регулятор)
   удерживает амплитуду у цели — как электромагнитный привод у настоящих
   музейных маятников, иначе колебание просто затухнет.
*/

export default {
  name: 'foucault',
  title: 'Маятник Фуко',
  line: 'Ω = 15°/ч · sin φ — прибор и карточка зала',
  accent: 0xc9963f,

  async build(T, TSL) {
    const { vec3, mix, attribute, mx_noise_float, positionLocal, sin } = TSL;

    /* ── константы физики ── */
    const G = 9.80665;
    const SID = 15.041069;                       /* °/ч, звёздные сутки */
    const LAT = 44.817;                           /* ° — Белград */
    const K = 2000;                                /* ускорение прецессии */
    const L = 2.5;                                 /* м, подвес-до-гири */
    const PIVOT_Y = 3.3;                           /* потолочная точка */
    const AMP_T = 0.78;                            /* м, целевая амплитуда */
    const RING = 0.62;                             /* м, радиус кольца колышков */
    const NPEG = 36;
    const HITW = 0.07;                             /* рад, полуширина колышка */
    const ESC = 0.09;                              /* 1/с, эскапемент */
    const IMP = 2.6;                               /* м/с, импульс клика */
    const BOBSC = 1.7;                             /* масштаб гири — читаемость кадра */
    const NTRAIL = 320;
    const TRAIL_DT = 0.2;
    const TRAIL_TAU = 42;

    const omega0 = Math.sqrt(G / L);
    const sidRad = SID * Math.PI / 180 / 3600;
    const omegaReal = sidRad * Math.sin(LAT * Math.PI / 180);
    const omegaEff = omegaReal * K;
    const E0 = 0.5 * omega0 * omega0 * AMP_T * AMP_T;

    const group = new T.Group();
    const brass = new T.Color(0xc9963f);
    const steel = 0x2a2c30;

    /* ── подвес: фланец + шарнир на потолке ── */
    const flange = new T.Mesh(
      new T.CylinderGeometry(0.06, 0.08, 0.035, 16),
      new T.MeshStandardNodeMaterial({ color: 0x111214, roughness: 0.5, metalness: 0.65 }));
    flange.position.y = PIVOT_Y + 0.012;
    const gimbal = new T.Mesh(
      new T.SphereGeometry(0.03, 14, 10),
      new T.MeshStandardNodeMaterial({ color: 0x1a1c20, roughness: 0.3, metalness: 0.85 }));
    gimbal.position.y = PIVOT_Y - 0.02;
    group.add(flange, gimbal);

    /* ── вращающаяся оснастка: трос + гиря ── */
    const rig = new T.Group();
    rig.position.set(0, PIVOT_Y, 0);
    group.add(rig);

    const cable = new T.Mesh(
      new T.CylinderGeometry(0.009, 0.012, L - 0.05, 14),
      new T.MeshStandardNodeMaterial({ color: 0x9a9084, roughness: 0.22, metalness: 0.95 }));
    cable.position.y = -(L - 0.05) / 2;
    rig.add(cable);

    /* точёный профиль веретена: колпачок → декоративная канавка → плечо →
       широкая юбка → долгое сужение к острию — как на музейных гирях */
    const prof = [
      [0,      0.055], [0.016, 0.048], [0.016, 0.040], [0.030, 0.028],
      [0.052,  0.006], [0.074, -0.030], [0.086, -0.075], [0.082, -0.120],
      [0.068, -0.185], [0.050, -0.250], [0.032, -0.315], [0.017, -0.370],
      [0.006, -0.410], [0,     -0.435],
    ];
    const bobMat = new T.MeshPhysicalNodeMaterial({
      metalness: 1, roughness: 0.28, clearcoat: 0.22, clearcoatRoughness: 0.30,
    });
    bobMat.colorNode = vec3(brass.r, brass.g, brass.b);
    bobMat.roughnessNode = mix(0.14, 0.34, mx_noise_float(positionLocal.mul(7)))
      .add(sin(positionLocal.y.mul(150)).abs().mul(0.05)).clamp(0.08, 0.42);
    const bob = new T.Mesh(
      new T.LatheGeometry(prof.map(([r, y]) => new T.Vector2(r, y)), 48), bobMat);
    bob.position.y = -L;
    bob.scale.setScalar(BOBSC);
    rig.add(bob);

    /* ── песок (тонкий диск) и кольцевая рамка ── */
    const sandR = 0.95;
    const sand = new T.Mesh(
      new T.CircleGeometry(sandR, 96),
      new T.MeshStandardNodeMaterial({ color: 0x121110, roughness: 0.95, metalness: 0.02 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0.001;
    group.add(sand);

    const rim = new T.Mesh(
      new T.TorusGeometry(sandR, 0.006, 8, 64),
      new T.MeshStandardNodeMaterial({ color: steel, roughness: 0.4, metalness: 0.8 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.004;
    group.add(rim);

    /* ── линия текущей плоскости качания ── */
    const swingMat = new T.MeshBasicNodeMaterial({ transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending });
    swingMat.colorNode = vec3(brass.r, brass.g, brass.b);
    const swingLine = new T.Mesh(new T.PlaneGeometry(sandR * 1.9, 0.007), swingMat);
    swingLine.rotation.x = -Math.PI / 2;
    swingLine.position.y = 0.006;
    group.add(swingLine);

    /* ── колышки: точёные, с воротником-фаской, один InstancedMesh на кольцо ── */
    const pegH = 0.16;
    const pegProf = [
      [0.006, 0], [0.010, 0.010], [0.0105, pegH * 0.58], [0.0135, pegH * 0.66],
      [0.0135, pegH * 0.72], [0.0075, pegH * 0.79], [0.0075, pegH * 0.86],
      [0.016, pegH * 0.90], [0, pegH],
    ];
    const pegGeo = new T.LatheGeometry(pegProf.map(([r, y]) => new T.Vector2(r, y)), 12);
    const pegMat = new T.MeshStandardNodeMaterial({ color: steel, roughness: 0.5, metalness: 0.72 });
    pegMat.roughnessNode = mix(0.40, 0.62, mx_noise_float(positionLocal.mul(24)));
    const pegs = new T.InstancedMesh(pegGeo, pegMat, NPEG);
    pegs.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(pegs);
    const pegAngle = new Float32Array(NPEG);
    const pegFallen = new Uint8Array(NPEG);
    const pegProg = new Float32Array(NPEG);
    const dummy = new T.Object3D();
    for (let i = 0; i < NPEG; i++) {
      pegAngle[i] = (i / NPEG) * Math.PI * 2;
      dummy.position.set(RING * Math.cos(pegAngle[i]), 0, RING * Math.sin(pegAngle[i]));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      pegs.setMatrixAt(i, dummy.matrix);
    }
    pegs.instanceMatrix.needsUpdate = true;

    /* ── след острия: кольцевой буфер светящихся меток ── */
    const trailGeo = new T.CircleGeometry(0.028, 8);
    trailGeo.rotateX(-Math.PI / 2);
    const trailAge = new Float32Array(NTRAIL);
    trailGeo.setAttribute('aAge', new T.InstancedBufferAttribute(trailAge, 1));
    const trailMat = new T.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    trailMat.colorNode = vec3(brass.r, brass.g, brass.b);
    trailMat.opacityNode = attribute('aAge', 'float').mul(0.55);
    const trail = new T.InstancedMesh(trailGeo, trailMat, NTRAIL);
    trail.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(trail);
    for (let i = 0; i < NTRAIL; i++) { dummy.position.set(0, -1, 0); dummy.updateMatrix(); trail.setMatrixAt(i, dummy.matrix); }
    trail.instanceMatrix.needsUpdate = true;

    /* ── состояние сима ── */
    const DOWN = new T.Vector3(0, -1, 0);
    const dirV = new T.Vector3();
    let x = AMP_T, z = 0, vx = 0, vz = 0;
    let wasDown = false;
    let trailAcc = 0, trailW = 0;

    function step(h) {
      const E = 0.5 * (vx * vx + vz * vz) + 0.5 * omega0 * omega0 * (x * x + z * z);
      let deff = ESC * (E / E0 - 1);
      if (deff > 3) deff = 3; else if (deff < -1.2) deff = -1.2;
      const ax = -omega0 * omega0 * x + 2 * omegaEff * vz - deff * vx;
      const az = -omega0 * omega0 * z - 2 * omegaEff * vx - deff * vz;
      vx += ax * h; vz += az * h;
      x += vx * h; z += vz * h;
    }

    return {
      group,
      touchHint: 'клик — толкнуть гирю',
      update(t, dt, focus, ptr) {
        const cdt = Math.min(0.05, dt || 0);
        const sub = 4, h = cdt / sub;
        for (let s = 0; s < sub; s++) step(h);

        /* импульс от клика — настоящий толчок, не подмена траектории */
        const clicked = ptr && ptr.down && !wasDown;
        wasDown = !!(ptr && ptr.down);
        if (clicked && focus > 0.5 && ptr.hit && ptr.world) {
          let dx = ptr.world.x - x, dz = ptr.world.z - z;
          const dl = Math.hypot(dx, dz) || 1;
          dx /= dl; dz /= dl;
          vx += dx * IMP; vz += dz * IMP;
        }

        /* ориентация троса+гири по ограничению сферического маятника */
        const r2 = x * x + z * z;
        const vy = -Math.sqrt(Math.max(0, L * L - r2));
        dirV.set(x, vy, z).normalize();
        rig.quaternion.setFromUnitVectors(DOWN, dirV);

        const ang = Math.atan2(z, x);
        swingLine.rotation.z = ang;

        /* колышки: удар кольца плоскостью качания */
        const rr = Math.sqrt(r2);
        if (rr > RING) {
          for (let i = 0; i < NPEG; i++) {
            if (pegFallen[i]) continue;
            let d = ang - pegAngle[i];
            d = Math.atan2(Math.sin(d), Math.cos(d));
            if (Math.abs(d) < HITW) { pegFallen[i] = 1; vx *= 0.82; vz *= 0.82; }
          }
        }

        if (focus > 0.02) {
          let touched = false;
          for (let i = 0; i < NPEG; i++) {
            if (!pegFallen[i]) continue;
            if (pegProg[i] >= 1) continue;
            pegProg[i] = Math.min(1, pegProg[i] + cdt * 2.2);
            const e = 1 - Math.pow(1 - pegProg[i], 3);
            dummy.position.set(RING * Math.cos(pegAngle[i]), 0, RING * Math.sin(pegAngle[i]));
            dummy.quaternion.setFromAxisAngle(
              new T.Vector3(-Math.sin(pegAngle[i]), 0, Math.cos(pegAngle[i])), e * Math.PI * 0.48);
            dummy.updateMatrix();
            pegs.setMatrixAt(i, dummy.matrix);
            touched = true;
          }
          if (touched) pegs.instanceMatrix.needsUpdate = true;

          /* след: сэмплируем позицию острия в кольцевой буфер */
          trailAcc += cdt;
          let wrote = false;
          while (trailAcc >= TRAIL_DT) {
            trailAcc -= TRAIL_DT;
            dummy.position.set(x, 0.015, z);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            trail.setMatrixAt(trailW, dummy.matrix);
            trailAge[trailW] = 1;
            trailW = (trailW + 1) % NTRAIL;
            wrote = true;
          }
          const decay = Math.exp(-cdt / TRAIL_TAU);
          for (let i = 0; i < NTRAIL; i++) trailAge[i] *= decay;
          trail.geometry.attributes.aAge.needsUpdate = true;
          if (wrote) trail.instanceMatrix.needsUpdate = true;
        }
      },
      dispose() {
        flange.geometry.dispose(); flange.material.dispose();
        gimbal.geometry.dispose(); gimbal.material.dispose();
        cable.geometry.dispose(); cable.material.dispose();
        bob.geometry.dispose(); bobMat.dispose();
        sand.geometry.dispose(); sand.material.dispose();
        rim.geometry.dispose(); rim.material.dispose();
        swingLine.geometry.dispose(); swingLine.material.dispose();
        pegGeo.dispose(); pegMat.dispose();
        trailGeo.dispose(); trailMat.dispose();
      },
    };
  },
};
