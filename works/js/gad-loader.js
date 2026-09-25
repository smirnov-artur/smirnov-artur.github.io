/* g.a.d. — заставка при загрузке страницы и переходах между страницами сайта.
   Подключение: script с src="/works/js/gad-loader.js" первой строкой в head.
   Первый заход за сессию: свет рисует кольцо, буквы поднимаются, по металлу идёт блик. Дальше: короткий вариант.
   Счётчик показывает настоящую загрузку, кольцо раскрывается порталом. Клик по ссылке на другую страницу
   сайта закрывает экран кольцом из точки клика. В автоматизированном браузере (запись превью, проверки) заставки нет. */
(function () {
  'use strict';
  var W = window, D = document, R = D.documentElement;
  var PV = W.gadPreview || null;
  if (W.__gad || (navigator.webdriver && !(PV && PV.force))) return;
  W.__gad = 1;                      // страница-превью заставки
  var mq = function (q) { return !!(W.matchMedia && W.matchMedia(q).matches); };
  var reduce = mq('(prefers-reduced-motion: reduce)'), fine = mq('(pointer: fine)');
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }
  var first = PV ? PV.mode === 'first' : !(ss('gad-seen') || Date.now() - (+ss('gad-nav') || 0) < 15000);
  if (!PV) ss('gad-seen', '1');

  var GL = ["M53.7 66.8V57.9L54.3 55.8V43.7L53.7 41.7V27.6H70.8V66Q70.8 75.8 66.4 82.6Q61.9 89.5 54 93.1Q46.1 96.7 35.6 96.7Q28.3 96.7 22.2 94.8Q16.1 92.9 10.1 89.1V76Q15.7 80.3 21.9 82.2Q28.1 84 34.5 84Q43.8 84 48.7 79.9Q53.7 75.7 53.7 66.8ZM30.5 74.8Q23.2 74.8 17.4 71.8Q11.6 68.8 8.3 63.3Q4.9 57.8 4.9 50.5Q4.9 43.1 8.3 37.6Q11.6 32.2 17.4 29.1Q23.2 26.1 30.5 26.1Q36 26.1 40.6 27.8Q45.2 29.5 48.8 32.3Q52.4 35 54.9 38.3Q57.4 41.5 58.7 44.8Q60 48.1 60 50.7Q60 54.1 57.9 58.2Q55.9 62.4 52.1 66.2Q48.3 70 42.8 72.4Q37.4 74.8 30.5 74.8ZM36.2 63Q41.9 63 46.4 59.9Q50.9 56.9 54.3 50.5Q50.9 43.9 46.4 40.9Q41.8 37.9 36.2 37.9Q31.9 37.9 28.7 39.4Q25.6 41 23.9 43.8Q22.1 46.6 22.1 50.5Q22.1 54.2 23.8 57Q25.5 59.9 28.6 61.4Q31.8 63 36.2 63Z", "M84.7 80.9Q81.9 80.9 79.6 79.6Q77.4 78.3 76.1 76Q74.8 73.8 74.8 71.1Q74.8 68.3 76.1 66.1Q77.4 63.9 79.6 62.6Q81.9 61.2 84.7 61.2Q87.4 61.2 89.6 62.6Q91.8 63.9 93.2 66.1Q94.5 68.3 94.5 71.1Q94.5 73.8 93.2 76Q91.8 78.3 89.6 79.6Q87.4 80.9 84.7 80.9Z", "M146.4 80 144.1 61 146.6 53.8 144.1 46.7 146.4 27.6H164.2L161 53.8L164.2 80ZM150.7 53.8Q149.3 62.2 145.4 68.4Q141.6 74.6 135.7 78Q129.8 81.5 122.4 81.5Q114.7 81.5 108.9 78Q103 74.5 99.7 68.3Q96.4 62.1 96.4 53.8Q96.4 45.5 99.7 39.3Q103 33.1 108.9 29.6Q114.7 26.1 122.4 26.1Q129.8 26.1 135.7 29.5Q141.6 33 145.5 39.2Q149.4 45.3 150.7 53.8ZM113.7 53.8Q113.7 58 115.4 61.3Q117.2 64.5 120.3 66.4Q123.3 68.3 127.4 68.3Q131.4 68.3 135.1 66.4Q138.7 64.5 141.5 61.3Q144.2 58 145.6 53.8Q144.2 49.5 141.5 46.3Q138.7 43 135.1 41.1Q131.4 39.2 127.4 39.2Q123.3 39.2 120.3 41.1Q117.2 43 115.4 46.3Q113.7 49.5 113.7 53.8Z", "M176.9 80.9Q174.2 80.9 171.9 79.6Q169.7 78.3 168.4 76Q167.1 73.8 167.1 71.1Q167.1 68.3 168.4 66.1Q169.7 63.9 171.9 62.6Q174.2 61.2 176.9 61.2Q179.7 61.2 181.9 62.6Q184.1 63.9 185.4 66.1Q186.8 68.3 186.8 71.1Q186.8 73.8 185.4 76Q184.1 78.3 181.9 79.6Q179.7 80.9 176.9 80.9Z", "M239 80 236.7 60.2 239.8 54 236.8 46.1 241 9.2H258.8L253.5 52.5L256.7 80ZM242.9 53.8Q241.6 62.2 237.7 68.4Q233.8 74.6 228 78Q222.1 81.5 214.7 81.5Q207 81.5 201.1 78Q195.3 74.5 192 68.3Q188.7 62.1 188.7 53.8Q188.7 45.5 192 39.3Q195.3 33.1 201.1 29.6Q207 26.1 214.7 26.1Q222.1 26.1 228 29.5Q233.8 33 237.8 39.2Q241.7 45.3 242.9 53.8ZM206 53.8Q206 58 207.7 61.3Q209.5 64.5 212.5 66.4Q215.6 68.3 219.7 68.3Q223.7 68.3 227.4 66.4Q231 64.5 233.7 61.3Q236.5 58 237.9 53.8Q236.5 49.5 233.7 46.3Q231 43 227.4 41.1Q223.7 39.2 219.7 39.2Q215.6 39.2 212.5 41.1Q209.5 43 207.7 46.3Q206 49.5 206 53.8Z", "M269.4 80.9Q266.6 80.9 264.4 79.6Q262.1 78.3 260.8 76Q259.6 73.8 259.6 71.1Q259.6 68.3 260.8 66.1Q262.1 63.9 264.4 62.6Q266.6 61.2 269.4 61.2Q272.2 61.2 274.4 62.6Q276.6 63.9 277.9 66.1Q279.2 68.3 279.2 71.1Q279.2 73.8 277.9 76Q276.6 78.3 274.4 79.6Q272.2 80.9 269.4 80.9Z"], DOT = { 1: 1, 3: 1, 5: 1 };
  var NS = 'http://www.w3.org/2000/svg', TAU = Math.PI * 2;
  var now = function () { return W.performance && performance.now ? performance.now() : Date.now(); };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var inOut3 = function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var inOut4 = function (x) { return x < .5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2; };
  var out4 = function (x) { return 1 - Math.pow(1 - x, 4); };
  var in3 = function (x) { return x * x * x; };
  var outBack = function (x) { var c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  var seg = function (t, a, d) { return clamp((t - a) / d, 0, 1); };

  var fontStyle = D.createElement('style');
  fontStyle.textContent = "@font-face{font-family:gad-num;src:url(data:font/woff2;base64,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) format('woff2');font-weight:600;font-display:block}";
  (D.head || R).appendChild(fontStyle);

  function noise() {
    try {
      var c = D.createElement('canvas'); c.width = c.height = 128;
      var x = c.getContext('2d'), im = x.createImageData(128, 128), d = im.data;
      for (var i = 0; i < d.length; i += 4) { var v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      x.putImageData(im, 0, 0); return c.toDataURL();
    } catch (e) { return ''; }
  }

  var CSS = ':host{all:initial}*{box-sizing:border-box}' +
    '.cur{position:absolute;inset:0;background:#0C0C0C;overflow:hidden;display:grid;place-items:center}' +
    '.light{position:absolute;left:50%;top:50%;width:140vmax;height:140vmax;margin:-70vmax 0 0 -70vmax;pointer-events:none;will-change:transform;' +
    'background:radial-gradient(closest-side,rgba(150,172,190,.17),rgba(150,172,190,.05) 42%,rgba(150,172,190,0) 70%)}' +
    '.grain{position:absolute;inset:-60%;opacity:.075;pointer-events:none;animation:g .7s steps(7) infinite}' +
    '@keyframes g{0%{transform:translate(0,0)}14%{transform:translate(-7%,4%)}28%{transform:translate(5%,-8%)}42%{transform:translate(-3%,9%)}' +
    '57%{transform:translate(9%,2%)}71%{transform:translate(-9%,-5%)}85%{transform:translate(3%,7%)}}' +
    '.vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 100% at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55))}' +
    '.wrap{position:relative;display:flex;flex-direction:column;align-items:center;will-change:transform}' +
    'svg{display:block;width:min(46vw,360px);height:auto;overflow:visible}' +
    '.meta{margin-top:clamp(20px,3.4vw,32px);width:min(40vw,300px);opacity:0;will-change:opacity,transform}' +
    '.line{position:relative;height:1px;background:rgba(215,226,234,.14)}' +
    '.fill{position:absolute;inset:0;background:linear-gradient(90deg,rgba(215,226,234,.3),#EEF4F8);transform-origin:0 50%;transform:scaleX(0)}' +
    '.head{position:absolute;top:-1px;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:#fff;box-shadow:0 0 8px 2px rgba(200,220,235,.8)}' +
    '.row{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-top:12px}' +
    '.num{font:600 12px/1 gad-num,ui-monospace,Menlo,Consolas,monospace;letter-spacing:.1em;color:#D7E2EA}' +
    '.dest{font:500 10.5px/1.2 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.24em;text-transform:uppercase;' +
    'color:#8B959D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72%}' +
    '.rim{position:absolute;left:0;top:0;border-radius:50%;border:0 solid #EEF4F8;pointer-events:none;will-change:transform}' +
    '.rim.r{border-color:rgba(255,96,132,.55);mix-blend-mode:screen}.rim.b{border-color:rgba(96,204,255,.55);mix-blend-mode:screen}';

  function svgEl(tag, at) { var e = D.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); return e; }
  function div(c, p) { var e = D.createElement('div'); e.className = c; if (p) p.appendChild(e); return e; }

  // Сцена: занавес с логотипом, счётчиком и светом; кольца-ободки портала лежат поверх занавеса.
  function build() {
    var host = D.createElement('gad-loader');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block;pointer-events:auto';
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var st = D.createElement('style'); st.textContent = CSS; root.appendChild(st);
    var cur = div('cur', root), light = div('light', cur), grain = div('grain', cur);
    var nz = noise(); if (nz) grain.style.backgroundImage = 'url(' + nz + ')';
    div('vig', cur);
    var wrap = div('wrap', cur);
    var svg = svgEl('svg', { viewBox: '0 0 355 110' });
    svg.innerHTML = '<defs>' +
      '<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7FAFB"/><stop offset=".55" stop-color="#CAD7E0"/><stop offset="1" stop-color="#8E9FAC"/></linearGradient>' +
      '<linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7FAFB"/><stop offset="1" stop-color="#9AAEBC"/></linearGradient>' +
      '<linearGradient id="sh" gradientUnits="userSpaceOnUse" x1="-120" y1="0" x2="-60" y2="110"><stop offset="0" stop-color="#fff" stop-opacity="0"/>' +
      '<stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="c"><rect x="-20" y="-60" width="302" height="160"/></clipPath>' +
      '<filter id="gw" x="-3" y="-3" width="7" height="7"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>';
    var clip = svgEl('g', { 'clip-path': 'url(#c)' }); svg.appendChild(clip);
    var letters = [], sheen = svgEl('g', { opacity: '0' });
    GL.forEach(function (d) { var p = svgEl('path', { d: d, fill: 'url(#m)' }); clip.appendChild(p); letters.push(p); });
    clip.appendChild(sheen);
    GL.forEach(function (d) { sheen.appendChild(svgEl('path', { d: d, fill: 'url(#sh)' })); });
    var ring = svgEl('circle', { cx: 322, cy: 30, r: 22, fill: 'none', stroke: 'url(#rg)', 'stroke-width': 6, 'stroke-linecap': 'round',
      pathLength: 100, 'stroke-dasharray': 100, 'stroke-dashoffset': 100 });
    ring.style.cssText = 'transform-box:view-box;transform-origin:322px 30px;transform:rotate(-90deg)';
    svg.appendChild(ring);
    var tail = [], tg = svgEl('g', {}); svg.appendChild(tg);
    for (var i = 1; i <= 10; i++) tail.push(tg.appendChild(svgEl('circle', { r: 0, fill: '#E4EDF3' })));
    var orb = svgEl('circle', { r: 5, fill: '#fff', filter: 'url(#gw)', opacity: '0' }); svg.appendChild(orb);
    wrap.appendChild(svg);
    var meta = div('meta', wrap), line = div('line', meta), fill = div('fill', line), head = div('head', line), row = div('row', meta);
    var num = div('num', row), dest = div('dest', row);
    num.textContent = '000';
    var rims = ['rim r', 'rim b', 'rim'].map(function (c) { var e = div(c, root); e.style.display = 'none'; return e; });
    R.appendChild(host);
    letters.forEach(function (p, i) { if (DOT[i]) { var b = p.getBBox(); p._c = [b.x + b.width / 2, b.y + b.height / 2]; } });
    return { host: host, cur: cur, light: light, wrap: wrap, svg: svg, letters: letters, sheen: sheen, shg: svg.querySelector('#sh'),
      ring: ring, tail: tail, orb: orb, meta: meta, fill: fill, head: head, num: num, dest: dest, rims: rims };
  }

  function destText() {
    var t = (PV && PV.dest) || D.title || '';
    t = t.replace(/^\s*g\.a\.d\.?\s*[—–\-|:·]\s*/i, '').replace(/\s*[—–\-|:·]\s*g\.a\.d\.?\s*$/i, '').trim();
    return /^g\.a\.d\.?$/i.test(t) ? '' : t;
  }

  // Портал и ободки: круглое окно радиусом r в точке (x, y); inside = видно только внутри круга (закрытие экрана).
  function hole(u, x, y, r, w, fr, op, gl, inside) {
    var m = inside ? 'radial-gradient(circle at ' + x + 'px ' + y + 'px,#000 ' + r + 'px,rgba(0,0,0,0) ' + (r + 1) + 'px)'
      : 'radial-gradient(circle at ' + x + 'px ' + y + 'px,rgba(0,0,0,0) ' + r + 'px,#000 ' + (r + 1) + 'px)';
    u.cur.style.webkitMaskImage = m; u.cur.style.maskImage = m;
    var off = [2 + 14 * fr, -(2 + 10 * fr), 0];
    u.rims.forEach(function (el, i) {
      var rr = r + w / 2 + off[i], d = 2 * rr + w;
      el.style.display = 'block';
      el.style.width = el.style.height = d + 'px';
      el.style.transform = 'translate(' + (x - d / 2) + 'px,' + (y - d / 2) + 'px)';
      el.style.borderWidth = (i < 2 ? Math.max(1, w * .5) : w) + 'px';
      el.style.opacity = String(i < 2 ? .85 * op * (1 - fr * .6) : op);
      if (i === 2) el.style.boxShadow = '0 0 ' + (18 + 30 * (1 - gl)) + 'px rgba(205,225,240,' + (.45 * gl) + '),inset 0 0 ' + (30 + 70 * (1 - gl)) + 'px ' + (6 + 26 * (1 - gl)) + 'px rgba(0,0,0,' + (.5 * gl) + ')';
    });
  }

  var u = null, raf = 0, t0 = now(), last = t0, loaded = false, loadT = 0, shown = 0, target = 0, imgT = 0, imgP = 0;
  var angle = 0, omega = 0, drawn = first ? 0 : 1, exitT = 0, leaving = null, mx = .5, my = .5, tx = 0, ty = 0, gone = false;
  var MIN = reduce ? 250 : first ? 2050 : 450, CRUISE = TAU / 1.9, DRAW0 = 60, DRAW = 950, PORTAL = first ? 900 : 760;

  function onLoad() { if (!loaded) { loaded = true; loadT = now(); } }
  if (D.readyState === 'complete') onLoad(); else W.addEventListener('load', onLoad);
  if (fine) W.addEventListener('pointermove', function (e) { mx = e.clientX / (W.innerWidth || 1); my = e.clientY / (W.innerHeight || 1); }, { passive: true });

  function progress(t) {
    var hold = PV && PV.hold ? PV.hold : 0;
    if (loaded && t - t0 >= hold) return 1;
    var p = .93 * (1 - Math.exp(-(t - t0) / 1500));
    if (D.readyState !== 'loading') {
      if (t - imgT > 200) {
        imgT = t; var im = D.images, n = im.length, c = 0;
        for (var i = 0; i < n; i++) if (im[i].complete) c++;
        imgP = n ? c / n : 1;
      }
      p = Math.max(p, .2 + .5 * imgP);
    }
    return Math.min(p, .93);
  }

  function frame() {
    var t = now(), dt = Math.min(64, t - last) / 1000; last = t;
    var T = t - t0;
    if (!u) return;
    if (leaving) return cover(t, dt);

    // ход загрузки
    target = Math.max(target, progress(t));
    if (T > 7000) target = 1;
    shown += (target - shown) * (target === 1 ? .2 : .08);
    if (target === 1 && 1 - shown < .004) shown = 1;
    if (!exitT && shown === 1 && T >= MIN) exitT = t;
    var E = exitT ? t - exitT : 0;

    // кольцо и спутник
    if (first && !exitT && !reduce) {
      var f = seg(T, DRAW0, DRAW);
      if (f < 1) { drawn = inOut3(f); angle = drawn * TAU; omega = 0; }
      else { drawn = 1; omega = CRUISE * out4(seg(T, DRAW0 + DRAW, 700)); angle += omega * dt; }
    } else { drawn = 1; omega = CRUISE; angle += omega * dt * (exitT ? 1 + E / 150 : 1); }
    u.ring.setAttribute('stroke-dashoffset', String(100 * (1 - drawn)));
    var speed = first && T < DRAW0 + DRAW ? 3 * Math.PI / (DRAW / 1000) * (1 - Math.abs(2 * seg(T, DRAW0, DRAW) - 1)) : omega;
    var step = clamp(speed * .02, .035, .12), orbA = reduce ? 1 : (first ? seg(T, DRAW0, 120) : 1) * (exitT ? 1 - seg(E, 0, 220) : 1);
    u.orb.setAttribute('cx', 322 + 22 * Math.sin(angle)); u.orb.setAttribute('cy', 30 - 22 * Math.cos(angle));
    u.orb.setAttribute('opacity', String(orbA));
    u.tail.forEach(function (c, i) {
      var k = i + 1, a = angle - k * step, q = 1 - k / 11;
      c.setAttribute('cx', 322 + 22 * Math.sin(a)); c.setAttribute('cy', 30 - 22 * Math.cos(a));
      c.setAttribute('r', String(4.4 * q)); c.setAttribute('opacity', String(.6 * Math.pow(q, 1.5) * orbA));
    });

    // буквы: подъём из-под линии, точки выпрыгивают; при уходе — вниз
    u.letters.forEach(function (p, i) {
      var y = 0, s = 1;
      if (first && !exitT && !reduce) {
        if (DOT[i]) s = outBack(seg(T, 560 + i * 70, 520));
        else y = 100 * (1 - out4(seg(T, 300 + i * 70, 760)));
      }
      if (exitT) { var q = in3(seg(E, i * 28, 360)); if (DOT[i]) s = 1 - q; else y = 100 * q; }
      if (DOT[i]) { var c = p._c; p.setAttribute('transform', 'translate(' + c[0] + ' ' + c[1] + ') scale(' + Math.max(0, s) + ') translate(' + -c[0] + ' ' + -c[1] + ')'); }
      else p.setAttribute('transform', 'translate(0 ' + y + ')');
    });

    // блик по металлу
    if (first && !reduce) {
      var sh = seg(T, 1300, 750);
      u.sheen.setAttribute('opacity', sh > 0 && sh < 1 && !exitT ? '1' : '0');
      var x = -60 + 500 * inOut3(sh);
      u.shg.setAttribute('x1', String(x - 30)); u.shg.setAttribute('x2', String(x + 30));
    }

    // счётчик и подпись
    var mIn = first && !reduce ? out4(seg(T, 700, 450)) : 1, mOut = exitT ? seg(E, 0, 260) : 0;
    u.meta.style.opacity = String(mIn * (1 - mOut));
    u.meta.style.transform = 'translateY(' + (6 * (1 - mIn) - 6 * mOut) + 'px)';
    u.fill.style.transform = 'scaleX(' + shown + ')';
    u.head.style.left = (shown * 100) + '%';
    u.num.textContent = ('00' + Math.round(shown * 100)).slice(-3);

    // наклон за курсором и свет
    var k = exitT ? 0 : 1;
    tx += ((my - .5) * -9 * k - tx) * .07; ty += ((mx - .5) * 13 * k - ty) * .07;
    var ringS = exitT ? (E < 160 ? 1 - .07 * Math.sin(E / 160 * Math.PI / 2) : 1 - .07 * (1 - inOut3(seg(E, 160, 150)))) : 1;
    u.wrap.style.transform = 'perspective(900px) rotateX(' + tx + 'deg) rotateY(' + ty + 'deg)';
    u.ring.style.transform = 'rotate(-90deg) scale(' + ringS + ')';
    u.light.style.transform = 'translate(' + (mx - .5) * 16 + 'vw,' + (my - .5) * 12 + 'vh)';

    // портал
    if (exitT) {
      u.host.style.pointerEvents = 'none';
      if (reduce) { u.cur.style.opacity = String(1 - seg(E, 0, 300)); if (E > 320) return finish(); }
      else if (E >= 330) {
        if (!u.P) {
          u.wrap.style.transform = 'none';
          var b = u.svg.getBoundingClientRect(), kk = b.width / 355;
          var cx = b.left + 322 * kk, cy = b.top + 30 * kk, Wd = W.innerWidth, Hd = W.innerHeight;
          u.P = { x: cx, y: cy, k: kk, r0: 19 * kk, r1: Math.hypot(Math.max(cx, Wd - cx), Math.max(cy, Hd - cy)) + 24 };
          u.ring.style.visibility = 'hidden'; u.orb.style.visibility = 'hidden';
        }
        var P = u.P, e = inOut4(seg(E, 330, PORTAL));
        hole(u, P.x, P.y, P.r0 + (P.r1 - P.r0) * e, 6 * P.k + (1.2 - 6 * P.k) * e, e, e < .6 ? 1 : 1 - (e - .6) / .4, 1 - e, false);
        if (E >= 330 + PORTAL) return finish();
      }
    }
    raf = W.requestAnimationFrame(frame);
  }

  function finish() {
    W.cancelAnimationFrame(raf); gone = true;
    if (u && u.host.parentNode) u.host.parentNode.removeChild(u.host);
    u = null;
  }

  // Уход со страницы: кольцо растёт из точки клика и закрывает экран, в темноте встаёт логотип, потом переход.
  function leave(url, x, y) {
    if (leaving) return;
    ss('gad-nav', String(Date.now()));
    var go = function () { if (PV && PV.navigate) PV.navigate(url); else W.location.href = url; };
    if (reduce) return go();
    if (u) finish();
    gone = false; u = build(); first = false; drawn = 1; omega = CRUISE;
    u.host.style.pointerEvents = 'auto';
    u.dest.textContent = ''; u.meta.style.opacity = '0';
    u.letters.forEach(function (p, i) { if (DOT[i]) { var c = p._c; p.setAttribute('transform', 'translate(' + c[0] + ' ' + c[1] + ') scale(1) translate(' + -c[0] + ' ' + -c[1] + ')'); } });
    u.ring.setAttribute('stroke-dashoffset', '0');
    var Wd = W.innerWidth, Hd = W.innerHeight;
    leaving = { t: now(), url: url, go: go, x: x, y: y, R: Math.hypot(Math.max(x, Wd - x), Math.max(y, Hd - y)) + 24 };
    hole(u, x, y, 0, 1.5, .5, 1, .6, true);
    last = now(); raf = W.requestAnimationFrame(frame);
  }

  function cover(t, dt) {
    var L = leaving, E = t - L.t, e = in3(seg(E, 0, 620));
    angle += CRUISE * dt;
    u.orb.setAttribute('cx', 322 + 22 * Math.sin(angle)); u.orb.setAttribute('cy', 30 - 22 * Math.cos(angle));
    u.tail.forEach(function (c, i) {
      var k = i + 1, a = angle - k * .066, q = 1 - k / 11;
      c.setAttribute('cx', 322 + 22 * Math.sin(a)); c.setAttribute('cy', 30 - 22 * Math.cos(a));
      c.setAttribute('r', String(4.4 * q)); c.setAttribute('opacity', String(.6 * Math.pow(q, 1.5)));
    });
    var lg = out4(seg(E, 380, 320));
    u.orb.setAttribute('opacity', String(lg));
    u.wrap.style.opacity = String(lg);
    u.wrap.style.transform = 'scale(' + (.96 + .04 * lg) + ')';
    if (E < 700) hole(u, L.x, L.y, L.R * e, 1.5 + 4.5 * e, .5, 1, .6, true);
    else { u.cur.style.webkitMaskImage = u.cur.style.maskImage = 'none'; u.rims.forEach(function (r) { r.style.display = 'none'; }); }
    if (E >= 700 && !L.done) { L.done = true; L.go(); setTimeout(function () { if (leaving === L) { leaving = null; finish(); } }, 4000); }
    raf = W.requestAnimationFrame(frame);
  }

  W.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || gone === false && u) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var url; try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    if (/\.(pdf|zip|rar|7z|png|jpe?g|gif|webp|svg|mp4|webm|mp3|docx?|xlsx?|pptx?)$/i.test(url.pathname)) return;
    e.preventDefault(); leave(url.href, e.clientX, e.clientY);
  });
  W.addEventListener('pageshow', function (e) { if (e.persisted && leaving) { leaving = null; finish(); } });
  if (PV) W.addEventListener('message', function (e) {
    var m = e.data || {}; if (m.type === 'gad-leave') leave(PV.next || '#next', m.x == null ? W.innerWidth / 2 : m.x, m.y == null ? W.innerHeight / 2 : m.y);
  });

  u = build();
  if (!first) {
    u.ring.setAttribute('stroke-dashoffset', '0');
    u.meta.style.opacity = '1';
  }
  var setDest = function () { if (u) u.dest.textContent = destText(); };
  setDest(); if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', setDest);
  raf = W.requestAnimationFrame(frame);
})();
