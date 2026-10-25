"""Собирает данные для сайта:
  data.json     — расписание (словарь строк + занятия с датами)
  changes.json  — лента изменений расписания
  ics/*.ics     — календари для подписки (аудитории, группы, преподаватели)
и шлёт изменения в Telegram, если заданы TG_TOKEN и TG_CHAT.

python scraper/build.py               — скачать с stis.su и собрать
python scraper/build.py --from DIR    — собрать из уже скачанных файлов
python scraper/build.py --force       — пропустить проверку на обвал числа занятий
"""
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rasp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MSK = dt.timezone(dt.timedelta(hours=3))
KIND_NAMES = ["", "Лекция", "Практика", "Лаб."]
MAX_CHANGES = 300
PUBLISH_MIN = 10   # столько новых «группа-день» за прогон считаем выкладкой расписания
DROP_LIMIT = 0.4   # будущих занятий стало меньше на 40% — источник, скорее всего, сломан


def teachers_of(s):
    return [t.strip() for t in s.split("/") if t.strip()]


# ---------- data.json ----------
def encode(lessons, updated):
    strings, idx = [], {}

    def si(s):
        if s not in idx:
            idx[s] = len(strings)
            strings.append(s)
        return idx[s]

    rows = [[si(d), p, si(t), si(g), k, si(s), si(te), si(r)] for d, p, t, g, k, s, te, r in lessons]
    return {"v": 2, "updated": updated, "dict": strings, "l": rows}


def decode(data):
    if not data or data.get("v") != 2:
        return []
    S = data["dict"]
    return [(S[d], p, S[t], S[g], k, S[s], S[te], S[r]) for d, p, t, g, k, s, te, r in data["l"]]


# ---------- изменения ----------
def slot_map(lessons):
    m = {}
    for d, p, t, g, k, s, te, r in lessons:
        m.setdefault((d, p, g), set()).add((s, te, r, k))
    return m


def describe(vals):
    if not vals:
        return None
    s, te, r, k = sorted(vals)[0]
    return {"s": s, "t": te, "r": r, "k": k}


def diff(old, new, today, now_str):
    if not old:
        return []
    om, nm = slot_map(old), slot_map(new)
    # Дни групп, которых раньше не было вовсе. Если их много — выложили новый файл/неделю,
    # это одна запись «выложено расписание», а не сотни «добавлено».
    old_days = {(d, g) for d, p, g in om}
    fresh = {(d, g) for d, p, g in nm if d >= today and (d, g) not in old_days}
    published = len(fresh) >= PUBLISH_MIN
    raw = {}
    for key in set(om) | set(nm):
        d, p, g = key
        if d < today or (published and (d, g) in fresh):
            continue
        a, b = om.get(key, set()), nm.get(key, set())
        if a != b:
            k2 = (d, p, json.dumps(describe(a), ensure_ascii=False), json.dumps(describe(b), ensure_ascii=False))
            raw.setdefault(k2, []).append(g)
    out = []
    for (d, p, a, b), gs in sorted(raw.items()):
        out.append({"at": now_str, "type": "lesson", "d": d, "p": p, "g": sorted(gs),
                    "before": json.loads(a), "after": json.loads(b)})
    if published:
        dates = sorted({d for d, g in fresh})
        out.append({"at": now_str, "type": "week", "d": dates[0], "to": dates[-1]})
    return out


def fmt_date(iso):
    y, m, d = iso.split("-")
    wd = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"][dt.date(int(y), int(m), int(d)).weekday()]
    return f"{d}.{m} ({wd})"


def change_text(c):
    if c["type"] == "week":
        return f"📅 Выложено расписание: {fmt_date(c['d'])} – {fmt_date(c['to'])}"
    b, a = c["before"], c["after"]
    head = f"{fmt_date(c['d'])}, {c['p']} пара, {', '.join(c['g'])}"
    if b and a:
        parts = []
        if b["s"] != a["s"]:
            parts.append(f"{b['s']} → {a['s']}")
        if b["r"] != a["r"]:
            parts.append(f"ауд. {b['r'] or '—'} → {a['r'] or '—'}")
        if b["t"] != a["t"]:
            parts.append(f"{b['t']} → {a['t']}")
        if b["k"] != a["k"]:
            parts.append(f"{KIND_NAMES[b['k']] or '—'} → {KIND_NAMES[a['k']] or '—'}")
        return f"✏️ {head}: " + "; ".join(parts)
    if a:
        return f"➕ {head}: {a['s']} ({a['r'] or 'без ауд.'})"
    return f"➖ {head}: отменено {b['s']} ({b['r'] or 'без ауд.'})"


def telegram(changes):
    if not changes:
        return
    lines = [change_text(c) for c in changes]
    text = "Изменения в расписании ТИС:\n\n" + "\n".join(lines[:30])
    if len(lines) > 30:
        text += f"\n…и ещё {len(lines) - 30}"
    site = os.environ.get("SITE_URL")
    if site:
        text += f"\n\n{site}#changes"
    tg_send(os.environ.get("TG_CHAT"), text)


def fail(msg):
    """Старые данные не трогаем, пишем владельцу в личку (TG_ADMIN, не в канал) и падаем — GitHub пришлёт письмо."""
    tg_send(os.environ.get("TG_ADMIN"), "⚠️ Сборка расписания остановлена: " + msg)
    sys.exit(msg)


def tg_send(chat, text):
    token = os.environ.get("TG_TOKEN")
    if not (token and chat):
        return
    body = urllib.parse.urlencode({"chat_id": chat, "text": text[:4000], "disable_web_page_preview": "true"}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", body, timeout=20).read()
        print("telegram: отправлено")
    except Exception as e:
        print("telegram: ошибка", type(e).__name__)  # токен в лог не выводим


# ---------- календари ----------
TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
              ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u",
               "f", "h", "c", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def slug(s):
    s = "".join(TR.get(ch, ch) for ch in s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "x"


def ics_escape(s):
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    b = line.encode("utf-8")
    if len(b) <= 75:
        return line
    out, cur = [], b""
    for ch in line:
        e = ch.encode("utf-8")
        if len(cur) + len(e) > (75 if not out else 74):
            out.append(cur.decode("utf-8"))
            cur = b""
        cur += e
    out.append(cur.decode("utf-8"))
    return "\r\n ".join(out)


def ics_time(d, t, end=False):
    m = re.match(r"(\d{1,2})\.(\d{2})-(\d{1,2})\.(\d{2})", t)
    if not m:
        return None
    h, mi = (m.group(3), m.group(4)) if end else (m.group(1), m.group(2))
    return d.replace("-", "") + f"T{int(h):02d}{mi}00"


def write_calendar(path, title, events, stamp):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tis-rooms//RU", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", f"X-WR-CALNAME:{ics_escape(title)}", "X-WR-TIMEZONE:Europe/Moscow",
             "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
             "BEGIN:VTIMEZONE", "TZID:Europe/Moscow", "BEGIN:STANDARD", "DTSTART:19700101T000000",
             "TZOFFSETFROM:+0300", "TZOFFSETTO:+0300", "TZNAME:MSK", "END:STANDARD", "END:VTIMEZONE"]
    for ev in events:
        st, en = ics_time(ev["d"], ev["time"]), ics_time(ev["d"], ev["time"], True)
        if not st:
            continue
        uid = hashlib.sha1(f"{path}|{ev['d']}|{ev['p']}|{ev['s']}".encode()).hexdigest()[:20]
        summary = ev["s"] + (f" ({KIND_NAMES[ev['k']]})" if ev["k"] else "")
        lines += ["BEGIN:VEVENT", f"UID:{uid}@tis-rooms", f"DTSTAMP:{stamp}",
                  f"DTSTART;TZID=Europe/Moscow:{st}", f"DTEND;TZID=Europe/Moscow:{en}",
                  fold(f"SUMMARY:{ics_escape(summary)}"),
                  fold(f"LOCATION:{ics_escape(ev['r'] or '')}"),
                  fold(f"DESCRIPTION:{ics_escape(str(ev['p']) + ' пара · ' + ev['desc'])}"),
                  "END:VEVENT"]
    lines.append("END:VCALENDAR")
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write("\r\n".join(lines) + "\r\n")


def build_calendars(lessons, outdir):
    if os.path.isdir(outdir):
        shutil.rmtree(outdir)
    os.makedirs(outdir)
    buckets = {}
    for d, p, t, g, k, s, te, r in lessons:
        keys = [("g", g)] + ([("r", r)] if r else []) + [("t", x) for x in teachers_of(te)]
        for key in keys:
            ev = buckets.setdefault(key, {}).setdefault((d, p, s, te, r, k), {"d": d, "p": p, "time": t, "s": s,
                                                                             "r": r, "k": k, "te": te, "g": []})
            if g not in ev["g"]:
                ev["g"].append(g)
    stamp = "20260901T000000Z"  # постоянный, чтобы файлы менялись только при изменении расписания
    index, used = {}, set()
    for (kind, name), evs in sorted(buckets.items()):
        base = f"{kind}-{slug(name)}"
        fn, n = base, 2
        while fn in used:
            fn, n = f"{base}-{n}", n + 1
        used.add(fn)
        title = {"r": "Ауд. ", "g": "Группа ", "t": ""}[kind] + name + " — ТИС"
        events = []
        for ev in evs.values():
            ev["desc"] = f"{ev['te']} · группы: {', '.join(sorted(ev['g']))}"
            events.append(ev)
        write_calendar(os.path.join(outdir, fn + ".ics"), title, sorted(events, key=lambda e: (e["d"], e["p"])), stamp)
        index[f"{kind}|{name}"] = fn + ".ics"
    return index


# ---------- main ----------
def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))


def main():
    now = dt.datetime.now(MSK)
    today = now.date()
    args = sys.argv[1:]
    force = "--force" in args  # пропустить проверку на обвал, если уверен, что расписание правда сократилось
    if "--from" in args:
        folder = args[args.index("--from") + 1]
    else:
        folder = tempfile.mkdtemp()
        ok, failed = rasp.download_all(folder)
        if not ok:
            fail("не удалось скачать ни одного файла")
        if failed:
            fail(f"не скачалось файлов: {failed} — частичные данные дали бы ложные изменения")
    lessons = rasp.lessons_from_folder(folder, today)
    if not lessons:
        fail("из файлов не разобрано ни одного занятия")

    data_path, changes_path = os.path.join(ROOT, "data.json"), os.path.join(ROOT, "changes.json")
    old = decode(read_json(data_path, None))
    fut_old = sum(1 for l in old if l[0] >= today.isoformat())
    fut_new = sum(1 for l in lessons if l[0] >= today.isoformat())
    if not force and fut_old >= 50 and fut_new < fut_old * (1 - DROP_LIMIT):
        fail(f"будущих занятий стало {fut_new} вместо {fut_old} (−{100 - 100 * fut_new // fut_old}%)")
    now_str = now.strftime("%Y-%m-%d %H:%M")
    new_changes = diff(old, lessons, today.isoformat(), now_str)
    changes = read_json(changes_path, [])
    changes = (new_changes + changes)[:MAX_CHANGES]

    data = encode(lessons, now.strftime("%d.%m.%Y %H:%M"))
    data["ics"] = build_calendars(lessons, os.path.join(ROOT, "ics"))
    write_json(data_path, data)
    write_json(changes_path, changes)
    print(f"занятий: {len(lessons)}, изменений: {len(new_changes)}, календарей: {len(data['ics'])}")
    for c in new_changes[:20]:
        print(" ", change_text(c))
    telegram(new_changes)


if __name__ == "__main__":
    main()
