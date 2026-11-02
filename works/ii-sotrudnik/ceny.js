/* Условия первых трёх компаний и калькулятор времени. Без старых тарифов и доплат. */
window.CENY = {
  pervye3: {nedel: 2, cena: 9900, mest: 3},
  test: {obrascheniy: 20},
  demo: {minut: 2},
  rabochihDnej: 22,
  poUmolchaniyu: {invoices: 20, minutes: 12, rate: 500},
  uchet: [
    {n: '1С:УНФ', s: 'rabotaet', prim: 'заказ и счёт из 1С — проверено'},
    {n: '1С:УТ, КА, ERP', s: 'demo', prim: 'цены, остатки и ответы — на демо-базе УТ 11.5; заказ и счёт — после проверки на копии вашей базы'},
  ],
  kanaly: [
    {n: 'Telegram', s: 'rabotaet'},
    {n: 'Telegram Business', s: 'rabotaet', prim: 'отвечает в вашем аккаунте'},
    {n: 'MAX', s: 'podvas', dni: '1–3'},
    {n: 'Авито', s: 'podvas', dni: '1–3'},
    {n: 'ВКонтакте', s: 'podvas', dni: '1–3'},
    {n: 'Почта', s: 'podvas', dni: '1–3'},
    {n: 'WhatsApp', s: 'podvas'},
    {n: 'Виджет на сайте', s: 'podvas'},
  ],
};
window.CENY.poschitat = function(v, C = window.CENY) {
  const chasov = v.invoices * v.minutes * C.rabochihDnej / 60;
  return {chasov, stoimost: chasov * v.rate};
};
