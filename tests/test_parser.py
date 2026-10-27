"""Тесты парсера на реальных файлах stis.su (tests/fixtures) и логики ленты изменений."""
import datetime as dt
import os
import shutil
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "scraper"))
import build  # noqa: E402
import rasp  # noqa: E402

FIX = os.path.join(HERE, "fixtures")
REF = dt.date(2026, 10, 25)


def lessons(name, tmp_path):
    shutil.copy(os.path.join(FIX, name), tmp_path)
    return rasp.lessons_from_folder(str(tmp_path), REF, keep_days=60)


def find(L, **kw):
    keys = ("d", "p", "t", "g", "k", "s", "te", "r")
    return [l for l in L if all(l[keys.index(k)] == v for k, v in kw.items())]


def test_sportzal_thursday_shared_by_two_groups(tmp_path):
    # 22.10.2026, СЗ, 3 пара — физкультура, Петров О.П.; ячейка объединена на две группы
    L = lessons("spo_ofo_2k.xls", tmp_path)
    hit = find(L, d="2026-10-22", p=3, r="СЗ")
    assert {l[3] for l in hit} == {"О-Исп-11-251", "О-Исп-9-251"}
    assert all(l[5] == "Физическая культура" and l[6] == "Петров О.П." and l[4] == 2 for l in hit)
    assert hit[0][2] == "12.20-13.55"


def test_saturday_bells(tmp_path):
    L = lessons("zfo_bak_3k.xls", tmp_path)
    sat = {(l[1], l[2]) for l in L if l[0] == "2026-10-31"}
    assert (1, "08.30-10.00") in sat and (2, "10.10-11.40") in sat


def test_one_line_cell(tmp_path):
    # заочка: «Предмет Фамилия И.О. К-204» без перевода строки
    L = lessons("zfo_bak_3k.xls", tmp_path)
    assert not [l for l in L if not l[7]], "у всех занятий заочки есть аудитория"
    assert not [l for l in L if rasp.ONE_LINE_RE.match(l[5])], "ФИО не должно оставаться в названии предмета"
    two = [l for l in L if " / " in l[6]]
    assert two and all(l[7] for l in two)


def test_day_with_date_in_column_a(tmp_path):
    # «05 октября\nПОНЕДЕЛЬНИК» в столбце A
    L = lessons("spo_zfo_1k.xls", tmp_path)
    assert {l[0] for l in L} >= {"2026-10-05", "2026-10-10"}


def test_cell_without_room(tmp_path):
    L = lessons("mag_2k.xls", tmp_path)
    assert find(L, s="ПРАКТИКА", r="")
    assert len(L) > 100


@pytest.mark.parametrize("cell,expected", [
    ("л.Физическая культура\nПетров О.П.   СЗ", (1, "Физическая культура", "Петров О.П.", "СЗ")),
    ("лаб.Базы данных\nИванов И.И. / Сидоров С.С. К-401", (3, "Базы данных", "Иванов И.И. / Сидоров С.С.", "К-401")),
    ("пр.Архитектура ЭВМ", (2, "Архитектура ЭВМ", "", "")),
    ("л.Маркетинг Надеина А.Е. / Семенова Л.В. К-208", (1, "Маркетинг", "Надеина А.Е. / Семенова Л.В.", "К-208")),
    ("Ознакомительное собрание в 09:00\n(получение паролей от ЭИОС)", (0, "Ознакомительное собрание в 09:00 (получение паролей от ЭИОС)", "", "")),
])
def test_parse_cell(cell, expected):
    assert rasp.parse_cell(cell) == expected


def test_url_with_spaces_is_encoded(monkeypatch):
    seen = []

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def read(self): return b"x"

    monkeypatch.setattr(rasp.urllib.request, "urlopen", lambda req, timeout: seen.append(req.full_url) or Resp())
    rasp.http_get("https://stis.su/assets/Schedule/spo/spo_ofo/rasp_spo_ofo, ozfo 4 kurs_21.10.26.xls")
    assert seen == ["https://stis.su/assets/Schedule/spo/spo_ofo/rasp_spo_ofo,%20ozfo%204%20kurs_21.10.26.xls"]


def test_sheet_dates_academic_year():
    assert rasp.sheet_dates("29.12-04.01", dt.date(2026, 12, 1)) == (dt.date(2026, 12, 29), dt.date(2027, 1, 4))
    assert rasp.sheet_dates("12.01-18.01", dt.date(2026, 10, 1)) == (dt.date(2027, 1, 12), dt.date(2027, 1, 18))


# ---------- лента изменений ----------
def L1(d, p, g, s="Предмет", te="Петров О.П.", r="К-121", t="08.30-10.05", k=1):
    return (d, p, t, g, k, s, te, r)


def test_diff_real_change():
    old = [L1("2026-10-27", 1, "A", r="К-121")]
    new = [L1("2026-10-27", 1, "A", r="К-205")]
    ch = build.diff(old, new, "2026-10-25", "now")
    assert len(ch) == 1 and ch[0]["before"]["r"] == "К-121" and ch[0]["after"]["r"] == "К-205"


def test_diff_publication_is_one_record():
    old = [L1("2026-10-27", 1, "A")]
    new = old + [L1(f"2026-11-{d:02d}", p, g) for d in (2, 3) for p in (1, 2) for g in "BCDEFG"]
    ch = build.diff(old, new, "2026-10-25", "now")
    assert ch == [{"at": "now", "type": "week", "d": "2026-11-02", "to": "2026-11-03"}]


def test_diff_single_new_day_is_a_change():
    old = [L1("2026-10-27", 1, "A")]
    new = old + [L1("2026-10-31", 1, "A")]
    ch = build.diff(old, new, "2026-10-25", "now")
    assert len(ch) == 1 and ch[0]["type"] == "lesson" and ch[0]["before"] is None


def test_diff_ignores_past():
    old = [L1("2026-10-20", 1, "A", r="К-121")]
    new = [L1("2026-10-20", 1, "A", r="К-205")]
    assert build.diff(old, new, "2026-10-25", "now") == []
