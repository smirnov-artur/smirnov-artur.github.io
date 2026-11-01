/* «ИИ-сотрудник» — все цены и статусы подключений страницы в одном месте.
   Цены решены владельцем (бриф 01.11.2026, вторая версия по разбору рынка — тот же день). Меняете число здесь — таблица цен,
   сетка подключений и калькулятор пересчитываются сами. Сеть не нужна.

   Статусы: rabotaet — работает; demo — проверено на демо; podvas — подключим под вас (dni — срок). */
window.CENY = {
  podklyuchenie: {
    baza: 39900,        // основа для 1С:УНФ и систем «под вас»: один канал, роль «Продавец», тест на ваших переписках, неделя подсказчика
                        // у 1С:УТ/КА/ERP своя основа — uchet[].baza
    kanal: 4900,        // каждый следующий готовый канал (rabotaet)
    uchetPodVas: 19900, // учётная система со статусом podvas
    rol: 9900,          // каждая роль сверх «Продавца»
    kanalPodVas: 9900,  // каждый канал со статусом podvas (MAX, Авито, ВК, почта, WhatsApp, виджет)
  },
  pilot: { cena: 64900, nedel: 2, garantiya: 95, vpered: 0.5, otchetDen: 7 },   // половина вперёд, половина после отчёта на 7-й день
  mesyac: {
    prodavec: [[1000, 19900], [3000, 29900], [10000, 49900]], // [до диалогов в месяц, ₽]; больше — договоримся
    marketplejsy: [[1000, 3900], [5000, 7900]],              // [до ответов в месяц, ₽]
    buhgalter: 9900,
    zakupki: 7900,
    kanal: 1900,        // первый канал включён, каждый следующий
  },
  skidkaZaGod: 0.2,     // −20 % на подписку при оплате за год

  vznosy: 1.3,          // зарплата × 1,3 — взносы работодателя
  dnejVMesyace: 30,     // клиенты пишут каждый день, и в выходные тоже
  chasovNedelya: 40,    // сколько часов в неделю сейчас отвечают люди (5/2 по 8 ч) — для строки «ночью и в выходные»
  poUmolchaniyu: { vDen: 30, lyudi: 1, zp: 100000, uchet: 'unf', kanaly: ['tg'] },   // зарплата: медиана hh.ru 103 300 ₽ (9 мес. 2026), округлили вниз

  uchet: [
    { k: 'unf', n: '1С:УНФ', s: 'rabotaet' },
    { k: 'ut', n: '1С:УТ, КА, ERP', s: 'demo', prim: 'заказ и счёт прошли на демо-базе', baza: 59900 },   // сложнее — своя основа
    { k: 'rozn', n: '1С:Розница', s: 'podvas', dni: '3–7' },
    { k: 'bp', n: '1С:Бухгалтерия', s: 'podvas', dni: '3–7' },
    { k: 'ms', n: 'МойСклад', s: 'podvas', dni: '3–7' },
    { k: 'b24', n: 'Битрикс24', s: 'podvas', dni: '3–7' },
    { k: 'amo', n: 'amoCRM', s: 'podvas', dni: '3–7' },
    { k: 'retail', n: 'RetailCRM', s: 'podvas', dni: '3–7' },
    { k: 'insales', n: 'InSales', s: 'podvas', dni: '3–7' },
    { k: 'gs', n: 'Google-таблица', s: 'podvas', dni: '3–7' },
  ],
  kanaly: [
    { k: 'tg', n: 'Telegram-бот', s: 'rabotaet' },
    { k: 'tgb', n: 'Telegram Business', s: 'rabotaet', prim: 'отвечает в вашем аккаунте' },
    { k: 'max', n: 'MAX', s: 'podvas', dni: '1–3' },
    { k: 'avito', n: 'Авито', s: 'podvas', dni: '1–3' },
    { k: 'vk', n: 'ВКонтакте', s: 'podvas', dni: '1–3' },
    { k: 'pochta', n: 'Почта', s: 'podvas', dni: '1–3' },
    { k: 'wa', n: 'WhatsApp', s: 'podvas' },
    { k: 'sajt', n: 'Виджет на сайте', s: 'podvas' },
  ],
  roli: [
    { k: 'prodavec', n: 'Продавец', s: 'rabotaet', chto: 'отвечает клиентам, торгуется, проводит заказ, присылает счёт, дожимает оплату' },
    { k: 'marketplejsy', n: 'Маркетплейсы', s: 'demo', chto: 'ответы на отзывы и вопросы WB, Ozon, Яндекс Маркета' },
    { k: 'buhgalter', n: 'Бухгалтер', s: 'demo', chto: 'выписка банка → оплаты в 1С, акт сверки, долги' },
    { k: 'zakupki', n: 'Закупки', s: 'demo', chto: 'что кончается, черновик заказа поставщику' },
  ],
};

/* Расчёт. v = { vDen, lyudi, zp, uchet, kanaly: [k…], roli: { marketplejsy: 0|1000|5000, buhgalter: bool, zakupki: bool }, god: bool }
   Подключение = основа выбранной системы + система «под вас» + готовые каналы сверх первого × 4 900 + каналы «под вас» × 9 900 + доп. роли × 9 900.
   В месяц     = Продавец по ступени диалогов + роли + каналы сверх первого × 1 900; за год — минус 20 %.
   Отдел       = люди × зарплата × 1,3.   Экономия = отдел − в месяц.   За год = экономия × 12 − подключение.
   Окупится    = подключение ÷ (экономия ÷ 30), в днях. */
window.CENY.poschitat = function (v, C = window.CENY) {
  const P = C.podklyuchenie, M = C.mesyac, sum = a => a.reduce((s, [, x]) => s + x, 0);
  const dialogov = v.vDen * C.dnejVMesyace;
  const sys = C.uchet.find(s => s.k === v.uchet) || C.uchet[0];
  const kan = C.kanaly.filter(k => v.kanaly.includes(k.k));
  const gotovyh = kan.filter(k => k.s !== 'podvas').length;
  const podvas = kan.filter(k => k.s === 'podvas');
  const kanalov = Math.max(1, kan.length);

  const podkl = [['Основа · ' + (sys.s === 'podvas' ? 'учётная система' : sys.n), sys.baza || P.baza]];
  if (sys.s === 'podvas') podkl.push([sys.n + ' — под вас', P.uchetPodVas]);
  if (gotovyh > 1) podkl.push(['Готовые каналы сверх первого: ' + (gotovyh - 1), (gotovyh - 1) * P.kanal]);
  podvas.forEach(k => podkl.push([k.n + ' — под вас', P.kanalPodVas]));

  const stupen = M.prodavec.find(([d]) => dialogov <= d);
  const mes = [['Продавец, до ' + (stupen ? stupen[0] : M.prodavec.at(-1)[0]).toLocaleString('ru-RU') + ' диалогов', stupen ? stupen[1] : 0]];
  const mp = v.roli.marketplejsy && M.marketplejsy.find(([d]) => d === v.roli.marketplejsy);
  if (mp) { podkl.push(['Роль «Маркетплейсы»', P.rol]); mes.push(['Маркетплейсы, до ' + mp[0].toLocaleString('ru-RU') + ' ответов', mp[1]]); }
  if (v.roli.buhgalter) { podkl.push(['Роль «Бухгалтер»', P.rol]); mes.push(['Бухгалтер', M.buhgalter]); }
  if (v.roli.zakupki) { podkl.push(['Роль «Закупки»', P.rol]); mes.push(['Закупки', M.zakupki]); }
  if (kanalov > 1) mes.push(['Каналы сверх первого: ' + (kanalov - 1), (kanalov - 1) * M.kanal]);

  const podklSum = sum(podkl);
  const polnaya = stupen ? sum(mes) : null;                 // null — больше 10 000 диалогов: договоримся
  const skidka = v.god && polnaya !== null ? Math.round(polnaya * C.skidkaZaGod) : 0;
  const mesyac = polnaya === null ? null : polnaya - skidka;
  const otdel = v.lyudi * v.zp * C.vznosy;
  const ekon = mesyac === null ? null : otdel - mesyac;
  return {
    dialogov, podkl, podklSum, mes, polnaya, skidka, mesyac, otdel, ekon,
    god: ekon === null ? null : ekon * 12 - podklSum,
    dnej: ekon > 0 ? Math.ceil(podklSum / (ekon / C.dnejVMesyace)) : null,
  };
};

if (typeof module !== 'undefined') module.exports = window.CENY;   // для проверки из node
