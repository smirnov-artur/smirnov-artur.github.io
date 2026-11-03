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
