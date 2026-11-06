/* Показ шагами (rabota-77, 06.11; Артур: «слишком быстро, слишком непонятно… человек в возрасте успеет прочитать?»).
   Слева — телефон клиента с перепиской, справа — настоящая 1С (запись 1c/<имя>.mp4 + дорожка руки .json).
   Темп людской: Иван печатает 4,5 знака в секунду (замер рук Артура 20.10, konvjob/agent_tg2/agent.py), запись 1С идёт
   медленнее, чем снята; шаг стоит, пока медленный читатель не дочитает; дальше — само через 8 с или кнопкой.
   Данные — window.POKAZ[имя] = {kto, kanal, shagi: [{kr, zag, op, sob: [...]}]}; разметка — <div class="pokaz" data-pokaz="имя">.
   События: ['k', текст, время] — пишет клиент; ['k_pech', текст] — клиент набирает в поле ввода;
   ['ch', кто, текст, время] — пишет другой человек в группе; ['prochital'] — Иван прочитал (✓✓);
   ['dumaet', сек, подпись] — пауза перед ответом; ['i', текст, время, {polno}] — Иван печатает и отправляет;
   ['i_chern', текст, сек] — Иван начал печатать, но не отправил; ['ster', подпись] — черновик брошен;
   ['doc', имя, размер, время]; ['golos', сек, расшифровка, время]; ['foto', html, подпись, время]; ['krug', html, время];
   ['otvet', № сообщения в ленте, текст, время] — ответ на конкретное сообщение; ['pravka', текст] — Иван правит своё последнее;
   ['ruk', кто, текст, время] — с того же аккаунта пишет руководитель; ['ekran', текст] / ['ekran'] — телефон клиента погашен / включён;
   ['1c', имя, [[сек, подпись], ...], {ot, do, skor}] — Иван работает в 1С; ['zhdat', сек, подпись]; ['sejchas', подпись];
   ['i', текст, время, {knopki: ['да', 'нет', 'свой ответ']}] — под сообщением кнопки, как в Telegram; ['nazhal', кнопка, подпись] — её нажали;
   ['stroka', подпись] — в пояснении шага (s.poyasn) появляется следующая строка с классом skr (rabota-78). */
(() => {
const ZNAK_SEK = 4.5, CHITAET = 11, SKOR_1C = .7, DALSHE_SAMO = 8000, POTOLOK_PECHATI = 10;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const sek = n => Math.max(1, Math.round(n)) + ' с';
const SKLON = (n, a, b, c) => n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;

class Pokaz {
  constructor(el, d) {
    this.el = el; this.d = d; this.n = 0; this.tok = 0; this.avto = true; this.pauza = false; this.vidno = false; this.konec = false;
    this.ruka = {};
    el.classList.add('gotov');
    const chat = !d.bezchata, c1 = !d.bez1c;
    el.innerHTML = `
      <ol class="pk-put">${d.shagi.map((s, i) => `<li><button type="button" data-i="${i}"><span>${i + 1}</span>${esc(s.kr)}</button></li>`).join('')}</ol>
      ${d.metka ? '<p class="pk-metka">' + esc(d.metka) + '</p>' : ''}
      <div class="pk-scena${c1 ? '' : ' bez1c'}${chat ? '' : ' bezchata'}">
        <div class="pk-lev">
          <div class="pk-tekst" aria-live="polite"><p class="pk-nomer"></p><h3 class="pk-zag"></h3><p class="pk-op"></p></div>
          <p class="pk-sejchas" aria-live="polite"><b>Сейчас:</b><span></span><time></time></p>
          <ol class="pk-mysli" aria-label="Как думает Иван" hidden></ol>
          ${c1 ? '<figure class="pk-lupa" hidden><canvas width="960" height="540" aria-hidden="true"></canvas><figcaption>Крупно — то место в 1С, где сейчас Иван</figcaption></figure>' : ''}
          ${!c1 ? '<div class="pk-poyasn"></div>' : ''}
        </div>
        <div class="pk-ekr${chat ? ' na-tel' : ' na-1c'}">
        ${chat ? `<div class="tel-obl"><p class="tel-kan"></p><div class="tel" aria-label="Переписка">
          <div class="tel-sh"><span class="ava"></span><div><b></b><small class="st"></small></div></div>
          <div class="tel-lenta"></div>
          <div class="tel-vvod"><span>Сообщение</span></div>
          <div class="tel-zatemn"></div></div></div>` : ''}
        ${c1 ? `<figure class="ek1c"><div class="ek1c-ram"><video muted playsinline preload="metadata"></video><i class="ruka"></i><span class="zhdet">1С: Управление нашей фирмой</span></div>
          <figcaption>Запись настоящей 1С:УНФ, учебная база «Ромашка-Запчасти».<span class="pc"> Жёлтый круг — где Иван нажимает. На деле он делает то же через обработку в 1С, без мыши; экран мы записали, чтобы было видно.</span></figcaption></figure>` : ''}
        </div>
      </div>
      <div class="pk-upr">
        <button type="button" class="pk-nazad">← Назад</button>
        <button type="button" class="pk-dalshe"><span>Дальше →</span><i class="pk-tajmer"></i></button>
        <button type="button" class="pk-avto"></button>
        <span class="pk-podskaz"></span>
      </div>`;
    const $ = s => el.querySelector(s);
    Object.assign(this, {put: [...el.querySelectorAll('.pk-put li')], nomer: $('.pk-nomer'), zag: $('.pk-zag'), op: $('.pk-op'),
      sej: $('.pk-sejchas span'), sejT: $('.pk-sejchas time'), lenta: $('.tel-lenta'), st: $('.tel-sh .st'), vvod: $('.tel-vvod'),
      zatemn: $('.tel-zatemn'), mysli: $('.pk-mysli'), ekr: $('.pk-ekr'), lupa: $('.pk-lupa'), video: $('video'), rk: $('.ruka'), zhdet: $('.zhdet'), poyasn: $('.pk-poyasn'),
      bN: $('.pk-nazad'), bD: $('.pk-dalshe'), bA: $('.pk-avto'), tajmer: $('.pk-tajmer'), podskaz: $('.pk-podskaz')});
    el.querySelectorAll('.pk-put button').forEach(b => b.onclick = () => this.ruchno(+b.dataset.i));
    this.bN.onclick = () => this.ruchno(this.n - 1);
    this.bD.onclick = () => this.ruchno(this.n + 1);
    this.bA.onclick = () => {
      if (!this.avto) { this.avto = true; this.pauza = false; if (this.konec) this.ruchno(this.n + 1 < this.d.shagi.length ? this.n + 1 : 0, true); }
      else this.pauza = !this.pauza;
      this.knopki();
    };
    new IntersectionObserver(es => es.forEach(e => {
      const bylo = this.vidno; this.vidno = e.intersectionRatio >= .35;
      if (this.vidno && !this.zapushchen) { this.zapushchen = true; this.igrat(0); }
      if (bylo !== this.vidno) this.knopki();
    }), {threshold: [0, .35, .6]}).observe(el);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.avto = false;
    this.lenty = {}; this.chat(d.shagi[0].chat); this.tekst(0); this.knopki();   // шапка телефона заполнена до начала показа
  }

  stoit() { return this.pauza || !this.vidno || document.hidden; }
  ruchno(i, avto) { if (i < 0 || i >= this.d.shagi.length) return; this.avto = !!avto; this.pauza = false; this.igrat(i); }
  knopki() {
    const n = this.n, N = this.d.shagi.length;
    this.bN.disabled = n === 0;
    this.bD.disabled = n === N - 1;
    this.bD.querySelector('span').textContent = n === N - 1 ? 'Последний шаг' : 'Дальше →';
    const tel = matchMedia('(max-width:999px)').matches;   // на телефоне короче — иначе «Дальше» сжимается (нашёл агент страницы производства)
    this.bA.textContent = !this.avto ? (this.konec && n === N - 1 ? (tel ? '↻ Сначала' : '↻ Смотреть сначала') : (tel ? '▶ Подряд' : '▶ Смотреть подряд')) : this.pauza ? (tel ? '▶ Пуск' : '▶ Продолжить') : '⏸ Пауза';
    this.podskaz.textContent = this.avto && !this.pauza ? 'Шаги идут сами. Можно листать кнопками.' : '';
  }
  tekst(i) {
    const s = this.d.shagi[i];
    this.put.forEach((li, j) => { li.className = j < i ? 'bylo' : j === i ? 'tut' : ''; if (j === i) li.querySelector('button').setAttribute('aria-current', 'step'); else li.querySelector('button').removeAttribute('aria-current'); });
    const tut = this.put[i]; if (tut) tut.parentElement.scrollLeft = tut.offsetLeft - 20;
    this.nomer.textContent = 'Шаг ' + (i + 1) + ' из ' + this.d.shagi.length;
    this.zag.textContent = s.zag; this.op.innerHTML = s.op || '';
    if (this.poyasn) this.poyasn.innerHTML = s.poyasn || '';
  }
  sejchas(t, vr) { this.sej.textContent = t || ''; this.sejT.textContent = vr || ''; }

  /* ожидание, которое стоит на паузе и за пределами экрана; false — шаг сменили */
  zhdi(ms, tok, kazhd) {
    return new Promise(res => {
      let ost = ms, t = performance.now();
      const tik = () => {
        if (tok !== this.tok) return res(false);
        const now = performance.now(); if (!this.stoit()) ost -= now - t; t = now;
        if (kazhd) kazhd(ost);
        if (ost <= 0) return res(true);
        setTimeout(tik, 100);
      };
      tik();
    });
  }

  /* чаты: у шага может быть свой собеседник (клиент, менеджеры, цех, поставщик) — d.chaty[ключ] = {imya, podp, kanal, my: 'i'|'k', kto}.
     my: 'k' — смотрим с телефона клиента (его сообщения справа), 'i' — с телефона Ивана (справа Иван). */
  chat(key) {
    const d = this.d, c = (d.chaty || {})[key] || {imya: d.chatImya || 'Иван', podp: d.chatPodp || 'был(а) недавно', kanal: d.kanal || 'Telegram', my: 'k', kto: d.kto, skin: d.skin};
    this.c = c; this.ck = key || '_';
    this.lenty[this.ck] = this.lenty[this.ck] || [];
    this.soobs = this.lenty[this.ck];
    if (!this.lenta) return;
    const sh = this.el.querySelector('.tel-sh');
    sh.querySelector('.ava').textContent = (c.imya || '?')[0];
    sh.querySelector('.ava').style.background = c.cvet || '';
    sh.querySelector('b').textContent = c.imya;
    // чей телефон — подписью над ним, шапка чата как в настоящем мессенджере (rabota-78)
    this.el.querySelector('.tel-kan').innerHTML = 'Телефон: <b>' + (c.my === 'i' ? 'Иван' : esc(c.kto || d.kto || 'клиент')) + '</b> · ' + esc(c.kanal || 'Telegram');
    this.status(c.podp || '');
    this.el.querySelector('.tel').classList.toggle('max', (c.skin || d.skin) === 'max');
  }
  // справа — владелец телефона; чужие сообщения с именем (группа) — всегда слева (нашёл агент страницы переписки)
  pravo(m) { return m.imya && m.kto !== 'i' ? false : (m.kto === 'i') === (this.c.my === 'i'); }
  /* на экране одно: телефон или 1С — туда, где сейчас работает Иван */
  async kuda(cel, tok, mgn) {
    if (!this.lenta || !this.video) return true;
    const tut = this.ekr.classList.contains('na-1c') ? '1c' : 'tel';
    if (tut === cel) return true;
    this.ekr.classList.toggle('na-1c', cel === '1c'); this.ekr.classList.toggle('na-tel', cel === 'tel');
    if (this.lupa && cel !== '1c') this.lupa.hidden = true;
    if (mgn) return true;
    this.sejchas(cel === '1c' ? 'Иван переходит в 1С' : 'Иван возвращается в переписку', '');
    const z = document.createElement('div'); z.className = 'pk-perehod';
    z.innerHTML = cel === '1c' ? '<b>1С</b><span>Иван открывает 1С</span>' : '<b class="tg">✉</b><span>Иван возвращается в переписку</span>';
    this.ekr.appendChild(z);
    const ok = await this.zhdi(1900, tok); z.remove(); return ok;
  }

  async igrat(i) {
    const tok = ++this.tok, d = this.d, s = d.shagi[i];
    this.n = i; this.konec = false; this.tajmer.style.width = '0';
    this.tekst(i); this.knopki();
    // ленты: предыдущие шаги — сразу, без анимации, каждая в свой чат (у страниц приёмов каждый шаг — своя переписка)
    this.lenty = {}; this.ekranVykl = false; if (this.lenta) this.lenta.innerHTML = '';
    this.mysli.innerHTML = ''; this.mysli.hidden = true; if (this.lupa) { this.lupa.hidden = true; this.lupaC = null; }
    if (this.zatemn) this.zatemn.classList.remove('on');
    this.vvodT('');
    // sob асинхронный: без await сообщение прошлого шага ложилось в чат текущего (нашли агенты страниц, 06.11)
    if (!d.otdelno) for (let j = 0; j < i; j++) { this.chat(d.shagi[j].chat); for (const e of d.shagi[j].sob || []) await this.sob(e, tok, true); }
    this.chat(s.chat);
    for (const e of (d.otdelno && s.fon) || []) await this.sob(e, tok, true);
    if (tok !== this.tok) return;
    this.ris();
    const per = (s.sob || []).find(e => !['mysl', 'dumaet', 'zhdat', 'sejchas', 'schet', 'stroka'].includes(e[0]));
    await this.kuda(per && per[0] === '1c' ? '1c' : 'tel', tok, true);
    if (this.video && !(s.sob || []).some(e => e[0] === '1c')) this.bez1c(i);
    this.sejchas(s.sej0 || 'читаем, что происходит', '');
    const t0 = performance.now();
    if (!await this.zhdi(2200, tok)) return;
    for (const e of s.sob || []) if (!await this.sob(e, tok, false)) return;
    this.sejchas(s.itog || 'шаг закончен', '');
    // держим, пока медленный читатель не дочитает подпись шага
    const nado = ((s.zag || '').length + (s.op || '').replace(/<[^>]+>/g, '').length) / CHITAET * 1000;
    if (!await this.zhdi(Math.max(3500, nado - (performance.now() - t0)), tok)) return;
    this.konec = true; this.knopki();
    if (i === d.shagi.length - 1) { this.avto = false; this.knopki(); this.sejchas(d.final || 'показ закончен — можно посмотреть любой шаг ещё раз', ''); return; }
    if (!this.avto) { this.sejchas((s.itog || 'шаг закончен') + ' · нажмите «Дальше»', ''); return; }
    const ok = await this.zhdi(DALSHE_SAMO, tok, ost => { this.tajmer.style.width = (100 - ost / DALSHE_SAMO * 100) + '%'; this.sejT.textContent = this.avto && !this.pauza ? 'дальше через ' + sek(ost / 1000) : ''; });
    if (ok && this.avto) this.igrat(i + 1);
  }

  /* --- телефон --- */
  status(t, pech) { if (this.st) { this.st.textContent = t; this.st.classList.toggle('pech', !!pech); } }
  vvodT(t) { if (!this.vvod) return; this.vvod.querySelector('span').textContent = t || 'Сообщение'; this.vvod.classList.toggle('pishu', !!t); }
  dob(m, mgn) { m.nov = !mgn; this.soobs.push(m); if (!mgn) this.ris(); return m; }
  ris() {
    if (!this.lenta) return;
    const d = this.d;
    this.lenta.innerHTML = (d.den ? '<span class="tel-den">' + esc(d.den) + '</span>' : '') + this.soobs.map((m, j) => {
      const pr = this.pravo(m);
      const mt = '<span class="mt">' + (m.izm ? '<span class="izm">изменено </span>' : '') + esc(m.vr || '') + (pr ? '<i' + (m.vspyh ? ' class="vspyh"' : '') + '>' + (m.prochitano ? '✓✓' : '✓') + '</i>' : '') + '</span>';
      m.vspyh = false;
      const kto = m.imya ? '<span class="kto' + (m.ruk ? ' ruk' : '') + '">' + esc(m.imya) + '</span>' : '';
      const o = m.otvet != null ? this.soobs[m.otvet] : null;
      const cit = o ? '<span class="cit"><b>' + esc(o.imya || (o.kto === 'i' ? 'Иван' : this.c.kto || d.kto)) + '</b><span>' + esc(o.t || '') + '</span></span>' : '';
      const cls = 'puz ' + (pr ? 'k' : 'i') + (m.tip ? ' ' + m.tip : '') + (m.nov ? ' nov' : '') + (m.ster ? ' ster' : '');
      m.nov = false;
      if (m.tip === 'doc') return `<div class="${cls}"><span class="dz">PDF</span><div><b>${esc(m.t)}</b><small>${esc(m.razm || '')}</small></div>${mt}</div>`;
      if (m.tip === 'gol') return `<div class="${cls}">${kto}<div class="gw"><span class="gp">▶</span><span class="gv"></span></div><span class="gd">0:${String(m.dl).padStart(2, '0')}</span>${m.rassh ? '<span class="gr">«' + esc(m.rassh) + '»</span>' : ''}${mt}</div>`;
      if (m.tip === 'foto') return `<div class="${cls}"><div class="fk">${m.html}</div>${m.t ? '<p>' + esc(m.t) + mt + '</p>' : mt}</div>`;
      if (m.tip === 'krug') return `<div class="${cls}"><div class="fk">${m.html}</div></div>`;
      if (m.tip === 'chern') return `<div class="${cls}"><span class="kto">черновик Ивана — клиент его не видит</span>${esc(m.t)}</div>`;
      const kn = m.kn ? '<span class="kn">' + m.kn.map(x => '<i' + (x === m.nazh ? ' class="on"' : '') + '>' + esc(x) + '</i>').join('') + '</span>' : '';
      return `<div class="${cls}">${kto}${cit}${esc(m.t)}${mt}${kn}</div>`;
    }).join('');
    if (this.st && this.st.classList.contains('pech') && this.c.my !== 'i') this.lenta.insertAdjacentHTML('beforeend', '<div class="puz i puz-pech"><i></i><i></i><i></i></div>');
    this.lenta.scrollTop = this.lenta.scrollHeight;
  }
  async pechataet(t, tok, mgn, polno, podp) {
    if (mgn) return true;
    const s = Math.min(polno ? 999 : POTOLOK_PECHATI, 1.5 + t.length / ZNAK_SEK), svoj = this.c.my === 'i';
    if (!svoj) { this.status('печатает…', true); this.tochki(true); }
    const ok = await this.zhdi(s * 1000, tok, ost => {
      if (svoj) this.vvodT(t.slice(0, Math.round(t.length * (1 - ost / (s * 1000)))));
      this.sejchas(podp || ((svoj ? 'Иван набирает сообщение' : 'Иван печатает ответ') + (polno ? ' · ' + t.length + ' ' + SKLON(t.length, 'знак', 'знака', 'знаков') + ', как живой человек' : '')), 'ещё ' + sek(ost / 1000));
    });
    if (svoj) this.vvodT(''); else { this.status(this.c.podp || 'в сети'); this.tochki(false); }
    return ok;
  }
  /* три точки внизу ленты — «печатает» видно без чтения шапки */
  tochki(on) {
    if (!this.lenta) return;
    let t = this.lenta.querySelector('.puz-pech');
    if (on && !t) { this.lenta.insertAdjacentHTML('beforeend', '<div class="puz i puz-pech"><i></i><i></i><i></i></div>'); this.lenta.scrollTop = this.lenta.scrollHeight; }
    if (!on && t) t.remove();
  }

  /* --- экран 1С --- */
  bez1c(i) {
    // шаг без 1С: на экране остаётся последний кадр последней записи до этого шага (или обложка первой)
    let e = null;
    for (let j = i; j >= 0 && !e; j--) e = [...(this.d.shagi[j].sob || [])].reverse().find(x => x[0] === '1c');
    if (!e) for (const s of this.d.shagi) { e = (s.sob || []).find(x => x[0] === '1c'); if (e) { this.zagr(e, false); return; } }
    if (e) this.zagr(e, true);
  }
  zagr(e, vKonec) {
    const v = this.video, src = '1c/' + e[1] + '.mp4', o = e[3] || {};
    if (!v.src.endsWith(src)) { v.poster = '1c/' + e[1] + '.jpg'; v.preload = 'auto'; v.src = src; }
    this.rukaDor = (window.RUKA || {})[e[1]] || [];   // дорожки рук — 1c/ruka.js (fetch с диска браузер не пускает)
    const k = () => { try { v.currentTime = vKonec ? (o.do || v.duration || 0) - .05 : (o.ot || 0); } catch (x) {} };
    if (v.readyState >= 1) k(); else v.addEventListener('loadedmetadata', k, {once: true});
    this.rk.classList.remove('on'); v.pause();
  }
  /* лупа: кусок кадра вокруг руки Ивана, вдвое крупнее — текст 1С читается и на ноутбуке */
  lupaRis(r) {
    const v = this.video, c = this.lupa && this.lupa.querySelector('canvas');
    if (!c || !v.videoWidth) return;
    const kx = v.videoWidth / 1440, ky = v.videoHeight / 852, sw = 480 * kx, sh = 270 * ky;
    const cel = [Math.min(Math.max(r.x * kx - sw / 2, 0), v.videoWidth - sw), Math.min(Math.max(r.y * ky - sh / 2, 0), v.videoHeight - sh)];
    this.lupaC = this.lupaC ? this.lupaC.map((a, i) => a + (cel[i] - a) * .25) : cel;   // плавно, без рывков
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(v, this.lupaC[0], this.lupaC[1], sw, sh, 0, 0, c.width, c.height);
    // кольцо там же, где на большом экране
    const rx = (r.x * kx - this.lupaC[0]) / sw * c.width, ry = (r.y * ky - this.lupaC[1]) / sh * c.height;
    if (this.video.currentTime - r.t < 2.4) { x.lineWidth = 6; x.strokeStyle = '#E8A800'; x.beginPath(); x.arc(rx, ry, 34, 0, 7); x.stroke(); }
    this.lupa.hidden = false;
  }
  async v1c(e, tok, mgn) {
    const v = this.video; if (!v) return true;
    const [, , podp = [], o = {}] = e;
    this.zagr(e, mgn);
    if (mgn) return true;
    await new Promise(r => v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, {once: true}));
    if (tok !== this.tok) return false;
    v.playbackRate = o.skor || SKOR_1C; this.zhdet.textContent = '1С · Иван работает';
    const doK = o.do || v.duration, ot = o.ot || 0;
    // покадрово (Артур 06.11: «нигде не быстрее и не дольше, чем должен»): на каждой подписи запись встаёт, пока подпись не прочитают
    const derzhat = t => Math.max(2200, t.length / CHITAET * 1000 + 900);
    const stopy = podp.filter(x => x[0] > ot + .15 && x[0] < doK - .1);
    const p0 = podp.filter(x => x[0] <= ot + .15).pop();
    if (p0) { this.sejchas(p0[1], '1С'); if (!await this.zhdi(derzhat(p0[1]), tok)) return false; }
    let sled = 0, posl = -1;
    const ruka = t => (this.rukaDor || []).filter(x => x.t <= t + .05 && x.t >= ot).pop();
    return new Promise(res => {
      const tik = () => {
        if (tok !== this.tok) { v.pause(); return res(false); }
        const t = v.currentTime;
        if (sled < stopy.length && t >= stopy[sled][0]) {
          const p = stopy[sled++]; v.pause(); this.sejchas(p[1], '1С');
          const r = ruka(t); if (r) this.lupaRis(r);
          return this.zhdi(derzhat(p[1]), tok).then(ok => ok ? tik() : res(false));
        }
        if (this.stoit()) { if (!v.paused) v.pause(); }
        else if (v.paused && !v.ended && t < doK) v.play().catch(() => {});
        const r = ruka(t);
        if (r) this.lupaRis(r);
        if (r && t - r.t < 2.4) {
          this.rk.style.left = (r.x / 14.4) + '%'; this.rk.style.top = (r.y / 8.52) + '%'; this.rk.classList.add('on');
          if (r !== posl && r.k) { this.rk.classList.remove('klik'); void this.rk.offsetWidth; this.rk.classList.add('klik'); }
          posl = r;
        } else this.rk.classList.remove('on');
        if (v.ended || t >= doK - .03) { v.pause(); this.rk.classList.remove('on'); this.zhdet.textContent = '1С: Управление нашей фирмой'; return this.zhdi(1500, tok).then(res); }
        setTimeout(tik, 60);
      };
      tik();
    });
  }

  /* --- события --- */
  async sob(e, tok, mgn) {
    const [vid, a, b, c, dop] = e, d = this.d;
    if (vid === '1c') { if (!await this.kuda('1c', tok, mgn)) return false; }
    else if (!['mysl', 'dumaet', 'zhdat', 'sejchas', 'schet', 'stroka'].includes(vid)) { if (!await this.kuda('tel', tok, mgn)) return false; }
    const posled = kto => [...this.soobs].reverse().find(m => m.kto === kto && !m.tip);
    switch (vid) {
      case 'k': {
        const kto = this.c.kto || d.kto, ona = this.c.ona != null ? this.c.ona : d.ona;
        if (!mgn) {
          this.sejchas(kto + ' пишет…', '');
          if (this.c.my === 'i') { this.status('печатает…', true); this.tochki(true); } else this.vvodT(a);
          if (!await this.zhdi(Math.min(5000, 900 + a.length * 45), tok)) return false;
          this.vvodT(''); this.status(this.c.podp || 'в сети'); this.tochki(false);
        }
        this.dob({kto: 'k', t: a, vr: b || d.vr, imya: c || ''}, mgn);
        if (!mgn) { this.sejchas(kto + (ona ? ' отправила' : ' отправил') + ' сообщение', ''); return this.zhdi(1600, tok); }
        return true;
      }
      case 'k_pech': {
        if (mgn) return true;
        this.sejchas(b || (this.c.kto || d.kto) + ' ещё печатает — Иван ждёт и не перебивает', '');
        if (this.c.my === 'i') this.status('печатает…', true); else this.vvodT(a);
        const ok = await this.zhdi(Math.max(2500, a.length * 110), tok); if (this.c.my === 'i') this.status(this.c.podp || 'в сети'); return ok;
      }
      case 'ch': { this.dob({kto: 'c', imya: a, t: b, vr: c || d.vr}, mgn); if (!mgn) { this.sejchas(a + ' пишет в группу', ''); return this.zhdi(2200, tok); } return true; }
      case 'prochital': {
        this.soobs.forEach(m => { if (this.pravo(m) && !m.prochitano) { m.prochitano = true; m.vspyh = !mgn; } });
        if (this.c.my !== 'i') this.status('в сети');
        if (!mgn) { this.ris(); this.sejchas(a || (this.c.my === 'i' ? (this.c.kto || 'Собеседник') + ' прочитал' + (this.c.ona ? 'а' : '') + ' — две галочки ✓✓' : 'Иван открыл чат и прочитал — у клиента две галочки ✓✓'), ''); return this.zhdi(2600, tok); }
        return true;
      }
      case 'dumaet': {
        if (mgn) return true;
        return this.zhdi(a * 1000, tok, ost => this.sejchas(b || 'Иван читает и думает, прежде чем ответить', sek(ost / 1000)));
      }
      case 'zhdat': { if (mgn) return true; return this.zhdi(a * 1000, tok, ost => this.sejchas(b || '', b ? sek(ost / 1000) : '')); }
      case 'sejchas': { if (!mgn) this.sejchas(a, ''); return true; }
      case 'mysl': {   // ['mysl', 'текст'] — ход мысли Ивана: строка появляется и держится, пока её не прочитают
        if (mgn) return true;
        const li = document.createElement('li'); li.className = 'nov'; li.textContent = a;
        this.mysli.hidden = false; this.mysli.appendChild(li);
        return this.zhdi(Math.max(2600, a.length / CHITAET * 1000 + 900), tok, ost => this.sejchas('Иван думает', ''));
      }
      case 'i': {
        if (!await this.pechataet(a, tok, mgn, c && c.polno)) return false;
        this.dob({kto: 'i', t: a, vr: b || d.vr, kn: c && c.knopki}, mgn);
        if (!mgn) { this.sejchas((c && c.podp) || (c && c.knopki ? 'Под вопросом кнопки — ответить можно одним нажатием' : 'Иван отправил сообщение'), ''); return this.zhdi(c && c.polno ? 3000 : 2000, tok); }
        return true;
      }
      case 'i_chern': {
        if (mgn) return true;
        const m = this.dob({kto: 'i', tip: 'chern', t: a}, false);
        const ok = await this.pechataet(a, tok, false, false, 'Иван печатает — у клиента вверху «печатает…»');
        this.status('в сети'); return ok;
      }
      case 'ster': {
        const m = [...this.soobs].reverse().find(x => x.tip === 'chern'); if (m) m.ster = true;
        if (!mgn) { this.ris(); this.sejchas(a || 'Иван бросил недописанное — сначала прочитает новое', ''); return this.zhdi(3200, tok); }
        return true;
      }
      case 'doc': {
        const ot = dop || 'i', pod = (e[5] || {});
        if (!mgn) { if ((ot === 'i') !== (this.c.my === 'i')) this.status('отправляет файл…', true); if (!await this.zhdi(2200, tok, () => this.sejchas(pod.idet || (ot === 'i' ? 'Иван прикладывает файл' : (this.c.kto || d.kto) + ' отправляет файл'), ''))) return false; this.status(this.c.podp || 'в сети'); }
        this.dob({kto: ot, tip: 'doc', t: a, razm: b, vr: c || d.vr}, mgn);
        if (!mgn) { this.sejchas(pod.gotovo || 'Файл в чате', ''); return this.zhdi(2200, tok); }
        return true;
      }
      case 'golos': {
        if (!mgn) { this.vvodT('🎙 запись голосового…'); if (!await this.zhdi(Math.min(a, 6) * 1000, tok, ost => this.sejchas((this.c.kto || d.kto) + ' записывает голосовое', ''))) return false; this.vvodT(''); }
        const m = this.dob({kto: 'k', tip: 'gol', dl: a, vr: c || d.vr}, mgn);
        if (mgn) { m.rassh = b; return true; }
        this.sejchas('Пришло голосовое на ' + a + ' с', ''); if (!await this.zhdi(1800, tok)) return false;
        this.soobs.forEach(x => { if (this.pravo(x)) x.prochitano = true; }); this.ris();
        if (!await this.zhdi(Math.max(3, a * .6) * 1000, tok, ost => this.sejchas('Иван слушает голосовое', sek(ost / 1000)))) return false;
        m.rassh = b; this.ris();
        this.sejchas('Иван понял, что сказали, — расшифровка под голосовым (её видно только здесь, для вас)', ''); return this.zhdi(4200, tok);
      }
      case 'foto': case 'krug': {
        const m = this.dob({kto: 'k', tip: vid, html: a, t: vid === 'foto' ? b : '', vr: (vid === 'foto' ? c : b) || d.vr}, mgn);
        if (!mgn) { this.sejchas((this.c.kto || d.kto) + (vid === 'foto' ? ' прислал фото' : ' прислал кружок — короткое видео'), ''); return this.zhdi(2400, tok); }
        return true;
      }
      case 'otvet': {
        if (!await this.pechataet(b, tok, mgn)) return false;
        this.dob({kto: 'i', t: b, vr: c || d.vr, otvet: a, imya: d.gruppa ? 'Иван' : ''}, mgn);
        if (!mgn) { this.sejchas('Иван ответил именно на это сообщение — сверху видно, на какое', ''); return this.zhdi(2600, tok); }
        return true;
      }
      case 'pravka': {
        const m = posled('i'); if (!m) return true;
        if (!mgn) { this.sejchas(b || 'Иван исправляет своё сообщение', ''); if (!await this.zhdi(2600, tok)) return false; }
        m.t = a; m.izm = true; if (!mgn) { this.ris(); this.sejchas('Исправлено. Рядом с временем — «изменено», как в Telegram', ''); return this.zhdi(2800, tok); }
        return true;
      }
      case 'ruk': {
        this.soobs = this.soobs.filter(m => m.tip !== 'chern');
        this.dob({kto: 'i', t: b, vr: c || d.vr, imya: a, ruk: true}, mgn);
        if (!mgn) { this.status(this.c.podp || 'в сети'); this.sejchas('Ответил руководитель — с того же аккаунта', ''); return this.zhdi(3000, tok); }
        return true;
      }
      case 'ekran': {
        this.ekranVykl = !!a;
        if (this.zatemn) { this.zatemn.textContent = a || ''; this.zatemn.classList.toggle('on', !!a); }
        if (!mgn) { this.sejchas(a ? 'Телефон клиента пока в кармане' : (this.c.kto || d.kto) + ' открыл чат', ''); return this.zhdi(2600, tok); }
        return true;
      }
      case 'nazhal': {
        const m = [...this.soobs].reverse().find(x => x.kn); if (m) m.nazh = a;
        if (!mgn) { this.ris(); this.sejchas(b || (this.c.kto || 'Руководитель') + ' нажал' + (this.c.ona ? 'а' : '') + ' «' + a + '»', ''); return this.zhdi(2600, tok); }
        return true;
      }
      case 'stroka': {   // строки пояснения шага появляются по одной — и встают на паузе вместе с показом
        const el = this.poyasn && this.poyasn.querySelector('.skr'); if (el) el.classList.remove('skr');
        if (mgn) return true;
        if (a) this.sejchas(a, '');
        return this.zhdi(Math.max(2600, (el ? el.textContent.length : 0) / CHITAET * 1000 + 900), tok);
      }
      case '1c': return this.v1c(e, tok, mgn);
      case 'schet': {   // ['schet', до, сек, 'Разобрано {n} из 1 400'] — счётчик в строке «Сейчас»
        if (mgn) return true;
        return this.zhdi(b * 1000, tok, ost => this.sejchas(c.replace('{n}', Math.round(a * (1 - ost / (b * 1000))).toLocaleString('ru-RU')), sek(ost / 1000)));
      }
    }
    return true;
  }
}

/* вкладки примеров: <div class="pk-vkl" data-dlya="id блока"><button data-pokaz="имя">…</button></div> */
function zapusk() {
  document.querySelectorAll('.pokaz[data-pokaz]').forEach(el => { const d = (window.POKAZ || {})[el.dataset.pokaz]; if (d && !el.pk) el.pk = new Pokaz(el, d); });
  document.querySelectorAll('.pk-vkl').forEach(v => {
    const bb = [...v.querySelectorAll('button[data-pokaz]')];
    bb.forEach(b => b.onclick = () => {
      bb.forEach(x => x.setAttribute('aria-selected', x === b));
      const cel = document.getElementById(v.dataset.dlya), st = cel.pk; if (st) { st.tok++; if (st.video) st.video.pause(); }
      const nov = cel.cloneNode(false); nov.dataset.pokaz = b.dataset.pokaz; nov.className = 'pokaz'; cel.replaceWith(nov);
      const pk = new Pokaz(nov, window.POKAZ[b.dataset.pokaz]); nov.pk = pk; pk.zapushchen = true; pk.vidno = true; pk.igrat(0);
    });
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zapusk); else zapusk();
window.Pokaz = Pokaz;
})();
