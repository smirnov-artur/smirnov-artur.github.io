// Плашка «такой сайт для вашего бизнеса» на кейсах g.a.d. (04.10, docs/ВИДЕО-РАЗБОР-2026-10-04.md, «Упаковка»).
// Подключается одной строкой на /cases/gad-…/ и /demo/gad-…/: <script src="https://smirnov-artur.github.io/plashka.js" defer></script>
// Показ: заход с любым ?src= (через 2,5 с) или телефон после половины прокрутки. Крестик — больше не показывать (localStorage).
// Клики и показ шлются тем же пикселем, что и переходы: gad-production.ru/px?...&k=<кнопка>, отчёт zapad/perehody.py.
(function () {
  var q = new URLSearchParams(location.search), KEY = 'gad-plashka-x', src = q.get('src') || '';
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}
  var ru = /^ru/i.test(q.get('lang') || document.documentElement.lang);   // ?lang=ru — русская ссылка на страницу без ru/
  var mob = matchMedia('(max-width: 760px)').matches;
  if (!src && !mob) return;

  function px(k) {
    new Image().src = 'https://gad-production.ru/px?p=' + encodeURIComponent(location.pathname) +
      '&r=&s=' + encodeURIComponent(src) + '&k=' + k;
  }
  var slug = location.pathname.split('/').filter(Boolean).filter(function (s) { return s !== 'ru'; }).pop() || '';
  var mail = 'mailto:paladei702@gmail.com?subject=' + encodeURIComponent((ru ? 'Хочу такой сайт: ' : 'A site like ') + slug);
  var T = ru
    ? { t: 'Такой сайт для вашего бизнеса — от 15&nbsp;000&nbsp;₽, 5–7 дней',
        b: [['max', 'Написать в MAX', 'https://max.ru/u/f9LHodD0cOIMR2bjYkF5W52F58UVcSSkA4J80AyBbUl_fCEugAMeFqDb4LQ'], ['mail', 'Почта', mail]], x: 'Закрыть' }
    : { t: 'A site like this for your business — from $290, 5–7 days',
        b: [['tg', 'Telegram', 'https://t.me/smirnovarturr'], ['mail', 'Email', mail]], x: 'Close' };

  var shown = false;
  function show() {
    if (shown) return;
    shown = true;
    var host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:0;right:0;bottom:0;pointer-events:none';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' +
      '.p{pointer-events:auto;box-sizing:border-box;margin:0 auto calc(12px + env(safe-area-inset-bottom));width:max-content;max-width:calc(100% - 24px);' +
      'display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:10px 10px 10px 18px;border-radius:14px;' +
      'background:rgba(10,10,12,.9);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);' +
      'box-shadow:0 8px 30px rgba(0,0,0,.35);color:#fff;font:500 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
      'opacity:0;transform:translateY(12px);transition:opacity .4s,transform .4s}' +
      '.p.on{opacity:1;transform:none}' +
      '.t{flex:1 1 auto;min-width:0}' +
      '.bs{display:flex;gap:8px;align-items:center}' +
      'a{display:inline-block;padding:8px 14px;border-radius:999px;text-decoration:none;font-weight:600;font-size:13px;white-space:nowrap;' +
      'color:#fff;border:1px solid rgba(255,255,255,.25)}' +
      'a:first-child{background:#D6FF3F;color:#0A0A0C;border-color:#D6FF3F}' +
      'a:hover{filter:brightness(1.08)}' +
      'button{all:unset;cursor:pointer;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;font-size:18px;color:#AAAAB0}' +
      'button:hover{color:#fff;background:rgba(255,255,255,.08)}' +
      '@media (max-width:560px){.p{width:auto;padding:12px 10px 12px 14px}.t{flex-basis:calc(100% - 42px);font-size:14px}' +
      '.bs{order:3;flex:1 1 100%}.bs a{flex:1;text-align:center}}' +
      '</style><div class="p" role="complementary"><div class="t">' + T.t + '</div><div class="bs">' +
      T.b.map(function (b) { return '<a data-k="' + b[0] + '" href="' + b[2] + '" target="_blank" rel="noopener">' + b[1] + '</a>'; }).join('') +
      '</div><button type="button" aria-label="' + T.x + '">×</button></div>';
    document.body.appendChild(host);
    var p = root.querySelector('.p');
    requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add('on'); }); });
    root.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { px(a.dataset.k); }); });
    root.querySelector('button').addEventListener('click', function () {
      px('x');
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      host.remove();
    });
    px('pokaz');
  }

  if (src) setTimeout(show, 2500);
  if (mob) {
    var onScroll = function (e) {
      var el = (e && e.target && e.target.nodeType === 1) ? e.target : document.scrollingElement || document.documentElement;
      var max = el.scrollHeight - el.clientHeight;
      if (max > 0 && el.scrollTop / max >= 0.5) { document.removeEventListener('scroll', onScroll, true); show(); }
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  }
})();
