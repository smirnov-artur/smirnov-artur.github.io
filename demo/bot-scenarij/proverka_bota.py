# -*- coding: utf-8 -*-
"""Автопрогон всех сценариев бота-прототипа: каждая кнопка ведёт куда надо, каждая анкета проходится до конца,
неверный телефон бот не принимает, уведомление и строка заявки появляются у администратора, вопросы своими словами
находят ответ или уходят администратору. Это и есть «все сценарии ТЗ прогнаны автотестом» в отклике.

    py kwork/otkliki-0710/zagotovki/bot-demo/proverka_bota.py [папка или адрес прототипа]   # по умолчанию эта папка
Код 0 — всё прошло; снимки — snimki/ рядом с прототипом (или здесь, если проверяли адрес)."""
import sys
from collections import deque
from pathlib import Path

from playwright.sync_api import sync_playwright

TUT = Path(__file__).resolve().parent
arg = sys.argv[1] if len(sys.argv) > 1 else str(TUT)
URL = arg if arg.startswith("http") else (Path(arg).resolve() / "index.html").as_uri()
SN = (Path(arg) if not arg.startswith("http") else TUT) / "snimki"
SN.mkdir(exist_ok=True)
itog, bedy = [], []


def ok(c, t):
    itog.append(("ок  " if c else "ПРОВАЛ ") + t)
    if not c:
        bedy.append(t)


def zhmi(pg, cel):
    pg.locator(".kb").last.locator(f"button[data-cel='{cel}']").first.click()
    pg.wait_for_timeout(420)


def posl(pg):
    return pg.locator(".m.bot").last.inner_text()


with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={"width": 1280, "height": 900})
    kons = []
    pg.on("console", lambda m: m.type == "error" and kons.append(m.text))
    pg.on("pageerror", lambda e: kons.append(str(e)))
    pg.goto(URL)
    pg.wait_for_timeout(500)
    SC = pg.evaluate("window.__bot.SC")
    ekrany, formy = SC["ekrany"], SC["formy"]
    # 1. граф: куда ведут кнопки
    rebra = {e: [] for e in ekrany}
    for eid, e in ekrany.items():
        for k in e.get("knopki", []):
            for label, cel in ([k] if isinstance(k[0], str) else k):
                rebra[eid].append(cel)
                if cel.startswith("forma:"):
                    ok(cel[6:] in formy, f"кнопка «{label}» ведёт в анкету {cel[6:]}")
                else:
                    ok(cel in ekrany, f"кнопка «{label}» ведёт на экран {cel}")
    put = {SC["start"]: []}
    q = deque([SC["start"]])
    while q:
        e = q.popleft()
        for c in rebra.get(e, []):
            if not c.startswith("forma:") and c in ekrany and c not in put:
                put[c] = put[e] + [c]
                q.append(c)
    ok(len(put) == len(ekrany), f"до всех экранов можно дойти кнопками: {len(put)} из {len(ekrany)}")
    # 2. каждый экран открывается и показывает свой текст
    for eid, shagi in put.items():
        pg.reload(); pg.wait_for_timeout(400)
        for c in shagi:
            zhmi(pg, c)
        ok(posl(pg) == ekrany[eid]["tekst"], f"экран {eid} открылся")
    # 3. каждая анкета до конца + проверка ввода
    vhod = {}
    for eid, e in ekrany.items():
        for c in rebra[eid]:
            if c.startswith("forma:"):
                vhod.setdefault(c[6:], (eid, c))
    for fid, f in formy.items():
        if fid not in vhod:
            continue
        pg.reload(); pg.wait_for_timeout(400)
        eid, cel = vhod[fid]
        for c in put[eid]:
            zhmi(pg, c)
        zhmi(pg, cel)
        do = len(pg.evaluate(f"window.__bot.ST.zapisi['{fid}']"))
        for pole in f["polya"]:
            if pole["tip"] == "telefon":
                pg.fill("#txt", "123"); pg.press("#txt", "Enter"); pg.wait_for_timeout(400)
                ok("10 цифр" in pg.locator(".m.bot").nth(-2).inner_text(), f"{fid}: короткий телефон бот не принял")
                zhmi(pg, "vybor:+7 000 000-00-00")
            elif pole["tip"] == "vybor":
                zhmi(pg, "vybor:" + pole["varianty"][-1])
            elif pole.get("neobyaz"):
                zhmi(pg, "vybor:—")
            else:
                otv = {"pochta": "proba@primer.ru", "chislo": "5"}.get(pole["tip"], "Проба")
                pg.fill("#txt", otv); pg.press("#txt", "Enter"); pg.wait_for_timeout(400)
        ok(posl(pg).startswith("Проверьте"), f"{fid}: сводка перед отправкой")
        zhmi(pg, "otpravit")
        posle = len(pg.evaluate(f"window.__bot.ST.zapisi['{fid}']"))
        ok(posle == do + 1, f"{fid}: заявка записана ({do} → {posle})")
        ok(pg.locator("#feed div").first.inner_text().strip() != "", f"{fid}: уведомление администратору")
        pg.screenshot(path=str(SN / f"forma-{fid}.png"))
    # 4. свои слова: вопрос из списка и вопрос без ответа
    pg.reload(); pg.wait_for_timeout(400)
    if SC.get("faq"):
        vopr = SC["faq"][0]
        pg.fill("#txt", "подскажите, " + vopr["slova"][0] + "?"); pg.press("#txt", "Enter"); pg.wait_for_timeout(500)
        ok(posl(pg) == vopr["otvet"], "вопрос своими словами нашёл готовый ответ")
    if "vopros" in formy:
        pg.fill("#txt", "есть ли парковка у входа"); pg.press("#txt", "Enter"); pg.wait_for_timeout(600)
        ok(posl(pg).startswith("Проверьте"), "вопрос без готового ответа: бот просит подтвердить отправку")
        zhmi(pg, "otpravit")
        ok(len(pg.evaluate("window.__bot.ST.zapisi['vopros']")) == 1, "вопрос без готового ответа ушёл администратору")
    pg.screenshot(path=str(SN / "chat-i-admin.png"))
    ok(not kons, f"консоль чистая {kons[:2]}")
    br.close()
print("\n".join(itog))
print(f"экранов {len(ekrany)}, анкет {len([f for f in formy if f in vhod])} с кнопкой входа; ПРОВАЛОВ: {len(bedy)}")
sys.exit(1 if bedy else 0)
