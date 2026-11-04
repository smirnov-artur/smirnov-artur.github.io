// Метка письма ?src= → старт демо-бота site_<src> (start ≤ 64 знаков) и та же метка на переходах внутри ii-sotrudnik.
// Метрика видит только согласившихся с cookie, старты бота видны всегда.
(() => {
  const s = new URLSearchParams(location.search).get('src');
  if (!s || !/^[A-Za-z0-9_-]{1,59}$/.test(s)) return;
  document.querySelectorAll('a[href^="https://t.me/romashka_zapchasti_bot"]').forEach(a => {
    a.href = 'https://t.me/romashka_zapchasti_bot?start=site_' + s;
  });
  document.querySelectorAll('a[href^="../"]').forEach(a => {
    const u = new URL(a.getAttribute('href'), location.href);
    if (/\.(pdf|png|html)$/.test(u.pathname)) return;
    u.searchParams.set('src', s);
    a.href = u.href;
  });
})();

// pereezd 03.11: на github.io — строка сверху «страница переехала» на тот же путь домена, с той же меткой ?src=
(() => {
  if (!/github\.io$/.test(location.hostname)) return;
  const put = location.pathname.replace(/^\/works\/ii-sotrudnik\//, '/');
  const d = document.createElement('div');
  d.style.cssText = 'background:#15171A;color:#fff;font:14px/1.3 system-ui,sans-serif;padding:6px 12px;text-align:center';
  const a = document.createElement('a');
  a.href = 'https://gad-production.ru' + put + location.search + location.hash;
  a.textContent = 'gad-production.ru';
  a.style.cssText = 'color:#FFD43B;font-weight:700';
  const w = document.querySelector('.intro .what');  // в надзаголовок — без сдвига первого экрана (кнопка над плашкой cookie)
  if (w) { a.style.color = 'inherit'; w.textContent = ''; w.append('Страница переехала на ', a); return; }
  d.append('Страница переехала на ', a);
  document.body.prepend(d);
})();

// 04.11: письмо со страницы несёт адрес страницы и метку — видно, откуда пришёл человек (Метрика видит только согласившихся с cookie)
(() => {
  const s = new URLSearchParams(location.search).get('src');
  const otkuda = 'Со страницы: ' + location.host + location.pathname + (s && /^[A-Za-z0-9_-]{1,59}$/.test(s) ? '?src=' + s : '');
  document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
    if (a.id === 'r-mail') return;  // письмо калькулятора собирает свой текст
    const h = a.getAttribute('href');
    const kon = encodeURIComponent('\r\n\r\n' + otkuda);
    a.href = h.includes('body=') ? h + kon : h + (h.includes('?') ? '&' : '?') + 'body=' + encodeURIComponent(otkuda);
  });
})();
