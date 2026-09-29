(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // Email is assembled here: padandpixel.com also keeps the address out of the HTML.
  $$('[data-mail]').forEach(a => {
    const addr = a.dataset.mail.replace('|', '@');
    a.href = 'mailto:' + addr + (a.dataset.subject ? '?subject=' + encodeURIComponent(a.dataset.subject) : '');
    if (a.hasAttribute('data-show')) a.textContent = addr;
  });

  const nav = $('.nav');
  const menu = $('.menu', nav);
  menu.addEventListener('click', () => menu.setAttribute('aria-expanded', nav.classList.toggle('open')));

  // Page wipe: brand pixels uncover the page on load and cover it before leaving.
  const wipe = $('.wipe');
  if (!reduced) {
    const cols = innerWidth < 700 ? 6 : 12, rows = Math.ceil(cols * innerHeight / innerWidth);
    wipe.style.setProperty('--cols', cols);
    wipe.innerHTML = Array.from({length: cols * rows}, (_, i) => `<i style="--d:${(i % cols + Math.floor(i / cols)) * 28}"></i>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => wipe.classList.add('open')));
    $$('a[href$=".html"], a[href="./"]').forEach(a => a.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
      e.preventDefault();
      wipe.classList.remove('open');
      setTimeout(() => { location.href = a.href; }, 650);
    }));
    addEventListener('pageshow', e => { if (e.persisted) wipe.classList.add('open'); });
  }

  // Pixel fields at the section edges, each square on its own parallax speed.
  $$('[data-pixels]').forEach(f => {
    const cols = (f.dataset.colors || 'var(--blue),var(--red)').split(','), R = Math.random;
    f.innerHTML = Array.from({length: +f.dataset.pixels}, () =>
      `<i data-speed="${(R() * .9 - .45).toFixed(2)}" style="--s:${[6, 8, 10, 14, 18, 26][R() * 6 | 0]}px;--c:${cols[R() * cols.length | 0]};` +
      `left:${(R() < .5 ? R() * 4 : 96 + R() * 3).toFixed(1)}%;top:${(R() * 96).toFixed(1)}%;opacity:${(.35 + R() * .6).toFixed(2)}"></i>`).join('');
  });

  // Split headings into words that slide up, keep the full sentence for screen readers.
  $$('[data-split]').forEach(el => {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    el.innerHTML = `<span class="sr">${esc(text)}</span>` + text.split(' ')
      .map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${esc(w)}</span></span>`).join(' ');
  });
  const scrubs = $$('[data-scrub]').map(el => {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    el.innerHTML = `<span class="sr">${esc(text)}</span>` + text.split(' ')
      .map(w => `<span class="sw" aria-hidden="true">${esc(w)}</span>`).join(' ');
    return {el, words: $$('.sw', el), lit: -1};
  });

  // Counters start from zero when they come into view.
  const fmtNum = el => {
    const dec = (el.dataset.count.split('.')[1] || '').length;
    return v => (el.dataset.prefix || '') + v.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec}) + (el.dataset.suffix || '');
  };
  const counters = $$('[data-count]');
  if (!reduced) counters.forEach(el => { el.textContent = fmtNum(el)(0); });
  function countUp(el) {
    const to = parseFloat(el.dataset.count), fmt = fmtNum(el), t0 = performance.now();
    const tick = t => {
      const k = Math.min(1, (t - t0) / 1700);
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(tick);
    };
    if (reduced) el.textContent = fmt(to); else requestAnimationFrame(tick);
  }

  // Photos open through a grid of brand-navy pixels.
  $$('.photo .tiles').forEach(t => {
    t.innerHTML = Array.from({length: 48}, (_, i) => `<i style="--d:${((i % 8) + Math.floor(i / 8)) * 40 + Math.random() * 120 | 0}"></i>`).join('');
  });

  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    if (e.target.dataset.count) countUp(e.target);
    io.unobserve(e.target);
  }), {rootMargin: '0px 0px -8% 0px', threshold: .12});
  $$('[data-split],[data-reveal],[data-count],.photo').forEach(el => io.observe(el));

  // Marquees loop forever and speed up with the scroll.
  const marquees = $$('[data-marquee]').map(el => {
    const copy = el.firstElementChild.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    el.append(copy);
    return {el, dir: +el.dataset.marquee || 1, x: 0, w: 1};
  });

  // Parallax: data-speed moves vertically, data-x sideways (desktop only). Values are eased,
  // so elements keep settling for a moment after the scroll stops.
  let items = [], progress = $$('[data-progress]');
  function measure() {
    items = $$('[data-speed],[data-x]').map(el => {
      el.style.transform = '';
      const r = el.getBoundingClientRect();
      return {el, c: r.top + scrollY + r.height / 2, sy: +el.dataset.speed || 0, sx: innerWidth > 960 ? +el.dataset.x || 0 : 0, cur: 0};
    });
    marquees.forEach(m => { m.w = m.el.scrollWidth / 2; });
  }

  // Smooth wheel scrolling on desktop; touch keeps native scrolling.
  let cur = scrollY, target = scrollY, smooth = false, lastSet = scrollY;
  if (fine && !reduced) {
    addEventListener('wheel', e => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
      if (!smooth) cur = target = scrollY;
      target = clamp(target + d, 0, document.documentElement.scrollHeight - innerHeight);
      smooth = true;
    }, {passive: false});
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const el = a.getAttribute('href').length > 1 && $(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    nav.classList.remove('open');
    const y = el.getBoundingClientRect().top + scrollY - 20;
    if (fine && !reduced) { if (!smooth) cur = scrollY; target = clamp(y, 0, document.documentElement.scrollHeight - innerHeight); smooth = true; }
    else scrollTo({top: y, behavior: reduced ? 'auto' : 'smooth'});
  }));

  const hero = $('#px') && pixelHero($('#px'));
  let lastY = scrollY, vel = 0, navY = scrollY;

  function frame(now) {
    if (smooth) {
      if (Math.abs(scrollY - lastSet) > 2) smooth = false;   // keyboard or scrollbar took over
      else {
        cur += (target - cur) * .1;
        if (Math.abs(target - cur) < .5) { cur = target; smooth = false; }
        scrollTo(0, cur);
        lastSet = scrollY;
      }
    }
    const y = scrollY, vh = innerHeight, mid = y + vh / 2;
    vel += (y - lastY - vel) * .2;
    lastY = y;

    if (!nav.classList.contains('open')) {
      if (y > 240 && y > navY + 3) nav.classList.add('away');
      else if (y < navY - 3 || y < 240) nav.classList.remove('away');
    }
    navY = y;

    if (!reduced) {
      for (const it of items) {
        const t = (mid - it.c) * (it.sy || it.sx);
        if (Math.abs(t - it.cur) < .05) continue;
        it.cur += (t - it.cur) * .09;
        it.el.style.transform = it.sx ? `translate3d(${it.cur.toFixed(2)}px,0,0)` : `translate3d(0,${it.cur.toFixed(2)}px,0)`;
      }
      const skew = clamp(vel * -.06, -7, 7);
      for (const m of marquees) {
        m.x -= (.55 + Math.min(Math.abs(vel) * .12, 14)) * m.dir;
        if (m.x <= -m.w) m.x += m.w;
        if (m.x > 0) m.x -= m.w;
        m.el.style.transform = `translate3d(${m.x.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
      }
      for (const s of scrubs) {
        const r = s.el.getBoundingClientRect();
        const n = Math.round(clamp((vh * .82 - r.top) / (r.height + vh * .25), 0, 1) * s.words.length);
        if (n !== s.lit) { s.words.forEach((w, i) => w.classList.toggle('on', i < n)); s.lit = n; }
      }
      for (const el of progress) {
        const p = clamp((vh * .85 - el.getBoundingClientRect().top) / (vh * .55), 0, 1);
        el.style.setProperty('--p', p.toFixed(3));
        const li = $$('li', el);
        li.forEach((l, i) => l.classList.toggle('on', p >= i / Math.max(1, li.length - 1) - .01));
      }
    }
    if (hero) hero(now);
    requestAnimationFrame(frame);
  }

  let rw = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(measure.t);
    measure.t = setTimeout(() => { measure(); if (hero && innerWidth !== rw) hero.layout(); rw = innerWidth; }, 180);
  });
  addEventListener('load', measure);
  document.fonts && document.fonts.ready.then(() => { measure(); if (hero) hero.layout(true); });
  measure();
  requestAnimationFrame(frame);

  // Hero: the Pad & Pixel mark built from pixels. It holds, bursts and rebuilds into the
  // practice numbers from padandpixel.com/mock-reviews, then back to the mark.
  function pixelHero(cv) {
    const ctx = cv.getContext('2d'), stage = $('.hero-stage'), cap = $('.cap');
    const COL = {d: 'rgba(255,255,255,.14)', b: '#2b7cff', r: '#ff3946', w: '#ffffff'};
    const SHAPES = [
      {k: 'mark', t: 'Pad & Pixel, LLC', s: 'Consulting and writing, for tech and video games'},
      {k: '50+', t: 'Vetted reviewers', s: 'Working and former games critics on the bench'},
      {k: '13', t: 'Genre clusters covered', s: 'Critics picked for genre expertise, region and generation'},
      {k: '8', t: 'Countries represented', s: 'Every engagement runs under NDA'}
    ];
    const HOLD = 2600, BURST = 650;
    let W = 0, H = 0, box, cell = 10, P = [], targets = [], si = 0, phase = 'hold', t0 = performance.now(), on = true;
    const mouse = {x: -1e4, y: -1e4};

    function sample(k) {
      const w = Math.max(1, Math.round(box.w)), h = Math.max(1, Math.round(box.h));
      const oc = document.createElement('canvas');
      oc.width = w; oc.height = h;
      const o = oc.getContext('2d', {willReadFrequently: true});
      if (k === 'mark') {
        // geometry of the P mark: 3x3 units, stem square, rounded bowl, blue fold, red pixel
        const u = Math.min(w, h) / 3 * .96, x = (w - 3 * u) / 2, y = (h - 3 * u) / 2;
        o.fillStyle = COL.w;
        o.fillRect(x, y, u + 1, u);
        o.beginPath(); o.roundRect(x + u, y, 2 * u, 2 * u, [0, .78 * u, .78 * u, 0]); o.fill();
        o.fillStyle = COL.b;
        o.beginPath(); o.moveTo(x, y + u); o.lineTo(x + u, y + u); o.lineTo(x + u, y + 2 * u); o.closePath(); o.fill();
        o.fillStyle = COL.r;
        o.fillRect(x, y + 2 * u, u, u);
      } else {
        const parts = k.endsWith('+') ? [[k.slice(0, -1), COL.w], ['+', COL.r]] : [[k, COL.w]];
        const setFont = fs => { o.font = `800 ${fs}px Archivo, sans-serif`; if ('fontStretch' in o) o.fontStretch = 'expanded'; };
        let fs = h * .92;
        setFont(fs);
        const tw = parts.reduce((a, p) => a + o.measureText(p[0]).width, 0);
        if (tw > w * .94) { fs *= w * .94 / tw; setFont(fs); }
        let x = (w - parts.reduce((a, p) => a + o.measureText(p[0]).width, 0)) / 2;
        o.textBaseline = 'middle';
        for (const [s, c] of parts) { o.fillStyle = c; o.fillText(s, x, h / 2 + fs * .04); x += o.measureText(s).width; }
      }
      const d = o.getImageData(0, 0, w, h).data, out = [];
      for (let y = cell / 2; y < h; y += cell) for (let x = cell / 2; x < w; x += cell) {
        const i = ((y | 0) * w + (x | 0)) * 4;
        if (d[i + 3] < 128) continue;
        out.push({x: box.x + x, y: box.y + y, c: d[i] < 150 ? 'b' : d[i + 1] < 150 ? 'r' : 'w'});
      }
      return out;
    }

    function assign() {
      const T = targets[si], idx = P.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
      idx.forEach((pi, n) => {
        const p = P[pi];
        if (n < T.length) { p.tx = T[n].x; p.ty = T[n].y; p.c = T[n].c; p.free = false; }
        else { p.free = true; p.c = 'd'; }
      });
    }

    // fontsOnly: the webfont arrived; keep the mark where it is unless the stage moved
    function layout(fontsOnly) {
      const dpr = Math.min(devicePixelRatio || 1, 2), r = cv.getBoundingClientRect(), s = stage.getBoundingClientRect();
      const nb = {x: s.left - r.left, y: s.top - r.top, w: s.width, h: Math.max(80, s.height - cap.offsetHeight - 20)};
      const same = box && ['x', 'y', 'w', 'h'].every(k => Math.abs(nb[k] - box[k]) < 1);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      box = nb;
      cell = Math.max(6, Math.round(Math.min(box.w, box.h) / 40));
      targets = SHAPES.map(sh => sample(sh.k));
      const need = Math.max(...targets.map(t => t.length)) + (W < 700 ? 90 : 240);
      while (P.length < need) P.push({x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, tx: 0, ty: 0, c: 'd', free: true, ph: Math.random() * 6.3});
      P.length = need;
      if (!(fontsOnly && same && SHAPES[si].k === 'mark')) { assign(); phase = 'hold'; t0 = performance.now(); }
      if (reduced) { P.forEach(p => { if (!p.free) { p.x = p.tx; p.y = p.ty; } }); draw(); }
    }

    function caption() {
      cap.classList.add('swap');
      setTimeout(() => {
        $('strong', cap).textContent = SHAPES[si].t;
        $('.s', cap).textContent = SHAPES[si].s;
        $('.idx', cap).textContent = `0${si + 1} / 0${SHAPES.length}`;
        cap.classList.remove('swap');
      }, 320);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const sz = cell > 8 ? cell - 2 : cell - 1;
      for (const k of ['d', 'b', 'r', 'w']) {
        ctx.fillStyle = COL[k];
        for (const p of P) if (p.c === k) ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
      }
    }

    cv.parentElement.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    cv.parentElement.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
    new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(cv);

    function step(now) {
      if (reduced || !on || document.hidden || !W) return;
      const el = now - t0;
      if (phase === 'hold' && el > HOLD) {
        phase = 'burst'; t0 = now;
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        for (const p of P) if (!p.free) {
          const a = Math.atan2(p.y - cy, p.x - cx) + (Math.random() - .5) * 1.4, f = 5 + Math.random() * 13;
          p.vx += Math.cos(a) * f; p.vy += Math.sin(a) * f;
        }
      } else if (phase === 'burst' && el > BURST) {
        phase = 'hold'; t0 = now; si = (si + 1) % SHAPES.length; assign(); caption();
      }
      cap.style.setProperty('--t', phase === 'hold' ? Math.min(1, el / HOLD).toFixed(3) : 1);

      for (const p of P) {
        if (p.free) {
          p.x += Math.cos(now * .0003 + p.ph) * .3 + .18;
          p.y += Math.sin(now * .0004 + p.ph) * .3 - .08;
          if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
          continue;
        }
        if (phase === 'burst') { p.vx *= .9; p.vy *= .9; }
        else {
          p.vx = (p.vx + (p.tx - p.x) * .09) * .74;
          p.vy = (p.vy + (p.ty + Math.sin(now * .002 + p.ph) * .4 - p.y) * .09) * .74;
          const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < 16000) { const d = Math.sqrt(d2) || 1, f = (1 - d2 / 16000) * 6; p.vx += dx / d * f; p.vy += dy / d * f; }
        }
        p.x += p.vx; p.y += p.vy;
      }
      draw();
    }
    step.layout = layout;
    layout();
    return step;
  }
})();
