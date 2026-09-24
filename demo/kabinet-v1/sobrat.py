# -*- coding: utf-8 -*-
"""Собрать кабинет v1: kabinet.src.html + нужные иконки Phosphor (MIT) спрайтом → konvjob/demo/otvetchik-kabinet/index.html и копия для Pages."""
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IK = HERE.parent / "maket-kabinet" / "ikonki"
KUDA = [Path(r"C:\Users\gonch\OneDrive\Рабочий стол\konvjob\demo\otvetchik-kabinet\index.html"),
        Path(r"C:\Users\gonch\OneDrive\Рабочий стол\konvjob\demo\sait\demo\otvetchik-kabinet\index.html")]
VES = {"regular": "r", "fill": "f", "bold": "b"}
vse = {}
for f in IK.glob("*.svg"):
    ves, imya = f.stem.split("-", 1)
    vse["%s-%s" % (VES[ves], imya)] = re.search(r"<svg[^>]*>(.*)</svg>", f.read_text(encoding="utf-8"), re.S).group(1)
src = (HERE / "kabinet.src.html").read_text(encoding="utf-8")
nuzhny = set(re.findall(r"""["'#]([rfb]-[a-z](?:[a-z0-9-]*[a-z0-9])?)(?=["'\s)])""", src))   # в JS иконки в одинарных кавычках: ik('r-...')
nety = sorted(n for n in nuzhny if n not in vse)
if nety:
    sys.exit("нет иконок: %s" % ", ".join(nety))
sprayt = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">%s</svg>' % "".join(
    '<symbol id="%s" viewBox="0 0 256 256">%s</symbol>' % (n, vse[n]) for n in sorted(nuzhny))
gotovo = src.replace("<!--SPRAYT-->", sprayt)
(HERE / "index.html").write_text(gotovo, encoding="utf-8")
if "--vylozhit" in sys.argv:
    for k in KUDA:
        shutil.copyfile(HERE / "index.html", k)
print("собрано: %d иконок, %d байт" % (len(nuzhny), len(gotovo.encode("utf-8"))))
