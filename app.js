"use strict";
/* Кабинеты ТИС v2 — всё, что приходит из расписания, выводится только через textContent */

const KN = ["", "Лекция", "Практика", "Лаб."];
const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MODES = ["room", "group", "teacher", "free", "grid", "stats", "changes"];
const ENTITY = { room: "Аудитория", group: "Группа", teacher: "Преподаватель" };
const $ = id => document.getElementById(id);

/* ---------- утилиты ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const wdi = d => (d.getDay() + 6) % 7;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dm = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
const fmtLong = d => `${dm(d)}.${d.getFullYear()}, ${WD[wdi(d)]}`;
const mins = t => { const m = /(\d{1,2})\.(\d{2})-(\d{1,2})\.(\d{2})/.exec(t || ""); return m ? [m[1] * 60 + +m[2], m[3] * 60 + +m[4]] : null; };
const hm = t => (t || "").replace(/\./g, ":");
const splitT = s => s.split("/").map(x => x.trim()).filter(Boolean);
const roomSort = (a, b) => { const pa = /^([^\d-]*)-?(\d*)/.exec(a), pb = /^([^\d-]*)-?(\d*)/.exec(b); return pa[1] === pb[1] ? (+pa[2] || 0) - (+pb[2] || 0) : pa[1].localeCompare(pb[1], "ru"); };
const bld = r => { const m = /^([^\d-]+)-/.exec(r); return m ? m[1] : r; };
const roomName = r => r === "СЗ" ? "Спортзал" : r;
const plural = (n, a, b, c) => { const m = n % 10, mm = n % 100; return m === 1 && mm !== 11 ? a : m >= 2 && m <= 4 && (mm < 10 || mm >= 20) ? b : c; };
function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }

/* ---------- данные ---------- */
let L = [], byDate = new Map(), lists = { room: [], group: [], teacher: [] }, ICS = {}, CHANGES = [], UPDATED = "", MAXD = "", MIND = "";

function ingest(data) {
  const S = data.dict;
  L = data.l.map(r => ({ d: S[r[0]], p: r[1], t: S[r[2]], g: S[r[3]], k: r[4], s: S[r[5]], te: S[r[6]], r: S[r[7]], tl: splitT(S[r[6]]) }));
  byDate = new Map();
  const rooms = new Set(), groups = new Set(), teachers = new Set();
  for (const l of L) {
    if (!byDate.has(l.d)) byDate.set(l.d, []);
    byDate.get(l.d).push(l);
    if (l.r) rooms.add(l.r);
    groups.add(l.g);
    l.tl.forEach(t => teachers.add(t));
  }
  lists.room = [...rooms].sort(roomSort);
  lists.group = [...groups].sort((a, b) => a.localeCompare(b, "ru"));
  lists.teacher = [...teachers].sort((a, b) => a.localeCompare(b, "ru"));
  ICS = data.ics || {};
  UPDATED = data.updated || "";
  const ds = [...byDate.keys()].sort();
  MIND = ds[0] || ""; MAXD = ds[ds.length - 1] || "";
}

function pairTimes(date) {
  const cnt = {};
  for (const l of byDate.get(date) || []) { (cnt[l.p] ||= {})[l.t] = (cnt[l.p][l.t] || 0) + 1; }
  const out = {};
  for (const p in cnt) out[p] = Object.entries(cnt[p]).sort((a, b) => b[1] - a[1])[0][0];
  return out;
}
function nowState(date, times) {
  if (date !== iso(new Date())) return { cur: null, next: null, m: -1 };
  const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
  let cur = null, next = null;
  for (const p of Object.keys(times).map(Number).sort((a, b) => a - b)) {
    const mm = mins(times[p]); if (!mm) continue;
    if (m >= mm[0] && m <= mm[1]) cur = p;
    else if (m < mm[0] && next == null) next = p;
  }
  return { cur, next, m };
}

/* ---------- состояние и адрес ---------- */
const st = {
  mode: "room",
  sel: Object.assign({ room: "СЗ", group: "", teacher: "" }, ls("tis2-sel") || {}),
  date: today0(),
  pair: null,
  favs: ls("tis2-favs") || [],
};
function readHash() {
  const m = /^#([a-z]+)(?:\/(.+))?$/.exec(location.hash);
  if (!m || !MODES.includes(m[1])) return;
  st.mode = m[1];
  if (m[2] && ENTITY[m[1]]) { try { st.sel[m[1]] = decodeURIComponent(m[2]); } catch (e) {} }
}
function writeHash() {
  const v = ENTITY[st.mode] && st.sel[st.mode] ? "/" + encodeURIComponent(st.sel[st.mode]) : "";
  history.replaceState(null, "", "#" + st.mode + v);
}
function go(mode, value) {
  st.mode = mode;
  if (value != null && ENTITY[mode]) { st.sel[mode] = value; ls("tis2-sel", st.sel); }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- шапка: режимы, выбор, избранное, неделя ---------- */
function renderChrome() {
  for (const b of $("tabs").querySelectorAll("button")) {
    if (b.dataset.mode === st.mode) {
      b.setAttribute("aria-current", "page");
      const bar = $("tabs"), l = b.offsetLeft - bar.offsetLeft;
      if (l < bar.scrollLeft || l + b.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = l - 12;
    } else b.removeAttribute("aria-current");
  }
  const ent = ENTITY[st.mode];
  $("picker").hidden = !ent && !st.favs.length;
  $("q").parentElement.parentElement.hidden = !ent;
  if (ent) {
    $("qLabel").textContent = ent;
    $("q").placeholder = st.mode === "room" ? "Например, К-121 или СЗ" : st.mode === "group" ? "Например, О-Исп-9-241" : "Фамилия";
    if (document.activeElement !== $("q")) $("q").value = st.sel[st.mode] || "";
    const dl = $("qList"); dl.replaceChildren(...lists[st.mode].map(v => h("option", { value: v }, st.mode === "room" && v === "СЗ" ? "Спортзал" : null)));
    const on = st.favs.some(f => f.m === st.mode && f.v === st.sel[st.mode]);
    $("fav").textContent = on ? "★" : "☆";
    $("fav").setAttribute("aria-label", on ? "Убрать из избранного" : "В избранное");
  }
  $("favs").replaceChildren(...st.favs.map(f => h("button", {
    class: "chipbtn" + (f.m === st.mode && f.v === st.sel[f.m] ? " on" : ""),
    onclick: () => go(f.m, f.v),
  }, roomName(f.v), " ", h("small", {}, f.m === "room" ? "ауд." : f.m === "group" ? "гр." : "преп."))));

  $("days").hidden = st.mode === "changes";
  const mon = addDays(st.date, -wdi(st.date)), t = iso(new Date());
  $("strip").replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i), k = iso(d);
    return h("button", {
      class: (i === 6 ? "sun " : "") + (k === t ? "today" : ""), "aria-pressed": k === iso(st.date) ? "true" : "false",
      "aria-label": fmtLong(d), onclick: () => { st.date = d; st.pair = null; render(); },
    }, h("span", { class: "w" }, WD[i]), h("span", { class: "n" }, d.getDate()));
  }));

  const cal = ent && st.sel[st.mode] && ICS[{ room: "r", group: "g", teacher: "t" }[st.mode] + "|" + st.sel[st.mode]];
  $("cal").hidden = !cal;
  if (cal) {
    const url = new URL("ics/" + cal, location.href);
    $("calSub").href = "webcal://" + url.host + url.pathname;
    $("calCopy").dataset.url = url.href;
  }
}

/* ---------- общие куски ---------- */
function emptyDay(date) {
  const d = fromIso(date);
  if (wdi(d) === 6) return h("div", { class: "empty" }, "Воскресенье — занятий нет.");
  if (!MAXD) return h("div", { class: "empty" }, "Расписание не загрузилось. Проверь интернет и обнови страницу.");
  if (date > MAXD) return h("div", { class: "empty" }, `Расписание на эту неделю ещё не выложено. Сейчас есть до ${dm(fromIso(MAXD))}.`);
  if (date < MIND) return h("div", { class: "empty" }, "Старые недели здесь не хранятся.");
  return h("div", { class: "empty" }, "На этот день занятий в расписании нет.");
}
const entLink = (mode, v, text) => h("button", { class: "link", onclick: () => go(mode, v) }, text || roomName(v));
function joinNodes(arr, sep) { const out = []; arr.forEach((x, i) => { if (i) out.push(sep); out.push(x); }); return out; }

/* ---------- режим: аудитория / группа / преподаватель ---------- */
function viewEntity() {
  const mode = st.mode, sel = st.sel[mode], date = iso(st.date), view = [];
  if (!sel) return [h("div", { class: "empty" }, `Выбери: ${ENTITY[mode].toLowerCase()}.`)];
  if (!lists[mode].includes(sel)) return [h("div", { class: "empty" }, `«${sel}» не найдено в текущем расписании.`)];
  const all = byDate.get(date) || [];
  const mine = all.filter(l => mode === "room" ? l.r === sel : mode === "group" ? l.g === sel : l.tl.includes(sel));
  const agg = new Map();
  for (const l of mine) {
    const k = [l.p, l.s, l.te, l.r, l.k].join("|");
    if (!agg.has(k)) agg.set(k, { ...l, gs: [] });
    if (!agg.get(k).gs.includes(l.g)) agg.get(k).gs.push(l.g);
  }
  const items = [...agg.values()].sort((a, b) => a.p - b.p);
  const times = pairTimes(date), ns = nowState(date, times);
  const busy = [...new Set(items.map(i => i.p))];

  const title = mode === "room" ? roomName(sel) : sel;
  let meta = "";
  if (all.length) {
    if (!items.length) meta = mode === "room" ? "свободна весь день" : "занятий нет";
    else {
      const a = mins(items[0].t), b = mins(items[items.length - 1].t);
      meta = `${busy.length} ${plural(busy.length, "пара", "пары", "пар")}` + (a && b ? ` · ${hm(items[0].t.split("-")[0])}–${hm(items[items.length - 1].t.split("-")[1])}` : "");
    }
  }
  view.push(h("div", { class: "head" }, h("h2", {}, title), h("span", { class: "meta" }, fmtLong(st.date) + (meta ? " · " + meta : ""))));

  if (ns.m >= 0 && items.length) {
    const curI = items.find(i => i.p === ns.cur), nextI = items.find(i => i.p > (ns.cur || 0) && mins(i.t) && mins(i.t)[0] > ns.m);
    const pills = [];
    if (curI) pills.push(h("span", { class: "pill now" }, `Идёт ${curI.p} пара · осталось ${mins(curI.t)[1] - ns.m} мин`));
    else if (mode === "room" && ns.cur) pills.push(h("span", { class: "pill ok" }, "Сейчас свободна"));
    if (nextI) { const left = mins(nextI.t)[0] - ns.m; pills.push(h("span", { class: "pill" }, `Следующая: ${nextI.p} пара через ${left >= 60 ? Math.floor(left / 60) + " ч " : ""}${left % 60} мин`)); }
    else if (!curI && items.length) pills.push(h("span", { class: "pill" }, mode === "room" ? "Больше занятий сегодня нет" : "Пары на сегодня закончились"));
    if (pills.length) view.push(h("div", { class: "status" }, pills));
  }

  if (!all.length) { view.push(emptyDay(date)); return view; }
  const list = h("div", { class: "list" });
  const ps = [...new Set([...Object.keys(times).map(Number), ...busy])].sort((a, b) => a - b);
  const first = busy[0], last = busy[busy.length - 1];
  for (const p of ps) {
    const cur = items.filter(i => i.p === p);
    const past = ns.m >= 0 && mins(times[p]) && mins(times[p])[1] < ns.m;
    if (!cur.length) {
      if (mode !== "room" && !(p > first && p < last)) continue;
      list.append(h("div", { class: "slot free" + (p === ns.cur ? " now" : "") + (past ? " past" : "") },
        h("div", { class: "num" }, p, h("small", {}, "пара")), h("div", { class: "time" }, hm(times[p])),
        h("div", { class: "body" }, mode === "room" ? "свободно" : "окно")));
      continue;
    }
    for (const i of cur) {
      const who = [];
      if (mode !== "room") who.push(i.r ? entLink("room", i.r, "ауд. " + i.r) : "без аудитории");
      if (mode !== "teacher") who.push(...joinNodes(i.tl.map(t => entLink("teacher", t, t)), " / "));
      const groups = mode === "group" ? null : joinNodes(i.gs.sort().map(g => entLink("group", g, g)), ", ");
      list.append(h("div", { class: "slot" + (p === ns.cur ? " now" : "") + (past ? " past" : "") },
        h("div", { class: "num" }, p, h("small", {}, "пара")),
        h("div", { class: "time" }, hm(i.t)),
        h("div", { class: "body" },
          h("div", { class: "subj" }, p === ns.cur ? h("span", { class: "chip now" }, "сейчас") : null,
            i.k ? h("span", { class: "chip k" + i.k }, KN[i.k]) : null, i.s),
          who.length ? h("div", { class: "who" }, joinNodes(who, " · ")) : null,
          groups ? h("div", { class: "who mono" }, groups) : null)));
    }
  }
  view.push(list);
  return view;
}

/* ---------- режим: свободные ---------- */
function viewFree() {
  const date = iso(st.date), all = byDate.get(date) || [], times = pairTimes(date), ns = nowState(date, times);
  const view = [h("div", { class: "head" }, h("h2", {}, "Свободные аудитории"), h("span", { class: "meta" }, fmtLong(st.date)))];
  if (!all.length) { view.push(emptyDay(date)); return view; }
  const ps = Object.keys(times).map(Number).sort((a, b) => a - b);
  if (st.pair == null || !ps.includes(st.pair)) st.pair = ns.cur || ns.next || ps[0];
  view.push(h("div", { class: "pairs", role: "group", "aria-label": "Пара" }, ps.map(p =>
    h("button", { "aria-pressed": p === st.pair ? "true" : "false", onclick: () => { st.pair = p; render(); } },
      h("span", {}, p + " пара" + (p === ns.cur ? " · сейчас" : "")), h("small", {}, hm(times[p]))))));
  const busyL = all.filter(l => l.p === st.pair && l.r);
  const busy = new Set(busyL.map(l => l.r));
  const free = lists.room.filter(r => !busy.has(r));
  view.push(h("div", { class: "status" }, h("span", { class: "pill ok" }, `Свободно ${free.length} из ${lists.room.length}`)));
  const byB = {};
  free.forEach(r => (byB[bld(r)] ||= []).push(r));
  for (const b of Object.keys(byB).sort((a, c) => a.localeCompare(c, "ru"))) {
    view.push(h("div", { class: "bld" }, h("h3", {}, b === "К" ? "Корпус К" : b === "В" ? "Корпус В" : b === "СЗ" ? "Спортзал" : b),
      h("div", { class: "rooms" }, byB[b].map(r => h("button", { class: "ok", onclick: () => go("room", r) }, r)))));
  }
  const agg = new Map();
  for (const l of busyL) { const k = l.r + "|" + l.s; if (!agg.has(k)) agg.set(k, { ...l, gs: [] }); agg.get(k).gs.push(l.g); }
  const rows = [...agg.values()].sort((a, b) => roomSort(a.r, b.r));
  view.push(h("details", {}, h("summary", {}, `Занято: ${busy.size}`),
    rows.map(i => h("div", { class: "busyrow" }, h("div", { class: "mono" }, entLink("room", i.r, i.r)),
      h("div", {}, i.s, h("div", { class: "who" }, i.te + " · " + [...new Set(i.gs)].join(", ")))))));
  view.push(h("p", { class: "note" }, "Свободно — по официальному расписанию. Разовые мероприятия и брони в нём не отражены."));
  return view;
}

/* ---------- режим: шахматка ---------- */
function shortGroups(gs) { return gs.length > 1 ? `${gs.length} гр.` : gs[0].replace(/^(О|ОЗ|З)-/, ""); }
function viewGrid() {
  const date = iso(st.date), all = byDate.get(date) || [], times = pairTimes(date), ns = nowState(date, times);
  const view = [h("div", { class: "head" }, h("h2", {}, "Шахматка"), h("span", { class: "meta" }, fmtLong(st.date)))];
  if (!all.length) { view.push(emptyDay(date)); return view; }
  const ps = Object.keys(times).map(Number).sort((a, b) => a - b);
  const cell = {};
  for (const l of all) { if (!l.r) continue; const c = (cell[l.r + "|" + l.p] ||= { s: l.s, k: l.k, te: l.te, gs: [] }); if (!c.gs.includes(l.g)) c.gs.push(l.g); }
  const used = lists.room.filter(r => ps.some(p => cell[r + "|" + p])).length;
  view.push(h("div", { class: "legend" }, h("span", {}, h("i", { style: "background:var(--accent-soft)" }), "занято"),
    h("span", {}, h("i", { style: "background:var(--lab-soft)" }), "лабораторная"),
    h("span", {}, `за день задействовано ${used} из ${lists.room.length} аудиторий`)));
  const thead = h("thead", {}, h("tr", {}, h("th", {}, ""), ps.map(p => h("th", { class: p === ns.cur ? "nowcol" : null, title: hm(times[p]) }, p))));
  const tbody = h("tbody", {}, lists.room.map(r => h("tr", {}, h("th", {}, entLink("room", r, r)), ps.map(p => {
    const c = cell[r + "|" + p];
    const cls = (c ? "busy k" + c.k : "") + (p === ns.cur ? " nowcol" : "");
    return h("td", { class: cls.trim() || null },
      h("button", { title: c ? `${p} пара · ${c.s} · ${c.te} · ${c.gs.join(", ")}` : `${r}, ${p} пара — свободно`, onclick: () => go("room", r) },
        c ? shortGroups(c.gs) : ""));
  }))));
  view.push(h("div", { class: "tablewrap" }, h("table", { class: "grid" }, thead, tbody)));
  view.push(h("p", { class: "note" }, "Нажми на клетку — откроется день этой аудитории. Наведи (или задержи палец) — увидишь предмет."));
  return view;
}

/* ---------- режим: загрузка ---------- */
function viewStats() {
  const mon = addDays(st.date, -wdi(st.date));
  const dates = Array.from({ length: 6 }, (_, i) => iso(addDays(mon, i))).filter(d => byDate.has(d));
  const view = [h("div", { class: "head" }, h("h2", {}, "Загрузка аудиторий"), h("span", { class: "meta" }, `неделя ${dm(mon)}–${dm(addDays(mon, 5))}`))];
  if (!dates.length) { view.push(emptyDay(iso(st.date))); return view; }
  const PAIRS = 6, cap = dates.length * PAIRS;
  const occ = {}, perPair = Array(PAIRS + 1).fill(0);
  for (const d of dates) {
    const seen = new Set();
    for (const l of byDate.get(d)) {
      if (!l.r || l.p > PAIRS) continue;
      const k = l.r + "|" + l.p; if (seen.has(k)) continue; seen.add(k);
      occ[l.r] = (occ[l.r] || 0) + 1; perPair[l.p]++;
    }
  }
  const rows = lists.room.map(r => ({ r, n: occ[r] || 0, pct: Math.round(100 * (occ[r] || 0) / cap) })).sort((a, b) => b.pct - a.pct || roomSort(a.r, b.r));
  const avg = Math.round(rows.reduce((s, x) => s + x.pct, 0) / rows.length);
  const idle = rows.filter(x => x.pct <= 10);
  const peak = perPair.indexOf(Math.max(...perPair.slice(1)));
  view.push(h("div", { class: "tiles" },
    h("div", { class: "tile" }, h("div", { class: "v" }, avg + "%"), h("div", { class: "l" }, "средняя загрузка")),
    h("div", { class: "tile" }, h("div", { class: "v" }, rows[0].r), h("div", { class: "l" }, `самая загруженная · ${rows[0].pct}%`)),
    h("div", { class: "tile" }, h("div", { class: "v" }, idle.length), h("div", { class: "l" }, "почти пустуют (≤10%)")),
    h("div", { class: "tile" }, h("div", { class: "v" }, peak + " пара"), h("div", { class: "l" }, `пик · в среднем ${Math.round(perPair[peak] / dates.length)} ауд. занято`))));
  const maxPP = Math.max(...perPair.slice(1), 1);
  view.push(h("h3", {}, "Сколько аудиторий занято на каждой паре (в среднем за день)"));
  view.push(h("div", { class: "bars" }, perPair.slice(1).map((n, i) => {
    const v = n / dates.length;
    return h("div", { class: "bar" }, h("span", { class: "name" }, `${i + 1} пара`),
      h("div", { class: "track" }, h("div", { class: "fill" + (i + 1 === peak ? " hi" : ""), style: `width:${100 * n / maxPP}%` })),
      h("span", { class: "pct" }, v.toFixed(1)));
  })));
  view.push(h("h3", {}, "По аудиториям"));
  view.push(h("div", { class: "bars" }, rows.map(x => h("div", { class: "bar" }, h("span", { class: "name" }, entLink("room", x.r, x.r)),
    h("div", { class: "track" }, h("div", { class: "fill" + (x.pct >= 70 ? " hi" : x.pct <= 10 ? " lo" : ""), style: `width:${x.pct}%` })),
    h("span", { class: "pct" }, x.pct + "%")))));
  view.push(h("p", { class: "note" }, `Считаются пары 1–${PAIRS} за ${dates.length} ${plural(dates.length, "учебный день", "учебных дня", "учебных дней")} недели: 100% — аудитория занята каждую пару. Вечерние пары не учитываются.`));
  return view;
}

/* ---------- режим: изменения ---------- */
function viewChanges() {
  const view = [h("div", { class: "head" }, h("h2", {}, "Изменения"), h("span", { class: "meta" }, "сравнение с прошлой проверкой, дважды в день"))];
  if (!CHANGES.length) { view.push(h("div", { class: "empty" }, "Пока изменений не было. Как только в расписании что-то поменяют, это появится здесь.")); return view; }
  const favSet = new Set(st.favs.map(f => f.v));
  let lastAt = "";
  for (const c of CHANGES.slice(0, 150)) {
    if (c.type === "week") {
      view.push(h("div", { class: "chg" }, h("span", { class: "when" }, c.at), h("span", { class: "what" }, `Выложено расписание: ${dm(fromIso(c.d))} – ${dm(fromIso(c.to))}`)));
      continue;
    }
    const b = c.before, a = c.after, d = fromIso(c.d);
    const touches = c.g.some(g => favSet.has(g)) || [b, a].some(x => x && (favSet.has(x.r) || splitT(x.t).some(t => favSet.has(t))));
    let what, det = [];
    if (b && a) {
      what = `${a.s}`;
      if (b.s !== a.s) det.push(h("span", {}, h("del", {}, b.s), " → ", h("ins", {}, a.s)));
      if (b.r !== a.r) det.push(h("span", {}, "ауд. ", h("del", {}, b.r || "—"), " → ", h("ins", {}, a.r || "—")));
      if (b.t !== a.t) det.push(h("span", {}, h("del", {}, b.t), " → ", h("ins", {}, a.t)));
      if (b.k !== a.k) det.push(h("span", {}, h("del", {}, KN[b.k] || "—"), " → ", h("ins", {}, KN[a.k] || "—")));
    } else if (a) { what = "Добавлено: " + a.s; det.push(`ауд. ${a.r || "—"} · ${a.t}`); }
    else { what = "Отменено: " + b.s; det.push(`было: ауд. ${b.r || "—"} · ${b.t}`); }
    view.push(h("div", { class: "chg" + (touches ? " mine" : "") },
      h("span", { class: "when" }, `${fmtLong(d)} · ${c.p} пара · ${c.g.join(", ")}`),
      h("span", { class: "what" }, what), h("span", { class: "det" }, joinNodes(det, " · ")),
      c.at !== lastAt ? h("span", { class: "when" }, "замечено " + c.at) : null));
    lastAt = c.at;
  }
  view.push(h("p", { class: "note" }, "Жёлтым отмечены изменения, которые касаются твоего избранного."));
  return view;
}

/* ---------- отрисовка ---------- */
function render() {
  writeHash();
  renderChrome();
  const v = { room: viewEntity, group: viewEntity, teacher: viewEntity, free: viewFree, grid: viewGrid, stats: viewStats, changes: viewChanges }[st.mode]();
  $("view").replaceChildren(...v);
  const seen = ls("tis2-seenChanges") || "";
  const fresh = CHANGES.filter(c => c.at > seen).length;
  $("chBadge").hidden = !fresh || st.mode === "changes";
  $("chBadge").textContent = fresh;
  if (st.mode === "changes" && CHANGES[0]) ls("tis2-seenChanges", CHANGES[0].at);
  $("updated").textContent = UPDATED ? `Обновлено ${UPDATED} · расписание до ${MAXD ? dm(fromIso(MAXD)) : "—"}` : "Нет данных";
  renderStale();
}

/* сторож: робот давно не обновлял данные или сегодня позже последнего дня в расписании */
function renderStale() {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(UPDATED), el = $("stale");
  let msg = "";
  if (m && Date.now() - new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]) > 2 * 864e5) msg = `Данные не обновлялись с ${m[1]}.${m[2]} — расписание могло устареть.`;
  else if (MAXD && iso(new Date()) > MAXD && wdi(new Date()) < 6) msg = "Расписания на эту неделю здесь ещё нет.";
  el.hidden = !msg;
  if (msg) el.replaceChildren(msg + " Проверь ", h("a", { href: "https://stis.su/schedule", target: "_blank", rel: "noopener" }, "stis.su/schedule"), ".");
}

/* ---------- события ---------- */
$("tabs").addEventListener("click", e => { const b = e.target.closest("button[data-mode]"); if (b) go(b.dataset.mode); });
$("q").addEventListener("change", () => {
  const raw = $("q").value.trim(), list = lists[st.mode] || [];
  const v = list.find(x => x.toLowerCase() === raw.toLowerCase()) || (raw.toLowerCase() === "спортзал" ? "СЗ" : null)
    || list.find(x => x.toLowerCase().includes(raw.toLowerCase()));
  if (v) go(st.mode, v); else toast("Не нашёл «" + raw + "»");
});
$("q").addEventListener("focus", () => $("q").select());
$("fav").addEventListener("click", () => {
  const v = st.sel[st.mode]; if (!v) return;
  const i = st.favs.findIndex(f => f.m === st.mode && f.v === v);
  if (i >= 0) st.favs.splice(i, 1); else st.favs.push({ m: st.mode, v });
  ls("tis2-favs", st.favs); render();
  toast(i >= 0 ? "Убрано из избранного" : "Добавлено в избранное");
});
$("wPrev").onclick = () => { st.date = addDays(st.date, -7); render(); };
$("wNext").onclick = () => { st.date = addDays(st.date, 7); render(); };
$("todayBtn").onclick = () => { st.date = today0(); st.pair = null; render(); };
$("calCopy").onclick = async () => {
  const url = $("calCopy").dataset.url;
  try { await navigator.clipboard.writeText(url); toast("Ссылка скопирована"); }
  catch (e) { prompt("Скопируй ссылку:", url); }
};
window.addEventListener("hashchange", () => { readHash(); render(); });
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft") { st.date = addDays(st.date, -1); render(); }
  if (e.key === "ArrowRight") { st.date = addDays(st.date, 1); render(); }
});

/* подсказка установки на iPhone */
(() => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  if (ios && !standalone && !ls("tis2-installHidden")) $("install").hidden = false;
  $("installClose").onclick = () => { $("install").hidden = true; ls("tis2-installHidden", 1); };
})();

/* ---------- загрузка ---------- */
let lastLoad = 0;
async function load() {
  lastLoad = Date.now();
  try {
    const [d, c] = await Promise.all([
      fetch("data.json", { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("changes.json", { cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    ingest(d); CHANGES = Array.isArray(c) ? c : [];
  } catch (e) {
    if (!L.length) toast("Нет связи — показываю сохранённое");
  }
  render();
}
readHash();
render();
load();
setInterval(() => { if (!document.hidden) render(); }, 60000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (Date.now() - lastLoad > 5 * 60000) load(); else render();
});
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
