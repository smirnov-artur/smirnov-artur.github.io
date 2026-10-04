(() => {
'use strict';

const { CITIES, TYPES, FEATURES, AGENTS, OBJECTS, MEDIA } = window;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- хранилище: без localStorage страница тоже работает ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } }
};
let favs = store.get('mera-fav', []);
if (!Array.isArray(favs)) favs = [];

/* ---------- аналитика: в рабочей версии те же события уходят целями в Метрику ---------- */
const EVENTS = [];
const LEADS = [];
function track(name, data = {}) {
  EVENTS.push({ name, data, t: new Date() });
  try { if (typeof window.ym === 'function' && window.YM_ID) window.ym(window.YM_ID, 'reachGoal', name, data); } catch { /* нет счётчика */ }
}

/* ---------- форматирование ---------- */
const nf = new Intl.NumberFormat('ru-RU');
const num = (n, d = 1) => n.toLocaleString('ru-RU', { maximumFractionDigits: d });
const mln = p => p >= 1e9 ? `${num(p / 1e9, 2)} млрд ₽` : `${num(p / 1e6)} млн ₽`;
const rub = p => `${nf.format(p)} ₽`;
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
const objWord = n => `${n} ${plural(n, 'объект', 'объекта', 'объектов')}`;
const roomsTxt = o => o.rooms ? `${o.rooms} ${plural(o.rooms, 'комната', 'комнаты', 'комнат')}` : o.cabinets ? `${o.cabinets} ${plural(o.cabinets, 'кабинет', 'кабинета', 'кабинетов')}` : 'открытая планировка';
const floorTxt = f => /из/.test(f) ? `${f} этаж` : f;
const metaLine = o => [`${num(o.area, 0)} м²`, o.rooms || o.cabinets ? roomsTxt(o) : null, o.land ? `участок ${o.land}` : floorTxt(o.floor)].filter(x => x && x !== '—');
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- фото ---------- */
const isUrl = p => /^(blob:|data:|https?:)/.test(p);
const src = (p, w) => isUrl(p) ? p : `https://images.unsplash.com/photo-${p}?w=${w}&q=72&auto=format&fit=crop`;
function pic(p, alt, { w = 800, sizes = '(max-width: 760px) 100vw, 50vw', eager = false, cls = '' } = {}) {
  const set = isUrl(p) ? '' : ` srcset="${[480, 800, 1200, 1800].map(x => `${src(p, x)} ${x}w`).join(', ')}" sizes="${sizes}"`;
  return `<img${cls ? ` class="${cls}"` : ''} src="${src(p, w)}"${set} alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

/* ---------- иконки ---------- */
const I = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  tg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 4.6 3.3 11.3c-.7.3-.7 1.2 0 1.5l4.2 1.5 1.6 5c.2.6 1 .8 1.5.3l2.4-2.3 4.4 3.2c.6.4 1.3.1 1.5-.6l2.9-13.2c.2-.8-.6-1.4-1.3-1.1zM9.2 14.1l7.6-6.1"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-3.8A8.3 8.3 0 1 1 8.3 19z"/><path d="M9.2 8.6c0 3.1 3 6.1 6.1 6.1l.9-1.5-1.8-.9-.9.9c-1-.4-2.3-1.7-2.7-2.7l.9-.9-.9-1.8z"/></svg>',
  max: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.6 20.8l4.4-.8A8.8 8.8 0 1 0 12 3.2z"/><path d="M8.3 14.8V9.6l3.7 3.2 3.7-3.2v5.2"/></svg>'
};
const MSG = [['telegram', 'Telegram', 'https://t.me/', I.tg], ['whatsapp', 'WhatsApp', 'https://wa.me/', I.wa], ['max', 'MAX', 'https://max.ru/', I.max]];
const msgs = () => MSG.map(([k, n, h, ic]) => `<a class="msg" href="${h}" target="_blank" rel="noopener" data-msg="${k}">${ic}<span>${n}</span></a>`).join('');

/* ---------- данные ---------- */
const pub = () => OBJECTS.filter(o => o.status !== 'draft');
const bySlug = s => OBJECTS.find(o => o.slug === s);
const typeBySlug = s => Object.keys(TYPES).find(k => TYPES[k].slug === s);
const place = o => `${o.district}, ${CITIES[o.city].short}`;
const CITY_PH = { 'moskva': '1600607687939-ce8a6c25118c', 'sankt-peterburg': '1600210491892-03d54c0aaf87', 'sochi': '1613490493576-7fde63acd811' };
const typeTitle = (cityKey, typeKey) => {
  const c = CITIES[cityKey];
  if (!typeKey) return `Недвижимость ${c.in}`;
  return `${TYPES[typeKey].many} ${typeKey === 'dom' ? c.area : c.in}`;
};

const SERVICES = [
  ['Подбор', 'Собираем короткий список из 5–7 объектов за два-три дня, в том числе тех, что собственники не публикуют. Ездим на просмотры вместе с вами и говорим, что не так с каждым.', 'Для покупателя бесплатно — комиссию платит продавец'],
  ['Продажа', 'Оценка по закрытым сделкам, а не по ценам в объявлениях. Съёмка, показы, переговоры с покупателями и их агентами.', '2–3% от цены, после регистрации сделки'],
  ['Проверка документов', 'История собственников за 20 лет, обременения, согласие супруга, перепланировки, долги за коммунальные услуги. Отчёт — в письменном виде.', 'От 60 000 ₽, можно отдельно от сделки'],
  ['Сопровождение сделки', 'Ипотека в шести банках, аккредитив или ячейка, электронная регистрация, передача ключей по акту.', 'От 120 000 ₽'],
  ['Коммерческая недвижимость', 'Помещения с арендатором и без. Считаем окупаемость, читаем договор аренды, проверяем, как арендатор платит.', '1,5–2% от цены']
];
const REVIEWS = [
  ['Полгода искали квартиру на Петроградской через разные агентства. Здесь за две недели показали четыре варианта и про каждый прямо сказали, что с ним не так. Купили третий.', 'Ольга и Дмитрий', 'купили квартиру в Петербурге'],
  ['Продавал дом в Хосте, живя в Москве, и ни разу не прилетал. Показы, документы и сделку вёл агент, регистрация прошла электронно.', 'Сергей', 'продал дом в Сочи']
];
const OFFICES = [
  ['Москва', 'Пречистенский пер., 14, стр. 1', [37.5985, 55.7433]],
  ['Санкт-Петербург', 'ул. Большая Конюшенная, 9', [30.3227, 59.9378]],
  ['Сочи', 'Навагинская ул., 9', [39.7218, 43.5853]]
];
// Статичная карта вместо виджета: бесплатный виджет показывает рекламную полосу, на дорогом сайте это лишнее.
// В рабочей версии — JS API Яндекса с ключом агентства; здесь картинка + своя метка, клик открывает Яндекс Карты.
const smap = ([lon, lat], z = 15) => `https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=${z}&size=650,450&l=map&lang=ru_RU`;
const ylink = ([lon, lat], z = 15) => `https://yandex.ru/maps/?ll=${lon},${lat}&z=${z}&pt=${lon},${lat}`;
const mapBox = (coords, z, title, cls = '') => `<a class="map${cls}" href="${ylink(coords, z)}" target="_blank" rel="noopener" aria-label="${title} — открыть в Яндекс Картах"><img src="${smap(coords, z)}" alt="" loading="lazy"><i class="map-pin" aria-hidden="true"></i><span class="map-open">Открыть в Яндекс Картах</span></a>`;

/* ---------- фильтры каталога ---------- */
const PRICE = [0, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000];
const AREA = [0, 50, 75, 100, 150, 200, 300, 500, 700];
const SORTS = { new: 'Сначала новые', cheap: 'Сначала дешевле', expensive: 'Сначала дороже', area: 'Больше площадь', ppm: 'Дешевле за м²' };
const defF = () => ({ gorod: '', tip: [], cena: [0, PRICE.length - 1], pl: [0, AREA.length - 1], komn: [], opc: [], sort: 'new' });

function readF(q) {
  const list = k => (q.get(k) || '').split(',').filter(Boolean);
  const rng = (k, S) => {
    const [a, b] = (q.get(k) || '').split('-').map(Number);
    const lo = S.findLastIndex(s => s <= (a || 0));
    const hi = b ? S.findIndex(s => s >= b) : -1;
    return [Math.max(0, lo), hi < 0 ? S.length - 1 : hi];
  };
  return {
    gorod: CITIES[q.get('gorod')] ? q.get('gorod') : '',
    tip: list('tip').filter(k => TYPES[k]),
    cena: rng('cena', PRICE), pl: rng('pl', AREA),
    komn: list('komn').filter(k => /^[1-5]$/.test(k)),
    opc: list('opc').filter(k => FEATURES[k]),
    sort: SORTS[q.get('sort')] ? q.get('sort') : 'new'
  };
}
const rangeOn = (r, S) => r[0] > 0 || r[1] < S.length - 1;
function qs(F) {
  const p = new URLSearchParams();
  if (F.gorod) p.set('gorod', F.gorod);
  if (F.tip.length) p.set('tip', F.tip.join(','));
  if (rangeOn(F.cena, PRICE)) p.set('cena', `${PRICE[F.cena[0]]}-${PRICE[F.cena[1]]}`);
  if (rangeOn(F.pl, AREA)) p.set('pl', `${AREA[F.pl[0]]}-${AREA[F.pl[1]]}`);
  if (F.komn.length) p.set('komn', F.komn.join(','));
  if (F.opc.length) p.set('opc', F.opc.join(','));
  if (F.sort !== 'new') p.set('sort', F.sort);
  const s = p.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}
function match(o, F) {
  const p = o.price / 1e6;
  return (!F.gorod || o.city === F.gorod)
    && (!F.tip.length || F.tip.includes(o.type))
    && p >= PRICE[F.cena[0]] && (F.cena[1] === PRICE.length - 1 || p <= PRICE[F.cena[1]])
    && o.area >= AREA[F.pl[0]] && (F.pl[1] === AREA.length - 1 || o.area <= AREA[F.pl[1]])
    && (!F.komn.length || (o.rooms && F.komn.some(k => k === '5' ? o.rooms >= 5 : o.rooms === +k)))
    && F.opc.every(k => o.features.includes(k));
}
const sorters = {
  new: (a, b) => b.added.localeCompare(a.added),
  cheap: (a, b) => a.price - b.price,
  expensive: (a, b) => b.price - a.price,
  area: (a, b) => b.area - a.area,
  ppm: (a, b) => a.price / a.area - b.price / b.area
};
const filtered = F => pub().filter(o => match(o, F)).sort(sorters[F.sort]);
function rangeTxt(S, [i, j], fmt = String) {
  const last = S.length - 1;
  if (i === 0 && j === last) return 'любая';
  if (i === 0) return `до ${fmt(S[j])}`;
  if (j === last) return `от ${fmt(S[i])}`;
  return `${fmt(S[i])} – ${fmt(S[j])}`;
}
const priceFmt = v => v >= 1000 ? '1 млрд' : `${v}`;

/* ---------- общие куски ---------- */
const favBtn = (slug, wide) => {
  const on = favs.includes(slug);
  return `<button class="fav${wide ? ' fav-wide' : ''}" type="button" data-fav="${slug}" aria-pressed="${on}" aria-label="${on ? 'Убрать из избранного' : 'Добавить в избранное'}">${I.heart}${wide ? `<span>${on ? 'В избранном' : 'В избранное'}</span>` : ''}</button>`;
};
function card(o, { sizes = '(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 30vw', eager = false } = {}) {
  return `<article class="card reveal">
    <div class="card-pic">
      <a class="card-media" href="#/obekt/${o.slug}" tabindex="-1" aria-hidden="true">${pic(o.photos[0], o.title, { sizes, eager })}</a>
      ${favBtn(o.slug)}
    </div>
    <div class="card-body">
      <div class="card-row"><h3 class="card-title"><a href="#/obekt/${o.slug}">${esc(o.title)}</a></h3><p class="card-price">${mln(o.price)}</p></div>
      <p class="card-meta">${[place(o), ...metaLine(o)].map(t => `<span>${esc(t)}</span>`).join(' <i>·</i> ')}</p>
    </div>
  </article>`;
}
const crumbs = items => `<nav class="crumbs" aria-label="Навигация">${items.map(([t, h]) => h ? `<a href="${h}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`).join('')}</nav>`;
const numbers = () => `<section class="nums-sec wrap" aria-label="Агентство в цифрах"><div class="nums">
  <div class="num reveal"><b>11 лет</b><span>работаем с 2015 года, а в Сочи — с 2019 года</span></div>
  <div class="num reveal"><b>430</b><span>сделок, из них 70 — загородные дома</span></div>
  <div class="num reveal"><b>1 из 5</b><span>объектов, которые мы смотрим, попадает в каталог</span></div></div>
  <p class="nums-note">Цифры для примера — в рабочей версии будут ваши.</p>
</section>`;

function leadForm({ topic = 'Консультация', o = null, title = '', sub = '', note = '' } = {}) {
  return `<form class="lead" data-leadform novalidate data-topic="${esc(topic)}" data-obj="${o ? o.slug : ''}">
    ${title ? `<h2 class="lead-title" id="lead-title">${title}</h2>` : ''}
    ${sub ? `<p class="lead-sub">${sub}</p>` : ''}
    <label class="field"><span>Имя</span><input name="name" autocomplete="name" required></label>
    <label class="field"><span>Телефон</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (900) 000-00-00" required></label>
    ${o
      ? `<label class="field"><span>Когда удобно смотреть</span><select name="msg"><option>В будни днём</option><option>В будни вечером</option><option>В выходные</option></select></label>`
      : `<label class="field"><span>Что ищете <i>— необязательно</i></span><textarea name="msg" rows="3" placeholder="Например: три комнаты на Петроградской, до 120 млн">${esc(note)}</textarea></label>`}
    <label class="agree"><input type="checkbox" name="ok" checked><span>Согласен на обработку персональных данных</span></label>
    <button class="btn btn-dark btn-block" type="submit">${o ? 'Записаться на просмотр' : 'Отправить заявку'}</button>
  </form>`;
}

/* ================= СТРАНИЦЫ ================= */

function home() {
  const all = pub();
  const feat = ['penthaus-u-patriarshih-prudov', 'kvartira-na-kamennoostrovskom', 'dom-s-basseynom-v-hoste', 'shale-v-krasnoy-polyane']
    .map(bySlug).filter(o => o && o.status !== 'draft');
  return {
    title: 'Мера — квартиры, дома и пентхаусы в Москве, Петербурге и Сочи',
    desc: 'Агентство недвижимости «Мера»: квартиры, дома, пентхаусы и коммерческие помещения в Москве, Санкт-Петербурге и Сочи. Каждый объект осмотрен агентом и проверен юристом до публикации.',
    html: `
<section class="hero">
  <div class="hero-media">${pic('1600585152915-d208bec867a1', 'Гостиная дома в Жуковке с выходом на террасу', { w: 1800, sizes: '100vw', eager: true })}</div>
  <div class="wrap hero-in">
    <h1 class="hero-title">Недвижимость, которую мы проверили раньше вас</h1>
    <p class="hero-lead">Квартиры, дома и пентхаусы в Москве, Петербурге и Сочи. Агент сам приезжает на объект, юрист проверяет документы — и только потом объект попадает в каталог.</p>
    <form class="search" id="hero-search" role="search" aria-label="Поиск объектов">
      <label class="sf"><span>Город</span><select name="gorod"><option value="">Любой</option>${Object.entries(CITIES).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('')}</select></label>
      <label class="sf"><span>Тип</span><select name="tip"><option value="">Любой</option>${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.one}</option>`).join('')}</select></label>
      <label class="sf"><span>Бюджет</span><select name="budget"><option value="">Без ограничений</option>${[75, 150, 300, 750].map(v => `<option value="${v}">до ${v} млн ₽</option>`).join('')}</select></label>
      <button class="btn btn-dark" type="submit">Показать <span data-count>${objWord(all.length)}</span></button>
    </form>
  </div>
  <a class="hero-cap" href="#/obekt/dom-v-zhukovke">На фото — дом в Жуковке, 640 м² ${I.arrow}</a>
</section>

<section class="feat wrap">
  <div class="sec-head reveal">
    <h2>Сейчас в продаже</h2>
    <a class="link" href="#/katalog">Весь каталог — ${objWord(all.length)} ${I.arrow}</a>
  </div>
  <div class="feat-grid">${feat.map((o, i) => card(o, { sizes: i === 0 || i === 3 ? '(max-width: 760px) 100vw, 56vw' : '(max-width: 760px) 100vw, 36vw' })).join('')}</div>
</section>

<section class="cities wrap">
  <div class="sec-head reveal"><h2>Три города</h2><p>Агенты живут там, где работают, и знают не только районы, но и конкретные дома.</p></div>
  <ul class="city-list">${Object.entries(CITIES).map(([k, c]) => {
    const l = all.filter(o => o.city === k);
    return `<li class="reveal"><a class="city-row" href="#/${k}">
      <span class="city-name">${c.name}</span>
      <span class="city-meta"><span>${objWord(l.length)}</span>${l.length ? `<span>от ${mln(Math.min(...l.map(o => o.price)))}</span>` : ''}</span>
      <span class="city-ph">${pic(CITY_PH[k], '', { w: 480, sizes: '220px' })}</span>
      <span class="city-go">${I.arrow}</span></a></li>`;
  }).join('')}</ul>
</section>

<section class="svc wrap">
  <div class="svc-head reveal">
    <h2>Чем занимаемся</h2>
    <p>Жилая и коммерческая недвижимость от 50&nbsp;млн&nbsp;₽. Условия называем до первого просмотра.</p>
    <a class="link" href="#/uslugi">Услуги и условия ${I.arrow}</a>
  </div>
  <div class="svc-list">${SERVICES.slice(0, 4).map(([h, p, s]) => `<div class="svc-row reveal"><h3>${h}</h3><p>${p}</p><span>${s}</span></div>`).join('')}</div>
</section>

${numbers()}

<section class="reviews wrap" aria-label="Отзывы">
  ${REVIEWS.map(([q, n, w]) => `<figure class="review reveal"><blockquote>${q}</blockquote><figcaption><b>${n}</b>, ${w}</figcaption></figure>`).join('')}
  <p class="nums-note">Отзывы для примера.</p>
</section>

<section class="cta">
  <div class="wrap cta-in">
    <div class="cta-text reveal">
      <h2>Не нашли подходящее?</h2>
      <p>Расскажите, что ищете. Пришлём 5–7 вариантов за два-три дня — в том числе те, что собственники просили не публиковать.</p>
      <p class="cta-or">Или напишите в мессенджер:</p>
      <div class="msgs">${msgs()}</div>
    </div>
    <div class="cta-form reveal">${leadForm({ topic: 'Подбор с главной' })}</div>
  </div>
</section>`,
    after: bindHero
  };
}

function bindHero() {
  const f = $('#hero-search');
  const F = () => ({ ...defF(), gorod: f.gorod.value, tip: f.tip.value ? [f.tip.value] : [], cena: [0, f.budget.value ? PRICE.indexOf(+f.budget.value) : PRICE.length - 1] });
  const upd = () => { $('[data-count]', f).textContent = objWord(filtered(F()).length); };
  f.addEventListener('change', upd);
  f.addEventListener('submit', e => { e.preventDefault(); track('search', { from: 'hero' }); location.hash = `#/katalog${qs(F())}`; });
}

/* ---------- каталог ---------- */
function dual(name, S, [i, j], label) {
  const last = S.length - 1;
  return `<div class="dual" data-dual="${name}" style="--a:${i / last * 100}%;--b:${j / last * 100}%">
    <input type="range" name="${name}" min="0" max="${last}" step="1" value="${i}" aria-label="${label}, от">
    <input type="range" name="${name}" min="0" max="${last}" step="1" value="${j}" aria-label="${label}, до">
  </div>
  <div class="dual-scale"><span>0</span><span>${S === PRICE ? '1 млрд' : '700+'}</span></div>`;
}
function filtersHtml(F) {
  const pill = (type, name, v, t, on, cls = '') => `<label class="pill${cls}"><input type="${type}" name="${name}" value="${v}"${on ? ' checked' : ''}><span>${t}</span></label>`;
  return `
  <fieldset class="f-group"><legend>Город</legend><div class="pills">
    ${[['', 'Все'], ...Object.entries(CITIES).map(([k, c]) => [k, c.short])].map(([k, n]) => pill('radio', 'gorod', k, n, F.gorod === k)).join('')}
  </div></fieldset>
  <fieldset class="f-group"><legend>Тип</legend><div class="pills">
    ${Object.entries(TYPES).map(([k, t]) => pill('checkbox', 'tip', k, t.one, F.tip.includes(k))).join('')}
  </div></fieldset>
  <fieldset class="f-group"><legend>Цена, млн ₽ <output data-out="cena"></output></legend>${dual('cena', PRICE, F.cena, 'Цена')}</fieldset>
  <fieldset class="f-group"><legend>Площадь, м² <output data-out="pl"></output></legend>${dual('pl', AREA, F.pl, 'Площадь')}</fieldset>
  <fieldset class="f-group"><legend>Комнаты</legend><div class="pills">
    ${['1', '2', '3', '4', '5'].map(k => pill('checkbox', 'komn', k, k === '5' ? '5+' : k, F.komn.includes(k), ' pill-sq')).join('')}
  </div></fieldset>
  <fieldset class="f-group"><legend>Ещё</legend><div class="checks">
    ${Object.entries(FEATURES).map(([k, n]) => `<label class="check"><input type="checkbox" name="opc" value="${k}"${F.opc.includes(k) ? ' checked' : ''}><span>${n}</span></label>`).join('')}
  </div></fieldset>`;
}

function catalog(q) {
  const F = readF(q);
  return {
    title: 'Каталог недвижимости: квартиры, дома, пентхаусы — Мера',
    desc: 'Каталог агентства «Мера»: квартиры, дома, пентхаусы и коммерческие помещения в Москве, Санкт-Петербурге и Сочи. Фильтры по городу, цене, площади и комнатам.',
    html: `<div class="page wrap">
  ${crumbs([['Главная', '#/'], ['Каталог']])}
  <header class="page-head"><h1>Каталог</h1><p class="lead">Всё, что сейчас в продаже. Агент был в каждом объекте и расскажет то, чего нет в описании.</p></header>
  <div class="cat">
    <div class="sheet-bg" data-sheet="close"></div>
    <aside class="sheet" id="sheet" aria-label="Фильтры">
      <div class="sheet-head"><h2>Фильтры</h2><button class="icon-btn" type="button" data-sheet="close" aria-label="Закрыть фильтры">${I.close}</button></div>
      <form class="filters" id="filters">${filtersHtml(F)}</form>
      <div class="sheet-foot"><button class="btn btn-line" type="button" data-reset>Сбросить</button><button class="btn btn-dark" type="button" data-sheet="close">Показать <span data-found></span></button></div>
    </aside>
    <div class="results">
      <div class="res-bar">
        <button class="btn btn-line btn-sm btn-filters" type="button" data-sheet="open">${I.filter}Фильтры<span class="badge" data-fcount hidden></span></button>
        <p class="found" aria-live="polite">Найдено: <b data-found></b></p>
        <label class="sort"><span>Сортировка</span><select id="sort">${Object.entries(SORTS).map(([k, t]) => `<option value="${k}"${F.sort === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <div class="chips" id="chips"></div>
      <div class="grid" id="grid"></div>
    </div>
  </div>
</div>`,
    after: () => bindCatalog(F)
  };
}

function drawResults(F) {
  const list = filtered(F);
  $('#grid').innerHTML = list.length ? list.map(o => card(o)).join('') : `<div class="empty">
    <h3>Под эти условия сейчас ничего нет</h3>
    <p>Часть объектов агенты показывают только по запросу. Оставьте заявку — проверим закрытую базу.</p>
    <div class="empty-act"><button class="btn btn-dark" type="button" data-lead="Подбор: пустой фильтр">Оставить заявку</button><button class="btn btn-line" type="button" data-reset>Сбросить фильтры</button></div>
  </div>`;
  $$('[data-found]').forEach(el => { el.textContent = objWord(list.length); });
  const groups = [F.gorod, F.tip.length, rangeOn(F.cena, PRICE), rangeOn(F.pl, AREA), F.komn.length, F.opc.length].filter(Boolean).length;
  const b = $('[data-fcount]'); b.hidden = !groups; b.textContent = groups;
  $('[data-out="cena"]').textContent = rangeTxt(PRICE, F.cena, priceFmt);
  $('[data-out="pl"]').textContent = rangeTxt(AREA, F.pl);
  const ch = [];
  if (F.gorod) ch.push(['gorod', '', CITIES[F.gorod].short]);
  F.tip.forEach(k => ch.push(['tip', k, TYPES[k].one]));
  if (rangeOn(F.cena, PRICE)) ch.push(['cena', '', `${rangeTxt(PRICE, F.cena, priceFmt)} млн ₽`]);
  if (rangeOn(F.pl, AREA)) ch.push(['pl', '', `${rangeTxt(AREA, F.pl)} м²`]);
  F.komn.forEach(k => ch.push(['komn', k, `${k === '5' ? '5+' : k} комн.`]));
  F.opc.forEach(k => ch.push(['opc', k, FEATURES[k]]));
  $('#chips').innerHTML = ch.length ? ch.map(([g, v, t]) => `<button class="chip" type="button" data-chip="${g}" data-v="${v}" aria-label="Убрать фильтр: ${esc(t)}">${esc(t)}${I.close}</button>`).join('') + '<button class="chip-reset" type="button" data-reset>Сбросить всё</button>' : '';
  reveal($('#grid'));
  syncFavs();
}

function bindCatalog(F) {
  const form = $('#filters');
  const apply = () => { history.replaceState(null, '', `#/katalog${qs(F)}`); drawResults(F); };
  const checked = n => $$(`input[name="${n}"]:checked`, form).map(i => i.value);
  let tt;
  form.addEventListener('input', e => {
    const d = e.target.closest('[data-dual]');
    if (d) {
      const [a, b] = $$('input', d);
      if (+a.value > +b.value) (e.target === a ? b : a).value = e.target.value;
      const last = +a.max;
      d.style.setProperty('--a', `${a.value / last * 100}%`);
      d.style.setProperty('--b', `${b.value / last * 100}%`);
      F[d.dataset.dual] = [+a.value, +b.value];
    }
    F.gorod = form.elements.gorod.value;
    F.tip = checked('tip'); F.komn = checked('komn'); F.opc = checked('opc');
    apply();
    clearTimeout(tt); tt = setTimeout(() => track('filter', { q: qs(F) }), 800);
  });
  $('#sort').addEventListener('change', e => { F.sort = e.target.value; apply(); });
  $('.cat').addEventListener('click', e => {
    const chip = e.target.closest('[data-chip]');
    const reset = e.target.closest('[data-reset]');
    if (!chip && !reset) return;
    if (reset) Object.assign(F, defF(), { sort: F.sort });
    else {
      const g = chip.dataset.chip, v = chip.dataset.v;
      if (g === 'gorod') F.gorod = '';
      else if (g === 'cena' || g === 'pl') F[g] = defF()[g];
      else F[g] = F[g].filter(x => x !== v);
    }
    $('#filters').innerHTML = filtersHtml(F);
    apply();
  });
  drawResults(F);
}

/* ---------- SEO-страницы города и категории ---------- */
function seoPage(cityKey, typeKey) {
  const c = CITIES[cityKey];
  const t = typeKey && TYPES[typeKey];
  const list = pub().filter(o => o.city === cityKey && (!typeKey || o.type === typeKey)).sort(sorters.new);
  const h1 = typeTitle(cityKey, typeKey);
  const prices = list.map(o => o.price), areas = list.map(o => o.area);
  const facts = list.length
    ? `Сейчас в продаже ${objWord(list.length)}: от ${num(Math.min(...areas), 0)} до ${num(Math.max(...areas), 0)} м², от ${mln(Math.min(...prices))} до ${mln(Math.max(...prices))}.`
    : 'Открытых объектов в этой категории сейчас нет — часть предложений агенты показывают только по запросу.';
  const typeLinks = Object.entries(TYPES).map(([k, tt]) => {
    const n = pub().filter(o => o.city === cityKey && o.type === k).length;
    return n ? `<a class="tag${k === typeKey ? ' on' : ''}" href="#/${cityKey}/${tt.slug}">${tt.many} <span>${n}</span></a>` : '';
  }).join('');
  const otherCities = Object.entries(CITIES).filter(([k]) => k !== cityKey).map(([k, cc]) => `<a class="tag" href="#/${k}${t ? `/${t.slug}` : ''}">${t ? typeTitle(k, typeKey) : `Недвижимость ${cc.in}`}</a>`).join('');
  return {
    title: `${h1} — купить, цены и фото | Мера`,
    desc: `${h1}: ${list.length ? `${objWord(list.length)} от ${mln(Math.min(...prices))}` : 'подбор по запросу'}. Каждый объект осмотрен агентом и проверен юристом. Фото, характеристики, расположение на карте.`,
    html: `<div class="page wrap">
  ${crumbs([['Главная', '#/'], ['Каталог', '#/katalog'], ...(t ? [[c.name, `#/${cityKey}`], [t.many]] : [[c.name]])])}
  <header class="page-head seo-head">
    <h1>${h1}</h1>
    <div class="seo-text"><p class="lead">${c.intro}</p><p>${facts}</p></div>
  </header>
  <div class="tags">${t ? `<a class="tag" href="#/${cityKey}">Все объекты ${c.in}</a>` : ''}${typeLinks}</div>
  <div class="grid grid-seo">${list.map(o => card(o)).join('')}</div>
  <div class="seo-foot">
    <a class="link" href="#/katalog${qs({ ...defF(), gorod: cityKey, tip: typeKey ? [typeKey] : [] })}">Уточнить в каталоге: цена, площадь, комнаты ${I.arrow}</a>
    <div class="tags">${otherCities}</div>
  </div>
</div>`
  };
}

/* ---------- карточка объекта ---------- */
function similar(o) {
  return pub().filter(x => x.slug !== o.slug)
    .map(x => ({ x, s: (x.type === o.type) * 3 + (x.city === o.city) * 2 + (Math.abs(Math.log(x.price / o.price)) < 0.6) }))
    .sort((a, b) => b.s - a.s || Math.abs(a.x.price - o.price) - Math.abs(b.x.price - o.price))
    .slice(0, 3).map(e => e.x);
}

function objectPage(slug) {
  const o = bySlug(slug);
  if (!o) return null;
  const c = CITIES[o.city], t = TYPES[o.type], n = o.photos.length;
  const cols = n >= 5 ? '2fr 1fr 1fr' : n > 1 ? '2fr 1fr' : '1fr';
  const rows = n >= 5 ? 2 : Math.max(1, n - 1);
  const agent = AGENTS[o.city];
  const spec = [
    ['Тип', t.one], ['Общая площадь', `${num(o.area, 0)} м²`],
    [o.type === 'kommerciya' ? 'Планировка' : 'Комнаты', o.type === 'kommerciya' ? roomsTxt(o) : o.rooms],
    ['Этаж', o.floor], ['Участок', o.land], ['Год постройки', o.year], ['Потолки', o.ceiling],
    ['Отделка', o.finish], ['Вид из окон', o.view], ['Парковка', o.parking]
  ].filter(([, v]) => v && v !== '—');
  const facts = [[`${num(o.area, 0)} м²`, 'площадь'], o.rooms ? [o.rooms, plural(o.rooms, 'комната', 'комнаты', 'комнат')] : null,
    o.land ? [o.land, 'участок'] : o.floor && o.floor !== '—' ? [o.floor.split(',')[0].replace(/\s*этаж.*$/, ''), 'этаж'] : null, o.year ? [o.year.split(',')[0], 'год постройки'] : null].filter(Boolean);
  return {
    title: o.seoTitle || `${o.title}, ${num(o.area, 0)} м² — купить ${c.in} | Мера`,
    desc: o.seoDesc || `${o.title}: ${o.address}, ${num(o.area, 0)} м², ${roomsTxt(o)}. Цена ${rub(o.price)}. Фото, характеристики и расположение на карте.`,
    obj: o,
    html: `<div class="page wrap obj-page">
  ${crumbs([['Каталог', '#/katalog'], [c.name, `#/${o.city}`], [t.many, `#/${o.city}/${t.slug}`], [o.title]])}
  ${o.status === 'draft' ? '<p class="draft-note">Черновик — посетители сайта эту страницу не видят.</p>' : ''}
</div>
<section class="gallery" aria-label="Фотографии">
  <div class="g-track" style="--cols:${cols};--rows:${rows}">
    ${o.photos.map((p, i) => `<button class="g-item" type="button" data-open="${i}" aria-label="Открыть фото ${i + 1} из ${n}">${pic(p, `${o.title} — фото ${i + 1}`, { w: i ? 900 : 1600, sizes: i ? '(max-width: 760px) 100vw, 25vw' : '(max-width: 760px) 100vw, 60vw', eager: i === 0 })}</button>`).join('')}
  </div>
  <span class="g-count" aria-hidden="true"><span data-gi>1</span> / ${n}</span>
  <button class="g-all" type="button" data-open="0">${I.expand}Все фото · ${n}</button>
</section>
<div class="wrap obj">
  <div class="obj-main">
    <header class="obj-head">
      <p class="obj-loc">${esc(o.district)} · ${esc(o.address)}</p>
      <h1>${esc(o.title)}</h1>
      <ul class="facts">${facts.map(([v, l]) => `<li><b>${esc(v)}</b><span>${l}</span></li>`).join('')}</ul>
    </header>
    <div class="obj-price-m"><b>${rub(o.price)}</b><span>${nf.format(Math.round(o.price / o.area))} ₽ за м²</span></div>
    <section class="obj-sec"><h2>Об объекте</h2>${o.text.map(p => `<p>${esc(p)}</p>`).join('')}</section>
    <section class="obj-sec"><h2>Характеристики</h2><dl class="specs">${spec.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>
    <section class="obj-sec"><h2>Расположение</h2>
      <p>${esc(o.address)}, ${c.name}${o.near ? `. ${esc(o.near)}` : ''}.</p>
      ${mapBox(o.coords, o.type === 'dom' ? 13 : 15, 'Карта: ' + esc(o.address))}
    </section>
  </div>
  <aside class="obj-side">
    <div class="panel">
      <p class="panel-price">${rub(o.price)}</p>
      <p class="panel-ppm">${nf.format(Math.round(o.price / o.area))} ₽ за м²</p>
      <button class="btn btn-dark btn-block" type="button" data-lead="Просмотр" data-obj="${o.slug}">Записаться на просмотр</button>
      ${favBtn(o.slug, true)}
      <p class="panel-sub">Или напишите — ответим в течение 15 минут:</p>
      <div class="msgs msgs-col">${msgs()}</div>
      <div class="agent"><span class="agent-ini" aria-hidden="true">${agent.split(' ').map(w => w[0]).join('')}</span><div><b>${agent}</b><span>Ведёт объект и покажет его в удобное вам время, в том числе вечером</span></div></div>
    </div>
  </aside>
</div>
<section class="similar wrap">
  <div class="sec-head"><h2>Похожие объекты</h2><a class="link" href="#/${o.city}/${t.slug}">${typeTitle(o.city, o.type)} ${I.arrow}</a></div>
  <div class="grid">${similar(o).map(x => card(x)).join('')}</div>
</section>`,
    after: () => bindGallery(o)
  };
}

function bindGallery(o) {
  track('object_view', { slug: o.slug });
  const tr = $('.g-track'), gi = $('[data-gi]');
  tr.addEventListener('scroll', () => { gi.textContent = Math.round(tr.scrollLeft / tr.clientWidth) + 1; }, { passive: true });
}

/* ---------- лайтбокс ---------- */
const lb = { list: [], i: 0, x0: null };
const lbEl = $('#lightbox');
function openLb(list, i) {
  lb.list = list; lb.i = i; showLb();
  lbEl.hidden = false; document.body.classList.add('lock');
  $('.lb-x').focus();
  track('gallery_open');
}
function showLb() {
  const im = $('.lb-img');
  im.src = src(lb.list[lb.i], 2000);
  im.alt = `Фото ${lb.i + 1} из ${lb.list.length}`;
  $('.lb-count').textContent = `${lb.i + 1} / ${lb.list.length}`;
}
const stepLb = d => { lb.i = (lb.i + d + lb.list.length) % lb.list.length; showLb(); };
function closeLb() { lbEl.hidden = true; document.body.classList.remove('lock'); }
lbEl.addEventListener('pointerdown', e => { lb.x0 = e.clientX; });
lbEl.addEventListener('pointerup', e => {
  if (lb.x0 === null) return;
  const dx = e.clientX - lb.x0; lb.x0 = null;
  if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1);
  else if (e.target === lbEl) closeLb();
});

/* ---------- избранное ---------- */
function favPage() {
  const list = favs.map(bySlug).filter(o => o && o.status !== 'draft');
  const fresh = pub().sort(sorters.new).slice(0, 3);
  return {
    title: `Избранное${list.length ? ` (${list.length})` : ''} — Мера`,
    desc: 'Объекты, которые вы отметили в каталоге агентства «Мера».',
    html: `<div class="page wrap">
  ${crumbs([['Главная', '#/'], ['Избранное']])}
  <header class="page-head fav-head">
    <div><h1>Избранное</h1><p class="lead">${list.length ? `${objWord(list.length)}. Список хранится в этом браузере, регистрация не нужна.` : 'Здесь пока пусто. Нажмите на сердечко на фото объекта — он появится в этом списке.'}</p></div>
    ${list.length ? '<button class="btn btn-dark" type="button" data-lead="Подборка из избранного" data-favnote>Обсудить подборку с агентом</button>' : '<a class="btn btn-dark" href="#/katalog">Открыть каталог</a>'}
  </header>
  ${list.length ? `<div class="grid">${list.map(o => card(o)).join('')}</div>` : `<div class="sec-head sec-head-sm"><h2>Можно начать с новых</h2></div><div class="grid">${fresh.map(o => card(o)).join('')}</div>`}
</div>`
  };
}

/* ---------- о компании, услуги, контакты ---------- */
function services() {
  return {
    title: 'Услуги: подбор, продажа, проверка документов — Мера',
    desc: 'Подбор и продажа недвижимости, проверка документов, сопровождение сделки, коммерческая недвижимость. Условия и стоимость услуг агентства «Мера».',
    html: `<div class="page wrap">
  ${crumbs([['Главная', '#/'], ['Услуги']])}
  <header class="page-head"><h1>Услуги</h1><p class="lead">Работаем с жилой и коммерческой недвижимостью от 50 млн ₽ в Москве, Петербурге и Сочи. Стоимость называем на первой встрече и фиксируем в договоре.</p></header>
  <div class="svc-list svc-full">${SERVICES.map(([h, p, s]) => `<div class="svc-row reveal"><h3>${h}</h3><p>${p}</p><span>${s}</span></div>`).join('')}</div>
  <p class="nums-note">Условия для примера.</p>
  <section class="steps">
    <h2 class="reveal">Как проходит работа</h2>
    <div class="steps-grid">
      <div class="reveal"><h3>Встреча</h3><p>Час в офисе или по видео. Разбираемся, что важно: район, школа рядом, этаж, сроки, ипотека. Без этого показы превращаются в экскурсии.</p></div>
      <div class="reveal"><h3>Короткий список</h3><p>Через два-три дня присылаем 5–7 объектов с комментариями агента: что хорошо, что смущает, где можно торговаться.</p></div>
      <div class="reveal"><h3>Показы и сделка</h3><p>Ездим вместе. Когда выбор сделан — юрист проверяет документы, мы ведём переговоры и сделку до передачи ключей.</p></div>
    </div>
  </section>
  <section class="cta cta-inline">
    <div class="cta-in">
      <div class="cta-text"><h2>Обсудить задачу</h2><p>Перезвоним в течение 15 минут в рабочее время и договоримся о встрече.</p><div class="msgs">${msgs()}</div></div>
      <div class="cta-form">${leadForm({ topic: 'Услуги' })}</div>
    </div>
  </section>
</div>`
  };
}

function about() {
  return {
    title: 'О компании — агентство недвижимости «Мера»',
    desc: 'Небольшое агентство недвижимости в Москве, Петербурге и Сочи. Публикуем только объекты, в которых побывали сами, и называем комиссию до первого просмотра.',
    html: `<div class="page wrap">
  ${crumbs([['Главная', '#/'], ['О компании']])}
  <header class="page-head"><h1>Мы небольшое агентство и хотим им остаться</h1><p class="lead">Четырнадцать агентов в трёх городах. Каждый ведёт не больше восьми объектов одновременно — иначе не успеть их как следует узнать.</p></header>
</div>
<figure class="wide-ph reveal">${pic('1600563438938-a9a27216b4f5', 'Дом, проданный агентством', { w: 1800, sizes: '100vw' })}</figure>
<div class="wrap">
  <section class="principles">
    <div class="reveal"><h3>Не публикуем то, где не были</h3><p>Агент приезжает на объект, смотрит подъезд, соседей, шум в будний вечер. Если что-то не так, это будет в описании — или объекта не будет в каталоге.</p></div>
    <div class="reveal"><h3>Цена в каталоге — согласованная</h3><p>Не ставим цену «для звонков». В каталоге та сумма, о которой мы договорились с собственником, и мы знаем, есть ли у неё запас.</p></div>
    <div class="reveal"><h3>Комиссию называем сразу</h3><p>До первого просмотра вы знаете, сколько и кому платите. Покупателю наш подбор бесплатен, если комиссию платит продавец.</p></div>
    <div class="reveal"><h3>Документы смотрит юрист</h3><p>Не агент, а штатный юрист: история собственников, обременения, перепланировки. Отчёт остаётся у вас, даже если сделка не состоится.</p></div>
  </section>
</div>
${numbers()}
<div class="wrap"><section class="offices-mini">
  <h2 class="reveal">Офисы</h2>
  <ul>${OFFICES.map(([cty, a]) => `<li class="reveal"><b>${cty}</b><span>${a}</span></li>`).join('')}</ul>
  <a class="link" href="#/kontakty">Контакты и карта ${I.arrow}</a>
</section></div>`
  };
}

function contacts() {
  return {
    title: 'Контакты — агентство недвижимости «Мера»',
    desc: 'Офисы агентства «Мера» в Москве, Санкт-Петербурге и Сочи. Телефон, мессенджеры, адреса и часы работы.',
    html: `<div class="page wrap">
  ${crumbs([['Главная', '#/'], ['Контакты']])}
  <header class="page-head"><h1>Контакты</h1><p class="lead">Каждый день с 9 до 21. Звоните, пишите в мессенджер или приезжайте в офис — кофе есть.</p></header>
  <div class="contacts">
    <div class="ct-info">
      <a class="ct-phone" href="tel:+74950000000">+7 495 000-00-00</a>
      <a class="ct-mail" href="mailto:hello@mera.example">hello@mera.example</a>
      <div class="msgs">${msgs()}</div>
      <ul class="offices" role="list">${OFFICES.map(([cty, a], i) => `<li><button class="office${i ? '' : ' on'}" type="button" data-office="${i}"><b>${cty}</b><span>${a}</span></button></li>`).join('')}</ul>
    </div>
    <div id="ct-map" class="ct-map">${mapBox(OFFICES[0][2], 16, 'Офис на карте', ' map-tall')}</div>
  </div>
  <section class="cta cta-inline">
    <div class="cta-in">
      <div class="cta-text"><h2>Оставьте телефон</h2><p>Агент перезвонит в течение 15 минут в рабочее время. Вечером и ночью — утром, до 10.</p></div>
      <div class="cta-form">${leadForm({ topic: 'Контакты' })}</div>
    </div>
  </section>
</div>`,
    after: () => {
      $('.ct-info').addEventListener('click', e => {
        const b = e.target.closest('[data-office]'); if (!b) return;
        $$('.office').forEach(x => x.classList.toggle('on', x === b));
        $('#ct-map').innerHTML = mapBox(OFFICES[+b.dataset.office][2], 16, 'Офис на карте', ' map-tall');
      });
    }
  };
}

function notFound() {
  return {
    title: 'Страница не найдена — Мера',
    desc: 'Такой страницы нет.',
    html: `<div class="page wrap nf"><h1>Такой страницы нет</h1><p class="lead">Возможно, объект уже продан и снят с публикации.</p><a class="btn btn-dark" href="#/katalog">Открыть каталог</a></div>`
  };
}

/* ================= АДМИНКА (демо Payload CMS) ================= */
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = s => s.toLowerCase().split('').map(ch => TR[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const EV = { page_view: 'Просмотр страницы', object_view: 'Просмотр объекта', lead_open: 'Открыта форма заявки', lead_submit: 'Заявка отправлена', fav_add: 'Добавлено в избранное', fav_remove: 'Убрано из избранного', msg_click: 'Переход в мессенджер', gallery_open: 'Открыта галерея', filter: 'Фильтр каталога', search: 'Поиск с главной', admin_publish: 'Объект опубликован', admin_save: 'Объект сохранён' };

function admin(sub, arg) {
  let v;
  if (!sub) v = admList();
  else if (sub === 'novyj') v = admForm(null);
  else if (sub === 'obekt' && bySlug(arg)) v = admForm(bySlug(arg));
  else if (sub === 'zayavki') v = admLeads();
  else if (sub === 'seo') v = admSeo();
  else if (sub === 'analitika') v = admStats();
  else v = { html: '<p>Раздел не найден.</p>' };
  const on = k => (k === (sub || '') || (k === '' && (sub === 'novyj' || sub === 'obekt'))) ? ' class="on"' : '';
  return {
    title: 'Панель управления — Мера',
    desc: 'Панель управления сайтом агентства.',
    html: `<div class="adm">
  <aside class="adm-side">
    <a class="adm-logo" href="#/admin">Мера<span>Payload CMS</span></a>
    <nav class="adm-nav" aria-label="Разделы панели">
      <p>Коллекции</p>
      <a href="#/admin"${on('')}>Объекты<span>${OBJECTS.length}</span></a>
      <a href="#/admin/zayavki"${on('zayavki')}>Заявки<span>${LEADS.length}</span></a>
      <p>Сайт</p>
      <a href="#/admin/seo"${on('seo')}>SEO и sitemap</a>
      <a href="#/admin/analitika"${on('analitika')}>Аналитика</a>
    </nav>
    <a class="adm-site" href="#/">← На сайт</a>
  </aside>
  <div class="adm-main">
    <p class="adm-note">Так будет выглядеть админка Payload CMS. Здесь демо в браузере: изменения сразу видны на сайте и живут до перезагрузки страницы.</p>
    ${v.html}
  </div>
</div>`,
    after: v.after
  };
}

function admList() {
  const rows = [...OBJECTS].sort((a, b) => (b.updated || b.added).toString().localeCompare((a.updated || a.added).toString()));
  return {
    html: `<div class="adm-head"><h1>Объекты</h1><a class="btn btn-dark btn-sm" href="#/admin/novyj">Создать объект</a></div>
  <div class="adm-tools"><input type="search" id="adm-q" placeholder="Поиск по названию или адресу" aria-label="Поиск объектов"></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th><span class="sr">Фото</span></th><th>Название</th><th>Город</th><th class="hide-m">Тип</th><th class="r">Цена</th><th class="r hide-m">Площадь</th><th>Статус</th><th class="hide-m">Изменён</th></tr></thead>
    <tbody>${rows.map(o => `<tr data-q="${esc((o.title + ' ' + o.address + ' ' + o.district).toLowerCase())}">
      <td class="t-ph">${pic(o.photos[0], '', { w: 160, sizes: '64px' })}</td>
      <td><a href="#/admin/obekt/${o.slug}">${esc(o.title)}</a><small>/obekt/${o.slug}</small></td>
      <td>${CITIES[o.city].short}</td><td class="hide-m">${TYPES[o.type].one}</td>
      <td class="r">${mln(o.price)}</td><td class="r hide-m">${num(o.area, 0)} м²</td>
      <td><span class="st${o.status === 'draft' ? ' st-draft' : ''}">${o.status === 'draft' ? 'Черновик' : 'Опубликован'}</span></td>
      <td class="hide-m">${o.updated ? 'только что' : new Date(o.added).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</td>
    </tr>`).join('')}</tbody>
  </table></div>`,
    after: () => {
      $('#adm-q').addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        $$('.tbl tbody tr').forEach(tr => { tr.hidden = q && !tr.dataset.q.includes(q); });
      });
      $('.tbl tbody').addEventListener('click', e => {
        const tr = e.target.closest('tr');
        if (tr && !e.target.closest('a')) location.hash = $('a', tr).getAttribute('href');
      });
    }
  };
}

function admForm(o) {
  const v = o || { city: 'moskva', type: 'kvartira', features: [], photos: [], text: [] };
  const fld = (name, label, val = '', attrs = '') => `<label class="af"><span>${label}</span><input name="${name}" value="${esc(val)}" ${attrs}></label>`;
  return {
    html: `<form class="adm-form" id="adm-form" novalidate>
  <div class="adm-head">
    <div><a class="adm-back" href="#/admin">← Объекты</a><h1>${o ? esc(o.title) : 'Новый объект'}</h1></div>
    <div class="adm-actions">
      <button class="btn btn-line btn-sm" type="submit" value="draft">Сохранить черновик</button>
      <button class="btn btn-dark btn-sm" type="submit" value="pub">${o && o.status !== 'draft' ? 'Сохранить и опубликовать' : 'Опубликовать'}</button>
    </div>
  </div>
  <div class="adm-cols">
    <div class="adm-fields">
      <fieldset><legend>Основное</legend>
        ${fld('title', 'Название *', v.title, 'required placeholder="Например: Квартира на Покровке"')}
        <div class="af-row">
          <label class="af"><span>Город</span><select name="city">${Object.entries(CITIES).map(([k, c]) => `<option value="${k}"${v.city === k ? ' selected' : ''}>${c.name}</option>`).join('')}</select></label>
          <label class="af"><span>Тип</span><select name="type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${v.type === k ? ' selected' : ''}>${t.one}</option>`).join('')}</select></label>
        </div>
        <div class="af-row">${fld('district', 'Район', v.district)}${fld('address', 'Адрес', v.address)}</div>
        <div class="af-row af-row4">
          ${fld('price', 'Цена, ₽ *', v.price ? nf.format(v.price) : '', 'inputmode="numeric" required')}
          ${fld('area', 'Площадь, м² *', v.area || '', 'inputmode="decimal" required')}
          ${fld('rooms', 'Комнаты', v.rooms || '', 'inputmode="numeric"')}
          ${fld('floor', 'Этаж', v.floor)}
        </div>
        <label class="af"><span>Описание <i>— абзацы через пустую строку</i></span><textarea name="text" rows="6">${esc((v.text || []).join('\n\n'))}</textarea></label>
      </fieldset>
      <fieldset><legend>Характеристики</legend>
        <div class="af-row">${fld('year', 'Год постройки', v.year)}${fld('ceiling', 'Потолки', v.ceiling)}</div>
        <div class="af-row">${fld('view', 'Вид из окон', v.view)}${fld('parking', 'Парковка', v.parking)}</div>
        <div class="af-row">${fld('land', 'Участок', v.land, 'placeholder="Для домов, например 12 соток"')}${fld('near', 'Метро или дорога', v.near)}</div>
        <div class="pills">${Object.entries(FEATURES).map(([k, t]) => `<label class="pill"><input type="checkbox" name="features" value="${k}"${v.features.includes(k) ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div>
      </fieldset>
      <fieldset><legend>Фотографии *</legend>
        <label class="drop" id="drop"><input type="file" id="adm-files" accept="image/*" multiple><span>Перетащите фото сюда или <u>выберите файлы</u></span><small>Первое фото — обложка в каталоге. Нажмите на фото, чтобы сделать его обложкой.</small></label>
        <div class="thumbs" id="thumbs"></div>
        <details class="media"><summary>Выбрать из медиатеки</summary><div class="media-grid">${MEDIA.map(m => `<button type="button" data-media="${m}" aria-label="Добавить фото из медиатеки">${pic(m, '', { w: 320, sizes: '120px' })}</button>`).join('')}</div></details>
      </fieldset>
      <fieldset><legend>Точка на карте</legend>
        <p class="hint">Нажмите на карту, чтобы поставить метку. Карта открывается на выбранном городе.</p>
        <div class="pick" id="pick"><img id="pick-img" alt="Карта для выбора точки" width="650" height="400"><span class="pick-pin" id="pick-pin" aria-hidden="true"></span></div>
        <p class="coords" id="coords"></p>
      </fieldset>
    </div>
    <aside class="adm-aside">
      <div class="adm-box"><h3>Адрес страницы</h3><p class="slug">/obekt/<b id="slug-view">${o ? o.slug : '…'}</b></p><small>Собирается из названия латиницей</small></div>
      <div class="adm-box"><h3>Как увидят в поиске</h3>
        <label class="af"><span>Title</span><input name="seoTitle" value="${esc(v.seoTitle || '')}"></label>
        <label class="af"><span>Description</span><textarea name="seoDesc" rows="3">${esc(v.seoDesc || '')}</textarea></label>
        <div class="snippet"><b id="sn-t"></b><span id="sn-u"></span><p id="sn-d"></p></div>
      </div>
      <div class="adm-box"><h3>Статус</h3><p>${o ? (o.status === 'draft' ? 'Черновик' : 'Опубликован') : 'Ещё не сохранён'}</p>${o && o.status !== 'draft' ? `<a class="link" href="#/obekt/${o.slug}">Открыть на сайте ${I.arrow}</a>` : ''}</div>
    </aside>
  </div>
</form>`,
    after: () => bindAdmForm(o)
  };
}

function bindAdmForm(o) {
  const f = $('#adm-form'), el = f.elements;
  const photos = o ? [...o.photos] : [];
  let point = o ? [...o.coords] : null;
  let center = o ? [...o.coords] : [...CITIES[el.city.value].coords];
  const Z = 13, W = 650, H = 400;
  const seoDirty = { seoTitle: !!(o && o.seoTitle), seoDesc: !!(o && o.seoDesc) };

  const drawThumbs = () => {
    $('#thumbs').innerHTML = photos.map((p, i) => `<div class="thumb${i ? '' : ' cover'}"><button type="button" class="thumb-img" data-cover="${i}" aria-label="Сделать обложкой">${pic(p, '', { w: 320, sizes: '140px' })}</button>${i ? '' : '<span>Обложка</span>'}<button type="button" class="thumb-x" data-rm="${i}" aria-label="Удалить фото">${I.close}</button></div>`).join('');
  };
  const addFiles = files => { [...files].filter(x => x.type.startsWith('image/')).forEach(x => photos.push(URL.createObjectURL(x))); drawThumbs(); };
  const mapSrc = () => `https://static-maps.yandex.ru/1.x/?ll=${center[0]},${center[1]}&z=${Z}&size=${W},${H}&l=map&lang=ru_RU`;
  const drawPin = (x = 50, y = 50) => {
    const pin = $('#pick-pin');
    pin.hidden = !point; pin.style.left = `${x}%`; pin.style.top = `${y}%`;
    $('#coords').textContent = point ? `Широта ${point[1].toFixed(5)}, долгота ${point[0].toFixed(5)}` : 'Метка не поставлена — возьмём центр города.';
  };
  const parsePrice = () => +el.price.value.replace(/\D/g, '');
  const autoSeo = () => {
    const t = el.title.value.trim() || 'Новый объект', c = CITIES[el.city.value], a = el.area.value.trim();
    const seoT = `${t}${a ? `, ${a} м²` : ''} — купить ${c.in} | Мера`;
    const seoD = `${t}${el.address.value ? `: ${el.address.value}` : ''}${a ? `, ${a} м²` : ''}${parsePrice() ? `. Цена ${rub(parsePrice())}` : ''}. Фото, характеристики и расположение на карте.`;
    if (!seoDirty.seoTitle) el.seoTitle.value = seoT;
    if (!seoDirty.seoDesc) el.seoDesc.value = seoD;
    const slug = o ? o.slug : (slugify(t) || 'novyj-obekt');
    $('#slug-view').textContent = slug;
    $('#sn-t').textContent = el.seoTitle.value;
    $('#sn-u').textContent = `mera.ru › obekt › ${slug}`;
    $('#sn-d').textContent = el.seoDesc.value;
  };

  drawThumbs();
  $('#pick-img').src = mapSrc();
  drawPin();
  autoSeo();

  f.addEventListener('input', e => {
    const n = e.target.name;
    if (n === 'seoTitle' || n === 'seoDesc') seoDirty[n] = true;
    if (n === 'price') { const p = parsePrice(); e.target.value = p ? nf.format(p) : ''; }
    e.target.closest('.af')?.classList.remove('bad');
    autoSeo();
  });
  f.addEventListener('change', e => {
    if (e.target.name === 'city') { center = [...CITIES[el.city.value].coords]; point = null; $('#pick-img').src = mapSrc(); drawPin(); }
  });
  $('#adm-files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('#drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
  f.addEventListener('click', e => {
    const m = e.target.closest('[data-media]'), rm = e.target.closest('[data-rm]'), cv = e.target.closest('[data-cover]');
    if (m) { if (!photos.includes(m.dataset.media)) photos.push(m.dataset.media); drawThumbs(); $('.drop').classList.remove('bad'); }
    if (rm) { photos.splice(+rm.dataset.rm, 1); drawThumbs(); }
    if (cv && +cv.dataset.cover) { photos.unshift(...photos.splice(+cv.dataset.cover, 1)); drawThumbs(); }
  });
  $('#pick-img').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const scale = 256 * 2 ** Z; // пикселей на весь мир при этом масштабе
    point = [center[0] + (fx - 0.5) * W / scale * 360, center[1] - (fy - 0.5) * H / scale * 360 * Math.cos(center[1] * Math.PI / 180)];
    drawPin(fx * 100, fy * 100);
  });

  f.addEventListener('submit', e => {
    e.preventDefault();
    const act = e.submitter ? e.submitter.value : 'pub';
    const price = parsePrice(), area = parseFloat(el.area.value.replace(',', '.'));
    const bad = [];
    if (el.title.value.trim().length < 3) bad.push(el.title);
    if (!price) bad.push(el.price);
    if (!(area > 0)) bad.push(el.area);
    bad.forEach(i => i.closest('.af').classList.add('bad'));
    $('.drop').classList.toggle('bad', !photos.length);
    if (bad.length || !photos.length) {
      toast(!photos.length && !bad.length ? 'Добавьте хотя бы одно фото' : 'Заполните отмеченные поля');
      (bad[0] || $('#drop')).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const data = {
      title: el.title.value.trim(), city: el.city.value, type: el.type.value,
      district: el.district.value.trim() || CITIES[el.city.value].short, address: el.address.value.trim() || '—',
      price, area, rooms: el.type.value === 'kommerciya' ? null : (parseInt(el.rooms.value, 10) || null),
      floor: el.floor.value.trim() || '—', year: el.year.value.trim(), ceiling: el.ceiling.value.trim(),
      view: el.view.value.trim(), parking: el.parking.value.trim(), land: el.land.value.trim(), near: el.near.value.trim(),
      finish: $$('input[name="features"]:checked', f).some(i => i.value === 'otdelka') ? 'С отделкой' : 'Без отделки',
      features: $$('input[name="features"]:checked', f).map(i => i.value),
      text: el.text.value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
      photos: [...photos], coords: point || [...CITIES[el.city.value].coords],
      seoTitle: seoDirty.seoTitle ? el.seoTitle.value.trim() : '', seoDesc: seoDirty.seoDesc ? el.seoDesc.value.trim() : '',
      status: act === 'draft' ? 'draft' : 'published', updated: new Date().toISOString()
    };
    if (!data.text.length) data.text = ['Описание готовит агент.'];
    let slug;
    if (o) { Object.assign(o, data); slug = o.slug; }
    else {
      slug = slugify(data.title) || 'obekt';
      let s = slug, k = 2;
      while (bySlug(s)) s = `${slug}-${k++}`;
      slug = s;
      OBJECTS.unshift({ slug, added: today(), ...data });
    }
    track(act === 'draft' ? 'admin_save' : 'admin_publish', { slug });
    location.hash = '#/admin';
    toast(act === 'draft' ? 'Черновик сохранён' : 'Объект опубликован и уже есть в каталоге', act === 'draft' ? '' : `#/obekt/${slug}`, 'Открыть на сайте');
  });
}

function admLeads() {
  return {
    html: `<div class="adm-head"><h1>Заявки</h1></div>
  ${LEADS.length ? `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Время</th><th>Имя</th><th>Телефон</th><th>Откуда</th><th>Комментарий</th></tr></thead>
    <tbody>${LEADS.map(l => `<tr><td>${l.t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</td><td>${esc(l.name)}</td><td class="nw">${esc(l.phone)}</td><td>${esc(l.topic)}${l.obj && bySlug(l.obj) ? `<small><a href="#/obekt/${l.obj}">${esc(bySlug(l.obj).title)}</a></small>` : ''}</td><td>${esc(l.msg)}</td></tr>`).join('')}</tbody>
  </table></div>` : '<div class="adm-empty"><p>В этой вкладке заявок пока нет.</p><p>Отправьте любую форму на сайте — она появится здесь. В рабочей версии заявка ещё приходит агенту в Telegram и на почту.</p><a class="btn btn-line btn-sm" href="#/obekt/kvartira-na-ostozhenke-12">Открыть объект и записаться</a></div>'}`
  };
}

function sitemapUrls() {
  const base = 'https://mera.ru';
  const urls = [['/', today()], ['/katalog', today()], ['/uslugi', '2026-09-01'], ['/o-kompanii', '2026-09-01'], ['/kontakty', '2026-09-01']];
  Object.keys(CITIES).forEach(c => {
    urls.push([`/${c}`, today()]);
    Object.entries(TYPES).forEach(([k, t]) => { if (pub().some(o => o.city === c && o.type === k)) urls.push([`/${c}/${t.slug}`, today()]); });
  });
  pub().forEach(o => urls.push([`/obekt/${o.slug}`, (o.updated || o.added).slice(0, 10)]));
  return urls.map(([u, d]) => [base + u, d]);
}
function admSeo() {
  const urls = sitemapUrls();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>`;
  return {
    html: `<div class="adm-head"><h1>SEO и sitemap</h1></div>
  <div class="adm-grid">
    <div class="adm-box"><h3>sitemap.xml · ${urls.length} адресов</h3><p class="hint">Собирается сам при каждой публикации. На рабочем сайте адреса без решётки — как здесь.</p><pre class="code">${esc(xml)}</pre></div>
    <div>
      <div class="adm-box"><h3>robots.txt</h3><pre class="code">User-agent: *\nDisallow: /admin\nSitemap: https://mera.ru/sitemap.xml</pre></div>
      <div class="adm-box"><h3>Что ещё настроено</h3><ul class="adm-ul">
        <li>Человекопонятные адреса: /moskva/kvartiry, /obekt/kvartira-na-ostozhenke-12</li>
        <li>Свой title и description у каждой страницы — видно во вкладке браузера</li>
        <li>Страницы под города и категории с вводным текстом</li>
        <li>Open Graph для красивых ссылок в мессенджерах</li>
        <li>Разметка schema.org для агентства</li>
      </ul></div>
    </div>
  </div>`
  };
}
function admStats() {
  const cnt = n => EVENTS.filter(e => e.name === n).length;
  const views = {};
  EVENTS.filter(e => e.name === 'object_view').forEach(e => { views[e.data.slug] = (views[e.data.slug] || 0) + 1; });
  const top = Object.entries(views).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    html: `<div class="adm-head"><h1>Аналитика</h1></div>
  <p class="hint">Считается по этой вкладке. В рабочей версии те же события уходят целями в Яндекс Метрику.</p>
  <div class="kpis">
    ${[['Просмотров страниц', cnt('page_view')], ['Просмотров объектов', cnt('object_view')], ['Заявок', cnt('lead_submit')], ['Переходов в мессенджеры', cnt('msg_click')], ['Добавлений в избранное', cnt('fav_add')]].map(([t, n]) => `<div class="kpi"><b>${n}</b><span>${t}</span></div>`).join('')}
  </div>
  <div class="adm-grid">
    <div class="adm-box"><h3>Какие объекты смотрят</h3>${top.length ? `<ul class="adm-ul">${top.map(([s, n]) => `<li><a href="#/obekt/${s}">${esc(bySlug(s)?.title || s)}</a> — ${n}</li>`).join('')}</ul>` : '<p class="hint">Откройте пару объектов на сайте.</p>'}</div>
    <div class="adm-box"><h3>Последние события</h3><ul class="adm-ul ev">${EVENTS.slice(-14).reverse().map(e => `<li><time>${e.t.toLocaleTimeString('ru-RU')}</time>${EV[e.name] || e.name}${e.data.path ? ` <small>${esc(e.data.path)}</small>` : ''}${e.data.slug ? ` <small>${esc(e.data.slug)}</small>` : ''}</li>`).join('')}</ul></div>
  </div>`
  };
}

/* ================= ЗАЯВКИ ================= */
const leadModal = $('#lead-modal');
function openLead(topic, slug, note = '') {
  const o = slug && bySlug(slug);
  $('#lead-body').innerHTML = o
    ? leadForm({ topic, o, title: 'Запись на просмотр', sub: `${esc(o.title)}, ${esc(o.address)}. Агент перезвонит и предложит время.` })
    : leadForm({ topic, title: 'Подбор объекта', sub: 'Расскажите, что ищете, — агент перезвонит в течение 15 минут в рабочее время.', note });
  if (typeof leadModal.showModal === 'function') leadModal.showModal(); else leadModal.setAttribute('open', '');
  track('lead_open', { topic });
}
leadModal.addEventListener('click', e => { if (e.target === leadModal || e.target.closest('[data-close]')) leadModal.close(); });

const phoneDigits = v => {
  let d = v.replace(/\D/g, '');
  if (/^\s*\+7/.test(v) || (d.length === 11 && /^[78]/.test(d))) d = d.slice(1);
  if (d.length === 11 && d[0] === '8') d = d.slice(1); // набрали 8 после +7
  return d.slice(0, 10);
};
function fmtPhone(v) {
  const d = phoneDigits(v);
  let s = `+7 (${d.slice(0, 3)}`;
  if (d.length > 3) s += `) ${d.slice(3, 6)}`;
  if (d.length > 6) s += `-${d.slice(6, 8)}`;
  if (d.length > 8) s += `-${d.slice(8, 10)}`;
  return s;
}
document.addEventListener('focusin', e => { if (e.target.name === 'phone' && e.target.closest('[data-leadform]') && !e.target.value) e.target.value = '+7 ('; });
document.addEventListener('focusout', e => { if (e.target.name === 'phone' && e.target.closest('[data-leadform]') && !phoneDigits(e.target.value)) e.target.value = ''; });
document.addEventListener('input', e => {
  const t = e.target;
  if (!t.closest('[data-leadform]')) return;
  if (t.name === 'phone' && e.inputType !== 'deleteContentBackward') t.value = fmtPhone(t.value);
  setErr(t, '');
});
function setErr(input, msg) {
  const box = input.closest('.field, .agree');
  if (!box) return;
  box.classList.toggle('bad', !!msg);
  let em = $('.err', box);
  if (msg && !em) { em = document.createElement('em'); em.className = 'err'; box.append(em); }
  if (em) em.textContent = msg || '';
  input.setAttribute('aria-invalid', !!msg);
}
document.addEventListener('submit', e => {
  const f = e.target;
  if (!f.matches('[data-leadform]')) return;
  e.preventDefault();
  const el = f.elements, name = el.name.value.trim(), d = phoneDigits(el.phone.value);
  const errs = [
    [el.name, name.length < 2 ? 'Как к вам обращаться?' : ''],
    [el.phone, d.length !== 10 ? 'Нужен номер из 10 цифр после +7' : ''],
    [el.ok, !el.ok.checked ? 'Без согласия не сможем перезвонить' : '']
  ];
  errs.forEach(([i, m]) => setErr(i, m));
  const bad = errs.find(([, m]) => m);
  if (bad) { bad[0].focus(); return; }
  const phone = fmtPhone(`+7${d}`);
  LEADS.unshift({ t: new Date(), name, phone, topic: f.dataset.topic, obj: f.dataset.obj, msg: el.msg ? el.msg.value.trim() : '' });
  track('lead_submit', { topic: f.dataset.topic, slug: f.dataset.obj });
  const o = f.dataset.obj && bySlug(f.dataset.obj);
  const done = document.createElement('div');
  done.className = 'lead-done';
  done.tabIndex = -1;
  done.innerHTML = `<h3>${o ? 'Вы записаны' : 'Заявка принята'}</h3>
    <p>${esc(name)}, агент перезвонит на ${esc(phone)} в течение 15 минут${o ? ` и предложит время просмотра: ${esc(el.msg.value.toLowerCase())}` : ''}. Если удобнее переписываться — напишите нам:</p>
    <div class="msgs">${msgs()}</div>`;
  f.replaceWith(done);
  done.focus();
});

/* ================= ОБЩЕЕ ================= */
let toastT;
function toast(msg, href, linkText) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${href ? `<a href="${href}">${linkText}</a>` : ''}`;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 3600);
}

function syncFavs() {
  $$('[data-fav]').forEach(b => {
    const on = favs.includes(b.dataset.fav);
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'Убрать из избранного' : 'Добавить в избранное');
    const sp = $('span', b); if (sp) sp.textContent = on ? 'В избранном' : 'В избранное';
  });
  const n = favs.filter(bySlug).length, c = $('.fav-count');
  c.hidden = !n; c.textContent = n;
}
function toggleFav(slug) {
  const i = favs.indexOf(slug);
  if (i < 0) favs.push(slug); else favs.splice(i, 1);
  store.set('mera-fav', favs);
  track(i < 0 ? 'fav_add' : 'fav_remove', { slug });
  syncFavs();
  if (route().path[0] === 'izbrannoe') render();
  else if (i < 0) toast('Добавлено в избранное', '#/izbrannoe', 'Открыть');
}

const io = 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches
  ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 })
  : null;
function reveal(root = document) { $$('.reveal:not(.in)', root).forEach(el => io ? io.observe(el) : el.classList.add('in')); }

const header = $('#header');
function onScroll() { header.classList.toggle('solid', !document.body.classList.contains('is-home') || scrollY > 40 || document.body.classList.contains('menu-open')); }
addEventListener('scroll', onScroll, { passive: true });

function setMenu(open) {
  $('#mmenu').hidden = !open;
  document.body.classList.toggle('menu-open', open);
  $('.burger').setAttribute('aria-expanded', open);
  onScroll();
}
const setSheet = open => document.body.classList.toggle('sheet-open', open);

document.addEventListener('click', e => {
  const t = e.target.closest('[data-fav],[data-lead],[data-open],[data-lb],[data-msg],[data-sheet],.burger');
  if (!t) return;
  if (t.dataset.fav) { e.preventDefault(); toggleFav(t.dataset.fav); }
  else if (t.dataset.lead) {
    const note = t.hasAttribute('data-favnote') ? `Хочу обсудить: ${favs.map(bySlug).filter(Boolean).map(o => o.title).join('; ')}` : '';
    openLead(t.dataset.lead, t.dataset.obj, note);
  }
  else if (t.dataset.open) { const o = bySlug(route().path[1]); if (o) openLb(o.photos, +t.dataset.open); }
  else if (t.dataset.lb) ({ close: closeLb, prev: () => stepLb(-1), next: () => stepLb(1) })[t.dataset.lb]();
  else if (t.dataset.msg) track('msg_click', { via: t.dataset.msg });
  else if (t.dataset.sheet) setSheet(t.dataset.sheet === 'open');
  else if (t.classList.contains('burger')) setMenu(!document.body.classList.contains('menu-open'));
});
document.addEventListener('keydown', e => {
  if (!lbEl.hidden) {
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') stepLb(-1);
    if (e.key === 'ArrowRight') stepLb(1);
  } else if (e.key === 'Escape') { setMenu(false); setSheet(false); }
});

/* ================= РОУТЕР ================= */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(q) };
}
let lastKey = null;
function render() {
  const { path, q } = route();
  const [a, b, c] = path;
  const key = path.join('/');
  let v = null;
  if (!a) v = home();
  else if (a === 'katalog' && !b) v = catalog(q);
  else if (a === 'obekt') v = objectPage(b);
  else if (a === 'izbrannoe') v = favPage();
  else if (a === 'uslugi') v = services();
  else if (a === 'o-kompanii') v = about();
  else if (a === 'kontakty') v = contacts();
  else if (a === 'admin') v = admin(b, c);
  else if (CITIES[a] && !c && (!b || typeBySlug(b))) v = seoPage(a, b && typeBySlug(b));
  v = v || notFound();

  document.body.classList.toggle('is-home', !a);
  document.body.classList.toggle('is-admin', a === 'admin');
  setSheet(false); setMenu(false); closeLb();
  if (leadModal.open) leadModal.close();
  app.innerHTML = v.html;
  document.title = v.title;
  [['meta[name="description"]', v.desc], ['meta[property="og:title"]', v.title], ['meta[property="og:description"]', v.desc]]
    .forEach(([s, val]) => $(s).setAttribute('content', val));
  $$('[data-nav]').forEach(l => l.classList.toggle('on', l.dataset.nav === a || (l.dataset.nav === 'katalog' && (a === 'obekt' || !!CITIES[a]))));
  const cta = $('#mbar-cta');
  if (v.obj) { cta.textContent = 'Записаться на просмотр'; cta.dataset.lead = 'Просмотр'; cta.dataset.obj = v.obj.slug; }
  else { cta.textContent = 'Подобрать объект'; cta.dataset.lead = 'Подбор объекта'; delete cta.dataset.obj; }
  if (key !== lastKey) {
    if (lastKey !== null) { window.scrollTo(0, 0); app.focus({ preventScroll: true }); }
    track('page_view', { path: `/${key}` });
  }
  lastKey = key;
  if (v.after) v.after();
  syncFavs();
  reveal();
  onScroll();
}

$$('[data-msgs]').forEach(el => { el.innerHTML = msgs(); });
addEventListener('hashchange', render);
render();
})();
