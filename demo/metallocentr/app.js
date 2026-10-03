/* Металлоцентр — демо. Калькулятор и склад читают data/sklad.json (в рабочей версии — Google Таблица или выгрузка 1С). */
'use strict';

/* ---------- расчёт: чистая функция, её же гоняет проверка ---------- */
const MAT = { steel: 'Сталь Ст3', stainless: 'Нержавейка AISI 304', aluminium: 'Алюминий АМг2' };
const band = (tbl, v) => { for (const [upTo, x] of tbl) if (v <= upTo) return x; return null; };

function calc(s, R) {
  const qty = Math.max(1, Math.round(s.qty) || 1);
  const t = s.t, w = s.w, l = s.l;
  const area = (w * l) / 1e6;                                  // м², одна сторона
  const kg = area * t * R.density[s.mat];
  const lines = [], warn = [];
  if (Math.max(w, l) > 3000 || Math.min(w, l) > 1500)
    warn.push('Деталь больше стола лазера 3000 × 1500 мм. Такие режем на портальной плазме, цену подтвердит технолог.');
  if (s.own === 'ours') {
    const per = kg * R.metal_kg[s.mat];
    lines.push({ k: 'metal', name: 'Металл', det: `${fmt(kg, 2)} кг × ${R.metal_kg[s.mat]} ₽`, per, sum: Math.round(per * qty) });
  }
  if (s.ops.has('cut')) {
    const rate = R.cut_m[s.mat][String(t)];
    if (rate == null) warn.push(`${MAT[s.mat]} толщиной ${fmt(t)} мм лазером не режем.`);
    else {
      const pierces = 1 + Math.max(0, Math.round(s.holes) || 0);   // внешний контур + каждое отверстие
      const p = band(R.pierce, t);
      const per = s.cutm * rate + pierces * p;
      lines.push({ k: 'cut', name: 'Лазерная резка', det: `${fmt(s.cutm, 2)} м × ${rate} ₽ + ${pierces} ${plural(pierces, 'врезка', 'врезки', 'врезок')} × ${p} ₽`, per, sum: Math.round(per * qty) });
    }
  }
  if (s.ops.has('bend')) {
    const len = Math.min(w, l);                                  // гиб по короткой стороне
    const price = band(R.bend, t), lk = band(R.bend_len_k, len), mk = R.bend_mat_k[s.mat];
    if (price == null) warn.push('Гнём до 10 мм. Для этой толщины гибку посчитает технолог.');
    else if (lk == null) warn.push('Гиб длиннее 3,2 м пресс не берёт.');
    else {
      const n = Math.max(1, Math.round(s.bends) || 1);
      const per = n * price * lk * mk;
      const k = (lk > 1 ? ` × ${fmt(lk)}` : '') + (mk > 1 ? ` × ${fmt(mk)}` : '');
      lines.push({ k: 'bend', name: 'Гибка', det: `${n} ${plural(n, 'гиб', 'гиба', 'гибов')} × ${price} ₽${k}`, per, sum: Math.round(per * qty), len });
    }
  }
  if (s.ops.has('weld')) {
    const rate = R.weld_m[s.mat], per = s.weldm * rate;
    lines.push({ k: 'weld', name: 'Сварка', det: `${fmt(s.weldm, 2)} м шва × ${rate} ₽`, per, sum: Math.round(per * qty) });
  }
  if (s.ops.has('paint')) {
    const a2 = area * 2, per = a2 * R.paint_m2;                    // красим с двух сторон
    lines.push({ k: 'paint', name: 'Покраска', det: `${fmt(a2, 2)} м² × ${R.paint_m2} ₽ · ${s.ral}`, per, sum: Math.round(per * qty), a2 });
  }
  const work = lines.filter(x => x.k !== 'metal').reduce((a, x) => a + x.sum, 0);
  let pct = 0; for (const [from, p] of R.discount) if (qty >= from) pct = p;
  const disc = pct ? -Math.round(work * pct / 100) : 0;
  if (disc) lines.push({ k: 'disc', name: 'Скидка за количество', det: `−${pct} % на работу`, sum: disc });
  const total = lines.reduce((a, x) => a + x.sum, 0);
  return { qty, kg, lines, warn, pct, total, perPart: total / qty };
}

function fmt(n, d = 1) {
  const r = Math.round(n * 10 ** d) / 10 ** d;
  return r.toLocaleString('ru-RU', { maximumFractionDigits: d });
}
const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
function plural(n, a, b, c) { n = Math.abs(n) % 100; const m = n % 10; if (n > 10 && n < 20) return c; if (m > 1 && m < 5) return b; if (m === 1) return a; return c; }

if (typeof module !== 'undefined') module.exports = { calc };

/* ---------- страница ---------- */
if (typeof document !== 'undefined') (function () {
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const mobile = () => matchMedia('(max-width: 640px)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* шапка */
  const hdr = $('.hdr');
  const onScroll = () => hdr.classList.toggle('is-solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const burger = $('.burger'), mnav = $('.mnav');
  burger.addEventListener('click', () => {
    const open = mnav.hidden; mnav.hidden = !open; burger.setAttribute('aria-expanded', open); hdr.classList.add('is-solid');
  });
  mnav.addEventListener('click', e => { if (e.target.closest('a')) { mnav.hidden = true; burger.setAttribute('aria-expanded', 'false'); } });

  /* видео первого экрана: телефону — своя вертикальная версия */
  const v = $('.hero__video');
  if (mobile()) v.poster = v.dataset.posterM;
  v.src = mobile() ? v.dataset.srcM : v.dataset.src;
  if (!reduce) v.play().catch(() => {}); else v.removeAttribute('autoplay');
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('is-ready')));

  /* появление разделов */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .06 });
  $$('[data-r]').forEach(el => io.observe(el));

  /* услуги */
  const panels = $$('.panel');
  panels.forEach(p => {
    const on = () => { if (!mobile()) panels.forEach(x => x.classList.toggle('is-on', x === p)); };
    p.addEventListener('mouseenter', on); p.addEventListener('click', on); p.addEventListener('focusin', on);
  });

  /* оборудование */
  const eqImgs = $$('.eq__pic img'), eqLis = $$('.eq__list li');
  eqLis.forEach(li => {
    const on = () => { const i = li.dataset.eq; eqLis.forEach(x => x.classList.toggle('is-on', x === li)); eqImgs.forEach(im => im.classList.toggle('is-on', im.dataset.eq === i)); };
    li.addEventListener('mouseenter', on); li.addEventListener('click', on);
  });
  eqImgs[0].classList.add('is-on');

  /* как заказать: точка-лазер идёт по линии вместе с прокруткой */
  const flow = $('.flow');
  const trail = document.createElement('i'); trail.className = 'flow-trail';
  const dot = document.createElement('i'); dot.className = 'flow-dot';
  flow.append(trail, dot);
  const flowMove = () => {
    const r = flow.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * .85 - r.top) / (innerHeight * .6)));
    dot.style.left = `calc(${p * 100}% - ${p * 11}px)`; trail.style.width = p * 100 + '%';
  };
  addEventListener('scroll', flowMove, { passive: true }); flowMove();

  /* формы и окно */
  const dlg = $('#dlg');
  const validate = form => {
    let ok = true;
    $$('input[required]', form).forEach(i => {
      const bad = i.type === 'tel' ? i.value.replace(/\D/g, '').length < 10 : !i.value.trim();
      i.classList.toggle('is-bad', bad); if (bad && ok) { i.focus(); ok = false; }
    });
    return ok;
  };
  $$('input[type=tel]').forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/[^\d+()\-\s]/g, ''); i.classList.remove('is-bad'); }));
  $$('input[name=name]').forEach(i => i.addEventListener('input', () => i.classList.remove('is-bad')));
  function openDlg(title, html) {
    $('#dlgTitle').textContent = title; $('#dlgSum').innerHTML = html;
    $('[data-state="form"]', dlg).hidden = false; $('[data-state="ok"]', dlg).hidden = true;
    dlg.showModal();
  }
  $('#dlgForm').addEventListener('submit', e => {
    e.preventDefault(); if (!validate(e.target)) return;
    $('[data-state="form"]', dlg).hidden = true; $('[data-state="ok"]', dlg).hidden = false; e.target.reset();
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  const cta = $('#ctaForm');
  cta.addEventListener('submit', e => {
    e.preventDefault(); if (!validate(cta)) return;
    $('[data-state="form"]', cta).hidden = true; $('[data-state="ok"]', cta).hidden = false;
  });
  $('[data-reset]', cta).addEventListener('click', () => { cta.reset(); $('.file span', cta).textContent = 'Прикрепить чертёж'; $('[data-state="form"]', cta).hidden = false; $('[data-state="ok"]', cta).hidden = true; });
  $('.file input', cta).addEventListener('change', e => { const f = e.target.files[0]; $('.file span', cta).textContent = f ? f.name : 'Прикрепить чертёж'; });

  /* данные */
  fetch('data/sklad.json').then(r => r.json()).then(D => { initCalc(D.rates); initStock(D); }).catch(() => {
    $('#breakdown').innerHTML = '<li>Не загрузились ставки. Обновите страницу.</li>';
  });

  /* ---------- калькулятор ---------- */
  function initCalc(R) {
    const S = { ops: new Set(['cut']), mat: 'steel', t: 3, w: 300, l: 500, holes: 4, cutm: 1.6, cutAuto: true, bends: 2, weldm: .5, ral: 'RAL 7024', ralC: '#2F3236', qty: 10, own: 'ours' };
    const thkOf = m => Object.keys(R.cut_m[m]).map(Number).sort((a, b) => a - b);
    const num = (el, min, max) => { const x = parseFloat(String(el.value).replace(',', '.')); return isNaN(x) ? min : Math.min(max, Math.max(min, x)); };

    // операции
    $$('.op').forEach(b => b.addEventListener('click', () => {
      const op = b.dataset.op;
      if (S.ops.has(op) && S.ops.size > 1) S.ops.delete(op); else S.ops.add(op);
      syncOps(); update(true);
    }));
    function syncOps() {
      $$('.op').forEach(b => { const on = S.ops.has(b.dataset.op); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
      $$('[data-need]').forEach(el => { el.hidden = !S.ops.has(el.dataset.need); });
    }
    $$('[data-pick]').forEach(a => a.addEventListener('click', () => { S.ops.add(a.dataset.pick); syncOps(); update(true); }));

    // радио-группы
    const radio = (root, cb) => $$('[role=radio]', root).forEach(b => b.addEventListener('click', () => {
      $$('[role=radio]', root).forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', x === b); });
      cb(b);
    }));
    radio($('#mat'), b => { S.mat = b.dataset.v; renderThk(); update(true); });
    radio($('#own'), b => { S.own = b.dataset.v; update(); });
    radio($('#ral'), b => { S.ral = b.dataset.n; S.ralC = b.dataset.c; update(true); });

    function renderThk() {
      const list = thkOf(S.mat);
      if (!list.includes(S.t)) S.t = list.filter(x => x <= S.t).pop() || list[0];
      $('#thk').innerHTML = list.map(t => `<button type="button" role="radio" aria-checked="${t === S.t}" class="${t === S.t ? 'is-on' : ''}" data-t="${t}">${fmt(t)}</button>`).join('');
      $$('#thk button').forEach(b => b.addEventListener('click', () => {
        S.t = +b.dataset.t; $$('#thk button').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', x === b); }); update();
      }));
    }

    // поля
    const fW = $('#w'), fL = $('#l'), fH = $('#holes'), fC = $('#cutm'), fB = $('#bends'), fWd = $('#weldm'), fQ = $('#qty');
    const autoCut = () => { if (S.cutAuto) { S.cutm = Math.round(2 * (S.w + S.l) / 10) / 100; fC.value = S.cutm; } };
    fW.addEventListener('input', () => { S.w = num(fW, 10, 6000); autoCut(); update(true); });
    fL.addEventListener('input', () => { S.l = num(fL, 10, 6000); autoCut(); update(true); });
    fH.addEventListener('input', () => { S.holes = num(fH, 0, 500); update(true); });
    fC.addEventListener('input', () => { S.cutm = num(fC, .05, 200); S.cutAuto = false; $('#cutReset').hidden = false; update(); });
    $('#cutReset').addEventListener('click', () => { S.cutAuto = true; $('#cutReset').hidden = true; autoCut(); update(); });
    fB.addEventListener('input', () => { S.bends = num(fB, 1, 20); update(true); });
    fWd.addEventListener('input', () => { S.weldm = num(fWd, .05, 100); update(); });
    const setQty = q => { S.qty = Math.max(1, Math.min(100000, Math.round(q) || 1)); fQ.value = S.qty; update(); };
    fQ.addEventListener('input', () => { S.qty = num(fQ, 1, 100000); update(); });
    fQ.addEventListener('blur', () => setQty(S.qty));
    $$('[data-step]').forEach(b => b.addEventListener('click', () => setQty(S.qty + +b.dataset.step)));
    $$('#qtyQuick button').forEach(b => b.addEventListener('click', () => setQty(+b.dataset.q)));

    // ставки таблицами
    renderRates(R);

    // вывод
    let shown = 0, raf = 0, drawT = 0, lastGeo = '';
    function tween(to) {
      cancelAnimationFrame(raf);
      const from = shown, t0 = performance.now(), dur = reduce ? 1 : 450;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        shown = from + (to - from) * e;
        $('#priceNum').textContent = rub(shown); $('#mbarNum').textContent = rub(shown);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    function update(redraw) {
      const r = calc(S, R);
      const lbl = `За ${r.qty.toLocaleString('ru-RU')} ${plural(r.qty, 'деталь', 'детали', 'деталей')}`;
      $('#priceLbl').textContent = lbl; $('#mbarLbl').textContent = lbl;
      tween(r.total);
      $('#priceSub').innerHTML = r.qty > 1 ? `${fmt(r.perPart, 1)} ₽ за деталь${r.pct ? ` · <b>скидка ${r.pct} % уже в цене</b>` : ''}` : (r.total ? 'Партия от 1 штуки' : '');
      $('#breakdown').innerHTML = r.lines.map(x => `<li class="${x.k === 'disc' ? 'is-disc' : ''}"><span>${x.name}</span><small>${x.det}${x.k !== 'disc' && r.qty > 1 ? ` · × ${r.qty.toLocaleString('ru-RU')} шт` : ''}</small><b>${x.sum < 0 ? '−' + rub(-x.sum) : rub(x.sum)}</b></li>`).join('');
      const w = $('#sizeWarn'); w.hidden = !r.warn.length; w.textContent = r.warn.join(' ');
      const bl = r.lines.find(x => x.k === 'bend'); $('#bendHint').textContent = bl ? `Гиб идёт по короткой стороне: ${fmt(bl.len, 0)} мм. Длиннее метра — дороже.` : '';
      const pl = r.lines.find(x => x.k === 'paint'); $('#paintHint').textContent = pl ? `Площадь с двух сторон: ${fmt(pl.a2, 2)} м². Цвет любой по RAL, без доплаты.` : '';
      $('#metaMat').textContent = `${MAT[S.mat]} · ${fmt(S.t)} мм`;
      $('#metaKg').textContent = `${fmt(r.kg, 2)} кг`;
      $('#qtyQuick').querySelectorAll('button').forEach(b => b.classList.toggle('is-on', +b.dataset.q === r.qty));
      update.last = r;
      const geo = [S.w, S.l, S.holes, S.ops.has('cut'), S.ops.has('bend') ? S.bends : 0].join();
      clearTimeout(drawT);
      drawT = setTimeout(() => { drawPart(S, geo !== lastGeo || redraw === 'force'); lastGeo = geo; }, redraw ? 220 : 0);
    }

    const send = () => {
      const r = update.last; if (!r) return;
      const ops = [...S.ops].map(o => ({ cut: 'резка', bend: 'гибка', weld: 'сварка', paint: 'покраска ' + S.ral })[o]).join(', ');
      openDlg('Отправить расчёт', `<b>${rub(r.total)}</b>${r.qty} шт · ${MAT[S.mat]} ${fmt(S.t)} мм · ${S.w} × ${S.l} мм<ul>${r.lines.map(x => `<li>${x.name}: ${x.sum < 0 ? '−' + rub(-x.sum) : rub(x.sum)}</li>`).join('')}</ul><p style="margin-top:10px">Что делаем: ${ops}. Металл: ${S.own === 'ours' ? 'наш' : 'ваш'}.</p>`);
    };
    $('#sendCalc').addEventListener('click', send);
    $('[data-send]').addEventListener('click', send);

    // полоска с ценой на телефоне
    const mbar = $('#mbar'); let inSec = false, resVis = false;
    const mb = () => { const on = inSec && !resVis; mbar.classList.toggle('is-on', on); mbar.setAttribute('aria-hidden', !on); $('#basket').style.visibility = on ? 'hidden' : ''; };
    new IntersectionObserver(([e]) => { inSec = e.isIntersecting; mb(); }, { rootMargin: '-30% 0px -10% 0px' }).observe($('#raschet .calc'));
    new IntersectionObserver(([e]) => { resVis = e.isIntersecting; mb(); }, { threshold: .25 }).observe($('#calcRes'));

    renderThk(); syncOps(); update('force');
  }

  /* чертёж детали: контур, отверстия, гибы, шов; лазер обводит контур */
  function drawPart(S, trace) {
    const svg = $('#part'), NS = 'http://www.w3.org/2000/svg';
    const box = { x: 58, y: 62, w: 330, h: 172 };
    const long = S.l >= S.w, X = long ? S.l : S.w, Y = long ? S.w : S.l;   // длинная сторона — по горизонтали
    const sc = Math.min(box.w / X, box.h / Y);
    const rw = Math.max(24, X * sc), rh = Math.max(16, Y * sc);
    const rx = box.x + (box.w - rw) / 2, ry = box.y + (box.h - rh) / 2;
    const paint = S.ops.has('paint'), cut = S.ops.has('cut');
    let h = `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    // размерные линии
    const dy = ry - 18, dx = rx - 18;
    h += `<g stroke="rgba(242,240,235,.35)" stroke-width="1" fill="none"><path d="M${rx} ${dy}H${rx + rw}M${rx} ${dy - 5}v10M${rx + rw} ${dy - 5}v10"/><path d="M${dx} ${ry}V${ry + rh}M${dx - 5} ${ry}h10M${dx - 5} ${ry + rh}h10"/><path d="M${rx} ${ry}V${dy - 6}M${rx + rw} ${ry}V${dy - 6}M${rx} ${ry}H${dx - 6}M${rx} ${ry + rh}H${dx - 6}" stroke-dasharray="2 3" opacity=".6"/></g>`;
    h += `<text x="${rx + rw / 2}" y="${dy - 8}" text-anchor="middle">${X} мм</text>`;
    h += `<text transform="translate(${dx - 9} ${ry + rh / 2}) rotate(-90)" text-anchor="middle">${Y} мм</text>`;
    // деталь
    h += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="2" fill="${paint ? S.ralC : 'rgba(242,240,235,.05)'}" stroke="rgba(242,240,235,.9)" stroke-width="1.4"/>`;
    // отверстия
    const n = cut ? Math.min(Math.max(0, Math.round(S.holes) || 0), 48) : 0;
    let holes = '';
    if (n) {
      let cols = Math.max(1, Math.ceil(Math.sqrt(n * rw / rh))); const rows = Math.ceil(n / cols); cols = Math.ceil(n / rows);
      const cw = rw / cols, ch = rh / rows, r = Math.max(2, Math.min(7, cw / 4.5, ch / 4.5));
      for (let i = 0; i < n; i++) {
        const c = i % cols, rr = Math.floor(i / cols);
        const inRow = rr === rows - 1 ? n - rr * cols : cols, off = (cols - inRow) * cw / 2;
        holes += `<circle class="hole" style="animation-delay:${trace ? 1.05 + i * .05 : 0}s" cx="${(rx + off + cw * (c + .5)).toFixed(1)}" cy="${(ry + ch * (rr + .5)).toFixed(1)}" r="${r.toFixed(1)}"/>`;
      }
    }
    h += `<g fill="#101215" stroke="rgba(242,240,235,.85)" stroke-width="1.2">${holes}</g>`;
    // гибы: линии поперёк длинной стороны
    if (S.ops.has('bend')) {
      const b = Math.max(1, Math.min(12, Math.round(S.bends) || 1));
      let g = '';
      for (let i = 1; i <= b; i++) { const x = rx + rw * i / (b + 1); g += `M${x.toFixed(1)} ${ry - 4}V${ry + rh + 4}`; }
      h += `<path d="${g}" stroke="${paint ? 'rgba(242,240,235,.75)' : 'rgba(242,240,235,.55)'}" stroke-width="1" stroke-dasharray="6 4" fill="none"/>`;
    }
    // шов
    if (S.ops.has('weld')) {
      let z = `M${rx + 6} ${ry + rh}`; const step = 6;
      for (let x = rx + 6, k = 0; x < rx + rw - 6; x += step, k++) z += `L${(x + step / 2).toFixed(1)} ${ry + rh + (k % 2 ? -3 : 3)}`;
      h += `<path d="${z}" stroke="#FF8A4C" stroke-width="1.6" fill="none" filter="url(#glow)"/>`;
    }
    // лазер
    if (cut && trace && !reduce) {
      const per = 2 * (rw + rh);
      h += `<path id="beam" d="M${rx} ${ry}H${rx + rw}V${ry + rh}H${rx}Z" fill="none" stroke="#FF5A1F" stroke-width="2.2" filter="url(#glow)" stroke-dasharray="${per}" stroke-dashoffset="${per}"/><circle id="head" r="4.5" fill="#FFE2D1" filter="url(#glow)" cx="${rx}" cy="${ry}"/>`;
    }
    svg.innerHTML = h;
    if (!(cut && trace) || reduce) { $$('.hole', svg).forEach(c => c.style.animation = 'none'); return; }
    const beam = $('#beam', svg), head = $('#head', svg), L = beam.getTotalLength(), t0 = performance.now(), dur = 1000;
    $$('.hole', svg).forEach(c => c.classList.add('pierce'));
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      beam.setAttribute('stroke-dashoffset', L * (1 - e));
      const p = beam.getPointAtLength(L * e); head.setAttribute('cx', p.x); head.setAttribute('cy', p.y);
      if (k < 1) requestAnimationFrame(step);
      else { head.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }); beam.animate([{ opacity: 1 }, { opacity: .0 }], { duration: 1200, delay: 300, fill: 'forwards' }); }
    };
    requestAnimationFrame(step);
  }

  function renderRates(R) {
    const T = Object.keys(R.cut_m), all = [...new Set(T.flatMap(m => Object.keys(R.cut_m[m]).map(Number)))].sort((a, b) => a - b);
    const tb = (title, head, rows, note = '') => `<div class="rt"><h4>${title}</h4><table><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>${note ? `<p class="hint">${note}</p>` : ''}</div>`;
    const upTo = tbl => tbl.map(([u, x]) => [`до ${fmt(u)} мм`, x + ' ₽']);
    $('#ratesTables').innerHTML =
      tb('Лазерная резка, ₽ за метр', ['мм', 'сталь', 'нерж.', 'алюм.'], all.map(t => [fmt(t), ...T.map(m => R.cut_m[m][String(t)] ?? '—')])) +
      tb('Врезка, ₽ за каждый контур', ['толщина', 'цена'], upTo(R.pierce), 'Внешний контур детали — тоже врезка.') +
      tb('Гибка, ₽ за гиб', ['толщина', 'цена'], upTo(R.bend), `Гиб длиннее 1 м — × ${fmt(R.bend_len_k[1][1])}, длиннее 2 м — × ${fmt(R.bend_len_k[2][1])}. Нержавейка — × ${fmt(R.bend_mat_k.stainless)}.`) +
      tb('Сварка, ₽ за метр шва', ['металл', 'цена'], Object.keys(R.weld_m).map(m => [MAT[m].split(' ')[0], R.weld_m[m] + ' ₽'])) +
      tb('Покраска и металл', ['что', 'цена'], [['Порошковая, м²', R.paint_m2 + ' ₽'], ...Object.keys(R.metal_kg).map(m => [MAT[m].split(' ')[0] + ', кг', R.metal_kg[m] + ' ₽'])], 'Красим с двух сторон. Металл — по цене листа со склада.') +
      tb('Скидка на работу', ['деталей', 'скидка'], R.discount.map(([f, p]) => [`от ${f.toLocaleString('ru-RU')}`, p + ' %']), 'На металл скидка не действует.');
  }

  /* ---------- склад ---------- */
  function initStock(D) {
    const CATS = [['list', 'Лист', 'cat-list'], ['truba', 'Труба', 'cat-truba'], ['ugolok', 'Уголок', 'cat-ugolok'], ['shveller', 'Швеллер', 'cat-shveller'], ['armatura', 'Арматура', 'cat-armatura']];
    const items = D.items.map((x, i) => ({ ...x, i, hay: norm(`${x.n} ${x.s} ${x.g} ${x.gost} ${x.len}`) }));
    const st = { cat: 'all', grade: 'all', q: '', inStock: false, sort: 'def', lim: 10 };
    const basket = new Set();
    function norm(s) { return s.toLowerCase().replace(/ё/g, 'е').replace(/[х×x*]/g, 'x').replace(/⌀|ø|ф(?=\d)/g, '').replace(/,/g, '.').replace(/\s+/g, ''); }
    const minPt = list => Math.min(...list.map(x => x.pt));

    $('#cats').innerHTML = `<button type="button" class="cat is-on" data-c="all"><img src="img/sklad.webp" alt="" loading="lazy" decoding="async" width="1000" height="700"><b>Весь склад</b><small>${items.length} позиций</small></button>` +
      CATS.map(([c, name, img]) => { const L = items.filter(x => x.c === c); return `<button type="button" class="cat" data-c="${c}"><img src="img/${img}.webp" alt="" loading="lazy" decoding="async" width="1000" height="700"><b>${name}</b><small>от ${minPt(L).toLocaleString('ru-RU')} ₽/т</small></button>`; }).join('');
    $$('.cat').forEach(b => b.addEventListener('click', () => { st.cat = b.dataset.c; st.grade = 'all'; st.lim = 10; $$('.cat').forEach(x => x.classList.toggle('is-on', x === b)); renderGrades(); render(); }));

    function renderGrades() {
      const gs = [...new Set(items.filter(x => st.cat === 'all' || x.c === st.cat).map(x => x.g))];
      $('#grades').innerHTML = `<button type="button" class="${st.grade === 'all' ? 'is-on' : ''}" data-g="all">Все марки</button>` + gs.map(g => `<button type="button" data-g="${g}" class="${st.grade === g ? 'is-on' : ''}">${g}</button>`).join('');
      $$('#grades button').forEach(b => b.addEventListener('click', () => { st.grade = b.dataset.g; renderGrades(); render(); }));
    }
    $('#q').addEventListener('input', e => { st.q = e.target.value; render(); });
    $('#inStock').addEventListener('change', e => { st.inStock = e.target.checked; render(); });
    $('#sort').addEventListener('change', e => { st.sort = e.target.value; render(); });

    const per = x => x.pt * x.kg / 1000;
    const money = n => n < 100 ? fmt(n, 1) : Math.round(n).toLocaleString('ru-RU');
    function av(x) {
      if (x.stock >= 1) return `<span class="av"><i></i>${fmt(x.stock)} т</span>`;
      if (x.stock > 0) return `<span class="av av--low"><i></i>мало · ${fmt(x.stock)} т</span>`;
      return `<span class="av av--no"><i></i>под заказ, 2–3 дня</span>`;
    }
    function render() {
      const toks = st.q.trim().split(/\s+/).filter(Boolean).map(norm);
      let L = items.filter(x => (st.cat === 'all' || x.c === st.cat) && (st.grade === 'all' || x.g === st.grade) && (!st.inStock || x.stock > 0) && toks.every(t => x.hay.includes(t)));
      if (st.sort === 'price') L = [...L].sort((a, b) => a.pt - b.pt);
      if (st.sort === 'stock') L = [...L].sort((a, b) => b.stock - a.stock);
      const all = L.length; L = L.slice(0, st.lim);
      const more = $('#more'); more.hidden = all <= L.length;
      more.innerHTML = `<b>Показать ещё ${Math.min(20, all - L.length)}</b><span>из ${all}</span>`;
      $('#rows').innerHTML = L.map(x => `<div class="row" role="row">
        <div class="row__n" role="cell"><b>${x.n}</b><span>${x.s}</span>${x.len ? `<em>· ${x.len}</em>` : ''}</div>
        <div class="row__g" role="cell">${x.g}<small>${x.gost}</small></div>
        <div class="row__v" role="cell">${av(x)}</div>
        <div class="row__p" role="cell">${x.pt.toLocaleString('ru-RU')} ₽</div>
        <div class="row__u" role="cell">${money(per(x))} ₽/${x.u === 'лист' ? 'лист' : 'м'}<small>${fmt(x.kg, x.kg < 10 ? 2 : 1)} кг/${x.u === 'лист' ? 'лист' : 'м'}</small></div>
        <button type="button" class="add ${basket.has(x.i) ? 'is-on' : ''}" data-i="${x.i}" aria-label="${basket.has(x.i) ? 'Убрать из заявки' : 'Добавить в заявку'}: ${x.n} ${x.s}"><svg viewBox="0 0 16 16"><path d="${basket.has(x.i) ? 'M3 8.5l3 3 7-7' : 'M8 2v12M2 8h12'}"/></svg></button>
      </div>`).join('');
      $('#empty').hidden = all > 0;
    }
    $('#more').addEventListener('click', () => { st.lim += 20; render(); });
    $('#rows').addEventListener('click', e => {
      const b = e.target.closest('.add'); if (!b) return;
      const i = +b.dataset.i; basket.has(i) ? basket.delete(i) : basket.add(i);
      render(); $('#basketN').textContent = basket.size; $('#basket').hidden = !basket.size;
    });
    $('#basket').addEventListener('click', () => {
      const L = [...basket].map(i => items[i]);
      openDlg('Заявка на металл', `<b>${L.length} ${plural(L.length, 'позиция', 'позиции', 'позиций')}</b>Количество и порезку в размер менеджер уточнит по телефону.<ul>${L.map(x => `<li>${x.n} ${x.s}, ${x.g} — ${x.pt.toLocaleString('ru-RU')} ₽/т</li>`).join('')}</ul>`);
    });

    const d = new Date(D.updated);
    if (!isNaN(d)) $('#updated').textContent = `Обновлено ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    renderGrades(); render();
  }
})();
