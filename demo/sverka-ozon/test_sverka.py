# -*- coding: utf-8 -*-
"""Самопроверка сверки: синтетические выгрузки, собранные по образцам Ozon, без сети и без живых файлов.

Проверяем не «работает ли openpyxl», а то, на чём сверка реально ломается в бою:
шапка не в первой строке, переименованные колонки, тире вместо дефиса, «, RUB» в хвосте,
Кол-во больше единицы, мусорные хвосты float, чужой склад, период не с даты пожара, данные покупателей.

    python test_sverka.py        или        python sverka.py --test
"""
import shutil
import sys
import tempfile
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sverka as S

VREMENNO = Path(tempfile.mkdtemp())


def xlsx(imya, stroki, list_="Sheet1"):
    import openpyxl
    wb = openpyxl.Workbook()
    wb.worksheets[0].title = list_
    for r in stroki:
        wb.worksheets[0].append(r)
    p = VREMENNO / imya
    wb.save(p)
    return p


def vedomost(imya="ostatki.xlsx", stroki=(), period="22.08.2026"):
    """Оборотная ведомость: сверху заголовок отчёта, шапка третьей строкой — как в выгрузке кабинета."""
    return xlsx(imya, [
        ["Оборотная ведомость по товарам"], [],
        ["SKU", "Название товара", "Название склада", "Дата начала периода",
         "Остаток на начало периода", "Приход", "Расход", "Остаток на конец периода"],
    ] + [list(r[:4]) + [r[4], 0, 0, r[4]] for r in [(s, n, sk, period, k) for s, n, sk, k in stroki]])


def kompensacii(imya="komp.xlsx", stroki=(), itogo_imya="Итого к начислению"):
    """Отчёт о компенсациях. По умолчанию имена колонок как в справке Ozon; в тестах их же и ломаем."""
    return xlsx(imya, [
        ["Отчет о компенсациях № 77 от 05.09.2026"], [],
        ["№", "Название товара", "Артикул", "SKU", "Штрих-код", "Кол-во", "Тип компенсации",
         "Действительная стоимость товара", "Действительная стоимость - всего", "Уменьшено на сумму", itogo_imya],
    ] + [[i + 1, n, "ART-%s" % s, s, 4601234567890 + i, k, "потеря по вине Ozon на складе", ed, vsego, um, it]
         for i, (s, n, k, ed, vsego, um, it) in enumerate(stroki)], list_="Компенсации")


def проверка_разбор_колонок():
    assert S.klyuch("Действительная стоимость — всего") == "действительная стоимость - всего", "тире не свелось к дефису"
    assert S.klyuch("Итого к начислению, RUB") == "итого к начислению", "хвост RUB не срезан"
    assert S.klyuch("Итого к начислению, руб.") == "итого к начислению", "хвост руб. не срезан"
    assert S.klyuch("Цена до скидок по поручению продавца, руб., (справочно)") == "цена до скидок по поручению продавца"
    assert S.klyuch("ЦЕНА  РЕАЛИЗАЦИИ") == "цена реализации", "неразрывный пробел и регистр"


def проверка_чисел_и_дат():
    assert S.chislo("26272,180000000004") == Decimal("26272.180000000004")
    assert S.chislo("1 234,50") == Decimal("1234.50"), "пробел-разделитель тысяч"
    assert S.chislo("(500)") == Decimal("-500"), "скобки это минус"
    assert S.chislo("") is None and S.chislo("абв") is None
    import datetime as dt
    assert S.data(45800) == dt.date(2025, 5, 23), "сериальная дата Excel"
    assert S.data("22.08.2026") == dt.date(2026, 8, 22)
    assert S.data("2026-08-22") == dt.date(2026, 8, 22)


def проверка_шапка_в_двух_этажах():
    """Отчёт о реализации: группы в одной строке, имена колонок в следующей, под ними номера 1…N."""
    p = xlsx("realizaciya.xlsx", [
        ["Отчет о реализации № 5 от 01.09.2026"], [],
        ["№ п/п", "Название товара", "SKU", "Реализовано", "", "Возвращено клиентом"],
        ["", "", "", "Кол-во", "Цена реализации", "Кол-во"],
        [1, 2, 3, 4, 5, 6],
        [1, "Ковшик", 111, 3, 99.0, 0],
    ])
    tip, stroki, meta = S.prochitat(p)
    assert tip == "реализация", "тип определился как %s" % tip
    assert len(stroki) == 1, "строк данных %d, а должна быть одна: строку с номерами колонок съели не ту" % len(stroki)
    assert S.chislo(S.pole(stroki[0], "цена реализации")) == Decimal("99"), "второй этаж шапки не склеился"
    assert stroki[0]["_stroka"] == 6, "номер строки для источника посчитан неверно: %s" % stroki[0]["_stroka"]


def проверка_данные_покупателей_не_принимаем():
    p = xlsx("zakazy.xlsx", [["SKU", "Кол-во", "ФИО покупателя", "Телефон"], [111, 1, "Иванов И.И.", "+79990000000"]])
    try:
        S.prochitat(p)
    except ValueError as e:
        assert "данные покупателей" in str(e), "не та ошибка: %s" % e
        return
    raise AssertionError("файл с данными покупателей приняли — так нельзя")


def проверка_пропущено_целиком():
    """Товар лежал на сгоревшем складе, а в компенсациях его нет. Самая бесспорная находка: спорить не с чем."""
    v = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 10), ("222", "Кофеварка", "Чапаевск", 4)])
    k = kompensacii(stroki=[("111", "Ковшик", 10, 100, 1000, 500, 500)])
    itog, svodka, pred = S.svertka([v, k])
    assert svodka["propusheno_sku"] == 1 and svodka["propusheno_sht"] == 4, svodka
    r = next(x for x in itog if x["sku"] == "222")
    assert any(t == "ПРОПУЩЕНО" for t, _ in r["nahodki"])
    assert r["nazvanie"] == "Кофеварка", "у пропущенной позиции пропало название: в компенсациях его нет, берём из ведомости"
    assert "строка 5" in r["istochnik_lezhalo"], "источник остатка без номера строки: %s" % r["istochnik_lezhalo"]


def проверка_недосчитали_штук():
    v = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 10)])
    k = kompensacii(stroki=[("111", "Ковшик", 4, 100, 400, 200, 200)])
    itog, svodka, _ = S.svertka([v, k])
    assert svodka["nedoschitali_sku"] == 1 and svodka["nedoschitali_sht"] == 6, svodka
    assert "6 шт." in dict((t, x) for t, x in itog[0]["nahodki"])["НЕДОСЧИТАЛИ"]


def проверка_арифметика_отчёта():
    """Их же отчёт не сходится сам с собой: стоимость 100 × 10 шт. = 1000, а в «всего» стоит 800."""
    v = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 10)])
    k = kompensacii(stroki=[("111", "Ковшик", 10, 100, 800, 400, 400)])
    itog, svodka, _ = S.svertka([v, k])
    assert svodka["arifmetika_sku"] == 1, svodka
    txt = " ".join(x for t, x in itog[0]["nahodki"] if t == "АРИФМЕТИКА")
    assert "1 000,00 ₽" in txt, txt


def проверка_копейка_не_расхождение():
    """Округление Ozon (1229,5 против 1229,51) не должно давать ложных находок на каждой строке."""
    v = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 1)])
    k = kompensacii(stroki=[("111", "Ковшик", 1, 1229.5082, 1229.5, 0, 1229.5)])
    itog, svodka, _ = S.svertka([v, k])
    assert svodka["arifmetika_sku"] == 0, "копеечное расхождение показали как ошибку: %s" % itog[0]["nahodki"]


def проверка_чужой_склад_не_считаем():
    """Москва не горела: её остатки в сверку не идут, иначе покажем продавцу чужие цифры."""
    v = vedomost(stroki=[("111", "Ковшик", "Москва Хоругвино", 50), ("222", "Кофеварка", "Чапаевск", 2)])
    k = kompensacii(stroki=[("222", "Кофеварка", 2, 100, 200, 100, 100)])
    itog, svodka, _ = S.svertka([v, k])
    assert svodka["propusheno_sku"] == 0, "склад не из списка сгоревших попал в сверку"
    assert not any(r["sku"] == "111" for r in itog), "позиция с чужого склада в отчёте"


def проверка_период_не_с_даты_пожара():
    v = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 10)], period="01.09.2026")
    k = kompensacii(stroki=[("111", "Ковшик", 10, 100, 1000, 500, 500)])
    _, _, pred = S.svertka([v, k])
    assert any("период начинается 2026-09-01" in p for p in pred), "не предупредили про неверный период: %s" % pred


def проверка_переименованные_колонки():
    """У части продавцов «Итого к начислению, RUB», а Ozon переименовал колонки цен 31.08.2026 — после пожаров."""
    v = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 10)])
    k = kompensacii(stroki=[("111", "Ковшик", 4, 100, 400, 200, 200)], itogo_imya="Итого к начислению, RUB")
    itog, svodka, _ = S.svertka([v, k])
    assert svodka["nachisleno_rub"] == Decimal("200"), "колонку с хвостом RUB не нашли: %s" % svodka


def проверка_коэффициент_обратным_ходом():
    """Официальный пример Ozon: (100 × 0,61) ÷ 1,22 = 50. Обратным ходом должно выйти 0,61."""
    v = vedomost(stroki=[("111", "Автофлаг", "Чапаевск", 1), ("222", "Автофлаг синий", "Чапаевск", 1)])
    k = kompensacii(stroki=[("111", "Автофлаг", 1, 100, 100, 50, 50), ("222", "Автофлаг синий", 1, 100, 100, 65, 35)])
    itog, svodka, _ = S.svertka([v, k], rezhim_nds="ОСНО")
    assert next(r for r in itog if r["sku"] == "111")["koef"] == Decimal("0.610"), itog
    assert svodka["koef_vrazbros"], "разные коэффициенты у однотипных товаров не замечены"


def проверка_нет_обязательного_файла():
    v = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 10)])
    try:
        S.svertka([v])
    except ValueError as e:
        assert "Компенсации и прочие начисления" in str(e), e
        return
    raise AssertionError("сверка без отчёта о компенсациях не должна проходить")


def проверка_отчёт_не_обещает_лишнего():
    v = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 10)])
    k = kompensacii(stroki=[("111", "Ковшик", 4, 100, 400, 200, 200)])
    itog, svodka, pred = S.svertka([v, k])
    t = S.otchet(itog, svodka, pred)
    for zapret in ("вам должны", "вам положено", "гарантиру", "вернём деньги", "процент от"):
        assert zapret not in t.lower(), "в отчёте обещание, за которое нас примут за мошенников: «%s»" % zapret
    assert "Ингосстрах" in t and "не является представителем заказчика" in t, "нет обязательной оговорки"


def проверка_чтение_из_памяти():
    """Файл человека разбираем в памяти: выгрузка с данными покупателей не должна коснуться диска вовсе."""
    p = vedomost(stroki=[("111", "Ковшик", "Чапаевск", 10)])
    buf = __import__("io").BytesIO(p.read_bytes())
    tip, stroki, meta = S.prochitat(buf, "ostatki-ot-cheloveka.xlsx")
    assert tip == "ведомость" and len(stroki) == 1, (tip, len(stroki))
    assert meta["fayl"] == "ostatki-ot-cheloveka.xlsx", "имя файла в источнике потерялось: %s" % meta["fayl"]


def проверка_тип_файла_по_колонкам():
    """Имя файла человек меняет, а Ozon меняет названия пунктов меню. Тип определяем только по колонкам."""
    assert S.prochitat(vedomost("kak-ugodno-nazvannyy.xlsx", [("111", "Ковшик", "Чапаевск", 1)]))[0] == "ведомость"
    assert S.prochitat(kompensacii("otchet.xlsx", [("111", "Ковшик", 1, 100, 100, 50, 50)]))[0] == "компенсации"
    chuzhoy = xlsx("chuzhoy.xlsx", [["Колонка А", "Колонка Б"], ["раз", "два"]])
    assert S.prochitat(chuzhoy)[0] == "неизвестный", "чужой файл принят за отчёт Ozon"


def проверка_тексты_бота():
    """Гейт на собственные слова: в этой теме обещание читается как схема мошенника, даже сказанное честно."""
    import bot as B
    teksty = {"PRIVET": B.PRIVET, "KAK": B.KAK, "NDS_TEKST": B.NDS_TEKST, "ZAGOLOVOK": S.ZAGOLOVOK}
    for imya, t in teksty.items():
        for stop in B.STOP_SLOVA:
            assert stop not in t.lower(), "в тексте %s обещание «%s»" % (imya, stop)
    assert "не будут запрошены" in B.PRIVET, "в приветствии не сказано, что доступы не понадобятся"
    assert "Ингосстрах" in B.PRIVET, "в приветствии не сказано, почему сумму назвать нельзя"
    assert all(g in B.KAK for g in ("Чапаевск", "Уфа", "Белгород")), "в инструкции нет разных дат по складам"


def main():
    testy = [v for k, v in sorted(globals().items()) if k.startswith("проверка_")]
    try:
        for t in testy:
            t()
            print("ок:", t.__name__[9:].replace("_", " "))
    finally:
        shutil.rmtree(VREMENNO, ignore_errors=True)
    print("\nвсе проверки прошли (%d)" % len(testy))
    return 0


if __name__ == "__main__":
    sys.exit(main())
