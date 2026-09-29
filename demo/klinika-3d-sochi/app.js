// Страница целиком из JSON в <script id="klinika">. Чего нет в данных — нейтральная заглушка, без выдумок.
(() => {
  const d = JSON.parse(document.getElementById('dannye-kliniki').textContent);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const хост = d.domen || (d.sajt ? new URL(d.sajt).hostname.replace(/^www\./, '') : '');
  if (/официальн[а-яё]* сайт/i.test(d.opisanie)) d.opisanie = '';  // спорит с плашкой «не официальный сайт»
  const коротко = (t, n) => t.length > n ? t.slice(0, t.lastIndexOf(' ', n)).replace(/[,.;:—–-]+$/, '') + '…' : t;

  if (d.akcent) document.documentElement.style.setProperty('--brand', d.akcent);
  if (d.akcent2) document.documentElement.style.setProperty('--brand2', d.akcent2);

  const тексты = {
    nazvanie: d.nazvanie,
    metka: 'Стоматология' + (d.gorod ? ' · ' + d.gorod : ''),
    zag: d.h1 && d.h1.length <= 64 ? d.h1 : d.nazvanie,
    lid: d.opisanie ? коротко(d.opisanie, 170) : 'Запись к врачу за минуту: оставьте телефон, администратор перезвонит и подберёт удобное время.',
    uslugi_pod: d.uslugi.length >= 4 ? 'По одной позиции из каждого раздела прайса ' + (хост || 'клиники') + '. Полный прайс — по ссылке ниже.'
      : d.uslugi.length ? 'Строки с ценой — с ' + хост + ', серые — место под ваш прайс.' : 'Здесь будут ваши услуги с ценами «от» — из вашего прайса.',
    vrachi_pod: d.vrachi.length ? 'Имена и фото — с сайта клиники.' : 'Здесь будут ваши врачи: фото, специализация, стаж.',
    foto_pod: d.foto.length > 1 ? 'Фото с сайта клиники.' : 'Здесь будут фото клиники или работы «до и после».',
    otzyvy_pod: d.otzyvy.length ? 'Отзывы с сайта клиники, без правок.' : 'Здесь будут ваши отзывы — с сайта, Яндекс Карт или ПроДокторов.',
    adres_tekst: d.adres ? d.adres + (d.adresov_esche ? ' · и ещё ' + d.adresov_esche + ' адр.' : '') : 'Адрес клиники',
    gorod_podval: d.gorod || 'стоматология',
  };
  for (const el of $$('[data-k]')) el.textContent = тексты[el.dataset.k] ?? '';

  // знак в шапке: логотип клиники или название набором
  const знак = $('.znak');
  if (d.logo) {
    const im = h('img', d.logo_svetlyj ? 'znak--svetlyj' : ''); im.src = d.logo; im.alt = d.nazvanie; знак.append(im);
    // знак без надписи (квадратный) — рядом имя набором
    im.addEventListener('load', () => { if (im.naturalWidth / im.naturalHeight < 1.6) знак.append(h('span', 'znak__slovo znak__slovo--ryadom', d.nazvanie)); });
  }
  else знак.append(h('span', 'znak__slovo', d.nazvanie));

  // телефон
  for (const a of $$('[data-tel]')) {
    if (d.telefon) { a.href = 'tel:' + d.telefon_href; a.textContent = d.telefon; } else { a.textContent = 'Телефон клиники'; a.removeAttribute('href'); }
  }
  const звонок = $('[data-tel-knopka]');
  if (d.telefon) звонок.href = 'tel:' + d.telefon_href; else звонок.href = '#kontakty';
  const сайт = $('[data-sajt]');
  if (d.sajt) { сайт.href = d.sajt; сайт.textContent = хост; } else сайт.textContent = '—';

  // факты под заголовком — только то, что есть в данных
  const факты = $('[data-fakty]');
  const факт = (k, v) => { const li = h('li'); li.append(h('span', 'fakt__k', k), h('span', 'fakt__v', v)); факты.append(li); };
  if (d.adres) факт('Адрес', коротко(d.adres, 48));
  if (d.telefon) факт('Запись', d.telefon);
  if (d.uslugi.length) факт('Цены', 'на сайте, до звонка');

  // фото на первом экране
  const фото = d.foto;  // порядок задаёт sobrat.py: первое — на первый экран
  const герой = $('[data-foto-geroj]');
  if (фото.length) {
    // до трёх кадров: медленный наплыв и смена наплывом каждые 4,5 с
    const кадры = h('div', 'kadry');
    фото.slice(0, 3).forEach((f, i) => { const im = h('img', i ? '' : 'aktiv'); im.src = f.fajl; im.alt = 'Клиника ' + d.nazvanie; if (!i) im.fetchPriority = 'high'; кадры.append(im); });
    герой.append(кадры);
    const все = $$('img', кадры);
    if (все.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let n = 0;
      setInterval(() => { все[n].classList.remove('aktiv'); n = (n + 1) % все.length; все[n].classList.add('aktiv'); }, 4500);
    }
  }
  else { герой.classList.add('pusto'); герой.append(h('span', 'pusto__tekst', 'Здесь будет фото вашей клиники')); }

  // выбор в форме
  const выбор = $('[data-vybor]');
  const пункты = d.uslugi.length ? d.uslugi.map(u => u.razdel) : ['Болит зуб', 'Осмотр и консультация', 'Чистка', 'Имплантация', 'Брекеты или элайнеры'];
  for (const t of ['Не знаю, нужна консультация', ...пункты]) выбор.append(h('option', null, t));

  // прайс
  const прайс = $('[data-prajs]');
  if (d.uslugi.length) {
    for (const u of d.uslugi) {
      const li = h('li', 'prajs__stroka');
      const лево = h('div', 'prajs__imya');
      лево.append(h('span', 'prajs__razdel', u.razdel), h('span', 'prajs__nazv', u.nazvanie));
      li.append(лево, h('span', 'prajs__cena', u.cena));
      прайс.append(li);
    }
  }
  if (d.uslugi.length < 4) {  // мало строк нашлось — добиваем честными заглушками до шести
    const есть = new Set(d.uslugi.map(u => u.razdel));
    for (const t of ['Консультация', 'Гигиена', 'Лечение кариеса', 'Имплантация', 'Коронки и виниры', 'Ортодонтия'].filter(t => !есть.has(t)).slice(0, 6 - d.uslugi.length)) {
      const li = h('li', 'prajs__stroka prajs__stroka--pusto');
      const лево = h('div', 'prajs__imya'); лево.append(h('span', 'prajs__razdel', t), h('span', 'prajs__nazv', 'позиция из вашего прайса'));
      li.append(лево, h('span', 'prajs__cena', 'от … ₽')); прайс.append(li);
    }
  }
  if (!d.uslugi.length) $('#uslugi .zag2').innerHTML = 'Услуги <em>и цены</em>';
  const ссылкаПрайс = $('[data-prajs-ssylka]');
  if (d.prajs_url) { ссылкаПрайс.href = d.prajs_url; ссылкаПрайс.textContent = 'Весь прайс на ' + хост + ' →'; } else ссылкаПрайс.remove();

  // врачи
  const врачи = $('[data-vrachi]');
  const список = d.vrachi.length ? d.vrachi : [{}, {}, {}];
  список.forEach((v, i) => {
    const к = h('article', 'vrach' + (v.imya ? '' : ' vrach--pusto'));
    const рамка = h('div', 'vrach__foto');
    if (v.foto) { const im = h('img'); im.src = v.foto; im.alt = v.imya; im.loading = 'lazy'; рамка.append(im); }
    else рамка.append(h('span', 'vrach__inic', v.imya ? v.imya.split(' ').slice(0, 2).map(x => x[0]).join('') : ''));
    к.append(рамка, h('h3', 'vrach__imya', v.imya || 'Врач клиники'), h('p', 'vrach__rol', v.rol || (v.imya ? 'Стоматолог' : 'Фото, специализация и стаж')));
    врачи.append(к);
  });

  // галерея: остальные фото
  const гал = $('[data-galereya]');
  const ещё = фото.slice(1, 6);
  if (ещё.length) {
    гал.dataset.n = ещё.length;
    for (const f of ещё) { const fig = h('figure'); const im = h('img'); im.src = f.fajl; im.alt = 'Клиника ' + d.nazvanie; im.loading = 'lazy'; fig.append(im); гал.append(fig); }
  } else {
    гал.dataset.n = 3;
    for (const t of ['Ресепшен', 'Кабинет', 'До и после']) { const fig = h('figure', 'pusto'); fig.append(h('span', 'pusto__tekst', t)); гал.append(fig); }
  }

  // отзывы: настоящие или честная заглушка
  const отз = $('[data-otzyvy]');
  if (d.otzyvy.length) {
    for (const o of d.otzyvy) { const q = h('blockquote', 'otzyv'); q.append(h('p', null, коротко(o.tekst, 420)), h('cite', null, 'отзыв с ' + (хост || 'сайта клиники'))); отз.append(q); }
  } else {
    for (let i = 0; i < 3; i++) { const q = h('blockquote', 'otzyv otzyv--pusto'); q.append(h('p', null, 'Здесь ваши отзывы'), h('cite', null, ['Яндекс Карты', 'ПроДокторов', '2ГИС'][i])); отз.append(q); }
  }

  // карта: OSM по точке из адреса + ссылка в Яндекс Карты (в рабочей версии — виджет Яндекса)
  const карта = $('[data-karta]');
  const полный = (d.gorod && !d.adres.includes(d.gorod) ? d.gorod + ', ' : '') + d.adres;
  if (d.karta && d.karta.length === 2) {
    const [ш, д] = d.karta, f = h('iframe');
    f.title = 'Карта: ' + d.adres; f.loading = 'lazy';
    f.src = `https://www.openstreetmap.org/export/embed.html?bbox=${д - .006},${ш - .003},${д + .006},${ш + .003}&layer=mapnik&marker=${ш},${д}`;
    карта.append(f);
  } else { карта.classList.add('pusto'); карта.append(h('span', 'pusto__tekst', 'Здесь будет карта с вашим адресом')); }
  if (d.adres) {
    const a = h('a', 'ssylka', 'Открыть в Яндекс Картах →');
    a.href = 'https://yandex.ru/maps/?text=' + encodeURIComponent(полный); a.target = '_blank'; a.rel = 'noopener';
    $('.rekvizity dd').after(a);
  }

  // форма-заглушка: честно говорит, что ничего не ушло
  $('#zapis').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget, ответ = $('[data-otvet]', f);
    if (!f.imya.value.trim() || f.tel.value.replace(/\D/g, '').length < 10) { ответ.textContent = 'Укажите имя и телефон — это демо, но проверку показываем как в жизни.'; ответ.classList.add('oshibka'); return; }
    ответ.classList.remove('oshibka');
    ответ.textContent = 'Готово — так увидит пациент. В концепте заявка никуда не ушла; в рабочей версии она придёт администратору в Telegram или CRM за секунды.';
    f.classList.add('otpravleno');
  });

  // шапка плотнее после прокрутки
  const шапка = $('.shapka');
  addEventListener('scroll', () => шапка.classList.toggle('prokrucheno', scrollY > 40), {passive: true});

  // движение: блоки проявляются при прокрутке, фото плывут медленнее страницы (только transform и opacity — 60 к/с)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // заголовки выходят по словам из-под маски
  let и = 0;
  const поСловам = (узел) => {
    for (const n of [...узел.childNodes]) {
      if (n.nodeType === 1 && n.tagName !== 'BR') { поСловам(n); continue; }
      if (n.nodeType !== 3) continue;
      const куски = document.createDocumentFragment();
      for (const ч of n.textContent.split(/(\s+)/)) {
        if (!ч) continue;
        if (/^\s+$/.test(ч)) { куски.append(' '); continue; }
        const маска = h('span', 'slovo'), слово = h('span', null, ч);
        слово.style.setProperty('--i', и++ % 14);
        маска.append(слово); куски.append(маска);
      }
      n.replaceWith(куски);
    }
  };
  $$('.geroj__zag, .geroj__lid, .zag2, .blok__pod, .prajs__nazv, .vrach__imya').forEach(el => { и = 0; поСловам(el); });
  requestAnimationFrame(() => requestAnimationFrame(() => $('.geroj__tekst').classList.add('vidno')));

  const цели =$$('.blok__golova, .prajs__stroka, .ssylka, .vrach, .galereya figure, .otzyv, .kontakty__tekst > :not(.knopka), .karta');
  цели.forEach(el => {
    el.classList.add('poyav');
    el.style.setProperty('--z', ([...el.parentElement.children].indexOf(el) % 6) * 80 + 'ms');
  });
  const глаз = new IntersectionObserver(записи => {
    for (const з of записи) if (з.isIntersecting) { з.target.classList.add('vidno'); глаз.unobserve(з.target); }
  }, {rootMargin: '0px 0px -8% 0px'});
  цели.forEach(el => глаз.observe(el));

  const плывут = [...$$('.galereya img'), ...$$('.vrach__foto img'), $('.kadry')].filter(Boolean);
  const сила = matchMedia('(max-width: 860px)').matches ? 0.05 : 0.09;
  let ждёт = false;
  const параллакс = () => {
    ждёт = false;
    for (const el of плывут) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -100 || r.top > innerHeight + 100) continue;
      const край = r.height * 0.06;  // запас кадра: фото увеличено на 14%, край не покажется
      el.style.setProperty('--py', Math.max(-край, Math.min(край, (r.top + r.height / 2 - innerHeight / 2) * -сила)).toFixed(1) + 'px');
    }
  };
  addEventListener('scroll', () => { if (!ждёт) { ждёт = true; requestAnimationFrame(параллакс); } }, {passive: true});
  параллакс();

  // мягкая прокрутка колесом (как у сайтов дня Awwwards): страница доплывает, а не прыгает. Тач не трогаем.
  if (matchMedia('(pointer: coarse)').matches) return;
  let цель = scrollY, плывёт = false;
  const шаг = () => {
    const y = scrollY + (цель - scrollY) * 0.1;
    if (Math.abs(цель - y) < 0.5) { scrollTo({top: цель, behavior: 'instant'}); плывёт = false; return; }
    scrollTo({top: y, behavior: 'instant'});
    requestAnimationFrame(шаг);
  };
  addEventListener('wheel', e => {
    if (e.ctrlKey || e.defaultPrevented) return;  // масштаб страницы — браузеру
    e.preventDefault();
    const низ = document.documentElement.scrollHeight - innerHeight;
    цель = Math.max(0, Math.min(низ, цель + e.deltaY * (e.deltaMode === 1 ? 40 : 1)));
    if (!плывёт) { плывёт = true; requestAnimationFrame(шаг); }
  }, {passive: false});
  addEventListener('scroll', () => { if (!плывёт) цель = scrollY; }, {passive: true});  // клавиши, якоря, ползунок
})();
