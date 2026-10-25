// Виджет «Кабинеты ТИС» v2 для приложения Scriptable (iPhone).
// Добавь виджет Scriptable → выбери этот скрипт → в Parameter впиши, что показывать:
//      К-121            — аудитория (СЗ — спортзал)
//      г:О-Исп-9-241    — группа
//      п:Петров         — преподаватель (можно часть фамилии)
//    Работает и на экране блокировки (покажет текущую/следующую пару).
const SITE = "https://ivanovartems236-sketch.github.io/tis-rooms-v2/";

const param = (args.widgetParameter || "СЗ").trim();
let mode = "room", sel = param;
const m = /^(г|g|п|t)\s*:\s*(.+)$/i.exec(param);
if (m) { mode = /^[гg]/i.test(m[1]) ? "group" : "teacher"; sel = m[2].trim(); }

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const KN = ["", "Лекция", "Практика", "Лаб."];
const mins = t => { const r = /(\d{1,2})\.(\d{2})-(\d{1,2})\.(\d{2})/.exec(t || ""); return r ? [r[1] * 60 + +r[2], r[3] * 60 + +r[4]] : null; };

async function getData() {
  const fm = FileManager.local(), cache = fm.joinPath(fm.documentsDirectory(), "tis-rooms-v2.json");
  try {
    const req = new Request(SITE + "data.json?" + Date.now()); req.timeoutInterval = 15;
    const d = await req.loadJSON();
    if (!d.dict) throw new Error("bad data");
    fm.writeString(cache, JSON.stringify(d));
    return d;
  } catch (e) {
    return fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : null;
  }
}

function itemsFor(data, date) {
  const S = data.dict, out = new Map(), low = sel.toLowerCase();
  for (const r of data.l) {
    if (S[r[0]] !== date) continue;
    const g = S[r[3]], te = S[r[6]], room = S[r[7]];
    const ok = mode === "room" ? room === sel : mode === "group" ? g === sel : te.toLowerCase().includes(low);
    if (!ok) continue;
    const key = r[1] + "|" + S[r[5]];
    if (!out.has(key)) out.set(key, { p: r[1], t: S[r[2]], k: r[4], s: S[r[5]], te, r: room, gs: [] });
    const it = out.get(key); if (!it.gs.includes(g)) it.gs.push(g);
  }
  return [...out.values()].sort((a, b) => a.p - b.p);
}

const data = await getData();
const now = new Date(), m0 = now.getHours() * 60 + now.getMinutes();
let day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let items = data ? itemsFor(data, iso(day)) : [];
let label = "Сегодня";
// вечером и в воскресенье показываем завтрашний день
if (data && (!items.some(i => mins(i.t) && mins(i.t)[1] >= m0))) {
  const t = new Date(day); t.setDate(t.getDate() + 1);
  const ti = itemsFor(data, iso(t));
  if (ti.length || !items.length) { day = t; items = ti; label = "Завтра"; }
}
const isToday = label === "Сегодня";
const cur = isToday ? items.find(i => mins(i.t) && m0 >= mins(i.t)[0] && m0 <= mins(i.t)[1]) : null;
const next = items.find(i => mins(i.t) && (!isToday || mins(i.t)[0] > m0));
const title = mode === "room" ? (sel === "СЗ" ? "Спортзал" : sel) : sel;
const line = i => mode === "room" ? i.gs.join(", ") : mode === "group" ? `${i.r || "—"} · ${i.te}` : `${i.r || "—"} · ${i.gs.join(", ")}`;

const fam = config.widgetFamily || "large";
const w = new ListWidget();
w.url = SITE + "#" + mode + "/" + encodeURIComponent(sel);
w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);

if (fam.startsWith("accessory")) {
  // экран блокировки
  const t = w.addText(title); t.font = Font.boldSystemFont(12);
  const it = cur || next;
  const a = w.addText(!data ? "нет данных" : it ? `${cur ? "сейчас" : label === "Завтра" ? "завтра " + it.p : it.p} · ${it.s}` : "свободно");
  a.font = Font.systemFont(11); a.lineLimit = 2;
  if (it && fam !== "accessoryInline") { const b = w.addText(`${it.t.replace(/\./g, ":")} · ${it.r || ""}`); b.font = Font.systemFont(10); }
} else {
  const fg = Color.dynamic(new Color("#17202b"), new Color("#e6ebf1"));
  const muted = Color.dynamic(new Color("#5f6b78"), new Color("#97a3b0"));
  const accent = Color.dynamic(new Color("#1d5fa8"), new Color("#7fb2ec"));
  const nowC = Color.dynamic(new Color("#c2410c"), new Color("#fb923c"));
  w.backgroundColor = Color.dynamic(new Color("#ffffff"), new Color("#171e27"));
  w.setPadding(12, 14, 10, 14);
  const head = w.addStack(); head.centerAlignContent();
  const t = head.addText(title); t.font = Font.boldSystemFont(15); t.textColor = fg; t.lineLimit = 1;
  head.addSpacer();
  const d = head.addText(`${label === "Завтра" ? "завтра " : ""}${day.getDate()}.${pad(day.getMonth() + 1)} ${WD[day.getDay()]}`);
  d.font = Font.mediumSystemFont(11); d.textColor = muted;
  w.addSpacer(6);
  const limit = fam === "small" ? 2 : fam === "medium" ? 3 : 7;
  const shown = (isToday && fam !== "large" ? items.filter(i => mins(i.t) && mins(i.t)[1] >= m0) : items).slice(0, limit);
  if (!data) { const e = w.addText("Нет данных — проверь SITE в скрипте"); e.font = Font.systemFont(12); e.textColor = muted; }
  else if (!shown.length) { const e = w.addText(items.length ? "На сегодня всё" : mode === "room" ? "Свободна весь день" : "Занятий нет"); e.font = Font.systemFont(13); e.textColor = muted; }
  for (const i of shown) {
    const isNow = cur && i.p === cur.p;
    const past = isToday && mins(i.t) && mins(i.t)[1] < m0;
    const s = w.addStack(); s.layoutVertically();
    const l1 = s.addText(`${i.p} пара · ${i.t.replace(/\./g, ":")}${isNow ? " · сейчас" : ""}${i.k ? " · " + KN[i.k] : ""}`);
    l1.font = Font.semiboldSystemFont(10); l1.textColor = isNow ? nowC : past ? muted : accent;
    const l2 = s.addText(i.s); l2.font = Font.systemFont(13); l2.textColor = past ? muted : fg; l2.lineLimit = fam === "large" ? 2 : 1;
    if (fam !== "small") { const l3 = s.addText(line(i)); l3.font = Font.systemFont(10); l3.textColor = muted; l3.lineLimit = 1; }
    w.addSpacer(4);
  }
  w.addSpacer();
  const f = w.addText("обновлено " + (data && data.updated || "—")); f.font = Font.systemFont(8); f.textColor = muted;
}

if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(w); else await w.presentLarge();
Script.complete();
