# -*- coding: utf-8 -*-
"""Сверка по сгоревшему складу Ozon: что лежало против того, что начислили. Движок.

Летом 2026 сгорели склады Ozon, пострадало около 90 000 продавцов. Первый транш пришёл 15–18.09.2026,
впереди окончательный расчёт после инвентаризации. В чатах селлеры не понимают, откуда взялись суммы:
в кабинете они видят цену после скидки за баллы, а возмещение считают от другой.

ЧТО МЫ СЧИТАЕМ И ЧЕГО НЕ СЧИТАЕМ
Мы НЕ говорим «вам должно прийти столько». Первый транш — выплата СПАО «Ингосстрах» по полису с лимитом
150 млн ₽ на случай и пропорциональным урезанием при превышении, методика не раскрыта, окончательный
расчёт будет после инвентаризации. Кто называет тут точную сумму — либо не разобрался, либо мошенник
(АУРЭК, 09.09.2026). Мы считаем только то, что доказуемо из файлов самого продавца:

  1. ПРОПУЩЕНО      SKU лежал на сгоревшем складе, а в отчёте о компенсациях его нет вообще.
                    Чистая разность множеств: ни коэффициент, ни НДС, ни цена тут не нужны, спорить не с чем.
  2. НЕДОСЧИТАЛИ    Единиц на складе больше, чем единиц в начислении. Расхождение в штуках.
  3. АРИФМЕТИКА     Сходится ли отчёт Ozon сам с собой: «Действительная стоимость - всего» = стоимость × кол-во,
                    «Итого к начислению» = «Действительная стоимость - всего» − «Уменьшено на сумму».
  4. КОЭФФИЦИЕНТ    Обратным ходом из их же цифр: k = Итого к начислению × (1 + НДС) ÷ Действительная стоимость.
                    Разные k у одинаковых товаров — вопрос к площадке, а не наша догадка.

Цену-базу («Действительная стоимость товара» против цены продавца) НЕ сверяем. По оферте база — цена из ЛК
с учётом акций, но без скидки за баллы («Предельная цена»), а её история кабинетом массово не выгружается,
только по одному товару. Лестница 7/30/90 дней до 24.09.2026 была другой, а колонки «Баллы за скидки»
и «Цена до скидок» пропали из отчётов с 01.07.2026. Сравнение дало бы расхождения, которых нет.

Каждая цифра в выдаче помечена источником: файл, лист, строка, колонка. Продавец понесёт это в поддержку,
поэтому «примерно столько» бесполезно.

НИКАКИХ КЛЮЧЕЙ. Только файлы, которые продавец выгрузил сам. Оферта Ozon возлагает на продавца убытки от
нарушений при работе с Seller API, а просьба о доступах на фоне мошеннической волны читается однозначно.

    python sverka.py --test                        самопроверка на синтетических файлах, без сети
    python sverka.py --demo                        разбор на выдуманном магазине посуды
    python sverka.py [--nds УСН-7] ФАЙЛ...         сверка по выгрузкам; склад и дату берёт из ведомости сам
"""
import argparse
import datetime as dt
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

HERE = Path(__file__).resolve().parent
KOPEYKA = Decimal("0.01")
POROG_RUB = Decimal("1.00")      # ниже рубля не спорим: у Ozon своё округление, а ложное расхождение дороже пропущенного
POROG_DOLI = Decimal("0.005")    # и не меньше половины процента

# Удары по складам шли четыре дня подряд и по разным городам: дата события у каждого склада своя.
# Посчитать остаток на 24.08 продавцу из Уфы — значит показать количество, которого там ещё не было.
SKLADY = {
    "Чапаевск": "2026-08-22", "Оренбург": "2026-08-24", "Энем": "2026-08-24", "Адыгейск": "2026-08-24",
    "Махачкала": "2026-08-24", "Невинномысск": "2026-08-24", "Уфа": "2026-08-27", "Аксай": "2026-08-29",
    "Белгород": "2026-08-30", "Краснодар": "2026-08-24",
}

# Ставку НДС продавца ни одна выгрузка не отдаёт: она в карточке товара. Спрашиваем, а не подставляем молча —
# у упрощенцев 5 и 7 %, льготная 10 % сохранена, и делитель гуляет от 1,05 до 1,22, то есть до 16 % суммы.
NDS = {"ОСНО": Decimal("0.22"), "УСН-7": Decimal("0.07"), "УСН-5": Decimal("0.05"), "льгота-10": Decimal("0.10"), "без НДС": Decimal("0")}

# Файлы продавца могут содержать данные покупателей. Такой файл не сохраняем вообще, а не «сохраняем и удаляем»:
# чего нет на диске, то не утечёт и о том не надо уведомлять РКН.
STOP_KOLONKI = ["фио", "ф.и.о", "телефон", "покупател", "получател", "адрес доставки", "email", "e-mail", "паспорт"]


def _tekst(z):
    return "" if z is None else str(z).strip()


def klyuch(nazvanie):
    """Имя колонки к сравнимому виду: регистр, пробелы, дефис против тире, хвосты «, руб.» и «, RUB».

    В отчёте о компенсациях «Действительная стоимость - всего» через дефис, в декомпенсациях — через тире,
    а «Итого к начислению» у части продавцов приходит как «Итого к начислению, RUB». Парсер, который ищет
    точное совпадение, падает на первом же настоящем файле.
    """
    s = _tekst(nazvanie).lower().replace("ё", "е")
    s = re.sub(r"[‐-―−]", "-", s)            # все виды тире к обычному дефису
    s = re.sub(r"\((справочно|спр)\.?\)", "", s)            # пометку снимаем раньше единиц: она стоит после них
    s = re.sub(r"[,;]?\s*(руб\.?|rub|₽)\s*\.?\s*$", "", s.strip(" ,;."))
    s = re.sub(r"[\s ]+", " ", s)
    return s.strip(" ,;.:-")


def chislo(z):
    """Число из ячейки. Пробелы-разделители, запятая, минус, скобки как минус, мусор вида 26272.180000000004."""
    if z is None or z == "":
        return None
    if isinstance(z, (int, float, Decimal)):
        return Decimal(str(z))
    s = _tekst(z).replace(" ", "").replace(" ", "").replace("₽", "")
    otric = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", ".")
    if not re.fullmatch(r"-?\d*\.?\d+", s):
        return None
    try:
        d = Decimal(s)
    except InvalidOperation:
        return None
    return -d if otric else d


def data(z):
    """Дата из ячейки: datetime, сериальное число Excel (от 1899-12-30) или строка в четырёх ходовых видах."""
    if isinstance(z, dt.datetime):
        return z.date()
    if isinstance(z, dt.date):
        return z
    n = chislo(z)
    if n is not None and 20000 < n < 80000:   # сериальные даты Excel: 2024-2090 годы
        return dt.date(1899, 12, 30) + dt.timedelta(days=int(n))
    s = _tekst(z)
    for f in ("%d.%m.%Y", "%Y-%m-%d", "%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return dt.datetime.strptime(s[:len(dt.datetime.now().strftime(f))], f).date()
        except ValueError:
            continue
    return None


# --- чтение файла ---------------------------------------------------------------------------------------
# Тип файла определяем по набору колонок, а не по имени файла и не по пункту меню: продавец переименует файл,
# а Ozon переименует пункт меню (и уже переименовал колонки цен 31.08.2026, уже после ударов по складам).
TIPY = [
    ("компенсации", {"sku", "кол-во"}, {"действительная стоимость товара", "итого к начислению"}),
    ("ведомость",   {"sku"},           {"остаток на начало периода", "расход"}),
    ("начисления",  {"sku"},           {"тип начисления"}),
    ("реализация",  {"sku"},           {"цена реализации"}),
]


def _shapka_i_stroki(list_, glubina=25):
    """Строка заголовков — та из первых glubina, после которой идут данные и в которой больше всего непустых
    нечисловых ячеек. У отчёта о реализации шапка двухэтажная и стоит на 13–14 строке, у выгрузки из 1С сверху
    висит «Прайс-лист ООО Ромашка». Первой строкой заголовок искать нельзя.
    """
    # номер строки несём с собой: пустые строки выбрасываем, а нумерация должна остаться как в Excel —
    # продавец пойдёт по нашей ссылке открывать свой файл, и «строка 4» вместо 5 обесценит весь отчёт
    syrye = [(n, list(r)) for n, r in enumerate(list_.iter_rows(values_only=True), 1) if any(_tekst(c) for c in r)]
    if len(syrye) < 2:
        raise ValueError("в файле нет таблицы")
    def ves(i):
        return sum(1 for c in syrye[i][1] if _tekst(c) and chislo(c) is None)
    i = max(range(min(glubina, len(syrye) - 1)), key=ves)
    shirina = max(len(r) for _, r in syrye[i:])
    def yacheyki(k):
        return [_tekst(syrye[k][1][j]) if j < len(syrye[k][1]) else "" for j in range(shirina)]
    shapka = yacheyki(i)
    # второй этаж шапки: если под заголовком строка тоже текстовая и заполняет пустые места — склеиваем
    if i + 1 < len(syrye) and ves(i + 1) >= shirina // 2:
        vtoroy = yacheyki(i + 1)
        if not any(chislo(c) is not None for c in vtoroy):
            shapka = [(b or a) for a, b in zip(shapka, vtoroy)]
            i += 1
    # строка с номерами колонок 1…22 под шапкой — не данные
    j = i + 1
    if j < len(syrye) and sum(1 for c in syrye[j][1] if _tekst(c)) >= shirina // 2:
        nomera = [chislo(c) for c in syrye[j][1] if _tekst(c)]
        if nomera and all(n is not None and n == n.to_integral_value() and 0 < n < 100 for n in nomera):
            j += 1
    return shapka, syrye[j:]


def prochitat(put, imya=None):
    """(тип, строки, мета). Строка — dict {нормализованное имя колонки: ячейка} плюс служебное «_stroka».

    put — путь или файл в памяти. В памяти читаем, когда файл пришёл от человека: файл с данными
    покупателей нельзя записывать на диск даже на секунду, иначе мы уже оператор персональных данных.
    """
    v_pamyati = hasattr(put, "read")
    put = put if v_pamyati else Path(put)
    imya = imya or ("файл" if v_pamyati else put.name)
    import openpyxl
    wb = openpyxl.load_workbook(put, read_only=True, data_only=True)
    try:
        list_ = wb.worksheets[0]
        shapka, syrye = _shapka_i_stroki(list_)
        imya_lista = list_.title
    finally:
        wb.close()   # read_only держит файл открытым, и на Windows его потом не удалить (WinError 32)

    klyuchi = [klyuch(n) for n in shapka]
    stop = [k for k in klyuchi if any(s in k for s in STOP_KOLONKI)]
    if stop:
        raise ValueError("в файле есть данные покупателей (колонки: %s). Такой файл не принимаем — "
                         "нужен отчёт по товарам, а не по заказам" % ", ".join(stop[:3]))

    est = set(klyuchi)
    tip = next((t for t, objaz, prizn in TIPY if objaz <= est and prizn & est), "неизвестный")
    stroki = []
    for nomer, r in syrye:
        d = {klyuchi[i]: c for i, c in enumerate(r[:len(klyuchi)]) if klyuchi[i]}
        if not any(_tekst(v) for v in d.values()):
            continue
        if any(_tekst(v).lower().startswith(("итого", "всего")) for v in list(d.values())[:2]):
            continue   # итоговые строки внизу таблицы: в сверку не идут
        d["_stroka"] = nomer
        stroki.append(d)
    return tip, stroki, {"fayl": imya, "list": imya_lista, "kolonki": shapka}


def pole(stroka, *imena):
    """Значение первой колонки, чьё имя совпало или начинается с искомого. Ozon переименовывает колонки
    (31.08.2026 цены стали называться иначе), поэтому принимаем несколько вариантов и допускаем префикс."""
    for i in imena:
        k = klyuch(i)
        if k in stroka:
            return stroka[k]
    for i in imena:
        k = klyuch(i)
        for nk, v in stroka.items():
            if nk != "_stroka" and (nk.startswith(k) or k.startswith(nk)) and len(nk) > 3:
                return v
    return None


def sku(stroka):
    z = pole(stroka, "SKU", "sku ozon", "ozon id", "идентификатор товара")
    n = chislo(z)
    return str(int(n)) if n is not None else (_tekst(z) or None)


# --- сверка ---------------------------------------------------------------------------------------------
class Istochnik(str):
    """Строка-число со ссылкой на файл, лист и клетку. Продавец должен видеть, откуда взята каждая цифра."""
    def __new__(cls, znach, meta, stroka, kolonka):
        o = super().__new__(cls, "%s, лист «%s», строка %s, колонка «%s»" % (meta["fayl"], meta["list"], stroka, kolonka))
        o.znach = znach
        return o


def _ved_sklad(stroka):
    return _tekst(pole(stroka, "название склада", "склад", "склад отгрузки"))


def sklad_gorel(nazvanie):
    """Склад из ведомости против справочника сгоревших. Ozon пишет их по-разному («Энем», «Адыгейск (Энем)»)."""
    n = _tekst(nazvanie).lower()
    for gorod, kogda in SKLADY.items():
        if gorod.lower() in n:
            return gorod, dt.date.fromisoformat(kogda)
    return None, None


def svertka(fayly, rezhim_nds="ОСНО"):
    """Сверка по набору выгрузок. Возвращает (строки, сводка, предупреждения)."""
    if rezhim_nds not in NDS:
        raise ValueError("режим НДС: один из %s" % ", ".join(NDS))
    nds = NDS[rezhim_nds]
    ved, komp, meta_ved, meta_komp, preduprezhdeniya = [], [], None, None, []

    for f in fayly:
        tip, stroki, meta = prochitat(*f) if isinstance(f, tuple) else prochitat(f)
        if tip == "ведомость":
            ved += [(s, meta) for s in stroki]; meta_ved = meta
        elif tip == "компенсации":
            komp += [(s, meta) for s in stroki]; meta_komp = meta
        else:
            preduprezhdeniya.append("%s: не понял тип файла (колонки: %s). В сверку не пошёл."
                                    % (meta["fayl"], ", ".join(c for c in meta["kolonki"][:6] if c)))
    if not komp:
        raise ValueError("нет отчёта о компенсациях: Финансы → Документы → Компенсации и прочие начисления")
    if not ved:
        raise ValueError("нет оборотной ведомости: Аналитика → Отчёты → Продажи со склада Ozon, "
                         "период должен начинаться датой пожара")

    # что лежало на сгоревших складах на дату события
    lezhalo = {}
    for s, meta in ved:
        k = sku(s)
        gorod, kogda = sklad_gorel(_ved_sklad(s))
        if not k or not gorod:
            continue
        n = chislo(pole(s, "остаток на начало периода", "остаток на начало"))
        if n is None or n <= 0:
            continue
        z = lezhalo.setdefault(k, {"kolvo": Decimal(0), "sklady": set(), "data": kogda, "istochnik": None, "nazvanie": ""})
        z["kolvo"] += n
        z["nazvanie"] = z["nazvanie"] or _tekst(pole(s, "название товара", "наименование товара", "товар"))
        z["sklady"].add(gorod)
        z["data"] = min(z["data"], kogda)
        z["istochnik"] = z["istochnik"] or Istochnik(n, meta, s["_stroka"], "Остаток на начало периода")

    # что начислено
    nachislili = {}
    for s, meta in komp:
        k = sku(s)
        if not k:
            continue
        kolvo = chislo(pole(s, "кол-во", "количество")) or Decimal(1)
        z = nachislili.setdefault(k, {"kolvo": Decimal(0), "stoimost_ed": None, "vsego": Decimal(0),
                                      "umensheno": Decimal(0), "itogo": Decimal(0), "tip": set(), "stroki": []})
        z["kolvo"] += kolvo
        z["stoimost_ed"] = z["stoimost_ed"] or chislo(pole(s, "действительная стоимость товара"))
        for imya, kuda in (("действительная стоимость - всего", "vsego"), ("уменьшено на сумму", "umensheno"),
                           ("итого к начислению", "itogo")):
            v = chislo(pole(s, imya))
            if v is not None:
                z[kuda] += v
        z["tip"].add(_tekst(pole(s, "тип компенсации")))
        z["stroki"].append((s, meta))

    itog = []
    for k in sorted(set(lezhalo) | set(nachislili), key=lambda x: -(lezhalo.get(x, {}).get("kolvo") or 0)):
        l, n = lezhalo.get(k), nachislili.get(k)
        r = {"sku": k, "nazvanie": "", "nahodki": []}
        if n:
            s0, _ = n["stroki"][0]
            r["nazvanie"] = _tekst(pole(s0, "название товара", "наименование товара", "товар"))
            r["artikul"] = _tekst(pole(s0, "артикул"))
        # у пропущенной позиции имени в компенсациях нет по определению: берём из ведомости, иначе продавец
        # увидит голый SKU там, где находка самая важная
        r["nazvanie"] = r["nazvanie"] or (l["nazvanie"] if l else "")
        r["lezhalo"] = l["kolvo"] if l else None
        r["sklady"] = ", ".join(sorted(l["sklady"])) if l else ""
        r["data"] = l["data"].isoformat() if l else ""
        r["nachisleno_kolvo"] = n["kolvo"] if n else None
        r["itogo"] = n["itogo"] if n else None
        r["istochnik_lezhalo"] = l["istochnik"] if l else None
        r["istochnik_itogo"] = Istochnik(n["itogo"], n["stroki"][0][1], n["stroki"][0][0]["_stroka"], "Итого к начислению") if n else None

        # 1. пропущено целиком
        if l and not n:
            r["nahodki"].append(("ПРОПУЩЕНО", "лежало %s шт. на складе %s (%s), в отчёте о компенсациях этого SKU нет"
                                 % (_sht(l["kolvo"]), r["sklady"], r["data"])))
        # 2. недосчитали штук
        if l and n and l["kolvo"] > n["kolvo"]:
            r["nahodki"].append(("НЕДОСЧИТАЛИ", "лежало %s шт., начислено за %s шт., разница %s шт."
                                 % (_sht(l["kolvo"]), _sht(n["kolvo"]), _sht(l["kolvo"] - n["kolvo"]))))
        if l and n and n["kolvo"] > l["kolvo"]:
            r["nahodki"].append(("БОЛЬШЕ ЧЕМ ЛЕЖАЛО", "начислено за %s шт., а на складе было %s шт. — проверьте, "
                                 "не попали ли сюда другие склады" % (_sht(n["kolvo"]), _sht(l["kolvo"]))))
        if n:
            # 3. арифметика их же отчёта
            if n["stoimost_ed"] is not None and n["vsego"]:
                dolzhno = n["stoimost_ed"] * n["kolvo"]
                if _razoshlos(dolzhno, n["vsego"]):
                    r["nahodki"].append(("АРИФМЕТИКА", "«Действительная стоимость - всего» %s, а стоимость единицы %s × %s шт. = %s"
                                         % (_rub(n["vsego"]), _rub(n["stoimost_ed"]), _sht(n["kolvo"]), _rub(dolzhno))))
            if n["vsego"] and n["umensheno"]:
                dolzhno = n["vsego"] - n["umensheno"]
                if _razoshlos(dolzhno, n["itogo"]):
                    r["nahodki"].append(("АРИФМЕТИКА", "«Итого к начислению» %s, а «всего» %s − «уменьшено» %s = %s"
                                         % (_rub(n["itogo"]), _rub(n["vsego"]), _rub(n["umensheno"]), _rub(dolzhno))))
            # 4. коэффициент обратным ходом
            if n["vsego"] and n["itogo"]:
                r["koef"] = ((n["itogo"] * (1 + nds)) / n["vsego"]).quantize(Decimal("0.001"))
        itog.append(r)

    svodka = _svodka(itog, rezhim_nds, nds)
    if meta_ved:
        preduprezhdeniya += _proverit_period(ved, meta_ved)
    return itog, svodka, preduprezhdeniya


def _proverit_period(ved, meta):
    """Ведомость обязана начинаться датой пожара: иначе «остаток на начало периода» — это остаток другого дня."""
    daty = [d for d in (data(pole(s, "дата начала периода", "начало периода", "период с")) for s, _ in ved) if d]
    if not daty:
        return []
    nachalo, nuzhno = min(daty), sorted({dt.date.fromisoformat(v) for v in SKLADY.values()})
    if nachalo not in nuzhno:
        return ["%s: период начинается %s, а пожары были %s. «Остаток на начало периода» относится к началу "
                "периода, поэтому выгрузку надо пересделать с нужной даты." %
                (meta["fayl"], nachalo.isoformat(), ", ".join(d.isoformat() for d in nuzhno))]
    return []


def _koef_vrazbros(itog):
    """Разные коэффициенты внутри одного отчёта — повод спросить площадку, но только если товары сравнимы."""
    k = sorted({r["koef"] for r in itog if r.get("koef")})
    return (k[0], k[-1]) if len(k) > 1 and k[-1] - k[0] > Decimal("0.01") else None


def _svodka(itog, rezhim_nds, nds):
    propusheno = [r for r in itog if any(t == "ПРОПУЩЕНО" for t, _ in r["nahodki"])]
    nedoschitali = [r for r in itog if any(t == "НЕДОСЧИТАЛИ" for t, _ in r["nahodki"])]
    arifmetika = [r for r in itog if any(t == "АРИФМЕТИКА" for t, _ in r["nahodki"])]
    return {
        "vsego_sku": len(itog),
        "nachisleno_rub": sum((r["itogo"] or Decimal(0)) for r in itog),
        "propusheno_sku": len(propusheno),
        "propusheno_sht": sum((r["lezhalo"] or Decimal(0)) for r in propusheno),
        "nedoschitali_sku": len(nedoschitali),
        "nedoschitali_sht": sum((r["lezhalo"] - r["nachisleno_kolvo"]) for r in nedoschitali),
        "arifmetika_sku": len(arifmetika),
        "koef_vrazbros": _koef_vrazbros(itog),
        "rezhim_nds": rezhim_nds, "nds": nds,
    }


def _razoshlos(a, b):
    if a is None or b is None:
        return False
    d = abs(a - b)
    return d > POROG_RUB and (not max(abs(a), abs(b)) or d / max(abs(a), abs(b)) > POROG_DOLI)


def _rub(d):
    return "—" if d is None else ("{:,.2f}".format(d.quantize(KOPEYKA)).replace(",", " ").replace(".", ",") + " ₽")


def _sht(d):
    return "—" if d is None else str(int(d)) if d == d.to_integral_value() else str(d)


# --- выдача ---------------------------------------------------------------------------------------------
ZAGOLOVOK = """СВЕРКА ПО СГОРЕВШЕМУ СКЛАДУ OZON
Расчёт подготовлен по файлам, предоставленным заказчиком. Исполнитель не является представителем заказчика.
Документ подписывает и подаёт заказчик самостоятельно.

Размер будущей выплаты здесь не назван и назван быть не может: первый транш — выплата СПАО «Ингосстрах»
по полису с лимитом на страховой случай, методика не раскрыта, окончательный расчёт будет после
инвентаризации. Показано только то, что видно из ваших же файлов: что лежало, что начислено и где
это не сходится."""


def otchet(itog, svodka, preduprezhdeniya=()):
    v = [ZAGOLOVOK, ""]
    for p in preduprezhdeniya:
        v.append("! " + p)
    if preduprezhdeniya:
        v.append("")
    s = svodka
    v.append("Позиций в сверке: %d. Начислено по отчёту Ozon: %s. Режим НДС: %s (делитель %s)."
             % (s["vsego_sku"], _rub(s["nachisleno_rub"]), s["rezhim_nds"], 1 + s["nds"]))
    v.append("")
    if s["propusheno_sku"]:
        v.append("ПРОПУЩЕНО ЦЕЛИКОМ: %d SKU, %s шт. Лежали на сгоревшем складе, в отчёте о компенсациях их нет."
                 % (s["propusheno_sku"], _sht(s["propusheno_sht"])))
    if s["nedoschitali_sku"]:
        v.append("НЕДОСЧИТАЛИ ШТУК: %d SKU, всего %s шт. разницы между остатком и начислением."
                 % (s["nedoschitali_sku"], _sht(s["nedoschitali_sht"])))
    if s["arifmetika_sku"]:
        v.append("НЕ СХОДИТСЯ АРИФМЕТИКА САМОГО ОТЧЁТА: %d SKU." % s["arifmetika_sku"])
    if s["koef_vrazbros"]:
        a, b = s["koef_vrazbros"]
        v.append("КОЭФФИЦИЕНТ ВОЗМЕЩЕНИЯ ГУЛЯЕТ: от %s до %s. Он зависит от категории и типа товара, "
                 "и если товары однотипные — это вопрос к площадке." % (a, b))
    if not any((s["propusheno_sku"], s["nedoschitali_sku"], s["arifmetika_sku"])):
        v.append("Расхождений не нашлось: всё, что лежало на складе, попало в отчёт, и отчёт сходится сам с собой.")
    v.append("")
    v.append("-" * 100)
    for r in itog:
        if not r["nahodki"]:
            continue
        v.append("SKU %s  %s" % (r["sku"], r["nazvanie"] or ""))
        for tip, txt in r["nahodki"]:
            v.append("   [%s] %s" % (tip, txt))
        if r.get("istochnik_lezhalo"):
            v.append("   источник остатка:    %s" % r["istochnik_lezhalo"])
        if r.get("istochnik_itogo"):
            v.append("   источник начисления: %s" % r["istochnik_itogo"])
        if r.get("koef"):
            v.append("   коэффициент обратным ходом: %s" % r["koef"])
        v.append("")
    return "\n".join(v)


def demo():
    """Нулевая ступень: человек смотрит, что выдаёт сверка, ещё не имея своих файлов на руках.

    Выдуманный магазин посуды «Ковш и Крышка», склад Чапаевск (22.08.2026). Цифры подобраны так, чтобы
    показать все четыре вида находок сразу; у живого продавца их обычно меньше.
    """
    import shutil
    import tempfile
    import test_sverka as T
    papka = Path(tempfile.mkdtemp())
    T.VREMENNO = papka
    try:
        v = T.vedomost(stroki=[
            ("1502334411", "Ковш нержавеющий 2 л", "Чапаевск", 120),
            ("1502334422", "Кофеварка гейзерная 450 мл", "Чапаевск", 46),
            ("1502334433", "Сковорода чугунная 26 см", "Чапаевск", 18),
            ("1502334444", "Крышка стеклянная 26 см", "Чапаевск", 240),
            ("1502334455", "Набор ножей 6 предметов", "Москва Хоругвино", 310),
        ])
        k = T.kompensacii(stroki=[
            ("1502334411", "Ковш нержавеющий 2 л", 120, 640.0, 76800.0, 39321.6, 37478.4),
            ("1502334422", "Кофеварка гейзерная 450 мл", 31, 2190.0, 67890.0, 34756.6, 33133.4),
            ("1502334433", "Сковорода чугунная 26 см", 18, 3400.0, 55000.0, 28163.9, 26836.1),
        ], itogo_imya="Итого к начислению, RUB")
        itog, svodka, pred = svertka([v, k], "ОСНО")
        print(otchet(itog, svodka, pred))
        print("-" * 100)
        print("Это выдуманный магазин. Чтобы посчитать по вашему, нужны два файла из вашего кабинета:")
        print("  1. Аналитика → Отчёты → Продажи со склада Ozon → оборотная ведомость по товарам.")
        print("     Период обязан НАЧИНАТЬСЯ датой пожара на вашем складе, иначе «остаток на начало периода»")
        print("     будет остатком другого дня. Кабинет не отдаёт последние двое суток — это нормально.")
        print("  2. Финансы → Документы → Компенсации и прочие начисления → отчёт о компенсациях.")
        print("  Ключи, логин и доступ в кабинет не нужны и не будут запрошены ни на одном шаге.")
    finally:
        shutil.rmtree(papka, ignore_errors=True)
    return 0


def main():
    p = argparse.ArgumentParser(description="Сверка по сгоревшему складу Ozon")
    p.add_argument("fayly", nargs="*", help="выгрузки из кабинета: оборотная ведомость и отчёт о компенсациях")
    p.add_argument("--nds", default="ОСНО", choices=list(NDS), help="режим НДС продавца")
    p.add_argument("--test", action="store_true", help="самопроверка на синтетических файлах")
    p.add_argument("--demo", action="store_true", help="показать, что выдаёт сверка, на выдуманном магазине посуды")
    a = p.parse_args()
    if a.test:
        import test_sverka
        return test_sverka.main()
    if a.demo:
        return demo()
    if not a.fayly:
        p.error("нужны файлы выгрузок (или --test)")
    itog, svodka, pred = svertka(a.fayly, a.nds)
    print(otchet(itog, svodka, pred))


if __name__ == "__main__":
    sys.exit(main() or 0)
