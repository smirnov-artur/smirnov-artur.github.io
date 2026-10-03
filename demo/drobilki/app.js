/* Фракция — серия лендингов. Один скрипт на все страницы серии: body[data-page] = d (дробилки) или g (грохоты).
   Каталог читается из data/oborudovanie.json (в рабочей версии — выгрузка 1С или таблица отдела продаж). */
'use strict';

/* ---------- подбор: чистые функции, их же гоняет проверка в node ---------- */
const FRS = [
  { k: '0-5', lo: 0, hi: 5, n: '0–5' },
  { k: '5-10', lo: 5, hi: 10, n: '5–10' },
  { k: '10-20', lo: 10, hi: 20, n: '10–20' },
  { k: '20-40', lo: 20, hi: 40, n: '20–40' },
  { k: '40-70', lo: 40, hi: 70, n: '40–70' },
  { k: '70-150', lo: 70, hi: 150, n: '70–150' },
];
const TYPE = { shchek: 'щековая', konus: 'конусная', rotor: 'роторная', naklon: 'наклонный', gorizont: 'горизонтальный', kolosnik: 'колосниковый', mobil: 'мобильный' };
// удельная производительность сита, т/ч с 1 м², по размеру разделения (упрощённая таблица для сухого щебня)
const QS = [[1, 4], [2, 6], [3, 8], [5, 12], [10, 19], [20, 30], [40, 45], [70, 62], [100, 75], [150, 90]];
const KMAT = { granit: 1, ruda: .9, peschanik: .95, graviy: .85, izvest: .9, beton: .85, pgs: .8 };
const CELLS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 22, 25, 28, 32, 36, 40, 45, 50, 56, 63, 70, 80, 90, 100, 110, 125, 140, 160, 180, 200];

function interp(T, x) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [x0, y0] = T[i - 1], [x1, y1] = T[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return T[T.length - 1][1];
}

/* границы разделения по выбранным фракциям, крупные сверху: 5–10 и 20–40 → 40, 20, 10, 5 */
function rezy(fr) {
  const s = new Set();
  FRS.filter(f => fr.includes(f.k)).forEach(f => { if (f.lo > 0) s.add(f.lo); s.add(f.hi); });
  return [...s].sort((a, b) => b - a);
}

/* грохот под границы: площадь по нижней деке, ячейка под каждую границу */
function ekran(q, cuts, mat, mob, D) {
  const max = mob ? 3 : 4, used = cuts.slice(-max);            // лишние крупные границы — второй грохот
  const cmin = used[used.length - 1];
  const qs = interp(QS, cmin), k = KMAT[mat] || 1;
  const load = used.length > 1 ? q * .7 : q;                    // до нижней деки доходит около 70 % потока
  const need = Math.round(load / (qs * k) * 10) / 10;
  let type = mob ? 'mobil' : (cmin <= 5 && (mat === 'pgs' || mat === 'graviy')) ? 'gorizont' : 'naklon';
  let L = D.groh.filter(m => m.type === type && m.decks >= used.length);
  if (!L.length) { type = 'naklon'; L = D.groh.filter(m => m.type === type && m.decks >= used.length); }
  L.sort((a, b) => a.area - b.area);
  let m = L.find(x => x.area >= need && x.q[1] >= q), n = 1;
  if (!m) { m = L[L.length - 1]; n = Math.max(Math.ceil(need / m.area), Math.ceil(q / m.q[1])); }
  const deki = used.map(c => {
    const want = c * (type === 'gorizont' ? 1.05 : 1.15);        // на наклонной деке ячейка крупнее границы
    return { cut: c, cell: CELLS.find(x => x >= want - .01) || c, sito: c >= 40 ? 'резина или перфолист' : c >= 10 ? 'проволока 65Г или полиуретан' : 'полиуретан' };
  });
  return { m, n, type, need, qs: Math.round(qs), k, load: Math.round(load), deki, cmin, cut: cuts.length > used.length };
}

function podborD(a, D) {
  const q = a.q, mob = a.isp === 'mob';
  const fine = Math.min(...FRS.filter(f => a.fr.includes(f.k)).map(f => f.hi));
  const st = [], notes = [];
  const add = (role, type, need, ok = () => true) => {
    const L = D.drob.filter(m => m.type === type && m.mob === mob && ok(m)).sort((x, y) => x.q[1] - y.q[1]);
    let m = L.find(x => x.q[1] >= need), n = 1;
    if (!m) { m = L[L.length - 1]; n = Math.ceil(need / m.q[1]); }
    st.push({ role, type, m, n, need: Math.round(need) });
  };
  const hard = a.mat === 'granit' || a.mat === 'ruda' || a.mat === 'peschanik';
  if (hard) {
    add('Крупное дробление', 'shchek', q);
    if (fine < 70) add('Среднее дробление', 'konus', q * .85, m => m.feed >= 150);
    if (fine <= 10 && !mob) add('Мелкое дробление', 'konus', q * .45, m => m.out[0] <= 10);
  } else if (a.mat === 'graviy') {
    add('Дробление', 'konus', q, m => m.feed >= 150);
    if (fine <= 10 && !mob) add('Мелкое дробление', 'konus', q * .45, m => m.out[0] <= 10);
    notes.push('Валуны крупнее 180 мм снимаем колосниковым грохотом до дробилки.');
  } else if (a.mat === 'izvest') {
    if (q > 300 && !mob) { add('Крупное дробление', 'shchek', q); add('Вторичное дробление', 'rotor', q * .85); }
    else add('Дробление в одну стадию', 'rotor', q);
  } else {
    add('Дробление', 'rotor', q);
    notes.push('Арматуру снимает магнитный сепаратор над лентой сразу после дробилки.');
  }
  if (mob && fine <= 10 && (hard || a.mat === 'graviy')) notes.push('Фракцию мельче 10 мм мобильный конус даёт повторным проходом. Если её нужно много, посчитаем третью машину.');
  if (st.some(s => s.n > 1)) notes.push(mob ? 'Одна гусеничная машина берёт до 350 т/ч, поэтому в схеме две параллельные. Для такого потока дешевле стационарная линия, её тоже посчитаем.' : 'Поток больше, чем берёт одна машина: ставим две параллельно.');
  if (hard && a.mat !== 'peschanik') notes.push('Порода абразивная: щёки и броню ставим из стали 110Г13Л, запасной комплект держим на складе под вас.');
  if (a.mat === 'peschanik') notes.push('Песчаник с кварцем стирает била за недели, поэтому роторную не ставим: щековая и конусная служат дольше.');
  if (a.mat === 'izvest' && st.length === 1) notes.push('Роторная даёт кубовидный щебень за один проход, вторая дробилка не нужна.');
  const sc = ekran(q, rezy(a.fr), a.mat, mob, D);
  if (sc.cut) notes.push('Фракций больше, чем дек у грохота. Крупную часть отделит второй грохот, посчитаем в КП.');
  return { st, sc, notes, fine };
}

function podborG(a, D) {
  const cuts = rezy(a.fr), mob = a.isp === 'mob';
  const sc = ekran(a.q, cuts, a.mat, mob, D);
  const notes = [];
  let kol = null;
  if (sc.cut) notes.push('Фракций больше, чем дек. Крупную часть отделит второй грохот или колосник, посчитаем в КП.');
  if ((a.mat === 'granit' || a.mat === 'ruda') && !mob && a.q >= 150) {
    const L = D.groh.filter(m => m.type === 'kolosnik').sort((x, y) => x.q[1] - y.q[1]);
    kol = L.find(m => m.q[1] >= a.q) || L[L.length - 1];
  }
  if (a.mat === 'pgs') notes.push('ПГС с глиной моем прямо на деке: форсунки над верхней и средней декой, вода около 1 м³ на тонну.');
  if (a.mat === 'beton') notes.push('Для ДСО верхнюю деку делаем из перфолиста: арматура не рвёт сито.');
  if (sc.n > 1) notes.push(`Площади одного грохота не хватает: ставим ${sc.n} параллельно.`);
  return { sc, notes, kol, cuts };
}

function fmt(n, d = 1) { return (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('ru-RU', { maximumFractionDigits: d }); }
function plural(n, a, b, c) { n = Math.abs(n) % 100; const m = n % 10; if (n > 10 && n < 20) return c; if (m > 1 && m < 5) return b; if (m === 1) return a; return c; }

if (typeof module !== 'undefined') module.exports = { podborD, podborG, ekran, rezy };

/* ---------- страница ---------- */
if (typeof document !== 'undefined') (function () {
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const page = document.body.dataset.page, root = document.body.dataset.root || '';
  const mobile = () => matchMedia('(max-width: 640px)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* шапка */
  const hdr = $('.hdr');
  const onScroll = () => hdr.classList.toggle('is-solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const burger = $('.burger'), mnav = $('.mnav');
  burger.addEventListener('click', () => { const open = mnav.hidden; mnav.hidden = !open; burger.setAttribute('aria-expanded', open); hdr.classList.add('is-solid'); });
  mnav.addEventListener('click', e => { if (e.target.closest('a')) { mnav.hidden = true; burger.setAttribute('aria-expanded', 'false'); } });

  /* видео первого экрана: телефону — вертикальная версия */
  const v = $('.hero__video');
  if (mobile()) v.poster = v.dataset.posterM;
  v.src = mobile() ? v.dataset.srcM : v.dataset.src;
  if (!reduce) v.play().catch(() => {}); else v.removeAttribute('autoplay');
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('is-ready')));

  /* появление разделов */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .06 });
  $$('[data-r]').forEach(el => io.observe(el));

  /* типы: раскрывающиеся панели */
  const panels = $$('.panel');
  panels.forEach(p => {
    const on = () => { if (!mobile()) panels.forEach(x => x.classList.toggle('is-on', x === p)); };
    p.addEventListener('mouseenter', on); p.addEventListener('click', on); p.addEventListener('focusin', on);
  });

  /* запчасти и сита: список + фото */
  const eqImgs = $$('.eq__pic img'), eqLis = $$('.eq__list li');
  eqLis.forEach(li => {
    const on = () => { const i = li.dataset.eq; eqLis.forEach(x => x.classList.toggle('is-on', x === li)); eqImgs.forEach(im => im.classList.toggle('is-on', im.dataset.eq === i)); };
    li.addEventListener('mouseenter', on); li.addEventListener('click', on);
  });
  if (eqImgs[0]) eqImgs[0].classList.add('is-on');

  /* поставка: камень идёт по ленте вместе с прокруткой */
  const flow = $('.flow');
  if (flow) {
    const trail = document.createElement('i'); trail.className = 'flow-trail';
    const dot = document.createElement('i'); dot.className = 'flow-dot';
    flow.append(trail, dot);
    const flowMove = () => {
      const r = flow.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * .85 - r.top) / (innerHeight * .6)));
      dot.style.left = `calc(${p * 100}% - ${p * 11}px)`; trail.style.width = p * 100 + '%';
    };
    addEventListener('scroll', flowMove, { passive: true }); flowMove();
  }

  /* формы и окно КП */
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
  $$('input[required]:not([type=tel])').forEach(i => i.addEventListener('input', () => i.classList.remove('is-bad')));
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
  cta.addEventListener('submit', e => { e.preventDefault(); if (!validate(cta)) return; $('[data-state="form"]', cta).hidden = true; $('[data-state="ok"]', cta).hidden = false; });
  $('[data-reset]', cta).addEventListener('click', () => { cta.reset(); $('.file span', cta).textContent = 'Приложить опросный лист или ТЗ'; $('[data-state="form"]', cta).hidden = false; $('[data-state="ok"]', cta).hidden = true; });
  $('.file input', cta).addEventListener('change', e => { const f = e.target.files[0]; $('.file span', cta).textContent = f ? f.name : 'Приложить опросный лист или ТЗ'; });
  $$('[data-kp]').forEach(b => b.addEventListener('click', () => openDlg('Запросить КП', `<b>${b.dataset.kp}</b>Инженер уточнит породу и площадку по телефону и пришлёт КП с ценой, сроком и доставкой.`)));

  /* данные */
  fetch(root + 'data/oborudovanie.json').then(r => r.json()).then(D => { initTable(D); initQuiz(D); }).catch(() => {
    $('#rows').innerHTML = '<p class="tbl__empty">Не загрузился каталог. Обновите страницу.</p>';
  });

  /* ---------- таблица моделей ---------- */
  function initTable(D) {
    const C = page === 'd' ? {
      list: D.drob, types: [['shchek', 'Щековые'], ['konus', 'Конусные'], ['rotor', 'Роторные']], mobSwitch: true,
      cols: [['Производительность', 'т/ч', m => `${m.q[0]}–${m.q[1]}`, 'Тонн в час'], ['Кусок на входе', 'мм', m => `до ${m.feed}`, 'Кусок, мм'], ['Фракция на выходе', 'мм', m => `${m.out[0]}–${m.out[1]}`, 'Выход, мм'], ['Мощность', 'кВт', m => m.kw, 'Мощность, кВт'], ['Масса', 'т', m => fmt(m.t), 'Масса, т']],
      sub: m => `${TYPE[m.type]}${m.mob ? ' мобильная' : ''} · ${m.sub}`,
    } : {
      list: D.groh, types: [['naklon', 'Наклонные'], ['gorizont', 'Горизонтальные'], ['kolosnik', 'Колосниковые'], ['mobil', 'Мобильные']], mobSwitch: false,
      cols: [['Сито, Ш × Д', 'м', m => m.size.map(x => x.toFixed(1).replace('.', ',')).join(' × '), 'Сито, м'], ['Деки', 'шт', m => m.decks, 'Деки'], ['Площадь деки', 'м²', m => fmt(m.area), 'Площадь, м²'], ['Ячейка', 'мм', m => `${m.cell[0]}–${m.cell[1]}`, 'Ячейка, мм'], ['Производительность', 'т/ч', m => `${m.q[0]}–${m.q[1]}`, 'Тонн в час'], ['Мощность', 'кВт', m => m.kwTxt, 'Мощность, кВт'], ['Масса', 'т', m => fmt(m.t), 'Масса, т']],
      sub: m => `${TYPE[m.type]} · ${m.decks} ${plural(m.decks, 'дека', 'деки', 'дек')}`,
    };
    const st = { type: 'all', mob: false, sort: 'def', all: false }, basket = new Set();
    const tbl = $('#tbl');
    tbl.style.setProperty('--cols', `minmax(0, 2.5fr) repeat(${C.cols.length}, minmax(0, 1fr)) 44px`);
    $('#thead').innerHTML = `<span role="columnheader">Модель</span>` + C.cols.map(c => `<span role="columnheader">${c[0]}<small>${c[1]}</small></span>`).join('') + `<span role="columnheader"><span class="vh">В запрос КП</span></span>`;
    const count = t => C.list.filter(m => t === 'all' || m.type === t).length;
    $('#types').innerHTML = [['all', 'Все модели'], ...C.types].map(([t, n]) => `<button type="button" data-t="${t}" class="${t === 'all' ? 'is-on' : ''}">${n} <small>${count(t)}</small></button>`).join('');
    $$('#types button').forEach(b => b.addEventListener('click', () => setType(b.dataset.t)));
    function setType(t) { st.type = t; st.all = false; $$('#types button').forEach(x => x.classList.toggle('is-on', x.dataset.t === t)); render(); }
    if (C.mobSwitch) $('#mobOnly').addEventListener('change', e => { st.mob = e.target.checked; render(); });
    else $('#mobOnly').closest('.switch').remove();
    $('#sort').addEventListener('change', e => { st.sort = e.target.value; render(); });
    $$('[data-pick]').forEach(a => a.addEventListener('click', () => {
      if (C.mobSwitch) { st.mob = !!a.dataset.mob; $('#mobOnly').checked = st.mob; }
      setType(a.dataset.pick);
    }));
    const av = m => m.srok === 'sklad' ? '<em class="av"><i></i>на складе</em>' : '<em class="av av--low"><i></i>под заказ, 45–60 дней</em>';
    function render() {
      let L = C.list.filter(m => (st.type === 'all' || m.type === st.type) && (!st.mob || m.mob));
      if (st.sort === 'q') L = [...L].sort((a, b) => a.q[1] - b.q[1]);
      if (st.sort === 't') L = [...L].sort((a, b) => a.t - b.t);
      const lim = mobile() && !st.all ? 6 : Infinity, more = $('#more');   // телефону — первые шесть
      more.hidden = L.length <= lim; more.innerHTML = `<b>Показать все ${L.length}</b><span>ещё ${L.length - 6}</span>`;
      L = L.slice(0, lim);
      $('#rows').innerHTML = L.map(m => `<div class="row" role="row">
        <div class="row__n" role="cell"><b>${m.name}</b><span>${C.sub(m)}</span>${av(m)}</div>
        ${C.cols.map(c => `<div class="row__c" role="cell" data-l="${c[3]}">${c[2](m)}</div>`).join('')}
        <button type="button" class="add ${basket.has(m.id) ? 'is-on' : ''}" data-id="${m.id}" aria-label="${basket.has(m.id) ? 'Убрать из запроса' : 'Добавить в запрос КП'}: ${m.name}"><svg viewBox="0 0 16 16"><path d="${basket.has(m.id) ? 'M3 8.5l3 3 7-7' : 'M8 2v12M2 8h12'}"/></svg></button>
      </div>`).join('');
      $('#empty').hidden = L.length > 0;
    }
    matchMedia('(max-width: 640px)').addEventListener('change', render);
    $('#more').addEventListener('click', () => { st.all = true; render(); });
    $('#rows').addEventListener('click', e => {
      const b = e.target.closest('.add'); if (!b) return;
      const id = b.dataset.id; basket.has(id) ? basket.delete(id) : basket.add(id);
      render(); $('#basketN').textContent = basket.size; $('#basket').hidden = !basket.size;
    });
    $('#basket').addEventListener('click', () => {
      const L = C.list.filter(m => basket.has(m.id));
      openDlg('Запросить КП', `<b>${L.length} ${plural(L.length, 'модель', 'модели', 'моделей')}</b>Цену, срок и доставку до площадки пришлём одним письмом.<ul>${L.map(m => `<li>${m.name} — ${TYPE[m.type]}, ${m.q[0]}–${m.q[1]} т/ч</li>`).join('')}</ul>`);
    });
    render();
  }

  /* ---------- подбор ---------- */
  function initQuiz(D) {
    const A = { mat: null, q: +$('#qRange').value, fr: [], isp: null };
    const steps = $$('.qstep'), bar = $$('.qbar li');
    let cur = 0; const seen = new Set([0]);
    const name = (k, v) => { const b = $(`.opts[data-k="${k}"] [data-v="${v}"] b`); return b ? b.textContent : ''; };
    const done = i => [A.mat, true, A.fr.length, A.isp][i];
    function go(i) {
      cur = Math.max(0, Math.min(steps.length - 1, i)); seen.add(cur);
      steps.forEach((s, j) => { s.hidden = j !== cur; });
      bar.forEach((li, j) => { li.classList.toggle('is-on', j === cur); li.classList.toggle('is-done', seen.has(j) && !!done(j) && j !== cur); });
      $('#qBack').hidden = cur === 0;
      $('#qNext').disabled = !done(cur);
      $('#qNext').firstChild.textContent = cur === steps.length - 1 ? 'Показать схему ' : 'Дальше ';
    }
    bar.forEach((li, j) => li.addEventListener('click', () => { if (j <= cur || [0, 1, 2].slice(0, j).every(done)) go(j); }));
    $('#qBack').addEventListener('click', () => go(cur - 1));
    $('#qRecap').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });
    $('#qNext').addEventListener('click', () => { if (cur < steps.length - 1) go(cur + 1); else finish(); });
    // одиночный выбор: материал и исполнение
    $$('.opts').forEach(g => $$('[data-v]', g).forEach(b => b.addEventListener('click', () => {
      $$('[data-v]', g).forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', x === b); });
      A[g.dataset.k] = b.dataset.v; update(); go(cur);
      setTimeout(() => { if (cur < steps.length - 1) go(cur + 1); else finish(); }, 260);
    })));
    // производительность
    const range = $('#qRange');
    const setQ = q => { A.q = q; range.value = q; $('#qOut').textContent = q.toLocaleString('ru-RU'); range.style.setProperty('--p', (q - range.min) / (range.max - range.min) * 100 + '%'); $$('[data-q]').forEach(b => b.classList.toggle('is-on', +b.dataset.q === q)); update(); };
    range.addEventListener('input', () => setQ(+range.value));
    $$('[data-q]').forEach(b => b.addEventListener('click', () => setQ(+b.dataset.q)));
    // фракции: несколько
    $$('.frs button').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.v, on = !A.fr.includes(k);
      A.fr = on ? [...A.fr, k] : A.fr.filter(x => x !== k);
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); update(); go(cur);
    }));

    const res = $('#qres');
    function summary() {
      const fr = FRS.filter(f => A.fr.includes(f.k)).map(f => f.n).join(', ');
      return [A.mat && name('mat', A.mat), A.q + ' т/ч', fr && fr + ' мм', A.isp && name('isp', A.isp)].filter(Boolean).join(' · ');
    }
    function update() {
      $('#qSum').textContent = summary();
      if (!(A.mat && A.fr.length && A.isp)) {
        const left = [!A.mat && 'материал', !A.fr.length && 'фракция', !A.isp && 'исполнение'].filter(Boolean).join(', ');
        res.classList.remove('is-done'); $('#qRecap').hidden = true;
        $('#qOutBody').innerHTML = `<p class="qres__wait">Осталось ответить: ${left}. Схема появится здесь и будет меняться вместе с ответами.</p><div class="ghost" aria-hidden="true"><i></i><i></i><i></i></div>`;
        return;
      }
      res.classList.add('is-done');
      $('#qRecap').innerHTML = bar.map((li, j) => `<div><dt>${li.textContent}</dt><dd>${[name('mat', A.mat), A.q + ' т/ч', FRS.filter(f => A.fr.includes(f.k)).map(f => f.n).join(', ') + ' мм', name('isp', A.isp)][j]}</dd><button type="button" data-go="${j}">Изменить</button></div>`).join('');
      $('#qRecap').hidden = false;
      $('#qOutBody').innerHTML = page === 'd' ? viewD(podborD(A, D)) : viewG(podborG(A, D));
      const ch = $('.chain', res); if (ch) ch.style.setProperty('--h', Math.max(60, ch.offsetHeight - 60) + 'px');
    }
    function finish() { update(); if (innerWidth <= 960) res.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }

    const deckName = (i, n) => n === 1 ? 'Дека' : i === 0 ? 'Верхняя дека' : i === n - 1 ? 'Нижняя дека' : n === 3 ? 'Средняя дека' : i === 1 ? 'Вторая дека' : 'Третья дека';
    function decksHtml(sc, chosen) {
      const c = sc.deki.map(d => d.cut);
      return `<div class="decks">${sc.deki.map((d, i) => {
        const fr = i === 0 ? `> ${d.cut} мм, возврат` : `${d.cut}–${c[i - 1]} мм`, key = i === 0 ? '' : `${d.cut}-${c[i - 1]}`;
        return `<div class="deck" style="--cell:${Math.max(4, Math.min(26, Math.sqrt(d.cell) * 3.2)).toFixed(1)}px"><i class="deck__mesh"></i><p><b>${deckName(i, sc.deki.length)}</b><span>ячейка ${d.cell} мм · ${d.sito}</span></p><em class="${chosen.includes(key) ? 'is-want' : ''}">${fr}</em></div>`;
      }).join('')}<div class="deck deck--under"><p><b>Под нижней декой</b></p><em class="${chosen.includes(`0-${sc.cmin}`) ? 'is-want' : ''}">0–${sc.cmin} мм</em></div></div>`;
    }
    function areaHtml(sc) {
      return `<p class="qcalc">Площадь считаем по нижней деке. Она режет по ${sc.cmin} мм, на неё приходит около ${sc.load} т/ч. Сито ${sc.cmin} мм пропускает около ${sc.qs} т/ч с квадратного метра${sc.k < 1 ? `, для этого материала с поправкой ×${fmt(sc.k, 2)}` : ''}. Нужно <b>${fmt(sc.need)} м²</b>, у ${sc.m.name} — <b>${fmt(sc.m.area)} м²${sc.n > 1 ? ` × ${sc.n}` : ''}</b>.</p>`;
    }
    const notesHtml = n => n.length ? `<ul class="qres__notes">${n.map(x => `<li>${x}</li>`).join('')}</ul>` : '';
    const kpBtn = t => `<button type="button" class="btn btn--hot btn--full" data-scheme="${t}">Получить КП на эту схему <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10M11 5l5 5-5 5"/></svg></button>`;

    function viewD(r) {
      const sc = r.sc;
      const chain = r.st.map(s => `<li class="st"><small>${s.role}</small><b>${s.n > 1 ? s.n + ' × ' : ''}${s.m.name}</b><span>${TYPE[s.m.type]} · ${s.m.q[0]}–${s.m.q[1]} т/ч · кусок до ${s.m.feed} мм · выход ${s.m.out[0]}–${s.m.out[1]} мм</span></li>`).join('');
      const scr = `<li class="st st--g"><small>Сортировка</small><b>${sc.n > 1 ? sc.n + ' × ' : ''}${sc.m.name}</b><span>${TYPE[sc.m.type]} грохот · ${sc.deki.length} ${plural(sc.deki.length, 'дека', 'деки', 'дек')} · ячейки ${sc.deki.map(d => d.cell).join(', ')} мм</span><a href="grohoty/">Сита и площадь — на странице грохотов →</a></li>`;
      const text = [...r.st.map(s => (s.n > 1 ? s.n + ' × ' : '') + s.m.name), sc.m.name].join(' + ');
      return `<ol class="chain">${chain}${scr}<i></i><i></i><i></i></ol>${notesHtml(r.notes)}${kpBtn(text)}<p class="res__note">Схема предварительная. Инженер проверит её по ситовому анализу и крепости породы и пришлёт КП с ценой, сроком и доставкой за один рабочий день.</p>`;
    }
    function viewG(r) {
      const sc = r.sc, m = sc.m;
      const head = `<div class="qmodel"><small>${TYPE[m.type]} грохот</small><b>${sc.n > 1 ? sc.n + ' × ' : ''}${m.name}</b><span>сито ${m.size.map(x => x.toFixed(1).replace('.', ',')).join(' × ')} м · ${m.decks} ${plural(m.decks, 'дека', 'деки', 'дек')} · ${m.q[0]}–${m.q[1]} т/ч · ${m.kwTxt} кВт</span></div>`;
      const kol = r.kol ? `<p class="qkol">Перед щековой поставьте колосниковый <b>${r.kol.name}</b>: он снимет мелочь и глину, дробилка разгрузится на 20–30 %. <a href="../#podbor">Подобрать дробилку →</a></p>` : '';
      return `${head}${decksHtml(sc, A.fr)}${areaHtml(sc)}${kol}${notesHtml(r.notes)}${kpBtn((sc.n > 1 ? sc.n + ' × ' : '') + m.name + (r.kol ? ' + ' + r.kol.name : ''))}<p class="res__note">Расчёт предварительный. Инженер проверит его по ситовому анализу и влажности и пришлёт КП с ценой, ситами и сроком за один рабочий день.</p>`;
    }
    res.addEventListener('click', e => {
      const b = e.target.closest('[data-scheme]'); if (!b) return;
      const items = page === 'd' ? $$('.st', res).map(x => `${$('small', x).textContent}: ${$('b', x).textContent}`) : $$('.deck:not(.deck--under)', res).map(x => `${$('b', x).textContent}: ${$('span', x).textContent}`);
      openDlg('КП на схему', `<b>${b.dataset.scheme}</b>${summary()}<ul>${items.map(t => `<li>${t}</li>`).join('')}</ul>`);
    });

    setQ(A.q); go(0); update();
  }
})();
